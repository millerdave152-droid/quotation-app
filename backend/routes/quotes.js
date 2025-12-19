/**
 * Quotation Routes Module
 * Handles all quotation-related API endpoints including CRUD, events, and revenue features
 * Uses QuoteService for core business logic
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const QuoteService = require('../services/QuoteService');

// Module-level dependencies (injected via init)
let pool = null;
let quoteService = null;

/**
 * Initialize the router with dependencies
 * @param {object} deps - Dependencies
 * @param {Pool} deps.pool - PostgreSQL connection pool
 */
const init = (deps) => {
  pool = deps.pool;
  quoteService = new QuoteService(deps.pool);
  return router;
};

// ============================================
// QUOTATION STATS
// ============================================

/**
 * GET /api/quotations/stats/summary
 * Get quotation statistics summary
 */
router.get('/stats/summary', asyncHandler(async (req, res) => {
  const stats = await quoteService.getStatsSummary();
  res.json(stats);
}));

/**
 * GET /api/quotations/stats/overview
 * Get quotation overview stats
 */
router.get('/stats/overview', asyncHandler(async (req, res) => {
  const stats = await pool.query(`
    SELECT
      COUNT(*) as total_quotes,
      COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as quotes_this_month,
      COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as quotes_this_week,
      COALESCE(SUM(total_amount), 0) as total_value,
      COALESCE(SUM(CASE WHEN status = 'WON' THEN total_amount ELSE 0 END), 0) as won_value,
      COALESCE(SUM(CASE WHEN status = 'SENT' THEN total_amount ELSE 0 END), 0) as pending_value,
      COUNT(CASE WHEN status = 'DRAFT' THEN 1 END) as draft_count,
      COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent_count,
      COUNT(CASE WHEN status = 'WON' THEN 1 END) as won_count,
      COUNT(CASE WHEN status = 'LOST' THEN 1 END) as lost_count
    FROM quotations
  `);

  res.success({ overview: stats.rows[0] });
}));

// ============================================
// QUOTATION CRUD
// ============================================

/**
 * GET /api/quotations
 * Get all quotations with search, pagination, and sorting
 */
router.get('/', asyncHandler(async (req, res) => {
  const result = await quoteService.getQuotes(req.query);
  res.json(result);
}));

/**
 * GET /api/quotations/:id/items
 * Get quotation items
 */
router.get('/:id/items', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    'SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY id',
    [id]
  );
  res.json(result.rows);
}));

/**
 * GET /api/quotations/:id
 * Get single quotation with items
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const quote = await quoteService.getQuoteById(id);

  if (!quote) {
    throw ApiError.notFound('Quotation');
  }

  res.json(quote);
}));

/**
 * POST /api/quotations
 * Create new quotation
 */
router.post('/', asyncHandler(async (req, res) => {
  const quote = await quoteService.createQuote(req.body);
  res.created(quote);
}));

/**
 * PUT /api/quotations/:id
 * Update quotation
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const quote = await quoteService.updateQuote(id, req.body);

  if (!quote) {
    throw ApiError.notFound('Quotation');
  }

  res.success(quote, { message: 'Quotation updated successfully' });
}));

/**
 * PATCH /api/quotations/:id/status
 * Update quotation status
 */
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    throw ApiError.validation('Status is required');
  }

  const quote = await quoteService.updateStatus(id, status);

  if (!quote) {
    throw ApiError.notFound('Quotation');
  }

  res.success(quote, { message: `Status updated to ${status}` });
}));

/**
 * DELETE /api/quotations/:id
 * Delete quotation
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await quoteService.deleteQuote(id);

  if (!result) {
    throw ApiError.notFound('Quotation');
  }

  res.success(null, { message: 'Quotation deleted successfully' });
}));

// ============================================
// QUOTE EVENTS / ACTIVITY TIMELINE
// ============================================

/**
 * GET /api/quotations/:id/events
 * Get quote events
 */
router.get('/:id/events', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const events = await quoteService.getQuoteEvents(id);
  res.json(events);
}));

/**
 * POST /api/quotations/:id/events
 * Add quote event
 */
router.post('/:id/events', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { event_type, description } = req.body;

  const event = await quoteService.addQuoteEvent(id, event_type, description);
  res.created(event);
}));

// Note: Approval workflow endpoints (request-approval, approvals) are defined in server.js
// with full email notification support via AWS SES

// ============================================
// DELIVERY
// ============================================

/**
 * POST /api/quotations/:quoteId/delivery
 * Add delivery to quote
 */
router.post('/:quoteId/delivery', asyncHandler(async (req, res) => {
  const { quoteId } = req.params;
  const {
    delivery_type,
    delivery_address,
    delivery_date,
    delivery_time_slot,
    delivery_cost_cents,
    installation_required,
    installation_cost_cents,
    haul_away_required,
    haul_away_cost_cents,
    notes
  } = req.body;

  const total_delivery_cost_cents = (delivery_cost_cents || 0) +
    (installation_cost_cents || 0) +
    (haul_away_cost_cents || 0);

  const result = await pool.query(`
    INSERT INTO quote_delivery (
      quote_id, delivery_type, delivery_address, delivery_date, delivery_time_slot,
      delivery_cost_cents, installation_required, installation_cost_cents,
      haul_away_required, haul_away_cost_cents, total_delivery_cost_cents, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (quote_id) DO UPDATE SET
      delivery_type = EXCLUDED.delivery_type,
      delivery_address = EXCLUDED.delivery_address,
      delivery_date = EXCLUDED.delivery_date,
      delivery_time_slot = EXCLUDED.delivery_time_slot,
      delivery_cost_cents = EXCLUDED.delivery_cost_cents,
      installation_required = EXCLUDED.installation_required,
      installation_cost_cents = EXCLUDED.installation_cost_cents,
      haul_away_required = EXCLUDED.haul_away_required,
      haul_away_cost_cents = EXCLUDED.haul_away_cost_cents,
      total_delivery_cost_cents = EXCLUDED.total_delivery_cost_cents,
      notes = EXCLUDED.notes,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `, [
    quoteId, delivery_type, delivery_address, delivery_date, delivery_time_slot,
    delivery_cost_cents, installation_required, installation_cost_cents,
    haul_away_required, haul_away_cost_cents, total_delivery_cost_cents, notes
  ]);

  res.success(result.rows[0], { message: 'Delivery options saved' });
}));

/**
 * GET /api/quotations/:quoteId/delivery
 * Get quote delivery info
 */
router.get('/:quoteId/delivery', asyncHandler(async (req, res) => {
  const { quoteId } = req.params;
  const result = await pool.query(
    'SELECT * FROM quote_delivery WHERE quote_id = $1',
    [quoteId]
  );
  res.json(result.rows[0] || null);
}));

// ============================================
// WARRANTIES
// ============================================

/**
 * POST /api/quotations/:quoteId/warranties
 * Add warranty to quote
 */
router.post('/:quoteId/warranties', asyncHandler(async (req, res) => {
  const { quoteId } = req.params;
  const { product_id, warranty_type, warranty_years, warranty_cost_cents, coverage_details } = req.body;

  const result = await pool.query(`
    INSERT INTO quote_warranties (quote_id, product_id, warranty_type, warranty_years, warranty_cost_cents, coverage_details)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
  `, [quoteId, product_id, warranty_type, warranty_years, warranty_cost_cents, coverage_details]);

  res.created(result.rows[0]);
}));

/**
 * GET /api/quotations/:quoteId/warranties
 * Get quote warranties
 */
router.get('/:quoteId/warranties', asyncHandler(async (req, res) => {
  const { quoteId } = req.params;
  const result = await pool.query(`
    SELECT qw.*, p.model, p.manufacturer
    FROM quote_warranties qw
    LEFT JOIN products p ON qw.product_id = p.id
    WHERE qw.quote_id = $1
    ORDER BY qw.created_at
  `, [quoteId]);
  res.json(result.rows);
}));

// ============================================
// FINANCING
// ============================================

/**
 * POST /api/quotations/:quoteId/financing
 * Add financing to quote
 */
router.post('/:quoteId/financing', asyncHandler(async (req, res) => {
  const { quoteId } = req.params;
  const {
    financing_type, provider, financed_amount_cents, down_payment_cents,
    term_months, interest_rate, monthly_payment_cents, total_interest_cents
  } = req.body;

  const result = await pool.query(`
    INSERT INTO quote_financing (
      quote_id, financing_type, provider, financed_amount_cents, down_payment_cents,
      term_months, interest_rate, monthly_payment_cents, total_interest_cents
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (quote_id) DO UPDATE SET
      financing_type = EXCLUDED.financing_type,
      provider = EXCLUDED.provider,
      financed_amount_cents = EXCLUDED.financed_amount_cents,
      down_payment_cents = EXCLUDED.down_payment_cents,
      term_months = EXCLUDED.term_months,
      interest_rate = EXCLUDED.interest_rate,
      monthly_payment_cents = EXCLUDED.monthly_payment_cents,
      total_interest_cents = EXCLUDED.total_interest_cents,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `, [
    quoteId, financing_type, provider, financed_amount_cents, down_payment_cents,
    term_months, interest_rate, monthly_payment_cents, total_interest_cents
  ]);

  res.success(result.rows[0], { message: 'Financing options saved' });
}));

/**
 * GET /api/quotations/:quoteId/financing
 * Get quote financing
 */
router.get('/:quoteId/financing', asyncHandler(async (req, res) => {
  const { quoteId } = req.params;
  const result = await pool.query(
    'SELECT * FROM quote_financing WHERE quote_id = $1',
    [quoteId]
  );
  res.json(result.rows[0] || null);
}));

// ============================================
// REBATES
// ============================================

/**
 * POST /api/quotations/:quoteId/rebates
 * Add rebate to quote
 */
router.post('/:quoteId/rebates', asyncHandler(async (req, res) => {
  const { quoteId } = req.params;
  const { product_id, rebate_type, rebate_name, rebate_amount_cents, rebate_code, expiry_date } = req.body;

  const result = await pool.query(`
    INSERT INTO quote_rebates (quote_id, product_id, rebate_type, rebate_name, rebate_amount_cents, rebate_code, expiry_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
  `, [quoteId, product_id, rebate_type, rebate_name, rebate_amount_cents, rebate_code, expiry_date]);

  res.created(result.rows[0]);
}));

/**
 * GET /api/quotations/:quoteId/rebates
 * Get quote rebates
 */
router.get('/:quoteId/rebates', asyncHandler(async (req, res) => {
  const { quoteId } = req.params;
  const result = await pool.query(`
    SELECT qr.*, p.model, p.manufacturer
    FROM quote_rebates qr
    LEFT JOIN products p ON qr.product_id = p.id
    WHERE qr.quote_id = $1
    ORDER BY qr.created_at
  `, [quoteId]);
  res.json(result.rows);
}));

// ============================================
// TRADE-INS
// ============================================

/**
 * POST /api/quotations/:quoteId/trade-ins
 * Add trade-in to quote
 */
router.post('/:quoteId/trade-ins', asyncHandler(async (req, res) => {
  const { quoteId } = req.params;
  const {
    item_type, brand, model, age_years, condition,
    trade_in_value_cents, description, serial_number
  } = req.body;

  const result = await pool.query(`
    INSERT INTO quote_trade_ins (
      quote_id, item_type, brand, model, age_years, condition,
      trade_in_value_cents, description, serial_number
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
  `, [quoteId, item_type, brand, model, age_years, condition, trade_in_value_cents, description, serial_number]);

  res.created(result.rows[0]);
}));

/**
 * GET /api/quotations/:quoteId/trade-ins
 * Get quote trade-ins
 */
router.get('/:quoteId/trade-ins', asyncHandler(async (req, res) => {
  const { quoteId } = req.params;
  const result = await pool.query(
    'SELECT * FROM quote_trade_ins WHERE quote_id = $1 ORDER BY created_at',
    [quoteId]
  );
  res.json(result.rows);
}));

// ============================================
// SALES REP ASSIGNMENT
// ============================================

/**
 * POST /api/quotations/:quoteId/sales-rep
 * Assign sales rep to quote
 */
router.post('/:quoteId/sales-rep', asyncHandler(async (req, res) => {
  const { quoteId } = req.params;
  const { sales_rep_id, commission_rate, commission_amount_cents, notes } = req.body;

  const result = await pool.query(`
    INSERT INTO quote_sales_rep (quote_id, sales_rep_id, commission_rate, commission_amount_cents, notes)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (quote_id) DO UPDATE SET
      sales_rep_id = EXCLUDED.sales_rep_id,
      commission_rate = EXCLUDED.commission_rate,
      commission_amount_cents = EXCLUDED.commission_amount_cents,
      notes = EXCLUDED.notes,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `, [quoteId, sales_rep_id, commission_rate, commission_amount_cents, notes]);

  res.success(result.rows[0], { message: 'Sales rep assigned' });
}));

/**
 * GET /api/quotations/:quoteId/sales-rep
 * Get quote sales rep
 */
router.get('/:quoteId/sales-rep', asyncHandler(async (req, res) => {
  const { quoteId } = req.params;
  const result = await pool.query(`
    SELECT qsr.*, u.name as sales_rep_name, u.email as sales_rep_email
    FROM quote_sales_rep qsr
    LEFT JOIN users u ON qsr.sales_rep_id = u.id
    WHERE qsr.quote_id = $1
  `, [quoteId]);
  res.json(result.rows[0] || null);
}));

module.exports = { router, init };
