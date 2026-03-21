'use strict';

/**
 * AI Business Assistant Service
 *
 * Surface-aware assistant with Claude tool use, session memory,
 * and live data access. Upgrades the Customer Support AI into
 * a full business intelligence assistant.
 *
 * Surfaces: pos | quotation | backoffice
 * Model: claude-haiku-4-5-20251001
 */

const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../db');
const { search } = require('./searchService');
const dashboardService = require('./dashboardService');

// ── Lazy Anthropic client (same pattern as voiceNotesService) ────

let _anthropic = null;
function getClient() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;
const MAX_TOOL_CALLS = 10;

// ═══════════════════════════════════════════════════════════════════
// TOOL REGISTRY
// ═══════════════════════════════════════════════════════════════════

const TOOLS = [
  {
    name: 'search_knowledge',
    description: 'Search across all platform data — customers, products, quotes, notes — using semantic and keyword hybrid search. Use this first for most questions about specific records.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query' },
        entities: {
          type: 'array',
          items: { type: 'string', enum: ['customers', 'products', 'quotations', 'customer_notes'] },
          description: 'Entity types to search (omit for all)',
        },
        limit: { type: 'integer', description: 'Max results to return (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_product_details',
    description: 'Get full details for a product: specs, category (department + category name + use_case_tags), current inventory by location, pricing. Use when a customer or staff asks about a specific product or category-related questions like "What do we have for a kitchen?".',
    input_schema: {
      type: 'object',
      properties: {
        sku: { type: 'string' },
        product_id: { type: 'integer' },
        include_inventory: { type: 'boolean', description: 'Include inventory by location (default true)' },
        use_case: { type: 'string', description: 'Filter by use-case tag (e.g. "kitchen", "living room", "bedroom", "laundry", "outdoor", "office"). Returns categories matching the use case instead of a single product.' },
      },
    },
  },
  {
    name: 'get_customer_history',
    description: "Get a customer's full relationship summary: purchases, open quotes, service history, lifetime value, institutional profile if applicable.",
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'integer' },
        customer_name: { type: 'string', description: 'Search by name if ID unknown — will look up ID first' },
        include_quotes: { type: 'boolean', description: 'Include recent quotes (default true)' },
        date_range_days: { type: 'integer', description: 'Days of history to include (default 365)' },
      },
    },
  },
  {
    name: 'get_sales_summary',
    description: 'Get sales and margin summary for a period. Use for business performance questions: revenue, top products, brand margins, rep performance.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'week', 'month', 'quarter', 'year', 'custom'] },
        from: { type: 'string', description: 'ISO date, required if period=custom' },
        to: { type: 'string' },
        group_by: { type: 'string', enum: ['brand', 'category', 'rep', 'location'] },
        location_id: { type: 'integer' },
      },
      required: ['period'],
    },
  },
  {
    name: 'check_inventory',
    description: 'Check current inventory levels for one or more products across all locations. Returns qty on hand, reserved, and days of stock.',
    input_schema: {
      type: 'object',
      properties: {
        skus: { type: 'array', items: { type: 'string' } },
        product_ids: { type: 'array', items: { type: 'integer' } },
        location_id: { type: 'integer' },
      },
    },
  },
];

// ═══════════════════════════════════════════════════════════════════
// SURFACE SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════════

const SYSTEM_PROMPTS = {
  pos: (ctx) => `You are a floor intelligence assistant at TeleTime, a multi-location Ontario electronics, appliance, and furniture retailer. You help sales staff during active customer transactions.

Your focus: product specs, compatibility, stock availability, price comparisons, customer history lookups, and upsell suggestions.

Keep answers SHORT and SCANNABLE — staff are mid-transaction. Lead with the most important fact. Use bullet points for comparisons. Never show cost price or margin data — only retail pricing.

Current context: ${ctx.locationName || 'Unknown location'} | ${ctx.staffName || 'Staff'}`,

  quotation: (ctx) => `You are an account intelligence assistant for TeleTime's sales and quotation team. You help staff build accurate quotes and manage institutional relationships.

Your focus: institutional account history (housing authorities, school boards, municipalities), quote analysis and margin context, supplier pricing, customer buying patterns, and follow-up workflows.

You have full access to cost and margin data. Be precise with numbers. When surfacing institutional history, always include the key contact name, last order date, and payment terms.

Current context: ${ctx.staffName || 'Staff'}${ctx.activeQuoteContext ? ' | ' + ctx.activeQuoteContext : ''}`,

  backoffice: (ctx) => `You are a business analyst assistant for TeleTime's management team. You provide operational intelligence and business insights.

Your focus: sales trends, margin analysis by brand and category, inventory health, rep performance, B2B vs B2C revenue, and identifying anomalies or opportunities in business data.

Always compare to prior period automatically when reporting metrics. Flag anything anomalous. Be precise with CAD amounts and percentages.

Current context: ${ctx.userName || 'User'} | ${ctx.userRole || 'Admin'}`,
};

// ═══════════════════════════════════════════════════════════════════
// TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════

const toolHandlers = {
  async search_knowledge(input, userContext) {
    const result = await search({
      query: input.query,
      entities: input.entities,
      limit: input.limit || 10,
      userId: userContext.userId,
      surface: userContext.surface,
    });
    return {
      resultCount: result.results.length,
      results: result.results.map(r => ({
        entity_type: r.entity_type,
        id: r.id,
        name: r.name || r.quote_number || r.content,
        score: r.score,
        ...r,
      })),
    };
  },

  async get_product_details(input) {
    // ── Use-case lookup mode ──────────────────────────────────
    if (input.use_case) {
      const { rows: ucRows } = await pool.query(`
        SELECT c.id, c.name, c.slug, c.display_name, c.use_case_tags,
               d.name AS department_name
        FROM categories c
        LEFT JOIN categories d ON c.parent_id = d.id AND d.level = 1
        WHERE c.use_case_tags @> ARRAY[$1]::text[]
          AND c.is_active = true
        ORDER BY d.name, c.name
      `, [input.use_case]);
      return {
        use_case: input.use_case,
        matching_categories: ucRows.map(r => ({
          id: r.id, name: r.name, slug: r.slug,
          department: r.department_name,
          use_case_tags: r.use_case_tags,
        })),
        count: ucRows.length,
      };
    }

    // ── Single product lookup ─────────────────────────────────
    let whereClause, params;
    if (input.sku) {
      whereClause = 'p.sku = $1';
      params = [input.sku];
    } else if (input.product_id) {
      whereClause = 'p.id = $1';
      params = [input.product_id];
    } else {
      return { error: 'Must provide sku, product_id, or use_case' };
    }

    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.sku, p.model, p.manufacturer, p.category, p.description,
              p.msrp_cents, p.cost_cents, p.promo_price_cents, p.qty_on_hand,
              p.qty_reserved, p.is_active, p.discontinued,
              cat.name AS category_name, cat.slug AS category_slug,
              cat.use_case_tags,
              dept.name AS department_name
       FROM products p
       LEFT JOIN categories cat ON p.category_id = cat.id AND cat.is_active = true
       LEFT JOIN categories dept ON cat.parent_id = dept.id AND dept.level = 1
       WHERE ${whereClause}`,
      params
    );
    if (!rows.length) return { found: false, message: 'Product not found' };

    const p = rows[0];
    const result = {
      found: true,
      product: {
        id: p.id, name: p.name, sku: p.sku, model: p.model,
        manufacturer: p.manufacturer,
        category: p.category,
        category_name: p.category_name || p.category,
        department_name: p.department_name || null,
        use_case_tags: p.use_case_tags || [],
        description: p.description,
        msrp: p.msrp_cents ? (p.msrp_cents / 100).toFixed(2) : null,
        cost: p.cost_cents ? (p.cost_cents / 100).toFixed(2) : null,
        salePrice: p.promo_price_cents ? (p.promo_price_cents / 100).toFixed(2) : null,
        qtyOnHand: p.qty_on_hand, qtyReserved: p.qty_reserved,
        isActive: p.is_active, discontinued: p.discontinued,
      },
    };

    if (input.include_inventory !== false) {
      const inv = await pool.query(
        `SELECT vi.location_id, l.name as location_name,
                vi.qty_on_hand, vi.qty_reserved, vi.qty_available,
                vi.reorder_point, vi.bin_location
         FROM variant_inventory vi
         LEFT JOIN locations l ON l.id = vi.location_id
         WHERE vi.product_id = $1`,
        [p.id]
      );
      result.inventory = inv.rows;
    }
    return result;
  },

  async get_customer_history(input) {
    let customerId = input.customer_id;

    if (!customerId && input.customer_name) {
      const lookup = await pool.query(
        'SELECT id FROM customers WHERE name ILIKE $1 LIMIT 1',
        [`%${input.customer_name}%`]
      );
      if (!lookup.rows.length) return { found: false, message: `No customer matching "${input.customer_name}"` };
      customerId = lookup.rows[0].id;
    }
    if (!customerId) return { error: 'Must provide customer_id or customer_name' };

    const { rows } = await pool.query(
      `SELECT id, name, email, phone, company, city, province,
              clv_score, churn_risk, clv_segment, lifetime_value_cents,
              total_quotes, total_won_quotes, pricing_tier,
              created_at, notes
       FROM customers WHERE id = $1`,
      [customerId]
    );
    if (!rows.length) return { found: false, message: 'Customer not found' };
    const c = rows[0];

    const result = {
      found: true,
      customer: {
        id: c.id, name: c.name, email: c.email, phone: c.phone,
        company: c.company, city: c.city, province: c.province,
        lifetimeValue: c.lifetime_value_cents ? (c.lifetime_value_cents / 100).toFixed(2) : null,
        clvScore: c.clv_score, churnRisk: c.churn_risk,
        totalQuotes: c.total_quotes, wonQuotes: c.total_won_quotes,
        pricingTier: c.pricing_tier, customerSince: c.created_at,
        notes: c.notes,
      },
    };

    if (input.include_quotes !== false) {
      const days = input.date_range_days || 365;
      const quotes = await pool.query(
        `SELECT id, coalesce(quote_number, quotation_number) as quote_number,
                status, total_cents, created_at, expires_at
         FROM quotations
         WHERE customer_id = $1 AND created_at > NOW() - $2 * INTERVAL '1 day'
         ORDER BY created_at DESC LIMIT 10`,
        [customerId, days]
      );
      result.recentQuotes = quotes.rows.map(q => ({
        id: q.id, quoteNumber: q.quote_number, status: q.status,
        total: q.total_cents ? (q.total_cents / 100).toFixed(2) : null,
        createdAt: q.created_at, expiresAt: q.expires_at,
      }));
    }

    // Check for institutional profile
    const inst = await pool.query(
      `SELECT ip.id, ip.organization_name, ip.account_type,
              ip.payment_terms, ip.primary_contact_name, ip.primary_contact_email
       FROM institutional_profiles ip
       WHERE ip.customer_id = $1 LIMIT 1`,
      [customerId]
    );
    if (inst.rows.length) {
      result.institutionalProfile = inst.rows[0];
    }

    return result;
  },

  async get_sales_summary(input, userContext) {
    const filters = {
      period: input.period,
      customFrom: input.from,
      customTo: input.to,
      locationId: input.location_id || userContext.locationId,
    };

    const summary = await dashboardService.getSalesSummary(filters);
    const result = { summary };

    if (input.group_by === 'brand') {
      result.brandMargins = await dashboardService.getBrandMargins(filters);
    } else if (input.group_by === 'rep') {
      result.repPerformance = await dashboardService.getRepPerformance(filters);
    }

    return result;
  },

  async check_inventory(input) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (input.skus && input.skus.length) {
      conditions.push(`p.sku = ANY($${idx++})`);
      params.push(input.skus);
    }
    if (input.product_ids && input.product_ids.length) {
      conditions.push(`p.id = ANY($${idx++})`);
      params.push(input.product_ids);
    }
    if (!conditions.length) return { error: 'Must provide skus or product_ids' };

    let locationFilter = '';
    if (input.location_id) {
      locationFilter = `AND vi.location_id = $${idx++}`;
      params.push(input.location_id);
    }

    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.sku, p.manufacturer,
              vi.location_id, l.name as location_name,
              vi.qty_on_hand, vi.qty_reserved, vi.qty_available,
              vi.reorder_point
       FROM products p
       LEFT JOIN variant_inventory vi ON vi.product_id = p.id ${locationFilter}
       LEFT JOIN locations l ON l.id = vi.location_id
       WHERE (${conditions.join(' OR ')})
       ORDER BY p.name, l.name`,
      params
    );

    // Calculate days of stock from last 30 days velocity
    const productIds = [...new Set(rows.map(r => r.id))];
    let velocityMap = {};
    if (productIds.length) {
      const vel = await pool.query(
        `SELECT ti.product_id, SUM(ti.quantity) as units_30d
         FROM transaction_items ti
         JOIN transactions t ON t.transaction_id = ti.transaction_id
         WHERE ti.product_id = ANY($1)
           AND t.created_at > NOW() - INTERVAL '30 days'
         GROUP BY ti.product_id`,
        [productIds]
      );
      for (const v of vel.rows) {
        velocityMap[v.product_id] = parseInt(v.units_30d) || 0;
      }
    }

    return {
      count: rows.length,
      inventory: rows.map(r => ({
        productId: r.id, name: r.name, sku: r.sku,
        manufacturer: r.manufacturer,
        locationId: r.location_id, locationName: r.location_name,
        qtyOnHand: r.qty_on_hand, qtyReserved: r.qty_reserved,
        qtyAvailable: r.qty_available, reorderPoint: r.reorder_point,
        daysOfStock: velocityMap[r.id] > 0
          ? Math.round((r.qty_on_hand || 0) / (velocityMap[r.id] / 30))
          : null,
      })),
    };
  },
};

// ═══════════════════════════════════════════════════════════════════
// TOOL CALL LOGGING
// ═══════════════════════════════════════════════════════════════════

async function logToolCall(messageId, toolName, input, output, success, latencyMs) {
  try {
    await pool.query(
      `INSERT INTO assistant_tool_calls (message_id, tool_name, input, output, success, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [messageId, toolName, JSON.stringify(input), JSON.stringify(output), success, latencyMs]
    );
  } catch (err) {
    console.error('[AIAssistant] Tool log error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

async function createSession(userId, surface, locationId, context = {}) {
  const { rows } = await pool.query(
    `INSERT INTO assistant_sessions (user_id, surface, location_id, context)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, surface, locationId || null, JSON.stringify(context)]
  );
  return rows[0];
}

async function getSession(sessionId, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM assistant_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, userId]
  );
  if (!rows.length) {
    const err = new Error('Session not found');
    err.code = 'SESSION_NOT_FOUND';
    throw err;
  }
  return rows[0];
}

async function loadHistory(sessionId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT role, content, tool_calls, tool_results, created_at
     FROM assistant_messages
     WHERE session_id = $1
     ORDER BY created_at ASC`,
    [sessionId]
  );

  // Take last N messages
  const recent = rows.slice(-limit);

  // Format for Claude API
  const messages = [];
  for (const msg of recent) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      // If this message had tool_calls, reconstruct the content blocks
      if (msg.tool_calls) {
        messages.push({ role: 'assistant', content: msg.tool_calls });
      } else {
        messages.push({ role: 'assistant', content: msg.content });
      }
    } else if (msg.role === 'tool_result' && msg.tool_results) {
      messages.push({ role: 'user', content: msg.tool_results });
    }
  }
  return messages;
}

async function getActiveSessions(userId, surface) {
  let sql = `SELECT id, surface, title, context, is_active, last_active, created_at
             FROM assistant_sessions
             WHERE user_id = $1 AND is_active = TRUE`;
  const params = [userId];

  if (surface) {
    sql += ' AND surface = $2';
    params.push(surface);
  }
  sql += ' ORDER BY last_active DESC LIMIT 10';

  const { rows } = await pool.query(sql, params);
  return rows;
}

async function endSession(sessionId, userId) {
  await pool.query(
    'UPDATE assistant_sessions SET is_active = FALSE WHERE id = $1 AND user_id = $2',
    [sessionId, userId]
  );
}

// ═══════════════════════════════════════════════════════════════════
// SEND MESSAGE (main flow with tool-use loop)
// ═══════════════════════════════════════════════════════════════════

async function sendMessage(sessionId, userMessage, userContext) {
  const startTime = Date.now();
  const { userId, locationId, role, surface } = userContext;

  // 1. Load session + history
  const session = await getSession(sessionId, userId);
  const history = await loadHistory(sessionId);

  // 2. Build system prompt with context
  const promptFn = SYSTEM_PROMPTS[surface] || SYSTEM_PROMPTS.quotation;
  const userInfo = await _getUserInfo(userId);
  const systemPrompt = promptFn({
    staffName: userInfo ? `${userInfo.first_name || ''} ${userInfo.last_name || ''}`.trim() : 'Staff',
    userName: userInfo ? `${userInfo.first_name || ''} ${userInfo.last_name || ''}`.trim() : 'User',
    userRole: role || userInfo?.role || 'staff',
    locationName: session.context?.locationName || null,
    activeQuoteContext: session.context?.activeQuote || null,
  });

  // 3. Build messages array
  let messages = [...history, { role: 'user', content: userMessage }];

  // 4. Persist user message
  const userMsgResult = await pool.query(
    `INSERT INTO assistant_messages (session_id, role, content)
     VALUES ($1, 'user', $2) RETURNING id`,
    [sessionId, userMessage]
  );
  const userMsgId = userMsgResult.rows[0].id;

  // 5. Tool-use loop
  let toolCallCount = 0;
  let response;
  let assistantMsgId;

  while (toolCallCount < MAX_TOOL_CALLS) {
    response = await getClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
      tools: TOOLS,
    });

    if (response.stop_reason === 'end_turn') break;

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      // Persist the assistant message with tool calls
      const assistantRes = await pool.query(
        `INSERT INTO assistant_messages (session_id, role, content, tool_calls)
         VALUES ($1, 'assistant', '', $2) RETURNING id`,
        [sessionId, JSON.stringify(response.content)]
      );
      assistantMsgId = assistantRes.rows[0].id;

      // Execute all tools in parallel
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (tool) => {
          const toolStart = Date.now();
          let output, success;
          try {
            const handler = toolHandlers[tool.name];
            if (!handler) throw new Error(`Unknown tool: ${tool.name}`);
            output = await handler(tool.input, userContext);
            success = true;
          } catch (err) {
            output = { error: err.message };
            success = false;
          }
          // Log tool call
          await logToolCall(assistantMsgId, tool.name, tool.input, output, success, Date.now() - toolStart);

          return {
            type: 'tool_result',
            tool_use_id: tool.id,
            content: JSON.stringify(output),
          };
        })
      );

      toolCallCount += toolUseBlocks.length;

      // Persist tool results
      await pool.query(
        `INSERT INTO assistant_messages (session_id, role, content, tool_results)
         VALUES ($1, 'tool_result', '', $2)`,
        [sessionId, JSON.stringify(toolResults)]
      );

      // Append to messages for next iteration
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    } else {
      // Unknown stop reason — break
      break;
    }
  }

  // 6. Extract final text
  const finalText = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const latencyMs = Date.now() - startTime;
  const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

  // 7. Persist final assistant message
  await pool.query(
    `INSERT INTO assistant_messages (session_id, role, content, tokens_used, latency_ms)
     VALUES ($1, 'assistant', $2, $3, $4)`,
    [sessionId, finalText, tokensUsed, latencyMs]
  );

  // 8. Update session metadata
  const titleUpdate = session.title ? '' : `, title = $3`;
  const titleParams = session.title
    ? [sessionId, userId]
    : [sessionId, userId, userMessage.slice(0, 50)];
  await pool.query(
    `UPDATE assistant_sessions SET last_active = NOW()${titleUpdate}
     WHERE id = $1 AND user_id = $2`,
    titleParams
  );

  return {
    message: finalText,
    sessionId,
    toolCallsMade: toolCallCount,
    tokensUsed,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

async function _getUserInfo(userId) {
  const { rows } = await pool.query(
    'SELECT id, first_name, last_name, email, role FROM users WHERE id = $1',
    [userId]
  );
  return rows[0] || null;
}

module.exports = {
  createSession,
  getSession,
  loadHistory,
  sendMessage,
  getActiveSessions,
  endSession,
  TOOLS,
};
