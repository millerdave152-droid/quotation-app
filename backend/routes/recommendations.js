/**
 * TeleTime POS - Recommendation Routes
 * API endpoints for product recommendations
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, optionalAuth } = require('../middleware/auth');
const RecommendationService = require('../services/RecommendationService');

// ============================================================================
// MODULE STATE
// ============================================================================

let recommendationService = null;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const cartItemSchema = Joi.object({
  productId: Joi.number().integer().required(),
  quantity: Joi.number().integer().min(1).default(1),
  price: Joi.number().positive().required(),
});

const cartRecommendationsSchema = Joi.object({
  items: Joi.array().items(cartItemSchema).min(1).required(),
  customerId: Joi.number().integer().optional(),
  limit: Joi.number().integer().min(1).max(20).default(5),
});

const recommendationEventSchema = Joi.object({
  sessionId: Joi.string().max(100).optional(),
  sourceProductId: Joi.number().integer().optional(),
  recommendedProductId: Joi.number().integer().required(),
  relationshipId: Joi.number().integer().optional(),
  ruleId: Joi.number().integer().optional(),
  recommendationType: Joi.string()
    .valid('bought_together', 'accessory', 'upgrade', 'alternative', 'rule', 'history')
    .optional(),
  eventType: Joi.string()
    .valid('impression', 'click', 'add_to_cart', 'purchase')
    .required(),
  position: Joi.number().integer().min(0).optional(),
  pageType: Joi.string().max(50).optional(),
  deviceType: Joi.string().valid('desktop', 'mobile', 'tablet', 'pos').optional(),
});

const metricsSchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  groupBy: Joi.string().valid('type', 'rule', 'product').default('type'),
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/recommendations/product/:id
 * Get recommendations for a single product
 */
router.get(
  '/product/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.id, 10);
    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    const limit = parseInt(req.query.limit, 10) || 5;
    const types = req.query.types
      ? req.query.types.split(',')
      : ['accessory', 'bought_together', 'upgrade', 'alternative'];

    const result = await recommendationService.getProductRecommendations(productId, {
      limit: Math.min(limit, 20),
      types,
      includeOutOfStock: req.query.includeOutOfStock === 'true',
    });

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/recommendations/cart
 * Get recommendations based on cart contents
 */
router.post(
  '/cart',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { error, value } = cartRecommendationsSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map((d) => ({
          field: d.path.join('.'),
          message: d.message,
        })),
      });
    }

    const { items, customerId, limit } = value;

    // Use authenticated customer if available and not specified
    const effectiveCustomerId = customerId || req.user?.customerId || null;

    const result = await recommendationService.getCartRecommendations(items, {
      customerId: effectiveCustomerId,
      limit,
    });

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * GET /api/recommendations/cross-sell/:id
 * Get cross-sell suggestions for checkout upsell
 */
router.get(
  '/cross-sell/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.id, 10);
    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    const limit = parseInt(req.query.limit, 10) || 3;

    // Only include margin data for admin/manager
    const includeMarginData =
      req.query.includeMargin === 'true' &&
      req.user &&
      ['admin', 'manager'].includes(req.user.role);

    const result = await recommendationService.getCrossSellSuggestions(productId, {
      limit: Math.min(limit, 10),
      includeMarginData,
    });

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/recommendations/record-purchase/:orderId
 * Record purchase patterns after order completion
 * Called asynchronously - returns immediately
 */
router.post(
  '/record-purchase/:orderId',
  authenticate,
  asyncHandler(async (req, res) => {
    const orderId = parseInt(req.params.orderId, 10);
    if (isNaN(orderId)) {
      throw ApiError.badRequest('Invalid order ID');
    }

    // Start async processing
    recommendationService
      .recordPurchasePattern(orderId)
      .then((result) => {
        console.log('[Recommendations] Purchase pattern recorded:', result);
      })
      .catch((error) => {
        console.error('[Recommendations] Purchase pattern error:', error);
      });

    // Return immediately
    res.json({
      success: true,
      message: 'Purchase pattern recording initiated',
      orderId,
    });
  })
);

/**
 * POST /api/recommendations/refresh
 * Trigger recommendation refresh (admin only)
 * Normally run as a scheduled job
 */
router.post(
  '/refresh',
  authenticate,
  asyncHandler(async (req, res) => {
    // Admin only
    if (!['admin', 'manager'].includes(req.user.role)) {
      throw ApiError.forbidden('Admin access required');
    }

    const minCoPurchases = parseInt(req.body.minCoPurchases, 10) || 2;
    const minConfidence = parseFloat(req.body.minConfidence) || 0.05;

    const result = await recommendationService.refreshRecommendations({
      minCoPurchases,
      minConfidence,
    });

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/recommendations/events
 * Record recommendation event (impression, click, add-to-cart, purchase)
 */
router.post(
  '/events',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { error, value } = recommendationEventSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map((d) => ({
          field: d.path.join('.'),
          message: d.message,
        })),
      });
    }

    // Add user context if available
    const event = {
      ...value,
      userId: req.user?.id || null,
      customerId: req.user?.customerId || value.customerId || null,
    };

    // Fire and forget - don't wait for analytics
    recommendationService.recordRecommendationEvent(event).catch((err) => {
      console.error('[Recommendations] Event recording error:', err);
    });

    res.json({
      success: true,
      message: 'Event recorded',
    });
  })
);

/**
 * GET /api/recommendations/metrics
 * Get recommendation performance metrics (admin only)
 */
router.get(
  '/metrics',
  authenticate,
  asyncHandler(async (req, res) => {
    // Admin only
    if (!['admin', 'manager'].includes(req.user.role)) {
      throw ApiError.forbidden('Admin access required');
    }

    const { error, value } = metricsSchema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map((d) => ({
          field: d.path.join('.'),
          message: d.message,
        })),
      });
    }

    const result = await recommendationService.getPerformanceMetrics(value);

    res.json({
      success: true,
      data: result,
    });
  })
);

// ============================================================================
// RELATIONSHIP MANAGEMENT ROUTES (Admin)
// ============================================================================

/**
 * GET /api/recommendations/relationships
 * List product relationships with filtering
 */
router.get(
  '/relationships',
  authenticate,
  asyncHandler(async (req, res) => {
    const {
      productId,
      type,
      curated,
      page = 1,
      limit = 20,
    } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (productId) {
      whereClause += ` AND (pr.product_id = $${paramIndex} OR pr.related_product_id = $${paramIndex})`;
      params.push(parseInt(productId, 10));
      paramIndex++;
    }

    if (type) {
      whereClause += ` AND pr.relationship_type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (curated !== undefined) {
      whereClause += ` AND pr.is_curated = $${paramIndex}`;
      params.push(curated === 'true');
      paramIndex++;
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const pool = recommendationService.pool;

    const [countResult, dataResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FROM product_relationships pr ${whereClause}`,
        params
      ),
      pool.query(
        `
        SELECT
          pr.*,
          p1.name as product_name,
          p1.sku as product_sku,
          p2.name as related_product_name,
          p2.sku as related_product_sku,
          p2.price as related_product_price
        FROM product_relationships pr
        JOIN products p1 ON pr.product_id = p1.id
        JOIN products p2 ON pr.related_product_id = p2.id
        ${whereClause}
        ORDER BY pr.is_curated DESC, pr.strength DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `,
        [...params, parseInt(limit, 10), offset]
      ),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    res.json({
      success: true,
      data: dataResult.rows.map((row) => ({
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        productSku: row.product_sku,
        relatedProductId: row.related_product_id,
        relatedProductName: row.related_product_name,
        relatedProductSku: row.related_product_sku,
        relatedProductPrice: parseFloat(row.related_product_price),
        relationshipType: row.relationship_type,
        strength: parseFloat(row.strength),
        isCurated: row.is_curated,
        isActive: row.is_active,
        source: row.source,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  })
);

/**
 * POST /api/recommendations/relationships
 * Create a curated product relationship
 */
router.post(
  '/relationships',
  authenticate,
  asyncHandler(async (req, res) => {
    // Manager/Admin only
    if (!['admin', 'manager'].includes(req.user.role)) {
      throw ApiError.forbidden('Manager access required');
    }

    const schema = Joi.object({
      productId: Joi.number().integer().required(),
      relatedProductId: Joi.number().integer().required(),
      relationshipType: Joi.string()
        .valid('bought_together', 'accessory', 'upgrade', 'alternative')
        .required(),
      strength: Joi.number().min(0).max(1).default(0.8),
      displayOrder: Joi.number().integer().default(0),
      notes: Joi.string().max(500).optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    if (value.productId === value.relatedProductId) {
      throw ApiError.badRequest('Product cannot be related to itself');
    }

    const pool = recommendationService.pool;

    const result = await pool.query(
      `
      INSERT INTO product_relationships (
        product_id, related_product_id, relationship_type,
        strength, is_curated, display_order, notes, source, created_by
      ) VALUES ($1, $2, $3, $4, true, $5, $6, 'manual', $7)
      ON CONFLICT (product_id, related_product_id, relationship_type)
      DO UPDATE SET
        strength = EXCLUDED.strength,
        display_order = EXCLUDED.display_order,
        notes = EXCLUDED.notes,
        is_curated = true,
        is_active = true,
        updated_at = NOW()
      RETURNING *
      `,
      [
        value.productId,
        value.relatedProductId,
        value.relationshipType,
        value.strength,
        value.displayOrder,
        value.notes || null,
        req.user.id,
      ]
    );

    // Invalidate cache
    await recommendationService.cacheInvalidate(`rec:product:${value.productId}:*`);

    res.status(201).json({
      success: true,
      data: {
        id: result.rows[0].id,
        ...value,
        isCurated: true,
        isActive: true,
      },
    });
  })
);

/**
 * PUT /api/recommendations/relationships/:id
 * Update a product relationship
 */
router.put(
  '/relationships/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    // Manager/Admin only
    if (!['admin', 'manager'].includes(req.user.role)) {
      throw ApiError.forbidden('Manager access required');
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw ApiError.badRequest('Invalid relationship ID');
    }

    const schema = Joi.object({
      strength: Joi.number().min(0).max(1).optional(),
      displayOrder: Joi.number().integer().optional(),
      isActive: Joi.boolean().optional(),
      notes: Joi.string().max(500).optional().allow('', null),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const pool = recommendationService.pool;

    // Build update query
    const updates = [];
    const params = [id];
    let paramIndex = 2;

    if (value.strength !== undefined) {
      updates.push(`strength = $${paramIndex++}`);
      params.push(value.strength);
    }
    if (value.displayOrder !== undefined) {
      updates.push(`display_order = $${paramIndex++}`);
      params.push(value.displayOrder);
    }
    if (value.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(value.isActive);
    }
    if (value.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(value.notes || null);
    }

    if (updates.length === 0) {
      throw ApiError.badRequest('No fields to update');
    }

    updates.push('updated_at = NOW()');

    const result = await pool.query(
      `
      UPDATE product_relationships
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING product_id
      `,
      params
    );

    if (result.rowCount === 0) {
      throw ApiError.notFound('Relationship');
    }

    // Invalidate cache
    await recommendationService.cacheInvalidate(
      `rec:product:${result.rows[0].product_id}:*`
    );

    res.json({
      success: true,
      message: 'Relationship updated',
    });
  })
);

/**
 * DELETE /api/recommendations/relationships/:id
 * Delete a product relationship (curated only)
 */
router.delete(
  '/relationships/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    // Manager/Admin only
    if (!['admin', 'manager'].includes(req.user.role)) {
      throw ApiError.forbidden('Manager access required');
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw ApiError.badRequest('Invalid relationship ID');
    }

    const pool = recommendationService.pool;

    const result = await pool.query(
      `
      DELETE FROM product_relationships
      WHERE id = $1 AND is_curated = true
      RETURNING product_id
      `,
      [id]
    );

    if (result.rowCount === 0) {
      throw ApiError.badRequest(
        'Relationship not found or cannot delete auto-generated relationships'
      );
    }

    // Invalidate cache
    await recommendationService.cacheInvalidate(
      `rec:product:${result.rows[0].product_id}:*`
    );

    res.json({
      success: true,
      message: 'Relationship deleted',
    });
  })
);

// ============================================================================
// RECOMMENDATION RULES ROUTES (Admin)
// ============================================================================

/**
 * GET /api/recommendations/rules
 * List recommendation rules
 */
router.get(
  '/rules',
  authenticate,
  asyncHandler(async (req, res) => {
    const { active, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const pool = recommendationService.pool;

    let whereClause = '';
    const params = [];

    if (active !== undefined) {
      whereClause = 'WHERE rr.is_active = $1';
      params.push(active === 'true');
    }

    const result = await pool.query(
      `
      SELECT
        rr.*,
        sc.name as source_category_name,
        sp.name as source_product_name,
        tc.name as target_category_name,
        tp.name as target_product_name
      FROM recommendation_rules rr
      LEFT JOIN categories sc ON rr.source_category_id = sc.id
      LEFT JOIN products sp ON rr.source_product_id = sp.id
      LEFT JOIN categories tc ON rr.target_category_id = tc.id
      LEFT JOIN products tp ON rr.target_product_id = tp.id
      ${whereClause}
      ORDER BY rr.priority DESC, rr.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, parseInt(limit, 10), offset]
    );

    res.json({
      success: true,
      data: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        ruleType: row.rule_type,
        sourceCategory: row.source_category_id
          ? { id: row.source_category_id, name: row.source_category_name }
          : null,
        sourceProduct: row.source_product_id
          ? { id: row.source_product_id, name: row.source_product_name }
          : null,
        targetCategory: row.target_category_id
          ? { id: row.target_category_id, name: row.target_category_name }
          : null,
        targetProduct: row.target_product_id
          ? { id: row.target_product_id, name: row.target_product_name }
          : null,
        priority: row.priority,
        maxRecommendations: row.max_recommendations,
        minPrice: row.min_price ? parseFloat(row.min_price) : null,
        maxPrice: row.max_price ? parseFloat(row.max_price) : null,
        requireStock: row.require_stock,
        isActive: row.is_active,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        createdAt: row.created_at,
      })),
    });
  })
);

/**
 * POST /api/recommendations/rules
 * Create a recommendation rule
 */
router.post(
  '/rules',
  authenticate,
  asyncHandler(async (req, res) => {
    // Admin only
    if (req.user.role !== 'admin') {
      throw ApiError.forbidden('Admin access required');
    }

    const schema = Joi.object({
      name: Joi.string().max(200).required(),
      description: Joi.string().max(500).optional(),
      sourceCategoryId: Joi.number().integer().optional(),
      sourceProductId: Joi.number().integer().optional(),
      targetCategoryId: Joi.number().integer().optional(),
      targetProductId: Joi.number().integer().optional(),
      priority: Joi.number().integer().min(0).max(100).default(50),
      maxRecommendations: Joi.number().integer().min(1).max(10).default(3),
      minPrice: Joi.number().positive().optional(),
      maxPrice: Joi.number().positive().optional(),
      requireStock: Joi.boolean().default(true),
      validFrom: Joi.date().iso().optional(),
      validUntil: Joi.date().iso().optional(),
    })
      .or('sourceCategoryId', 'sourceProductId')
      .or('targetCategoryId', 'targetProductId');

    const { error, value } = schema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    // Determine rule type
    let ruleType = 'category_to_category';
    if (value.sourceProductId && value.targetProductId) {
      ruleType = 'product_to_product';
    } else if (value.sourceProductId) {
      ruleType = 'product_to_category';
    } else if (value.targetProductId) {
      ruleType = 'category_to_product';
    }

    const pool = recommendationService.pool;

    const result = await pool.query(
      `
      INSERT INTO recommendation_rules (
        name, description, rule_type,
        source_category_id, source_product_id,
        target_category_id, target_product_id,
        priority, max_recommendations, min_price, max_price,
        require_stock, valid_from, valid_until, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
      `,
      [
        value.name,
        value.description || null,
        ruleType,
        value.sourceCategoryId || null,
        value.sourceProductId || null,
        value.targetCategoryId || null,
        value.targetProductId || null,
        value.priority,
        value.maxRecommendations,
        value.minPrice || null,
        value.maxPrice || null,
        value.requireStock,
        value.validFrom || null,
        value.validUntil || null,
        req.user.id,
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.rows[0].id,
        ...value,
        ruleType,
      },
    });
  })
);

/**
 * PUT /api/recommendations/rules/:id
 * Update a recommendation rule
 */
router.put(
  '/rules/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    // Admin only
    if (req.user.role !== 'admin') {
      throw ApiError.forbidden('Admin access required');
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw ApiError.badRequest('Invalid rule ID');
    }

    const schema = Joi.object({
      name: Joi.string().max(200).optional(),
      description: Joi.string().max(500).optional().allow('', null),
      priority: Joi.number().integer().min(0).max(100).optional(),
      maxRecommendations: Joi.number().integer().min(1).max(10).optional(),
      minPrice: Joi.number().positive().optional().allow(null),
      maxPrice: Joi.number().positive().optional().allow(null),
      requireStock: Joi.boolean().optional(),
      isActive: Joi.boolean().optional(),
      validFrom: Joi.date().iso().optional().allow(null),
      validUntil: Joi.date().iso().optional().allow(null),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const pool = recommendationService.pool;

    // Build update query dynamically
    const updates = [];
    const params = [id];
    let paramIndex = 2;

    const fieldMap = {
      name: 'name',
      description: 'description',
      priority: 'priority',
      maxRecommendations: 'max_recommendations',
      minPrice: 'min_price',
      maxPrice: 'max_price',
      requireStock: 'require_stock',
      isActive: 'is_active',
      validFrom: 'valid_from',
      validUntil: 'valid_until',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (value[key] !== undefined) {
        updates.push(`${column} = $${paramIndex++}`);
        params.push(value[key]);
      }
    }

    if (updates.length === 0) {
      throw ApiError.badRequest('No fields to update');
    }

    updates.push('updated_at = NOW()');

    const result = await pool.query(
      `UPDATE recommendation_rules SET ${updates.join(', ')} WHERE id = $1 RETURNING id`,
      params
    );

    if (result.rowCount === 0) {
      throw ApiError.notFound('Rule');
    }

    res.json({
      success: true,
      message: 'Rule updated',
    });
  })
);

/**
 * DELETE /api/recommendations/rules/:id
 * Delete a recommendation rule
 */
router.delete(
  '/rules/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    // Admin only
    if (req.user.role !== 'admin') {
      throw ApiError.forbidden('Admin access required');
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw ApiError.badRequest('Invalid rule ID');
    }

    const pool = recommendationService.pool;

    const result = await pool.query(
      'DELETE FROM recommendation_rules WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rowCount === 0) {
      throw ApiError.notFound('Rule');
    }

    res.json({
      success: true,
      message: 'Rule deleted',
    });
  })
);

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize routes with dependencies
 * @param {object} deps - Dependencies
 * @param {Pool} deps.pool - PostgreSQL connection pool
 * @param {object} deps.redis - Redis client (optional)
 * @param {object} deps.cache - Cache module (optional)
 * @returns {Router} Express router instance
 */
const init = (deps) => {
  recommendationService = new RecommendationService(deps.pool, {
    redis: deps.redis || null,
    cache: deps.cache || null,
  });

  return router;
};

module.exports = { init, RecommendationService };
