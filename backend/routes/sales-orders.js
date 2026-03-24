/**
 * Sales Order Routes
 * API endpoints for Sales Order Confirmation — DB persistence, PDF generation,
 * auto-invoice conversion, RBAC, audit logging, and PIN-protected amendments.
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let salesOrderService = null;
let posInvoiceService = null;
let managerOverrideService = null;
let pool = null;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Fire-and-forget audit log helper.
 */
function auditLog(req, eventType, eventCategory, severity, entityId, details) {
  const auditLogService = req.app.get('auditLogService');
  if (!auditLogService) return;
  auditLogService.logEvent({
    eventType,
    eventCategory,
    severity,
    employeeId: req.user?.id,
    transactionId: details?.transaction_id || null,
    entityType: 'sales_order',
    entityId,
    details,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
}

/**
 * Find or create a sales_orders record for a transaction.
 */
async function findOrCreateSalesOrder(transactionId, userId, req) {
  const existing = await pool.query(
    'SELECT * FROM sales_orders WHERE transaction_id = $1 LIMIT 1',
    [transactionId]
  );
  if (existing.rows.length) return { salesOrder: existing.rows[0], created: false };

  const txnResult = await pool.query(
    'SELECT total_amount, customer_id, status FROM transactions WHERE transaction_id = $1',
    [transactionId]
  );
  if (!txnResult.rows.length) throw ApiError.notFound('Transaction');
  const txn = txnResult.rows[0];

  const paymentsResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total_paid
     FROM payments WHERE transaction_id = $1 AND status = 'completed'`,
    [transactionId]
  );
  const totalPaid = Math.round(parseFloat(paymentsResult.rows[0].total_paid) * 100);
  const totalAmount = Math.round(parseFloat(txn.total_amount) * 100);
  const balanceDue = Math.max(0, totalAmount - totalPaid);

  const insertResult = await pool.query(`
    INSERT INTO sales_orders
      (sales_order_number, transaction_id, customer_id, status, total_amount, balance_due, created_by)
    VALUES
      ('', $1, $2, 'confirmed', $3, $4, $5)
    RETURNING *
  `, [transactionId, txn.customer_id, totalAmount, balanceDue, userId]);

  const salesOrder = insertResult.rows[0];

  // Audit: Sales Order created
  auditLog(req, 'SALES_ORDER_CREATED', 'sales_order', 'info', salesOrder.id, {
    sales_order_number: salesOrder.sales_order_number,
    transaction_id: transactionId,
    customer_id: txn.customer_id,
    total_amount: totalAmount,
    balance_due: balanceDue,
    created_by: userId
  });

  return { salesOrder, created: true };
}

/**
 * If balance_due > 0, auto-generate an invoice and link it to the sales order.
 */
async function autoConvertToInvoice(salesOrder, transactionId) {
  if (salesOrder.balance_due <= 0) return salesOrder;
  if (salesOrder.status === 'invoiced') return salesOrder;

  try {
    await posInvoiceService.generateInvoicePdf(transactionId);

    const updated = await pool.query(`
      UPDATE sales_orders
      SET status = 'invoiced', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [salesOrder.id]);

    return updated.rows[0] || salesOrder;
  } catch (err) {
    console.error('[SalesOrders] Auto-invoice conversion failed:', err.message);
    return salesOrder;
  }
}

/**
 * Validate manager PIN. Throws ApiError on failure.
 */
async function verifyManagerPin(pin, requiredLevel = 'manager') {
  if (!managerOverrideService) {
    throw ApiError.serverError('Manager override service not available');
  }
  if (!pin) {
    throw ApiError.badRequest('Manager PIN is required');
  }

  const result = await managerOverrideService.validateManagerPin(pin, requiredLevel);

  if (!result.valid) {
    const msg = result.locked
      ? `PIN locked. Try again after ${result.lockoutMinutes || 15} minutes.`
      : `Invalid PIN. ${result.remainingAttempts ?? 'Unknown'} attempts remaining.`;
    throw ApiError.forbidden(msg);
  }

  return result; // { valid, managerId, managerName, approvalLevel }
}

// ============================================================================
// GET ROUTES — authenticate only (any logged-in user)
// ============================================================================

/**
 * GET /api/sales-orders/list/recent
 * List recent sales orders.
 */
router.get('/list/recent', authenticate, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const result = await pool.query(`
    SELECT so.*, t.transaction_number, c.name AS customer_name
    FROM sales_orders so
    LEFT JOIN transactions t ON so.transaction_id = t.transaction_id
    LEFT JOIN customers c ON so.customer_id = c.id
    ORDER BY so.created_at DESC
    LIMIT $1
  `, [limit]);

  res.success(result.rows);
}));

/**
 * GET /api/sales-orders/:id/pdf
 * Download Sales Order Confirmation PDF.
 */
router.get('/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);
  if (isNaN(transactionId)) throw ApiError.badRequest('Invalid transaction ID');

  let { salesOrder } = await findOrCreateSalesOrder(transactionId, req.user?.id, req);
  salesOrder = await autoConvertToInvoice(salesOrder, transactionId);

  const pdfBuffer = await salesOrderService.generateSalesOrderPdf(transactionId);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="sales-order-${salesOrder.sales_order_number}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}));

/**
 * GET /api/sales-orders/:id/view
 * View Sales Order Confirmation PDF inline (browser preview).
 */
router.get('/:id/view', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);
  if (isNaN(transactionId)) throw ApiError.badRequest('Invalid transaction ID');

  let { salesOrder } = await findOrCreateSalesOrder(transactionId, req.user?.id, req);
  salesOrder = await autoConvertToInvoice(salesOrder, transactionId);

  const pdfBuffer = await salesOrderService.generateSalesOrderPdf(transactionId);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="sales-order-${salesOrder.sales_order_number}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}));

/**
 * GET /api/sales-orders/:id/data
 * Get Sales Order data as JSON.
 */
router.get('/:id/data', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);
  if (isNaN(transactionId)) throw ApiError.badRequest('Invalid transaction ID');

  const { salesOrder } = await findOrCreateSalesOrder(transactionId, req.user?.id, req);
  const data = await salesOrderService.getSalesOrderData(transactionId);

  res.success({
    ...data,
    salesOrder: {
      id: salesOrder.id,
      salesOrderNumber: salesOrder.sales_order_number,
      status: salesOrder.status,
      balanceDue: salesOrder.balance_due,
      invoiceId: salesOrder.invoice_id
    }
  });
}));

// ============================================================================
// POST ROUTES — requireRole('admin', 'manager')
// ============================================================================

/**
 * POST /api/sales-orders/:id
 * Create a sales order record for a transaction (idempotent).
 */
router.post('/:id', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);
  if (isNaN(transactionId)) throw ApiError.badRequest('Invalid transaction ID');

  let { salesOrder } = await findOrCreateSalesOrder(transactionId, req.user?.id, req);
  salesOrder = await autoConvertToInvoice(salesOrder, transactionId);

  res.success(salesOrder);
}));

// ============================================================================
// PATCH ROUTES — PIN-protected amendments
// ============================================================================

/**
 * PATCH /api/sales-orders/:id/amend
 * Amend a sales order. Requires manager/admin role + manager PIN.
 * Amendable fields: delivery_date, delivery_address, delivery_instructions, status, notes
 */
router.patch('/:id/amend', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const salesOrderId = parseInt(req.params.id, 10);
  if (isNaN(salesOrderId)) throw ApiError.badRequest('Invalid sales order ID');

  const { managerPin, ...amendments } = req.body;

  // Verify manager PIN
  const pinResult = await verifyManagerPin(managerPin, 'manager');

  // Fetch current record
  const currentResult = await pool.query('SELECT * FROM sales_orders WHERE id = $1', [salesOrderId]);
  if (!currentResult.rows.length) throw ApiError.notFound('Sales Order');
  const before = currentResult.rows[0];

  if (before.status === 'cancelled') {
    throw ApiError.badRequest('Cannot amend a cancelled sales order');
  }

  // Build dynamic UPDATE from allowed fields
  const allowedFields = ['delivery_date', 'delivery_address', 'delivery_instructions', 'status', 'notes'];
  const updates = [];
  const values = [];
  const changes = {};
  let idx = 1;

  for (const field of allowedFields) {
    if (amendments[field] !== undefined) {
      updates.push(`${field} = $${idx++}`);
      values.push(amendments[field]);
      changes[field] = { from: before[field], to: amendments[field] };
    }
  }

  if (!updates.length) {
    throw ApiError.badRequest('No amendable fields provided. Allowed: ' + allowedFields.join(', '));
  }

  // Prevent status changes to 'cancelled' via amend — use the cancel endpoint
  if (amendments.status === 'cancelled') {
    throw ApiError.badRequest('Use the cancel endpoint to cancel a sales order');
  }

  values.push(salesOrderId);
  const updateResult = await pool.query(`
    UPDATE sales_orders
    SET ${updates.join(', ')}, updated_at = NOW()
    WHERE id = $${idx}
    RETURNING *
  `, values);

  const after = updateResult.rows[0];

  // Audit: Sales Order amended
  auditLog(req, 'SALES_ORDER_AMENDED', 'sales_order', 'warning', salesOrderId, {
    sales_order_number: before.sales_order_number,
    transaction_id: before.transaction_id,
    amended_by: req.user?.id,
    approved_by_manager: pinResult.managerName,
    approved_by_manager_id: pinResult.managerId,
    approval_level: pinResult.approvalLevel,
    changes
  });

  res.success({
    salesOrder: after,
    amendedBy: req.user?.name || req.user?.id,
    approvedBy: pinResult.managerName,
    changes
  });
}));

/**
 * PATCH /api/sales-orders/:id/cancel
 * Cancel a sales order. Requires admin role + manager PIN.
 */
router.patch('/:id/cancel', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const salesOrderId = parseInt(req.params.id, 10);
  if (isNaN(salesOrderId)) throw ApiError.badRequest('Invalid sales order ID');

  const { managerPin, cancellation_reason } = req.body;

  if (!cancellation_reason || !cancellation_reason.trim()) {
    throw ApiError.badRequest('Cancellation reason is required');
  }

  // Verify manager PIN
  const pinResult = await verifyManagerPin(managerPin, 'manager');

  // Fetch current record
  const currentResult = await pool.query('SELECT * FROM sales_orders WHERE id = $1', [salesOrderId]);
  if (!currentResult.rows.length) throw ApiError.notFound('Sales Order');
  const before = currentResult.rows[0];

  if (before.status === 'cancelled') {
    throw ApiError.badRequest('Sales order is already cancelled');
  }

  // Cancel the sales order
  const updateResult = await pool.query(`
    UPDATE sales_orders
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [salesOrderId]);

  const after = updateResult.rows[0];

  // If an invoice was auto-generated, flag it for review
  let invoiceFlagged = false;
  if (before.status === 'invoiced' && before.invoice_id) {
    try {
      await pool.query(`
        UPDATE invoices SET notes = COALESCE(notes, '') || ' [REVIEW: Linked sales order cancelled]'
        WHERE id = $1
      `, [before.invoice_id]);
      invoiceFlagged = true;
    } catch {
      // invoices table may not have notes column — non-critical
    }
  }

  // Audit: Sales Order cancelled
  auditLog(req, 'SALES_ORDER_CANCELLED', 'sales_order', 'critical', salesOrderId, {
    sales_order_number: before.sales_order_number,
    transaction_id: before.transaction_id,
    customer_id: before.customer_id,
    previous_status: before.status,
    cancellation_reason: cancellation_reason.trim(),
    cancelled_by: req.user?.id,
    cancelled_by_name: req.user?.name || `${req.user?.firstName} ${req.user?.lastName}`,
    approved_by_manager: pinResult.managerName,
    approved_by_manager_id: pinResult.managerId,
    approval_level: pinResult.approvalLevel,
    had_invoice: before.status === 'invoiced',
    invoice_id: before.invoice_id,
    invoice_flagged_for_review: invoiceFlagged,
    total_amount: before.total_amount,
    balance_due: before.balance_due
  });

  res.success({
    salesOrder: after,
    cancelledBy: req.user?.name || req.user?.id,
    approvedBy: pinResult.managerName,
    reason: cancellation_reason.trim(),
    invoiceFlaggedForReview: invoiceFlagged
  });
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  salesOrderService = deps.salesOrderService;
  posInvoiceService = deps.posInvoiceService;
  managerOverrideService = deps.managerOverrideService;
  pool = deps.pool;
  return router;
};

module.exports = { init };
