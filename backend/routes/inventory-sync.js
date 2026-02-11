/**
 * TeleTime - Inventory Sync Routes
 *
 * API endpoints for Quote-POS inventory synchronization:
 * - Reservations (soft holds for quotes)
 * - Sales deductions (POS transactions)
 * - Quote-to-order conversion
 * - Void/cancel restoration
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const InventorySyncService = require('../services/InventorySyncService');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

// Apply authentication to all inventory sync routes
router.use(authenticate);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const reservationSchema = Joi.object({
  productId: Joi.number().integer().required(),
  quantity: Joi.number().integer().min(1).required(),
  quoteId: Joi.number().integer().optional(),
  quoteItemId: Joi.number().integer().optional(),
  customerId: Joi.number().integer().optional(),
  expiresHours: Joi.number().integer().min(1).max(720).default(72),
  locationId: Joi.number().integer().optional(),
  notes: Joi.string().max(500).optional(),
});

const bulkReservationSchema = Joi.object({
  quoteId: Joi.number().integer().optional(),
  customerId: Joi.number().integer().optional(),
  expiresHours: Joi.number().integer().min(1).max(720).default(72),
  locationId: Joi.number().integer().optional(),
  items: Joi.array().items(
    Joi.object({
      productId: Joi.number().integer().required(),
      quantity: Joi.number().integer().min(1).required(),
      id: Joi.number().integer().optional(),
      notes: Joi.string().max(500).optional(),
    })
  ).min(1).required(),
});

const deductSchema = Joi.object({
  productId: Joi.number().integer().required(),
  quantity: Joi.number().integer().min(1).required(),
  orderId: Joi.number().integer().optional(),
  transactionId: Joi.number().integer().optional(),
  referenceNumber: Joi.string().max(50).optional(),
  locationId: Joi.number().integer().optional(),
  allowNegative: Joi.boolean().default(false),
});

const bulkDeductSchema = Joi.object({
  orderId: Joi.number().integer().optional(),
  transactionId: Joi.number().integer().optional(),
  referenceNumber: Joi.string().max(50).optional(),
  locationId: Joi.number().integer().optional(),
  allowNegative: Joi.boolean().default(false),
  items: Joi.array().items(
    Joi.object({
      productId: Joi.number().integer().required(),
      quantity: Joi.number().integer().min(1).required(),
    })
  ).min(1).required(),
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

const getService = (req) => {
  return new InventorySyncService(req.app.get('pool'), req.app.get('cache'));
};

// ============================================================================
// AVAILABILITY CHECK
// ============================================================================

/**
 * GET /api/inventory-sync/check/:productId/:quantity
 * Check availability for a product
 */
router.get('/check/:productId/:quantity', asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId);
  const quantity = parseInt(req.params.quantity);
  const excludeReservationId = req.query.excludeReservation
    ? parseInt(req.query.excludeReservation)
    : null;

  const service = getService(req);
  const result = await service.checkAvailability(productId, quantity, excludeReservationId);

  res.json({ success: true, data: result });
}));

/**
 * POST /api/inventory-sync/check-bulk
 * Check availability for multiple products
 */
router.post('/check-bulk', asyncHandler(async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) {
    throw ApiError.badRequest('items array is required');
  }

  const service = getService(req);
  const result = await service.checkBulkAvailability(items);

  res.json({ success: true, data: result });
}));

// ============================================================================
// RESERVATIONS (Quote Soft Holds)
// ============================================================================

/**
 * POST /api/inventory-sync/reserve
 * Create a single reservation
 */
router.post('/reserve', asyncHandler(async (req, res) => {
  const { error, value } = reservationSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const service = getService(req);
  const result = await service.createReservation({ ...value, userId: req.user?.id });

  if (!result.success) {
    throw ApiError.badRequest(result.message);
  }

  res.json({ success: true, data: result });
}));

/**
 * POST /api/inventory-sync/reserve-quote
 * Create reservations for all items in a quote
 */
router.post('/reserve-quote', asyncHandler(async (req, res) => {
  const { error, value } = bulkReservationSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const service = getService(req);
  const result = await service.reserveQuoteItems(value.quoteId, value.items, {
    customerId: value.customerId,
    expiresHours: value.expiresHours,
    userId: req.user?.id,
    locationId: value.locationId,
  });

  if (!result.success) {
    throw ApiError.badRequest(result.message);
  }

  res.json({ success: true, data: result });
}));

/**
 * GET /api/inventory-sync/reservations/quote/:quoteId
 * Get all reservations for a quote
 */
router.get('/reservations/quote/:quoteId', asyncHandler(async (req, res) => {
  const quoteId = parseInt(req.params.quoteId);
  const service = getService(req);
  const reservations = await service.getQuoteReservations(quoteId);

  res.json({ success: true, data: reservations });
}));

/**
 * POST /api/inventory-sync/reservations/:id/release
 * Release a reservation
 */
router.post('/reservations/:id/release', asyncHandler(async (req, res) => {
  const reservationId = parseInt(req.params.id);
  const { reason } = req.body;

  const service = getService(req);
  const result = await service.releaseReservation(
    reservationId,
    reason || 'Manual release',
    req.user?.id
  );

  if (!result.success) {
    throw ApiError.badRequest(result.message);
  }

  res.json({ success: true, data: result });
}));

/**
 * POST /api/inventory-sync/release-quote/:quoteId
 * Release all reservations for a quote
 */
router.post('/release-quote/:quoteId', asyncHandler(async (req, res) => {
  const quoteId = parseInt(req.params.quoteId);
  const { reason } = req.body;

  const service = getService(req);
  const result = await service.releaseQuoteReservations(
    quoteId,
    reason || 'Quote cancelled',
    req.user?.id
  );

  res.json({ success: true, data: result });
}));

/**
 * POST /api/inventory-sync/reservations/:id/extend
 * Extend reservation expiry
 */
router.post('/reservations/:id/extend', asyncHandler(async (req, res) => {
  const reservationId = parseInt(req.params.id);
  const { hours } = req.body;

  if (!hours || hours < 1) {
    throw ApiError.badRequest('Valid hours is required');
  }

  const service = getService(req);
  const result = await service.extendReservation(reservationId, hours, req.user?.id);

  if (!result.success) {
    throw ApiError.badRequest(result.message);
  }

  res.json({ success: true, data: result });
}));

// ============================================================================
// CONVERSION (Quote to Order)
// ============================================================================

/**
 * POST /api/inventory-sync/convert-quote/:quoteId
 * Convert all quote reservations to sales
 */
router.post('/convert-quote/:quoteId', asyncHandler(async (req, res) => {
  const quoteId = parseInt(req.params.quoteId);
  const { orderId } = req.body;

  if (!orderId) {
    throw ApiError.badRequest('orderId is required');
  }

  const service = getService(req);
  const result = await service.convertQuoteToOrder(quoteId, orderId, req.user?.id);

  res.json({ success: true, data: result });
}));

/**
 * POST /api/inventory-sync/reservations/:id/convert
 * Convert single reservation to sale
 */
router.post('/reservations/:id/convert', asyncHandler(async (req, res) => {
  const reservationId = parseInt(req.params.id);
  const { orderId, quantity } = req.body;

  const service = getService(req);
  const result = await service.convertReservationToSale(
    reservationId,
    orderId,
    quantity,
    req.user?.id
  );

  if (!result.success) {
    throw ApiError.badRequest(result.message);
  }

  res.json({ success: true, data: result });
}));

// ============================================================================
// SALES DEDUCTIONS (POS)
// ============================================================================

/**
 * POST /api/inventory-sync/deduct
 * Deduct inventory for a single sale
 */
router.post('/deduct', asyncHandler(async (req, res) => {
  const { error, value } = deductSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const service = getService(req);
  const result = await service.deductForSale({ ...value, userId: req.user?.id });

  if (!result.success) {
    throw ApiError.badRequest(result.message);
  }

  res.json({ success: true, data: result });
}));

/**
 * POST /api/inventory-sync/deduct-transaction
 * Deduct inventory for a POS transaction (multiple items)
 */
router.post('/deduct-transaction', asyncHandler(async (req, res) => {
  const { error, value } = bulkDeductSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const service = getService(req);
  const result = await service.deductForTransaction(value.items, {
    orderId: value.orderId,
    transactionId: value.transactionId,
    referenceNumber: value.referenceNumber,
    userId: req.user?.id,
    locationId: value.locationId,
    allowNegative: value.allowNegative,
  });

  if (!result.success) {
    throw ApiError.badRequest(result.message);
  }

  res.json({ success: true, data: result });
}));

// ============================================================================
// VOID/RESTORE
// ============================================================================

/**
 * POST /api/inventory-sync/restore
 * Restore inventory for a single item (void/return)
 */
router.post('/restore', asyncHandler(async (req, res) => {
  const { productId, quantity, reason, referenceType, referenceId, referenceNumber } = req.body;

  if (!productId || !quantity || quantity < 1) {
    throw ApiError.badRequest('productId and quantity are required');
  }

  const service = getService(req);
  const result = await service.restoreForVoid({
    productId,
    quantity,
    referenceType,
    referenceId,
    referenceNumber,
    userId: req.user?.id,
  });

  if (!result.success) {
    throw ApiError.badRequest(result.message);
  }

  res.json({ success: true, data: result });
}));

/**
 * POST /api/inventory-sync/void-transaction
 * Restore inventory for a voided transaction (multiple items)
 */
router.post('/void-transaction', asyncHandler(async (req, res) => {
  const { items, referenceType, referenceId, referenceNumber } = req.body;

  if (!items || !Array.isArray(items)) {
    throw ApiError.badRequest('items array is required');
  }

  const service = getService(req);
  const result = await service.restoreForVoidedTransaction(items, {
    referenceType,
    referenceId,
    referenceNumber,
    userId: req.user?.id,
  });

  res.json({ success: true, data: result });
}));

/**
 * POST /api/inventory-sync/return
 * Process customer return
 */
router.post('/return', asyncHandler(async (req, res) => {
  const { productId, quantity, orderId, returnReason } = req.body;

  if (!productId || !quantity || quantity < 1) {
    throw ApiError.badRequest('productId and quantity are required');
  }

  const service = getService(req);
  const result = await service.processReturn({
    productId,
    quantity,
    orderId,
    returnReason: returnReason || 'Customer return',
    userId: req.user?.id,
  });

  if (!result.success) {
    throw ApiError.badRequest(result.message);
  }

  res.json({ success: true, data: result });
}));

// ============================================================================
// AUDIT LOG
// ============================================================================

/**
 * GET /api/inventory-sync/history/:productId
 * Get inventory transaction history for a product
 */
router.get('/history/:productId', asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId);
  const { limit, offset, startDate, endDate, types } = req.query;

  const service = getService(req);
  const history = await service.getProductHistory(productId, {
    limit: limit ? parseInt(limit) : 50,
    offset: offset ? parseInt(offset) : 0,
    startDate,
    endDate,
    transactionTypes: types ? types.split(',') : null,
  });

  res.json({ success: true, data: history });
}));

/**
 * GET /api/inventory-sync/movements
 * Get recent inventory movements
 */
router.get('/movements', asyncHandler(async (req, res) => {
  const { limit, types, locationId } = req.query;

  const service = getService(req);
  const movements = await service.getRecentMovements({
    limit: limit ? parseInt(limit) : 100,
    transactionTypes: types ? types.split(',') : null,
    locationId: locationId ? parseInt(locationId) : null,
  });

  res.json({ success: true, data: movements });
}));

/**
 * POST /api/inventory-sync/expire-reservations
 * Manually trigger reservation expiration check
 */
router.post('/expire-reservations', asyncHandler(async (req, res) => {
  const service = getService(req);
  const result = await service.expireOldReservations();

  res.json({
    success: true,
    data: result,
    message: `Expired ${result.expired} reservation(s)`,
  });
}));

module.exports = router;
