/**
 * Pricing API Routes
 * Handles pricing tiers, margins, violations, and customer pricing
 * Uses consistent error handling with asyncHandler and ApiError
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

module.exports = (pool, cache, pricingService) => {

  /**
   * GET /api/pricing/tiers
   * Get all customer pricing tiers
   */
  router.get('/tiers', asyncHandler(async (req, res) => {
    const result = await pool.query(`
      SELECT * FROM customer_price_tiers ORDER BY discount_percent ASC
    `);
    res.json({ success: true, data: result.rows });
  }));

  /**
   * GET /api/pricing/:productId
   * Get all price points for a product
   */
  router.get('/:productId', asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    const pricePoints = await pricingService.getPricePoints(productId);
    res.json(pricePoints);
  }));

  /**
   * GET /api/pricing/:productId/margins
   * Calculate margins at different price points
   */
  router.get('/:productId/margins', asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    const sellPrice = req.query.sellPrice ? parseInt(req.query.sellPrice) : null;
    const margins = await pricingService.calculateMargins(productId, sellPrice);

    res.json(margins);
  }));

  /**
   * POST /api/pricing/:productId/simulate
   * Simulate margin at a proposed price
   */
  router.post('/:productId/simulate', asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    if (!req.body.proposedPriceCents) {
      throw ApiError.badRequest('Proposed price is required');
    }

    const result = await pricingService.simulateMargin(
      productId,
      req.body.proposedPriceCents
    );

    res.json(result);
  }));

  /**
   * POST /api/pricing/:productId/check-violations
   * Check for price violations
   */
  router.post('/:productId/check-violations', asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    if (!req.body.sellPriceCents) {
      throw ApiError.badRequest('Sell price is required');
    }

    const result = await pricingService.checkPriceViolations(
      productId,
      req.body.sellPriceCents
    );

    res.json(result);
  }));

  /**
   * GET /api/pricing/customer/:customerId/:productId
   * Get customer-specific pricing recommendation
   */
  router.get('/customer/:customerId/:productId', asyncHandler(async (req, res) => {
    const customerId = parseInt(req.params.customerId);
    const productId = parseInt(req.params.productId);

    if (isNaN(customerId)) {
      throw ApiError.badRequest('Invalid customer ID');
    }

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    const recommendation = await pricingService.getRecommendedPrice(
      productId,
      customerId
    );

    res.json(recommendation);
  }));

  /**
   * GET /api/pricing/customer/:customerId/history
   * Get customer product price history
   */
  router.get('/customer/:customerId/history', asyncHandler(async (req, res) => {
    const customerId = parseInt(req.params.customerId);

    if (isNaN(customerId)) {
      throw ApiError.badRequest('Invalid customer ID');
    }

    const productId = req.query.productId ? parseInt(req.query.productId) : null;
    const history = await pricingService.getCustomerPriceHistory(
      customerId,
      productId
    );

    res.json(history);
  }));

  /**
   * GET /api/pricing/violations/list
   * List price violations
   */
  router.get('/violations/list', asyncHandler(async (req, res) => {
    const violations = await pricingService.getPendingViolations({
      status: req.query.status || 'pending',
      limit: parseInt(req.query.limit) || 50
    });

    res.json(violations);
  }));

  /**
   * POST /api/pricing/violations
   * Log a new price violation
   */
  router.post('/violations', asyncHandler(async (req, res) => {
    const { productId, violationType, quotedPriceCents, thresholdPriceCents } = req.body;

    if (!productId) {
      throw ApiError.badRequest('Product ID is required');
    }

    if (!violationType) {
      throw ApiError.badRequest('Violation type is required');
    }

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
  }));

  /**
   * POST /api/pricing/violations/:id/resolve
   * Approve or reject a price violation
   */
  router.post('/violations/:id/resolve', asyncHandler(async (req, res) => {
    const violationId = parseInt(req.params.id);

    if (isNaN(violationId)) {
      throw ApiError.badRequest('Invalid violation ID');
    }

    if (!req.body.status || !['approved', 'rejected'].includes(req.body.status)) {
      throw ApiError.badRequest('Status must be "approved" or "rejected"');
    }

    const violation = await pricingService.resolveViolation(
      violationId,
      req.body.status,
      req.body.approvedBy,
      req.body.notes
    );

    res.json(violation);
  }));

  /**
   * POST /api/pricing/customer-history
   * Update customer product history
   */
  router.post('/customer-history', asyncHandler(async (req, res) => {
    const { customerId, productId, pricePaidCents } = req.body;

    if (!customerId) {
      throw ApiError.badRequest('Customer ID is required');
    }

    if (!productId) {
      throw ApiError.badRequest('Product ID is required');
    }

    const history = await pricingService.updateCustomerProductHistory(
      customerId,
      productId,
      {
        pricePaidCents: req.body.pricePaidCents,
        quantity: req.body.quantity,
        type: req.body.type
      }
    );

    res.json(history);
  }));

  return router;
};
