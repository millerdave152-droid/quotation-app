/**
 * Stripe Payment API Routes
 */

const express = require('express');
const router = express.Router();

module.exports = (pool, cache, stripeService) => {

  /**
   * POST /api/stripe/create-checkout
   * Create a Stripe checkout session for an invoice
   */
  router.post('/create-checkout', async (req, res) => {
    try {
      if (!stripeService.isConfigured()) {
        return res.status(503).json({ error: 'Stripe is not configured' });
      }

      const session = await stripeService.createCheckoutSession(
        req.body.invoiceId,
        {
          successUrl: req.body.successUrl,
          cancelUrl: req.body.cancelUrl,
          allowDeposit: req.body.allowDeposit,
          depositPercent: req.body.depositPercent
        }
      );

      res.json({
        sessionId: session.id,
        url: session.url
      });
    } catch (error) {
      console.error('Error creating checkout session:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/stripe/payment-link
   * Generate a payment link for a quotation
   */
  router.post('/payment-link', async (req, res) => {
    try {
      const link = await stripeService.generatePaymentLink(
        req.body.quotationId,
        {
          amountCents: req.body.amountCents,
          depositPercent: req.body.depositPercent,
          expiresInDays: req.body.expiresInDays || 7
        }
      );

      res.json(link);
    } catch (error) {
      console.error('Error generating payment link:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * GET /api/stripe/payment-link/:token
   * Get payment link details by token
   */
  router.get('/payment-link/:token', async (req, res) => {
    try {
      const linkData = await stripeService.getPaymentLinkByToken(req.params.token);

      if (!linkData) {
        return res.status(404).json({ error: 'Payment link not found' });
      }

      res.json(linkData);
    } catch (error) {
      console.error('Error fetching payment link:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/stripe/payment-link/:token/process
   * Process payment via payment link
   */
  router.post('/payment-link/:token/process', async (req, res) => {
    try {
      if (!stripeService.isConfigured()) {
        return res.status(503).json({ error: 'Stripe is not configured' });
      }

      const result = await stripeService.processPaymentLink(
        req.params.token,
        req.body
      );

      res.json(result);
    } catch (error) {
      console.error('Error processing payment link:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/stripe/webhook
   * Handle Stripe webhooks
   */
  router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const signature = req.headers['stripe-signature'];

      if (!signature) {
        return res.status(400).json({ error: 'Missing stripe-signature header' });
      }

      const result = await stripeService.handleWebhook(req.body, signature);

      res.json(result);
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * GET /api/stripe/payment-status/:paymentIntentId
   * Check payment status
   */
  router.get('/payment-status/:paymentIntentId', async (req, res) => {
    try {
      if (!stripeService.isConfigured()) {
        return res.status(503).json({ error: 'Stripe is not configured' });
      }

      const status = await stripeService.getPaymentStatus(req.params.paymentIntentId);
      res.json(status);
    } catch (error) {
      console.error('Error checking payment status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/stripe/refund
   * Refund a payment
   */
  router.post('/refund', async (req, res) => {
    try {
      if (!stripeService.isConfigured()) {
        return res.status(503).json({ error: 'Stripe is not configured' });
      }

      const refund = await stripeService.refundPayment(
        req.body.chargeId,
        req.body.amountCents,
        req.body.reason
      );

      res.json(refund);
    } catch (error) {
      console.error('Error processing refund:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * GET /api/stripe/config
   * Get Stripe configuration status (public info only)
   */
  router.get('/config', async (req, res) => {
    res.json({
      configured: stripeService.isConfigured(),
      mode: process.env.STRIPE_MODE || 'test',
      publicKey: process.env.STRIPE_PUBLISHABLE_KEY || null
    });
  });

  return router;
};
