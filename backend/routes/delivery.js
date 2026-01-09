/**
 * Delivery API Routes
 * Handles delivery zones, slots, and booking management
 * Uses consistent error handling with asyncHandler and ApiError
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

module.exports = (pool, cache, deliveryService) => {

  // =====================================================
  // ZONES
  // =====================================================

  /**
   * GET /api/delivery/zones
   * List delivery zones
   */
  router.get('/zones', asyncHandler(async (req, res) => {
    const activeOnly = req.query.activeOnly !== 'false';
    const zones = await deliveryService.getZones(activeOnly);
    res.json(zones);
  }));

  /**
   * POST /api/delivery/zones
   * Create a delivery zone
   */
  router.post('/zones', asyncHandler(async (req, res) => {
    const { name, postalCodes } = req.body;

    if (!name) {
      throw ApiError.badRequest('Zone name is required');
    }

    const zone = await deliveryService.createZone(req.body);
    res.status(201).json(zone);
  }));

  /**
   * PATCH /api/delivery/zones/:id
   * Update a delivery zone
   */
  router.patch('/zones/:id', asyncHandler(async (req, res) => {
    const zoneId = parseInt(req.params.id);

    if (isNaN(zoneId)) {
      throw ApiError.badRequest('Invalid zone ID');
    }

    const zone = await deliveryService.updateZone(zoneId, req.body);
    res.json(zone);
  }));

  /**
   * GET /api/delivery/zones/lookup
   * Look up zone by postal code
   */
  router.get('/zones/lookup', asyncHandler(async (req, res) => {
    const { postalCode } = req.query;

    if (!postalCode) {
      throw ApiError.badRequest('Postal code is required');
    }

    const zone = await deliveryService.getZoneByPostalCode(postalCode);

    if (!zone) {
      throw ApiError.notFound('Delivery zone for this postal code');
    }

    res.json(zone);
  }));

  // =====================================================
  // SLOTS
  // =====================================================

  /**
   * GET /api/delivery/slots
   * Get available delivery slots
   */
  router.get('/slots', asyncHandler(async (req, res) => {
    const slots = await deliveryService.getAvailableSlots({
      postalCode: req.query.postalCode,
      zoneId: req.query.zoneId ? parseInt(req.query.zoneId) : null,
      startDate: req.query.startDate ? new Date(req.query.startDate) : null,
      endDate: req.query.endDate ? new Date(req.query.endDate) : null,
      minCapacity: parseInt(req.query.minCapacity) || 1
    });

    res.json(slots);
  }));

  /**
   * POST /api/delivery/slots/generate
   * Generate delivery slots for a date range
   */
  router.post('/slots/generate', asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      throw ApiError.badRequest('Start date and end date are required');
    }

    const count = await deliveryService.generateSlots(
      req.body.zoneId ? parseInt(req.body.zoneId) : null,
      new Date(startDate),
      new Date(endDate)
    );

    res.json({ slotsCreated: count });
  }));

  /**
   * POST /api/delivery/slots/:id/block
   * Block a delivery slot
   */
  router.post('/slots/:id/block', asyncHandler(async (req, res) => {
    const slotId = parseInt(req.params.id);

    if (isNaN(slotId)) {
      throw ApiError.badRequest('Invalid slot ID');
    }

    const slot = await deliveryService.blockSlot(
      slotId,
      req.body.reason,
      req.body.blockedBy || 'api'
    );

    res.json(slot);
  }));

  /**
   * POST /api/delivery/slots/:id/unblock
   * Unblock a delivery slot
   */
  router.post('/slots/:id/unblock', asyncHandler(async (req, res) => {
    const slotId = parseInt(req.params.id);

    if (isNaN(slotId)) {
      throw ApiError.badRequest('Invalid slot ID');
    }

    const slot = await deliveryService.unblockSlot(slotId);
    res.json(slot);
  }));

  // =====================================================
  // BOOKINGS
  // =====================================================

  /**
   * GET /api/delivery/bookings
   * List delivery bookings
   */
  router.get('/bookings', asyncHandler(async (req, res) => {
    const result = await deliveryService.getBookings({
      zoneId: req.query.zoneId ? parseInt(req.query.zoneId) : null,
      status: req.query.status,
      date: req.query.date,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      customerId: req.query.customerId ? parseInt(req.query.customerId) : null,
      orderId: req.query.orderId ? parseInt(req.query.orderId) : null,
      search: req.query.search,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder
    });

    res.json(result);
  }));

  /**
   * GET /api/delivery/bookings/:id
   * Get booking by ID
   */
  router.get('/bookings/:id', asyncHandler(async (req, res) => {
    const bookingId = parseInt(req.params.id);

    if (isNaN(bookingId)) {
      throw ApiError.badRequest('Invalid booking ID');
    }

    const booking = await deliveryService.getBookingById(bookingId);

    if (!booking) {
      throw ApiError.notFound('Booking');
    }

    res.json(booking);
  }));

  /**
   * POST /api/delivery/bookings
   * Create a delivery booking
   */
  router.post('/bookings', asyncHandler(async (req, res) => {
    const { slotId } = req.body;

    if (!slotId) {
      throw ApiError.badRequest('Slot ID is required');
    }

    const booking = await deliveryService.bookSlot(
      parseInt(slotId),
      {
        orderId: req.body.orderId,
        quotationId: req.body.quotationId,
        customerId: req.body.customerId,
        deliveryAddress: req.body.deliveryAddress,
        deliveryCity: req.body.deliveryCity,
        deliveryPostalCode: req.body.deliveryPostalCode,
        deliveryInstructions: req.body.deliveryInstructions,
        accessCode: req.body.accessCode,
        floorLevel: req.body.floorLevel,
        hasElevator: req.body.hasElevator,
        contactName: req.body.contactName,
        contactPhone: req.body.contactPhone,
        contactEmail: req.body.contactEmail,
        alternatePhone: req.body.alternatePhone,
        notes: req.body.notes,
        bookedBy: req.body.bookedBy || 'api'
      }
    );

    res.status(201).json(booking);
  }));

  /**
   * PATCH /api/delivery/bookings/:id/status
   * Update booking status
   */
  router.patch('/bookings/:id/status', asyncHandler(async (req, res) => {
    const bookingId = parseInt(req.params.id);

    if (isNaN(bookingId)) {
      throw ApiError.badRequest('Invalid booking ID');
    }

    if (!req.body.status) {
      throw ApiError.badRequest('Status is required');
    }

    const booking = await deliveryService.updateBookingStatus(
      bookingId,
      req.body.status,
      {
        actualArrival: req.body.actualArrival,
        actualDeparture: req.body.actualDeparture,
        signatureCaptured: req.body.signatureCaptured,
        signatureData: req.body.signatureData,
        deliveryPhotoUrl: req.body.deliveryPhotoUrl,
        issueReported: req.body.issueReported,
        internalNotes: req.body.internalNotes
      }
    );

    res.json(booking);
  }));

  /**
   * POST /api/delivery/bookings/:id/cancel
   * Cancel a booking
   */
  router.post('/bookings/:id/cancel', asyncHandler(async (req, res) => {
    const bookingId = parseInt(req.params.id);

    if (isNaN(bookingId)) {
      throw ApiError.badRequest('Invalid booking ID');
    }

    const booking = await deliveryService.cancelBooking(
      bookingId,
      req.body.reason
    );

    res.json(booking);
  }));

  /**
   * POST /api/delivery/calculate-fee
   * Calculate delivery fee
   */
  router.post('/calculate-fee', asyncHandler(async (req, res) => {
    const { postalCode, orderTotalCents } = req.body;

    if (!postalCode) {
      throw ApiError.badRequest('Postal code is required');
    }

    const result = await deliveryService.calculateDeliveryFee(
      postalCode,
      orderTotalCents
    );

    res.json(result);
  }));

  return router;
};
