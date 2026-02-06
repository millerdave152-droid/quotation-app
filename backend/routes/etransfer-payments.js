/**
 * TeleTime - E-Transfer Payment Routes
 * Endpoints for initiating, tracking, and confirming e-transfer payments.
 *
 * Mounts on two bases:
 *   orderRouter → /api/orders (for /:id/payments/etransfer, /:id/payments, /:id/balance)
 *   paymentRouter → /api/payments (for /etransfer/pending, /etransfer/:reference/confirm, etc.)
 */

const express = require('express');
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const ETransferService = require('../services/ETransferService');
const UnifiedOrderService = require('../services/UnifiedOrderService');

let etransferService = null;
let orderService = null;

// ============================================================================
// ORDER-SCOPED ROUTES — mounted at /api/orders
// ============================================================================

const orderRouter = express.Router();
orderRouter.use(authenticate);

/**
 * POST /api/orders/:id/payments/etransfer
 * Initiate an e-transfer payment for an order.
 * Body: { amountCents? } — defaults to full balance due
 * Returns: { referenceCode, amount, instructions, companyEmail }
 */
orderRouter.post('/:id/payments/etransfer', asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) throw ApiError.badRequest('Invalid order ID');

  const { error, value } = Joi.object({
    amountCents: Joi.number().integer().min(1).optional(),
  }).validate(req.body, { stripUnknown: true });

  if (error) throw ApiError.badRequest(error.details[0].message);

  const result = await etransferService.initiate(orderId, value.amountCents || null, req.user.id);

  res.status(201).json({ success: true, data: result });
}));

/**
 * GET /api/orders/:id/payments
 * Get all payments for an order with statuses.
 */
orderRouter.get('/:id/payments', asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) throw ApiError.badRequest('Invalid order ID');

  const order = await orderService.getById(orderId, { includeItems: false, includePayments: true });
  if (!order) throw ApiError.notFound('Order');

  res.json({ success: true, data: order.payments || [] });
}));

/**
 * GET /api/orders/:id/balance
 * Get balance summary for an order.
 * Returns: { total, paid, balanceDue, payments: [...] }
 */
orderRouter.get('/:id/balance', asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) throw ApiError.badRequest('Invalid order ID');

  const order = await orderService.getById(orderId, { includeItems: false, includePayments: true });
  if (!order) throw ApiError.notFound('Order');

  const payments = (order.payments || []).map(p => ({
    id: p.id,
    paymentMethod: p.paymentMethod,
    amountCents: p.amountCents,
    amount: p.amount,
    status: p.status,
    etransferReference: p.etransferReference || null,
    etransferStatus: p.etransferStatus || null,
    createdAt: p.createdAt,
  }));

  // Separate completed from pending for balance calculation
  const completedPaid = payments
    .filter(p => p.status === 'completed' && p.amountCents > 0)
    .reduce((sum, p) => sum + p.amountCents, 0);

  const pendingPayments = payments.filter(p => p.status === 'pending');

  res.json({
    success: true,
    data: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalCents: order.totalCents,
      total: order.total,
      paidCents: order.amountPaidCents,
      paid: order.amountPaid,
      balanceDueCents: order.amountDueCents,
      balanceDue: order.amountDue,
      pendingEtransferCents: pendingPayments
        .filter(p => p.paymentMethod === 'etransfer')
        .reduce((sum, p) => sum + p.amountCents, 0),
      payments,
    },
  });
}));

// ============================================================================
// PAYMENT MANAGEMENT ROUTES — mounted at /api/payments
// ============================================================================

const paymentRouter = express.Router();
paymentRouter.use(authenticate);

/**
 * GET /api/payments/etransfer/pending
 * Get all pending e-transfer payments for reconciliation.
 * Permission: Manager/Admin
 * Query: ?search=TT-2026&date_from=...&date_to=...&page=1&limit=50
 */
paymentRouter.get('/etransfer/pending', requireRole('manager', 'admin'), asyncHandler(async (req, res) => {
  const filters = {
    search: req.query.search || undefined,
    dateFrom: req.query.date_from || undefined,
    dateTo: req.query.date_to || undefined,
    page: req.query.page ? parseInt(req.query.page) : 1,
    limit: req.query.limit ? parseInt(req.query.limit) : 50,
  };

  const result = await etransferService.getPending(filters);

  res.json({ success: true, ...result });
}));

/**
 * GET /api/payments/etransfer/:reference
 * Look up an e-transfer payment by reference code.
 */
paymentRouter.get('/etransfer/:reference', asyncHandler(async (req, res) => {
  const { reference } = req.params;

  const data = await etransferService.getByReference(reference);
  if (!data) throw ApiError.notFound('E-transfer payment');

  res.json({ success: true, data });
}));

/**
 * POST /api/payments/etransfer/:reference/confirm
 * Confirm an e-transfer payment has been received and verified.
 * Permission: Manager/Admin
 * Body: { confirmationNotes? }
 */
paymentRouter.post('/etransfer/:reference/confirm', requireRole('manager', 'admin'), asyncHandler(async (req, res) => {
  const { reference } = req.params;

  const { error, value } = Joi.object({
    confirmationNotes: Joi.string().optional().allow('', null),
  }).validate(req.body, { stripUnknown: true });

  if (error) throw ApiError.badRequest(error.details[0].message);

  const result = await etransferService.confirm(reference, req.user.id, {
    notes: value.confirmationNotes,
  });

  res.json({ success: true, data: result });
}));

/**
 * POST /api/payments/etransfer/:reference/received
 * Mark e-transfer as received (money arrived, pending final confirmation).
 * Permission: Manager/Admin
 */
paymentRouter.post('/etransfer/:reference/received', requireRole('manager', 'admin'), asyncHandler(async (req, res) => {
  const { reference } = req.params;

  const result = await etransferService.markReceived(reference, req.user.id);

  res.json({ success: true, data: result });
}));

/**
 * POST /api/payments/etransfer/:reference/fail
 * Mark e-transfer as failed/cancelled.
 * Permission: Manager/Admin
 * Body: { reason? }
 */
paymentRouter.post('/etransfer/:reference/fail', requireRole('manager', 'admin'), asyncHandler(async (req, res) => {
  const { reference } = req.params;
  const reason = req.body.reason || null;

  const result = await etransferService.markFailed(reference, req.user.id, reason);

  res.json({ success: true, data: result });
}));

// ============================================================================
// INITIALIZATION
// ============================================================================

const init = (deps) => {
  etransferService = new ETransferService(deps.pool, {
    companyEmail: deps.companyEmail || process.env.ETRANSFER_EMAIL,
    emailService: deps.emailService || null,
  });
  orderService = new UnifiedOrderService(deps.pool);

  return { orderRouter, paymentRouter };
};

module.exports = { init };
