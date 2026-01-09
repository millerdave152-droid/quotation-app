/**
 * Advanced Pricing Routes
 * Handles volume discounts, promotions, and price calculations
 * Uses consistent error handling with asyncHandler and ApiError
 */

const express = require('express');
const router = express.Router();
const advancedPricingService = require('../services/AdvancedPricingService');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

// ==================== VOLUME DISCOUNT RULES ====================

/**
 * GET /api/pricing/volume-rules
 * Get all volume discount rules
 */
router.get('/volume-rules', asyncHandler(async (req, res) => {
  const { isActive, scopeType, includeExpired } = req.query;

  const rules = await advancedPricingService.getVolumeDiscountRules({
    isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    scopeType,
    includeExpired: includeExpired === 'true'
  });

  res.json(rules);
}));

/**
 * GET /api/pricing/volume-rules/:id
 * Get a single volume discount rule
 */
router.get('/volume-rules/:id', asyncHandler(async (req, res) => {
  const rule = await advancedPricingService.getVolumeDiscountRuleById(req.params.id);

  if (!rule) {
    throw ApiError.notFound('Volume discount rule');
  }

  res.json(rule);
}));

/**
 * POST /api/pricing/volume-rules
 * Create a new volume discount rule
 */
router.post('/volume-rules', asyncHandler(async (req, res) => {
  const { name, tiers } = req.body;

  if (!name) {
    throw ApiError.badRequest('Rule name is required');
  }

  if (!tiers || tiers.length === 0) {
    throw ApiError.badRequest('At least one discount tier is required');
  }

  // Validate tiers
  for (const tier of tiers) {
    if (tier.min_quantity === undefined || tier.discount_value === undefined) {
      throw ApiError.badRequest('Each tier must have min_quantity and discount_value');
    }
  }

  const rule = await advancedPricingService.createVolumeDiscountRule({
    name,
    description: req.body.description,
    scope_type: req.body.scope_type,
    scope_product_id: req.body.scope_product_id,
    scope_category: req.body.scope_category,
    scope_manufacturer: req.body.scope_manufacturer,
    discount_type: req.body.discount_type,
    is_active: req.body.is_active,
    valid_from: req.body.valid_from,
    valid_until: req.body.valid_until,
    priority: req.body.priority,
    can_stack: req.body.can_stack,
    stacking_group: req.body.stacking_group,
    tiers
  });

  res.status(201).json(rule);
}));

/**
 * PUT /api/pricing/volume-rules/:id
 * Update a volume discount rule
 */
router.put('/volume-rules/:id', asyncHandler(async (req, res) => {
  const rule = await advancedPricingService.updateVolumeDiscountRule(req.params.id, req.body);

  if (!rule) {
    throw ApiError.notFound('Volume discount rule');
  }

  res.json(rule);
}));

/**
 * DELETE /api/pricing/volume-rules/:id
 * Delete a volume discount rule
 */
router.delete('/volume-rules/:id', asyncHandler(async (req, res) => {
  const deleted = await advancedPricingService.deleteVolumeDiscountRule(req.params.id);

  if (!deleted) {
    throw ApiError.notFound('Volume discount rule');
  }

  res.json({ message: 'Volume discount rule deleted successfully' });
}));

/**
 * GET /api/pricing/volume-rules/applicable/:productId
 * Get applicable volume discount rules for a product
 */
router.get('/volume-rules/applicable/:productId', asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId);

  if (isNaN(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const { category, manufacturer } = req.query;

  const rules = await advancedPricingService.getApplicableVolumeRules(
    productId,
    category,
    manufacturer
  );

  res.json(rules);
}));

// ==================== PROMOTIONS ====================

/**
 * GET /api/pricing/promotions
 * Get all promotions
 */
router.get('/promotions', asyncHandler(async (req, res) => {
  const { isActive, promoType, includeExpired } = req.query;

  const promotions = await advancedPricingService.getPromotions({
    isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    promoType,
    includeExpired: includeExpired === 'true'
  });

  res.json(promotions);
}));

/**
 * GET /api/pricing/promotions/active
 * Get currently active auto-apply promotions
 */
router.get('/promotions/active', asyncHandler(async (req, res) => {
  const { productIds, customerId } = req.query;

  const productIdArray = productIds ? productIds.split(',').map(id => parseInt(id)) : [];
  const promotions = await advancedPricingService.getActivePromotions(productIdArray, customerId);

  res.json(promotions);
}));

/**
 * POST /api/pricing/promotions
 * Create a new promotion
 */
router.post('/promotions', asyncHandler(async (req, res) => {
  const { promo_name, discount_type, discount_value, start_date, end_date } = req.body;

  if (!promo_name) {
    throw ApiError.badRequest('Promotion name is required');
  }

  if (!discount_type || discount_value === undefined) {
    throw ApiError.badRequest('Discount type and value are required');
  }

  if (!start_date || !end_date) {
    throw ApiError.badRequest('Start and end dates are required');
  }

  const promotion = await advancedPricingService.createPromotion({
    promo_code: req.body.promo_code,
    promo_name,
    description: req.body.description,
    promo_type: req.body.promo_type,
    scope_type: req.body.scope_type,
    scope_value: req.body.scope_value,
    discount_type,
    discount_value,
    start_date,
    end_date,
    auto_activate: req.body.auto_activate,
    max_uses_total: req.body.max_uses_total,
    max_uses_per_customer: req.body.max_uses_per_customer,
    min_purchase_cents: req.body.min_purchase_cents,
    max_discount_cents: req.body.max_discount_cents,
    min_quantity: req.body.min_quantity,
    can_stack: req.body.can_stack,
    stacking_group: req.body.stacking_group
  });

  res.status(201).json(promotion);
}));

/**
 * PUT /api/pricing/promotions/:id
 * Update a promotion
 */
router.put('/promotions/:id', asyncHandler(async (req, res) => {
  const promotion = await advancedPricingService.updatePromotion(req.params.id, req.body);

  if (!promotion) {
    throw ApiError.notFound('Promotion');
  }

  res.json(promotion);
}));

/**
 * DELETE /api/pricing/promotions/:id
 * Delete a promotion
 */
router.delete('/promotions/:id', asyncHandler(async (req, res) => {
  const deleted = await advancedPricingService.deletePromotion(req.params.id);

  if (!deleted) {
    throw ApiError.notFound('Promotion');
  }

  res.json({ message: 'Promotion deleted successfully' });
}));

/**
 * POST /api/pricing/promotions/validate-code
 * Validate a promo code
 */
router.post('/promotions/validate-code', asyncHandler(async (req, res) => {
  const { code, customerId, cartTotal, cartItems } = req.body;

  if (!code) {
    throw ApiError.badRequest('Promo code is required');
  }

  const validation = await advancedPricingService.validatePromoCode(
    code,
    customerId,
    cartTotal || 0,
    cartItems || []
  );

  res.json(validation);
}));

/**
 * GET /api/pricing/promotions/:id/usage
 * Get promotion usage history
 */
router.get('/promotions/:id/usage', asyncHandler(async (req, res) => {
  const usage = await advancedPricingService.getPromotionUsage(req.params.id);
  res.json(usage);
}));

// ==================== PRICE CALCULATION ====================

/**
 * POST /api/pricing/calculate
 * Calculate price for a single product
 */
router.post('/calculate', asyncHandler(async (req, res) => {
  const { productId, quantity, customerId, promoCode } = req.body;

  if (!productId || !quantity) {
    throw ApiError.badRequest('Product ID and quantity are required');
  }

  const calculation = await advancedPricingService.calculateProductPrice(
    productId,
    quantity,
    customerId,
    { promoCode }
  );

  res.json(calculation);
}));

/**
 * POST /api/pricing/calculate-quote
 * Calculate totals for a quote
 */
router.post('/calculate-quote', asyncHandler(async (req, res) => {
  const { items, customerId, promoCode } = req.body;

  if (!items || items.length === 0) {
    throw ApiError.badRequest('At least one item is required');
  }

  // Validate items
  for (const item of items) {
    if (!item.productId || !item.quantity) {
      throw ApiError.badRequest('Each item must have productId and quantity');
    }
  }

  const calculation = await advancedPricingService.calculateQuoteTotals(
    items,
    customerId,
    promoCode
  );

  res.json(calculation);
}));

/**
 * GET /api/pricing/stacking-policy
 * Get the active stacking policy
 */
router.get('/stacking-policy', asyncHandler(async (req, res) => {
  const policy = await advancedPricingService.getStackingPolicy();
  res.json(policy);
}));

module.exports = router;
