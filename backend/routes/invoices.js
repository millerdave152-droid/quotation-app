/**
 * Invoices API Routes
 * Handles invoice management, creation, payments, and status updates
 * Uses consistent error handling with asyncHandler and ApiError
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const AutoInvoiceService = require('../services/AutoInvoiceService');

module.exports = (pool, cache, invoiceService) => {
  // Initialize auto-invoice service
  const autoInvoiceService = new AutoInvoiceService(pool, invoiceService);

  // ============================================
  // AUTO-INVOICE ROUTES
  // ============================================

  /**
   * GET /api/invoices/auto-invoice/settings
   * Get auto-invoice configuration settings
   */
  router.get('/auto-invoice/settings', authenticate, asyncHandler(async (req, res) => {
    const settings = await autoInvoiceService.getSettings();
    res.json({ success: true, data: settings });
  }));

  /**
   * PUT /api/invoices/auto-invoice/settings
   * Update auto-invoice settings
   */
  router.put('/auto-invoice/settings', authenticate, asyncHandler(async (req, res) => {
    const settings = await autoInvoiceService.updateSettings(req.body);
    res.json({ success: true, data: settings });
  }));

  /**
   * GET /api/invoices/auto-invoice/recent
   * Get recent auto-generated invoices
   */
  router.get('/auto-invoice/recent', authenticate, asyncHandler(async (req, res) => {
    const { limit = 20 } = req.query;
    const invoices = await autoInvoiceService.getRecentAutoInvoices(parseInt(limit));
    res.json({ success: true, data: invoices });
  }));

  /**
   * GET /api/invoices/auto-invoice/stats
   * Get auto-invoice statistics
   */
  router.get('/auto-invoice/stats', authenticate, asyncHandler(async (req, res) => {
    const { days = 30 } = req.query;
    const stats = await autoInvoiceService.getStatistics(parseInt(days));
    res.json({ success: true, data: stats });
  }));

  /**
   * POST /api/invoices/auto-invoice/generate-from-quote/:quoteId
   * Manually generate invoice from quote
   */
  router.post('/auto-invoice/generate-from-quote/:quoteId', authenticate, asyncHandler(async (req, res) => {
    const quoteId = parseInt(req.params.quoteId);

    if (isNaN(quoteId)) {
      throw ApiError.badRequest('Invalid quote ID');
    }

    const invoice = await autoInvoiceService.generateFromQuote(quoteId, req.body);
    res.status(201).json({ success: true, data: invoice });
  }));

  /**
   * POST /api/invoices/auto-invoice/trigger/quote-won/:quoteId
   * Trigger auto-invoice for won quote (called by quote status update)
   */
  router.post('/auto-invoice/trigger/quote-won/:quoteId', authenticate, asyncHandler(async (req, res) => {
    const quoteId = parseInt(req.params.quoteId);

    if (isNaN(quoteId)) {
      throw ApiError.badRequest('Invalid quote ID');
    }

    const result = await autoInvoiceService.onQuoteWon(quoteId);
    res.json({ success: true, data: result });
  }));

  /**
   * POST /api/invoices/auto-invoice/trigger/order-created/:orderId
   * Trigger auto-invoice for created order
   */
  router.post('/auto-invoice/trigger/order-created/:orderId', authenticate, asyncHandler(async (req, res) => {
    const orderId = parseInt(req.params.orderId);

    if (isNaN(orderId)) {
      throw ApiError.badRequest('Invalid order ID');
    }

    const result = await autoInvoiceService.onOrderCreated(orderId);
    res.json({ success: true, data: result });
  }));

  // ============================================
  // STANDARD INVOICE ROUTES
  // ============================================

  /**
   * GET /api/invoices
   * List invoices with filters
   */
  router.get('/', authenticate, asyncHandler(async (req, res) => {
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
  router.get('/summary', authenticate, asyncHandler(async (req, res) => {
    const summary = await invoiceService.getInvoiceSummary({
      customerId: req.query.customerId,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate
    });

    res.json(summary);
  }));

  /**
   * GET /api/invoices/ar-aging
   * Get Accounts Receivable aging analysis
   * Returns breakdown of unpaid invoices by age buckets
   */
  router.get('/ar-aging', authenticate, asyncHandler(async (req, res) => {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE due_date >= CURRENT_DATE) as current_count,
        COALESCE(SUM(total) FILTER (WHERE due_date >= CURRENT_DATE), 0) as current_amount,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30) as overdue_30_count,
        COALESCE(SUM(total) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30), 0) as overdue_30_amount,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60) as overdue_60_count,
        COALESCE(SUM(total) FILTER (WHERE due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60), 0) as overdue_60_amount,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE - 60) as overdue_90_plus_count,
        COALESCE(SUM(total) FILTER (WHERE due_date < CURRENT_DATE - 60), 0) as overdue_90_plus_amount,
        COUNT(*) as total_count,
        COALESCE(SUM(total), 0) as total_amount
      FROM invoices
      WHERE status IN ('pending', 'partial', 'overdue')
    `);

    const aging = result.rows[0];

    res.success({
      current: {
        count: parseInt(aging.current_count) || 0,
        amount: parseFloat(aging.current_amount) || 0
      },
      overdue30: {
        count: parseInt(aging.overdue_30_count) || 0,
        amount: parseFloat(aging.overdue_30_amount) || 0
      },
      overdue60: {
        count: parseInt(aging.overdue_60_count) || 0,
        amount: parseFloat(aging.overdue_60_amount) || 0
      },
      overdue90Plus: {
        count: parseInt(aging.overdue_90_plus_count) || 0,
        amount: parseFloat(aging.overdue_90_plus_amount) || 0
      },
      total: {
        count: parseInt(aging.total_count) || 0,
        amount: parseFloat(aging.total_amount) || 0
      }
    });
  }));

  /**
   * GET /api/invoices/:id
   * Get invoice by ID
   */
  router.get('/:id', authenticate, asyncHandler(async (req, res) => {
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
  router.post('/from-quote/:quoteId', authenticate, asyncHandler(async (req, res) => {
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
  router.post('/from-order/:orderId', authenticate, asyncHandler(async (req, res) => {
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
  router.post('/:id/send', authenticate, asyncHandler(async (req, res) => {
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
  router.post('/:id/payments', authenticate, asyncHandler(async (req, res) => {
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
  router.post('/:id/void', authenticate, asyncHandler(async (req, res) => {
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
  router.post('/update-overdue', authenticate, asyncHandler(async (req, res) => {
    const count = await invoiceService.updateOverdueStatus();
    res.json({ updated: count });
  }));

  return router;
};
