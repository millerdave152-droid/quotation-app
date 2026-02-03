/**
 * AI Assistant Tools
 * Function definitions and execution for Claude tool use
 *
 * Available tools:
 * - lookup_customer: Search customers by name, phone, email, or account number
 * - search_products: Search products with filters
 * - get_quotation: Get quotation details by ID or number
 * - get_customer_quotes: Get all quotes for a customer
 * - get_customer_history: Get customer purchase history and stats
 * - draft_email: Draft a customer email
 */

const db = require('../../config/database');
const { VIP_CLV_THRESHOLD } = require('./router');

/**
 * Tool definitions for Anthropic API
 */
const TOOLS = [
  {
    name: 'lookup_customer',
    description: 'Search for a customer by name, phone number, email, or customer ID. Returns customer details including contact info, CLV score, and account status.',
    input_schema: {
      type: 'object',
      properties: {
        search_term: {
          type: 'string',
          description: 'The search term - can be name, phone, email, or customer ID'
        },
        search_type: {
          type: 'string',
          enum: ['auto', 'name', 'phone', 'email', 'id'],
          description: 'Type of search. Use "auto" to automatically detect the search type.'
        }
      },
      required: ['search_term']
    }
  },
  {
    name: 'search_products',
    description: 'Search for products by name, SKU, model number, category, or manufacturer. Can filter by availability and price range.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query - product name, SKU, model number, or description keywords'
        },
        category: {
          type: 'string',
          description: 'Filter by category (e.g., "Refrigerators", "Washers", "TVs")'
        },
        manufacturer: {
          type: 'string',
          description: 'Filter by manufacturer/brand (e.g., "Samsung", "LG", "Whirlpool")'
        },
        min_price: {
          type: 'number',
          description: 'Minimum price in dollars'
        },
        max_price: {
          type: 'number',
          description: 'Maximum price in dollars'
        },
        in_stock_only: {
          type: 'boolean',
          description: 'Only show products currently in stock'
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results to return (default: 5, max: 10)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_quotation',
    description: 'Get details of a specific quotation by ID or quote number. Returns items, pricing, status, and customer info.',
    input_schema: {
      type: 'object',
      properties: {
        quote_id: {
          type: 'integer',
          description: 'The quotation ID'
        },
        quote_number: {
          type: 'string',
          description: 'The quotation number (e.g., "Q-2024-001234")'
        }
      }
    }
  },
  {
    name: 'get_customer_quotes',
    description: 'Get all quotations for a specific customer. Can filter by status.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: {
          type: 'integer',
          description: 'The customer ID'
        },
        status: {
          type: 'string',
          enum: ['all', 'draft', 'sent', 'viewed', 'won', 'lost', 'expired'],
          description: 'Filter by quote status (default: all)'
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of quotes to return (default: 10)'
        }
      },
      required: ['customer_id']
    }
  },
  {
    name: 'get_customer_history',
    description: 'Get customer purchase history, preferences, and statistics. Useful for cross-sell recommendations.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: {
          type: 'integer',
          description: 'The customer ID'
        }
      },
      required: ['customer_id']
    }
  },
  {
    name: 'get_product_details',
    description: 'Get detailed information about a specific product including specs, pricing, inventory, and related products.',
    input_schema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'integer',
          description: 'The product ID'
        },
        sku: {
          type: 'string',
          description: 'The product SKU'
        }
      }
    }
  },
  {
    name: 'get_cross_sell_suggestions',
    description: 'Get product recommendations based on a customer\'s cart or purchase history.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: {
          type: 'integer',
          description: 'The customer ID for personalized suggestions'
        },
        product_ids: {
          type: 'array',
          items: { type: 'integer' },
          description: 'Product IDs in the current cart/quote'
        },
        category: {
          type: 'string',
          description: 'Suggest accessories/complements for this category'
        }
      }
    }
  }
];

/**
 * Execute tools and return results
 */
async function executeTools(toolUseBlocks, userId, locationId) {
  const results = [];

  for (const toolUse of toolUseBlocks) {
    try {
      const result = await executeTool(toolUse.name, toolUse.input, userId, locationId);
      results.push({
        toolUseId: toolUse.id,
        toolName: toolUse.name,
        result: result
      });
    } catch (error) {
      console.error(`[Tools] Error executing ${toolUse.name}:`, error);
      results.push({
        toolUseId: toolUse.id,
        toolName: toolUse.name,
        result: { error: error.message }
      });
    }
  }

  return results;
}

/**
 * Execute a single tool
 */
async function executeTool(toolName, input, userId, locationId) {
  switch (toolName) {
    case 'lookup_customer':
      return await lookupCustomer(input);
    case 'search_products':
      return await searchProducts(input);
    case 'get_quotation':
      return await getQuotation(input);
    case 'get_customer_quotes':
      return await getCustomerQuotes(input);
    case 'get_customer_history':
      return await getCustomerHistory(input);
    case 'get_product_details':
      return await getProductDetails(input);
    case 'get_cross_sell_suggestions':
      return await getCrossSellSuggestions(input);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Tool: lookup_customer
 */
async function lookupCustomer({ search_term, search_type = 'auto' }) {
  let query = `
    SELECT
      id, name, email, phone, company, address, city, province, postal_code,
      clv_score, churn_risk, clv_segment,
      lifetime_value_cents, total_quotes, total_won_quotes,
      credit_limit_cents, current_balance, credit_status,
      tags, notes, created_at, pricing_tier
    FROM customers
    WHERE 1=1
  `;
  const params = [];

  // Determine search type if auto
  if (search_type === 'auto') {
    if (/^\d+$/.test(search_term)) {
      search_type = 'id';
    } else if (/@/.test(search_term)) {
      search_type = 'email';
    } else if (/^[\d\-\(\)\s\+]+$/.test(search_term) && search_term.replace(/\D/g, '').length >= 7) {
      search_type = 'phone';
    } else {
      search_type = 'name';
    }
  }

  // Build query based on search type
  switch (search_type) {
    case 'id':
      query += ' AND id = $1';
      params.push(parseInt(search_term));
      break;
    case 'email':
      query += ' AND LOWER(email) = LOWER($1)';
      params.push(search_term);
      break;
    case 'phone':
      // Normalize phone number for comparison
      const normalizedPhone = search_term.replace(/\D/g, '');
      query += ` AND REPLACE(REPLACE(REPLACE(REPLACE(phone, '-', ''), '(', ''), ')', ''), ' ', '') LIKE $1`;
      params.push(`%${normalizedPhone}%`);
      break;
    case 'name':
    default:
      query += ' AND LOWER(name) LIKE LOWER($1)';
      params.push(`%${search_term}%`);
      break;
  }

  query += ' LIMIT 5';

  const result = await db.query(query, params);

  if (result.rows.length === 0) {
    return { found: false, message: `No customer found matching "${search_term}"` };
  }

  // Format results
  const customers = result.rows.map(c => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    company: c.company,
    address: c.address ? `${c.address}, ${c.city}, ${c.province} ${c.postal_code}` : null,
    isVIP: c.clv_score >= VIP_CLV_THRESHOLD,
    clvScore: c.clv_score,
    clvSegment: c.clv_segment,
    churnRisk: c.churn_risk,
    lifetimeValue: c.lifetime_value_cents ? (c.lifetime_value_cents / 100).toFixed(2) : null,
    totalQuotes: c.total_quotes,
    wonQuotes: c.total_won_quotes,
    creditLimit: c.credit_limit_cents ? (c.credit_limit_cents / 100).toFixed(2) : null,
    currentBalance: c.current_balance ? parseFloat(c.current_balance).toFixed(2) : null,
    creditStatus: c.credit_status,
    pricingTier: c.pricing_tier,
    tags: c.tags,
    notes: c.notes,
    customerSince: c.created_at
  }));

  return {
    found: true,
    count: customers.length,
    customers: customers
  };
}

/**
 * Tool: search_products
 */
async function searchProducts({ query, category, manufacturer, min_price, max_price, in_stock_only, limit = 5 }) {
  let sql = `
    SELECT
      id, name, sku, model, manufacturer, category,
      msrp_cents, cost_cents, promo_price_cents,
      qty_on_hand, in_stock, availability,
      description, discontinued, is_active
    FROM products
    WHERE is_active = true
  `;
  const params = [];
  let paramIndex = 1;

  // Search by name, SKU, or model
  if (query) {
    sql += ` AND (
      LOWER(name) LIKE LOWER($${paramIndex})
      OR LOWER(sku) LIKE LOWER($${paramIndex})
      OR LOWER(model) LIKE LOWER($${paramIndex})
      OR LOWER(description) LIKE LOWER($${paramIndex})
    )`;
    params.push(`%${query}%`);
    paramIndex++;
  }

  if (category) {
    sql += ` AND LOWER(category) LIKE LOWER($${paramIndex})`;
    params.push(`%${category}%`);
    paramIndex++;
  }

  if (manufacturer) {
    sql += ` AND LOWER(manufacturer) LIKE LOWER($${paramIndex})`;
    params.push(`%${manufacturer}%`);
    paramIndex++;
  }

  if (min_price) {
    sql += ` AND COALESCE(msrp_cents, 0) >= $${paramIndex}`;
    params.push(min_price * 100);
    paramIndex++;
  }

  if (max_price) {
    sql += ` AND COALESCE(msrp_cents, 0) <= $${paramIndex}`;
    params.push(max_price * 100);
    paramIndex++;
  }

  if (in_stock_only) {
    sql += ` AND (in_stock = true OR COALESCE(qty_on_hand, 0) > 0)`;
  }

  sql += ` ORDER BY
    CASE WHEN LOWER(name) LIKE LOWER($1) THEN 0 ELSE 1 END,
    CASE WHEN in_stock THEN 0 ELSE 1 END,
    name
    LIMIT $${paramIndex}`;
  params.push(Math.min(limit, 10));

  const result = await db.query(sql, params);

  if (result.rows.length === 0) {
    return { found: false, message: `No products found matching "${query}"` };
  }

  const products = result.rows.map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    model: p.model,
    manufacturer: p.manufacturer,
    category: p.category,
    msrp: p.msrp_cents ? (p.msrp_cents / 100).toFixed(2) : null,
    cost: p.cost_cents ? (p.cost_cents / 100).toFixed(2) : null,
    salePrice: p.promo_price_cents ? (p.promo_price_cents / 100).toFixed(2) : null,
    onSale: p.promo_price_cents && p.promo_price_cents < p.msrp_cents,
    inStock: p.in_stock || (p.qty_on_hand && p.qty_on_hand > 0),
    qtyOnHand: p.qty_on_hand,
    availability: p.availability,
    discontinued: p.discontinued,
    description: p.description ? p.description.substring(0, 200) : null
  }));

  return {
    found: true,
    count: products.length,
    products: products
  };
}

/**
 * Tool: get_quotation
 */
async function getQuotation({ quote_id, quote_number }) {
  let query = `
    SELECT
      q.*,
      c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
      c.clv_score as customer_clv_score
    FROM quotations q
    LEFT JOIN customers c ON c.id = q.customer_id
    WHERE 1=1
  `;
  const params = [];

  if (quote_id) {
    query += ' AND q.id = $1';
    params.push(quote_id);
  } else if (quote_number) {
    query += ' AND (q.quotation_number = $1 OR q.quote_number = $1)';
    params.push(quote_number);
  } else {
    return { error: 'Must provide either quote_id or quote_number' };
  }

  const result = await db.query(query, params);

  if (result.rows.length === 0) {
    return { found: false, message: 'Quotation not found' };
  }

  const q = result.rows[0];

  // Get line items
  const itemsResult = await db.query(`
    SELECT
      qi.*, p.name as product_name, p.sku, p.model
    FROM quotation_items qi
    LEFT JOIN products p ON p.id = qi.product_id
    WHERE qi.quotation_id = $1
    ORDER BY qi.id
  `, [q.id]);

  const isExpiringSoon = q.expires_at && new Date(q.expires_at) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return {
    found: true,
    quote: {
      id: q.id,
      quoteNumber: q.quotation_number || q.quote_number,
      status: q.status,
      customer: {
        id: q.customer_id,
        name: q.customer_name,
        email: q.customer_email,
        phone: q.customer_phone,
        isVIP: q.customer_clv_score >= VIP_CLV_THRESHOLD
      },
      subtotal: q.subtotal_cents ? (q.subtotal_cents / 100).toFixed(2) : null,
      discount: q.discount_cents ? (q.discount_cents / 100).toFixed(2) : null,
      tax: q.tax_cents ? (q.tax_cents / 100).toFixed(2) : null,
      total: q.total_cents ? (q.total_cents / 100).toFixed(2) : (q.total_amount ? parseFloat(q.total_amount).toFixed(2) : null),
      margin: q.margin_percent ? parseFloat(q.margin_percent).toFixed(1) + '%' : null,
      createdAt: q.created_at,
      expiresAt: q.expires_at || q.quote_expiry_date,
      isExpiringSoon: isExpiringSoon,
      sentAt: q.sent_at,
      viewedAt: q.viewed_at,
      salesRep: q.sales_rep_name,
      notes: q.notes,
      itemCount: itemsResult.rows.length,
      items: itemsResult.rows.map(i => ({
        productId: i.product_id,
        productName: i.product_name,
        sku: i.sku,
        model: i.model,
        quantity: i.quantity,
        unitPrice: i.price ? parseFloat(i.price).toFixed(2) : null,
        total: i.price && i.quantity ? (parseFloat(i.price) * i.quantity).toFixed(2) : null
      }))
    }
  };
}

/**
 * Tool: get_customer_quotes
 */
async function getCustomerQuotes({ customer_id, status = 'all', limit = 10 }) {
  let query = `
    SELECT
      id, quotation_number, quote_number, status,
      total_cents, total_amount, created_at, expires_at, quote_expiry_date,
      sent_at, viewed_at, won_at, lost_at
    FROM quotations
    WHERE customer_id = $1
  `;
  const params = [customer_id];

  if (status !== 'all') {
    query += ' AND status = $2';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
  params.push(limit);

  const result = await db.query(query, params);

  return {
    customerId: customer_id,
    count: result.rows.length,
    quotes: result.rows.map(q => ({
      id: q.id,
      quoteNumber: q.quotation_number || q.quote_number,
      status: q.status,
      total: q.total_cents ? (q.total_cents / 100).toFixed(2) : (q.total_amount ? parseFloat(q.total_amount).toFixed(2) : null),
      createdAt: q.created_at,
      expiresAt: q.expires_at || q.quote_expiry_date,
      sentAt: q.sent_at,
      viewedAt: q.viewed_at,
      wonAt: q.won_at,
      lostAt: q.lost_at
    }))
  };
}

/**
 * Tool: get_customer_history
 */
async function getCustomerHistory({ customer_id }) {
  // Get customer details
  const customerResult = await db.query(`
    SELECT
      id, name, email, phone, company,
      clv_score, churn_risk, clv_segment, lifetime_value_cents,
      total_quotes, total_won_quotes, total_lost_quotes,
      average_quote_value_cents, win_rate,
      preferred_categories, preferred_brands,
      first_quote_date, last_quote_date, pricing_tier
    FROM customers
    WHERE id = $1
  `, [customer_id]);

  if (customerResult.rows.length === 0) {
    return { found: false, message: 'Customer not found' };
  }

  const c = customerResult.rows[0];

  // Get recent won quotes with items for purchase history
  const purchaseResult = await db.query(`
    SELECT
      q.id, q.quotation_number, q.quote_number, q.total_cents, q.won_at,
      json_agg(json_build_object(
        'product_name', p.name,
        'category', p.category,
        'manufacturer', p.manufacturer,
        'quantity', qi.quantity
      )) as items
    FROM quotations q
    JOIN quotation_items qi ON qi.quotation_id = q.id
    JOIN products p ON p.id = qi.product_id
    WHERE q.customer_id = $1 AND q.status = 'won'
    GROUP BY q.id
    ORDER BY q.won_at DESC
    LIMIT 10
  `, [customer_id]);

  // Aggregate purchased categories and brands
  const categoriesSet = new Set();
  const brandsSet = new Set();

  purchaseResult.rows.forEach(order => {
    order.items.forEach(item => {
      if (item.category) categoriesSet.add(item.category);
      if (item.manufacturer) brandsSet.add(item.manufacturer);
    });
  });

  return {
    found: true,
    customer: {
      id: c.id,
      name: c.name,
      email: c.email,
      isVIP: c.clv_score >= VIP_CLV_THRESHOLD,
      clvScore: c.clv_score,
      clvSegment: c.clv_segment,
      churnRisk: c.churn_risk,
      lifetimeValue: c.lifetime_value_cents ? (c.lifetime_value_cents / 100).toFixed(2) : null,
      totalQuotes: c.total_quotes,
      wonQuotes: c.total_won_quotes,
      lostQuotes: c.total_lost_quotes,
      winRate: c.win_rate ? parseFloat(c.win_rate).toFixed(1) + '%' : null,
      averageOrderValue: c.average_quote_value_cents ? (c.average_quote_value_cents / 100).toFixed(2) : null,
      pricingTier: c.pricing_tier,
      firstPurchase: c.first_quote_date,
      lastPurchase: c.last_quote_date,
      preferredCategories: c.preferred_categories || Array.from(categoriesSet),
      preferredBrands: c.preferred_brands || Array.from(brandsSet)
    },
    recentPurchases: purchaseResult.rows.map(o => ({
      quoteNumber: o.quotation_number || o.quote_number,
      total: o.total_cents ? (o.total_cents / 100).toFixed(2) : null,
      date: o.won_at,
      items: o.items
    }))
  };
}

/**
 * Tool: get_product_details
 */
async function getProductDetails({ product_id, sku }) {
  let query = `
    SELECT *
    FROM products
    WHERE 1=1
  `;
  const params = [];

  if (product_id) {
    query += ' AND id = $1';
    params.push(product_id);
  } else if (sku) {
    query += ' AND sku = $1';
    params.push(sku);
  } else {
    return { error: 'Must provide either product_id or sku' };
  }

  const result = await db.query(query, params);

  if (result.rows.length === 0) {
    return { found: false, message: 'Product not found' };
  }

  const p = result.rows[0];

  return {
    found: true,
    product: {
      id: p.id,
      name: p.name,
      sku: p.sku,
      model: p.model,
      manufacturer: p.manufacturer,
      category: p.category,
      description: p.description,
      msrp: p.msrp_cents ? (p.msrp_cents / 100).toFixed(2) : null,
      cost: p.cost_cents ? (p.cost_cents / 100).toFixed(2) : null,
      salePrice: p.promo_price_cents ? (p.promo_price_cents / 100).toFixed(2) : null,
      promoName: p.promo_name,
      promoStart: p.promo_start_date,
      promoEnd: p.promo_end_date,
      margin: p.margin ? parseFloat(p.margin).toFixed(1) + '%' : null,
      inStock: p.in_stock || (p.qty_on_hand && p.qty_on_hand > 0),
      qtyOnHand: p.qty_on_hand,
      qtyReserved: p.qty_reserved,
      availability: p.availability,
      leadTimeDays: p.lead_time_days,
      discontinued: p.discontinued,
      isActive: p.is_active,
      color: p.color,
      specs: p.decoded_attributes
    }
  };
}

/**
 * Tool: get_cross_sell_suggestions
 */
async function getCrossSellSuggestions({ customer_id, product_ids, category }) {
  const suggestions = [];

  // Get categories of products in cart
  let cartCategories = [];
  if (product_ids && product_ids.length > 0) {
    const cartResult = await db.query(`
      SELECT DISTINCT category, manufacturer
      FROM products
      WHERE id = ANY($1)
    `, [product_ids]);
    cartCategories = cartResult.rows;
  }

  // Suggest complementary categories
  const complementMap = {
    'Refrigerators': ['Water Filters', 'Ice Makers', 'Extended Warranty'],
    'Washers': ['Dryers', 'Stacking Kit', 'Extended Warranty'],
    'Dryers': ['Washers', 'Stacking Kit', 'Extended Warranty'],
    'Ranges': ['Range Hoods', 'Microwaves', 'Extended Warranty'],
    'Dishwashers': ['Dishwasher Installation Kit', 'Extended Warranty'],
    'TVs': ['Sound Bars', 'TV Mounts', 'HDMI Cables', 'Extended Warranty']
  };

  // Get suggestions based on cart categories
  for (const item of cartCategories) {
    const complements = complementMap[item.category] || [];
    for (const complementCategory of complements) {
      const products = await db.query(`
        SELECT id, name, sku, model, msrp_cents, category, manufacturer
        FROM products
        WHERE is_active = true
          AND (category ILIKE $1 OR name ILIKE $1)
          AND (in_stock = true OR qty_on_hand > 0)
        ORDER BY msrp_cents DESC
        LIMIT 2
      `, [`%${complementCategory}%`]);

      products.rows.forEach(p => {
        suggestions.push({
          productId: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category,
          price: p.msrp_cents ? (p.msrp_cents / 100).toFixed(2) : null,
          reason: `Complements ${item.category}`
        });
      });
    }
  }

  // If customer provided, add personalized suggestions based on history
  if (customer_id) {
    const historyResult = await db.query(`
      SELECT DISTINCT p.category, p.manufacturer
      FROM quotations q
      JOIN quotation_items qi ON qi.quotation_id = q.id
      JOIN products p ON p.id = qi.product_id
      WHERE q.customer_id = $1 AND q.status = 'won'
    `, [customer_id]);

    // Suggest items from their preferred brands
    for (const pref of historyResult.rows.slice(0, 2)) {
      if (pref.manufacturer) {
        const brandProducts = await db.query(`
          SELECT id, name, sku, model, msrp_cents, category
          FROM products
          WHERE manufacturer = $1
            AND is_active = true
            AND id != ALL($2)
            AND (in_stock = true OR qty_on_hand > 0)
          ORDER BY msrp_cents DESC
          LIMIT 2
        `, [pref.manufacturer, product_ids || []]);

        brandProducts.rows.forEach(p => {
          suggestions.push({
            productId: p.id,
            name: p.name,
            sku: p.sku,
            category: p.category,
            price: p.msrp_cents ? (p.msrp_cents / 100).toFixed(2) : null,
            reason: `From preferred brand ${pref.manufacturer}`
          });
        });
      }
    }
  }

  // Remove duplicates
  const uniqueSuggestions = suggestions.reduce((acc, curr) => {
    if (!acc.find(s => s.productId === curr.productId)) {
      acc.push(curr);
    }
    return acc;
  }, []);

  return {
    count: uniqueSuggestions.length,
    suggestions: uniqueSuggestions.slice(0, 6)
  };
}

module.exports = {
  TOOLS,
  executeTools,
  executeTool
};
