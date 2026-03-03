const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

let soService = null;

// Dashboard stats
router.get('/stats', authenticate, requirePermission('special_orders.view'), asyncHandler(async (req, res) => {
  const stats = await soService.getDashboardStats();
  res.success(stats);
}));

// List special orders
router.get('/', authenticate, requirePermission('special_orders.view'), asyncHandler(async (req, res) => {
  const { status, customerId, limit, offset } = req.query;
  const result = await soService.list({
    status,
    customerId: customerId ? parseInt(customerId) : undefined,
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  });
  res.success(result);
}));

// Get single special order
router.get('/:id', authenticate, requirePermission('special_orders.view'), asyncHandler(async (req, res) => {
  const so = await soService.get(parseInt(req.params.id));
  res.success(so);
}));

// Create special order
router.post('/', authenticate, requirePermission('special_orders.create'), asyncHandler(async (req, res) => {
  const so = await soService.create(req.body, req.user.userId);
  res.created(so);
}));

// Update special order
router.put('/:id', authenticate, requirePermission('special_orders.edit'), asyncHandler(async (req, res) => {
  const so = await soService.update(parseInt(req.params.id), req.body);
  res.success(so);
}));

// Update status
router.post('/:id/status', authenticate, requirePermission('special_orders.edit'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  const so = await soService.updateStatus(parseInt(req.params.id), status, req.user.userId);
  res.success(so);
}));

const init = (deps) => {
  soService = deps.soService;
  return router;
};

module.exports = { init };
