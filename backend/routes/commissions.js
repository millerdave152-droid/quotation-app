/**
 * Commission Routes
 * API endpoints for commission calculation and management
 */

const express = require('express');
const { requireRole } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

/**
 * Initialize commission routes
 * @param {object} deps - Dependencies
 * @param {object} deps.commissionService - CommissionService instance
 * @returns {express.Router}
 */
function init({ commissionService, pool }) {
  const router = express.Router();
  const isManagerOrAdmin = (req) => {
    const role = req.user?.role?.toLowerCase();
    return role === 'admin' || role === 'manager';
  };

  // ============================================
  // COMMISSION CALCULATION
  // ============================================

  /**
   * POST /api/commissions/calculate/order/:orderId
   * Calculate commission for a completed order
   */
  router.post('/calculate/order/:orderId', asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const requestedSalesRepId = req.body.salesRepId;
    const userId = req.user?.id;
    if (!userId) {
      throw ApiError.unauthorized('Authentication required');
    }

    let salesRepId = userId;
    if (requestedSalesRepId && parseInt(requestedSalesRepId, 10) !== userId) {
      if (!isManagerOrAdmin(req)) {
        throw ApiError.forbidden('Access denied. Insufficient permissions.');
      }
      salesRepId = parseInt(requestedSalesRepId, 10);
    }

    if (!salesRepId) {
      throw ApiError.badRequest('Sales rep ID required');
    }

    const commission = await commissionService.calculateOrderCommission(
      parseInt(orderId, 10),
      parseInt(salesRepId, 10)
    );

    res.json({
      success: true,
      data: commission,
    });
  }));

  /**
   * POST /api/commissions/calculate/cart
   * Preview commission for a cart (before sale completes)
   * Body: { cart, salesRepId }
   */
  router.post('/calculate/cart', asyncHandler(async (req, res) => {
    const { cart, salesRepId } = req.body;
    const userId = req.user?.id;
    if (!userId) {
      throw ApiError.unauthorized('Authentication required');
    }

    let repId = userId;
    if (salesRepId && parseInt(salesRepId, 10) !== userId) {
      if (!isManagerOrAdmin(req)) {
        throw ApiError.forbidden('Access denied. Insufficient permissions.');
      }
      repId = parseInt(salesRepId, 10);
    }

    if (!cart || !cart.items) {
      throw ApiError.badRequest('Cart with items required');
    }

    if (!repId) {
      throw ApiError.badRequest('Sales rep ID required');
    }

    const commission = await commissionService.calculateCartCommission(
      cart,
      parseInt(repId, 10)
    );

    res.json({
      success: true,
      data: commission,
    });
  }));

  /**
   * POST /api/commissions/record/:orderId
   * Record commission for a completed order
   */
  router.post('/record/:orderId', asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const requestedSalesRepId = req.body.salesRepId;
    const userId = req.user?.id;
    if (!userId) {
      throw ApiError.unauthorized('Authentication required');
    }

    let salesRepId = userId;
    if (requestedSalesRepId && parseInt(requestedSalesRepId, 10) !== userId) {
      if (!isManagerOrAdmin(req)) {
        throw ApiError.forbidden('Access denied. Insufficient permissions.');
      }
      salesRepId = parseInt(requestedSalesRepId, 10);
    }

    if (!salesRepId) {
      throw ApiError.badRequest('Sales rep ID required');
    }

    const result = await commissionService.recordCommission(
      parseInt(orderId, 10),
      parseInt(salesRepId, 10)
    );

    res.json({
      success: true,
      data: result,
    });
  }));

  // ============================================
  // COMMISSION SUMMARY (for logout/shift-close)
  // ============================================

  /**
   * GET /api/commissions/summary
   * Get today + pay period commission summary for the logged-in user
   */
  router.get('/summary', asyncHandler(async (req, res) => {
    const salesRepId = req.user?.id;
    if (!salesRepId) {
      throw ApiError.unauthorized('Authentication required');
    }

    const summary = await commissionService.getCommissionSummary(salesRepId);
    res.json({ success: true, data: summary });
  }));

  /**
   * GET /api/commissions/summary/:userId
   * Get commission summary for a specific user (admin/manager)
   */
  router.get('/summary/:userId', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    const summary = await commissionService.getCommissionSummary(userId);
    res.json({ success: true, data: summary });
  }));

  // ============================================
  // COMMISSION REPORTS
  // ============================================

  /**
   * GET /api/commissions/my
   * Get current user's commission earnings
   * Query: startDate, endDate
   */
  router.get('/my', asyncHandler(async (req, res) => {
    const salesRepId = req.user?.id;

    if (!salesRepId) {
      throw ApiError.unauthorized('Authentication required');
    }

    const { startDate, endDate } = req.query;

    const report = await commissionService.getRepCommissions(
      salesRepId,
      { startDate, endDate }
    );

    res.json({
      success: true,
      data: report,
    });
  }));

  /**
   * GET /api/commissions/rep/:repId
   * Get commission earnings for a specific rep (admin/manager only)
   * Query: startDate, endDate
   */
  router.get('/rep/:repId', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
    const { repId } = req.params;
    const { startDate, endDate } = req.query;

    const report = await commissionService.getRepCommissions(
      parseInt(repId, 10),
      { startDate, endDate }
    );

    res.json({
      success: true,
      data: report,
    });
  }));

  /**
   * GET /api/commissions/order/:orderId
   * Get commissions recorded for a specific order
   */
  router.get('/order/:orderId', asyncHandler(async (req, res) => {
    const { orderId } = req.params;

    const result = await commissionService.getOrderCommissions(
      parseInt(orderId, 10)
    );

    res.json({
      success: true,
      data: result,
    });
  }));

  /**
   * GET /api/commissions/leaderboard
   * Get commission leaderboard
   * Query: period (today, week, month, quarter, year)
   */
  router.get('/leaderboard', asyncHandler(async (req, res) => {
    const { period = 'month' } = req.query;

    const leaderboard = await commissionService.getLeaderboard(period);

    res.json({
      success: true,
      data: leaderboard,
      period,
    });
  }));

  /**
   * GET /api/commissions/stats
   * Get overall commission statistics (admin)
   * Query: startDate, endDate
   */
  router.get('/stats', asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;

    const stats = await commissionService.getCommissionStats({ startDate, endDate });

    res.json({
      success: true,
      data: stats,
    });
  }));

  // ============================================
  // COMMISSION RULES MANAGEMENT
  // ============================================

  /**
   * GET /api/commissions/rules
   * Get all commission rules
   * Query: includeInactive (default: false)
   */
  router.get('/rules', asyncHandler(async (req, res) => {
    const { includeInactive } = req.query;

    let rules;
    if (includeInactive === 'true') {
      // Get all rules including inactive
      const { rows } = await commissionService.pool.query(`
        SELECT cr.*, pc.name AS category_name
        FROM commission_rules cr
        LEFT JOIN product_categories pc ON pc.id = cr.category_id
        ORDER BY cr.priority ASC, cr.id ASC
      `);
      rules = rows.map(r => commissionService.formatRule(r));
    } else {
      rules = await commissionService.getActiveRules();
    }

    res.json({
      success: true,
      data: rules,
    });
  }));

  /**
   * GET /api/commissions/rules/:id
   * Get a specific commission rule
   */
  router.get('/rules/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { rows } = await commissionService.pool.query(`
      SELECT cr.*, pc.name AS category_name
      FROM commission_rules cr
      LEFT JOIN product_categories pc ON pc.id = cr.category_id
      WHERE cr.id = $1
    `, [id]);

    if (rows.length === 0) {
      throw ApiError.notFound('Rule');
    }

    // Get tiers if tiered rule
    let tiers = null;
    if (rows[0].rule_type === 'tiered') {
      tiers = await commissionService.getCommissionTiers(parseInt(id, 10));
    }

    res.json({
      success: true,
      data: {
        ...commissionService.formatRule(rows[0]),
        tiers,
      },
    });
  }));

  /**
   * POST /api/commissions/rules
   * Create a new commission rule
   */
  router.post('/rules', asyncHandler(async (req, res) => {
    const ruleData = {
      ...req.body,
      createdBy: req.user?.id,
    };

    const rule = await commissionService.createRule(ruleData);

    res.status(201).json({
      success: true,
      data: rule,
    });
  }));

  /**
   * PUT /api/commissions/rules/:id
   * Update a commission rule
   */
  router.put('/rules/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const rule = await commissionService.updateRule(
      parseInt(id, 10),
      req.body
    );

    if (!rule) {
      throw ApiError.notFound('Rule');
    }

    res.json({
      success: true,
      data: rule,
    });
  }));

  /**
   * DELETE /api/commissions/rules/:id
   * Delete (deactivate) a commission rule
   */
  router.delete('/rules/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    await commissionService.deleteRule(parseInt(id, 10));

    res.json({
      success: true,
      message: 'Rule deactivated',
    });
  }));

  // ============================================
  // TEAM REPORTING (Manager Only)
  // ============================================

  /**
   * GET /api/commissions/team
   * Get commission summary for all reps (manager only)
   * Query: startDate, endDate
   */
  router.get('/team', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;

    const report = await commissionService.getTeamCommissions({ startDate, endDate });

    res.json({
      success: true,
      data: report,
    });
  }));

  /**
   * GET /api/commissions/rep/:repId/detailed
   * Get detailed commission data for a specific rep (manager only)
   * Query: startDate, endDate
   */
  router.get('/rep/:repId/detailed', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
    const { repId } = req.params;
    const { startDate, endDate } = req.query;

    const report = await commissionService.getRepDetailedCommissions(
      parseInt(repId, 10),
      { startDate, endDate }
    );

    res.json({
      success: true,
      data: report,
    });
  }));

  // ============================================
  // CSV EXPORT
  // ============================================

  /**
   * GET /api/commissions/export
   * Export commissions to CSV
   * Query: startDate, endDate, repId (optional), format (csv)
   */
  router.get('/export', asyncHandler(async (req, res) => {
    const { startDate, endDate, repId, format = 'csv' } = req.query;

    if (format !== 'csv') {
      throw ApiError.badRequest('Only CSV format is supported');
    }

    const csv = await commissionService.generateCSVExport({
      repId: repId ? parseInt(repId, 10) : null,
      startDate,
      endDate,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${csv.filename}"`);
    res.send(csv.content);
  }));

  // ============================================
  // PAYROLL / PAYOUTS
  // ============================================

  /**
   * GET /api/commissions/payroll/summary
   * Get payroll summary for a period
   * Query: periodStart, periodEnd
   */
  router.get('/payroll/summary', asyncHandler(async (req, res) => {
    const { periodStart, periodEnd } = req.query;

    if (!periodStart || !periodEnd) {
      throw ApiError.badRequest('Period start and end dates required');
    }

    const summary = await commissionService.getPayrollSummary(periodStart, periodEnd);

    res.json({
      success: true,
      data: summary,
      period: { start: periodStart, end: periodEnd },
    });
  }));

  /**
   * POST /api/commissions/payouts
   * Create a payout record
   */
  router.post('/payouts', asyncHandler(async (req, res) => {
    const { repId, periodStart, periodEnd, adjustmentsCents, notes } = req.body;

    if (!repId || !periodStart || !periodEnd) {
      throw ApiError.badRequest('Rep ID and period dates required');
    }

    const payout = await commissionService.createPayout(
      repId,
      periodStart,
      periodEnd,
      adjustmentsCents || 0,
      notes || ''
    );

    res.status(201).json({
      success: true,
      data: payout,
    });
  }));

  /**
   * GET /api/commissions/payouts/pending
   * Get pending payouts awaiting approval
   */
  router.get('/payouts/pending', asyncHandler(async (req, res) => {
    const payouts = await commissionService.getPendingPayouts();

    res.json({
      success: true,
      data: payouts,
    });
  }));

  /**
   * POST /api/commissions/payouts/:id/approve
   * Approve a payout (manager action)
   */
  router.post('/payouts/:id/approve', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const approverId = req.user?.id;

    if (!approverId) {
      throw ApiError.unauthorized('Authentication required');
    }

    const payout = await commissionService.approvePayout(parseInt(id, 10), approverId);

    if (!payout) {
      throw ApiError.notFound('Payout not found or already processed');
    }

    res.json({
      success: true,
      data: payout,
    });
  }));

  /**
   * POST /api/commissions/payouts/:id/paid
   * Mark a payout as paid
   */
  router.post('/payouts/:id/paid', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { paymentReference } = req.body;

    const payout = await commissionService.markPayoutPaid(
      parseInt(id, 10),
      paymentReference || ''
    );

    if (!payout) {
      throw ApiError.notFound('Payout not found or not approved');
    }

    res.json({
      success: true,
      data: payout,
    });
  }));

  /**
   * POST /api/commissions/adjustments
   * Add an adjustment (e.g., chargeback for return)
   */
  router.post('/adjustments', asyncHandler(async (req, res) => {
    const { orderId, repId, adjustmentCents, reason } = req.body;

    if (!repId || !adjustmentCents || !reason) {
      throw ApiError.badRequest('Rep ID, adjustment amount, and reason required');
    }

    const adjustment = await commissionService.addAdjustment(
      orderId,
      repId,
      adjustmentCents,
      reason
    );

    res.status(201).json({
      success: true,
      data: adjustment,
    });
  }));

  // ============================================
  // REP SETTINGS
  // ============================================

  /**
   * GET /api/commissions/settings/:repId
   * Get commission settings for a sales rep
   */
  router.get('/settings/:repId', asyncHandler(async (req, res) => {
    const { repId } = req.params;

    const settings = await commissionService.getRepSettings(parseInt(repId, 10));

    res.json({
      success: true,
      data: settings || { defaults: true },
    });
  }));

  /**
   * PUT /api/commissions/settings/:repId
   * Update commission settings for a sales rep
   */
  router.put('/settings/:repId', asyncHandler(async (req, res) => {
    const { repId } = req.params;
    const {
      baseRateOverride,
      warrantyBonusOverride,
      monthlyTarget,
      quarterlyTarget,
      acceleratorRate,
      acceleratorThreshold,
    } = req.body;

    // Upsert settings
    const { rows } = await commissionService.pool.query(`
      INSERT INTO sales_rep_commission_settings (
        user_id, base_rate_override, warranty_bonus_override,
        monthly_target_cents, quarterly_target_cents,
        accelerator_rate, accelerator_threshold
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id) DO UPDATE SET
        base_rate_override = EXCLUDED.base_rate_override,
        warranty_bonus_override = EXCLUDED.warranty_bonus_override,
        monthly_target_cents = EXCLUDED.monthly_target_cents,
        quarterly_target_cents = EXCLUDED.quarterly_target_cents,
        accelerator_rate = EXCLUDED.accelerator_rate,
        accelerator_threshold = EXCLUDED.accelerator_threshold,
        updated_at = NOW()
      RETURNING *
    `, [
      repId,
      baseRateOverride,
      warrantyBonusOverride,
      monthlyTarget ? Math.round(monthlyTarget * 100) : null,
      quarterlyTarget ? Math.round(quarterlyTarget * 100) : null,
      acceleratorRate,
      acceleratorThreshold || 1.0,
    ]);

    res.json({
      success: true,
      data: rows[0],
    });
  }));

  // ============================================
  // COMMISSION SPLITS
  // ============================================

  /**
   * POST /api/commissions/splits/:transactionId
   * Create or replace commission splits for a transaction
   * Body: { splits: [{ userId, splitPercentage, role }] }
   */
  router.post('/splits/:transactionId', asyncHandler(async (req, res) => {
    const transactionId = parseInt(req.params.transactionId, 10);
    const { splits } = req.body;

    if (!splits || !Array.isArray(splits) || splits.length === 0) {
      throw ApiError.badRequest('splits array is required');
    }

    // Validate percentages sum to 100
    const totalPercent = splits.reduce((sum, s) => sum + Number(s.splitPercentage), 0);
    if (Math.abs(totalPercent - 100) > 0.01) {
      throw ApiError.badRequest(`Split percentages must total 100% (got ${totalPercent.toFixed(2)}%)`);
    }

    // Validate each split has a valid user
    for (const split of splits) {
      if (!split.userId || !split.splitPercentage) {
        throw ApiError.badRequest('Each split requires userId and splitPercentage');
      }
    }

    // Verify transaction exists and get total
    const txResult = await pool.query(
      'SELECT transaction_id, total_amount FROM transactions WHERE transaction_id = $1',
      [transactionId]
    );
    if (txResult.rows.length === 0) {
      throw ApiError.notFound('Transaction');
    }

    const totalCents = Math.round(Number(txResult.rows[0].total_amount) * 100);

    // Calculate commission for the full order to know the pool to split
    let totalCommissionCents = 0;
    try {
      const commData = await commissionService.calculateOrderCommission(transactionId, splits[0].userId);
      totalCommissionCents = Math.round((commData.totalCommission || 0) * 100);
    } catch {
      // Fallback: use a default 3% rate
      totalCommissionCents = Math.round(totalCents * 0.03);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Remove existing splits for this transaction
      await client.query('DELETE FROM order_commission_splits WHERE transaction_id = $1', [transactionId]);

      const inserted = [];
      let remainderCents = totalCommissionCents;

      for (let i = 0; i < splits.length; i++) {
        const s = splits[i];
        // Last split gets remainder to avoid rounding drift
        const commissionCents = i === splits.length - 1
          ? remainderCents
          : Math.round(totalCommissionCents * (Number(s.splitPercentage) / 100));
        remainderCents -= commissionCents;

        const result = await client.query(
          `INSERT INTO order_commission_splits
            (transaction_id, user_id, split_percentage, commission_amount_cents, role, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')
           RETURNING *`,
          [transactionId, s.userId, s.splitPercentage, commissionCents, s.role || (i === 0 ? 'primary' : 'secondary')]
        );
        inserted.push(result.rows[0]);
      }

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        data: {
          transactionId,
          totalCommissionCents,
          splits: inserted,
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
   * GET /api/commissions/splits/:transactionId
   * Get commission splits for a transaction
   */
  router.get('/splits/:transactionId', asyncHandler(async (req, res) => {
    const transactionId = parseInt(req.params.transactionId, 10);

    const result = await pool.query(
      `SELECT ocs.*, u.first_name, u.last_name, u.email
       FROM order_commission_splits ocs
       JOIN users u ON ocs.user_id = u.id
       WHERE ocs.transaction_id = $1
       ORDER BY ocs.split_percentage DESC`,
      [transactionId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  }));

  /**
   * POST /api/commissions/splits/preview
   * Preview commission split amounts without saving
   * Body: { totalAmountCents, splits: [{ userId, splitPercentage }] }
   */
  router.post('/splits/preview', asyncHandler(async (req, res) => {
    const { totalAmountCents, splits, cart } = req.body;

    if (!splits || splits.length === 0) {
      throw ApiError.badRequest('splits array required');
    }

    // Calculate base commission from cart if provided, or use default 3%
    let baseCommissionCents = 0;
    if (cart && cart.items && splits[0]?.userId) {
      try {
        const commData = await commissionService.calculateCartCommission(cart, splits[0].userId);
        baseCommissionCents = Math.round((commData.totalCommission || 0) * 100);
      } catch {
        baseCommissionCents = Math.round((totalAmountCents || 0) * 0.03);
      }
    } else {
      baseCommissionCents = Math.round((totalAmountCents || 0) * 0.03);
    }

    const previews = splits.map((s, i) => {
      const pct = Number(s.splitPercentage);
      return {
        userId: s.userId,
        splitPercentage: pct,
        commissionAmountCents: i === splits.length - 1
          ? baseCommissionCents - splits.slice(0, -1).reduce(
              (sum, sp) => sum + Math.round(baseCommissionCents * (Number(sp.splitPercentage) / 100)), 0
            )
          : Math.round(baseCommissionCents * (pct / 100)),
      };
    });

    res.json({
      success: true,
      data: {
        baseCommissionCents,
        splits: previews,
      },
    });
  }));

  return router;
}

module.exports = { init };
