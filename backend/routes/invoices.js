/**
 * Invoices API Routes
 */

const express = require('express');
const router = express.Router();

module.exports = (pool, cache, invoiceService) => {

  /**
   * GET /api/invoices
   * List invoices with filters
   */
  router.get('/', async (req, res) => {
    try {
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
    } catch (error) {
      console.error('Error fetching invoices:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/invoices/summary
   * Get invoice summary statistics
   */
  router.get('/summary', async (req, res) => {
    try {
      const summary = await invoiceService.getInvoiceSummary({
        customerId: req.query.customerId,
        fromDate: req.query.fromDate,
        toDate: req.query.toDate
      });

      res.json(summary);
    } catch (error) {
      console.error('Error fetching invoice summary:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/invoices/:id
   * Get invoice by ID
   */
  router.get('/:id', async (req, res) => {
    try {
      const invoice = await invoiceService.getInvoiceById(parseInt(req.params.id));

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      res.json(invoice);
    } catch (error) {
      console.error('Error fetching invoice:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/invoices/from-quote/:quoteId
   * Create invoice from quotation
   */
  router.post('/from-quote/:quoteId', async (req, res) => {
    try {
      const invoice = await invoiceService.createFromQuote(
        parseInt(req.params.quoteId),
        {
          dueDate: req.body.dueDate,
          paymentTerms: req.body.paymentTerms,
          notes: req.body.notes,
          createdBy: req.body.createdBy || 'api'
        }
      );

      res.status(201).json(invoice);
    } catch (error) {
      console.error('Error creating invoice from quote:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/invoices/from-order/:orderId
   * Create invoice from order
   */
  router.post('/from-order/:orderId', async (req, res) => {
    try {
      const invoice = await invoiceService.createFromOrder(
        parseInt(req.params.orderId),
        {
          dueDate: req.body.dueDate,
          paymentTerms: req.body.paymentTerms,
          notes: req.body.notes,
          createdBy: req.body.createdBy || 'api'
        }
      );

      res.status(201).json(invoice);
    } catch (error) {
      console.error('Error creating invoice from order:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/invoices/:id/send
   * Send invoice to customer
   */
  router.post('/:id/send', async (req, res) => {
    try {
      const invoice = await invoiceService.sendInvoice(
        parseInt(req.params.id),
        {
          paymentLinkUrl: req.body.paymentLinkUrl,
          customMessage: req.body.customMessage
        }
      );

      res.json(invoice);
    } catch (error) {
      console.error('Error sending invoice:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/invoices/:id/payments
   * Record a payment on invoice
   */
  router.post('/:id/payments', async (req, res) => {
    try {
      const invoice = await invoiceService.recordPayment(
        parseInt(req.params.id),
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
    } catch (error) {
      console.error('Error recording payment:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/invoices/:id/void
   * Void an invoice
   */
  router.post('/:id/void', async (req, res) => {
    try {
      const invoice = await invoiceService.voidInvoice(
        parseInt(req.params.id),
        req.body.reason,
        req.body.voidedBy || 'api'
      );

      res.json(invoice);
    } catch (error) {
      console.error('Error voiding invoice:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/invoices/update-overdue
   * Update overdue invoice statuses (for scheduled job)
   */
  router.post('/update-overdue', async (req, res) => {
    try {
      const count = await invoiceService.updateOverdueStatus();
      res.json({ updated: count });
    } catch (error) {
      console.error('Error updating overdue invoices:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
