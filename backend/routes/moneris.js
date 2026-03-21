/**
 * Moneris Payment API Routes
 * Handles Moneris checkout, payment links, webhooks, and refunds
 * Uses consistent error handling with asyncHandler and ApiError
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const monerisWebhookVerify = require('../middleware/monerisWebhookVerify');
const { paymentLimiter } = require('../middleware/security');
const { validateBody, schemas } = require('../middleware/zodValidation');

module.exports = (pool, cache, monerisService) => {

  /**
   * POST /api/moneris/create-checkout
   * Create a Moneris Checkout session for an invoice
   */
  router.post('/create-checkout', authenticate, paymentLimiter, validateBody(schemas.monerisCheckout), asyncHandler(async (req, res) => {
    if (!monerisService.isConfigured()) {
      throw ApiError.badRequest('Moneris is not configured', {
        code: 'MONERIS_NOT_CONFIGURED'
      });
    }

    const { invoiceId, successUrl, cancelUrl } = req.body;

    if (!invoiceId) {
      throw ApiError.badRequest('Invoice ID is required');
    }

    if (!successUrl || !cancelUrl) {
      throw ApiError.badRequest('Success URL and Cancel URL are required');
    }

    const session = await monerisService.createCheckoutSession(
      invoiceId,
      {
        successUrl,
        cancelUrl,
        allowDeposit: req.body.allowDeposit,
        depositPercent: req.body.depositPercent
      }
    );

    res.json({
      sessionId: session.id,
      url: session.url
    });
  }));

  /**
   * POST /api/moneris/payment-link
   * Generate a payment link for a quotation
   */
  router.post('/payment-link', authenticate, paymentLimiter, validateBody(schemas.monerisPaymentLink), asyncHandler(async (req, res) => {
    const { quotationId } = req.body;

    if (!quotationId) {
      throw ApiError.badRequest('Quotation ID is required');
    }

    const link = await monerisService.generatePaymentLink(
      quotationId,
      {
        amountCents: req.body.amountCents,
        depositPercent: req.body.depositPercent,
        expiresInDays: req.body.expiresInDays || 7
      }
    );

    res.json(link);
  }));

  /**
   * GET /api/moneris/payment-link/:token
   * Get payment link details by token
   */
  router.get('/payment-link/:token', authenticate, asyncHandler(async (req, res) => {
    const { token } = req.params;

    if (!token) {
      throw ApiError.badRequest('Payment link token is required');
    }

    const linkData = await monerisService.getPaymentLinkByToken(token);

    if (!linkData) {
      throw ApiError.notFound('Payment link');
    }

    res.json(linkData);
  }));

  /**
   * POST /api/moneris/payment-link/:token/process
   * Process payment via payment link
   */
  router.post('/payment-link/:token/process', authenticate, paymentLimiter, asyncHandler(async (req, res) => {
    if (!monerisService.isConfigured()) {
      throw ApiError.badRequest('Moneris is not configured');
    }

    const { token } = req.params;

    if (!token) {
      throw ApiError.badRequest('Payment link token is required');
    }

    const result = await monerisService.processPaymentLink(token, req.body);
    res.json(result);
  }));

  /**
   * POST /api/moneris/webhook
   * Handle Moneris callbacks/webhooks
   * NOTE: No authentication - callbacks are sent directly by Moneris
   */
  router.post('/webhook', express.json(), monerisWebhookVerify, asyncHandler(async (req, res) => {
    const result = await monerisService.handleWebhook(req.body);
    res.json(result);
  }));

  /**
   * GET /api/moneris/payment-status/:orderId
   * Check payment status by Moneris order ID
   */
  router.get('/payment-status/:orderId', authenticate, asyncHandler(async (req, res) => {
    if (!monerisService.isConfigured()) {
      throw ApiError.badRequest('Moneris is not configured');
    }

    const { orderId } = req.params;

    if (!orderId) {
      throw ApiError.badRequest('Order ID is required');
    }

    const status = await monerisService.getPaymentStatus(orderId);
    res.json(status);
  }));

  /**
   * POST /api/moneris/refund
   * Refund a payment
   */
  router.post('/refund', authenticate, paymentLimiter, validateBody(schemas.monerisRefund), asyncHandler(async (req, res) => {
    if (!monerisService.isConfigured()) {
      throw ApiError.badRequest('Moneris is not configured');
    }

    const { orderId, transId } = req.body;

    if (!orderId || !transId) {
      throw ApiError.badRequest('Order ID and Transaction ID are required');
    }

    const refund = await monerisService.refundPayment(
      orderId,
      transId,
      req.body.amountCents,
      req.body.reason
    );

    res.json(refund);
  }));

  /**
   * GET /api/moneris/config
   * Get Moneris configuration status (public info only)
   */
  router.get('/config', authenticate, asyncHandler(async (req, res) => {
    res.json({
      configured: monerisService.isConfigured(),
      environment: process.env.MONERIS_ENVIRONMENT || 'testing',
      provider: 'moneris'
    });
  }));

  return router;
};
