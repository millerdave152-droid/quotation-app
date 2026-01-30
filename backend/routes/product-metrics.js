/**
 * Product Metrics API Routes
 * Handles product performance metrics, demand reports, and intelligence
 * Uses consistent error handling with asyncHandler and ApiError
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

module.exports = (pool, cache, productMetricsService) => {

  /**
   * GET /api/product-metrics/:productId
   * Get metrics for a specific product
   */
  router.get('/:productId', authenticate, asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    const metrics = await productMetricsService.getMetrics(productId);
    res.json(metrics);
  }));

  /**
   * GET /api/product-metrics/:productId/intelligence
   * Get full product intelligence package
   */
  router.get('/:productId/intelligence', authenticate, asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    const intelligence = await productMetricsService.getProductIntelligence(productId);
    res.json(intelligence);
  }));

  /**
   * POST /api/product-metrics/:productId/refresh
   * Refresh metrics for a specific product
   */
  router.post('/:productId/refresh', authenticate, asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    const metrics = await productMetricsService.calculateMetrics(productId);
    res.json(metrics);
  }));

  /**
   * POST /api/product-metrics/refresh-all
   * Refresh metrics for all products (batch job)
   */
  router.post('/refresh-all', authenticate, asyncHandler(async (req, res) => {
    const { batchSize = 100 } = req.body;

    const results = await productMetricsService.refreshAllMetrics({ batchSize });

    res.json({
      message: 'Metrics refresh completed',
      results
    });
  }));

  /**
   * GET /api/product-metrics/report/demand
   * Get demand classification report
   */
  router.get('/report/demand', authenticate, asyncHandler(async (req, res) => {
    const report = await productMetricsService.getDemandReport({
      demandTag: req.query.demandTag,
      manufacturer: req.query.manufacturer,
      category: req.query.category,
      limit: parseInt(req.query.limit) || 100
    });

    res.json(report);
  }));

  /**
   * GET /api/product-metrics/report/stockout-risk
   * Get products at risk of stockout
   */
  router.get('/report/stockout-risk', authenticate, asyncHandler(async (req, res) => {
    const products = await productMetricsService.getStockoutRiskProducts();
    res.json(products);
  }));

  /**
   * GET /api/product-metrics/report/top-performers
   * Get top performing products
   */
  router.get('/report/top-performers', authenticate, asyncHandler(async (req, res) => {
    const products = await productMetricsService.getTopPerformers({
      period: req.query.period || '30d',
      limit: parseInt(req.query.limit) || 20,
      metric: req.query.metric || 'qty_sold'
    });

    res.json(products);
  }));

  return router;
};
