/**
 * RAG Context Assembly
 * Gathers relevant context from the database based on query type
 */

const db = require('../../config/database');
const { VIP_CLV_THRESHOLD } = require('./router');

/**
 * Get conversation history from database
 */
async function getConversationHistory(conversationId, maxMessages = 20) {
  const result = await db.query(
    `SELECT role, content, tool_name, tool_input, tool_result, tool_use_id, created_at
     FROM ai_messages
     WHERE conversation_id = $1
     ORDER BY sequence_num ASC
     LIMIT $2`,
    [conversationId, maxMessages]
  );

  return result.rows;
}

/**
 * Assemble context based on query type
 * Returns relevant data to include in the prompt
 */
async function assembleContext(query, queryType, locationId = null) {
  const context = {
    customer: null,
    products: [],
    quotation: null,
    sources: [],
    contextText: '',
    tokenCount: 0
  };

  try {
    switch (queryType) {
      case 'customer_lookup':
        await addCustomerContext(context, query);
        break;

      case 'product_search':
        await addProductContext(context, query);
        break;

      case 'quote_status':
        await addQuotationContext(context, query);
        break;

      case 'email_draft':
        // For emails, try to identify customer or quote
        await addCustomerContext(context, query);
        await addQuotationContext(context, query);
        break;

      case 'cross_sell':
        await addCustomerContext(context, query);
        await addProductContext(context, query);
        break;

      default:
        // General query - try to extract any relevant context
        await addCustomerContext(context, query);
        await addProductContext(context, query);
    }

    // Build context text for the prompt
    context.contextText = buildContextText(context);
    context.tokenCount = estimateTokens(context.contextText);

  } catch (error) {
    console.error('[Context] Error assembling context:', error);
  }

  return context;
}

/**
 * Add customer context if query mentions a customer
 */
async function addCustomerContext(context, query) {
  // Try to extract customer identifiers from query
  const phoneMatch = query.match(/\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\b/);
  const emailMatch = query.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
  const idMatch = query.match(/\bcustomer\s*#?\s*(\d+)\b/i);

  let customers = [];

  if (idMatch) {
    const result = await db.query(
      `SELECT id, name, email, phone, clv_score, churn_risk, lifetime_value_cents,
              total_quotes, total_won_quotes, credit_status, pricing_tier
       FROM customers WHERE id = $1`,
      [parseInt(idMatch[1])]
    );
    customers = result.rows;
  } else if (emailMatch) {
    const result = await db.query(
      `SELECT id, name, email, phone, clv_score, churn_risk, lifetime_value_cents,
              total_quotes, total_won_quotes, credit_status, pricing_tier
       FROM customers WHERE LOWER(email) = LOWER($1)`,
      [emailMatch[1]]
    );
    customers = result.rows;
  } else if (phoneMatch) {
    const normalizedPhone = phoneMatch[1].replace(/\D/g, '');
    const result = await db.query(
      `SELECT id, name, email, phone, clv_score, churn_risk, lifetime_value_cents,
              total_quotes, total_won_quotes, credit_status, pricing_tier
       FROM customers
       WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone, '-', ''), '(', ''), ')', ''), ' ', '') LIKE $1
       LIMIT 3`,
      [`%${normalizedPhone}%`]
    );
    customers = result.rows;
  } else {
    // Try name matching
    const namePatterns = [
      /\b(?:customer|client)\s+(?:named?\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'s?\s+(?:account|order|quote)/i,
      /\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i
    ];

    for (const pattern of namePatterns) {
      const match = query.match(pattern);
      if (match) {
        const result = await db.query(
          `SELECT id, name, email, phone, clv_score, churn_risk, lifetime_value_cents,
                  total_quotes, total_won_quotes, credit_status, pricing_tier
           FROM customers
           WHERE LOWER(name) LIKE LOWER($1)
           LIMIT 3`,
          [`%${match[1]}%`]
        );
        if (result.rows.length > 0) {
          customers = result.rows;
          break;
        }
      }
    }
  }

  if (customers.length > 0) {
    context.customer = customers[0];
    context.sources.push({
      type: 'customer',
      id: customers[0].id,
      name: customers[0].name
    });
  }
}

/**
 * Add product context if query mentions products
 */
async function addProductContext(context, query) {
  // Extract potential product identifiers
  const skuMatch = query.match(/\b([A-Z]{2,4}[-\s]?\d{3,}[-\s]?[A-Z0-9]*)\b/i);
  const modelMatch = query.match(/\bmodel\s*#?\s*([A-Z0-9-]+)\b/i);

  let products = [];

  if (skuMatch) {
    const result = await db.query(
      `SELECT id, name, sku, model, manufacturer, category, msrp_cents, promo_price_cents, qty_on_hand, in_stock
       FROM products
       WHERE sku ILIKE $1 OR model ILIKE $1
       LIMIT 5`,
      [`%${skuMatch[1]}%`]
    );
    products = result.rows;
  }

  if (products.length === 0 && modelMatch) {
    const result = await db.query(
      `SELECT id, name, sku, model, manufacturer, category, msrp_cents, promo_price_cents, qty_on_hand, in_stock
       FROM products
       WHERE model ILIKE $1
       LIMIT 5`,
      [`%${modelMatch[1]}%`]
    );
    products = result.rows;
  }

  // Try category/brand extraction
  if (products.length === 0) {
    const categories = ['refrigerator', 'washer', 'dryer', 'dishwasher', 'range', 'oven', 'microwave', 'tv', 'freezer'];
    const brands = ['samsung', 'lg', 'whirlpool', 'ge', 'frigidaire', 'bosch', 'kitchenaid', 'maytag'];

    const lowerQuery = query.toLowerCase();
    const foundCategory = categories.find(c => lowerQuery.includes(c));
    const foundBrand = brands.find(b => lowerQuery.includes(b));

    if (foundCategory || foundBrand) {
      let sql = `SELECT id, name, sku, model, manufacturer, category, msrp_cents, promo_price_cents, qty_on_hand, in_stock
                 FROM products WHERE is_active = true`;
      const params = [];
      let paramIndex = 1;

      if (foundCategory) {
        sql += ` AND LOWER(category) LIKE $${paramIndex++}`;
        params.push(`%${foundCategory}%`);
      }
      if (foundBrand) {
        sql += ` AND LOWER(manufacturer) LIKE $${paramIndex++}`;
        params.push(`%${foundBrand}%`);
      }

      sql += ` ORDER BY in_stock DESC, msrp_cents DESC LIMIT 5`;

      const result = await db.query(sql, params);
      products = result.rows;
    }
  }

  if (products.length > 0) {
    context.products = products;
    products.forEach(p => {
      context.sources.push({
        type: 'product',
        id: p.id,
        name: p.name,
        sku: p.sku
      });
    });
  }
}

/**
 * Add quotation context if query mentions a quote
 */
async function addQuotationContext(context, query) {
  // Extract quote number
  const quoteMatch = query.match(/\b(?:quote|quotation)\s*#?\s*([A-Z]?-?\d{4,}[-\d]*)/i);

  if (quoteMatch) {
    const result = await db.query(
      `SELECT q.id, q.quotation_number, q.quote_number, q.status, q.total_cents,
              q.customer_id, q.customer_name, q.created_at, q.expires_at, q.sent_at
       FROM quotations q
       WHERE q.quotation_number ILIKE $1 OR q.quote_number ILIKE $1
       LIMIT 1`,
      [`%${quoteMatch[1]}%`]
    );

    if (result.rows.length > 0) {
      context.quotation = result.rows[0];
      context.sources.push({
        type: 'quotation',
        id: result.rows[0].id,
        number: result.rows[0].quotation_number || result.rows[0].quote_number
      });

      // Also add customer context if not already present
      if (!context.customer && result.rows[0].customer_id) {
        const customerResult = await db.query(
          `SELECT id, name, email, phone, clv_score FROM customers WHERE id = $1`,
          [result.rows[0].customer_id]
        );
        if (customerResult.rows.length > 0) {
          context.customer = customerResult.rows[0];
        }
      }
    }
  }
}

/**
 * Build human-readable context text
 */
function buildContextText(context) {
  const parts = [];

  if (context.customer) {
    const c = context.customer;
    const isVIP = c.clv_score >= VIP_CLV_THRESHOLD;
    parts.push(`Customer found: ${c.name} (ID: ${c.id})${isVIP ? ' - VIP CUSTOMER' : ''}`);
    if (c.email) parts.push(`  Email: ${c.email}`);
    if (c.phone) parts.push(`  Phone: ${c.phone}`);
    if (c.clv_score) parts.push(`  CLV Score: ${c.clv_score}/100`);
    if (c.lifetime_value_cents) parts.push(`  Lifetime Value: $${(c.lifetime_value_cents / 100).toFixed(2)}`);
    if (c.total_quotes) parts.push(`  Total Quotes: ${c.total_quotes} (Won: ${c.total_won_quotes || 0})`);
    if (c.credit_status) parts.push(`  Credit Status: ${c.credit_status}`);
  }

  if (context.products.length > 0) {
    parts.push(`\nProducts found (${context.products.length}):`);
    context.products.forEach(p => {
      const price = p.msrp_cents ? `$${(p.msrp_cents / 100).toFixed(2)}` : 'N/A';
      const salePrice = p.promo_price_cents ? ` (Sale: $${(p.promo_price_cents / 100).toFixed(2)})` : '';
      const stock = p.in_stock ? 'In Stock' : (p.qty_on_hand > 0 ? `${p.qty_on_hand} available` : 'Out of Stock');
      parts.push(`  - ${p.name} (${p.sku || p.model}) - ${price}${salePrice} - ${stock}`);
    });
  }

  if (context.quotation) {
    const q = context.quotation;
    parts.push(`\nQuotation found: ${q.quotation_number || q.quote_number}`);
    parts.push(`  Status: ${q.status}`);
    parts.push(`  Customer: ${q.customer_name}`);
    if (q.total_cents) parts.push(`  Total: $${(q.total_cents / 100).toFixed(2)}`);
    if (q.created_at) parts.push(`  Created: ${new Date(q.created_at).toLocaleDateString()}`);
    if (q.expires_at) parts.push(`  Expires: ${new Date(q.expires_at).toLocaleDateString()}`);
  }

  return parts.join('\n');
}

/**
 * Rough token estimation (4 chars ≈ 1 token)
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

module.exports = {
  getConversationHistory,
  assembleContext
};
