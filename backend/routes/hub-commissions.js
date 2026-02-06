/**
 * TeleTime - Hub Commission Routes
 * Commission calculation, tracking, approval, and rule management
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const HubCommissionService = require('../services/HubCommissionService');

let commissionService = null;

router.use(authenticate);

// ============================================================================
// COMMISSION CALCULATION & QUERIES
// ============================================================================

/**
 * POST /api/hub-commissions/calculate
 * Calculate and record commission for an order
 */
router.post('/calculate', asyncHandler(async (req, res) => {
  const { error, value } = Joi.object({
    orderId: Joi.number().integer().required(),
    userId: Joi.number().integer().required(),
    splitPercentage: Joi.number().min(0).max(100).default(100),
  }).validate(req.body, { stripUnknown: true });

  if (error) throw ApiError.badRequest(error.details[0].message);

  const result = await commissionService.calculateAndCreate(
    value.orderId, value.userId, value.splitPercentage
  );

  res.status(201).json({ success: true, data: result });
}));

/**
 * POST /api/hub-commissions/:id/recalculate
 * Recalculate an existing commission
 */
router.post('/:id/recalculate', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid commission ID');

  const result = await commissionService.recalculate(id, req.user.id);
  res.json({ success: true, data: result });
}));

/**
 * GET /api/hub-commissions/order/:orderId
 * Get commissions for an order
 */
router.get('/order/:orderId', asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) throw ApiError.badRequest('Invalid order ID');

  const data = await commissionService.getByOrderId(orderId);
  res.json({ success: true, data });
}));

/**
 * GET /api/hub-commissions/user/:userId
 * Get commissions for a user with filters
 */
router.get('/user/:userId', asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) throw ApiError.badRequest('Invalid user ID');

  const filters = {
    status: req.query.status,
    period: req.query.period,
    dateFrom: req.query.date_from,
    dateTo: req.query.date_to,
    page: req.query.page ? parseInt(req.query.page) : 1,
    limit: req.query.limit ? parseInt(req.query.limit) : 50,
  };

  const result = await commissionService.getByUserId(userId, filters);
  res.json({ success: true, ...result });
}));

/**
 * GET /api/hub-commissions/user/:userId/summary
 * Get commission summary for a user in a period
 */
router.get('/user/:userId/summary', asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) throw ApiError.badRequest('Invalid user ID');

  const period = req.query.period || new Date().toISOString().slice(0, 7);
  const data = await commissionService.getUserSummary(userId, period);
  res.json({ success: true, data });
}));

// ============================================================================
// RULES MANAGEMENT (must be before /:id to avoid route collision)
// ============================================================================

/**
 * GET /api/hub-commissions/rules
 */
router.get('/rules', asyncHandler(async (req, res) => {
  const activeOnly = req.query.active !== 'false';
  const data = await commissionService.getRules(activeOnly);
  res.json({ success: true, data });
}));

/**
 * GET /api/hub-commissions/rules/:id
 */
router.get('/rules/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid rule ID');

  const data = await commissionService.getRuleById(id);
  if (!data) throw ApiError.notFound('Commission rule');

  res.json({ success: true, data });
}));

/**
 * POST /api/hub-commissions/rules
 */
router.post('/rules', asyncHandler(async (req, res) => {
  const { error, value } = Joi.object({
    name: Joi.string().required(),
    appliesTo: Joi.string().valid('all', 'category', 'manufacturer', 'product').required(),
    categoryId: Joi.number().integer().optional(),
    manufacturer: Joi.string().optional(),
    productId: Joi.number().integer().optional(),
    commissionType: Joi.string().valid('percentage', 'flat', 'tiered').required(),
    commissionValue: Joi.number().optional(),
    tierRules: Joi.array().items(Joi.object({
      min_margin: Joi.number().required(),
      max_margin: Joi.number().allow(null).optional(),
      commission: Joi.number().required(),
    })).optional(),
    minSaleAmount: Joi.number().integer().optional(),
    minMarginPercent: Joi.number().optional(),
    priority: Joi.number().integer().default(0),
    isActive: Joi.boolean().default(true),
    effectiveFrom: Joi.date().optional(),
    effectiveTo: Joi.date().optional(),
  }).validate(req.body, { stripUnknown: true });

  if (error) throw ApiError.badRequest(error.details[0].message);

  const data = await commissionService.createRule(value, req.user.id);
  res.status(201).json({ success: true, data });
}));

/**
 * PUT /api/hub-commissions/rules/:id
 */
router.put('/rules/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid rule ID');

  const data = await commissionService.updateRule(id, req.body);
  res.json({ success: true, data });
}));

/**
 * DELETE /api/hub-commissions/rules/:id
 */
router.delete('/rules/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid rule ID');

  await commissionService.deleteRule(id);
  res.json({ success: true, message: 'Rule deactivated' });
}));

// ============================================================================
// COMMISSION DETAIL (after /rules to avoid collision)
// ============================================================================

/**
 * GET /api/hub-commissions/:id
 * Get commission detail with item breakdown
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid commission ID');

  const data = await commissionService.getById(id);
  if (!data) throw ApiError.notFound('Commission');

  res.json({ success: true, data });
}));

// ============================================================================
// STATUS TRANSITIONS
// ============================================================================

/**
 * PUT /api/hub-commissions/:id/approve
 */
router.put('/:id/approve', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid commission ID');

  const result = await commissionService.approve(id, req.user.id);
  res.json({ success: true, data: result });
}));

/**
 * POST /api/hub-commissions/bulk-approve
 */
router.post('/bulk-approve', asyncHandler(async (req, res) => {
  const { error, value } = Joi.object({
    commissionIds: Joi.array().items(Joi.number().integer()).min(1).required(),
  }).validate(req.body, { stripUnknown: true });

  if (error) throw ApiError.badRequest(error.details[0].message);

  const result = await commissionService.bulkApprove(value.commissionIds, req.user.id);
  res.json({ success: true, data: result });
}));

/**
 * PUT /api/hub-commissions/:id/adjust
 */
router.put('/:id/adjust', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid commission ID');

  const { error, value } = Joi.object({
    adjustedAmount: Joi.number().integer().min(0).required(),
    reason: Joi.string().required(),
  }).validate(req.body, { stripUnknown: true });

  if (error) throw ApiError.badRequest(error.details[0].message);

  const result = await commissionService.adjust(id, value.adjustedAmount, value.reason, req.user.id);
  res.json({ success: true, data: result });
}));

/**
 * POST /api/hub-commissions/mark-paid
 */
router.post('/mark-paid', asyncHandler(async (req, res) => {
  const { error, value } = Joi.object({
    commissionIds: Joi.array().items(Joi.number().integer()).min(1).required(),
    period: Joi.string().pattern(/^\d{4}-\d{2}$/).required(),
  }).validate(req.body, { stripUnknown: true });

  if (error) throw ApiError.badRequest(error.details[0].message);

  const result = await commissionService.markPaid(value.commissionIds, value.period);
  res.json({ success: true, data: result });
}));

/**
 * PUT /api/hub-commissions/:id/cancel
 */
router.put('/:id/cancel', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid commission ID');

  const reason = req.body.reason || null;
  const result = await commissionService.cancel(id, reason);
  res.json({ success: true, data: result });
}));

// ============================================================================
// INITIALIZATION
// ============================================================================

const init = (deps) => {
  commissionService = new HubCommissionService(deps.pool);
  return router;
};

module.exports = { init };
