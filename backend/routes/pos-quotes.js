/**
 * POS Quote Routes for TeleTime POS
 * Handles quote lookup, preview, and conversion to sales
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

// Apply authentication to all POS quote routes
router.use(authenticate);

// Module-level dependencies
let pool = null;

/**
 * Initialize the router with dependencies
 */
const init = (deps) => {
  pool = deps.pool;
  return router;
};

// ============================================
// VALIDATION SCHEMAS
// ============================================

const lookupSchema = Joi.object({
  query: Joi.string().min(2).max(100).required(),
});

const convertSchema = Joi.object({
  transactionId: Joi.number().integer().optional(),
  transactionNumber: Joi.string().optional(),
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format quote for POS display
 */
function formatQuoteForPOS(quote) {
  return {
    quoteId: quote.id,
    quoteNumber: quote.quote_number || quote.quotation_number,
    status: quote.status,
    customerId: quote.customer_id,
    customerName: quote.customer_name,
    customerEmail: quote.customer_email,
    customerPhone: quote.customer_phone,
    salespersonId: quote.created_by || quote.user_id,
    salespersonName: quote.user_name,
    itemCount: parseInt(quote.item_count) || 0,
    subtotal: parseFloat(quote.subtotal_cents || 0) / 100,
    discountAmount: parseFloat(quote.discount_cents || 0) / 100,
    discountReason: quote.discount_reason,
    taxAmount: parseFloat(quote.tax_cents || 0) / 100,
    totalAmount: parseFloat(quote.total_cents || 0) / 100,
    notes: quote.internal_notes || quote.notes,
    createdAt: quote.created_at,
    validUntil: quote.quote_expiry_date || quote.expires_at,
  };
}

/**
 * Format quote item for POS
 */
function formatQuoteItem(item) {
  return {
    productId: item.product_id,
    productName: item.product_name || item.name,
    productSku: item.product_sku || item.model,
    quantity: parseInt(item.quantity) || 1,
    unitPrice: parseFloat(item.unit_price_cents || 0) / 100,
    unitCost: parseFloat(item.unit_cost_cents || 0) / 100,
    discountPercent: parseFloat(item.discount_percent) || 0,
    stockQuantity: parseInt(item.stock_quantity) || 0,
  };
}

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/pos-quotes/lookup
 * Search quotes by number, customer name, phone, or email
 * Returns pending quotes ready for conversion
 */
router.get('/lookup', asyncHandler(async (req, res) => {
  const { error, value } = lookupSchema.validate(req.query);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const { query } = value;
  const searchTerm = `%${query}%`;

  // Search quotes by number, customer name, phone, or email
  const result = await pool.query(`
    SELECT
      q.id,
      q.quote_number,
      q.quotation_number,
      q.status,
      q.customer_id,
      c.name as customer_name,
      c.email as customer_email,
      c.phone as customer_phone,
      q.created_by,
      (u.first_name || ' ' || u.last_name) as user_name,
      q.total_cents,
      q.subtotal_cents,
      q.discount_cents,
      q.tax_cents,
      NULL as discount_reason,
      q.internal_notes,
      q.created_at,
      q.quote_expiry_date,
      q.expires_at,
      (SELECT COUNT(*) FROM quote_items qi WHERE qi.quotation_id = q.id) as item_count
    FROM quotations q
    LEFT JOIN customers c ON q.customer_id = c.id
    LEFT JOIN users u ON q.created_by::text = u.id::text
    WHERE
      q.status NOT IN ('converted', 'cancelled', 'expired', 'rejected')
      AND (
        q.quote_number ILIKE $1
        OR q.quotation_number ILIKE $1
        OR c.name ILIKE $1
        OR c.phone ILIKE $1
        OR c.email ILIKE $1
      )
      AND (q.quote_expiry_date IS NULL OR q.quote_expiry_date > NOW())
      AND (q.expires_at IS NULL OR q.expires_at > NOW())
    ORDER BY q.created_at DESC
    LIMIT 20
  `, [searchTerm]);

  const quotes = result.rows.map(formatQuoteForPOS);

  res.json({
    success: true,
    data: quotes,
  });
}));

/**
 * GET /api/pos-quotes/:id/for-sale
 * Get quote details with stock levels for POS checkout
 */
router.get('/:id/for-sale', asyncHandler(async (req, res) => {
  const quoteId = parseInt(req.params.id, 10);
  if (!quoteId) {
    throw ApiError.badRequest('Invalid quote ID');
  }

  // Get quote details
  const quoteResult = await pool.query(`
    SELECT
      q.id,
      q.quote_number,
      q.quotation_number,
      q.status,
      q.customer_id,
      c.name as customer_name,
      c.email as customer_email,
      c.phone as customer_phone,
      c.address as customer_address,
      q.created_by,
      (u.first_name || ' ' || u.last_name) as user_name,
      q.subtotal_cents,
      q.discount_cents,
      q.tax_cents,
      q.total_cents,
      q.internal_notes,
      q.notes,
      q.created_at,
      q.quote_expiry_date,
      q.expires_at
    FROM quotations q
    LEFT JOIN customers c ON q.customer_id = c.id
    LEFT JOIN users u ON q.created_by::text = u.id::text
    WHERE q.id = $1
  `, [quoteId]);

  if (quoteResult.rows.length === 0) {
    throw ApiError.notFound('Quote');
  }

  const quote = quoteResult.rows[0];

  // Check if quote is already converted
  if (quote.status === 'converted') {
    throw ApiError.badRequest('Quote has already been converted to a sale');
  }

  // Check if quote is expired
  const now = new Date();
  const validUntil = quote.quote_expiry_date || quote.expires_at;
  if (validUntil && new Date(validUntil) < now) {
    throw ApiError.badRequest('Quote has expired');
  }

  // Get quote items with current stock levels
  const itemsResult = await pool.query(`
    SELECT
      qi.id as item_id,
      qi.product_id,
      COALESCE(p.name, qi.description) as product_name,
      COALESCE(p.model, qi.model) as product_sku,
      qi.quantity,
      COALESCE(NULLIF(qi.sell_cents, 0), (qi.unit_price * 100)::int) as unit_price_cents,
      qi.cost_cents as unit_cost_cents,
      qi.discount_percent,
      COALESCE(p.qty_on_hand, 0) as stock_quantity
    FROM quote_items qi
    LEFT JOIN products p ON qi.product_id = p.id
    WHERE qi.quotation_id = $1
    ORDER BY qi.id
  `, [quoteId]);

  const items = itemsResult.rows.map(formatQuoteItem);

  // Check for any out of stock items
  const outOfStockItems = items.filter(item => item.stockQuantity < item.quantity);

  const formattedQuote = {
    ...formatQuoteForPOS(quote),
    items,
    stockWarning: outOfStockItems.length > 0,
    outOfStockCount: outOfStockItems.length,
    customer: quote.customer_id ? {
      customerId: quote.customer_id,
      customerName: quote.customer_name,
      email: quote.customer_email,
      phone: quote.customer_phone,
      address: quote.customer_address,
    } : null,
  };

  res.json({
    success: true,
    data: formattedQuote,
  });
}));

/**
 * POST /api/pos-quotes/:id/convert
 * Mark quote as converted after transaction completes
 */
router.post('/:id/convert', asyncHandler(async (req, res) => {
  const quoteId = parseInt(req.params.id, 10);
  if (!quoteId) {
    throw ApiError.badRequest('Invalid quote ID');
  }

  const { error, value } = convertSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const { transactionId, transactionNumber } = value;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get quote to verify it exists and isn't already converted
    const quoteResult = await client.query(`
      SELECT id, status, quote_number, quotation_number
      FROM quotations
      WHERE id = $1
      FOR UPDATE
    `, [quoteId]);

    if (quoteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Quote');
    }

    const quote = quoteResult.rows[0];

    if (quote.status === 'converted') {
      await client.query('ROLLBACK');
      throw ApiError.badRequest('Quote has already been converted');
    }

    // Update quote status to converted
    await client.query(`
      UPDATE quotations
      SET
        status = 'converted',
        converted_at = NOW(),
        converted_to_order_id = $2,
        updated_at = NOW()
      WHERE id = $1
    `, [quoteId, transactionId || null]);

    // Log the conversion event
    await client.query(`
      INSERT INTO quote_events (quotation_id, event_type, metadata, user_id, created_at)
      VALUES ($1, 'converted', $2, $3, NOW())
    `, [
      quoteId,
      JSON.stringify({
        transactionId,
        transactionNumber,
        convertedAt: new Date().toISOString(),
      }),
      req.user.id,
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        quoteId,
        quoteNumber: quote.quote_number || quote.quotation_number,
        status: 'converted',
        transactionId,
        transactionNumber,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/pos-quotes/:id/status
 * Check quote status (for validation before loading)
 */
router.get('/:id/status', asyncHandler(async (req, res) => {
  const quoteId = parseInt(req.params.id, 10);
  if (!quoteId) {
    throw ApiError.badRequest('Invalid quote ID');
  }

  const result = await pool.query(`
    SELECT
      id,
      quote_number,
      quotation_number,
      status,
      quote_expiry_date,
      expires_at
    FROM quotations
    WHERE id = $1
  `, [quoteId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Quote');
  }

  const quote = result.rows[0];
  const now = new Date();
  const validUntil = quote.quote_expiry_date || quote.expires_at;

  const isExpired = validUntil && new Date(validUntil) < now;
  const isConverted = quote.status === 'converted';
  const isCancelled = quote.status === 'cancelled' || quote.status === 'rejected';

  res.json({
    success: true,
    data: {
      quoteId: quote.id,
      quoteNumber: quote.quote_number || quote.quotation_number,
      status: quote.status,
      isValid: !isExpired && !isConverted && !isCancelled,
      isExpired,
      isConverted,
      isCancelled,
      validUntil,
    },
  });
}));

/**
 * GET /api/pos-quotes/pending
 * Get all pending quotes (for dashboard widget)
 */
router.get('/pending', asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  const result = await pool.query(`
    SELECT
      q.id,
      q.quote_number,
      q.quotation_number,
      q.status,
      c.name as customer_name,
      q.total_cents,
      q.created_at,
      (SELECT COUNT(*) FROM quote_items qi WHERE qi.quotation_id = q.id) as item_count
    FROM quotations q
    LEFT JOIN customers c ON q.customer_id = c.id
    WHERE
      q.status IN ('pending', 'sent', 'accepted')
      AND (q.quote_expiry_date IS NULL OR q.quote_expiry_date > NOW())
      AND (q.expires_at IS NULL OR q.expires_at > NOW())
    ORDER BY q.created_at DESC
    LIMIT $1
  `, [limit]);

  const quotes = result.rows.map(formatQuoteForPOS);

  res.json({
    success: true,
    data: quotes,
    count: quotes.length,
  });
}));

module.exports = { init, router };
