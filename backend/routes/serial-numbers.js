/**
 * Serial Number Routes
 * API endpoints for serial number registry and lifecycle management
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let serialService = null;

// ============================================================================
// SEARCH / LIST
// ============================================================================

router.get('/', authenticate, requirePermission('serial_numbers.view'), asyncHandler(async (req, res) => {
  const { q, status, product_id, location_id, customer_id, limit, offset } = req.query;
  const result = await serialService.search(q, {
    status,
    productId: product_id ? parseInt(product_id) : undefined,
    locationId: location_id ? parseInt(location_id) : undefined,
    customerId: customer_id ? parseInt(customer_id) : undefined,
    limit,
    offset,
  });
  res.success(result);
}));

// ============================================================================
// STATS
// ============================================================================

router.get('/stats', authenticate, requirePermission('serial_numbers.view'), asyncHandler(async (req, res) => {
  const stats = await serialService.getStats();
  res.success(stats);
}));

// ============================================================================
// LOOKUP BY SERIAL NUMBER
// ============================================================================

router.get('/lookup/:serial', authenticate, requirePermission('serial_numbers.view'), asyncHandler(async (req, res) => {
  const serial = await serialService.lookupBySerial(req.params.serial);
  if (!serial) throw ApiError.notFound('Serial number');
  res.success(serial);
}));

// ============================================================================
// LOOKUP BY PRODUCT
// ============================================================================

router.get('/product/:productId', authenticate, requirePermission('serial_numbers.view'), asyncHandler(async (req, res) => {
  const serials = await serialService.lookupByProduct(parseInt(req.params.productId), {
    status: req.query.status,
    locationId: req.query.location_id ? parseInt(req.query.location_id) : undefined,
  });
  res.success(serials);
}));

// ============================================================================
// LOOKUP BY CUSTOMER
// ============================================================================

router.get('/customer/:customerId', authenticate, requirePermission('serial_numbers.view'), asyncHandler(async (req, res) => {
  const serials = await serialService.lookupByCustomer(parseInt(req.params.customerId));
  res.success(serials);
}));

// ============================================================================
// REGISTER SINGLE
// ============================================================================

router.post('/', authenticate, requirePermission('serial_numbers.create'), asyncHandler(async (req, res) => {
  const { productId, serialNumber, locationId, notes, purchaseOrderId } = req.body;
  if (!productId || !serialNumber) throw ApiError.badRequest('productId and serialNumber are required');

  const serial = await serialService.registerSerial(
    parseInt(productId), serialNumber, locationId ? parseInt(locationId) : null, req.user.id,
    { notes, purchaseOrderId: purchaseOrderId ? parseInt(purchaseOrderId) : null }
  );
  res.created(serial);
}));

// ============================================================================
// REGISTER BATCH
// ============================================================================

router.post('/batch', authenticate, requirePermission('serial_numbers.create'), asyncHandler(async (req, res) => {
  const { serials } = req.body;
  if (!Array.isArray(serials) || !serials.length) throw ApiError.badRequest('serials array is required');

  const results = await serialService.registerBatch(serials, req.user.id);
  res.created({ results, registered: results.filter(r => r.success).length, skipped: results.filter(r => r.skipped).length });
}));

// ============================================================================
// CHANGE STATUS
// ============================================================================

router.put('/:id/status', authenticate, requirePermission('serial_numbers.edit'), asyncHandler(async (req, res) => {
  const { status, notes, referenceType, referenceId, eventType, locationId } = req.body;
  if (!status) throw ApiError.badRequest('status is required');

  const result = await serialService.updateStatus(parseInt(req.params.id), status, req.user.id, {
    notes, referenceType, referenceId: referenceId ? parseInt(referenceId) : null,
    eventType, locationId: locationId ? parseInt(locationId) : null,
  });
  res.success(result);
}));

// ============================================================================
// HISTORY
// ============================================================================

router.get('/:id/history', authenticate, requirePermission('serial_numbers.view'), asyncHandler(async (req, res) => {
  const history = await serialService.getSerialHistory(parseInt(req.params.id));
  res.success(history);
}));

// ============================================================================
// AVAILABLE FOR PRODUCT (feeds QuoteBuilder dropdown)
// ============================================================================

router.get('/available/:productId', authenticate, asyncHandler(async (req, res) => {
  const serials = await serialService.getAvailableForProduct(parseInt(req.params.productId));
  res.success(serials);
}));

// ============================================================================
// RESERVE FOR QUOTE
// ============================================================================

router.post('/:serialNumber/reserve', authenticate, asyncHandler(async (req, res) => {
  const { quotationId } = req.body;
  if (!quotationId) throw ApiError.badRequest('quotationId is required');

  const result = await serialService.reserveForQuote(
    req.params.serialNumber,
    parseInt(quotationId),
    req.user.id
  );
  res.success(result);
}));

// ============================================================================
// RELEASE RESERVATION
// ============================================================================

router.post('/:serialNumber/release', authenticate, asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const result = await serialService.releaseReservation(
    req.params.serialNumber,
    req.user.id,
    reason || 'Manual release'
  );
  res.success(result);
}));

// ============================================================================
// VALIDATE FOR SALE
// ============================================================================

router.get('/validate/:serial/:productId', authenticate, asyncHandler(async (req, res) => {
  const result = await serialService.validateSerialForSale(req.params.serial, parseInt(req.params.productId));
  res.success(result);
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  serialService = deps.serialService;
  return router;
};

module.exports = { init };
