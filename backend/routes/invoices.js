/**
 * Invoices API Routes
 * Handles invoice management, creation, payments, and status updates
 * Uses consistent error handling with asyncHandler and ApiError
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

module.exports = (pool, cache, invoiceService) => {

  /**
   * GET /api/invoices
   * List invoices with filters
   */
  router.get('/', asyncHandler(async (req, res) => {
    const result = await invoiceService.getInvoices({
      customerId: req.query.customerId,
      orderId: req.query.orderId,
      quotationId: req.query.quotationId,
      status: req.query.status,
      search: req.query.search,
      overdue: req.query.overdue,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder
    });

    res.json(result);
  }));

  /**
   * GET /api/invoices/summary
   * Get invoice summary statistics
   */
  router.get('/summary', asyncHandler(async (req, res) => {
    const summary = await invoiceService.getInvoiceSummary({
      customerId: req.query.customerId,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate
    });

    res.json(summary);
  }));

  /**
   * GET /api/invoices/:id
   * Get invoice by ID
   */
  router.get('/:id', asyncHandler(async (req, res) => {
    const invoiceId = parseInt(req.params.id);

    if (isNaN(invoiceId)) {
      throw ApiError.badRequest('Invalid invoice ID');
    }

    const invoice = await invoiceService.getInvoiceById(invoiceId);

    if (!invoice) {
      throw ApiError.notFound('Invoice');
    }

    res.json(invoice);
  }));

  /**
   * POST /api/invoices/from-quote/:quoteId
   * Create invoice from quotation
   */
  router.post('/from-quote/:quoteId', asyncHandler(async (req, res) => {
    const quoteId = parseInt(req.params.quoteId);

    if (isNaN(quoteId)) {
      throw ApiError.badRequest('Invalid quote ID');
    }

    const invoice = await invoiceService.createFromQuote(
      quoteId,
      {
        dueDate: req.body.dueDate,
        paymentTerms: req.body.paymentTerms,
        notes: req.body.notes,
        createdBy: req.body.createdBy || 'api'
      }
    );

    res.status(201).json(invoice);
  }));

  /**
   * POST /api/invoices/from-order/:orderId
   * Create invoice from order
   */
  router.post('/from-order/:orderId', asyncHandler(async (req, res) => {
    const orderId = parseInt(req.params.orderId);

    if (isNaN(orderId)) {
      throw ApiError.badRequest('Invalid order ID');
    }

    const invoice = await invoiceService.createFromOrder(
      orderId,
      {
        dueDate: req.body.dueDate,
        paymentTerms: req.body.paymentTerms,
        notes: req.body.notes,
        createdBy: req.body.createdBy || 'api'
      }
    );

    res.status(201).json(invoice);
  }));

  /**
   * POST /api/invoices/:id/send
   * Send invoice to customer
   */
  router.post('/:id/send', asyncHandler(async (req, res) => {
    const invoiceId = parseInt(req.params.id);

    if (isNaN(invoiceId)) {
      throw ApiError.badRequest('Invalid invoice ID');
    }

    const invoice = await invoiceService.sendInvoice(
      invoiceId,
      {
        paymentLinkUrl: req.body.paymentLinkUrl,
        customMessage: req.body.customMessage
      }
    );

    res.json(invoice);
  }));

  /**
   * POST /api/invoices/:id/payments
   * Record a payment on invoice
   */
  router.post('/:id/payments', asyncHandler(async (req, res) => {
    const invoiceId = parseInt(req.params.id);

    if (isNaN(invoiceId)) {
      throw ApiError.badRequest('Invalid invoice ID');
    }

    if (!req.body.amountCents || req.body.amountCents <= 0) {
      throw ApiError.badRequest('Valid payment amount is required');
    }

    const invoice = await invoiceService.recordPayment(
      invoiceId,
      {
        amountCents: req.body.amountCents,
        paymentMethod: req.body.paymentMethod,
        stripePaymentIntentId: req.body.stripePaymentIntentId,
        stripeChargeId: req.body.stripeChargeId,
        referenceNumber: req.body.referenceNumber,
        notes: req.body.notes
      }
    );

    res.json(invoice);
  }));

  /**
   * POST /api/invoices/:id/void
   * Void an invoice
   */
  router.post('/:id/void', asyncHandler(async (req, res) => {
    const invoiceId = parseInt(req.params.id);

    if (isNaN(invoiceId)) {
      throw ApiError.badRequest('Invalid invoice ID');
    }

    const invoice = await invoiceService.voidInvoice(
      invoiceId,
      req.body.reason,
      req.body.voidedBy || 'api'
    );

    res.json(invoice);
  }));

  /**
   * POST /api/invoices/update-overdue
   * Update overdue invoice statuses (for scheduled job)
   */
  router.post('/update-overdue', asyncHandler(async (req, res) => {
    const count = await invoiceService.updateOverdueStatus();
    res.json({ updated: count });
  }));

  return router;
};
