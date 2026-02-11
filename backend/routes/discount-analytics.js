/**
 * TeleTime POS - Discount Analytics Routes
 *
 * Read-only analytics endpoints for discount patterns,
 * product trends, summary KPIs, and commission impact.
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

module.exports = function (pool) {
  router.use(authenticate);
  router.use(requireRole('admin', 'manager'));

  /**
   * GET /api/discount-analytics/by-employee
   * Discount patterns per salesperson
   */
  router.get('/by-employee', asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;

    const dateFilter = buildDateFilter(startDate, endDate);

    const result = await pool.query(
      `SELECT
         dt.employee_id,
         u.first_name || ' ' || u.last_name AS employee_name,
         u.role,
         COUNT(*)::int AS total_discounts,
         ROUND(AVG(dt.discount_pct), 2) AS avg_discount_pct,
         ROUND(SUM(dt.discount_amount), 2) AS total_discount_dollars,
         ROUND(AVG(dt.margin_before_discount), 2) AS avg_margin_before,
         ROUND(AVG(dt.margin_after_discount), 2) AS avg_margin_after,
         COUNT(*) FILTER (WHERE dt.required_manager_approval)::int AS escalations_needed,
         COUNT(*) FILTER (WHERE dt.was_auto_approved)::int AS auto_approved,
         ROUND(MIN(dt.discount_pct), 2) AS min_discount_pct,
         ROUND(MAX(dt.discount_pct), 2) AS max_discount_pct
       FROM discount_transactions dt
       JOIN users u ON u.id = dt.employee_id
       WHERE 1=1 ${dateFilter.clause}
       GROUP BY dt.employee_id, u.first_name, u.last_name, u.role
       ORDER BY total_discount_dollars DESC`,
      dateFilter.params
    );

    res.json({ success: true, data: result.rows });
  }));

  /**
   * GET /api/discount-analytics/by-product
   * Most-discounted products
   */
  router.get('/by-product', asyncHandler(async (req, res) => {
    const { startDate, endDate, limit } = req.query;

    const dateFilter = buildDateFilter(startDate, endDate);
    const rowLimit = Math.min(parseInt(limit) || 50, 200);

    const result = await pool.query(
      `SELECT
         dt.product_id,
         p.name AS product_name,
         p.sku,
         p.category,
         COUNT(*)::int AS times_discounted,
         ROUND(AVG(dt.discount_pct), 2) AS avg_discount_pct,
         ROUND(SUM(dt.discount_amount), 2) AS total_discount_dollars,
         ROUND(AVG(dt.margin_before_discount), 2) AS avg_margin_before,
         ROUND(AVG(dt.margin_after_discount), 2) AS avg_margin_after,
         ROUND(AVG(dt.original_price), 2) AS avg_original_price,
         COUNT(DISTINCT dt.employee_id)::int AS unique_employees
       FROM discount_transactions dt
       JOIN products p ON p.id = dt.product_id
       WHERE 1=1 ${dateFilter.clause}
       GROUP BY dt.product_id, p.name, p.sku, p.category
       ORDER BY total_discount_dollars DESC
       LIMIT ${rowLimit}`,
      dateFilter.params
    );

    res.json({ success: true, data: result.rows });
  }));

  /**
   * GET /api/discount-analytics/summary
   * Avg discount %, total $ given, close rate correlation
   */
  router.get('/summary', asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;

    const dateFilter = buildDateFilter(startDate, endDate);

    // Core discount KPIs
    const kpiResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total_transactions,
         ROUND(AVG(discount_pct), 2) AS avg_discount_pct,
         ROUND(SUM(discount_amount), 2) AS total_discount_dollars,
         ROUND(AVG(margin_before_discount), 2) AS avg_margin_before,
         ROUND(AVG(margin_after_discount), 2) AS avg_margin_after,
         ROUND(SUM(commission_impact), 2) AS total_commission_impact,
         COUNT(*) FILTER (WHERE was_auto_approved)::int AS auto_approved,
         COUNT(*) FILTER (WHERE required_manager_approval)::int AS required_escalation,
         ROUND(AVG(discount_amount), 2) AS avg_discount_amount
       FROM discount_transactions
       WHERE 1=1 ${dateFilter.clause}`,
      dateFilter.params
    );

    // Daily trend (last 30 days or within range)
    const trendResult = await pool.query(
      `SELECT
         created_at::date AS date,
         COUNT(*)::int AS count,
         ROUND(AVG(discount_pct), 2) AS avg_pct,
         ROUND(SUM(discount_amount), 2) AS total_dollars
       FROM discount_transactions
       WHERE 1=1 ${dateFilter.clause}
       GROUP BY created_at::date
       ORDER BY date DESC
       LIMIT 30`,
      dateFilter.params
    );

    // Discount-to-close correlation: compare discounted vs non-discounted sales
    const correlationResult = await pool.query(
      `SELECT
         CASE WHEN dt.id IS NOT NULL THEN 'discounted' ELSE 'full_price' END AS sale_type,
         COUNT(DISTINCT t.transaction_id)::int AS transaction_count,
         ROUND(AVG(t.total_amount), 2) AS avg_sale_amount
       FROM transactions t
       LEFT JOIN discount_transactions dt ON dt.sale_id = t.transaction_id
       WHERE t.status != 'voided'
         ${dateFilter.clause.replace(/dt\.created_at/g, 't.created_at')}
       GROUP BY CASE WHEN dt.id IS NOT NULL THEN 'discounted' ELSE 'full_price' END`
      ,
      dateFilter.params
    );

    res.json({
      success: true,
      data: {
        kpis: kpiResult.rows[0] || {},
        dailyTrend: trendResult.rows,
        closeRateCorrelation: correlationResult.rows,
      },
    });
  }));

  /**
   * GET /api/discount-analytics/commission-impact
   * Commission reduction from discounts by employee
   */
  router.get('/commission-impact', asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;

    const dateFilter = buildDateFilter(startDate, endDate);

    const result = await pool.query(
      `SELECT
         dt.employee_id,
         u.first_name || ' ' || u.last_name AS employee_name,
         u.role,
         COUNT(*)::int AS discount_count,
         ROUND(SUM(dt.commission_impact), 2) AS total_commission_lost,
         ROUND(AVG(dt.commission_impact), 2) AS avg_commission_lost_per_discount,
         ROUND(SUM(dt.discount_amount), 2) AS total_discount_given,
         ROUND(AVG(dt.discount_pct), 2) AS avg_discount_pct,
         ROUND(AVG(dt.margin_after_discount), 2) AS avg_margin_after
       FROM discount_transactions dt
       JOIN users u ON u.id = dt.employee_id
       WHERE 1=1 ${dateFilter.clause}
       GROUP BY dt.employee_id, u.first_name, u.last_name, u.role
       ORDER BY total_commission_lost DESC`,
      dateFilter.params
    );

    // Also get a total row
    const totalsResult = await pool.query(
      `SELECT
         ROUND(SUM(commission_impact), 2) AS total_commission_lost,
         ROUND(SUM(discount_amount), 2) AS total_discount_given,
         COUNT(*)::int AS total_discounts
       FROM discount_transactions
       WHERE 1=1 ${dateFilter.clause}`,
      dateFilter.params
    );

    res.json({
      success: true,
      data: {
        byEmployee: result.rows,
        totals: totalsResult.rows[0] || {},
      },
    });
  }));

  return router;
};

/**
 * Build optional date range filter for dt.created_at
 * Returns { clause: string, params: array }
 */
function buildDateFilter(startDate, endDate) {
  const params = [];
  let clause = '';
  let idx = 1;

  if (startDate) {
    clause += ` AND dt.created_at >= $${idx}`;
    params.push(startDate);
    idx++;
  }
  if (endDate) {
    clause += ` AND dt.created_at < ($${idx}::date + 1)`;
    params.push(endDate);
    idx++;
  }

  return { clause, params };
}
