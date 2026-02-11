/**
 * TeleTime - Tax Routes
 *
 * API endpoints for Canadian tax calculations
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

// Apply authentication to all tax routes
router.use(authenticate);

let _injectedTaxService;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const calculateTaxSchema = Joi.object({
  amountCents: Joi.number().integer().min(0).required(),
  provinceCode: Joi.string().length(2).uppercase().default('ON'),
  customerId: Joi.number().integer().optional(),
  productId: Joi.number().integer().optional(),
  isTaxExempt: Joi.boolean().default(false),
});

const calculateOrderTaxSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      productId: Joi.number().integer().optional(),
      unitPriceCents: Joi.number().integer().min(0).required(),
      quantity: Joi.number().integer().min(0).required(),
      lineTotalCents: Joi.number().integer().min(0).optional(),
      isTaxExempt: Joi.boolean().default(false),
    })
  ).min(1).required(),
  provinceCode: Joi.string().length(2).uppercase().default('ON'),
  customerId: Joi.number().integer().optional(),
  orderDiscountCents: Joi.number().integer().min(0).default(0),
});

const customerExemptionSchema = Joi.object({
  customerId: Joi.number().integer().required(),
  exemptionReasonId: Joi.number().integer().optional(),
  exemptionNumber: Joi.string().max(100).optional(),
  provinceCode: Joi.string().length(2).uppercase().optional(),
  validFrom: Joi.date().default(new Date()),
  validUntil: Joi.date().optional(),
  certificateFilePath: Joi.string().max(500).optional(),
  notes: Joi.string().optional(),
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

// taxService is set via init() before routes are used

// ============================================================================
// GET TAX RATES
// ============================================================================

/**
 * GET /api/tax/rates
 * Get all current tax rates by province
 */
router.get('/rates', asyncHandler(async (req, res) => {
  const taxService = _injectedTaxService;
  const rates = await taxService.getAllTaxRates();

  res.json({
    success: true,
    data: rates,
  });
}));

/**
 * GET /api/tax/rates/:provinceCode
 * Get tax rates for a specific province
 */
router.get('/rates/:provinceCode', asyncHandler(async (req, res) => {
  const { provinceCode } = req.params;
  const taxService = _injectedTaxService;
  const rates = await taxService.getTaxRates(provinceCode.toUpperCase());

  res.json({
    success: true,
    data: rates,
  });
}));

// ============================================================================
// TAX CALCULATIONS
// ============================================================================

/**
 * POST /api/tax/calculate
 * Calculate tax for a single amount
 */
router.post('/calculate', asyncHandler(async (req, res) => {
  const { error, value } = calculateTaxSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const taxService = _injectedTaxService;
  const result = await taxService.calculateTax(value);

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * POST /api/tax/calculate-order
 * Calculate tax for an order with multiple items
 */
router.post('/calculate-order', asyncHandler(async (req, res) => {
  const { error, value } = calculateOrderTaxSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const taxService = _injectedTaxService;
  const result = await taxService.calculateOrderTax(value);

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * GET /api/tax/add/:amountCents/:provinceCode?
 * Quick endpoint to add tax to an amount
 */
router.get(['/add/:amountCents', '/add/:amountCents/:provinceCode'], asyncHandler(async (req, res) => {
  const amountCents = parseInt(req.params.amountCents);
  const provinceCode = req.params.provinceCode?.toUpperCase() || 'ON';

  if (isNaN(amountCents) || amountCents < 0) {
    throw ApiError.badRequest('Invalid amount');
  }

  const taxService = _injectedTaxService;
  const result = await taxService.addTax(amountCents, provinceCode);

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * GET /api/tax/extract/:totalCents/:provinceCode?
 * Extract tax from a tax-inclusive amount
 */
router.get(['/extract/:totalCents', '/extract/:totalCents/:provinceCode'], asyncHandler(async (req, res) => {
  const totalCents = parseInt(req.params.totalCents);
  const provinceCode = req.params.provinceCode?.toUpperCase() || 'ON';

  if (isNaN(totalCents) || totalCents < 0) {
    throw ApiError.badRequest('Invalid amount');
  }

  const taxService = _injectedTaxService;
  const result = await taxService.extractTax(totalCents, provinceCode);

  res.json({
    success: true,
    data: result,
  });
}));

// ============================================================================
// EXEMPTION CHECKS
// ============================================================================

/**
 * GET /api/tax/exempt/customer/:customerId
 * Check if customer is tax exempt
 */
router.get('/exempt/customer/:customerId', asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  const provinceCode = req.query.province?.toUpperCase() || null;

  const taxService = _injectedTaxService;
  const isExempt = await taxService.isCustomerTaxExempt(customerId, provinceCode);
  const exemptions = await taxService.getCustomerExemptions(customerId);

  res.json({
    success: true,
    data: {
      customerId,
      isExempt,
      exemptions,
    },
  });
}));

/**
 * GET /api/tax/exempt/product/:productId
 * Check if product is tax exempt
 */
router.get('/exempt/product/:productId', asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId);
  const provinceCode = req.query.province?.toUpperCase() || null;

  const taxService = _injectedTaxService;
  const isExempt = await taxService.isProductTaxExempt(productId, provinceCode);

  res.json({
    success: true,
    data: {
      productId,
      isExempt,
      provinceCode,
    },
  });
}));

// ============================================================================
// EXEMPTION MANAGEMENT
// ============================================================================

/**
 * POST /api/tax/exempt/customer
 * Add tax exemption for a customer
 */
router.post('/exempt/customer', asyncHandler(async (req, res) => {
  const { error, value } = customerExemptionSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const taxService = _injectedTaxService;
  const result = await taxService.addCustomerExemption({
    ...value,
    verifiedBy: req.user?.id,
  });

  res.json({
    success: true,
    data: result,
    message: 'Tax exemption added successfully',
  });
}));

/**
 * DELETE /api/tax/exempt/customer/:exemptionId
 * Remove customer tax exemption
 */
router.delete('/exempt/customer/:exemptionId', asyncHandler(async (req, res) => {
  const exemptionId = parseInt(req.params.exemptionId);

  const taxService = _injectedTaxService;
  const success = await taxService.removeCustomerExemption(exemptionId);

  if (!success) {
    throw ApiError.notFound('Exemption');
  }

  res.json({
    success: true,
    message: 'Tax exemption removed successfully',
  });
}));

// ============================================================================
// EXEMPTION REASONS (for dropdowns)
// ============================================================================

/**
 * GET /api/tax/exemption-reasons
 * Get list of valid exemption reasons
 */
router.get('/exemption-reasons', asyncHandler(async (req, res) => {
  const pool = req.app.get('pool');
  const result = await pool.query(`
    SELECT id, code, description, requires_certificate
    FROM tax_exemption_reasons
    WHERE is_active = TRUE
    ORDER BY description
  `);

  res.json({
    success: true,
    data: result.rows,
  });
}));

module.exports = { init: initTaxRoutes };

function initTaxRoutes({ taxService }) {
  // Replace closure reference so route handlers use injected service
  _injectedTaxService = taxService;
  return router;
}
