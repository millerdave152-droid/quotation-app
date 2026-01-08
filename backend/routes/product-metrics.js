/**
 * Product Metrics API Routes
 */

const express = require('express');
const router = express.Router();

module.exports = (pool, cache, productMetricsService) => {

  /**
   * GET /api/product-metrics/:productId
   * Get metrics for a specific product
   */
  router.get('/:productId', async (req, res) => {
    try {
      const metrics = await productMetricsService.getMetrics(
        parseInt(req.params.productId)
      );

      res.json(metrics);
    } catch (error) {
      console.error('Error fetching product metrics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/product-metrics/:productId/intelligence
   * Get full product intelligence package
   */
  router.get('/:productId/intelligence', async (req, res) => {
    try {
      const intelligence = await productMetricsService.getProductIntelligence(
        parseInt(req.params.productId)
      );

      res.json(intelligence);
    } catch (error) {
      console.error('Error fetching product intelligence:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/product-metrics/:productId/refresh
   * Refresh metrics for a specific product
   */
  router.post('/:productId/refresh', async (req, res) => {
    try {
      const metrics = await productMetricsService.calculateMetrics(
        parseInt(req.params.productId)
      );

      res.json(metrics);
    } catch (error) {
      console.error('Error refreshing product metrics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/product-metrics/refresh-all
   * Refresh metrics for all products (batch job)
   */
  router.post('/refresh-all', async (req, res) => {
    try {
      const { batchSize = 100 } = req.body;

      // Start refresh in background
      const results = await productMetricsService.refreshAllMetrics({
        batchSize
      });

      res.json({
        message: 'Metrics refresh completed',
        results
      });
    } catch (error) {
      console.error('Error refreshing all metrics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/product-metrics/report/demand
   * Get demand classification report
   */
  router.get('/report/demand', async (req, res) => {
    try {
      const report = await productMetricsService.getDemandReport({
        demandTag: req.query.demandTag,
        manufacturer: req.query.manufacturer,
        category: req.query.category,
        limit: parseInt(req.query.limit) || 100
      });

      res.json(report);
    } catch (error) {
      console.error('Error fetching demand report:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/product-metrics/report/stockout-risk
   * Get products at risk of stockout
   */
  router.get('/report/stockout-risk', async (req, res) => {
    try {
      const products = await productMetricsService.getStockoutRiskProducts();

      res.json(products);
    } catch (error) {
      console.error('Error fetching stockout risk report:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/product-metrics/report/top-performers
   * Get top performing products
   */
  router.get('/report/top-performers', async (req, res) => {
    try {
      const products = await productMetricsService.getTopPerformers({
        period: req.query.period || '30d',
        limit: parseInt(req.query.limit) || 20,
        metric: req.query.metric || 'qty_sold'
      });

      res.json(products);
    } catch (error) {
      console.error('Error fetching top performers:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
