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
let deliveryWaiverService = null;
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
      customerId: txn.customer_id
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

  // When delivered, auto-create invoice if one doesn't exist yet
  if (status === 'delivered' && updated.transaction_id) {
    try {
      const soResult = await pool.query(
        'SELECT * FROM sales_orders WHERE transaction_id = $1 LIMIT 1',
        [updated.transaction_id]
      );
      const so = soResult.rows[0];
      if (so && so.status !== 'invoiced') {
        const existingInvoice = await pool.query(
          'SELECT id FROM invoices WHERE id = $1', [so.invoice_id]
        );
        if (!existingInvoice.rows.length) {
          // Fetch payment totals
          const payResult = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) AS total_paid
             FROM payments WHERE transaction_id = $1 AND status = 'completed'`,
            [updated.transaction_id]
          );
          const totalPaidCents = Math.round(parseFloat(payResult.rows[0].total_paid) * 100);
          const totalCents = so.total_amount;
          const balanceDueCents = Math.max(0, totalCents - totalPaidCents);
          const invoiceStatus = balanceDueCents <= 0 ? 'paid' : 'sent';
          const subtotalCents = Math.round(totalCents / 1.13);
          const taxCents = totalCents - subtotalCents;

          const today = new Date();
          const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
          const seqResult = await pool.query(
            `SELECT COUNT(*) + 1 AS next_seq FROM invoices WHERE invoice_number LIKE $1`,
            [`INV-${dateStr}-%`]
          );
          const seq = String(seqResult.rows[0].next_seq).padStart(4, '0');
          const invoiceNumber = `INV-${dateStr}-${seq}`;

          const invResult = await pool.query(`
            INSERT INTO invoices (
              invoice_number, customer_id, status,
              subtotal_cents, tax_cents, tax_rate, discount_cents, total_cents,
              amount_paid_cents, balance_due_cents,
              invoice_date, due_date, payment_terms,
              notes, created_by, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,13.00,0,$6,$7,$8,CURRENT_DATE,CURRENT_DATE+INTERVAL '30 days','Net 30',$9,'system',NOW(),NOW())
            RETURNING id
          `, [invoiceNumber, so.customer_id, invoiceStatus, subtotalCents, taxCents, totalCents, totalPaidCents, balanceDueCents,
              `Auto-generated on delivery of ${updated.slip_number}`]);

          await pool.query(
            'UPDATE sales_orders SET status = $1, invoice_id = $2, updated_at = NOW() WHERE id = $3',
            ['invoiced', invResult.rows[0].id, so.id]
          );
        }
      }
    } catch (invoiceErr) {
      console.error('[DeliverySlips] Delivery-triggered invoice creation failed:', invoiceErr.message);
    }
  }

  res.success(updated);
}));

// ============================================================================
// EMAIL
// ============================================================================

/**
 * POST /api/delivery-slips/:id/email — Email delivery slip PDF to customer
 */
router.post('/:id/email', authenticate, asyncHandler(async (req, res) => {
  const slipId = parseInt(req.params.id);
  if (isNaN(slipId)) throw ApiError.badRequest('Invalid slip ID');

  // Get slip data to find customer email
  const data = await deliverySlipService.getSlipData(slipId);
  const slip = data.slip;

  const email = req.body.email || slip.customer_email;
  if (!email) throw ApiError.badRequest('No email address available');

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) throw ApiError.badRequest('Invalid email address');

  // Generate PDF
  const pdfBuffer = await deliverySlipService.generateDeliverySlipPdf(slipId);

  // Build raw MIME email with PDF attachment (same pattern as ReceiptService)
  const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
  const ses = new SESv2Client({ region: process.env.AWS_REGION || 'us-east-1' });
  const fromEmail = process.env.EMAIL_FROM || 'deliveries@teletime.ca';
  const companyName = process.env.COMPANY_NAME || 'Teletime';

  const pdfBase64 = pdfBuffer.toString('base64');
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2)}`;
  const slipNumber = slip.slip_number || `DS-${slipId}`;
  const filename = `${slipNumber}.pdf`;
  const customerName = slip.customer_name || 'Customer';

  const emailHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);padding:30px;text-align:center;">
        <h1 style="color:white;margin:0;">Delivery Slip</h1>
      </div>
      <div style="padding:30px;">
        <p style="font-size:16px;color:#374151;">Dear ${customerName},</p>
        <p style="color:#374151;">Please find your delivery slip attached with the details of your upcoming delivery.</p>
        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#6b7280;font-weight:600;">DELIVERY SLIP</p>
          <p style="margin:0;font-size:20px;font-weight:700;color:#1e40af;">${slipNumber}</p>
        </div>
        <p style="color:#374151;">Thank you for shopping at Teletime Superstores!</p>
        <p style="color:#6b7280;font-size:14px;">Questions? Call us at (905) 273-5550</p>
      </div>
      <div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px;">
        &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
      </div>
    </div>
  </body></html>`;

  const rawEmail = [
    `From: ${companyName} <${fromEmail}>`,
    `To: ${email}`,
    `Subject: Your Delivery Slip ${slipNumber} — Teletime Superstores`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    emailHtml,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    pdfBase64,
    '',
    `--${boundary}--`
  ].join('\r\n');

  const command = new SendEmailCommand({
    FromEmailAddress: fromEmail,
    Destination: { ToAddresses: [email] },
    Content: { Raw: { Data: Buffer.from(rawEmail) } }
  });

  await ses.send(command);

  auditLog(req, 'delivery_slip_emailed', 'delivery', 'info', slipId, {
    slip_number: slipNumber,
    recipient: email
  });

  res.success({ message: 'Delivery slip emailed', email });
}));

// ============================================================================
// WAIVER
// ============================================================================

/**
 * GET /api/delivery-slips/:id/waiver — Generate delivery waiver PDF
 */
router.get('/:id/waiver', authenticate, asyncHandler(async (req, res) => {
  const slipId = parseInt(req.params.id);
  if (isNaN(slipId)) throw ApiError.badRequest('Invalid slip ID');

  const pdfBuffer = await deliveryWaiverService.generateWaiverPdf(slipId);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}));

/**
 * GET /api/delivery-slips/transaction/:transactionId/waiver — Waiver by transaction (auto-create slip if needed)
 */
router.get('/transaction/:transactionId/waiver', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.transactionId);
  if (isNaN(transactionId)) throw ApiError.badRequest('Invalid transaction ID');

  // Find existing or create slip (same logic as /transaction/:id/view)
  let existing = await deliverySlipService.getSlipByTransaction(transactionId);

  if (!existing) {
    const txnResult = await pool.query(`
      SELECT t.transaction_id, t.customer_id,
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
      customerId: txn.customer_id
    }, req.user?.id);

    existing = { id: slip.id };
  }

  const pdfBuffer = await deliveryWaiverService.generateWaiverPdf(existing.id);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  deliverySlipService = deps.deliverySlipService;
  deliveryWaiverService = deps.deliveryWaiverService;
  pool = deps.pool;
  return router;
};

module.exports = { init };
