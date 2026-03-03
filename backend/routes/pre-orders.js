const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

let preOrderService = null;

// Available pre-order products
router.get('/available-products', authenticate, asyncHandler(async (req, res) => {
  const products = await preOrderService.getAvailableProducts();
  res.success(products);
}));

// List pre-orders
router.get('/', authenticate, requirePermission('pre_orders.view'), asyncHandler(async (req, res) => {
  const { status, productId, customerId, limit, offset } = req.query;
  const result = await preOrderService.list({
    status,
    productId: productId ? parseInt(productId) : undefined,
    customerId: customerId ? parseInt(customerId) : undefined,
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  });
  res.success(result);
}));

// Get single pre-order
router.get('/:id', authenticate, requirePermission('pre_orders.view'), asyncHandler(async (req, res) => {
  const po = await preOrderService.get(parseInt(req.params.id));
  res.success(po);
}));

// Create pre-order
router.post('/', authenticate, requirePermission('pre_orders.create'), asyncHandler(async (req, res) => {
  const po = await preOrderService.create(req.body, req.user.userId);
  res.created(po);
}));

// Update status
router.post('/:id/status', authenticate, requirePermission('pre_orders.edit'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  const po = await preOrderService.updateStatus(parseInt(req.params.id), status, req.user.userId);
  res.success(po);
}));

const init = (deps) => {
  preOrderService = deps.preOrderService;
  return router;
};

module.exports = { init };
