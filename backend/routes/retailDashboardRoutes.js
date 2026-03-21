'use strict';

/**
 * Retail Dashboard Routes
 *
 * Analytics endpoints for the real-time retail dashboard.
 * Role-based: managers/admins see all; sales reps see own data only.
 *
 * All routes are under /api/retail-dashboard
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const dashboardService = require('../services/dashboardService');

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Require manager or admin role.
 */
function requireManager(req, res, next) {
  const role = (req.user?.role || '').toLowerCase();
  if (['admin', 'manager'].includes(role)) return next();
  return res.status(403).json({ success: false, message: 'Manager or admin access required' });
}

/**
 * Extract common query filters.
 */
function extractFilters(req) {
  const { period = 'month', from, to, location, locationId } = req.query;
  const range = dashboardService.resolveDateRange(period, from, to);
  return {
    period,
    from: range.from,
    to: range.to,
    location: location || undefined,
    locationId: locationId || undefined,
  };
}

// ── Sales ───────────────────────────────────────────────────────

/**
 * GET /api/retail-dashboard/sales/summary
 * Sales summary with trend comparison.
 * Manager/Admin only. Optional salespersonId filter.
 */
router.get('/sales/summary', authenticate, requireManager, asyncHandler(async (req, res) => {
  const filters = extractFilters(req);
  filters.salespersonId = req.query.salespersonId;

  const data = await dashboardService.getSalesSummary(filters);
  res.json({ success: true, data });
}));

/**
 * GET /api/retail-dashboard/sales/trend
 * Daily sales trend (for LineChart).
 * Manager/Admin only.
 */
router.get('/sales/trend', authenticate, requireManager, asyncHandler(async (req, res) => {
  const filters = extractFilters(req);
  const data = await dashboardService.getDailySalesTrend(filters);
  res.json({ success: true, data });
}));

// ── Brands ──────────────────────────────────────────────────────

/**
 * GET /api/retail-dashboard/brands/margins
 * Brand margin analysis.
 * Manager/Admin only.
 */
router.get('/brands/margins', authenticate, requireManager, asyncHandler(async (req, res) => {
  const filters = extractFilters(req);
  if (req.query.brands) {
    filters.brandNames = req.query.brands.split(',');
  }
  const data = await dashboardService.getBrandMargins(filters);
  res.json({ success: true, data });
}));

/**
 * GET /api/retail-dashboard/brands/top-products
 * Top selling products.
 * Manager/Admin only.
 */
router.get('/brands/top-products', authenticate, requireManager, asyncHandler(async (req, res) => {
  const filters = extractFilters(req);
  filters.limit = parseInt(req.query.limit) || 10;
  const data = await dashboardService.getTopProducts(filters);
  res.json({ success: true, data });
}));

// ── Inventory ───────────────────────────────────────────────────

/**
 * GET /api/retail-dashboard/inventory/aging
 * Aging inventory report.
 * Manager/Admin only.
 */
router.get('/inventory/aging', authenticate, requireManager, asyncHandler(async (req, res) => {
  const { locationId, agingStatus, categoryId } = req.query;
  const data = await dashboardService.getAgingInventory({
    locationId, agingStatus, categoryId,
  });
  res.json({ success: true, data });
}));

/**
 * GET /api/retail-dashboard/inventory/low-stock
 * Low stock alerts.
 * Manager/Admin only.
 */
router.get('/inventory/low-stock', authenticate, requireManager, asyncHandler(async (req, res) => {
  const data = await dashboardService.getLowStockAlerts({
    locationId: req.query.locationId,
  });
  res.json({ success: true, data });
}));

// ── Rep Performance ─────────────────────────────────────────────

/**
 * GET /api/retail-dashboard/reps/performance
 * Rep performance leaderboard.
 * Sales reps see own data only; managers see all.
 */
router.get('/reps/performance', authenticate, asyncHandler(async (req, res) => {
  const filters = extractFilters(req);
  const role = (req.user?.role || '').toLowerCase();

  // Sales reps forced to their own data
  if (['sales', 'senior_sales'].includes(role)) {
    filters.repId = req.user.id;
  } else if (req.query.repId) {
    filters.repId = req.query.repId;
  }

  const data = await dashboardService.getRepPerformance(filters);
  res.json({ success: true, data });
}));

// ── Institutional ───────────────────────────────────────────────

/**
 * GET /api/retail-dashboard/institutional/summary
 * B2B institutional summary.
 * Manager/Admin only.
 */
router.get('/institutional/summary', authenticate, requireManager, asyncHandler(async (req, res) => {
  const filters = extractFilters(req);
  const data = await dashboardService.getInstitutionalSummary(filters);
  res.json({ success: true, data });
}));

// ── My Stats (sales rep self-service) ───────────────────────────

/**
 * GET /api/retail-dashboard/my/summary
 * Personal sales summary for the logged-in user.
 * Available to all authenticated users.
 */
router.get('/my/summary', authenticate, asyncHandler(async (req, res) => {
  const filters = extractFilters(req);
  filters.salespersonId = req.user.id;
  const data = await dashboardService.getSalesSummary(filters);
  res.json({ success: true, data });
}));

/**
 * GET /api/retail-dashboard/my/pipeline
 * Personal quote pipeline breakdown.
 */
router.get('/my/pipeline', authenticate, asyncHandler(async (req, res) => {
  const pool = require('../db');
  const result = await pool.query(`
    SELECT
      UPPER(status) AS status,
      COUNT(*) AS count,
      COALESCE(SUM(total_cents), 0) AS total_cents
    FROM quotations
    WHERE salesperson_id = $1
      AND UPPER(status) IN ('DRAFT', 'SENT', 'WON', 'LOST')
      AND created_at > NOW() - INTERVAL '90 days'
    GROUP BY UPPER(status)
  `, [req.user.id]);

  res.json({ success: true, data: result.rows });
}));

/**
 * GET /api/retail-dashboard/my/top-products
 * Personal top products last 30 days.
 */
router.get('/my/top-products', authenticate, asyncHandler(async (req, res) => {
  const pool = require('../db');
  const result = await pool.query(`
    SELECT
      ti.product_id,
      p.name AS product_name,
      p.sku,
      p.manufacturer AS brand_name,
      SUM(ti.quantity) AS units_sold,
      SUM(COALESCE(ti.line_total_cents,
          ROUND(ti.unit_price * ti.quantity * 100)::int)) AS revenue_cents
    FROM transaction_items ti
    JOIN transactions t ON t.transaction_id = ti.transaction_id
    JOIN products p     ON p.id = ti.product_id
    WHERE t.salesperson_id = $1
      AND t.status = 'completed'
      AND t.created_at > NOW() - INTERVAL '30 days'
    GROUP BY ti.product_id, p.name, p.sku, p.manufacturer
    ORDER BY SUM(COALESCE(ti.line_total_cents,
        ROUND(ti.unit_price * ti.quantity * 100)::int)) DESC
    LIMIT 10
  `, [req.user.id]);

  res.json({ success: true, data: result.rows });
}));

module.exports = router;
