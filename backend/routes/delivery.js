/**
 * Delivery API Routes
 */

const express = require('express');
const router = express.Router();

module.exports = (pool, cache, deliveryService) => {

  // =====================================================
  // ZONES
  // =====================================================

  /**
   * GET /api/delivery/zones
   * List delivery zones
   */
  router.get('/zones', async (req, res) => {
    try {
      const activeOnly = req.query.activeOnly !== 'false';
      const zones = await deliveryService.getZones(activeOnly);
      res.json(zones);
    } catch (error) {
      console.error('Error fetching zones:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/delivery/zones
   * Create a delivery zone
   */
  router.post('/zones', async (req, res) => {
    try {
      const zone = await deliveryService.createZone(req.body);
      res.status(201).json(zone);
    } catch (error) {
      console.error('Error creating zone:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * PATCH /api/delivery/zones/:id
   * Update a delivery zone
   */
  router.patch('/zones/:id', async (req, res) => {
    try {
      const zone = await deliveryService.updateZone(
        parseInt(req.params.id),
        req.body
      );
      res.json(zone);
    } catch (error) {
      console.error('Error updating zone:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * GET /api/delivery/zones/lookup
   * Look up zone by postal code
   */
  router.get('/zones/lookup', async (req, res) => {
    try {
      const zone = await deliveryService.getZoneByPostalCode(req.query.postalCode);

      if (!zone) {
        return res.status(404).json({ error: 'No delivery zone found for this postal code' });
      }

      res.json(zone);
    } catch (error) {
      console.error('Error looking up zone:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================
  // SLOTS
  // =====================================================

  /**
   * GET /api/delivery/slots
   * Get available delivery slots
   */
  router.get('/slots', async (req, res) => {
    try {
      const slots = await deliveryService.getAvailableSlots({
        postalCode: req.query.postalCode,
        zoneId: req.query.zoneId ? parseInt(req.query.zoneId) : null,
        startDate: req.query.startDate ? new Date(req.query.startDate) : null,
        endDate: req.query.endDate ? new Date(req.query.endDate) : null,
        minCapacity: parseInt(req.query.minCapacity) || 1
      });

      res.json(slots);
    } catch (error) {
      console.error('Error fetching slots:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/delivery/slots/generate
   * Generate delivery slots for a date range
   */
  router.post('/slots/generate', async (req, res) => {
    try {
      const count = await deliveryService.generateSlots(
        req.body.zoneId ? parseInt(req.body.zoneId) : null,
        new Date(req.body.startDate),
        new Date(req.body.endDate)
      );

      res.json({ slotsCreated: count });
    } catch (error) {
      console.error('Error generating slots:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/delivery/slots/:id/block
   * Block a delivery slot
   */
  router.post('/slots/:id/block', async (req, res) => {
    try {
      const slot = await deliveryService.blockSlot(
        parseInt(req.params.id),
        req.body.reason,
        req.body.blockedBy || 'api'
      );

      res.json(slot);
    } catch (error) {
      console.error('Error blocking slot:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/delivery/slots/:id/unblock
   * Unblock a delivery slot
   */
  router.post('/slots/:id/unblock', async (req, res) => {
    try {
      const slot = await deliveryService.unblockSlot(parseInt(req.params.id));
      res.json(slot);
    } catch (error) {
      console.error('Error unblocking slot:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // =====================================================
  // BOOKINGS
  // =====================================================

  /**
   * GET /api/delivery/bookings
   * List delivery bookings
   */
  router.get('/bookings', async (req, res) => {
    try {
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
    } catch (error) {
      console.error('Error fetching bookings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/delivery/bookings/:id
   * Get booking by ID
   */
  router.get('/bookings/:id', async (req, res) => {
    try {
      const booking = await deliveryService.getBookingById(parseInt(req.params.id));

      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      res.json(booking);
    } catch (error) {
      console.error('Error fetching booking:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/delivery/bookings
   * Create a delivery booking
   */
  router.post('/bookings', async (req, res) => {
    try {
      const booking = await deliveryService.bookSlot(
        parseInt(req.body.slotId),
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
    } catch (error) {
      console.error('Error creating booking:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * PATCH /api/delivery/bookings/:id/status
   * Update booking status
   */
  router.patch('/bookings/:id/status', async (req, res) => {
    try {
      const booking = await deliveryService.updateBookingStatus(
        parseInt(req.params.id),
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
    } catch (error) {
      console.error('Error updating booking status:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/delivery/bookings/:id/cancel
   * Cancel a booking
   */
  router.post('/bookings/:id/cancel', async (req, res) => {
    try {
      const booking = await deliveryService.cancelBooking(
        parseInt(req.params.id),
        req.body.reason
      );

      res.json(booking);
    } catch (error) {
      console.error('Error cancelling booking:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/delivery/calculate-fee
   * Calculate delivery fee
   */
  router.post('/calculate-fee', async (req, res) => {
    try {
      const result = await deliveryService.calculateDeliveryFee(
        req.body.postalCode,
        req.body.orderTotalCents
      );

      res.json(result);
    } catch (error) {
      console.error('Error calculating delivery fee:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
