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
 * GET /api/quotations/stats/dashboard
 * Get enhanced dashboard metrics with advanced calculations
 * Includes: conversion rate, avg days to close, top salespeople,
 * win rate by tier, weekly activity, sales velocity
 */
router.get('/stats/dashboard', asyncHandler(async (req, res) => {
  const metrics = await quoteService.getEnhancedDashboardMetrics();
  res.json(metrics);
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

      -- Values in cents (correct column name)
      COALESCE(SUM(total_cents), 0) as total_value_cents,
      COALESCE(SUM(CASE WHEN status = 'WON' THEN total_cents ELSE 0 END), 0) as won_value_cents,
      COALESCE(SUM(CASE WHEN status IN ('DRAFT', 'SENT', 'PENDING_APPROVAL') THEN total_cents ELSE 0 END), 0) as pipeline_value_cents,
      COALESCE(SUM(CASE WHEN status = 'SENT' THEN total_cents ELSE 0 END), 0) as sent_value_cents,

      -- Dollar amounts for backward compatibility
      COALESCE(SUM(total_cents), 0) / 100.0 as total_value,
      COALESCE(SUM(CASE WHEN status = 'WON' THEN total_cents ELSE 0 END), 0) / 100.0 as won_value,
      COALESCE(SUM(CASE WHEN status = 'SENT' THEN total_cents ELSE 0 END), 0) / 100.0 as pending_value,

      COUNT(CASE WHEN status = 'DRAFT' THEN 1 END) as draft_count,
      COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent_count,
      COUNT(CASE WHEN status = 'WON' THEN 1 END) as won_count,
      COUNT(CASE WHEN status = 'LOST' THEN 1 END) as lost_count
    FROM quotations
  `);

  res.success({ overview: stats.rows[0] });
}));

/**
 * GET /api/quotations/stats/filter-counts
 * Get counts for quick filter chips
 * Returns counts for: all, each status, expiring soon, high value, no customer, recent
 */
router.get('/stats/filter-counts', asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT
      -- Total count
      COUNT(*) as all_count,

      -- Status counts
      COUNT(CASE WHEN status = 'DRAFT' THEN 1 END) as draft_count,
      COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent_count,
      COUNT(CASE WHEN status = 'WON' THEN 1 END) as won_count,
      COUNT(CASE WHEN status = 'LOST' THEN 1 END) as lost_count,
      COUNT(CASE WHEN status = 'PENDING_APPROVAL' THEN 1 END) as pending_approval_count,
      COUNT(CASE WHEN status = 'EXPIRED' THEN 1 END) as expired_count,

      -- Expiring soon: expires within 7 days, not already won/lost
      COUNT(CASE
        WHEN quote_expiry_date IS NOT NULL
          AND quote_expiry_date > NOW()
          AND quote_expiry_date <= NOW() + INTERVAL '7 days'
          AND status NOT IN ('WON', 'LOST', 'EXPIRED')
        THEN 1
      END) as expiring_soon_count,

      -- High value: total > $5,000 (500000 cents)
      COUNT(CASE WHEN total_cents > 500000 THEN 1 END) as high_value_count,

      -- No customer: customer_id is NULL
      COUNT(CASE WHEN customer_id IS NULL THEN 1 END) as no_customer_count,

      -- Recent: created in last 7 days
      COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_count,

      -- Today
      COUNT(CASE WHEN created_at::date = CURRENT_DATE THEN 1 END) as today_count,

      -- This week
      COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as this_week_count,

      -- This month
      COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as this_month_count
    FROM quotations
  `);

  const counts = result.rows[0];

  // Convert to integers
  const filterCounts = {
    all: parseInt(counts.all_count) || 0,
    draft: parseInt(counts.draft_count) || 0,
    sent: parseInt(counts.sent_count) || 0,
    won: parseInt(counts.won_count) || 0,
    lost: parseInt(counts.lost_count) || 0,
    pending_approval: parseInt(counts.pending_approval_count) || 0,
    expired: parseInt(counts.expired_count) || 0,
    expiring_soon: parseInt(counts.expiring_soon_count) || 0,
    high_value: parseInt(counts.high_value_count) || 0,
    no_customer: parseInt(counts.no_customer_count) || 0,
    recent: parseInt(counts.recent_count) || 0,
    today: parseInt(counts.today_count) || 0,
    this_week: parseInt(counts.this_week_count) || 0,
    this_month: parseInt(counts.this_month_count) || 0
  };

  res.json({ filterCounts });
}));

// ============================================
// QUOTATION CRUD
// ============================================

/**
 * GET /api/quotations/search
 * Enhanced search across multiple fields:
 * - Quote numbers (Q-2025-0060, 0060, 2025-0060)
 * - Product SKU/model in line items
 * - Customer name, email, phone
 * - Internal notes content
 *
 * Query params:
 * - search: Search term (required, min 2 chars)
 * - status: Filter by status (optional)
 * - page: Page number (default 1)
 * - limit: Results per page (default 50)
 *
 * Returns matches with search_match info showing which field matched
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { search } = req.query;

  if (!search || search.trim().length < 2) {
    return res.json({
      quotations: [],
      pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      search_info: {
        term: search || '',
        message: 'Search term must be at least 2 characters'
      }
    });
  }

  const result = await quoteService.searchQuotes(req.query);
  res.json(result);
}));

/**
 * GET /api/quotations
 * Get all quotations with search, pagination, and sorting
 */
router.get('/', asyncHandler(async (req, res) => {
  // If search param provided, use enhanced search
  if (req.query.search && req.query.search.trim().length >= 2) {
    const result = await quoteService.searchQuotes(req.query);
    return res.json(result);
  }
  const result = await quoteService.getQuotes(req.query);
  res.json(result);
}));

/**
 * GET /api/quotations/salespeople
 * Get list of salespeople for assignment dropdown
 */
router.get('/salespeople', asyncHandler(async (req, res) => {
  try {
    // Try to get from users table first (check if role column exists)
    const usersResult = await pool.query(`
      SELECT DISTINCT id, name, email
      FROM users
      ORDER BY name
    `);

    if (usersResult.rows.length > 0) {
      return res.json(usersResult.rows);
    }
  } catch (err) {
    console.log('Users table query failed, using fallback:', err.message);
  }

  // Fallback: get unique created_by values from quotations
  const creatorsResult = await pool.query(`
    SELECT DISTINCT created_by as name
    FROM quotations
    WHERE created_by IS NOT NULL AND created_by != ''
    ORDER BY created_by
  `);

  const salespeople = creatorsResult.rows.map((row, idx) => ({
    id: idx + 1,
    name: row.name,
    email: null
  }));

  res.json(salespeople);
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

// ============================================
// QUOTE EXPIRY MANAGEMENT
// ============================================

/**
 * GET /api/quotations/expiry-rules
 * Get all quote expiry rules
 */
router.get('/expiry-rules', asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT * FROM quote_expiry_rules ORDER BY is_default DESC, channel ASC
  `);
  res.json({ success: true, data: result.rows });
}));

/**
 * GET /api/quotations/expiring
 * Get quotes expiring within specified days
 */
router.get('/expiring', asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const result = await pool.query(`
    SELECT
      q.id, q.quote_number, q.customer_id, q.total_cents, q.status,
      q.expires_at, q.created_at,
      c.name as customer_name
    FROM quotations q
    LEFT JOIN customers c ON q.customer_id = c.id
    WHERE q.expires_at IS NOT NULL
      AND q.expires_at > NOW()
      AND q.expires_at <= NOW() + $1 * INTERVAL '1 day'
      AND q.status IN ('DRAFT', 'SENT', 'APPROVED')
    ORDER BY q.expires_at ASC
  `, [days]);
  res.json({ success: true, data: result.rows });
}));

/**
 * GET /api/quotations/expired
 * Get recently expired quotes
 */
router.get('/expired', asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const result = await pool.query(`
    SELECT
      q.id, q.quote_number, q.customer_id, q.total_cents, q.status,
      q.expires_at, q.expired_at, q.created_at,
      c.name as customer_name
    FROM quotations q
    LEFT JOIN customers c ON q.customer_id = c.id
    WHERE q.status = 'EXPIRED'
      AND q.expired_at >= NOW() - $1 * INTERVAL '1 day'
    ORDER BY q.expired_at DESC
  `, [days]);
  res.json({ success: true, data: result.rows });
}));

/**
 * POST /api/quotations/:id/renew
 * Renew an expiring or expired quote
 */
router.post('/:id/renew', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const extendDays = parseInt(req.body.extend_days) || 14;

  // Get current quote
  const quoteResult = await pool.query('SELECT * FROM quotations WHERE id = $1', [id]);
  if (quoteResult.rows.length === 0) {
    throw ApiError.notFound('Quotation');
  }

  const quote = quoteResult.rows[0];

  // Calculate new expiry date
  const baseDate = quote.status === 'EXPIRED' ? new Date() : new Date(quote.expires_at);
  const newExpiryDate = new Date(baseDate.getTime() + extendDays * 24 * 60 * 60 * 1000);

  // Update quote
  await pool.query(`
    UPDATE quotations
    SET
      expires_at = $1,
      status = CASE WHEN status = 'EXPIRED' THEN 'SENT' ELSE status END,
      renewal_count = COALESCE(renewal_count, 0) + 1,
      updated_at = NOW()
    WHERE id = $2
  `, [newExpiryDate, id]);

  // Log the renewal
  await pool.query(`
    INSERT INTO quote_expiry_log (quotation_id, action, old_expiry, new_expiry, notes)
    VALUES ($1, 'renewed', $2, $3, $4)
  `, [id, quote.expires_at, newExpiryDate, `Extended by ${extendDays} days`]);

  const updatedQuote = await quoteService.getQuoteById(id);
  res.json({ success: true, data: updatedQuote });
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
 * Update quotation status with validation
 *
 * Body:
 * - status: string (required) - New status
 * - lostReason: string (optional) - Reason for marking as lost
 * - skipValidation: boolean (optional) - Skip transition validation (admin only)
 */
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, lostReason, skipValidation } = req.body;

  if (!status) {
    throw ApiError.validation('Status is required');
  }

  try {
    const quote = await quoteService.updateStatus(id, status, {
      lostReason,
      skipValidation: skipValidation === true
    });

    if (!quote) {
      throw ApiError.notFound('Quotation');
    }

    res.success(quote, { message: `Status updated to ${status}` });
  } catch (error) {
    // Handle validation errors
    if (error.message.includes('Cannot transition') || error.message.includes('Cannot mark as')) {
      throw ApiError.validation(error.message);
    }
    throw error;
  }
}));

/**
 * GET /api/quotations/:id/allowed-transitions
 * Get allowed status transitions for a quote
 */
router.get('/:id/allowed-transitions', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const quote = await quoteService.getQuoteById(id);
  if (!quote) {
    throw ApiError.notFound('Quotation');
  }

  const allowedTransitions = quoteService.getAllowedTransitions(quote.status);

  res.success({
    currentStatus: quote.status,
    allowedTransitions,
    transitionLabels: {
      DRAFT: 'Reopen as Draft',
      SENT: 'Mark as Sent',
      WON: 'Mark as Won',
      LOST: 'Mark as Lost',
      PENDING_APPROVAL: 'Request Approval',
      APPROVED: 'Approve',
      REJECTED: 'Reject'
    }
  });
}));

/**
 * POST /api/quotations/:id/recalculate
 * Recalculate totals for an existing quote from its items
 */
router.post('/:id/recalculate', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Get the quote with items
  const quote = await quoteService.getQuoteById(id);
  if (!quote) {
    throw ApiError.notFound('Quotation');
  }

  // Calculate totals from items
  const totals = quoteService.calculateTotals(
    quote.items || [],
    quote.discount_percent || 0,
    quote.tax_rate || 13
  );

  // Update the quote with calculated totals
  await pool.query(`
    UPDATE quotations SET
      subtotal_cents = $1,
      discount_cents = $2,
      tax_cents = $3,
      total_cents = $4,
      gross_profit_cents = $5,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $6
  `, [
    totals.subtotal_cents,
    totals.discount_cents,
    totals.tax_cents,
    totals.total_cents,
    totals.gross_profit_cents,
    id
  ]);

  // Return updated quote
  const updatedQuote = await quoteService.getQuoteById(id);
  res.success(updatedQuote, { message: 'Quote totals recalculated successfully' });
}));

/**
 * POST /api/quotations/:id/clone
 * Clone an existing quote with all its line items
 *
 * Body:
 * - newCustomerId: number|null - Customer ID for cloned quote (null = same customer)
 * - includeInternalNotes: boolean - Include internal notes in clone (default: false)
 *
 * Returns the newly created quote with its new quote number
 */
router.post('/:id/clone', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newCustomerId = null, includeInternalNotes = false } = req.body;

  try {
    const clonedQuote = await quoteService.cloneQuote(parseInt(id), {
      newCustomerId: newCustomerId !== null ? parseInt(newCustomerId) : null,
      includeInternalNotes,
      clonedBy: req.body.clonedBy || 'User'
    });

    res.created({
      quote: clonedQuote,
      message: `Quote cloned as ${clonedQuote.quote_number}`,
      source_quote_number: clonedQuote.source_quote_number
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      throw ApiError.notFound('Source quotation');
    }
    throw error;
  }
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
// VERSION HISTORY
// ============================================

/**
 * GET /api/quotations/:id/versions
 * Get version history for a quote
 */
router.get('/:id/versions', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 50 } = req.query;

  const versions = await quoteService.getVersionHistory(parseInt(id), {
    limit: parseInt(limit)
  });

  res.json({ versions });
}));

/**
 * GET /api/quotations/:id/versions/:version
 * Get a specific version of a quote
 */
router.get('/:id/versions/:version', asyncHandler(async (req, res) => {
  const { id, version } = req.params;

  const versionData = await quoteService.getQuoteVersion(
    parseInt(id),
    parseInt(version)
  );

  if (!versionData) {
    throw ApiError.notFound('Version');
  }

  res.json({ version: versionData });
}));

/**
 * GET /api/quotations/:id/versions/compare
 * Compare two versions of a quote
 * Query params: v1, v2 (version numbers)
 */
router.get('/:id/versions/compare', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { v1, v2 } = req.query;

  if (!v1 || !v2) {
    throw ApiError.validation('Both v1 and v2 query parameters are required');
  }

  const comparison = await quoteService.compareVersions(
    parseInt(id),
    parseInt(v1),
    parseInt(v2)
  );

  res.json({ comparison });
}));

/**
 * POST /api/quotations/:id/versions
 * Create a version snapshot manually
 */
router.post('/:id/versions', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { changeType = 'manual', changeSummary = 'Manual version snapshot', changedBy = 'User' } = req.body;

  const version = await quoteService.createVersionSnapshot(
    parseInt(id),
    changeType,
    changeSummary,
    { changedBy }
  );

  res.created({
    version,
    message: `Version ${version.version_number} created`
  });
}));

/**
 * POST /api/quotations/:id/versions/:version/restore
 * Restore a quote to a previous version
 */
router.post('/:id/versions/:version/restore', asyncHandler(async (req, res) => {
  const { id, version } = req.params;
  const { restoredBy = 'User' } = req.body;

  const quote = await quoteService.restoreVersion(
    parseInt(id),
    parseInt(version),
    restoredBy
  );

  res.success({
    quote,
    message: `Quote restored to version ${version}`
  });
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

// ============================================
// SIGNATURES
// ============================================

/**
 * POST /api/quotations/:quoteId/staff-signature
 * Add staff signature to quote
 * Body: { signature_data, signer_name, legal_text? }
 */
router.post('/:quoteId/staff-signature', asyncHandler(async (req, res) => {
  const { quoteId } = req.params;
  const { signature_data, signer_name, legal_text } = req.body;

  if (!signature_data) {
    throw ApiError.validation('Signature data is required');
  }

  if (!signer_name) {
    throw ApiError.validation('Signer name is required');
  }

  // Validate base64 format
  if (!signature_data.startsWith('data:image/')) {
    throw ApiError.validation('Invalid signature format. Must be a base64 image.');
  }

  // Check signature size (max 500KB)
  const base64Data = signature_data.split(',')[1] || signature_data;
  const sizeInBytes = Buffer.from(base64Data, 'base64').length;
  if (sizeInBytes > 500 * 1024) {
    throw ApiError.validation('Signature too large. Maximum size is 500KB.');
  }

  // Check if quote exists
  const quoteCheck = await pool.query('SELECT id, quote_number FROM quotations WHERE id = $1', [quoteId]);
  if (quoteCheck.rows.length === 0) {
    throw ApiError.notFound('Quotation');
  }

  // Insert staff signature
  const result = await pool.query(`
    INSERT INTO quote_signatures (
      quote_id, signature_data, signer_name, signature_type, legal_text, signed_at
    ) VALUES ($1, $2, $3, 'staff', $4, CURRENT_TIMESTAMP)
    RETURNING *
  `, [quoteId, signature_data, signer_name, legal_text || 'Staff signature acknowledging quote preparation']);

  // Log the event
  await pool.query(`
    INSERT INTO quote_events (quotation_id, event_type, description, metadata)
    VALUES ($1, 'STAFF_SIGNED', $2, $3)
  `, [
    quoteId,
    `Staff signature added by ${signer_name}`,
    JSON.stringify({
      signer_name,
      signature_type: 'staff',
      signed_at: result.rows[0].signed_at
    })
  ]);

  res.created({
    signature: result.rows[0],
    message: 'Staff signature added successfully'
  });
}));

/**
 * GET /api/quotations/:quoteId/signatures
 * Get all signatures for a quote
 */
router.get('/:quoteId/signatures', asyncHandler(async (req, res) => {
  const { quoteId } = req.params;

  const result = await pool.query(`
    SELECT
      id,
      quote_id,
      signature_data,
      signer_name,
      signer_email,
      signature_type,
      legal_text,
      signed_at,
      device_info
    FROM quote_signatures
    WHERE quote_id = $1
    ORDER BY signed_at ASC
  `, [quoteId]);

  res.json({
    signatures: result.rows,
    count: result.rows.length
  });
}));

/**
 * DELETE /api/quotations/:quoteId/signatures/:signatureId
 * Delete a signature (admin only)
 */
router.delete('/:quoteId/signatures/:signatureId', asyncHandler(async (req, res) => {
  const { quoteId, signatureId } = req.params;

  const result = await pool.query(`
    DELETE FROM quote_signatures
    WHERE id = $1 AND quote_id = $2
    RETURNING signer_name, signature_type
  `, [signatureId, quoteId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Signature');
  }

  // Log the event
  await pool.query(`
    INSERT INTO quote_events (quotation_id, event_type, description, metadata)
    VALUES ($1, 'SIGNATURE_REMOVED', $2, $3)
  `, [
    quoteId,
    `Signature removed: ${result.rows[0].signer_name} (${result.rows[0].signature_type})`,
    JSON.stringify({
      signer_name: result.rows[0].signer_name,
      signature_type: result.rows[0].signature_type
    })
  ]);

  res.success(null, { message: 'Signature deleted successfully' });
}));

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * POST /api/quotations/bulk/status
 * Bulk update status for multiple quotes
 * Body: { quoteIds: number[], status: string }
 */
router.post('/bulk/status', asyncHandler(async (req, res) => {
  const { quoteIds, status } = req.body;

  if (!Array.isArray(quoteIds) || quoteIds.length === 0) {
    throw ApiError.validation('quoteIds must be a non-empty array');
  }

  if (!status) {
    throw ApiError.validation('status is required');
  }

  const validStatuses = ['DRAFT', 'SENT', 'WON', 'LOST', 'PENDING_APPROVAL'];
  if (!validStatuses.includes(status)) {
    throw ApiError.validation(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const results = {
    success: [],
    failed: []
  };

  for (const quoteId of quoteIds) {
    try {
      const result = await pool.query(`
        UPDATE quotations
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, quotation_number
      `, [status, quoteId]);

      if (result.rows.length > 0) {
        results.success.push({
          id: quoteId,
          quotation_number: result.rows[0].quotation_number
        });

        // Log the status change activity
        await pool.query(`
          INSERT INTO quote_events (quotation_id, event_type, description, metadata)
          VALUES ($1, 'STATUS_CHANGED', $2, $3)
        `, [
          quoteId,
          `Status changed to ${status} (bulk action)`,
          JSON.stringify({ new_status: status, bulk_action: true })
        ]);
      } else {
        results.failed.push({ id: quoteId, error: 'Quote not found' });
      }
    } catch (error) {
      results.failed.push({ id: quoteId, error: error.message });
    }
  }

  res.success({
    updated: results.success.length,
    failed: results.failed.length,
    results
  }, {
    message: `Updated ${results.success.length} of ${quoteIds.length} quotes`
  });
}));

/**
 * POST /api/quotations/bulk/extend-expiry
 * Bulk extend expiry date for multiple quotes
 * Body: { quoteIds: number[], days: number }
 */
router.post('/bulk/extend-expiry', asyncHandler(async (req, res) => {
  const { quoteIds, days } = req.body;

  if (!Array.isArray(quoteIds) || quoteIds.length === 0) {
    throw ApiError.validation('quoteIds must be a non-empty array');
  }

  if (!days || ![7, 14, 30, 60, 90].includes(days)) {
    throw ApiError.validation('days must be 7, 14, 30, 60, or 90');
  }

  const results = {
    success: [],
    failed: []
  };

  for (const quoteId of quoteIds) {
    try {
      const result = await pool.query(`
        UPDATE quotations
        SET
          quote_expiry_date = COALESCE(quote_expiry_date, CURRENT_DATE) + INTERVAL '${days} days',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, quotation_number, quote_expiry_date
      `, [quoteId]);

      if (result.rows.length > 0) {
        results.success.push({
          id: quoteId,
          quotation_number: result.rows[0].quotation_number,
          new_expiry: result.rows[0].quote_expiry_date
        });

        // Log the activity
        await pool.query(`
          INSERT INTO quote_events (quotation_id, event_type, description, metadata)
          VALUES ($1, 'UPDATED', $2, $3)
        `, [
          quoteId,
          `Expiry date extended by ${days} days (bulk action)`,
          JSON.stringify({ days_extended: days, new_expiry: result.rows[0].quote_expiry_date, bulk_action: true })
        ]);
      } else {
        results.failed.push({ id: quoteId, error: 'Quote not found' });
      }
    } catch (error) {
      results.failed.push({ id: quoteId, error: error.message });
    }
  }

  res.success({
    updated: results.success.length,
    failed: results.failed.length,
    results
  }, {
    message: `Extended expiry for ${results.success.length} of ${quoteIds.length} quotes`
  });
}));

/**
 * POST /api/quotations/bulk/assign
 * Bulk assign salesperson to multiple quotes
 * Body: { quoteIds: number[], salesRepId: number, salesRepName: string }
 */
router.post('/bulk/assign', asyncHandler(async (req, res) => {
  const { quoteIds, salesRepId, salesRepName } = req.body;

  if (!Array.isArray(quoteIds) || quoteIds.length === 0) {
    throw ApiError.validation('quoteIds must be a non-empty array');
  }

  if (!salesRepId) {
    throw ApiError.validation('salesRepId is required');
  }

  const results = {
    success: [],
    failed: []
  };

  for (const quoteId of quoteIds) {
    try {
      // Update or insert sales rep assignment
      await pool.query(`
        INSERT INTO quote_sales_rep (quote_id, sales_rep_id)
        VALUES ($1, $2)
        ON CONFLICT (quote_id) DO UPDATE SET
          sales_rep_id = EXCLUDED.sales_rep_id,
          updated_at = CURRENT_TIMESTAMP
      `, [quoteId, salesRepId]);

      // Also update the created_by field on the quote for easier filtering
      const result = await pool.query(`
        UPDATE quotations
        SET assigned_to = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, quotation_number
      `, [salesRepName || salesRepId, quoteId]);

      if (result.rows.length > 0) {
        results.success.push({
          id: quoteId,
          quotation_number: result.rows[0].quotation_number
        });

        // Log the activity
        await pool.query(`
          INSERT INTO quote_events (quotation_id, event_type, description, metadata)
          VALUES ($1, 'UPDATED', $2, $3)
        `, [
          quoteId,
          `Assigned to ${salesRepName || 'salesperson'} (bulk action)`,
          JSON.stringify({ sales_rep_id: salesRepId, sales_rep_name: salesRepName, bulk_action: true })
        ]);
      } else {
        results.failed.push({ id: quoteId, error: 'Quote not found' });
      }
    } catch (error) {
      results.failed.push({ id: quoteId, error: error.message });
    }
  }

  res.success({
    updated: results.success.length,
    failed: results.failed.length,
    results
  }, {
    message: `Assigned ${results.success.length} of ${quoteIds.length} quotes`
  });
}));

/**
 * DELETE /api/quotations/bulk
 * Bulk delete multiple quotes
 * Body: { quoteIds: number[] }
 */
router.delete('/bulk', asyncHandler(async (req, res) => {
  const { quoteIds } = req.body;

  if (!Array.isArray(quoteIds) || quoteIds.length === 0) {
    throw ApiError.validation('quoteIds must be a non-empty array');
  }

  const results = {
    success: [],
    failed: []
  };

  for (const quoteId of quoteIds) {
    try {
      // Delete related records first
      await pool.query('DELETE FROM quotation_items WHERE quotation_id = $1', [quoteId]);
      await pool.query('DELETE FROM quote_events WHERE quotation_id = $1', [quoteId]);
      await pool.query('DELETE FROM quote_delivery WHERE quote_id = $1', [quoteId]);
      await pool.query('DELETE FROM quote_warranties WHERE quote_id = $1', [quoteId]);
      await pool.query('DELETE FROM quote_financing WHERE quote_id = $1', [quoteId]);
      await pool.query('DELETE FROM quote_rebates WHERE quote_id = $1', [quoteId]);
      await pool.query('DELETE FROM quote_trade_ins WHERE quote_id = $1', [quoteId]);
      await pool.query('DELETE FROM quote_sales_rep WHERE quote_id = $1', [quoteId]);
      await pool.query('DELETE FROM quote_approvals WHERE quote_id = $1', [quoteId]);

      // Delete the quote
      const result = await pool.query(
        'DELETE FROM quotations WHERE id = $1 RETURNING id, quotation_number',
        [quoteId]
      );

      if (result.rows.length > 0) {
        results.success.push({
          id: quoteId,
          quotation_number: result.rows[0].quotation_number
        });
      } else {
        results.failed.push({ id: quoteId, error: 'Quote not found' });
      }
    } catch (error) {
      results.failed.push({ id: quoteId, error: error.message });
    }
  }

  res.success({
    deleted: results.success.length,
    failed: results.failed.length,
    results
  }, {
    message: `Deleted ${results.success.length} of ${quoteIds.length} quotes`
  });
}));

/**
 * POST /api/quotations/bulk/export
 * Export multiple quotes to CSV
 * Body: { quoteIds: number[] }
 */
router.post('/bulk/export', asyncHandler(async (req, res) => {
  const { quoteIds } = req.body;

  if (!Array.isArray(quoteIds) || quoteIds.length === 0) {
    throw ApiError.validation('quoteIds must be a non-empty array');
  }

  // Fetch all quotes with their items
  const quotesResult = await pool.query(`
    SELECT
      q.id,
      q.quotation_number,
      q.status,
      q.created_at,
      q.updated_at,
      q.quote_expiry_date,
      q.subtotal_cents,
      q.discount_percent,
      q.discount_cents,
      q.tax_rate,
      q.tax_cents,
      q.total_cents,
      q.gross_profit_cents,
      q.notes,
      q.terms,
      q.created_by,
      q.assigned_to,
      c.name as customer_name,
      c.email as customer_email,
      c.phone as customer_phone,
      c.company as customer_company,
      c.address as customer_address
    FROM quotations q
    LEFT JOIN customers c ON q.customer_id = c.id
    WHERE q.id = ANY($1)
    ORDER BY q.created_at DESC
  `, [quoteIds]);

  // Fetch items for all quotes
  const itemsResult = await pool.query(`
    SELECT
      qi.*,
      p.model,
      p.manufacturer,
      p.sku
    FROM quotation_items qi
    LEFT JOIN products p ON qi.product_id = p.id
    WHERE qi.quotation_id = ANY($1)
    ORDER BY qi.quotation_id, qi.id
  `, [quoteIds]);

  // Group items by quote
  const itemsByQuote = {};
  for (const item of itemsResult.rows) {
    if (!itemsByQuote[item.quotation_id]) {
      itemsByQuote[item.quotation_id] = [];
    }
    itemsByQuote[item.quotation_id].push(item);
  }

  // Build CSV rows
  const csvRows = [];

  // Header row
  csvRows.push([
    'Quote Number',
    'Status',
    'Customer Name',
    'Customer Email',
    'Customer Phone',
    'Customer Company',
    'Created Date',
    'Expiry Date',
    'Subtotal',
    'Discount %',
    'Discount Amount',
    'Tax Rate',
    'Tax Amount',
    'Total',
    'Gross Profit',
    'Created By',
    'Assigned To',
    'Item Count',
    'Items (Model - Qty - Price)'
  ].join(','));

  // Data rows
  for (const quote of quotesResult.rows) {
    const items = itemsByQuote[quote.id] || [];
    const itemsSummary = items.map(i =>
      `${i.manufacturer || ''} ${i.model || i.sku || 'Unknown'} x${i.quantity} @$${(i.unit_price_cents / 100).toFixed(2)}`
    ).join('; ');

    const row = [
      `"${quote.quotation_number || ''}"`,
      `"${quote.status || ''}"`,
      `"${(quote.customer_name || '').replace(/"/g, '""')}"`,
      `"${quote.customer_email || ''}"`,
      `"${quote.customer_phone || ''}"`,
      `"${(quote.customer_company || '').replace(/"/g, '""')}"`,
      `"${quote.created_at ? new Date(quote.created_at).toISOString().split('T')[0] : ''}"`,
      `"${quote.quote_expiry_date ? new Date(quote.quote_expiry_date).toISOString().split('T')[0] : ''}"`,
      (quote.subtotal_cents / 100).toFixed(2),
      quote.discount_percent || 0,
      (quote.discount_cents / 100).toFixed(2),
      quote.tax_rate || 13,
      (quote.tax_cents / 100).toFixed(2),
      (quote.total_cents / 100).toFixed(2),
      (quote.gross_profit_cents / 100).toFixed(2),
      `"${(quote.created_by || '').replace(/"/g, '""')}"`,
      `"${(quote.assigned_to || '').replace(/"/g, '""')}"`,
      items.length,
      `"${itemsSummary.replace(/"/g, '""')}"`
    ];

    csvRows.push(row.join(','));
  }

  const csvContent = csvRows.join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="quotes-export-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csvContent);
}));

/**
 * POST /api/quotations/bulk/email
 * Send bulk email to customers of selected quotes
 * Body: { quoteIds: number[], subject: string, message: string, updateStatus: boolean, attachPdf: boolean }
 */
router.post('/bulk/email', asyncHandler(async (req, res) => {
  const { quoteIds, subject, message, updateStatus = true, attachPdf = false } = req.body;

  if (!Array.isArray(quoteIds) || quoteIds.length === 0) {
    throw ApiError.validation('quoteIds must be a non-empty array');
  }

  if (!subject || !message) {
    throw ApiError.validation('Subject and message are required');
  }

  // Get quote and customer details
  const quotesResult = await pool.query(`
    SELECT
      q.id,
      q.quotation_number,
      q.total_cents,
      q.status,
      c.name as customer_name,
      c.email as customer_email,
      c.company as customer_company
    FROM quotations q
    LEFT JOIN customers c ON q.customer_id = c.id
    WHERE q.id = ANY($1)
  `, [quoteIds]);

  const results = {
    success: [],
    failed: [],
    skipped: []
  };

  // Check if SES is configured
  const sesConfigured = process.env.AWS_ACCESS_KEY_ID &&
                        process.env.AWS_SECRET_ACCESS_KEY &&
                        process.env.EMAIL_FROM;

  if (!sesConfigured) {
    throw ApiError.validation('Email service not configured. Please set up AWS SES credentials.');
  }

  // Import SES client and PDF service
  const { SESv2Client, SendEmailCommand, SendRawEmailCommand } = require('@aws-sdk/client-sesv2');
  const PdfService = require('../services/PdfService');
  const pdfService = new PdfService(pool);

  const sesClient = new SESv2Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  for (const quote of quotesResult.rows) {
    // Skip if no customer email
    if (!quote.customer_email) {
      results.skipped.push({
        id: quote.id,
        quotation_number: quote.quotation_number,
        reason: 'No customer email'
      });
      continue;
    }

    try {
      // Personalize message with merge fields
      const personalizedMessage = message
        .replace(/\{customer_name\}/gi, quote.customer_name || 'Valued Customer')
        .replace(/\{quote_number\}/gi, quote.quotation_number || '')
        .replace(/\{company\}/gi, quote.customer_company || '')
        .replace(/\{total\}/gi, `$${((quote.total_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

      const personalizedSubject = subject
        .replace(/\{customer_name\}/gi, quote.customer_name || 'Valued Customer')
        .replace(/\{quote_number\}/gi, quote.quotation_number || '')
        .replace(/\{company\}/gi, quote.customer_company || '');

      // Build HTML email
      const emailHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
            .quote-info { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #e5e7eb; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
            .attachment-note { background: #dbeafe; color: #1d4ed8; padding: 10px; border-radius: 6px; margin-top: 15px; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Quote ${quote.quotation_number}</h1>
            </div>
            <div class="content">
              <p>Dear ${quote.customer_name || 'Valued Customer'},</p>
              <div style="white-space: pre-wrap;">${personalizedMessage}</div>
              <div class="quote-info">
                <strong>Quote Reference:</strong> ${quote.quotation_number}<br>
                <strong>Total Amount:</strong> $${((quote.total_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              ${attachPdf ? '<div class="attachment-note">📎 Your detailed quote is attached as a PDF document.</div>' : ''}
            </div>
            <div class="footer">
              <p>Thank you for your business!</p>
            </div>
          </div>
        </body>
        </html>
      `;

      if (attachPdf) {
        // Generate PDF and send as attachment using raw email
        let pdfBuffer;
        try {
          pdfBuffer = await pdfService.generateQuotePdf(quote.id, { type: 'customer' });
        } catch (pdfError) {
          console.error(`Error generating PDF for quote ${quote.id}:`, pdfError);
          // Continue without PDF attachment
          pdfBuffer = null;
        }

        if (pdfBuffer) {
          // Build MIME email with attachment
          const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const pdfFilename = `Quote_${quote.quotation_number || quote.id}.pdf`;

          const rawMessage = [
            `From: ${process.env.EMAIL_FROM}`,
            `To: ${quote.customer_email}`,
            `Subject: ${personalizedSubject}`,
            'MIME-Version: 1.0',
            `Content-Type: multipart/mixed; boundary="${boundary}"`,
            '',
            `--${boundary}`,
            'Content-Type: multipart/alternative; boundary="alt_boundary"',
            '',
            '--alt_boundary',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 7bit',
            '',
            personalizedMessage.replace(/<[^>]*>/g, ''),
            '',
            '--alt_boundary',
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: 7bit',
            '',
            emailHTML,
            '',
            '--alt_boundary--',
            '',
            `--${boundary}`,
            `Content-Type: application/pdf; name="${pdfFilename}"`,
            'Content-Transfer-Encoding: base64',
            `Content-Disposition: attachment; filename="${pdfFilename}"`,
            '',
            pdfBuffer.toString('base64').match(/.{1,76}/g).join('\r\n'),
            '',
            `--${boundary}--`
          ].join('\r\n');

          const sendCommand = new SendRawEmailCommand({
            FromEmailAddress: process.env.EMAIL_FROM,
            Destinations: [quote.customer_email],
            Content: { Raw: { Data: Buffer.from(rawMessage) } }
          });

          await sesClient.send(sendCommand);
        } else {
          // Fallback to simple email without attachment
          const command = new SendEmailCommand({
            FromEmailAddress: process.env.EMAIL_FROM,
            Destination: { ToAddresses: [quote.customer_email] },
            Content: {
              Simple: {
                Subject: { Data: personalizedSubject },
                Body: { Html: { Data: emailHTML } }
              }
            }
          });
          await sesClient.send(command);
        }
      } else {
        // Send simple email without attachment
        const command = new SendEmailCommand({
          FromEmailAddress: process.env.EMAIL_FROM,
          Destination: { ToAddresses: [quote.customer_email] },
          Content: {
            Simple: {
              Subject: { Data: personalizedSubject },
              Body: { Html: { Data: emailHTML } }
            }
          }
        });
        await sesClient.send(command);
      }

      // Update quote status if requested
      if (updateStatus && quote.status === 'DRAFT') {
        await pool.query(`
          UPDATE quotations
          SET status = 'SENT', sent_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [quote.id]);
      }

      // Log the activity
      await pool.query(`
        INSERT INTO quote_events (quotation_id, event_type, description, metadata)
        VALUES ($1, 'EMAIL_SENT', $2, $3)
      `, [
        quote.id,
        `Email sent to ${quote.customer_email}${attachPdf ? ' with PDF attachment' : ''} (bulk action)`,
        JSON.stringify({
          recipient: quote.customer_email,
          subject: personalizedSubject,
          has_pdf_attachment: attachPdf,
          bulk_action: true
        })
      ]);

      results.success.push({
        id: quote.id,
        quotation_number: quote.quotation_number,
        sent_to: quote.customer_email,
        pdf_attached: attachPdf
      });
    } catch (error) {
      console.error(`Error sending email for quote ${quote.id}:`, error);
      results.failed.push({
        id: quote.id,
        quotation_number: quote.quotation_number,
        error: error.message
      });
    }
  }

  res.success({
    sent: results.success.length,
    failed: results.failed.length,
    skipped: results.skipped.length,
    results
  }, {
    message: `Sent ${results.success.length} emails${attachPdf ? ' with PDF attachments' : ''}, ${results.failed.length} failed, ${results.skipped.length} skipped`
  });
}));

module.exports = { router, init };
