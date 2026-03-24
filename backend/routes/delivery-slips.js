/**
 * Delivery Slip Routes
 * API endpoints for creating, viewing, and managing delivery slips.
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let deliverySlipService = null;
let pool = null;

// ============================================================================
// HELPERS
// ============================================================================

function auditLog(req, eventType, eventCategory, severity, entityId, details) {
  const auditLogService = req.app.get('auditLogService');
  if (!auditLogService) return;
  auditLogService.logEvent({
    eventType,
    eventCategory,
    severity,
    employeeId: req.user?.id,
    transactionId: details?.transaction_id || null,
    entityType: 'delivery_slip',
    entityId,
    details,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/delivery-slips — Create a delivery slip
 */
router.post('/', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const {
    salesOrderId, transactionId, customerId,
    deliveryDate, deliveryAddress, deliveryCity,
    deliveryProvince, deliveryPostalCode,
    accessInstructions, deliveryNotes,
    driverName, vehicleNumber
  } = req.body;

  if (!customerId && !transactionId) {
    throw ApiError.badRequest('Either customerId or transactionId is required');
  }

  const slip = await deliverySlipService.createSlip({
    salesOrderId, transactionId, customerId,
    deliveryDate, deliveryAddress, deliveryCity,
    deliveryProvince, deliveryPostalCode,
    accessInstructions, deliveryNotes,
    driverName, vehicleNumber
  }, req.user.id);

  auditLog(req, 'delivery_slip_created', 'delivery', 'info', slip.id, {
    slip_number: slip.slip_number,
    transaction_id: transactionId,
    customer_id: customerId
  });

  res.created(slip);
}));

/**
 * GET /api/delivery-slips/pending — List pending deliveries
 */
router.get('/pending', authenticate, asyncHandler(async (req, res) => {
  const slips = await deliverySlipService.listPending();
  res.success(slips);
}));

/**
 * GET /api/delivery-slips/:id/pdf — Download PDF
 */
router.get('/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const slipId = parseInt(req.params.id);
  if (isNaN(slipId)) throw ApiError.badRequest('Invalid slip ID');

  const pdfBuffer = await deliverySlipService.generateDeliverySlipPdf(slipId);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="delivery-slip-${slipId}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}));

/**
 * GET /api/delivery-slips/:id/view — Browser preview (inline PDF)
 */
router.get('/:id/view', authenticate, asyncHandler(async (req, res) => {
  const slipId = parseInt(req.params.id);
  if (isNaN(slipId)) throw ApiError.badRequest('Invalid slip ID');

  const pdfBuffer = await deliverySlipService.generateDeliverySlipPdf(slipId);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}));

/**
 * GET /api/delivery-slips/transaction/:transactionId/view — View by transaction (auto-create if needed)
 */
router.get('/transaction/:transactionId/view', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.transactionId);
  if (isNaN(transactionId)) throw ApiError.badRequest('Invalid transaction ID');

  // Find existing or create new slip for this transaction
  let existing = await deliverySlipService.getSlipByTransaction(transactionId);

  if (!existing) {
    // Auto-create from transaction data
    const txnResult = await pool.query(`
      SELECT t.transaction_id, t.customer_id,
             t.delivery_date, t.delivery_address, t.delivery_city,
             t.delivery_province, t.delivery_postal_code, t.delivery_notes,
             so.id AS sales_order_id
      FROM transactions t
      LEFT JOIN sales_orders so ON so.transaction_id = t.transaction_id
      WHERE t.transaction_id = $1
    `, [transactionId]);

    if (!txnResult.rows.length) {
      throw ApiError.notFound('Transaction not found');
    }

    const txn = txnResult.rows[0];
    const slip = await deliverySlipService.createSlip({
      salesOrderId: txn.sales_order_id,
      transactionId: txn.transaction_id,
      customerId: txn.customer_id,
      deliveryDate: txn.delivery_date,
      deliveryAddress: txn.delivery_address,
      deliveryCity: txn.delivery_city,
      deliveryProvince: txn.delivery_province,
      deliveryPostalCode: txn.delivery_postal_code,
      deliveryNotes: txn.delivery_notes
    }, req.user?.id);

    existing = { id: slip.id };

    auditLog(req, 'delivery_slip_auto_created', 'delivery', 'info', slip.id, {
      slip_number: slip.slip_number,
      transaction_id: transactionId
    });
  }

  const pdfBuffer = await deliverySlipService.generateDeliverySlipPdf(existing.id);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}));

/**
 * PATCH /api/delivery-slips/:id/status — Update delivery status
 */
router.patch('/:id/status', authenticate, asyncHandler(async (req, res) => {
  const slipId = parseInt(req.params.id);
  if (isNaN(slipId)) throw ApiError.badRequest('Invalid slip ID');

  const { status, ...extra } = req.body;
  const validStatuses = ['scheduled', 'out_for_delivery', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw ApiError.badRequest(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const updated = await deliverySlipService.updateStatus(slipId, status, extra);
  if (!updated) throw ApiError.notFound('Delivery slip not found');

  auditLog(req, 'delivery_slip_status_updated', 'delivery', 'info', slipId, {
    slip_number: updated.slip_number,
    new_status: status,
    transaction_id: updated.transaction_id
  });

  res.success(updated);
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  deliverySlipService = deps.deliverySlipService;
  pool = deps.pool;
  return router;
};

module.exports = { init };
