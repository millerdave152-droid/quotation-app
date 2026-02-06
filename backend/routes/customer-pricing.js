/**
 * TeleTime - Customer Pricing Routes
 *
 * API endpoints for customer-specific pricing operations
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const CustomerPricingService = require('../services/CustomerPricingService');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================

let pool = null;
let cache = null;
let pricingService = null;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const calculatePriceSchema = Joi.object({
  customerId: Joi.number().integer().optional().allow(null),
  productId: Joi.number().integer().required(),
  quantity: Joi.number().integer().min(1).default(1),
});

const bulkPriceSchema = Joi.object({
  customerId: Joi.number().integer().optional().allow(null),
  items: Joi.array()
    .items(
      Joi.object({
        productId: Joi.number().integer().required(),
        quantity: Joi.number().integer().min(1).default(1),
      })
    )
    .min(1)
    .required(),
});

const setProductPriceSchema = Joi.object({
  pricingType: Joi.string()
    .valid('fixed', 'discount_percent', 'cost_plus_percent')
    .required(),
  fixedPriceCents: Joi.number().integer().min(0).when('pricingType', {
    is: 'fixed',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  discountPercent: Joi.number().min(0).max(100).when('pricingType', {
    is: 'discount_percent',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  costPlusPercent: Joi.number().min(0).max(200).when('pricingType', {
    is: 'cost_plus_percent',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  effectiveFrom: Joi.date().iso().optional(),
  effectiveTo: Joi.date().iso().optional(),
  notes: Joi.string().max(500).optional().allow('', null),
});

const requestOverrideSchema = Joi.object({
  transactionId: Joi.number().integer().optional().allow(null),
  quoteId: Joi.number().integer().optional().allow(null),
  productId: Joi.number().integer().required(),
  customerId: Joi.number().integer().optional().allow(null),
  originalPriceCents: Joi.number().integer().required(),
  customerTierPriceCents: Joi.number().integer().optional().allow(null),
  overridePriceCents: Joi.number().integer().required(),
  overrideReason: Joi.string().min(3).max(500).required(),
});

const approveOverrideSchema = Joi.object({
  notes: Joi.string().max(500).optional().allow('', null),
});

const rejectOverrideSchema = Joi.object({
  reason: Joi.string().min(3).max(500).required(),
});

const setTierSchema = Joi.object({
  tier: Joi.string()
    .valid('retail', 'wholesale', 'vip', 'contractor', 'dealer', 'employee', 'cost_plus')
    .required(),
});

// ============================================================================
// PRICING LOOKUP ROUTES
// ============================================================================

/**
 * GET /api/customer-pricing/info/:customerId
 * Get customer's pricing configuration
 */
router.get(
  '/info/:customerId',
  authenticate,
  asyncHandler(async (req, res) => {
    const customerId = parseInt(req.params.customerId);
    const info = await pricingService.getCustomerPricingInfo(customerId);

    res.json({
      success: true,
      data: info,
    });
  })
);

/**
 * POST /api/customer-pricing/calculate
 * Calculate customer-specific price for a product
 */
router.post(
  '/calculate',
  authenticate,
  asyncHandler(async (req, res) => {
    const { error, value } = calculatePriceSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const { customerId, productId, quantity } = value;
    const priceInfo = await pricingService.calculateCustomerPrice(
      customerId,
      productId,
      quantity
    );

    if (!priceInfo) {
      throw ApiError.notFound('Product');
    }

    res.json({
      success: true,
      data: priceInfo,
    });
  })
);

/**
 * POST /api/customer-pricing/calculate-bulk
 * Calculate prices for multiple products
 */
router.post(
  '/calculate-bulk',
  authenticate,
  asyncHandler(async (req, res) => {
    const { error, value } = bulkPriceSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const { customerId, items } = value;
    const result = await pricingService.calculateBulkPrices(customerId, items);

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * GET /api/customer-pricing/volume-discounts/:productId
 * Get volume discounts for a product
 */
router.get(
  '/volume-discounts/:productId',
  authenticate,
  asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);
    const customerId = req.query.customerId
      ? parseInt(req.query.customerId)
      : null;

    const discounts = await pricingService.getVolumeDiscounts(
      productId,
      customerId
    );

    res.json({
      success: true,
      data: discounts,
    });
  })
);

// ============================================================================
// CUSTOMER PRICING RULES ROUTES
// ============================================================================

/**
 * GET /api/customer-pricing/customer/:customerId/products
 * Get customer's specific product prices
 */
router.get(
  '/customer/:customerId/products',
  authenticate,
  asyncHandler(async (req, res) => {
    const customerId = parseInt(req.params.customerId);
    const prices = await pricingService.getCustomerProductPrices(customerId);

    res.json({
      success: true,
      data: prices,
    });
  })
);

/**
 * POST /api/customer-pricing/customer/:customerId/product/:productId
 * Set customer-specific product price
 */
router.post(
  '/customer/:customerId/product/:productId',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const { error, value } = setProductPriceSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const customerId = parseInt(req.params.customerId);
    const productId = parseInt(req.params.productId);

    const result = await pricingService.setCustomerProductPrice(
      customerId,
      productId,
      value,
      req.user.id
    );

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * DELETE /api/customer-pricing/customer/:customerId/product/:productId
 * Remove customer-specific product price
 */
router.delete(
  '/customer/:customerId/product/:productId',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const customerId = parseInt(req.params.customerId);
    const productId = parseInt(req.params.productId);

    const result = await pricingService.removeCustomerProductPrice(
      customerId,
      productId,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Customer product price removed',
    });
  })
);

// ============================================================================
// TIER ROUTES
// ============================================================================

/**
 * GET /api/customer-pricing/tiers
 * Get all pricing tiers
 */
router.get(
  '/tiers',
  authenticate,
  asyncHandler(async (req, res) => {
    const tiers = await pricingService.getPricingTiers();

    res.json({
      success: true,
      data: tiers,
    });
  })
);

/**
 * PUT /api/customer-pricing/customer/:customerId/tier
 * Set customer's pricing tier
 */
router.put(
  '/customer/:customerId/tier',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const { error, value } = setTierSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const customerId = parseInt(req.params.customerId);
    const result = await pricingService.setCustomerTier(
      customerId,
      value.tier,
      req.user.id
    );

    res.json({
      success: true,
      message: `Customer tier updated to ${value.tier}`,
    });
  })
);

// ============================================================================
// PRICE OVERRIDE ROUTES
// ============================================================================

/**
 * POST /api/customer-pricing/override/check
 * Check if override requires approval
 */
router.post(
  '/override/check',
  authenticate,
  asyncHandler(async (req, res) => {
    const { customerId, originalPriceCents, overridePriceCents } = req.body;

    const check = await pricingService.checkOverrideRequiresApproval(
      customerId,
      originalPriceCents,
      overridePriceCents
    );

    res.json({
      success: true,
      data: check,
    });
  })
);

/**
 * POST /api/customer-pricing/override/request
 * Request a price override
 */
router.post(
  '/override/request',
  authenticate,
  asyncHandler(async (req, res) => {
    const { error, value } = requestOverrideSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const result = await pricingService.requestPriceOverride({
      ...value,
      userId: req.user.id,
      ipAddress: req.ip,
      sessionId: req.sessionID,
    });

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * GET /api/customer-pricing/override/pending
 * Get pending overrides for approval
 */
router.get(
  '/override/pending',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const overrides = await pricingService.getPendingOverrides({
      limit,
      offset,
    });

    res.json({
      success: true,
      data: overrides,
    });
  })
);

/**
 * POST /api/customer-pricing/override/:id/approve
 * Approve a pending override
 */
router.post(
  '/override/:id/approve',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const { error, value } = approveOverrideSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const overrideId = parseInt(req.params.id);
    const result = await pricingService.approveOverride(
      overrideId,
      req.user.id,
      value.notes
    );

    if (!result.success) {
      throw ApiError.badRequest(result.error);
    }

    res.json({
      success: true,
      data: result.override,
    });
  })
);

/**
 * POST /api/customer-pricing/override/:id/reject
 * Reject a pending override
 */
router.post(
  '/override/:id/reject',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const { error, value } = rejectOverrideSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const overrideId = parseInt(req.params.id);
    const result = await pricingService.rejectOverride(
      overrideId,
      req.user.id,
      value.reason
    );

    if (!result.success) {
      throw ApiError.badRequest(result.error);
    }

    res.json({
      success: true,
      data: result.override,
    });
  })
);

/**
 * GET /api/customer-pricing/override/history
 * Get override history
 */
router.get(
  '/override/history',
  authenticate,
  asyncHandler(async (req, res) => {
    const options = {
      customerId: req.query.customerId
        ? parseInt(req.query.customerId)
        : undefined,
      productId: req.query.productId
        ? parseInt(req.query.productId)
        : undefined,
      userId: req.query.userId ? parseInt(req.query.userId) : undefined,
      status: req.query.status,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0,
    };

    const history = await pricingService.getOverrideHistory(options);

    res.json({
      success: true,
      data: history,
    });
  })
);

// ============================================================================
// INITIALIZATION
// ============================================================================

const init = (deps) => {
  pool = deps.pool;
  cache = deps.cache;
  pricingService = new CustomerPricingService(pool, cache);
  return router;
};

module.exports = { init };
