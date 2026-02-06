/**
 * Signature Routes
 * API endpoints for signature capture and management
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let signatureService = null;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const captureSignatureSchema = Joi.object({
  orderId: Joi.number().integer().optional(),
  transactionId: Joi.number().integer().optional(),
  signatureType: Joi.string().valid('delivery', 'purchase', 'trade_in', 'financing', 'refund', 'other').required(),
  tradeInAssessmentId: Joi.number().integer().optional(),
  financingApplicationId: Joi.number().integer().optional(),
  signatureData: Joi.string().required(), // Base64 encoded
  signatureFormat: Joi.string().valid('svg', 'png', 'jpeg').default('svg'),
  signerName: Joi.string().min(2).max(255).required(),
  signerEmail: Joi.string().email().optional(),
  signerPhone: Joi.string().max(50).optional(),
  termsVersion: Joi.string().max(50).optional(),
  termsAccepted: Joi.boolean().default(true),
  legalText: Joi.string().optional(),
  deviceInfo: Joi.object().optional(),
  geolocation: Joi.object({
    latitude: Joi.number(),
    longitude: Joi.number(),
    accuracy: Joi.number(),
  }).optional(),
});

const voidSignatureSchema = Joi.object({
  reason: Joi.string().min(5).max(500).required(),
});

const createRequirementSchema = Joi.object({
  requirementType: Joi.string().valid('delivery', 'value_threshold', 'category', 'trade_in', 'financing', 'refund', 'custom').required(),
  thresholdValue: Joi.number().precision(2).optional(),
  categoryId: Joi.number().integer().optional(),
  productId: Joi.number().integer().optional(),
  signatureType: Joi.string().valid('delivery', 'purchase', 'trade_in', 'financing', 'refund', 'other').required(),
  title: Joi.string().max(255).required(),
  description: Joi.string().optional(),
  legalText: Joi.string().optional(),
  termsVersion: Joi.string().max(50).optional(),
  isRequired: Joi.boolean().default(true),
  allowTypedName: Joi.boolean().default(true),
  requirePrintedName: Joi.boolean().default(true),
  priority: Joi.number().integer().min(1).max(1000).default(100),
});

const auditLogSchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  signatureType: Joi.string().optional(),
  status: Joi.string().valid('valid', 'voided', 'superseded').optional(),
  limit: Joi.number().integer().min(1).max(500).default(100),
  offset: Joi.number().integer().min(0).default(0),
});

// ============================================================================
// SIGNATURE CAPTURE ROUTES
// ============================================================================

/**
 * POST /api/signatures
 * Capture a new signature
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = captureSignatureSchema.validate(req.body);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  // Add IP address from request
  const ipAddress = req.ip || req.connection?.remoteAddress || null;

  const signature = await signatureService.captureSignature(
    { ...value, ipAddress },
    req.user.id
  );

  res.status(201).json({
    success: true,
    data: signature,
  });
}));

/**
 * GET /api/signatures/:id
 * Get signature by ID
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const signatureId = parseInt(req.params.id, 10);

  if (isNaN(signatureId)) {
    throw ApiError.badRequest('Invalid signature ID');
  }

  const signature = await signatureService.getSignature(signatureId);

  if (!signature) {
    throw ApiError.notFound('Signature not found');
  }

  res.json({
    success: true,
    data: signature,
  });
}));

/**
 * GET /api/signatures/order/:orderId
 * Get all signatures for an order
 */
router.get('/order/:orderId', authenticate, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);

  if (isNaN(orderId)) {
    throw ApiError.badRequest('Invalid order ID');
  }

  const signatures = await signatureService.getOrderSignatures(orderId);

  res.json({
    success: true,
    data: signatures,
  });
}));

/**
 * GET /api/signatures/transaction/:transactionId
 * Get all signatures for a transaction
 */
router.get('/transaction/:transactionId', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.transactionId, 10);

  if (isNaN(transactionId)) {
    throw ApiError.badRequest('Invalid transaction ID');
  }

  const signatures = await signatureService.getTransactionSignatures(transactionId);

  res.json({
    success: true,
    data: signatures,
  });
}));

/**
 * GET /api/signatures/requirements/:orderId
 * Get required signatures for an order
 */
router.get('/requirements/:orderId', authenticate, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);

  if (isNaN(orderId)) {
    throw ApiError.badRequest('Invalid order ID');
  }

  const requirements = await signatureService.getRequiredSignatures(orderId);

  res.json({
    success: true,
    data: requirements,
  });
}));

/**
 * GET /api/signatures/check/:orderId/:type
 * Check if order has a valid signature of given type
 */
router.get('/check/:orderId/:type', authenticate, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  const signatureType = req.params.type;

  if (isNaN(orderId)) {
    throw ApiError.badRequest('Invalid order ID');
  }

  const hasSignature = await signatureService.hasValidSignature(orderId, signatureType);

  res.json({
    success: true,
    data: { hasSignature },
  });
}));

// ============================================================================
// SIGNATURE MANAGEMENT ROUTES
// ============================================================================

/**
 * POST /api/signatures/:id/void
 * Void a signature
 */
router.post('/:id/void', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const signatureId = parseInt(req.params.id, 10);

  if (isNaN(signatureId)) {
    throw ApiError.badRequest('Invalid signature ID');
  }

  const { error, value } = voidSignatureSchema.validate(req.body);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const signature = await signatureService.voidSignature(
    signatureId,
    value.reason,
    req.user.id
  );

  res.json({
    success: true,
    data: signature,
  });
}));

/**
 * POST /api/signatures/:id/supersede
 * Replace a signature with a new one
 */
router.post('/:id/supersede', authenticate, asyncHandler(async (req, res) => {
  const oldSignatureId = parseInt(req.params.id, 10);

  if (isNaN(oldSignatureId)) {
    throw ApiError.badRequest('Invalid signature ID');
  }

  const { error, value } = captureSignatureSchema.validate(req.body);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const ipAddress = req.ip || req.connection?.remoteAddress || null;

  const newSignature = await signatureService.supersedeSignature(
    oldSignatureId,
    { ...value, ipAddress },
    req.user.id
  );

  res.json({
    success: true,
    data: newSignature,
  });
}));

// ============================================================================
// REQUIREMENTS MANAGEMENT ROUTES (Admin)
// ============================================================================

/**
 * GET /api/signatures/requirements
 * Get all signature requirements
 */
router.get('/admin/requirements', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const requirements = await signatureService.getAllRequirements();

  res.json({
    success: true,
    data: requirements,
  });
}));

/**
 * POST /api/signatures/requirements
 * Create a new signature requirement
 */
router.post('/admin/requirements', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const { error, value } = createRequirementSchema.validate(req.body);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const requirement = await signatureService.createRequirement(value, req.user.id);

  res.status(201).json({
    success: true,
    data: requirement,
  });
}));

/**
 * PATCH /api/signatures/requirements/:id
 * Update a signature requirement
 */
router.patch('/admin/requirements/:id', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const requirementId = parseInt(req.params.id, 10);

  if (isNaN(requirementId)) {
    throw ApiError.badRequest('Invalid requirement ID');
  }

  const requirement = await signatureService.updateRequirement(
    requirementId,
    req.body,
    req.user.id
  );

  res.json({
    success: true,
    data: requirement,
  });
}));

// ============================================================================
// TEMPLATE ROUTES
// ============================================================================

/**
 * GET /api/signatures/templates
 * Get all signature templates
 */
router.get('/templates', authenticate, asyncHandler(async (req, res) => {
  const templates = await signatureService.getAllTemplates();

  res.json({
    success: true,
    data: templates,
  });
}));

/**
 * GET /api/signatures/templates/:code
 * Get a specific template by code
 */
router.get('/templates/:code', authenticate, asyncHandler(async (req, res) => {
  const template = await signatureService.getTemplate(req.params.code);

  if (!template) {
    throw ApiError.notFound('Template not found');
  }

  res.json({
    success: true,
    data: template,
  });
}));

/**
 * GET /api/signatures/templates/default/:type
 * Get default template for a signature type
 */
router.get('/templates/default/:type', authenticate, asyncHandler(async (req, res) => {
  const template = await signatureService.getDefaultTemplate(req.params.type);

  res.json({
    success: true,
    data: template,
  });
}));

// ============================================================================
// AUDIT ROUTES
// ============================================================================

/**
 * GET /api/signatures/audit
 * Get signature audit log
 */
router.get('/audit', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const { error, value } = auditLogSchema.validate(req.query);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const auditLog = await signatureService.getAuditLog(value);

  res.json({
    success: true,
    data: auditLog,
  });
}));

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize routes with dependencies
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
const init = (deps) => {
  signatureService = deps.signatureService;
  return router;
};

module.exports = { init };
