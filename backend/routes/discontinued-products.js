const express = require('express');
const DiscontinuedProductService = require('../services/DiscontinuedProductService');

function init({ pool }) {
  DiscontinuedProductService.init({ pool });

  const router = express.Router();

  // POST /api/products/:id/discontinue
  router.post('/:id/discontinue', async (req, res) => {
    try {
      const { reason, replacement_product_id, hide_when_zero_stock, effective_date } = req.body;
      const product = await DiscontinuedProductService.discontinueProduct(req.params.id, {
        reason,
        replacement_product_id,
        hide_when_zero_stock,
        effective_date,
      });
      res.json({ product });
    } catch (err) {
      console.error('Discontinue product error:', err);
      const status = err.message === 'Product not found' ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  // POST /api/products/:id/reactivate
  router.post('/:id/reactivate', async (req, res) => {
    try {
      const product = await DiscontinuedProductService.reactivateProduct(req.params.id);
      res.json({ product });
    } catch (err) {
      console.error('Reactivate product error:', err);
      const status = err.message === 'Product not found' ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  // GET /api/products/discontinued
  router.get('/discontinued', async (req, res) => {
    try {
      const result = await DiscontinuedProductService.listDiscontinued({
        with_stock: req.query.with_stock === 'true' ? true : req.query.with_stock === 'false' ? false : undefined,
        without_replacement: req.query.without_replacement === 'true',
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 50,
      });
      res.json(result);
    } catch (err) {
      console.error('List discontinued error:', err);
      res.status(500).json({ error: 'Failed to load discontinued products' });
    }
  });

  // POST /api/products/bulk-discontinue
  router.post('/bulk-discontinue', async (req, res) => {
    try {
      const { product_ids, reason, effective_date } = req.body;
      if (!Array.isArray(product_ids) || product_ids.length === 0) {
        return res.status(400).json({ error: 'product_ids array required' });
      }
      const results = await DiscontinuedProductService.bulkDiscontinue(product_ids, {
        reason,
        effective_date,
      });
      res.json(results);
    } catch (err) {
      console.error('Bulk discontinue error:', err);
      res.status(500).json({ error: 'Failed to bulk discontinue' });
    }
  });

  return router;
}

module.exports = { init };
