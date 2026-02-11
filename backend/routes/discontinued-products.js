const express = require('express');
const DiscontinuedProductService = require('../services/DiscontinuedProductService');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

function init({ pool }) {
  DiscontinuedProductService.init({ pool });

  const router = express.Router();

  // POST /api/products/:id/discontinue
  router.post('/:id/discontinue', asyncHandler(async (req, res) => {
    const { reason, replacement_product_id, hide_when_zero_stock, effective_date } = req.body;
    const product = await DiscontinuedProductService.discontinueProduct(req.params.id, {
      reason,
      replacement_product_id,
      hide_when_zero_stock,
      effective_date,
    });
    res.json({ product });
  }));

  // POST /api/products/:id/reactivate
  router.post('/:id/reactivate', asyncHandler(async (req, res) => {
    const product = await DiscontinuedProductService.reactivateProduct(req.params.id);
    res.json({ product });
  }));

  // GET /api/products/discontinued
  router.get('/discontinued', asyncHandler(async (req, res) => {
    const result = await DiscontinuedProductService.listDiscontinued({
      with_stock: req.query.with_stock === 'true' ? true : req.query.with_stock === 'false' ? false : undefined,
      without_replacement: req.query.without_replacement === 'true',
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    });
    res.json(result);
  }));

  // POST /api/products/bulk-discontinue
  router.post('/bulk-discontinue', asyncHandler(async (req, res) => {
    const { product_ids, reason, effective_date } = req.body;
    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      throw ApiError.badRequest('product_ids array required');
    }
    const results = await DiscontinuedProductService.bulkDiscontinue(product_ids, {
      reason,
      effective_date,
    });
    res.json(results);
  }));

  return router;
}

module.exports = { init };
