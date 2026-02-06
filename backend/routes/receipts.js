/**
 * Receipt Routes
 * API endpoints for receipt generation and delivery
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let receiptService = null;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const emailReceiptSchema = Joi.object({
  email: Joi.string().email().required()
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/receipts/:id/pdf
 * Download PDF receipt for a transaction
 */
router.get('/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);

  if (isNaN(transactionId)) {
    throw ApiError.badRequest('Invalid transaction ID');
  }

  const pdfBuffer = await receiptService.generateReceiptPdf(transactionId);
  const receiptData = await receiptService.getReceiptData(transactionId);

  // Set response headers for PDF download
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="receipt-${receiptData.transaction.number}.pdf"`
  );
  res.setHeader('Content-Length', pdfBuffer.length);

  res.send(pdfBuffer);
}));

/**
 * GET /api/receipts/:id/thermal
 * Get thermal printer formatted receipt
 * Query params:
 *   - escpos: boolean - Include ESC/POS commands for thermal printers
 */
router.get('/:id/thermal', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);

  if (isNaN(transactionId)) {
    throw ApiError.badRequest('Invalid transaction ID');
  }

  const escPos = req.query.escpos === 'true';
  const thermalReceipt = await receiptService.generateThermalReceipt(transactionId, { escPos });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(thermalReceipt);
}));

/**
 * GET /api/receipts/:id/thermal/binary
 * Get thermal printer binary commands (ESC/POS)
 * Returns binary buffer suitable for direct printer communication
 */
router.get('/:id/thermal/binary', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);

  if (isNaN(transactionId)) {
    throw ApiError.badRequest('Invalid transaction ID');
  }

  const binaryBuffer = await receiptService.generateThermalBinary(transactionId);

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="receipt-${transactionId}.bin"`);
  res.send(binaryBuffer);
}));

/**
 * GET /api/receipts/:id/data
 * Get receipt data as JSON for custom rendering
 */
router.get('/:id/data', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);

  if (isNaN(transactionId)) {
    throw ApiError.badRequest('Invalid transaction ID');
  }

  const receiptData = await receiptService.getReceiptData(transactionId);

  res.json({
    success: true,
    data: receiptData
  });
}));

/**
 * POST /api/receipts/:id/email
 * Email receipt to customer
 */
router.post('/:id/email', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);

  if (isNaN(transactionId)) {
    throw ApiError.badRequest('Invalid transaction ID');
  }

  const { error, value } = emailReceiptSchema.validate(req.body);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const result = await receiptService.emailReceipt(transactionId, value.email);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /api/receipts/:id/preview
 * Get receipt preview as inline PDF (for browser viewing)
 */
router.get('/:id/preview', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);

  if (isNaN(transactionId)) {
    throw ApiError.badRequest('Invalid transaction ID');
  }

  const pdfBuffer = await receiptService.generateReceiptPdf(transactionId);

  // Set response headers for inline PDF viewing
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Content-Length', pdfBuffer.length);

  res.send(pdfBuffer);
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
  receiptService = deps.receiptService;
  return router;
};

module.exports = { init };
