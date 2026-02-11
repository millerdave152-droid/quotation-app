/**
 * CLV Admin Routes
 *
 * Admin endpoints for managing CLV calculations, viewing job history,
 * and accessing CLV trend data.
 */

const express = require('express');
const router = express.Router();
const clvCalculationJob = require('../jobs/clvCalculationJob');
const pool = require('../db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

/**
 * POST /api/clv/run-job
 * Manually trigger a full CLV calculation job (admin/manager only)
 */
router.post('/run-job', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  if (clvCalculationJob.isRunning) {
    throw ApiError.conflict('CLV calculation job is already running');
  }

  // Run asynchronously - don't wait for completion
  clvCalculationJob.run('manual').catch(err => {
    console.error('[CLV Admin] Manual job failed:', err.message);
  });

  res.success({
    message: 'CLV calculation job started',
    status: clvCalculationJob.getStatus()
  });
}));

/**
 * POST /api/clv/run-customer/:id
 * Recalculate CLV for a single customer
 */
router.post('/run-customer/:id', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.id);
  if (isNaN(customerId)) {
    throw ApiError.badRequest('Invalid customer ID');
  }

  // Verify customer exists
  const customer = await pool.query('SELECT id FROM customers WHERE id = $1', [customerId]);
  if (customer.rows.length === 0) {
    throw ApiError.notFound('Customer');
  }

  const result = await clvCalculationJob.runForCustomer(customerId);
  if (!result.success) {
    throw ApiError.internal(`CLV calculation failed: ${result.error}`);
  }

  res.success(result);
}));

/**
 * GET /api/clv/job-status
 * Get current CLV job status
 */
router.get('/job-status', authenticate, asyncHandler(async (req, res) => {
  res.success(clvCalculationJob.getStatus());
}));

/**
 * GET /api/clv/job-history
 * Get CLV job execution history
 */
router.get('/job-history', authenticate, asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;
  const limitNum = Math.min(parseInt(limit) || 20, 100);

  const result = await pool.query(`
    SELECT id, started_at, completed_at, status,
           customers_processed, customers_updated, errors,
           duration_ms, triggered_by
    FROM clv_job_log
    ORDER BY started_at DESC
    LIMIT $1
  `, [limitNum]);

  res.success(result.rows);
}));

/**
 * GET /api/clv/history/:customerId
 * Get CLV history for a specific customer (for trend charts)
 */
router.get('/history/:customerId', authenticate, asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  if (isNaN(customerId)) {
    throw ApiError.badRequest('Invalid customer ID');
  }

  const { days = 90 } = req.query;
  const daysNum = Math.min(parseInt(days) || 90, 365);

  const result = await pool.query(`
    SELECT snapshot_date, clv_score, churn_risk, clv_segment,
           total_transactions, avg_order_value_cents, days_since_last_activity
    FROM clv_history
    WHERE customer_id = $1
      AND snapshot_date >= CURRENT_DATE - $2::integer
    ORDER BY snapshot_date ASC
  `, [customerId, daysNum]);

  res.success(result.rows);
}));

/**
 * GET /api/clv/trends
 * Get aggregate CLV trends over time (for dashboard trend chart)
 */
router.get('/trends', authenticate, asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const daysNum = Math.min(parseInt(days) || 30, 365);

  const result = await pool.query(`
    SELECT
      snapshot_date,
      COUNT(*) as customer_count,
      AVG(clv_score) as avg_clv,
      SUM(clv_score) as total_clv,
      COUNT(*) FILTER (WHERE clv_segment = 'platinum') as platinum_count,
      COUNT(*) FILTER (WHERE clv_segment = 'gold') as gold_count,
      COUNT(*) FILTER (WHERE clv_segment = 'silver') as silver_count,
      COUNT(*) FILTER (WHERE clv_segment = 'bronze') as bronze_count,
      COUNT(*) FILTER (WHERE churn_risk = 'high') as high_risk_count
    FROM clv_history
    WHERE snapshot_date >= CURRENT_DATE - $1::integer
    GROUP BY snapshot_date
    ORDER BY snapshot_date ASC
  `, [daysNum]);

  res.success(result.rows);
}));

module.exports = router;
