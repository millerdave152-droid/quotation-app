'use strict';

/**
 * MarketplaceAI — AI-powered marketplace optimization using the existing
 * Anthropic Claude integration. Listing titles, descriptions, category
 * suggestions, pricing recommendations, anomaly detection, and NL queries.
 *
 * Leverages: @anthropic-ai/sdk (already installed), marketplace_orders,
 * marketplace_order_items, products, channel_categories, product_channel_listings.
 */

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-haiku-4-5-20251001'; // Cost-effective for structured outputs
const MODEL_HEAVY = 'claude-sonnet-4-5-20250929'; // For complex reasoning (NL query)

class MarketplaceAI {
  constructor(pool) {
    this.pool = pool;
    this._client = null;
  }

  /** Lazy-init Anthropic client (allows service to load even without key) */
  _getClient() {
    if (!this._client) {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured. Set it in .env to use AI features.');
      }
      this._client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this._client;
  }

  /** Call Claude with structured prompt */
  async _ask(prompt, { model, maxTokens, system } = {}) {
    const client = this._getClient();
    const response = await client.messages.create({
      model: model || MODEL,
      max_tokens: maxTokens || 1024,
      system: system || 'You are a marketplace listing optimization expert for Canadian retail. Respond ONLY with valid JSON, no markdown fences.',
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
    // Strip markdown fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    try {
      return { parsed: JSON.parse(cleaned), raw: text, usage: response.usage };
    } catch (_) {
      return { parsed: null, raw: text, usage: response.usage };
    }
  }

  // -----------------------------------------------------------------------
  // Helper: load product + channel context
  // -----------------------------------------------------------------------
  async _getProductContext(productId) {
    const { rows } = await this.pool.query(
      `SELECT p.id, p.sku, p.name, p.description, p.category, p.manufacturer,
              p.model, p.price, p.cost, p.color, p.upc,
              p.bestbuy_category_code, p.bestbuy_category_id,
              p.decoded_attributes, p.master_category
       FROM products p WHERE p.id = $1`,
      [productId]
    );
    if (rows.length === 0) throw new Error('Product not found: ' + productId);
    return rows[0];
  }

  async _getChannelContext(channelId) {
    const { rows } = await this.pool.query(
      `SELECT id, channel_code, channel_name, channel_type, config
       FROM marketplace_channels WHERE id = $1`,
      [channelId]
    );
    if (rows.length === 0) throw new Error('Channel not found: ' + channelId);
    return rows[0];
  }

  // -----------------------------------------------------------------------
  // 1. Generate optimized listing title
  // -----------------------------------------------------------------------
  async generateTitle(productId, channelId) {
    const product = await this._getProductContext(productId);
    const channel = await this._getChannelContext(channelId);

    // Channel-specific constraints
    const constraints = {
      BESTBUY_CA: { maxLen: 150, format: '[Brand] [Product Type] [Model] [Key Feature] [Color/Finish]', bilingual: false },
      AMAZON_CA: { maxLen: 200, format: '[Brand] + [Product Line] + [Material/Key Feature] + [Product Type] + [Color] + [Size/Quantity]', bilingual: false },
      WALMART_CA: { maxLen: 120, format: '[Brand] [Product Name] [Key Specs]', bilingual: false },
      DEFAULT: { maxLen: 150, format: '[Brand] [Product Type] [Key Specs] [Differentiator]', bilingual: false },
    };
    const rules = constraints[channel.channel_code] || constraints.DEFAULT;

    const prompt = `Generate an optimized marketplace listing title for this product on ${channel.channel_name}.

PRODUCT DATA:
- Name: ${product.name}
- Brand/Manufacturer: ${product.manufacturer || 'Unknown'}
- Model: ${product.model || 'N/A'}
- Category: ${product.category || product.master_category || 'N/A'}
- Description: ${(product.description || '').slice(0, 500)}
- Color: ${product.color || 'N/A'}
- Attributes: ${JSON.stringify(product.decoded_attributes || {})}
- Price: $${product.price}

CHANNEL RULES for ${channel.channel_code}:
- Maximum length: ${rules.maxLen} characters
- Recommended format: ${rules.format}
- Include brand, product type, key specs, and a differentiator
- Do NOT include price
- Use proper capitalization (Title Case)

Return JSON:
{
  "title": "the optimized title",
  "characterCount": <number>,
  "score": <1-100 quality score>,
  "scoreReason": "brief explanation",
  "alternatives": ["alternative title 1", "alternative title 2"]
}`;

    const { parsed, raw, usage } = await this._ask(prompt);
    if (!parsed) return { error: 'Failed to parse AI response', raw, usage };

    return {
      productId,
      channelId,
      channelCode: channel.channel_code,
      title: parsed.title,
      characterCount: parsed.characterCount || (parsed.title || '').length,
      maxLength: rules.maxLen,
      score: parsed.score,
      scoreReason: parsed.scoreReason,
      alternatives: parsed.alternatives || [],
      tokensUsed: usage,
    };
  }

  // -----------------------------------------------------------------------
  // 2. Generate optimized description
  // -----------------------------------------------------------------------
  async generateDescription(productId, channelId) {
    const product = await this._getProductContext(productId);
    const channel = await this._getChannelContext(channelId);

    const isBestBuy = channel.channel_code === 'BESTBUY_CA';
    const isAmazon = (channel.channel_code || '').includes('AMAZON');

    let formatInstructions;
    if (isBestBuy) {
      formatInstructions = `Best Buy Canada requires:
- Short English description (max 500 chars) focusing on key selling points
- French translation (Canadian French) of the description
- Use bullet-point style for features`;
    } else if (isAmazon) {
      formatInstructions = `Amazon requires:
- 5 bullet points, each max 200 chars
- First bullet: key benefit/differentiator
- Remaining bullets: features, specs, compatibility, included items
- Rich HTML description (max 2000 chars)`;
    } else {
      formatInstructions = `Generate:
- A compelling product description (max 1000 chars)
- 3-5 key feature bullet points
- Focus on benefits, not just specs`;
    }

    const prompt = `Generate an optimized marketplace listing description for this product on ${channel.channel_name}.

PRODUCT DATA:
- Name: ${product.name}
- Brand: ${product.manufacturer || 'Unknown'}
- Model: ${product.model || 'N/A'}
- Category: ${product.category || 'N/A'}
- Full Description: ${(product.description || '').slice(0, 1000)}
- Color: ${product.color || 'N/A'}
- Attributes: ${JSON.stringify(product.decoded_attributes || {})}
- Price: $${product.price}

${formatInstructions}

Return JSON:
{
  "description": "main description text",
  ${isBestBuy ? '"frenchDescription": "French version",' : ''}
  ${isAmazon ? '"bulletPoints": ["bullet 1", "bullet 2", ...],' : '"features": ["feature 1", "feature 2", ...],'}
  "score": <1-100 quality score>,
  "scoreReason": "brief quality assessment"
}`;

    const { parsed, raw, usage } = await this._ask(prompt, { maxTokens: 2048 });
    if (!parsed) return { error: 'Failed to parse AI response', raw, usage };

    return {
      productId,
      channelId,
      channelCode: channel.channel_code,
      description: parsed.description,
      frenchDescription: parsed.frenchDescription || null,
      bulletPoints: parsed.bulletPoints || null,
      features: parsed.features || null,
      score: parsed.score,
      scoreReason: parsed.scoreReason,
      tokensUsed: usage,
    };
  }

  // -----------------------------------------------------------------------
  // 3. Suggest best category for a product on a channel
  // -----------------------------------------------------------------------
  async suggestCategory(productId, channelId) {
    const product = await this._getProductContext(productId);
    const channel = await this._getChannelContext(channelId);

    // Get channel's category tree (leaf nodes)
    const { rows: categories } = await this.pool.query(
      `SELECT category_code, category_label, full_path
       FROM channel_categories
       WHERE channel_id = $1 AND is_leaf = true
       ORDER BY category_label
       LIMIT 200`,
      [channelId]
    );

    if (categories.length === 0) {
      return {
        productId, channelId,
        error: 'No categories imported for this channel. Import categories first.',
        suggestions: [],
      };
    }

    // Build category list for AI
    const categoryList = categories.map(c =>
      `${c.category_code}: ${c.full_path || c.category_label}`
    ).join('\n');

    const prompt = `You are a product categorization expert for ${channel.channel_name}.

PRODUCT:
- Name: ${product.name}
- Brand: ${product.manufacturer || 'Unknown'}
- Category (internal): ${product.category || 'N/A'}
- Description: ${(product.description || '').slice(0, 500)}
- Attributes: ${JSON.stringify(product.decoded_attributes || {})}
- Existing BB Category Code: ${product.bestbuy_category_code || 'None'}

AVAILABLE CHANNEL CATEGORIES (code: path):
${categoryList}

Select the BEST matching category for this product. If multiple could work, rank them by confidence.

Return JSON:
{
  "suggestions": [
    { "categoryCode": "CODE", "categoryLabel": "Full Path", "confidence": <0.0-1.0>, "reason": "why this fits" },
    ...up to 3 suggestions
  ]
}`;

    const { parsed, raw, usage } = await this._ask(prompt, { maxTokens: 512 });
    if (!parsed) return { error: 'Failed to parse AI response', raw, usage };

    return {
      productId,
      channelId,
      channelCode: channel.channel_code,
      productName: product.name,
      currentCategory: product.category,
      suggestions: (parsed.suggestions || []).map(s => ({
        categoryCode: s.categoryCode,
        categoryLabel: s.categoryLabel,
        confidence: Math.round((s.confidence || 0) * 100) / 100,
        reason: s.reason,
      })),
      tokensUsed: usage,
    };
  }

  // -----------------------------------------------------------------------
  // 4. Price recommendation
  // -----------------------------------------------------------------------
  async suggestPrice(productId, channelId) {
    const product = await this._getProductContext(productId);
    const channel = await this._getChannelContext(channelId);

    // Get sales velocity for this product
    const { rows: [velocity] } = await this.pool.query(`
      SELECT
        COALESCE(SUM(oi.quantity), 0)::int AS units_sold_30d,
        COALESCE(AVG(COALESCE(oi.unit_price, oi.unit_price_cents / 100.0)), 0)::numeric(10,2) AS avg_selling_price,
        COUNT(DISTINCT o.id)::int AS order_count_30d
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      WHERE oi.product_id = $1
        AND o.channel_id = $2
        AND o.order_date >= NOW() - INTERVAL '30 days'
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
    `, [productId, channelId]);

    // Get return rate
    const { rows: [returns] } = await this.pool.query(`
      SELECT COUNT(*)::int AS return_count
      FROM marketplace_return_items ri
      JOIN marketplace_returns r ON r.id = ri.return_id
      JOIN marketplace_order_items oi ON oi.id = ri.order_item_id
      WHERE oi.product_id = $1
        AND r.created_at >= NOW() - INTERVAL '90 days'
    `, [productId]);

    // Get commission rate for this channel
    const { rows: [listing] } = await this.pool.query(`
      SELECT channel_sku, channel_price, min_price, max_price
      FROM product_channel_listings
      WHERE product_id = $1 AND channel_id = $2
      LIMIT 1
    `, [productId, channelId]);

    const cost = parseFloat(product.cost || 0);
    const currentPrice = parseFloat(product.price || 0);
    const channelPrice = listing ? parseFloat(listing.channel_price || 0) : 0;
    const mapPrice = product.map_price_cents ? product.map_price_cents / 100 : null;

    const prompt = `You are a pricing strategist for Canadian marketplace retail.

PRODUCT: ${product.name} (${product.manufacturer || 'Unknown'})
- Our cost: $${cost}
- Current retail price: $${currentPrice}
- Current channel price: $${channelPrice || 'Not listed'}
- MAP (minimum advertised price): ${mapPrice ? '$' + mapPrice : 'No MAP'}
- Price floor: ${listing?.min_price ? '$' + listing.min_price : 'None'}
- Price ceiling: ${listing?.max_price ? '$' + listing.max_price : 'None'}

SALES DATA (last 30 days on ${channel.channel_name}):
- Units sold: ${velocity.units_sold_30d}
- Avg selling price: $${velocity.avg_selling_price}
- Orders: ${velocity.order_count_30d}
- Return count (90d): ${returns?.return_count || 0}

CONSTRAINTS:
- Must maintain positive margin (above cost $${cost})
${mapPrice ? '- Must be at or above MAP $' + mapPrice : ''}
${listing?.min_price ? '- Channel price floor: $' + listing.min_price : ''}

Recommend a price. Consider: cost, MAP compliance, sales velocity, margin targets, and competitive positioning.

Return JSON:
{
  "recommendedPrice": <number>,
  "reasoning": "brief explanation of pricing strategy",
  "confidence": <0.0-1.0>,
  "marginPercent": <expected margin %>,
  "priceVsCurrent": "higher|lower|same",
  "strategy": "competitive|premium|clearance|hold"
}`;

    const { parsed, raw, usage } = await this._ask(prompt, { maxTokens: 512 });
    if (!parsed) return { error: 'Failed to parse AI response', raw, usage };

    return {
      productId,
      channelId,
      channelCode: channel.channel_code,
      productName: product.name,
      currentPrice,
      channelPrice,
      cost,
      salesData: {
        unitsSold30d: velocity.units_sold_30d,
        avgSellingPrice: parseFloat(velocity.avg_selling_price),
        orderCount30d: velocity.order_count_30d,
        returnCount90d: returns?.return_count || 0,
      },
      recommendation: {
        price: parsed.recommendedPrice,
        reasoning: parsed.reasoning,
        confidence: parsed.confidence,
        marginPercent: parsed.marginPercent,
        priceVsCurrent: parsed.priceVsCurrent,
        strategy: parsed.strategy,
      },
      tokensUsed: usage,
    };
  }

  // -----------------------------------------------------------------------
  // 5. Anomaly detection across all listings
  // -----------------------------------------------------------------------
  async detectAnomalies() {
    // 1. Sudden sales drops (compared 7d vs previous 7d)
    const { rows: salesDrops } = await this.pool.query(`
      WITH recent AS (
        SELECT oi.product_id, SUM(oi.quantity)::int AS units
        FROM marketplace_order_items oi
        JOIN marketplace_orders o ON o.id = oi.order_id
        WHERE o.order_date >= NOW() - INTERVAL '7 days'
          AND o.order_state NOT IN ('CANCELED', 'REFUSED')
        GROUP BY oi.product_id
      ),
      previous AS (
        SELECT oi.product_id, SUM(oi.quantity)::int AS units
        FROM marketplace_order_items oi
        JOIN marketplace_orders o ON o.id = oi.order_id
        WHERE o.order_date >= NOW() - INTERVAL '14 days'
          AND o.order_date < NOW() - INTERVAL '7 days'
          AND o.order_state NOT IN ('CANCELED', 'REFUSED')
        GROUP BY oi.product_id
      )
      SELECT p.id AS product_id, p.sku, p.name,
             COALESCE(r.units, 0) AS recent_units,
             COALESCE(pr.units, 0) AS previous_units,
             CASE WHEN COALESCE(pr.units, 0) > 0
               THEN ROUND((COALESCE(r.units, 0) - pr.units)::numeric / pr.units * 100, 1)
               ELSE 0
             END AS change_pct
      FROM previous pr
      JOIN products p ON p.id = pr.product_id
      LEFT JOIN recent r ON r.product_id = pr.product_id
      WHERE pr.units >= 3
        AND (COALESCE(r.units, 0)::numeric / GREATEST(pr.units, 1)) < 0.5
      ORDER BY change_pct ASC
      LIMIT 10
    `);

    // 2. Return spikes
    const { rows: returnSpikes } = await this.pool.query(`
      WITH return_rates AS (
        SELECT oi.product_id,
               COUNT(DISTINCT ri.id)::int AS return_count,
               COUNT(DISTINCT oi2.id)::int AS total_sold
        FROM marketplace_return_items ri
        JOIN marketplace_returns r ON r.id = ri.return_id
        JOIN marketplace_order_items oi ON oi.id = ri.order_item_id
        JOIN marketplace_order_items oi2 ON oi2.product_id = oi.product_id
        JOIN marketplace_orders o2 ON o2.id = oi2.order_id
        WHERE r.created_at >= NOW() - INTERVAL '30 days'
          AND o2.order_date >= NOW() - INTERVAL '30 days'
        GROUP BY oi.product_id
        HAVING COUNT(DISTINCT ri.id) >= 2
      )
      SELECT rr.product_id, p.sku, p.name,
             rr.return_count, rr.total_sold,
             ROUND(rr.return_count::numeric / GREATEST(rr.total_sold, 1) * 100, 1) AS return_rate_pct
      FROM return_rates rr
      JOIN products p ON p.id = rr.product_id
      WHERE rr.return_count::numeric / GREATEST(rr.total_sold, 1) > 0.15
      ORDER BY return_rate_pct DESC
      LIMIT 10
    `);

    // 3. Price outliers (channel price differs from retail by >30%)
    const { rows: priceOutliers } = await this.pool.query(`
      SELECT pcl.product_id, p.sku, p.name,
             p.price AS retail_price,
             pcl.channel_price,
             mc.channel_code,
             ROUND(ABS(pcl.channel_price - p.price) / GREATEST(p.price, 0.01) * 100, 1) AS diff_pct
      FROM product_channel_listings pcl
      JOIN products p ON p.id = pcl.product_id
      JOIN marketplace_channels mc ON mc.id = pcl.channel_id
      WHERE pcl.listing_status = 'ACTIVE'
        AND pcl.channel_price IS NOT NULL
        AND p.price > 0
        AND ABS(pcl.channel_price - p.price) / p.price > 0.30
      ORDER BY diff_pct DESC
      LIMIT 10
    `);

    // 4. Stock discrepancies (listed but 0 stock)
    const { rows: stockIssues } = await this.pool.query(`
      SELECT pcl.product_id, p.sku, p.name,
             COALESCE(p.quantity_in_stock, 0) AS current_stock,
             pcl.listing_status,
             mc.channel_code
      FROM product_channel_listings pcl
      JOIN products p ON p.id = pcl.product_id
      JOIN marketplace_channels mc ON mc.id = pcl.channel_id
      WHERE pcl.listing_status = 'ACTIVE'
        AND COALESCE(p.quantity_in_stock, 0) = 0
      ORDER BY p.name
      LIMIT 20
    `);

    // Build anomaly list
    const anomalies = [];

    salesDrops.forEach(r => {
      anomalies.push({
        type: 'sales_drop',
        severity: Math.abs(r.change_pct) >= 80 ? 'high' : 'medium',
        productId: r.product_id,
        sku: r.sku,
        productName: r.name,
        details: {
          recentUnits: r.recent_units,
          previousUnits: r.previous_units,
          changePct: parseFloat(r.change_pct),
        },
        message: `${r.sku}: Sales dropped ${Math.abs(r.change_pct)}% (${r.previous_units} → ${r.recent_units} units)`,
      });
    });

    returnSpikes.forEach(r => {
      anomalies.push({
        type: 'return_spike',
        severity: parseFloat(r.return_rate_pct) >= 25 ? 'high' : 'medium',
        productId: r.product_id,
        sku: r.sku,
        productName: r.name,
        details: {
          returnCount: r.return_count,
          totalSold: r.total_sold,
          returnRatePct: parseFloat(r.return_rate_pct),
        },
        message: `${r.sku}: ${r.return_rate_pct}% return rate (${r.return_count}/${r.total_sold})`,
      });
    });

    priceOutliers.forEach(r => {
      anomalies.push({
        type: 'price_outlier',
        severity: parseFloat(r.diff_pct) >= 50 ? 'high' : 'medium',
        productId: r.product_id,
        sku: r.sku,
        productName: r.name,
        channel: r.channel_code,
        details: {
          retailPrice: parseFloat(r.retail_price),
          channelPrice: parseFloat(r.channel_price),
          diffPct: parseFloat(r.diff_pct),
        },
        message: `${r.sku} on ${r.channel_code}: Channel price $${r.channel_price} differs ${r.diff_pct}% from retail $${r.retail_price}`,
      });
    });

    stockIssues.forEach(r => {
      anomalies.push({
        type: 'stock_discrepancy',
        severity: 'high',
        productId: r.product_id,
        sku: r.sku,
        productName: r.name,
        channel: r.channel_code,
        details: {
          currentStock: r.current_stock,
          listingStatus: r.listing_status,
        },
        message: `${r.sku} on ${r.channel_code}: Listed as ACTIVE but 0 stock`,
      });
    });

    // Sort by severity (high first)
    const severityOrder = { high: 0, medium: 1, low: 2 };
    anomalies.sort((a, b) => (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2));

    return {
      generatedAt: new Date().toISOString(),
      totalAnomalies: anomalies.length,
      bySeverity: {
        high: anomalies.filter(a => a.severity === 'high').length,
        medium: anomalies.filter(a => a.severity === 'medium').length,
        low: anomalies.filter(a => a.severity === 'low').length,
      },
      byType: {
        salesDrop: salesDrops.length,
        returnSpike: returnSpikes.length,
        priceOutlier: priceOutliers.length,
        stockDiscrepancy: stockIssues.length,
      },
      anomalies,
    };
  }

  // -----------------------------------------------------------------------
  // 6. Natural language query
  // -----------------------------------------------------------------------
  async query(question) {
    // First: gather schema context and recent data summary for the AI
    const { rows: [summary] } = await this.pool.query(`
      SELECT
        (SELECT COUNT(*) FROM marketplace_orders WHERE order_state NOT IN ('CANCELED','REFUSED'))::int AS total_orders,
        (SELECT COUNT(*) FROM product_channel_listings WHERE listing_status = 'ACTIVE')::int AS active_listings,
        (SELECT COUNT(*) FROM marketplace_channels WHERE status = 'ACTIVE')::int AS active_channels,
        (SELECT COUNT(*) FROM marketplace_returns)::int AS total_returns,
        (SELECT COALESCE(SUM(total_price_cents / 100.0), 0)::numeric(14,2)
         FROM marketplace_orders WHERE order_state NOT IN ('CANCELED','REFUSED')) AS total_gmv
    `);

    const { rows: channels } = await this.pool.query(
      `SELECT id, channel_code, channel_name FROM marketplace_channels WHERE status = 'ACTIVE' ORDER BY id`
    );

    const prompt = `You are a marketplace data analyst for TeleTime Solutions (Canadian electronics retailer).

DATABASE CONTEXT:
- Total orders: ${summary.total_orders}
- Active listings: ${summary.active_listings}
- Active channels: ${summary.active_channels} (${channels.map(c => c.channel_code + ' [id=' + c.id + ']').join(', ')})
- Total returns: ${summary.total_returns}
- Total GMV: $${summary.total_gmv}

AVAILABLE TABLES:
- marketplace_orders (id, channel_id, order_date, order_state, total_price_cents BIGINT, commission_fee_cents BIGINT, shipping_price_cents BIGINT, customer_name, shipping_address JSONB) — use total_price_cents/100.0 for dollar amounts
- marketplace_order_items (id, order_id, product_id, product_sku, product_title, quantity, unit_price, line_total, commission_amount, taxes JSONB)
- product_channel_listings (product_id, channel_id, channel_sku, channel_price, listing_status, allocation_percent)
- marketplace_channels (id, channel_code, channel_name, status)
- marketplace_returns (id, order_id, total_refund_cents, return_reason, status, created_at)
- marketplace_shipments (id, order_id, tracking_number, carrier_code, shipment_status, shipment_date)
- products (id, sku, name, category, manufacturer, price, cost, quantity_in_stock)

USER QUESTION: "${question}"

First, determine what SQL query would answer this question. Then write the query. Use COALESCE for dual columns (e.g., COALESCE(line_total, total_price_cents / 100.0)). Use order_state NOT IN ('CANCELED','REFUSED') for valid orders. Dates use order_date column.

Return JSON:
{
  "answer": "natural language answer to the question",
  "sql": "the SQL query you would run",
  "visualization_hint": "table|bar_chart|line_chart|number|pie_chart",
  "confidence": <0.0-1.0>
}`;

    const { parsed, raw, usage } = await this._ask(prompt, {
      model: MODEL_HEAVY,
      maxTokens: 1024,
      system: 'You are a marketplace analytics expert. Generate SQL queries and answer business questions. Respond ONLY with valid JSON, no markdown fences.',
    });

    if (!parsed) return { error: 'Failed to parse AI response', raw, usage };

    // Execute the SQL if it looks safe (read-only)
    let data = null;
    let queryError = null;
    const sql = (parsed.sql || '').trim();

    if (sql && /^SELECT\b/i.test(sql) && !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i.test(sql)) {
      try {
        const result = await this.pool.query(sql);
        data = result.rows.slice(0, 50); // Cap at 50 rows
      } catch (err) {
        queryError = err.message;
      }
    }

    // If the AI's SQL failed, still return the answer and SQL for debugging
    return {
      question,
      answer: parsed.answer,
      sql: parsed.sql,
      data,
      queryError,
      visualizationHint: parsed.visualization_hint,
      confidence: parsed.confidence,
      tokensUsed: usage,
    };
  }
}

// Export singleton
const pool = require('../db');
module.exports = new MarketplaceAI(pool);
