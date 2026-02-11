/**
 * TeleTime POS - Delivery & Fulfillment Routes
 *
 * API endpoints for delivery options, zones, and fulfillment management
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

/**
 * Initialize routes with service
 * @param {DeliveryFulfillmentService} deliveryService
 */
module.exports = function (deliveryService) {
  // ============================================================================
  // DELIVERY OPTIONS
  // ============================================================================

  /**
   * POST /api/delivery/options
   * Get available fulfillment options for a cart
   */
  router.post('/options', asyncHandler(async (req, res) => {
    const { cart, address } = req.body;

    if (!cart) {
      throw ApiError.badRequest('Cart is required');
    }

    const result = await deliveryService.getAvailableOptions(cart, address);

    if (!result.success) {
      throw ApiError.badRequest(result.error || 'Failed to get delivery options');
    }

    res.json(result);
  }));

  /**
   * POST /api/delivery/calculate-fee
   * Calculate delivery fee for a specific option
   */
  router.post('/calculate-fee', asyncHandler(async (req, res) => {
    const { optionType, cart, address } = req.body;

    if (!optionType || !cart) {
      throw ApiError.badRequest('optionType and cart are required');
    }

    const result = await deliveryService.calculateDeliveryFee(optionType, cart, address);

    if (!result.success) {
      throw ApiError.badRequest(result.error || 'Failed to calculate delivery fee');
    }

    res.json(result);
  }));

  // ============================================================================
  // ADDRESS VALIDATION
  // ============================================================================

  /**
   * POST /api/delivery/validate-address
   * Check if address is within delivery zone
   */
  router.post('/validate-address', asyncHandler(async (req, res) => {
    const { address } = req.body;

    if (!address) {
      throw ApiError.badRequest('Address is required');
    }

    const result = await deliveryService.validateDeliveryAddress(address);
    res.json(result);
  }));

  // ============================================================================
  // SCHEDULING
  // ============================================================================

  /**
   * GET /api/delivery/slots
   * Get available time slots for a date
   */
  router.get('/slots', asyncHandler(async (req, res) => {
    const { date, optionType, zoneId } = req.query;

    if (!date) {
      throw ApiError.badRequest('Date is required');
    }

    const result = await deliveryService.getDeliverySlots(
      date,
      optionType || null,
      zoneId ? parseInt(zoneId) : null
    );

    res.json(result);
  }));

  /**
   * GET /api/delivery/available-dates
   * Get available dates for delivery/pickup
   */
  router.get('/available-dates', asyncHandler(async (req, res) => {
    const { optionType, daysAhead = 14 } = req.query;

    const result = await deliveryService.getAvailableDates(
      optionType,
      parseInt(daysAhead)
    );

    res.json(result);
  }));

  /**
   * POST /api/delivery/schedule
   * Schedule delivery/pickup for an order
   */
  router.post('/schedule', asyncHandler(async (req, res) => {
    const {
      transactionId,
      orderId,
      fulfillmentType,
      scheduledDate,
      timeSlotId,
      startTime,
      endTime,
      deliveryAddress,
      zoneId,
      deliveryFee,
      customerNotes,
    } = req.body;

    if (!fulfillmentType) {
      throw ApiError.badRequest('fulfillmentType is required');
    }

    if (!transactionId && !orderId) {
      throw ApiError.badRequest('transactionId or orderId is required');
    }

    const result = await deliveryService.scheduleDelivery({
      transactionId,
      orderId,
      fulfillmentType,
      scheduledDate,
      timeSlotId,
      startTime,
      endTime,
      deliveryAddress,
      zoneId,
      deliveryFee,
      customerNotes,
      userId: req.user?.id,
    });

    if (!result.success) {
      throw ApiError.badRequest(result.error || 'Failed to schedule delivery');
    }

    res.status(201).json(result);
  }));

  // ============================================================================
  // FULFILLMENT MANAGEMENT
  // ============================================================================

  /**
   * GET /api/delivery/fulfillment/:transactionId
   * Get fulfillment details for an order
   */
  router.get('/fulfillment/:transactionId', asyncHandler(async (req, res) => {
    const { transactionId } = req.params;

    const result = await deliveryService.getFulfillment(parseInt(transactionId));

    if (!result.success) {
      throw ApiError.notFound(result.error || 'Fulfillment');
    }

    res.json(result);
  }));

  /**
   * PUT /api/delivery/fulfillment/:id/status
   * Update fulfillment status
   */
  router.put('/fulfillment/:id/status', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, notes, deliveredTo, trackingNumber, trackingUrl } = req.body;

    if (!status) {
      throw ApiError.badRequest('Status is required');
    }

    const validStatuses = [
      'pending', 'processing', 'ready_for_pickup', 'out_for_delivery',
      'in_transit', 'delivered', 'failed_delivery', 'returned', 'cancelled',
    ];

    if (!validStatuses.includes(status)) {
      throw ApiError.badRequest(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const result = await deliveryService.updateFulfillmentStatus(
      parseInt(id),
      status,
      {
        userId: req.user?.id,
        notes,
        deliveredTo,
        trackingNumber,
        trackingUrl,
      }
    );

    if (!result.success) {
      throw ApiError.badRequest(result.error || 'Failed to update fulfillment status');
    }

    res.json(result);
  }));

  /**
   * GET /api/delivery/pending
   * Get pending fulfillments
   */
  router.get('/pending', asyncHandler(async (req, res) => {
    const { status, fulfillmentType, date } = req.query;

    const result = await deliveryService.getPendingFulfillments({
      status,
      fulfillmentType,
      date,
    });

    res.json(result);
  }));

  /**
   * GET /api/delivery/ready-for-pickup
   * Get orders ready for customer pickup
   */
  router.get('/ready-for-pickup', asyncHandler(async (req, res) => {
    const result = await deliveryService.getReadyForPickup();
    res.json(result);
  }));

  /**
   * POST /api/delivery/process-pickup
   * Process a customer pickup by code
   */
  router.post('/process-pickup', asyncHandler(async (req, res) => {
    const { pickupCode } = req.body;

    if (!pickupCode) {
      throw ApiError.badRequest('Pickup code is required');
    }

    const result = await deliveryService.processPickup(
      pickupCode,
      req.user?.id
    );

    if (!result.success) {
      throw ApiError.badRequest(result.error || 'Failed to process pickup');
    }

    res.json(result);
  }));

  // ============================================================================
  // ZONES
  // ============================================================================

  /**
   * GET /api/delivery/zones
   * Get all delivery zones
   */
  router.get('/zones', asyncHandler(async (req, res) => {
    const result = await deliveryService.getDeliveryZones();
    res.json(result);
  }));

  return router;
};
