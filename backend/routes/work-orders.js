const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

let woService = null;

// Dashboard stats
router.get('/stats', authenticate, requirePermission('work_orders.view'), asyncHandler(async (req, res) => {
  const stats = await woService.getDashboardStats();
  res.success(stats);
}));

// Schedule
router.get('/schedule', authenticate, requirePermission('work_orders.view'), asyncHandler(async (req, res) => {
  const { startDate, endDate, locationId } = req.query;
  const schedule = await woService.getSchedule(
    startDate || new Date().toISOString().slice(0, 10),
    endDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    locationId ? parseInt(locationId) : null
  );
  res.success(schedule);
}));

// List work orders
router.get('/', authenticate, requirePermission('work_orders.view'), asyncHandler(async (req, res) => {
  const { status, workType, assignedTo, locationId, customerId, scheduledDate, limit, offset } = req.query;
  const result = await woService.listWorkOrders({
    status, workType,
    assignedTo: assignedTo ? parseInt(assignedTo) : undefined,
    locationId: locationId ? parseInt(locationId) : undefined,
    customerId: customerId ? parseInt(customerId) : undefined,
    scheduledDate,
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  });
  res.success(result);
}));

// Get single work order
router.get('/:id', authenticate, requirePermission('work_orders.view'), asyncHandler(async (req, res) => {
  const wo = await woService.getWorkOrder(parseInt(req.params.id));
  res.success(wo);
}));

// Create work order
router.post('/', authenticate, requirePermission('work_orders.create'), asyncHandler(async (req, res) => {
  const wo = await woService.createWorkOrder(req.body, req.user.userId);
  res.created(wo);
}));

// Update work order
router.put('/:id', authenticate, requirePermission('work_orders.edit'), asyncHandler(async (req, res) => {
  const wo = await woService.updateWorkOrder(parseInt(req.params.id), req.body, req.user.userId);
  res.success(wo);
}));

// Transition status
router.post('/:id/status', authenticate, requirePermission('work_orders.edit'), asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  const wo = await woService.transitionStatus(parseInt(req.params.id), status, req.user.userId, notes);
  res.success(wo);
}));

// Assign work order
router.post('/:id/assign', authenticate, requirePermission('work_orders.assign'), asyncHandler(async (req, res) => {
  const { assignedTo } = req.body;
  const wo = await woService.assignWorkOrder(parseInt(req.params.id), assignedTo, req.user.userId);
  res.success(wo);
}));

// Add item
router.post('/:id/items', authenticate, requirePermission('work_orders.edit'), asyncHandler(async (req, res) => {
  const item = await woService.addItem(parseInt(req.params.id), req.body);
  res.created(item);
}));

// Remove item
router.delete('/:id/items/:itemId', authenticate, requirePermission('work_orders.edit'), asyncHandler(async (req, res) => {
  await woService.removeItem(parseInt(req.params.id), parseInt(req.params.itemId));
  res.success({ message: 'Item removed' });
}));

// Add photo
router.post('/:id/photos', authenticate, requirePermission('work_orders.edit'), asyncHandler(async (req, res) => {
  const { photoData, photoType, caption, gps } = req.body;
  const photo = await woService.addPhoto(parseInt(req.params.id), photoData, photoType, caption, gps, req.user.userId);
  res.created(photo);
}));

// Add signature
router.post('/:id/signatures', authenticate, requirePermission('work_orders.complete'), asyncHandler(async (req, res) => {
  const { signatureData, signerName, relationship, gps } = req.body;
  const sig = await woService.addSignature(parseInt(req.params.id), signatureData, signerName, relationship, gps);
  res.created(sig);
}));

const init = (deps) => {
  woService = deps.woService;
  return router;
};

module.exports = { init };
