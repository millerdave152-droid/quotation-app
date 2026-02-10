/**
 * Commission Routes
 * API endpoints for commission calculation and management
 */

const express = require('express');
const { requireRole } = require('../middleware/auth');

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
  router.post('/calculate/order/:orderId', async (req, res) => {
    try {
      const { orderId } = req.params;
      const requestedSalesRepId = req.body.salesRepId;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      let salesRepId = userId;
      if (requestedSalesRepId && parseInt(requestedSalesRepId, 10) !== userId) {
        if (!isManagerOrAdmin(req)) {
          return res.status(403).json({
            success: false,
            error: 'Access denied. Insufficient permissions.',
          });
        }
        salesRepId = parseInt(requestedSalesRepId, 10);
      }

      if (!salesRepId) {
        return res.status(400).json({
          success: false,
          error: 'Sales rep ID required',
        });
      }

      const commission = await commissionService.calculateOrderCommission(
        parseInt(orderId, 10),
        parseInt(salesRepId, 10)
      );

      res.json({
        success: true,
        data: commission,
      });
    } catch (error) {
      console.error('[Commissions] Calculate order commission error:', error);
      res.status(error.message === 'Order not found' ? 404 : 500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/commissions/calculate/cart
   * Preview commission for a cart (before sale completes)
   * Body: { cart, salesRepId }
   */
  router.post('/calculate/cart', async (req, res) => {
    try {
      const { cart, salesRepId } = req.body;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      let repId = userId;
      if (salesRepId && parseInt(salesRepId, 10) !== userId) {
        if (!isManagerOrAdmin(req)) {
          return res.status(403).json({
            success: false,
            error: 'Access denied. Insufficient permissions.',
          });
        }
        repId = parseInt(salesRepId, 10);
      }

      if (!cart || !cart.items) {
        return res.status(400).json({
          success: false,
          error: 'Cart with items required',
        });
      }

      if (!repId) {
        return res.status(400).json({
          success: false,
          error: 'Sales rep ID required',
        });
      }

      const commission = await commissionService.calculateCartCommission(
        cart,
        parseInt(repId, 10)
      );

      res.json({
        success: true,
        data: commission,
      });
    } catch (error) {
      console.error('[Commissions] Calculate cart commission error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/commissions/record/:orderId
   * Record commission for a completed order
   */
  router.post('/record/:orderId', async (req, res) => {
    try {
      const { orderId } = req.params;
      const requestedSalesRepId = req.body.salesRepId;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      let salesRepId = userId;
      if (requestedSalesRepId && parseInt(requestedSalesRepId, 10) !== userId) {
        if (!isManagerOrAdmin(req)) {
          return res.status(403).json({
            success: false,
            error: 'Access denied. Insufficient permissions.',
          });
        }
        salesRepId = parseInt(requestedSalesRepId, 10);
      }

      if (!salesRepId) {
        return res.status(400).json({
          success: false,
          error: 'Sales rep ID required',
        });
      }

      const result = await commissionService.recordCommission(
        parseInt(orderId, 10),
        parseInt(salesRepId, 10)
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[Commissions] Record commission error:', error);
      res.status(error.message === 'Order not found' ? 404 : 500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================
  // COMMISSION SUMMARY (for logout/shift-close)
  // ============================================

  /**
   * GET /api/commissions/summary
   * Get today + pay period commission summary for the logged-in user
   */
  router.get('/summary', async (req, res) => {
    try {
      const salesRepId = req.user?.id;
      if (!salesRepId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const summary = await commissionService.getCommissionSummary(salesRepId);
      res.json({ success: true, data: summary });
    } catch (error) {
      console.error('[Commissions] Get summary error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/commissions/summary/:userId
   * Get commission summary for a specific user (admin/manager)
   */
  router.get('/summary/:userId', requireRole('admin', 'manager'), async (req, res) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      const summary = await commissionService.getCommissionSummary(userId);
      res.json({ success: true, data: summary });
    } catch (error) {
      console.error('[Commissions] Get user summary error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // COMMISSION REPORTS
  // ============================================

  /**
   * GET /api/commissions/my
   * Get current user's commission earnings
   * Query: startDate, endDate
   */
  router.get('/my', async (req, res) => {
    try {
      const salesRepId = req.user?.id;

      if (!salesRepId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
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
    } catch (error) {
      console.error('[Commissions] Get my commissions error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/commissions/rep/:repId
   * Get commission earnings for a specific rep (admin/manager only)
   * Query: startDate, endDate
   */
  router.get('/rep/:repId', requireRole('admin', 'manager'), async (req, res) => {
    try {
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
    } catch (error) {
      console.error('[Commissions] Get rep commissions error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/commissions/order/:orderId
   * Get commissions recorded for a specific order
   */
  router.get('/order/:orderId', async (req, res) => {
    try {
      const { orderId } = req.params;

      const result = await commissionService.getOrderCommissions(
        parseInt(orderId, 10)
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[Commissions] Get order commissions error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/commissions/leaderboard
   * Get commission leaderboard
   * Query: period (today, week, month, quarter, year)
   */
  router.get('/leaderboard', async (req, res) => {
    try {
      const { period = 'month' } = req.query;

      const leaderboard = await commissionService.getLeaderboard(period);

      res.json({
        success: true,
        data: leaderboard,
        period,
      });
    } catch (error) {
      console.error('[Commissions] Get leaderboard error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/commissions/stats
   * Get overall commission statistics (admin)
   * Query: startDate, endDate
   */
  router.get('/stats', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const stats = await commissionService.getCommissionStats({ startDate, endDate });

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('[Commissions] Get stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================
  // COMMISSION RULES MANAGEMENT
  // ============================================

  /**
   * GET /api/commissions/rules
   * Get all commission rules
   * Query: includeInactive (default: false)
   */
  router.get('/rules', async (req, res) => {
    try {
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
    } catch (error) {
      console.error('[Commissions] Get rules error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/commissions/rules/:id
   * Get a specific commission rule
   */
  router.get('/rules/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const { rows } = await commissionService.pool.query(`
        SELECT cr.*, pc.name AS category_name
        FROM commission_rules cr
        LEFT JOIN product_categories pc ON pc.id = cr.category_id
        WHERE cr.id = $1
      `, [id]);

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Rule not found',
        });
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
    } catch (error) {
      console.error('[Commissions] Get rule error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/commissions/rules
   * Create a new commission rule
   */
  router.post('/rules', async (req, res) => {
    try {
      const ruleData = {
        ...req.body,
        createdBy: req.user?.id,
      };

      const rule = await commissionService.createRule(ruleData);

      res.status(201).json({
        success: true,
        data: rule,
      });
    } catch (error) {
      console.error('[Commissions] Create rule error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * PUT /api/commissions/rules/:id
   * Update a commission rule
   */
  router.put('/rules/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const rule = await commissionService.updateRule(
        parseInt(id, 10),
        req.body
      );

      if (!rule) {
        return res.status(404).json({
          success: false,
          error: 'Rule not found',
        });
      }

      res.json({
        success: true,
        data: rule,
      });
    } catch (error) {
      console.error('[Commissions] Update rule error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * DELETE /api/commissions/rules/:id
   * Delete (deactivate) a commission rule
   */
  router.delete('/rules/:id', async (req, res) => {
    try {
      const { id } = req.params;

      await commissionService.deleteRule(parseInt(id, 10));

      res.json({
        success: true,
        message: 'Rule deactivated',
      });
    } catch (error) {
      console.error('[Commissions] Delete rule error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================
  // TEAM REPORTING (Manager Only)
  // ============================================

  /**
   * GET /api/commissions/team
   * Get commission summary for all reps (manager only)
   * Query: startDate, endDate
   */
  router.get('/team', requireRole('admin', 'manager'), async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const report = await commissionService.getTeamCommissions({ startDate, endDate });

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      console.error('[Commissions] Get team commissions error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/commissions/rep/:repId/detailed
   * Get detailed commission data for a specific rep (manager only)
   * Query: startDate, endDate
   */
  router.get('/rep/:repId/detailed', requireRole('admin', 'manager'), async (req, res) => {
    try {
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
    } catch (error) {
      console.error('[Commissions] Get rep detailed commissions error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================
  // CSV EXPORT
  // ============================================

  /**
   * GET /api/commissions/export
   * Export commissions to CSV
   * Query: startDate, endDate, repId (optional), format (csv)
   */
  router.get('/export', async (req, res) => {
    try {
      const { startDate, endDate, repId, format = 'csv' } = req.query;

      if (format !== 'csv') {
        return res.status(400).json({
          success: false,
          error: 'Only CSV format is supported',
        });
      }

      const csv = await commissionService.generateCSVExport({
        repId: repId ? parseInt(repId, 10) : null,
        startDate,
        endDate,
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${csv.filename}"`);
      res.send(csv.content);
    } catch (error) {
      console.error('[Commissions] Export error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================
  // PAYROLL / PAYOUTS
  // ============================================

  /**
   * GET /api/commissions/payroll/summary
   * Get payroll summary for a period
   * Query: periodStart, periodEnd
   */
  router.get('/payroll/summary', async (req, res) => {
    try {
      const { periodStart, periodEnd } = req.query;

      if (!periodStart || !periodEnd) {
        return res.status(400).json({
          success: false,
          error: 'Period start and end dates required',
        });
      }

      const summary = await commissionService.getPayrollSummary(periodStart, periodEnd);

      res.json({
        success: true,
        data: summary,
        period: { start: periodStart, end: periodEnd },
      });
    } catch (error) {
      console.error('[Commissions] Get payroll summary error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/commissions/payouts
   * Create a payout record
   */
  router.post('/payouts', async (req, res) => {
    try {
      const { repId, periodStart, periodEnd, adjustmentsCents, notes } = req.body;

      if (!repId || !periodStart || !periodEnd) {
        return res.status(400).json({
          success: false,
          error: 'Rep ID and period dates required',
        });
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
    } catch (error) {
      console.error('[Commissions] Create payout error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/commissions/payouts/pending
   * Get pending payouts awaiting approval
   */
  router.get('/payouts/pending', async (req, res) => {
    try {
      const payouts = await commissionService.getPendingPayouts();

      res.json({
        success: true,
        data: payouts,
      });
    } catch (error) {
      console.error('[Commissions] Get pending payouts error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/commissions/payouts/:id/approve
   * Approve a payout (manager action)
   */
  router.post('/payouts/:id/approve', async (req, res) => {
    try {
      const { id } = req.params;
      const approverId = req.user?.id;

      if (!approverId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      const payout = await commissionService.approvePayout(parseInt(id, 10), approverId);

      if (!payout) {
        return res.status(404).json({
          success: false,
          error: 'Payout not found or already processed',
        });
      }

      res.json({
        success: true,
        data: payout,
      });
    } catch (error) {
      console.error('[Commissions] Approve payout error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/commissions/payouts/:id/paid
   * Mark a payout as paid
   */
  router.post('/payouts/:id/paid', async (req, res) => {
    try {
      const { id } = req.params;
      const { paymentReference } = req.body;

      const payout = await commissionService.markPayoutPaid(
        parseInt(id, 10),
        paymentReference || ''
      );

      if (!payout) {
        return res.status(404).json({
          success: false,
          error: 'Payout not found or not approved',
        });
      }

      res.json({
        success: true,
        data: payout,
      });
    } catch (error) {
      console.error('[Commissions] Mark payout paid error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/commissions/adjustments
   * Add an adjustment (e.g., chargeback for return)
   */
  router.post('/adjustments', async (req, res) => {
    try {
      const { orderId, repId, adjustmentCents, reason } = req.body;

      if (!repId || !adjustmentCents || !reason) {
        return res.status(400).json({
          success: false,
          error: 'Rep ID, adjustment amount, and reason required',
        });
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
    } catch (error) {
      console.error('[Commissions] Add adjustment error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================
  // REP SETTINGS
  // ============================================

  /**
   * GET /api/commissions/settings/:repId
   * Get commission settings for a sales rep
   */
  router.get('/settings/:repId', async (req, res) => {
    try {
      const { repId } = req.params;

      const settings = await commissionService.getRepSettings(parseInt(repId, 10));

      res.json({
        success: true,
        data: settings || { defaults: true },
      });
    } catch (error) {
      console.error('[Commissions] Get settings error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * PUT /api/commissions/settings/:repId
   * Update commission settings for a sales rep
   */
  router.put('/settings/:repId', async (req, res) => {
    try {
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
    } catch (error) {
      console.error('[Commissions] Update settings error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================
  // COMMISSION SPLITS
  // ============================================

  /**
   * POST /api/commissions/splits/:transactionId
   * Create or replace commission splits for a transaction
   * Body: { splits: [{ userId, splitPercentage, role }] }
   */
  router.post('/splits/:transactionId', async (req, res) => {
    try {
      const transactionId = parseInt(req.params.transactionId, 10);
      const { splits } = req.body;

      if (!splits || !Array.isArray(splits) || splits.length === 0) {
        return res.status(400).json({ success: false, error: 'splits array is required' });
      }

      // Validate percentages sum to 100
      const totalPercent = splits.reduce((sum, s) => sum + Number(s.splitPercentage), 0);
      if (Math.abs(totalPercent - 100) > 0.01) {
        return res.status(400).json({
          success: false,
          error: `Split percentages must total 100% (got ${totalPercent.toFixed(2)}%)`,
        });
      }

      // Validate each split has a valid user
      for (const split of splits) {
        if (!split.userId || !split.splitPercentage) {
          return res.status(400).json({ success: false, error: 'Each split requires userId and splitPercentage' });
        }
      }

      // Verify transaction exists and get total
      const txResult = await pool.query(
        'SELECT transaction_id, total_amount FROM transactions WHERE transaction_id = $1',
        [transactionId]
      );
      if (txResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Transaction not found' });
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
    } catch (error) {
      console.error('[Commissions] Create splits error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/commissions/splits/:transactionId
   * Get commission splits for a transaction
   */
  router.get('/splits/:transactionId', async (req, res) => {
    try {
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
    } catch (error) {
      console.error('[Commissions] Get splits error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/commissions/splits/preview
   * Preview commission split amounts without saving
   * Body: { totalAmountCents, splits: [{ userId, splitPercentage }] }
   */
  router.post('/splits/preview', async (req, res) => {
    try {
      const { totalAmountCents, splits, cart } = req.body;

      if (!splits || splits.length === 0) {
        return res.status(400).json({ success: false, error: 'splits array required' });
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
    } catch (error) {
      console.error('[Commissions] Preview splits error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = { init };
