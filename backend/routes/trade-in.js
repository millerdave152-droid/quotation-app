/**
 * TeleTime - Trade-In API Routes
 * Endpoints for trade-in assessment and processing
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');

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
router.get('/categories', async (req, res) => {
  try {
    const categories = await req.tradeInService.getCategories();
    res.json({ categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * GET /api/trade-in/conditions
 * Get all active condition grades
 */
router.get('/conditions', async (req, res) => {
  try {
    const conditions = await req.tradeInService.getConditions();
    res.json({ conditions });
  } catch (error) {
    console.error('Error fetching conditions:', error);
    res.status(500).json({ error: 'Failed to fetch conditions' });
  }
});

// ============================================================================
// PRODUCT SEARCH
// ============================================================================

/**
 * GET /api/trade-in/products/search
 * Search trade-in eligible products
 * Query params: q, categoryId, brand, limit, offset
 */
router.get('/products/search', async (req, res) => {
  try {
    const { q, categoryId, brand, limit = 20, offset = 0 } = req.query;

    const result = await req.tradeInService.searchTradeInProducts(q || '', {
      categoryId: categoryId ? parseInt(categoryId) : null,
      brand: brand || null,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json(result);
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ error: 'Product search failed' });
  }
});

/**
 * GET /api/trade-in/products/:id
 * Get single product details
 */
router.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await req.tradeInService.searchTradeInProducts('', {
      productId: parseInt(id),
      limit: 1,
    });

    if (!result.products || result.products.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product: result.products[0] });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// ============================================================================
// ASSESSMENT ENDPOINTS
// ============================================================================

/**
 * POST /api/trade-in/assess
 * Calculate trade-in value without creating assessment
 * Body: { productId, conditionId, serialNumber?, imei?, customAdjustment?, adjustmentReason? }
 */
router.post('/assess', async (req, res) => {
  try {
    const {
      productId,
      conditionId,
      serialNumber,
      imei,
      customAdjustment,
      adjustmentReason,
    } = req.body;

    if (!productId || !conditionId) {
      return res.status(400).json({ error: 'productId and conditionId are required' });
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
  } catch (error) {
    console.error('Error assessing trade-in:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/trade-in/assessments
 * Create and save a trade-in assessment
 */
router.post('/assessments', async (req, res) => {
  try {
    const assessmentData = {
      ...req.body,
      assessedBy: req.user?.id || req.body.assessedBy,
    };

    const result = await req.tradeInService.createTradeInAssessment(assessmentData);

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating assessment:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/trade-in/assessments/:id
 * Get assessment by ID
 */
router.get('/assessments/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const assessment = await req.tradeInService.getAssessment(parseInt(id));

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    res.json({ assessment });
  } catch (error) {
    console.error('Error fetching assessment:', error);
    res.status(500).json({ error: 'Failed to fetch assessment' });
  }
});

/**
 * POST /api/trade-in/assessments/:id/apply
 * Apply trade-in assessment to cart/transaction
 */
router.post('/assessments/:id/apply', async (req, res) => {
  try {
    const { id } = req.params;
    const { cartId, transactionId } = req.body;

    if (!cartId && !transactionId) {
      return res.status(400).json({ error: 'cartId or transactionId is required' });
    }

    const result = await req.tradeInService.applyTradeInToCart(
      cartId || transactionId,
      parseInt(id),
      { userId: req.user?.id }
    );

    res.json(result);
  } catch (error) {
    console.error('Error applying trade-in:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/trade-in/assessments/:id/void
 * Void a trade-in assessment
 */
router.post('/assessments/:id/void', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    const result = await req.tradeInService.voidTradeIn(
      parseInt(id),
      reason,
      { userId: req.user?.id }
    );

    res.json(result);
  } catch (error) {
    console.error('Error voiding trade-in:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// APPROVAL ENDPOINTS
// ============================================================================

/**
 * GET /api/trade-in/approvals/pending
 * Get assessments pending manager approval
 */
router.get('/approvals/pending', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const result = await req.tradeInService.getPendingApprovals({
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

/**
 * POST /api/trade-in/assessments/:id/approve
 * Approve a pending trade-in assessment (manager only)
 */
router.post('/assessments/:id/approve', requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { overrideValue, notes } = req.body;

    const result = await req.tradeInService.approveTradeIn(parseInt(id), {
      approvedBy: req.user?.id,
      overrideValue: overrideValue ? parseFloat(overrideValue) : undefined,
      notes,
    });

    res.json(result);
  } catch (error) {
    console.error('Error approving trade-in:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/trade-in/assessments/:id/reject
 * Reject a pending trade-in assessment (manager only)
 */
router.post('/assessments/:id/reject', requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const result = await req.tradeInService.rejectTradeIn(
      parseInt(id),
      reason,
      req.user?.id
    );

    res.json(result);
  } catch (error) {
    console.error('Error rejecting trade-in:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// CUSTOMER HISTORY
// ============================================================================

/**
 * GET /api/trade-in/customer/:customerId
 * Get trade-in history for a customer
 */
router.get('/customer/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { status, limit = 20, offset = 0 } = req.query;

    const result = await req.tradeInService.getCustomerTradeIns(parseInt(customerId), {
      status,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching customer trade-ins:', error);
    res.status(500).json({ error: 'Failed to fetch customer trade-ins' });
  }
});

// ============================================================================
// STATISTICS (for dashboard/reporting)
// ============================================================================

/**
 * GET /api/trade-in/stats
 * Get trade-in statistics for dashboard
 */
router.get('/stats', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error fetching trade-in stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
