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
router.get('/check/:productId/:quantity', async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    const quantity = parseInt(req.params.quantity);
    const excludeReservationId = req.query.excludeReservation
      ? parseInt(req.query.excludeReservation)
      : null;

    const service = getService(req);
    const result = await service.checkAvailability(productId, quantity, excludeReservationId);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({ success: false, error: 'Failed to check availability' });
  }
});

/**
 * POST /api/inventory-sync/check-bulk
 * Check availability for multiple products
 */
router.post('/check-bulk', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'items array is required' });
    }

    const service = getService(req);
    const result = await service.checkBulkAvailability(items);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error checking bulk availability:', error);
    res.status(500).json({ success: false, error: 'Failed to check availability' });
  }
});

// ============================================================================
// RESERVATIONS (Quote Soft Holds)
// ============================================================================

/**
 * POST /api/inventory-sync/reserve
 * Create a single reservation
 */
router.post('/reserve', async (req, res) => {
  try {
    const { error, value } = reservationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const service = getService(req);
    const result = await service.createReservation({ ...value, userId: req.user?.id });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.message });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating reservation:', error);
    res.status(500).json({ success: false, error: 'Failed to create reservation' });
  }
});

/**
 * POST /api/inventory-sync/reserve-quote
 * Create reservations for all items in a quote
 */
router.post('/reserve-quote', async (req, res) => {
  try {
    const { error, value } = bulkReservationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const service = getService(req);
    const result = await service.reserveQuoteItems(value.quoteId, value.items, {
      customerId: value.customerId,
      expiresHours: value.expiresHours,
      userId: req.user?.id,
      locationId: value.locationId,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.errors,
        message: result.message,
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating quote reservations:', error);
    res.status(500).json({ success: false, error: 'Failed to create reservations' });
  }
});

/**
 * GET /api/inventory-sync/reservations/quote/:quoteId
 * Get all reservations for a quote
 */
router.get('/reservations/quote/:quoteId', async (req, res) => {
  try {
    const quoteId = parseInt(req.params.quoteId);
    const service = getService(req);
    const reservations = await service.getQuoteReservations(quoteId);

    res.json({ success: true, data: reservations });
  } catch (error) {
    console.error('Error fetching quote reservations:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reservations' });
  }
});

/**
 * POST /api/inventory-sync/reservations/:id/release
 * Release a reservation
 */
router.post('/reservations/:id/release', async (req, res) => {
  try {
    const reservationId = parseInt(req.params.id);
    const { reason } = req.body;

    const service = getService(req);
    const result = await service.releaseReservation(
      reservationId,
      reason || 'Manual release',
      req.user?.id
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.message });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error releasing reservation:', error);
    res.status(500).json({ success: false, error: 'Failed to release reservation' });
  }
});

/**
 * POST /api/inventory-sync/release-quote/:quoteId
 * Release all reservations for a quote
 */
router.post('/release-quote/:quoteId', async (req, res) => {
  try {
    const quoteId = parseInt(req.params.quoteId);
    const { reason } = req.body;

    const service = getService(req);
    const result = await service.releaseQuoteReservations(
      quoteId,
      reason || 'Quote cancelled',
      req.user?.id
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error releasing quote reservations:', error);
    res.status(500).json({ success: false, error: 'Failed to release reservations' });
  }
});

/**
 * POST /api/inventory-sync/reservations/:id/extend
 * Extend reservation expiry
 */
router.post('/reservations/:id/extend', async (req, res) => {
  try {
    const reservationId = parseInt(req.params.id);
    const { hours } = req.body;

    if (!hours || hours < 1) {
      return res.status(400).json({ success: false, error: 'Valid hours is required' });
    }

    const service = getService(req);
    const result = await service.extendReservation(reservationId, hours, req.user?.id);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.message });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error extending reservation:', error);
    res.status(500).json({ success: false, error: 'Failed to extend reservation' });
  }
});

// ============================================================================
// CONVERSION (Quote to Order)
// ============================================================================

/**
 * POST /api/inventory-sync/convert-quote/:quoteId
 * Convert all quote reservations to sales
 */
router.post('/convert-quote/:quoteId', async (req, res) => {
  try {
    const quoteId = parseInt(req.params.quoteId);
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    const service = getService(req);
    const result = await service.convertQuoteToOrder(quoteId, orderId, req.user?.id);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error converting quote:', error);
    res.status(500).json({ success: false, error: 'Failed to convert quote' });
  }
});

/**
 * POST /api/inventory-sync/reservations/:id/convert
 * Convert single reservation to sale
 */
router.post('/reservations/:id/convert', async (req, res) => {
  try {
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
      return res.status(400).json({ success: false, error: result.message });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error converting reservation:', error);
    res.status(500).json({ success: false, error: 'Failed to convert reservation' });
  }
});

// ============================================================================
// SALES DEDUCTIONS (POS)
// ============================================================================

/**
 * POST /api/inventory-sync/deduct
 * Deduct inventory for a single sale
 */
router.post('/deduct', async (req, res) => {
  try {
    const { error, value } = deductSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const service = getService(req);
    const result = await service.deductForSale({ ...value, userId: req.user?.id });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.message });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error deducting inventory:', error);
    res.status(500).json({ success: false, error: 'Failed to deduct inventory' });
  }
});

/**
 * POST /api/inventory-sync/deduct-transaction
 * Deduct inventory for a POS transaction (multiple items)
 */
router.post('/deduct-transaction', async (req, res) => {
  try {
    const { error, value } = bulkDeductSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
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
      return res.status(400).json({
        success: false,
        errors: result.errors,
        message: result.message,
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error deducting transaction inventory:', error);
    res.status(500).json({ success: false, error: 'Failed to deduct inventory' });
  }
});

// ============================================================================
// VOID/RESTORE
// ============================================================================

/**
 * POST /api/inventory-sync/restore
 * Restore inventory for a single item (void/return)
 */
router.post('/restore', async (req, res) => {
  try {
    const { productId, quantity, reason, referenceType, referenceId, referenceNumber } = req.body;

    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({ success: false, error: 'productId and quantity are required' });
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
      return res.status(400).json({ success: false, error: result.message });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error restoring inventory:', error);
    res.status(500).json({ success: false, error: 'Failed to restore inventory' });
  }
});

/**
 * POST /api/inventory-sync/void-transaction
 * Restore inventory for a voided transaction (multiple items)
 */
router.post('/void-transaction', async (req, res) => {
  try {
    const { items, referenceType, referenceId, referenceNumber } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'items array is required' });
    }

    const service = getService(req);
    const result = await service.restoreForVoidedTransaction(items, {
      referenceType,
      referenceId,
      referenceNumber,
      userId: req.user?.id,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error voiding transaction:', error);
    res.status(500).json({ success: false, error: 'Failed to void transaction' });
  }
});

/**
 * POST /api/inventory-sync/return
 * Process customer return
 */
router.post('/return', async (req, res) => {
  try {
    const { productId, quantity, orderId, returnReason } = req.body;

    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({ success: false, error: 'productId and quantity are required' });
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
      return res.status(400).json({ success: false, error: result.message });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error processing return:', error);
    res.status(500).json({ success: false, error: 'Failed to process return' });
  }
});

// ============================================================================
// AUDIT LOG
// ============================================================================

/**
 * GET /api/inventory-sync/history/:productId
 * Get inventory transaction history for a product
 */
router.get('/history/:productId', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

/**
 * GET /api/inventory-sync/movements
 * Get recent inventory movements
 */
router.get('/movements', async (req, res) => {
  try {
    const { limit, types, locationId } = req.query;

    const service = getService(req);
    const movements = await service.getRecentMovements({
      limit: limit ? parseInt(limit) : 100,
      transactionTypes: types ? types.split(',') : null,
      locationId: locationId ? parseInt(locationId) : null,
    });

    res.json({ success: true, data: movements });
  } catch (error) {
    console.error('Error fetching movements:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch movements' });
  }
});

/**
 * POST /api/inventory-sync/expire-reservations
 * Manually trigger reservation expiration check
 */
router.post('/expire-reservations', async (req, res) => {
  try {
    const service = getService(req);
    const result = await service.expireOldReservations();

    res.json({
      success: true,
      data: result,
      message: `Expired ${result.expired} reservation(s)`,
    });
  } catch (error) {
    console.error('Error expiring reservations:', error);
    res.status(500).json({ success: false, error: 'Failed to expire reservations' });
  }
});

module.exports = router;
