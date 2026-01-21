/**
 * Customer Routes Module
 * Handles all customer-related API endpoints
 * Uses CustomerService for business logic
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const CustomerService = require('../services/CustomerService');
const LookupService = require('../services/LookupService');
const { authenticate } = require('../middleware/auth');

// Module-level service instance
let customerService = null;
let cache = null;

/**
 * Initialize the router with dependencies
 * @param {object} deps - Dependencies
 * @param {Pool} deps.pool - PostgreSQL connection pool
 * @param {object} deps.cache - Cache module
 */
const init = (deps) => {
  cache = deps.cache;
  customerService = new CustomerService(deps.pool, deps.cache);
  return router;
};

// ============================================
// CUSTOMER ROUTES
// ============================================

/**
 * GET /api/customers
 * Get all customers with search, filter, sorting, and pagination
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const result = await customerService.getCustomers(req.query);
  res.json(result);
}));

/**
 * GET /api/customers/stats/overview
 * Get customer statistics overview
 */
router.get('/stats/overview', authenticate, asyncHandler(async (req, res) => {
  // PERF: Cache stats overview (short TTL for freshness)
  const stats = await cache.cacheQuery('customers:stats:overview', 'short', async () => {
    return customerService.getStatsOverview();
  });
  res.success(stats);
}));

/**
 * GET /api/customers/at-risk
 * Get customers with high churn risk, sorted by CLV (highest value at risk first)
 * Query params: limit (default 20)
 */
router.get('/at-risk', authenticate, asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;
  const limitNum = Math.min(parseInt(limit) || 20, 100);

  // PERF: Cache at-risk customers (short TTL for freshness)
  const data = await cache.cacheQuery(`customers:at-risk:${limitNum}`, 'short', async () => {
    const pool = customerService.pool;
    const result = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.email,
        c.phone,
        c.company,
        c.clv_score,
        c.clv_segment,
        c.churn_risk,
        c.total_transactions,
        c.avg_order_value_cents,
        c.days_since_last_activity,
        c.clv_trend,
        c.clv_last_calculated
      FROM customers c
      WHERE c.churn_risk = 'high'
        AND (c.active = true OR c.active IS NULL)
      ORDER BY c.clv_score DESC NULLS LAST
      LIMIT $1
    `, [limitNum]);

    // Format for frontend
    const customers = result.rows.map(c => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      company: c.company,
      clv: {
        score: c.clv_score,
        segment: c.clv_segment,
        trend: c.clv_trend,
        lastCalculated: c.clv_last_calculated
      },
      engagement: {
        churnRisk: c.churn_risk,
        totalTransactions: c.total_transactions,
        avgOrderValueCents: c.avg_order_value_cents,
        daysSinceLastActivity: c.days_since_last_activity
      }
    }));

    return { count: customers.length, customers };
  });

  res.json(data);
}));

/**
 * GET /api/customers/clv-summary
 * Get CLV segment distribution summary
 */
router.get('/clv-summary', authenticate, asyncHandler(async (req, res) => {
  // PERF: Cache CLV summary (short TTL for freshness)
  const data = await cache.cacheQuery('customers:clv:summary', 'short', async () => {
    const pool = customerService.pool;

    const result = await pool.query(`
      SELECT
        clv_segment,
        COUNT(*) as customer_count,
        SUM(clv_score) as total_clv,
        AVG(clv_score) as avg_clv,
        COUNT(*) FILTER (WHERE churn_risk = 'high') as high_risk_count
      FROM customers
      WHERE active = true OR active IS NULL
      GROUP BY clv_segment
      ORDER BY
        CASE clv_segment
          WHEN 'platinum' THEN 1
          WHEN 'gold' THEN 2
          WHEN 'silver' THEN 3
          WHEN 'bronze' THEN 4
          ELSE 5
        END
    `);

    // Also get overall stats
    const overallResult = await pool.query(`
      SELECT
        COUNT(*) as total_customers,
        SUM(clv_score) as total_clv,
        COUNT(*) FILTER (WHERE churn_risk = 'high') as total_high_risk,
        COUNT(*) FILTER (WHERE clv_last_calculated IS NOT NULL) as customers_calculated
      FROM customers
      WHERE active = true OR active IS NULL
    `);

    return { segments: result.rows, overall: overallResult.rows[0] };
  });

  res.json(data);
}));

/**
 * GET /api/customers/top-clv
 * Get top customers by Customer Lifetime Value
 * Query params: limit (default 5)
 */
router.get('/top-clv', authenticate, asyncHandler(async (req, res) => {
  const { limit = 5 } = req.query;
  const limitNum = Math.min(parseInt(limit) || 5, 50);

  // PERF: Cache top CLV customers (short TTL for freshness)
  const customers = await cache.cacheQuery(`customers:top-clv:${limitNum}`, 'short', async () => {
    const pool = customerService.pool;
    const result = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.email,
        c.company,
        c.clv_score as clv,
        c.clv_segment as segment,
        c.total_transactions,
        c.avg_order_value_cents,
        c.clv_trend
      FROM customers c
      WHERE (c.active = true OR c.active IS NULL)
        AND c.clv_score IS NOT NULL
      ORDER BY c.clv_score DESC
      LIMIT $1
    `, [limitNum]);
    return result.rows;
  });

  res.success(customers);
}));

/**
 * GET /api/customers/autocomplete
 * Search existing customers for autocomplete (duplicate detection)
 * Query params: q (search query), limit (default 5)
 */
router.get('/autocomplete', authenticate, asyncHandler(async (req, res) => {
  const { q, limit = 5 } = req.query;

  if (!q || q.length < 2) {
    return res.json([]);
  }

  const customers = await LookupService.searchCustomers(q, parseInt(limit) || 5);
  res.json(customers);
}));

/**
 * POST /api/customers/check-duplicates
 * Check for potential duplicate customers
 * Body: { name, email, phone, company }
 */
router.post('/check-duplicates', authenticate, asyncHandler(async (req, res) => {
  const { name, email, phone, company } = req.body;

  const duplicates = await LookupService.findPotentialDuplicates({
    name, email, phone, company
  });

  res.json({
    hasDuplicates: duplicates.length > 0,
    duplicates
  });
}));

/**
 * GET /api/customers/lifetime-value
 * Get CLV summary for all customers (analytics dashboard)
 * Query params: limit, segment (platinum|gold|silver|bronze), sortBy, sortOrder
 */
router.get('/lifetime-value', authenticate, asyncHandler(async (req, res) => {
  const { limit, segment, sortBy, sortOrder } = req.query;

  const result = await customerService.getLifetimeValueSummary({
    limit: limit ? parseInt(limit) : 50,
    segment,
    sortBy,
    sortOrder
  });

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /api/customers/:id
 * Get single customer with quote history
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await customerService.getCustomerById(id);

  if (!result) {
    throw ApiError.notFound('Customer');
  }

  res.success(result);
}));

/**
 * GET /api/customers/:id/lifetime-value
 * Get Customer Lifetime Value (CLV) for a specific customer
 */
router.get('/:id/lifetime-value', authenticate, asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.id);

  if (isNaN(customerId)) {
    throw ApiError.badRequest('Invalid customer ID');
  }

  const clv = await customerService.calculateLifetimeValue(customerId);

  if (!clv) {
    throw ApiError.notFound('Customer');
  }

  res.json({
    success: true,
    data: clv
  });
}));

// ============================================
// PREDICTIVE CLV ROUTES
// ============================================

const PredictiveCLVService = require('../services/PredictiveCLVService');

/**
 * GET /api/customers/predictive-clv/rfm-scores
 * Get RFM (Recency, Frequency, Monetary) scores for all customers
 */
router.get('/predictive-clv/rfm-scores', authenticate, asyncHandler(async (req, res) => {
  const rfmData = await PredictiveCLVService.calculateRFMScores();
  res.success({
    customers: rfmData,
    count: rfmData.length
  });
}));

/**
 * GET /api/customers/predictive-clv/churn-analysis
 * Get churn risk analysis for all customers
 */
router.get('/predictive-clv/churn-analysis', authenticate, asyncHandler(async (req, res) => {
  const { limit = 50, minRevenue = 1000 } = req.query;
  const analysis = await PredictiveCLVService.getChurnRiskAnalysis({
    limit: parseInt(limit),
    minRevenue: parseFloat(minRevenue)
  });
  res.success(analysis);
}));

/**
 * GET /api/customers/predictive-clv/cohort-analysis
 * Get customer cohort retention analysis
 */
router.get('/predictive-clv/cohort-analysis', authenticate, asyncHandler(async (req, res) => {
  const { type = 'acquisition_month' } = req.query;
  const cohorts = await PredictiveCLVService.getCohortAnalysis(type);
  res.success({
    cohorts,
    count: cohorts.length
  });
}));

/**
 * GET /api/customers/predictive-clv/retention-roi
 * Calculate retention ROI - cost of retention vs value of retained customers
 */
router.get('/predictive-clv/retention-roi', authenticate, asyncHandler(async (req, res) => {
  const {
    retentionCostPerCustomer = 50,
    acquisitionCostPerCustomer = 200,
    targetChurnReduction = 0.25
  } = req.query;

  const roi = await PredictiveCLVService.calculateRetentionROI({
    retentionCostPerCustomer: parseFloat(retentionCostPerCustomer),
    acquisitionCostPerCustomer: parseFloat(acquisitionCostPerCustomer),
    targetChurnReduction: parseFloat(targetChurnReduction)
  });
  res.success(roi);
}));

/**
 * GET /api/customers/predictive-clv/segment-recommendations
 * Get actionable segment recommendations based on RFM analysis
 */
router.get('/predictive-clv/segment-recommendations', authenticate, asyncHandler(async (req, res) => {
  const segments = await PredictiveCLVService.getSegmentRecommendations();
  res.success({
    segments,
    count: segments.length
  });
}));

/**
 * GET /api/customers/:id/predictive-clv
 * Get predictive CLV analysis for a specific customer
 */
router.get('/:id/predictive-clv', authenticate, asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.id);
  const { horizon = 12 } = req.query;

  if (isNaN(customerId)) {
    throw ApiError.badRequest('Invalid customer ID');
  }

  const prediction = await PredictiveCLVService.predictCustomerCLV(customerId, parseInt(horizon));
  res.success(prediction);
}));

/**
 * POST /api/customers
 * Create a new customer
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    throw ApiError.validation('Name and email are required');
  }

  try {
    const customer = await customerService.createCustomer(req.body);
    res.created(customer);
  } catch (error) {
    // Check for duplicate email constraint violation
    if (error.code === '23505' && error.constraint === 'customers_email_key') {
      throw ApiError.conflict('Email already in use', {
        details: 'This email address is already registered to another customer'
      });
    }
    throw error;
  }
}));

/**
 * PUT /api/customers/:id
 * Update an existing customer
 */
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const customer = await customerService.updateCustomer(id, req.body);

    if (!customer) {
      throw ApiError.notFound('Customer');
    }

    res.success(customer);
  } catch (error) {
    // Check for duplicate email constraint violation
    if (error.code === '23505' && error.constraint === 'customers_email_key') {
      throw ApiError.conflict('Email already in use', {
        details: 'This email address is already registered to another customer'
      });
    }
    throw error;
  }
}));

/**
 * DELETE /api/customers/:id
 * Delete a customer
 */
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await customerService.deleteCustomer(id);

  if (!result) {
    throw ApiError.notFound('Customer');
  }

  res.success(null, { message: 'Customer deleted successfully' });
}));

module.exports = { router, init };
