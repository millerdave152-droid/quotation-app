/**
 * Volume Pricing API Routes
 * Handles volume/quantity tier pricing for POS and quotes
 *
 * Endpoints:
 * - GET /api/pricing/volume/:productId - Get volume price for product
 * - POST /api/pricing/volume/cart - Get volume prices for cart (batch)
 * - GET /api/pricing/volume/:productId/tiers - Get product volume tiers
 * - POST /api/pricing/volume/:productId/tiers - Create product volume tier
 * - PUT /api/pricing/volume/tiers/:tierId - Update volume tier
 * - DELETE /api/pricing/volume/tiers/:tierId - Delete volume tier
 * - GET /api/pricing/volume/customer/:customerId/tiers - Get customer volume tiers
 * - POST /api/pricing/volume/customer/:customerId/tiers - Create customer volume tier
 * - GET /api/pricing/volume/products - List products with volume pricing
 * - GET /api/pricing/volume/:productId/preview - Preview all tier prices
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

module.exports = (pool, cache, volumeDiscountService) => {
  // ============================================================================
  // MAIN VOLUME PRICING API
  // ============================================================================

  /**
   * GET /api/pricing/volume/:productId
   * Get volume price for a product at specific quantity
   *
   * Query params:
   * - quantity (required): Number of units
   * - customerId (optional): Customer ID for customer-specific pricing
   */
  router.get('/:productId', authenticate, asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);
    const quantity = parseInt(req.query.quantity);
    const customerId = req.query.customerId ? parseInt(req.query.customerId) : null;

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    if (isNaN(quantity) || quantity <= 0) {
      throw ApiError.badRequest('Valid quantity is required');
    }

    const result = await volumeDiscountService.getVolumePrice(productId, quantity, customerId);

    if (!result.success) {
      throw ApiError.notFound(result.error);
    }

    res.json({
      success: true,
      data: result,
    });
  }));

  /**
   * POST /api/pricing/volume/cart
   * Get volume prices for multiple products (batch/cart)
   *
   * Body:
   * - items: Array of { productId, quantity }
   * - customerId (optional): Customer ID
   */
  router.post('/cart', authenticate, asyncHandler(async (req, res) => {
    const { items, customerId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw ApiError.badRequest('Items array is required');
    }

    // Validate items
    for (const item of items) {
      if (!item.productId || !item.quantity) {
        throw ApiError.badRequest('Each item must have productId and quantity');
      }
    }

    const result = await volumeDiscountService.getCartVolumePrices(
      items,
      customerId ? parseInt(customerId) : null
    );

    res.json({
      success: true,
      data: result,
    });
  }));

  // ============================================================================
  // PRODUCT VOLUME TIERS MANAGEMENT
  // ============================================================================

  /**
   * GET /api/pricing/volume/:productId/tiers
   * Get all volume tiers for a product
   */
  router.get('/:productId/tiers', authenticate, asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    const tiers = await volumeDiscountService.getProductVolumeTiers(productId);

    res.json({
      success: true,
      data: tiers,
    });
  }));

  /**
   * POST /api/pricing/volume/:productId/tiers
   * Create a new volume tier for a product
   *
   * Body:
   * - minQty: Minimum quantity for this tier
   * - maxQty: Maximum quantity (null for unlimited)
   * - priceCents: Fixed price per unit (mutually exclusive with discountPercent)
   * - discountPercent: Percentage off base price
   * - tierName: Display name for tier
   */
  router.post('/:productId/tiers', authenticate, asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    const { minQty, maxQty, priceCents, discountPercent, tierName } = req.body;

    if (!minQty || minQty <= 0) {
      throw ApiError.badRequest('Valid minQty is required');
    }

    if (!priceCents && !discountPercent) {
      throw ApiError.badRequest('Either priceCents or discountPercent is required');
    }

    if (priceCents && discountPercent) {
      throw ApiError.badRequest('Specify either priceCents or discountPercent, not both');
    }

    try {
      const tier = await volumeDiscountService.createProductVolumeTier(
        productId,
        { minQty, maxQty, priceCents, discountPercent, tierName },
        req.user?.id || req.body.userId
      );

      res.status(201).json({
        success: true,
        data: tier,
      });
    } catch (error) {
      throw ApiError.badRequest(error.message);
    }
  }));

  /**
   * PUT /api/pricing/volume/tiers/:tierId
   * Update an existing volume tier
   */
  router.put('/tiers/:tierId', authenticate, asyncHandler(async (req, res) => {
    const tierId = parseInt(req.params.tierId);

    if (isNaN(tierId)) {
      throw ApiError.badRequest('Invalid tier ID');
    }

    const { minQty, maxQty, priceCents, discountPercent, tierName, isActive } = req.body;

    const tier = await volumeDiscountService.updateProductVolumeTier(tierId, {
      minQty,
      maxQty,
      priceCents,
      discountPercent,
      tierName,
      isActive,
    });

    if (!tier) {
      throw ApiError.notFound('Volume tier not found');
    }

    res.json({
      success: true,
      data: tier,
    });
  }));

  /**
   * DELETE /api/pricing/volume/tiers/:tierId
   * Delete a volume tier
   */
  router.delete('/tiers/:tierId', authenticate, asyncHandler(async (req, res) => {
    const tierId = parseInt(req.params.tierId);

    if (isNaN(tierId)) {
      throw ApiError.badRequest('Invalid tier ID');
    }

    const deleted = await volumeDiscountService.deleteProductVolumeTier(tierId);

    if (!deleted) {
      throw ApiError.notFound('Volume tier not found');
    }

    res.json({
      success: true,
      message: 'Volume tier deleted',
    });
  }));

  // ============================================================================
  // CUSTOMER VOLUME TIERS
  // ============================================================================

  /**
   * GET /api/pricing/volume/customer/:customerId/tiers
   * Get customer-specific volume tiers
   */
  router.get('/customer/:customerId/tiers', authenticate, asyncHandler(async (req, res) => {
    const customerId = parseInt(req.params.customerId);
    const productId = req.query.productId ? parseInt(req.query.productId) : null;

    if (isNaN(customerId)) {
      throw ApiError.badRequest('Invalid customer ID');
    }

    const tiers = await volumeDiscountService.getCustomerVolumeTiers(customerId, productId);

    res.json({
      success: true,
      data: tiers,
    });
  }));

  /**
   * POST /api/pricing/volume/customer/:customerId/tiers
   * Create a customer-specific volume tier
   */
  router.post('/customer/:customerId/tiers', authenticate, asyncHandler(async (req, res) => {
    const customerId = parseInt(req.params.customerId);

    if (isNaN(customerId)) {
      throw ApiError.badRequest('Invalid customer ID');
    }

    const {
      productId,
      categoryId,
      minQty,
      maxQty,
      priceCents,
      discountPercent,
      effectiveFrom,
      effectiveTo,
      notes,
    } = req.body;

    if (!minQty || minQty <= 0) {
      throw ApiError.badRequest('Valid minQty is required');
    }

    const result = await volumeDiscountService.createCustomerVolumeTier(
      customerId,
      {
        productId,
        categoryId,
        minQty,
        maxQty,
        priceCents,
        discountPercent,
        effectiveFrom,
        effectiveTo,
        notes,
      },
      req.user?.id || req.body.userId
    );

    res.status(201).json({
      success: true,
      data: result,
    });
  }));

  // ============================================================================
  // TIER VOLUME OVERRIDES (Pricing tier-specific)
  // ============================================================================

  /**
   * GET /api/pricing/volume/tier-overrides/:pricingTier
   * Get volume overrides for a pricing tier (wholesale, dealer, etc.)
   */
  router.get('/tier-overrides/:pricingTier', authenticate, asyncHandler(async (req, res) => {
    const { pricingTier } = req.params;

    const validTiers = ['retail', 'wholesale', 'vip', 'contractor', 'dealer', 'employee', 'cost_plus'];
    if (!validTiers.includes(pricingTier)) {
      throw ApiError.badRequest('Invalid pricing tier');
    }

    const overrides = await volumeDiscountService.getTierVolumeOverrides(pricingTier);

    res.json({
      success: true,
      data: overrides,
    });
  }));

  /**
   * POST /api/pricing/volume/tier-overrides
   * Create a tier volume override
   */
  router.post('/tier-overrides', authenticate, asyncHandler(async (req, res) => {
    const {
      productId,
      pricingTier,
      minQty,
      maxQty,
      priceCents,
      discountPercent,
      additionalDiscountPercent,
      priority,
      effectiveFrom,
      effectiveTo,
    } = req.body;

    if (!pricingTier) {
      throw ApiError.badRequest('pricingTier is required');
    }

    if (!minQty || minQty <= 0) {
      throw ApiError.badRequest('Valid minQty is required');
    }

    const result = await volumeDiscountService.createTierVolumeOverride(
      {
        productId,
        pricingTier,
        minQty,
        maxQty,
        priceCents,
        discountPercent,
        additionalDiscountPercent,
        priority,
        effectiveFrom,
        effectiveTo,
      },
      req.user?.id || req.body.userId
    );

    res.status(201).json({
      success: true,
      data: result,
    });
  }));

  // ============================================================================
  // UTILITY ENDPOINTS
  // ============================================================================

  /**
   * GET /api/pricing/volume/products
   * List products that have volume pricing configured
   */
  router.get('/products', authenticate, asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const onlyActive = req.query.onlyActive !== 'false';

    const products = await volumeDiscountService.getProductsWithVolumePricing({
      limit,
      offset,
      onlyActive,
    });

    res.json({
      success: true,
      data: products,
    });
  }));

  /**
   * GET /api/pricing/volume/:productId/preview
   * Preview volume pricing across all tiers for a product
   * Useful for displaying a volume pricing table
   */
  router.get('/:productId/preview', authenticate, asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);
    const customerId = req.query.customerId ? parseInt(req.query.customerId) : null;

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    const preview = await volumeDiscountService.previewVolumePricing(productId, customerId);

    res.json({
      success: true,
      data: preview,
    });
  }));

  return router;
};
