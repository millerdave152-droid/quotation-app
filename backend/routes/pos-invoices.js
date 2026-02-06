/**
 * POS Invoice Routes
 * API endpoints for POS invoice generation from transactions
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let posInvoiceService = null;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const generateInvoiceSchema = Joi.object({
  terms: Joi.string().valid('immediate', 'net_7', 'net_15', 'net_30', 'net_45', 'net_60'),
  showPayments: Joi.boolean().default(true)
});

const emailInvoiceSchema = Joi.object({
  email: Joi.string().email().required(),
  terms: Joi.string().valid('immediate', 'net_7', 'net_15', 'net_30', 'net_45', 'net_60')
});

const batchInvoiceSchema = Joi.object({
  customerId: Joi.number().integer().positive(),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso(),
  unpaidOnly: Joi.boolean().default(true)
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/pos-invoices/:id/pdf
 * Download invoice PDF for a transaction
 */
router.get('/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);

  if (isNaN(transactionId)) {
    throw ApiError.badRequest('Invalid transaction ID');
  }

  const { error, value } = generateInvoiceSchema.validate(req.query);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const pdfBuffer = await posInvoiceService.generateInvoicePdf(transactionId, value);
  const invoiceData = await posInvoiceService.getInvoiceData(transactionId, value);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="Invoice-${invoiceData.invoice.number}.pdf"`
  );
  res.setHeader('Content-Length', pdfBuffer.length);

  res.send(pdfBuffer);
}));

/**
 * GET /api/pos-invoices/:id/preview
 * Preview invoice PDF inline (for browser viewing)
 */
router.get('/:id/preview', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);

  if (isNaN(transactionId)) {
    throw ApiError.badRequest('Invalid transaction ID');
  }

  const { error, value } = generateInvoiceSchema.validate(req.query);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const pdfBuffer = await posInvoiceService.generateInvoicePdf(transactionId, value);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Content-Length', pdfBuffer.length);

  res.send(pdfBuffer);
}));

/**
 * GET /api/pos-invoices/:id/data
 * Get invoice data as JSON for custom rendering
 */
router.get('/:id/data', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);

  if (isNaN(transactionId)) {
    throw ApiError.badRequest('Invalid transaction ID');
  }

  const { error, value } = generateInvoiceSchema.validate(req.query);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const invoiceData = await posInvoiceService.getInvoiceData(transactionId, value);

  res.json({
    success: true,
    data: invoiceData
  });
}));

/**
 * POST /api/pos-invoices/:id/email
 * Email invoice to customer
 */
router.post('/:id/email', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);

  if (isNaN(transactionId)) {
    throw ApiError.badRequest('Invalid transaction ID');
  }

  const { error, value } = emailInvoiceSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const result = await posInvoiceService.emailInvoice(transactionId, value.email, {
    terms: value.terms
  });

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /api/pos-invoices/batch
 * Generate batch invoices for account customers
 */
router.post('/batch', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = batchInvoiceSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const results = await posInvoiceService.generateBatchInvoices(value);

  // Don't include actual PDF buffers in response
  const summary = results.map(r => ({
    transactionId: r.transactionId,
    invoiceNumber: r.invoiceNumber,
    customerId: r.customerId,
    customerName: r.customerName,
    total: r.total,
    success: r.success,
    error: r.error
  }));

  res.json({
    success: true,
    data: {
      generated: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      invoices: summary
    }
  });
}));

/**
 * GET /api/pos-invoices/batch/:id/download
 * Download a batch invoice by transaction ID (from batch results)
 */
router.get('/batch/:id/download', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);

  if (isNaN(transactionId)) {
    throw ApiError.badRequest('Invalid transaction ID');
  }

  const pdfBuffer = await posInvoiceService.generateInvoicePdf(transactionId);
  const invoiceData = await posInvoiceService.getInvoiceData(transactionId);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="Invoice-${invoiceData.invoice.number}.pdf"`
  );
  res.setHeader('Content-Length', pdfBuffer.length);

  res.send(pdfBuffer);
}));

/**
 * POST /api/pos-invoices/batch/email
 * Email batch invoices to respective customers
 */
router.post('/batch/email', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = batchInvoiceSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  // First generate batch invoices
  const batchResults = await posInvoiceService.generateBatchInvoices(value);

  // Email each successful invoice
  const emailResults = [];

  for (const invoice of batchResults.filter(r => r.success)) {
    try {
      const data = await posInvoiceService.getInvoiceData(invoice.transactionId);

      if (data.customer.email) {
        const emailResult = await posInvoiceService.emailInvoice(
          invoice.transactionId,
          data.customer.email
        );
        emailResults.push({
          transactionId: invoice.transactionId,
          invoiceNumber: invoice.invoiceNumber,
          email: data.customer.email,
          success: true,
          messageId: emailResult.messageId
        });
      } else {
        emailResults.push({
          transactionId: invoice.transactionId,
          invoiceNumber: invoice.invoiceNumber,
          success: false,
          error: 'No email address for customer'
        });
      }
    } catch (err) {
      emailResults.push({
        transactionId: invoice.transactionId,
        invoiceNumber: invoice.invoiceNumber,
        success: false,
        error: err.message
      });
    }
  }

  res.json({
    success: true,
    data: {
      sent: emailResults.filter(r => r.success).length,
      failed: emailResults.filter(r => !r.success).length,
      results: emailResults
    }
  });
}));

/**
 * GET /api/pos-invoices/account-customers
 * Get account customers with outstanding balances
 */
router.get('/account-customers', authenticate, asyncHandler(async (req, res) => {
  const customers = await posInvoiceService.getAccountCustomersWithBalances();

  res.json({
    success: true,
    data: customers
  });
}));

/**
 * GET /api/pos-invoices/customer/:customerId/unpaid
 * Get unpaid transactions for a customer
 */
router.get('/customer/:customerId/unpaid', authenticate, asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.customerId, 10);

  if (isNaN(customerId)) {
    throw ApiError.badRequest('Invalid customer ID');
  }

  const results = await posInvoiceService.generateBatchInvoices({
    customerId,
    unpaidOnly: true
  });

  // Return data without buffers
  const invoices = results.map(r => ({
    transactionId: r.transactionId,
    invoiceNumber: r.invoiceNumber,
    customerName: r.customerName,
    total: r.total,
    success: r.success,
    error: r.error
  }));

  res.json({
    success: true,
    data: invoices
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
  posInvoiceService = deps.posInvoiceService;
  return router;
};

module.exports = { init };
