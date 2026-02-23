/**
 * Purchase Order Routes
 * API endpoints for PO lifecycle, goods receiving, and vendor management
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let poService = null;

// ============================================================================
// DASHBOARD STATS
// ============================================================================

router.get('/stats', authenticate, requirePermission('purchase_orders.view'), asyncHandler(async (req, res) => {
  const stats = await poService.getDashboardStats();
  res.success(stats);
}));

// ============================================================================
// REORDER SUGGESTIONS
// ============================================================================

router.get('/suggestions', authenticate, requirePermission('purchase_orders.create'), asyncHandler(async (req, res) => {
  const suggestions = await poService.suggestReorders();
  res.success(suggestions);
}));

// ============================================================================
// RECEIVING QUEUE
// ============================================================================

router.get('/receiving-queue', authenticate, requirePermission('purchase_orders.receive'), asyncHandler(async (req, res) => {
  const queue = await poService.getReceivingQueue();
  res.success(queue);
}));

// ============================================================================
// LIST POs
// ============================================================================

router.get('/', authenticate, requirePermission('purchase_orders.view'), asyncHandler(async (req, res) => {
  const { status, vendor_id, date_from, date_to, limit, offset } = req.query;
  const result = await poService.listPOs({
    status,
    vendorId: vendor_id ? parseInt(vendor_id) : undefined,
    dateFrom: date_from,
    dateTo: date_to,
    limit, offset,
  });
  res.success(result);
}));

// ============================================================================
// GET PO DETAIL
// ============================================================================

router.get('/:id', authenticate, requirePermission('purchase_orders.view'), asyncHandler(async (req, res) => {
  const po = await poService.getPO(parseInt(req.params.id));
  res.success(po);
}));

// ============================================================================
// CREATE PO
// ============================================================================

router.post('/', authenticate, requirePermission('purchase_orders.create'), asyncHandler(async (req, res) => {
  const { vendorId, locationId, items, orderDate, expectedDate, notes, internalNotes, taxCents, shippingCents } = req.body;
  if (!vendorId || !items || !items.length) throw ApiError.badRequest('vendorId and items are required');

  const po = await poService.createPO(parseInt(vendorId), locationId ? parseInt(locationId) : null, items, req.user.id, {
    orderDate, expectedDate, notes, internalNotes, taxCents, shippingCents,
  });
  res.created(po);
}));

// ============================================================================
// UPDATE PO
// ============================================================================

router.put('/:id', authenticate, requirePermission('purchase_orders.edit'), asyncHandler(async (req, res) => {
  const po = await poService.updatePO(parseInt(req.params.id), req.body, req.user.id);
  res.success(po);
}));

// ============================================================================
// ADD / REMOVE ITEMS
// ============================================================================

router.post('/:id/items', authenticate, requirePermission('purchase_orders.edit'), asyncHandler(async (req, res) => {
  const { productId, quantityOrdered, unitCostCents, notes, isSpecialOrder, specialOrderReference } = req.body;
  if (!productId || !quantityOrdered || !unitCostCents) throw ApiError.badRequest('productId, quantityOrdered, and unitCostCents are required');
  const po = await poService.addItem(parseInt(req.params.id), parseInt(productId), parseInt(quantityOrdered), parseInt(unitCostCents), {
    notes, isSpecialOrder, specialOrderReference,
  });
  res.success(po);
}));

router.delete('/:id/items/:itemId', authenticate, requirePermission('purchase_orders.edit'), asyncHandler(async (req, res) => {
  const po = await poService.removeItem(parseInt(req.params.id), parseInt(req.params.itemId));
  res.success(po);
}));

// ============================================================================
// STATUS TRANSITIONS
// ============================================================================

router.post('/:id/submit', authenticate, requirePermission('purchase_orders.edit'), asyncHandler(async (req, res) => {
  const po = await poService.submitPO(parseInt(req.params.id), req.user.id);
  res.success(po);
}));

router.post('/:id/confirm', authenticate, requirePermission('purchase_orders.approve'), asyncHandler(async (req, res) => {
  const po = await poService.confirmPO(parseInt(req.params.id), req.user.id);
  res.success(po);
}));

router.post('/:id/cancel', authenticate, requirePermission('purchase_orders.edit'), asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const po = await poService.cancelPO(parseInt(req.params.id), req.user.id, reason);
  res.success(po);
}));

// ============================================================================
// RECEIVE GOODS
// ============================================================================

router.post('/:id/receive', authenticate, requirePermission('purchase_orders.receive'), asyncHandler(async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) throw ApiError.badRequest('items array is required');
  const result = await poService.receiveGoods(parseInt(req.params.id), items, req.user.id);
  res.success(result);
}));

// ============================================================================
// RECEIPTS
// ============================================================================

router.get('/:id/receipts', authenticate, requirePermission('purchase_orders.view'), asyncHandler(async (req, res) => {
  const po = await poService.getPO(parseInt(req.params.id));
  res.success(po.receipts);
}));

// ============================================================================
// PO HISTORY
// ============================================================================

router.get('/:id/history', authenticate, requirePermission('purchase_orders.view'), asyncHandler(async (req, res) => {
  const history = await poService.getPOHistory(parseInt(req.params.id));
  res.success(history);
}));

// ============================================================================
// GENERATE PO FROM SUGGESTIONS
// ============================================================================

router.post('/generate-from-suggestions', authenticate, requirePermission('purchase_orders.create'), asyncHandler(async (req, res) => {
  const { vendorId, products } = req.body;
  if (!vendorId || !Array.isArray(products) || !products.length) {
    throw ApiError.badRequest('vendorId and products array are required');
  }
  const po = await poService.generatePOFromSuggestions(parseInt(vendorId), products, req.user.id);
  res.created(po);
}));

// ============================================================================
// VENDOR ROUTES
// ============================================================================

router.get('/vendors/list', authenticate, requirePermission('vendors.view'), asyncHandler(async (req, res) => {
  const vendors = await poService.listVendors({ search: req.query.search, isActive: req.query.is_active !== 'false' });
  res.success(vendors);
}));

router.get('/vendors/:id', authenticate, requirePermission('vendors.view'), asyncHandler(async (req, res) => {
  const vendor = await poService.getVendor(parseInt(req.params.id));
  res.success(vendor);
}));

router.post('/vendors', authenticate, requirePermission('vendors.create'), asyncHandler(async (req, res) => {
  const vendor = await poService.createVendor(req.body);
  res.created(vendor);
}));

router.put('/vendors/:id', authenticate, requirePermission('vendors.edit'), asyncHandler(async (req, res) => {
  const vendor = await poService.updateVendor(parseInt(req.params.id), req.body);
  res.success(vendor);
}));

// ============================================================================
// LANDED COST ENDPOINTS (Feature 1C)
// ============================================================================

// Add landed costs to a receipt
router.post('/:id/receipts/:receiptId/landed-costs', authenticate, requirePermission('purchase_orders.receive'), asyncHandler(async (req, res) => {
  const { costs } = req.body;
  if (!costs || !Array.isArray(costs) || costs.length === 0) {
    throw new ApiError(400, 'costs array is required');
  }
  const entries = await poService.addLandedCosts(parseInt(req.params.receiptId), costs, req.user.userId);
  res.created(entries);
}));

// Allocate landed costs to receipt items
router.post('/:id/receipts/:receiptId/allocate-landed', authenticate, requirePermission('purchase_orders.receive'), asyncHandler(async (req, res) => {
  const result = await poService.allocateLandedCosts(parseInt(req.params.receiptId), req.user.userId);
  res.success(result);
}));

// Get landed cost summary for a receipt
router.get('/:id/receipts/:receiptId/landed-summary', authenticate, requirePermission('purchase_orders.view'), asyncHandler(async (req, res) => {
  const summary = await poService.getLandedCostSummary(parseInt(req.params.receiptId));
  res.success(summary);
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  poService = deps.poService;
  return router;
};

module.exports = { init };
