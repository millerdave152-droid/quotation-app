/**
 * Customer Portal Routes
 * Self-service portal endpoints for customers including:
 * - Quote history
 * - Reorder from past quotes
 * - Communication preferences
 * - Account management
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

let pool = null;
let cache = null;

/**
 * Initialize the router with dependencies
 */
const init = (deps) => {
  pool = deps.pool;
  cache = deps.cache;
  return router;
};

/**
 * GET /api/customer-portal/dashboard/:token
 * Get customer dashboard data (quote history, stats, preferences)
 */
router.get('/dashboard/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;

  // Validate token and get customer
  const customer = await getCustomerByToken(token);
  if (!customer) {
    throw ApiError.notFound('Invalid or expired token');
  }

  const [quotes, stats, preferences] = await Promise.all([
    getCustomerQuotes(customer.id),
    getCustomerStats(customer.id),
    getCustomerPreferences(customer.id)
  ]);

  res.json({
    success: true,
    data: {
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        company: customer.company
      },
      quotes,
      stats,
      preferences
    }
  });
}));

/**
 * GET /api/customer-portal/quotes/:token
 * Get customer's quote history
 */
router.get('/quotes/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { status, limit = 20, offset = 0 } = req.query;

  const customer = await getCustomerByToken(token);
  if (!customer) {
    throw ApiError.notFound('Invalid or expired token');
  }

  let query = `
    SELECT
      q.id,
      q.quote_number,
      q.status,
      q.total_cents,
      q.subtotal_cents,
      q.discount_cents,
      q.tax_cents,
      q.created_at,
      q.valid_until,
      q.accepted_at,
      (SELECT COUNT(*) FROM quotation_items qi WHERE qi.quotation_id = q.id) as item_count
    FROM quotations q
    WHERE q.customer_id = $1
  `;
  const params = [customer.id];

  if (status) {
    query += ` AND q.status = $${params.length + 1}`;
    params.push(status);
  }

  query += ` ORDER BY q.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await pool.query(query, params);

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM quotations WHERE customer_id = $1${status ? ` AND status = $2` : ''}`,
    status ? [customer.id, status] : [customer.id]
  );

  res.json({
    success: true,
    data: {
      quotes: result.rows.map(formatQuote),
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    }
  });
}));

/**
 * GET /api/customer-portal/quote/:token/:quoteId
 * Get detailed quote information for customer
 */
router.get('/quote/:token/:quoteId', asyncHandler(async (req, res) => {
  const { token, quoteId } = req.params;

  const customer = await getCustomerByToken(token);
  if (!customer) {
    throw ApiError.notFound('Invalid or expired token');
  }

  // Get quote with items
  const quoteResult = await pool.query(`
    SELECT
      q.*,
      json_agg(json_build_object(
        'id', qi.id,
        'product_id', qi.product_id,
        'quantity', qi.quantity,
        'unit_price_cents', qi.unit_price_cents,
        'manufacturer', p.manufacturer,
        'model', p.model,
        'description', p.description,
        'category', p.category
      )) as items
    FROM quotations q
    LEFT JOIN quotation_items qi ON qi.quotation_id = q.id
    LEFT JOIN products p ON p.id = qi.product_id
    WHERE q.id = $1 AND q.customer_id = $2
    GROUP BY q.id
  `, [quoteId, customer.id]);

  if (quoteResult.rows.length === 0) {
    throw ApiError.notFound('Quote not found');
  }

  res.json({
    success: true,
    data: formatQuoteDetail(quoteResult.rows[0])
  });
}));

/**
 * POST /api/customer-portal/reorder/:token/:quoteId
 * Create a new quote based on a previous one
 */
router.post('/reorder/:token/:quoteId', asyncHandler(async (req, res) => {
  const { token, quoteId } = req.params;
  const { notes } = req.body;

  const customer = await getCustomerByToken(token);
  if (!customer) {
    throw ApiError.notFound('Invalid or expired token');
  }

  // Get original quote
  const originalResult = await pool.query(`
    SELECT q.*, c.email as customer_email
    FROM quotations q
    JOIN customers c ON c.id = q.customer_id
    WHERE q.id = $1 AND q.customer_id = $2
  `, [quoteId, customer.id]);

  if (originalResult.rows.length === 0) {
    throw ApiError.notFound('Original quote not found');
  }

  const original = originalResult.rows[0];

  // Get original items
  const itemsResult = await pool.query(`
    SELECT qi.*, p.sell_price as current_price
    FROM quotation_items qi
    JOIN products p ON p.id = qi.product_id
    WHERE qi.quotation_id = $1
  `, [quoteId]);

  // Create new quote
  const newQuoteResult = await pool.query(`
    INSERT INTO quotations (
      customer_id,
      status,
      notes,
      subtotal_cents,
      discount_percent,
      discount_cents,
      tax_cents,
      total_cents,
      valid_until,
      reorder_from_quote_id
    ) VALUES ($1, 'DRAFT', $2, 0, 0, 0, 0, 0, NOW() + INTERVAL '30 days', $3)
    RETURNING *
  `, [customer.id, notes || `Reorder from Quote #${original.quote_number}`, quoteId]);

  const newQuote = newQuoteResult.rows[0];

  // Copy items with current prices
  let subtotal = 0;
  for (const item of itemsResult.rows) {
    const priceToUse = parseFloat(item.current_price) * 100; // Use current price
    await pool.query(`
      INSERT INTO quotation_items (
        quotation_id, product_id, quantity, unit_price_cents
      ) VALUES ($1, $2, $3, $4)
    `, [newQuote.id, item.product_id, item.quantity, Math.round(priceToUse)]);
    subtotal += Math.round(priceToUse) * item.quantity;
  }

  // Update totals
  const taxRate = 0.13; // HST
  const taxCents = Math.round(subtotal * taxRate);
  const totalCents = subtotal + taxCents;

  await pool.query(`
    UPDATE quotations SET
      subtotal_cents = $1,
      tax_cents = $2,
      total_cents = $3
    WHERE id = $4
  `, [subtotal, taxCents, totalCents, newQuote.id]);

  // Log activity
  await pool.query(`
    INSERT INTO activity_events (
      event_type, entity_type, entity_id, customer_id, metadata
    ) VALUES ('reorder_request', 'quotation', $1, $2, $3)
  `, [newQuote.id, customer.id, JSON.stringify({
    original_quote_id: quoteId,
    original_quote_number: original.quote_number
  })]);

  res.json({
    success: true,
    data: {
      message: 'Reorder request submitted successfully',
      newQuoteId: newQuote.id,
      originalQuoteNumber: original.quote_number
    }
  });
}));

/**
 * GET /api/customer-portal/preferences/:token
 * Get customer communication preferences
 */
router.get('/preferences/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;

  const customer = await getCustomerByToken(token);
  if (!customer) {
    throw ApiError.notFound('Invalid or expired token');
  }

  const preferences = await getCustomerPreferences(customer.id);

  res.json({
    success: true,
    data: preferences
  });
}));

/**
 * PUT /api/customer-portal/preferences/:token
 * Update customer communication preferences
 */
router.put('/preferences/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const {
    email_quotes,
    email_promotions,
    email_reminders,
    sms_delivery_updates,
    sms_reminders,
    preferred_contact_method
  } = req.body;

  const customer = await getCustomerByToken(token);
  if (!customer) {
    throw ApiError.notFound('Invalid or expired token');
  }

  // Upsert preferences
  await pool.query(`
    INSERT INTO customer_preferences (
      customer_id,
      email_quotes,
      email_promotions,
      email_reminders,
      sms_delivery_updates,
      sms_reminders,
      preferred_contact_method,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (customer_id) DO UPDATE SET
      email_quotes = EXCLUDED.email_quotes,
      email_promotions = EXCLUDED.email_promotions,
      email_reminders = EXCLUDED.email_reminders,
      sms_delivery_updates = EXCLUDED.sms_delivery_updates,
      sms_reminders = EXCLUDED.sms_reminders,
      preferred_contact_method = EXCLUDED.preferred_contact_method,
      updated_at = NOW()
  `, [
    customer.id,
    email_quotes !== false,
    email_promotions !== false,
    email_reminders !== false,
    sms_delivery_updates === true,
    sms_reminders === true,
    preferred_contact_method || 'email'
  ]);

  res.json({
    success: true,
    message: 'Preferences updated successfully'
  });
}));

/**
 * PUT /api/customer-portal/profile/:token
 * Update customer profile information
 */
router.put('/profile/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { phone, address, city, postal_code } = req.body;

  const customer = await getCustomerByToken(token);
  if (!customer) {
    throw ApiError.notFound('Invalid or expired token');
  }

  await pool.query(`
    UPDATE customers SET
      phone = COALESCE($1, phone),
      address = COALESCE($2, address),
      city = COALESCE($3, city),
      postal_code = COALESCE($4, postal_code),
      updated_at = NOW()
    WHERE id = $5
  `, [phone, address, city, postal_code, customer.id]);

  res.json({
    success: true,
    message: 'Profile updated successfully'
  });
}));

/**
 * POST /api/customer-portal/generate-token
 * Generate a new portal access token for a customer (internal use)
 */
router.post('/generate-token', asyncHandler(async (req, res) => {
  const { customerId, expiresInDays = 30 } = req.body;

  if (!customerId) {
    throw ApiError.badRequest('Customer ID is required');
  }

  const token = require('crypto').randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  await pool.query(`
    INSERT INTO customer_portal_tokens (customer_id, token, expires_at)
    VALUES ($1, $2, $3)
    ON CONFLICT (customer_id) DO UPDATE SET
      token = EXCLUDED.token,
      expires_at = EXCLUDED.expires_at,
      created_at = NOW()
  `, [customerId, token, expiresAt]);

  res.json({
    success: true,
    data: {
      token,
      expiresAt,
      portalUrl: `/customer-portal/${token}`
    }
  });
}));

// Helper functions
async function getCustomerByToken(token) {
  // First try portal tokens table
  const tokenResult = await pool.query(`
    SELECT c.* FROM customer_portal_tokens cpt
    JOIN customers c ON c.id = cpt.customer_id
    WHERE cpt.token = $1 AND cpt.expires_at > NOW()
  `, [token]);

  if (tokenResult.rows.length > 0) {
    return tokenResult.rows[0];
  }

  // Fall back to quote portal tokens
  const quoteResult = await pool.query(`
    SELECT c.* FROM quotations q
    JOIN customers c ON c.id = q.customer_id
    WHERE q.portal_token = $1
  `, [token]);

  return quoteResult.rows[0] || null;
}

async function getCustomerQuotes(customerId) {
  const result = await pool.query(`
    SELECT
      q.id,
      q.quote_number,
      q.status,
      q.total_cents,
      q.created_at,
      q.valid_until,
      q.accepted_at,
      (SELECT COUNT(*) FROM quotation_items qi WHERE qi.quotation_id = q.id) as item_count
    FROM quotations q
    WHERE q.customer_id = $1
    ORDER BY q.created_at DESC
    LIMIT 10
  `, [customerId]);

  return result.rows.map(formatQuote);
}

async function getCustomerStats(customerId) {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_quotes,
      COUNT(*) FILTER (WHERE status = 'WON') as accepted_quotes,
      COUNT(*) FILTER (WHERE status = 'SENT') as pending_quotes,
      SUM(total_cents) FILTER (WHERE status = 'WON') as total_spent_cents,
      AVG(total_cents) FILTER (WHERE status = 'WON') as avg_order_cents,
      MAX(created_at) FILTER (WHERE status = 'WON') as last_order_date
    FROM quotations
    WHERE customer_id = $1
  `, [customerId]);

  const stats = result.rows[0];
  return {
    totalQuotes: parseInt(stats.total_quotes) || 0,
    acceptedQuotes: parseInt(stats.accepted_quotes) || 0,
    pendingQuotes: parseInt(stats.pending_quotes) || 0,
    totalSpent: parseInt(stats.total_spent_cents) || 0,
    avgOrderValue: Math.round(parseFloat(stats.avg_order_cents) || 0),
    lastOrderDate: stats.last_order_date
  };
}

async function getCustomerPreferences(customerId) {
  const result = await pool.query(`
    SELECT * FROM customer_preferences WHERE customer_id = $1
  `, [customerId]);

  if (result.rows.length === 0) {
    return {
      email_quotes: true,
      email_promotions: true,
      email_reminders: true,
      sms_delivery_updates: false,
      sms_reminders: false,
      preferred_contact_method: 'email'
    };
  }

  return result.rows[0];
}

function formatQuote(q) {
  return {
    id: q.id,
    quoteNumber: q.quote_number,
    status: q.status,
    totalCents: parseInt(q.total_cents),
    itemCount: parseInt(q.item_count),
    createdAt: q.created_at,
    validUntil: q.valid_until,
    acceptedAt: q.accepted_at
  };
}

function formatQuoteDetail(q) {
  return {
    id: q.id,
    quoteNumber: q.quote_number,
    status: q.status,
    subtotalCents: parseInt(q.subtotal_cents),
    discountCents: parseInt(q.discount_cents) || 0,
    taxCents: parseInt(q.tax_cents),
    totalCents: parseInt(q.total_cents),
    notes: q.notes,
    createdAt: q.created_at,
    validUntil: q.valid_until,
    acceptedAt: q.accepted_at,
    items: (q.items || []).filter(i => i.id).map(item => ({
      id: item.id,
      productId: item.product_id,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      manufacturer: item.manufacturer,
      model: item.model,
      description: item.description,
      category: item.category
    }))
  };
}

module.exports = { router, init };
