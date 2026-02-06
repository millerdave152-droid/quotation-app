/**
 * TeleTime - Hub Returns API Routes
 * Returns system for unified orders with item-level tracking and approval workflow
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const HubReturnService = require('../services/HubReturnService');

let returnService = null;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createReturnSchema = Joi.object({
  originalOrderId: Joi.number().integer().required(),
  returnType: Joi.string().valid('full', 'partial', 'exchange').optional(),
  refundMethod: Joi.string().valid('original_payment', 'store_credit', 'cash', 'gift_card').optional(),
  notes: Joi.string().optional().allow('', null),
  items: Joi.array().items(Joi.object({
    orderItemId: Joi.number().integer().required(),
    quantity: Joi.number().integer().min(1).required(),
    reasonCodeId: Joi.number().integer().required(),
    reasonNotes: Joi.string().optional().allow('', null),
    itemCondition: Joi.string().valid('resellable', 'damaged', 'defective', 'disposed').optional(),
  })).min(1).required(),
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/hub-returns/reason-codes
 * List active return reason codes
 */
router.get('/reason-codes', authenticate, asyncHandler(async (req, res) => {
  const codes = await returnService.getReasonCodes();

  res.json({
    success: true,
    data: codes,
  });
}));

/**
 * POST /api/hub-returns
 * Initiate a return
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = createReturnSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const details = error.details.map(d => ({ field: d.path.join('.'), message: d.message }));
    throw ApiError.badRequest('Validation failed', details);
  }

  const result = await returnService.create(value, req.user.id);

  res.status(201).json({
    success: true,
    data: result,
  });
}));

/**
 * GET /api/hub-returns
 * Search returns with filters and pagination
 * Query: ?status=initiated&customer_id=5&date_from=2026-01-01&date_to=2026-01-31&search=RTN&page=1&limit=50
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const filters = {};
  if (req.query.status) filters.status = req.query.status;
  if (req.query.customer_id) filters.customerId = parseInt(req.query.customer_id);
  if (req.query.original_order_id) filters.originalOrderId = parseInt(req.query.original_order_id);
  if (req.query.date_from) filters.dateFrom = req.query.date_from;
  if (req.query.date_to) filters.dateTo = req.query.date_to;
  if (req.query.search) filters.search = req.query.search;

  const pagination = {
    page: req.query.page ? parseInt(req.query.page) : 1,
    limit: req.query.limit ? parseInt(req.query.limit) : 50,
  };

  const result = await returnService.search(filters, pagination);

  res.json({
    success: true,
    ...result,
  });
}));

/**
 * GET /api/hub-returns/:id
 * Get return with items, order details, and customer info
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid return ID');

  const result = await returnService.getById(id);
  if (!result) throw ApiError.notFound('Return');

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * PUT /api/hub-returns/:id/approve
 * Approve a return
 */
router.put('/:id/approve', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid return ID');

  const result = await returnService.approve(id, req.user.id);

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * PUT /api/hub-returns/:id/reject
 * Reject a return
 */
router.put('/:id/reject', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid return ID');

  const reason = req.body.reason || req.body.notes || null;
  const result = await returnService.reject(id, req.user.id, reason);

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * PUT /api/hub-returns/:id/process
 * Start processing an approved return
 */
router.put('/:id/process', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid return ID');

  const result = await returnService.startProcessing(id, req.user.id);

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * PUT /api/hub-returns/:id/complete
 * Complete a return
 */
router.put('/:id/complete', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid return ID');

  const result = await returnService.complete(id, req.user.id);

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * PUT /api/hub-returns/:id/cancel
 * Cancel a return
 */
router.put('/:id/cancel', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid return ID');

  const result = await returnService.cancel(id);

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * POST /api/hub-returns/:id/process-refund
 * Process the actual refund for an approved/processing return
 */
router.post('/:id/process-refund', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid return ID');

  const { error, value } = Joi.object({
    refundMethod: Joi.string().valid('original_payment', 'store_credit', 'cash').required(),
    shiftId: Joi.number().integer().optional(),
  }).validate(req.body, { stripUnknown: true });

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const result = await returnService.processRefund(
    id,
    value.refundMethod,
    req.user.id,
    { shiftId: value.shiftId }
  );

  res.json({
    success: true,
    data: result,
  });
}));

// ============================================================================
// INITIALIZATION
// ============================================================================

const init = (deps) => {
  returnService = new HubReturnService(deps.pool, {
    stripeService: deps.stripeService || null,
  });
  return router;
};

module.exports = { init };
