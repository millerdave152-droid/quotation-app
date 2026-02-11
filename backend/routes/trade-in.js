/**
 * TeleTime - Trade-In API Routes
 * Endpoints for trade-in assessment and processing
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

// ============================================================================
// MIDDLEWARE & SERVICE SETUP
// ============================================================================

let tradeInService = null;

const initService = (req, res, next) => {
  if (!tradeInService) {
    const TradeInService = require('../services/TradeInService');
    tradeInService = new TradeInService(req.app.locals.pool);
  }
  req.tradeInService = tradeInService;
  next();
};

// Apply authentication to all routes
router.use(authenticate);
router.use(initService);

// ============================================================================
// CATEGORY & CONDITION ENDPOINTS
// ============================================================================

/**
 * GET /api/trade-in/categories
 * Get all active trade-in categories
 */
router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await req.tradeInService.getCategories();
  res.json({ categories });
}));

/**
 * GET /api/trade-in/conditions
 * Get all active condition grades
 */
router.get('/conditions', asyncHandler(async (req, res) => {
  const conditions = await req.tradeInService.getConditions();
  res.json({ conditions });
}));

// ============================================================================
// PRODUCT SEARCH
// ============================================================================

/**
 * GET /api/trade-in/products/search
 * Search trade-in eligible products
 * Query params: q, categoryId, brand, limit, offset
 */
router.get('/products/search', asyncHandler(async (req, res) => {
  const { q, categoryId, brand, limit = 20, offset = 0 } = req.query;

  const result = await req.tradeInService.searchTradeInProducts(q || '', {
    categoryId: categoryId ? parseInt(categoryId) : null,
    brand: brand || null,
    limit: parseInt(limit),
    offset: parseInt(offset),
  });

  res.json(result);
}));

/**
 * GET /api/trade-in/products/:id
 * Get single product details
 */
router.get('/products/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await req.tradeInService.searchTradeInProducts('', {
    productId: parseInt(id),
    limit: 1,
  });

  if (!result.products || result.products.length === 0) {
    throw ApiError.notFound('Product');
  }

  res.json({ product: result.products[0] });
}));

// ============================================================================
// ASSESSMENT ENDPOINTS
// ============================================================================

/**
 * POST /api/trade-in/assess
 * Calculate trade-in value without creating assessment
 * Body: { productId, conditionId, serialNumber?, imei?, customAdjustment?, adjustmentReason? }
 */
router.post('/assess', asyncHandler(async (req, res) => {
  const {
    productId,
    conditionId,
    serialNumber,
    imei,
    customAdjustment,
    adjustmentReason,
  } = req.body;

  if (!productId || !conditionId) {
    throw ApiError.badRequest('productId and conditionId are required');
  }

  const result = await req.tradeInService.assessTradeIn(
    parseInt(productId),
    parseInt(conditionId),
    {
      serialNumber,
      imei,
      customAdjustment: customAdjustment ? parseFloat(customAdjustment) : 0,
      adjustmentReason,
    }
  );

  res.json(result);
}));

/**
 * POST /api/trade-in/assessments
 * Create and save a trade-in assessment
 */
router.post('/assessments', asyncHandler(async (req, res) => {
  const assessmentData = {
    ...req.body,
    assessedBy: req.user?.id || req.body.assessedBy,
  };

  const result = await req.tradeInService.createTradeInAssessment(assessmentData);

  res.status(201).json(result);
}));

/**
 * GET /api/trade-in/assessments/:id
 * Get assessment by ID
 */
router.get('/assessments/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const assessment = await req.tradeInService.getAssessment(parseInt(id));

  if (!assessment) {
    throw ApiError.notFound('Assessment');
  }

  res.json({ assessment });
}));

/**
 * POST /api/trade-in/assessments/:id/apply
 * Apply trade-in assessment to cart/transaction
 */
router.post('/assessments/:id/apply', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { cartId, transactionId } = req.body;

  if (!cartId && !transactionId) {
    throw ApiError.badRequest('cartId or transactionId is required');
  }

  const result = await req.tradeInService.applyTradeInToCart(
    cartId || transactionId,
    parseInt(id),
    { userId: req.user?.id }
  );

  res.json(result);
}));

/**
 * POST /api/trade-in/assessments/:id/void
 * Void a trade-in assessment
 */
router.post('/assessments/:id/void', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    throw ApiError.badRequest('Reason is required');
  }

  const result = await req.tradeInService.voidTradeIn(
    parseInt(id),
    reason,
    { userId: req.user?.id }
  );

  res.json(result);
}));

// ============================================================================
// APPROVAL ENDPOINTS
// ============================================================================

/**
 * GET /api/trade-in/approvals/pending
 * Get assessments pending manager approval
 */
router.get('/approvals/pending', asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;

  const result = await req.tradeInService.getPendingApprovals({
    limit: parseInt(limit),
    offset: parseInt(offset),
  });

  res.json(result);
}));

/**
 * POST /api/trade-in/assessments/:id/approve
 * Approve a pending trade-in assessment (manager only)
 */
router.post('/assessments/:id/approve', requireRole(['manager', 'admin']), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { overrideValue, notes } = req.body;

  const result = await req.tradeInService.approveTradeIn(parseInt(id), {
    approvedBy: req.user?.id,
    overrideValue: overrideValue ? parseFloat(overrideValue) : undefined,
    notes,
  });

  res.json(result);
}));

/**
 * POST /api/trade-in/assessments/:id/reject
 * Reject a pending trade-in assessment (manager only)
 */
router.post('/assessments/:id/reject', requireRole(['manager', 'admin']), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    throw ApiError.badRequest('Rejection reason is required');
  }

  const result = await req.tradeInService.rejectTradeIn(
    parseInt(id),
    reason,
    req.user?.id
  );

  res.json(result);
}));

// ============================================================================
// CUSTOMER HISTORY
// ============================================================================

/**
 * GET /api/trade-in/customer/:customerId
 * Get trade-in history for a customer
 */
router.get('/customer/:customerId', asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const { status, limit = 20, offset = 0 } = req.query;

  const result = await req.tradeInService.getCustomerTradeIns(parseInt(customerId), {
    status,
    limit: parseInt(limit),
    offset: parseInt(offset),
  });

  res.json(result);
}));

// ============================================================================
// STATISTICS (for dashboard/reporting)
// ============================================================================

/**
 * GET /api/trade-in/stats
 * Get trade-in statistics for dashboard
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const { period = '30d' } = req.query;

  // Calculate date range
  const days = parseInt(period) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const pool = req.app.locals.pool;

  const statsQuery = `
    SELECT
      COUNT(*) FILTER (WHERE status = 'applied') as completed_count,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
      COUNT(*) FILTER (WHERE status = 'void') as voided_count,
      COUNT(*) FILTER (WHERE requires_approval AND status = 'pending') as awaiting_approval,
      COALESCE(SUM(final_value) FILTER (WHERE status = 'applied'), 0) as total_value,
      COALESCE(AVG(final_value) FILTER (WHERE status = 'applied'), 0) as avg_value
    FROM trade_in_assessments
    WHERE created_at >= $1
  `;

  const topProductsQuery = `
    SELECT
      COALESCE(p.brand, a.custom_brand) as brand,
      COALESCE(p.model, a.custom_model) as model,
      COUNT(*) as count,
      SUM(a.final_value) as total_value
    FROM trade_in_assessments a
    LEFT JOIN trade_in_products p ON a.trade_in_product_id = p.id
    WHERE a.status = 'applied' AND a.created_at >= $1
    GROUP BY brand, model
    ORDER BY count DESC
    LIMIT 5
  `;

  const [statsResult, topProductsResult] = await Promise.all([
    pool.query(statsQuery, [startDate]),
    pool.query(topProductsQuery, [startDate]),
  ]);

  const stats = statsResult.rows[0];

  res.json({
    period: `${days} days`,
    stats: {
      completedCount: parseInt(stats.completed_count) || 0,
      pendingCount: parseInt(stats.pending_count) || 0,
      voidedCount: parseInt(stats.voided_count) || 0,
      awaitingApproval: parseInt(stats.awaiting_approval) || 0,
      totalValue: parseFloat(stats.total_value) || 0,
      averageValue: parseFloat(stats.avg_value) || 0,
    },
    topProducts: topProductsResult.rows.map((row) => ({
      brand: row.brand,
      model: row.model,
      count: parseInt(row.count),
      totalValue: parseFloat(row.total_value),
    })),
  });
}));

module.exports = router;
