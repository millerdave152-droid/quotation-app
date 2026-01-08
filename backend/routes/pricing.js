/**
 * Pricing API Routes
 */

const express = require('express');
const router = express.Router();

module.exports = (pool, cache, pricingService) => {

  /**
   * GET /api/pricing/tiers
   * Get all customer pricing tiers
   */
  router.get('/tiers', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT * FROM customer_price_tiers ORDER BY discount_percent ASC
      `);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('Error fetching pricing tiers:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/pricing/:productId
   * Get all price points for a product
   */
  router.get('/:productId', async (req, res) => {
    try {
      const pricePoints = await pricingService.getPricePoints(
        parseInt(req.params.productId)
      );

      res.json(pricePoints);
    } catch (error) {
      console.error('Error fetching price points:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/pricing/:productId/margins
   * Calculate margins at different price points
   */
  router.get('/:productId/margins', async (req, res) => {
    try {
      const sellPrice = req.query.sellPrice ? parseInt(req.query.sellPrice) : null;
      const margins = await pricingService.calculateMargins(
        parseInt(req.params.productId),
        sellPrice
      );

      res.json(margins);
    } catch (error) {
      console.error('Error calculating margins:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/pricing/:productId/simulate
   * Simulate margin at a proposed price
   */
  router.post('/:productId/simulate', async (req, res) => {
    try {
      const result = await pricingService.simulateMargin(
        parseInt(req.params.productId),
        req.body.proposedPriceCents
      );

      res.json(result);
    } catch (error) {
      console.error('Error simulating margin:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/pricing/:productId/check-violations
   * Check for price violations
   */
  router.post('/:productId/check-violations', async (req, res) => {
    try {
      const result = await pricingService.checkPriceViolations(
        parseInt(req.params.productId),
        req.body.sellPriceCents
      );

      res.json(result);
    } catch (error) {
      console.error('Error checking violations:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/pricing/customer/:customerId/:productId
   * Get customer-specific pricing recommendation
   */
  router.get('/customer/:customerId/:productId', async (req, res) => {
    try {
      const recommendation = await pricingService.getRecommendedPrice(
        parseInt(req.params.productId),
        parseInt(req.params.customerId)
      );

      res.json(recommendation);
    } catch (error) {
      console.error('Error getting customer pricing:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/pricing/customer/:customerId/history
   * Get customer product price history
   */
  router.get('/customer/:customerId/history', async (req, res) => {
    try {
      const productId = req.query.productId ? parseInt(req.query.productId) : null;
      const history = await pricingService.getCustomerPriceHistory(
        parseInt(req.params.customerId),
        productId
      );

      res.json(history);
    } catch (error) {
      console.error('Error fetching customer history:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/pricing/violations
   * List price violations
   */
  router.get('/violations/list', async (req, res) => {
    try {
      const violations = await pricingService.getPendingViolations({
        status: req.query.status || 'pending',
        limit: parseInt(req.query.limit) || 50
      });

      res.json(violations);
    } catch (error) {
      console.error('Error fetching violations:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/pricing/violations
   * Log a new price violation
   */
  router.post('/violations', async (req, res) => {
    try {
      const violation = await pricingService.logViolation({
        productId: req.body.productId,
        quotationId: req.body.quotationId,
        orderId: req.body.orderId,
        violationType: req.body.violationType,
        quotedPriceCents: req.body.quotedPriceCents,
        thresholdPriceCents: req.body.thresholdPriceCents,
        createdBy: req.body.createdBy || 'api'
      });

      res.status(201).json(violation);
    } catch (error) {
      console.error('Error logging violation:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/pricing/violations/:id/resolve
   * Approve or reject a price violation
   */
  router.post('/violations/:id/resolve', async (req, res) => {
    try {
      const violation = await pricingService.resolveViolation(
        parseInt(req.params.id),
        req.body.status, // 'approved' or 'rejected'
        req.body.approvedBy,
        req.body.notes
      );

      res.json(violation);
    } catch (error) {
      console.error('Error resolving violation:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/pricing/customer-history
   * Update customer product history
   */
  router.post('/customer-history', async (req, res) => {
    try {
      const history = await pricingService.updateCustomerProductHistory(
        req.body.customerId,
        req.body.productId,
        {
          pricePaidCents: req.body.pricePaidCents,
          quantity: req.body.quantity,
          type: req.body.type
        }
      );

      res.json(history);
    } catch (error) {
      console.error('Error updating customer history:', error);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
};
