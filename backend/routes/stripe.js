/**
 * Stripe Payment API Routes
 * Handles Stripe checkout, payment links, webhooks, and refunds
 * Uses consistent error handling with asyncHandler and ApiError
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

module.exports = (pool, cache, stripeService) => {

  /**
   * Middleware to check if Stripe is configured
   */
  const requireStripeConfigured = (req, res, next) => {
    if (!stripeService.isConfigured()) {
      throw ApiError.badRequest('Stripe is not configured', {
        code: 'STRIPE_NOT_CONFIGURED'
      });
    }
    next();
  };

  /**
   * POST /api/stripe/create-checkout
   * Create a Stripe checkout session for an invoice
   */
  router.post('/create-checkout', authenticate, asyncHandler(async (req, res) => {
    if (!stripeService.isConfigured()) {
      throw ApiError.badRequest('Stripe is not configured');
    }

    const { invoiceId, successUrl, cancelUrl } = req.body;

    if (!invoiceId) {
      throw ApiError.badRequest('Invoice ID is required');
    }

    if (!successUrl || !cancelUrl) {
      throw ApiError.badRequest('Success URL and Cancel URL are required');
    }

    const session = await stripeService.createCheckoutSession(
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
   * POST /api/stripe/payment-link
   * Generate a payment link for a quotation
   */
  router.post('/payment-link', authenticate, asyncHandler(async (req, res) => {
    const { quotationId } = req.body;

    if (!quotationId) {
      throw ApiError.badRequest('Quotation ID is required');
    }

    const link = await stripeService.generatePaymentLink(
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
   * GET /api/stripe/payment-link/:token
   * Get payment link details by token
   */
  router.get('/payment-link/:token', authenticate, asyncHandler(async (req, res) => {
    const { token } = req.params;

    if (!token) {
      throw ApiError.badRequest('Payment link token is required');
    }

    const linkData = await stripeService.getPaymentLinkByToken(token);

    if (!linkData) {
      throw ApiError.notFound('Payment link');
    }

    res.json(linkData);
  }));

  /**
   * POST /api/stripe/payment-link/:token/process
   * Process payment via payment link
   */
  router.post('/payment-link/:token/process', authenticate, asyncHandler(async (req, res) => {
    if (!stripeService.isConfigured()) {
      throw ApiError.badRequest('Stripe is not configured');
    }

    const { token } = req.params;

    if (!token) {
      throw ApiError.badRequest('Payment link token is required');
    }

    const result = await stripeService.processPaymentLink(token, req.body);
    res.json(result);
  }));

  /**
   * POST /api/stripe/webhook
   * Handle Stripe webhooks
   * NOTE: No authentication - webhooks are called directly by Stripe
   */
  router.post('/webhook', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      throw ApiError.badRequest('Missing stripe-signature header');
    }

    const result = await stripeService.handleWebhook(req.body, signature);
    res.json(result);
  }));

  /**
   * GET /api/stripe/payment-status/:paymentIntentId
   * Check payment status
   */
  router.get('/payment-status/:paymentIntentId', authenticate, asyncHandler(async (req, res) => {
    if (!stripeService.isConfigured()) {
      throw ApiError.badRequest('Stripe is not configured');
    }

    const { paymentIntentId } = req.params;

    if (!paymentIntentId) {
      throw ApiError.badRequest('Payment intent ID is required');
    }

    const status = await stripeService.getPaymentStatus(paymentIntentId);
    res.json(status);
  }));

  /**
   * POST /api/stripe/refund
   * Refund a payment
   */
  router.post('/refund', authenticate, asyncHandler(async (req, res) => {
    if (!stripeService.isConfigured()) {
      throw ApiError.badRequest('Stripe is not configured');
    }

    const { chargeId } = req.body;

    if (!chargeId) {
      throw ApiError.badRequest('Charge ID is required');
    }

    const refund = await stripeService.refundPayment(
      chargeId,
      req.body.amountCents,
      req.body.reason
    );

    res.json(refund);
  }));

  /**
   * GET /api/stripe/config
   * Get Stripe configuration status (public info only)
   */
  router.get('/config', authenticate, asyncHandler(async (req, res) => {
    res.json({
      configured: stripeService.isConfigured(),
      mode: process.env.STRIPE_MODE || 'test',
      publicKey: process.env.STRIPE_PUBLISHABLE_KEY || null
    });
  }));

  return router;
};
