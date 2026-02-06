/**
 * TeleTime - Commission Management API
 * Consolidated commission endpoints matching the unified URL pattern:
 *   /api/orders/:id/commissions
 *   /api/users/:id/commissions
 *   /api/commissions/...
 *   /api/commission-rules
 */

const express = require('express');
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const HubCommissionService = require('../services/HubCommissionService');

let commissionService = null;

// ============================================================================
// ORDER COMMISSION ROUTES — mounted at /api/orders
// ============================================================================

const orderRouter = express.Router();
orderRouter.use(authenticate);

/**
 * POST /api/orders/:id/commissions
 * Calculate and create commissions for an order with split percentages.
 * Body: { splits: [{ userId, splitPercentage }] }
 * Splits must sum to 100%.
 */
orderRouter.post('/:id/commissions', asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) throw ApiError.badRequest('Invalid order ID');

  const { error, value } = Joi.object({
    splits: Joi.array().items(Joi.object({
      userId: Joi.number().integer().required(),
      splitPercentage: Joi.number().min(0.01).max(100).required(),
    })).min(1).required(),
  }).validate(req.body, { stripUnknown: true });

  if (error) throw ApiError.badRequest(error.details[0].message);

  const results = await commissionService.calculateSplitCommissions(orderId, value.splits);

  res.status(201).json({
    success: true,
    data: results.map(c => ({
      userId: c.userId,
      splitPercentage: c.splitPercentage,
      commissionAmount: c.commissionAmount,
      commissionAmountCents: c.commissionAmountCents,
      saleAmount: c.saleAmount,
      saleAmountCents: c.saleAmountCents,
      commissionRate: c.commissionRate,
      status: c.status,
      id: c.id,
    })),
  });
}));

/**
 * GET /api/orders/:id/commissions
 * Get all commission records for an order with user names.
 */
orderRouter.get('/:id/commissions', asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) throw ApiError.badRequest('Invalid order ID');

  const data = await commissionService.getByOrderId(orderId);

  res.json({ success: true, data });
}));

// ============================================================================
// USER COMMISSION ROUTES — mounted at /api/users
// ============================================================================

const userRouter = express.Router();
userRouter.use(authenticate);

/**
 * GET /api/users/:id/commissions
 * Get commission records for a user with filters and pagination.
 * Query: ?status=pending&date_from=2026-01-01&date_to=2026-01-31&period=2026-01&page=1&limit=50
 */
userRouter.get('/:id/commissions', asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) throw ApiError.badRequest('Invalid user ID');

  const filters = {
    status: req.query.status || undefined,
    period: req.query.period || undefined,
    dateFrom: req.query.date_from || undefined,
    dateTo: req.query.date_to || undefined,
    page: req.query.page ? parseInt(req.query.page) : 1,
    limit: req.query.limit ? parseInt(req.query.limit) : 50,
  };

  const result = await commissionService.getByUserId(userId, filters);

  res.json({ success: true, ...result });
}));

/**
 * GET /api/users/:id/commission-summary
 * Get commission summary for a user in a given period.
 * Query: ?period=today|week|month|pay_period|custom|YYYY-MM&date_from=...&date_to=...
 */
userRouter.get('/:id/commission-summary', asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) throw ApiError.badRequest('Invalid user ID');

  const period = req.query.period || 'month';

  const data = await commissionService.getUserPeriodSummary(userId, period, {
    dateFrom: req.query.date_from,
    dateTo: req.query.date_to,
  });

  res.json({ success: true, data });
}));

// ============================================================================
// COMMISSION MANAGEMENT ROUTES — mounted at /api/commissions
// ============================================================================

const commissionRouter = express.Router();
commissionRouter.use(authenticate);

/**
 * GET /api/commissions/pending-approval
 * Get commissions pending approval. Manager/admin only.
 * Query: ?user_id=5&date_from=...&date_to=...&min_amount=1000&page=1&limit=50
 */
commissionRouter.get('/pending-approval', requireRole('manager', 'admin'), asyncHandler(async (req, res) => {
  const filters = {
    userId: req.query.user_id ? parseInt(req.query.user_id) : undefined,
    dateFrom: req.query.date_from || undefined,
    dateTo: req.query.date_to || undefined,
    minAmount: req.query.min_amount ? parseInt(req.query.min_amount) : undefined,
    page: req.query.page ? parseInt(req.query.page) : 1,
    limit: req.query.limit ? parseInt(req.query.limit) : 50,
  };

  const result = await commissionService.getPendingApproval(filters);

  res.json({ success: true, ...result });
}));

/**
 * POST /api/commissions/bulk-approve
 * Approve multiple commissions at once. Manager/admin only.
 * Body: { commissionIds: [1, 2, 3] }
 */
commissionRouter.post('/bulk-approve', requireRole('manager', 'admin'), asyncHandler(async (req, res) => {
  const { error, value } = Joi.object({
    commissionIds: Joi.array().items(Joi.number().integer()).min(1).required(),
  }).validate(req.body, { stripUnknown: true });

  if (error) throw ApiError.badRequest(error.details[0].message);

  const result = await commissionService.bulkApprove(value.commissionIds, req.user.id);

  res.json({ success: true, data: result });
}));

/**
 * GET /api/commissions/:id
 * Get commission detail with item breakdown.
 */
commissionRouter.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid commission ID');

  const data = await commissionService.getById(id);
  if (!data) throw ApiError.notFound('Commission');

  res.json({ success: true, data });
}));

/**
 * PUT /api/commissions/:id/approve
 * Approve a single commission. Manager/admin only.
 */
commissionRouter.put('/:id/approve', requireRole('manager', 'admin'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid commission ID');

  const result = await commissionService.approve(id, req.user.id);

  res.json({ success: true, data: result });
}));

/**
 * PUT /api/commissions/:id/adjust
 * Adjust a commission amount. Manager/admin only.
 * Body: { adjustedAmount: 5000, adjustmentReason: "..." }
 */
commissionRouter.put('/:id/adjust', requireRole('manager', 'admin'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid commission ID');

  const { error, value } = Joi.object({
    adjustedAmount: Joi.number().integer().min(0).required(),
    adjustmentReason: Joi.string().min(1).required(),
  }).validate(req.body, { stripUnknown: true });

  if (error) throw ApiError.badRequest(error.details[0].message);

  const result = await commissionService.adjust(
    id, value.adjustedAmount, value.adjustmentReason, req.user.id
  );

  res.json({ success: true, data: result });
}));

// ============================================================================
// COMMISSION RULES ROUTES — mounted at /api/commission-rules
// ============================================================================

const rulesRouter = express.Router();
rulesRouter.use(authenticate);

/**
 * GET /api/commission-rules
 * Get active commission rules.
 * Query: ?active=false to include inactive rules.
 */
rulesRouter.get('/', asyncHandler(async (req, res) => {
  const activeOnly = req.query.active !== 'false';
  const data = await commissionService.getRules(activeOnly);

  res.json({ success: true, data });
}));

/**
 * GET /api/commission-rules/:id
 * Get a specific commission rule by ID.
 */
rulesRouter.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid rule ID');

  const data = await commissionService.getRuleById(id);
  if (!data) throw ApiError.notFound('Commission rule');

  res.json({ success: true, data });
}));

/**
 * POST /api/commission-rules
 * Create a new commission rule. Admin only.
 */
rulesRouter.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const { error, value } = Joi.object({
    name: Joi.string().required(),
    appliesTo: Joi.string().valid('all', 'category', 'manufacturer', 'product').required(),
    categoryId: Joi.number().integer().optional().allow(null),
    manufacturer: Joi.string().optional().allow('', null),
    productId: Joi.number().integer().optional().allow(null),
    commissionType: Joi.string().valid('percentage', 'flat', 'tiered').required(),
    commissionValue: Joi.number().optional().allow(null),
    tierRules: Joi.array().items(Joi.object({
      min_margin: Joi.number().required(),
      max_margin: Joi.number().allow(null).optional(),
      commission: Joi.number().required(),
    })).optional(),
    minSaleAmount: Joi.number().integer().optional().allow(null),
    minMarginPercent: Joi.number().optional().allow(null),
    priority: Joi.number().integer().default(0),
    isActive: Joi.boolean().default(true),
    effectiveFrom: Joi.date().iso().optional().allow(null),
    effectiveTo: Joi.date().iso().optional().allow(null),
  }).validate(req.body, { stripUnknown: true });

  if (error) throw ApiError.badRequest(error.details[0].message);

  const data = await commissionService.createRule(value, req.user.id);

  res.status(201).json({ success: true, data });
}));

/**
 * PUT /api/commission-rules/:id
 * Update a commission rule. Admin only.
 */
rulesRouter.put('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid rule ID');

  const data = await commissionService.updateRule(id, req.body);

  res.json({ success: true, data });
}));

/**
 * DELETE /api/commission-rules/:id
 * Soft-delete (deactivate) a commission rule. Admin only.
 */
rulesRouter.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid rule ID');

  await commissionService.deleteRule(id);

  res.json({ success: true, message: 'Commission rule deactivated' });
}));

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Mount all commission routers onto the Express app.
 * @param {Object} deps - { pool, app }
 */
const init = (deps) => {
  commissionService = new HubCommissionService(deps.pool);

  return {
    orderRouter,
    userRouter,
    commissionRouter,
    rulesRouter,
  };
};

module.exports = { init };
