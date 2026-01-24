/**
 * Purchasing Intelligence Routes
 *
 * API endpoints for the AI-powered purchasing intelligence system:
 * - GET /recommendations - Get current recommendations
 * - POST /recommendations/:id/acknowledge - Acknowledge a recommendation
 * - GET /trends/:productId - Get trend data for a product
 * - GET /forecasts - Get demand forecasts
 * - GET /insights - Get AI-generated insights
 * - POST /analyze - Trigger manual analysis run
 * - GET /dashboard - Get full dashboard data
 * - GET /runs - Get analysis run history
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const purchasingService = require('../services/PurchasingIntelligenceService');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/purchasing-intelligence/dashboard
 * Get full dashboard data including recommendations, stats, and AI summary
 */
router.get('/dashboard', authenticate, asyncHandler(async (req, res) => {
  const dashboard = await purchasingService.getAnalyticsDashboard();
  res.json({
    success: true,
    data: dashboard
  });
}));

/**
 * GET /api/purchasing-intelligence/recommendations
 * Get current purchasing recommendations
 * Query params: priority, type, limit
 */
router.get('/recommendations', authenticate, asyncHandler(async (req, res) => {
  const { priority, type, limit = 50 } = req.query;

  let query = `
    SELECT r.*, p.name as product_name, p.model as sku, p.category, p.manufacturer
    FROM purchasing_recommendations r
    JOIN products p ON r.product_id = p.id
    WHERE r.acknowledged_at IS NULL
  `;

  const params = [];

  if (priority) {
    params.push(priority);
    query += ` AND r.priority = $${params.length}`;
  }

  if (type) {
    params.push(type);
    query += ` AND r.recommendation_type = $${params.length}`;
  }

  query += `
    ORDER BY
      CASE r.priority
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        ELSE 3
      END,
      r.days_of_stock_remaining ASC NULLS LAST,
      r.created_at DESC
    LIMIT $${params.length + 1}
  `;
  params.push(parseInt(limit));

  const pool = require('../db');
  const result = await pool.query(query, params);

  res.json({
    success: true,
    data: result.rows,
    count: result.rows.length
  });
}));

/**
 * POST /api/purchasing-intelligence/recommendations/:id/acknowledge
 * Mark a recommendation as acknowledged
 */
router.post('/recommendations/:id/acknowledge', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  if (!id || isNaN(parseInt(id))) {
    throw ApiError.badRequest('Invalid recommendation ID');
  }

  await purchasingService.acknowledgeRecommendation(parseInt(id), userId);

  res.json({
    success: true,
    message: 'Recommendation acknowledged'
  });
}));

/**
 * GET /api/purchasing-intelligence/trends/:productId
 * Get trend data for a specific product
 */
router.get('/trends/:productId', authenticate, asyncHandler(async (req, res) => {
  const { productId } = req.params;

  if (!productId || isNaN(parseInt(productId))) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const trends = await purchasingService.getProductTrends(parseInt(productId));

  res.json({
    success: true,
    data: trends
  });
}));

/**
 * GET /api/purchasing-intelligence/forecasts
 * Get demand forecasts
 * Query params: limit
 */
router.get('/forecasts', authenticate, asyncHandler(async (req, res) => {
  const forecasts = await purchasingService.getForecasts();

  res.json({
    success: true,
    data: forecasts,
    count: forecasts.length
  });
}));

/**
 * GET /api/purchasing-intelligence/insights
 * Get AI-generated insights and latest summary
 */
router.get('/insights', authenticate, asyncHandler(async (req, res) => {
  const pool = require('../db');

  const result = await pool.query(`
    SELECT ai_summary, completed_at, products_analyzed, recommendations_generated
    FROM purchasing_agent_runs
    WHERE status = 'completed' AND ai_summary IS NOT NULL
    ORDER BY completed_at DESC
    LIMIT 5
  `);

  res.json({
    success: true,
    data: {
      latest: result.rows[0] || null,
      history: result.rows
    }
  });
}));

/**
 * POST /api/purchasing-intelligence/analyze
 * Trigger a manual analysis run
 */
router.post('/analyze', authenticate, asyncHandler(async (req, res) => {
  // Check if there's already a running analysis
  const pool = require('../db');
  const runningCheck = await pool.query(`
    SELECT id FROM purchasing_agent_runs
    WHERE status = 'running'
    LIMIT 1
  `);

  if (runningCheck.rows.length > 0) {
    throw ApiError.conflict('An analysis is already running');
  }

  // Start analysis in background
  const analysisPromise = purchasingService.runFullAnalysis('manual');

  // Don't await - let it run in background
  analysisPromise
    .then(result => console.log(`Manual analysis completed: ${result.productsAnalyzed} products analyzed`))
    .catch(err => console.error('Manual analysis failed:', err.message));

  res.json({
    success: true,
    message: 'Analysis started. Check dashboard for results.'
  });
}));

/**
 * GET /api/purchasing-intelligence/runs
 * Get analysis run history
 * Query params: limit
 */
router.get('/runs', authenticate, asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;

  const runs = await purchasingService.getRunHistory(parseInt(limit));

  res.json({
    success: true,
    data: runs,
    count: runs.length
  });
}));

/**
 * GET /api/purchasing-intelligence/summary-stats
 * Get quick summary statistics
 */
router.get('/summary-stats', authenticate, asyncHandler(async (req, res) => {
  const pool = require('../db');

  const stats = await pool.query(`
    SELECT
      COUNT(*) as total_recommendations,
      COUNT(*) FILTER (WHERE priority = 'critical') as critical_count,
      COUNT(*) FILTER (WHERE priority = 'high') as high_count,
      COUNT(*) FILTER (WHERE priority = 'medium') as medium_count,
      COUNT(*) FILTER (WHERE priority = 'low') as low_count,
      COUNT(*) FILTER (WHERE recommendation_type = 'restock') as restock_count,
      COUNT(*) FILTER (WHERE recommendation_type = 'increase_order') as trending_up_count,
      COUNT(*) FILTER (WHERE recommendation_type = 'reduce_order') as trending_down_count
    FROM purchasing_recommendations
    WHERE acknowledged_at IS NULL
  `);

  const lastRun = await pool.query(`
    SELECT completed_at, products_analyzed, recommendations_generated
    FROM purchasing_agent_runs
    WHERE status = 'completed'
    ORDER BY completed_at DESC
    LIMIT 1
  `);

  res.json({
    success: true,
    data: {
      ...stats.rows[0],
      lastAnalysis: lastRun.rows[0] || null
    }
  });
}));

module.exports = router;
