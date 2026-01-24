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
const { validateJoi, customerSchemas } = require('../middleware/validation');

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
router.post('/check-duplicates', authenticate, validateJoi(customerSchemas.duplicateCheck), asyncHandler(async (req, res) => {
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

// ============================================
// CUSTOMER ACTIVITY ROUTES (CRM)
// ============================================

/**
 * GET /api/customers/:id/activities
 * Get customer activity timeline
 * Query params: limit (default 50), offset (default 0), type (filter by activity type)
 */
router.get('/:id/activities', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 50, offset = 0, type } = req.query;

  // Build query
  let query = `
    SELECT
      ca.*,
      NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') as performed_by_name
    FROM customer_activities ca
    LEFT JOIN users u ON ca.performed_by = u.id
    WHERE ca.customer_id = $1
  `;
  const params = [id];

  if (type) {
    query += ` AND ca.activity_type = $${params.length + 1}`;
    params.push(type);
  }

  query += ` ORDER BY ca.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await customerService.pool.query(query, params);

  // Get total count
  const countResult = await customerService.pool.query(
    `SELECT COUNT(*) FROM customer_activities WHERE customer_id = $1${type ? ' AND activity_type = $2' : ''}`,
    type ? [id, type] : [id]
  );

  res.success({
    activities: result.rows,
    total: parseInt(countResult.rows[0].count),
    limit: parseInt(limit),
    offset: parseInt(offset)
  });
}));

/**
 * POST /api/customers/:id/activities
 * Add a new activity to customer timeline
 */
router.post('/:id/activities', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { activity_type, title, description, metadata, related_type, related_id } = req.body;

  if (!activity_type || !title) {
    throw ApiError.validation('Activity type and title are required');
  }

  // Verify customer exists
  const customer = await customerService.getCustomerById(id);
  if (!customer) {
    throw ApiError.notFound('Customer');
  }

  const result = await customerService.pool.query(`
    INSERT INTO customer_activities (
      customer_id, activity_type, title, description, metadata,
      related_type, related_id, performed_by, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
    RETURNING *
  `, [
    id,
    activity_type,
    title,
    description || null,
    metadata ? JSON.stringify(metadata) : '{}',
    related_type || null,
    related_id || null,
    req.user?.id || null
  ]);

  res.created(result.rows[0]);
}));

/**
 * GET /api/customers/:id/activity-summary
 * Get summary of customer activities (counts by type, last activity date)
 */
router.get('/:id/activity-summary', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await customerService.pool.query(`
    SELECT
      activity_type,
      COUNT(*) as count,
      MAX(created_at) as last_activity
    FROM customer_activities
    WHERE customer_id = $1
    GROUP BY activity_type
    ORDER BY count DESC
  `, [id]);

  // Get overall stats
  const overallResult = await customerService.pool.query(`
    SELECT
      COUNT(*) as total_activities,
      MAX(created_at) as last_activity,
      MIN(created_at) as first_activity
    FROM customer_activities
    WHERE customer_id = $1
  `, [id]);

  res.success({
    byType: result.rows,
    overall: overallResult.rows[0]
  });
}));

/**
 * POST /api/customers/:id/activities/call
 * Log a phone call activity
 */
router.post('/:id/activities/call', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { duration_minutes, outcome, notes } = req.body;

  const result = await customerService.pool.query(`
    INSERT INTO customer_activities (
      customer_id, activity_type, title, description, metadata, performed_by
    ) VALUES ($1, 'call', $2, $3, $4, $5)
    RETURNING *
  `, [
    id,
    `Phone call${outcome ? ` - ${outcome}` : ''}`,
    notes || null,
    JSON.stringify({ duration_minutes, outcome }),
    req.user?.id || null
  ]);

  res.created(result.rows[0]);
}));

/**
 * POST /api/customers/:id/activities/email
 * Log an email activity
 */
router.post('/:id/activities/email', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { subject, direction = 'outbound', notes } = req.body;

  const result = await customerService.pool.query(`
    INSERT INTO customer_activities (
      customer_id, activity_type, title, description, metadata, performed_by
    ) VALUES ($1, 'email', $2, $3, $4, $5)
    RETURNING *
  `, [
    id,
    `Email: ${subject || 'No subject'}`,
    notes || null,
    JSON.stringify({ subject, direction }),
    req.user?.id || null
  ]);

  res.created(result.rows[0]);
}));

/**
 * POST /api/customers/:id/activities/meeting
 * Log a meeting activity
 */
router.post('/:id/activities/meeting', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { meeting_type, attendees, notes, outcome } = req.body;

  const result = await customerService.pool.query(`
    INSERT INTO customer_activities (
      customer_id, activity_type, title, description, metadata, performed_by
    ) VALUES ($1, 'meeting', $2, $3, $4, $5)
    RETURNING *
  `, [
    id,
    `Meeting: ${meeting_type || 'General'}`,
    notes || null,
    JSON.stringify({ meeting_type, attendees, outcome }),
    req.user?.id || null
  ]);

  res.created(result.rows[0]);
}));

/**
 * POST /api/customers/:id/activities/note
 * Add a note to customer timeline
 */
router.post('/:id/activities/note', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;

  if (!content) {
    throw ApiError.validation('Note content is required');
  }

  const result = await customerService.pool.query(`
    INSERT INTO customer_activities (
      customer_id, activity_type, title, description, performed_by
    ) VALUES ($1, 'note', $2, $3, $4)
    RETURNING *
  `, [
    id,
    title || 'Note',
    content,
    req.user?.id || null
  ]);

  res.created(result.rows[0]);
}));

// ============================================
// CUSTOMER TAGGING ROUTES
// ============================================

/**
 * GET /api/customers/tags
 * Get all available tags
 */
router.get('/tags', authenticate, asyncHandler(async (req, res) => {
  const tags = await customerService.getAllTags();
  res.success(tags);
}));

/**
 * GET /api/customers/tags/stats
 * Get tag statistics
 */
router.get('/tags/stats', authenticate, asyncHandler(async (req, res) => {
  const stats = await customerService.getTagStats();
  res.success(stats);
}));

/**
 * POST /api/customers/tags
 * Create a new tag
 */
router.post('/tags', authenticate, asyncHandler(async (req, res) => {
  const { name, color, description } = req.body;

  if (!name) {
    throw ApiError.validation('Tag name is required');
  }

  const tag = await customerService.createTag(
    { name, color, description },
    req.user?.id
  );
  res.created(tag);
}));

/**
 * PUT /api/customers/tags/:tagId
 * Update a tag
 */
router.put('/tags/:tagId', authenticate, asyncHandler(async (req, res) => {
  const { tagId } = req.params;
  const { name, color, description } = req.body;

  const tag = await customerService.updateTag(tagId, { name, color, description });

  if (!tag) {
    throw ApiError.notFound('Tag');
  }

  res.success(tag);
}));

/**
 * DELETE /api/customers/tags/:tagId
 * Delete a tag
 */
router.delete('/tags/:tagId', authenticate, asyncHandler(async (req, res) => {
  const { tagId } = req.params;
  const result = await customerService.deleteTag(tagId);

  if (!result) {
    throw ApiError.notFound('Tag');
  }

  res.success(null, { message: 'Tag deleted successfully' });
}));

/**
 * GET /api/customers/by-tag/:tagId
 * Get customers by tag
 */
router.get('/by-tag/:tagId', authenticate, asyncHandler(async (req, res) => {
  const { tagId } = req.params;
  const { limit = 50, offset = 0, search } = req.query;

  const result = await customerService.getCustomersByTag(tagId, {
    limit: parseInt(limit),
    offset: parseInt(offset),
    search
  });

  res.success(result);
}));

/**
 * POST /api/customers/tags/bulk-assign
 * Bulk assign a tag to multiple customers
 */
router.post('/tags/bulk-assign', authenticate, asyncHandler(async (req, res) => {
  const { customerIds, tagId } = req.body;

  if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
    throw ApiError.validation('customerIds array is required');
  }

  if (!tagId) {
    throw ApiError.validation('tagId is required');
  }

  const result = await customerService.bulkAddTag(customerIds, tagId, req.user?.id);
  res.success(result);
}));

/**
 * GET /api/customers/:id/tags
 * Get tags for a specific customer
 */
router.get('/:id/tags', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tags = await customerService.getCustomerTags(id);
  res.success(tags);
}));

/**
 * POST /api/customers/:id/tags/:tagId
 * Add a tag to a customer
 */
router.post('/:id/tags/:tagId', authenticate, asyncHandler(async (req, res) => {
  const { id, tagId } = req.params;

  const result = await customerService.addTagToCustomer(id, tagId, req.user?.id);

  if (!result) {
    throw ApiError.badRequest('Failed to add tag - customer or tag not found');
  }

  res.created(result);
}));

/**
 * DELETE /api/customers/:id/tags/:tagId
 * Remove a tag from a customer
 */
router.delete('/:id/tags/:tagId', authenticate, asyncHandler(async (req, res) => {
  const { id, tagId } = req.params;

  const result = await customerService.removeTagFromCustomer(id, tagId);

  if (!result) {
    throw ApiError.notFound('Tag assignment');
  }

  res.success(null, { message: 'Tag removed successfully' });
}));

module.exports = { router, init };
