/**
 * POS Payments Routes
 * API endpoints for POS payment processing
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let posPaymentService = null;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createPaymentIntentSchema = Joi.object({
  amountCents: Joi.number().integer().positive().required(),
  transactionId: Joi.number().integer().optional(),
  customerId: Joi.number().integer().optional(),
  description: Joi.string().max(255).optional()
});

const confirmPaymentSchema = Joi.object({
  paymentIntentId: Joi.string().required()
});

const checkCreditSchema = Joi.object({
  customerId: Joi.number().integer().positive().required(),
  amountCents: Joi.number().integer().positive().optional()
});

const chargeAccountSchema = Joi.object({
  customerId: Joi.number().integer().positive().required(),
  amountCents: Joi.number().integer().positive().required(),
  transactionId: Joi.number().integer().positive().required(),
  notes: Joi.string().max(255).optional()
});

const giftCardBalanceSchema = Joi.object({
  cardNumber: Joi.string().min(10).max(20).required(),
  pin: Joi.string().max(10).optional()
});

const redeemGiftCardSchema = Joi.object({
  cardNumber: Joi.string().min(10).max(20).required(),
  amountCents: Joi.number().integer().positive().required(),
  transactionId: Joi.number().integer().positive().required(),
  pin: Joi.string().max(10).optional()
});

const issueGiftCardSchema = Joi.object({
  amountCents: Joi.number().integer().positive().min(100).max(50000).required(),
  customerId: Joi.number().integer().optional(),
  expiresInDays: Joi.number().integer().min(30).max(1095).default(365)
});

// ============================================================================
// CARD PAYMENT ROUTES
// ============================================================================

/**
 * POST /api/pos-payments/card/create-intent
 * Create a Stripe PaymentIntent for card payment
 */
router.post('/card/create-intent', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = createPaymentIntentSchema.validate(req.body);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const { amountCents, transactionId, customerId, description } = value;

  const result = await posPaymentService.createCardPaymentIntent(amountCents, {
    transactionId,
    customerId,
    description,
    userId: req.user.id
  });

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /api/pos-payments/card/cancel
 * Cancel a PaymentIntent (cleanup on unmount)
 */
router.post('/card/cancel', authenticate, asyncHandler(async (req, res) => {
  const { paymentIntentId } = req.body;

  if (!paymentIntentId) {
    throw ApiError.badRequest('paymentIntentId is required');
  }

  try {
    await posPaymentService.cancelPaymentIntent(paymentIntentId);
    res.json({ success: true });
  } catch (err) {
    // Intent may already be completed/cancelled — that's OK
    res.json({ success: true, note: err.message });
  }
}));

/**
 * POST /api/pos-payments/card/confirm
 * Confirm a card payment and get details
 */
router.post('/card/confirm', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = confirmPaymentSchema.validate(req.body);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const result = await posPaymentService.confirmCardPayment(value.paymentIntentId);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.error,
      status: result.status
    });
  }

  res.json({
    success: true,
    data: result
  });
}));

// ============================================================================
// CUSTOMER ACCOUNT/TAB ROUTES
// ============================================================================

/**
 * POST /api/pos-payments/account/check-credit
 * Check customer's available credit
 */
router.post('/account/check-credit', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = checkCreditSchema.validate(req.body);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const { customerId, amountCents } = value;

  let result;
  if (amountCents) {
    result = await posPaymentService.checkCreditAvailability(customerId, amountCents);
  } else {
    result = await posPaymentService.checkCustomerCredit(customerId);
  }

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /api/pos-payments/account/charge
 * Charge an amount to customer's account
 */
router.post('/account/charge', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = chargeAccountSchema.validate(req.body);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const { customerId, amountCents, transactionId, notes } = value;

  const result = await posPaymentService.chargeCustomerAccount(
    customerId,
    amountCents,
    transactionId,
    notes
  );

  res.json({
    success: true,
    data: result
  });
}));

// ============================================================================
// GIFT CARD ROUTES
// ============================================================================

/**
 * POST /api/pos-payments/gift-card/balance
 * Check gift card balance
 */
router.post('/gift-card/balance', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = giftCardBalanceSchema.validate(req.body);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const result = await posPaymentService.validateGiftCard(value.cardNumber, value.pin);

  if (!result.valid) {
    return res.status(400).json({
      success: false,
      error: result.error,
      cardNumber: result.cardNumber
    });
  }

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /api/pos-payments/gift-card/redeem
 * Redeem a gift card for payment
 */
router.post('/gift-card/redeem', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = redeemGiftCardSchema.validate(req.body);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const { cardNumber, amountCents, transactionId, pin } = value;

  const result = await posPaymentService.redeemGiftCard(
    cardNumber,
    amountCents,
    transactionId,
    req.user.id,
    pin
  );

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /api/pos-payments/gift-card/issue
 * Issue a new gift card (admin/manager only)
 */
router.post('/gift-card/issue', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const { error, value } = issueGiftCardSchema.validate(req.body);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const { amountCents, customerId, expiresInDays } = value;

  const result = await posPaymentService.issueGiftCard(
    amountCents,
    req.user.id,
    { customerId, expiresInDays }
  );

  res.status(201).json({
    success: true,
    data: result
  });
}));

// ============================================================================
// E-TRANSFER ROUTES
// ============================================================================

let pool = null;
let emailService = null;

/**
 * POST /api/pos-payments/etransfer/generate-reference
 * Generate a unique e-transfer reference code (TT-YYYY-XXXXX)
 */
router.post('/etransfer/generate-reference', authenticate, asyncHandler(async (req, res) => {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let reference;
  let attempts = 0;

  while (attempts < 10) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    reference = `TT-${year}-${code}`;

    // Check uniqueness
    const existing = await pool.query(
      'SELECT 1 FROM transactions WHERE etransfer_reference = $1',
      [reference]
    );
    if (existing.rows.length === 0) break;
    attempts++;
  }

  if (attempts >= 10) {
    throw ApiError.internal('Unable to generate unique reference code');
  }

  res.json({ success: true, data: { reference } });
}));

/**
 * POST /api/pos-payments/etransfer/email-instructions
 * Send e-transfer instructions to customer
 */
router.post('/etransfer/email-instructions', authenticate, asyncHandler(async (req, res) => {
  const schema = Joi.object({
    transactionId: Joi.number().integer().optional().allow(null),
    customerEmail: Joi.string().email().required(),
    reference: Joi.string().required(),
    amount: Joi.number().positive().required(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const { customerEmail, reference, amount } = value;
  const etransferEmail = process.env.ETRANSFER_EMAIL || 'payments@teletime.ca';

  if (emailService) {
    await emailService.sendEmail({
      to: customerEmail,
      subject: `E-Transfer Payment Instructions - ${reference}`,
      html: `
        <h2>E-Transfer Payment Instructions</h2>
        <p>Please send an Interac e-Transfer with the following details:</p>
        <table style="border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; font-weight: bold;">Send To:</td><td style="padding: 8px;">${etransferEmail}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Amount:</td><td style="padding: 8px;">$${amount.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Reference Code:</td><td style="padding: 8px; font-size: 18px; font-weight: bold;">${reference}</td></tr>
        </table>
        <p><strong>Important:</strong> Please include the reference code <strong>${reference}</strong> in the e-transfer memo/message field.</p>
        <p>Your order will be processed once the e-transfer has been received and confirmed.</p>
        <p>Thank you for your purchase!</p>
      `,
    });
  }

  res.json({ success: true });
}));

/**
 * POST /api/pos-payments/etransfer/confirm
 * Confirm an e-transfer payment (Hub-side)
 */
router.post('/etransfer/confirm', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const schema = Joi.object({
    transactionId: Joi.number().integer().optional(),
    reference: Joi.string().optional(),
  }).or('transactionId', 'reference');

  const { error, value } = schema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const { transactionId, reference } = value;

  // Find the transaction
  let query, params;
  if (transactionId) {
    query = 'SELECT transaction_id, etransfer_status FROM transactions WHERE transaction_id = $1';
    params = [transactionId];
  } else {
    query = 'SELECT transaction_id, etransfer_status FROM transactions WHERE etransfer_reference = $1';
    params = [reference];
  }

  const result = await pool.query(query, params);
  if (result.rows.length === 0) {
    throw ApiError.notFound('Transaction');
  }

  const txn = result.rows[0];
  if (txn.etransfer_status === 'confirmed') {
    return res.json({ success: true, message: 'Already confirmed' });
  }

  // Update transaction
  await pool.query(
    `UPDATE transactions
     SET etransfer_status = 'confirmed', etransfer_received_at = NOW(),
         status = 'completed', completed_at = NOW()
     WHERE transaction_id = $1`,
    [txn.transaction_id]
  );

  // Update payment status
  await pool.query(
    `UPDATE payments SET status = 'completed'
     WHERE transaction_id = $1 AND payment_method = 'etransfer'`,
    [txn.transaction_id]
  );

  res.json({ success: true, data: { transactionId: txn.transaction_id } });
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
  posPaymentService = deps.posPaymentService;
  pool = deps.pool;
  emailService = deps.emailService;
  return router;
};

module.exports = { init };
