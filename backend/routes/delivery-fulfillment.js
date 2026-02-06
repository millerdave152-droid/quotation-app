/**
 * TeleTime POS - Delivery & Fulfillment Routes
 *
 * API endpoints for delivery options, zones, and fulfillment management
 */

const express = require('express');
const router = express.Router();

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
  router.post('/options', async (req, res) => {
    try {
      const { cart, address } = req.body;

      if (!cart) {
        return res.status(400).json({
          success: false,
          error: 'Cart is required',
        });
      }

      const result = await deliveryService.getAvailableOptions(cart, address);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('[Delivery] Get options error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/delivery/calculate-fee
   * Calculate delivery fee for a specific option
   */
  router.post('/calculate-fee', async (req, res) => {
    try {
      const { optionType, cart, address } = req.body;

      if (!optionType || !cart) {
        return res.status(400).json({
          success: false,
          error: 'optionType and cart are required',
        });
      }

      const result = await deliveryService.calculateDeliveryFee(optionType, cart, address);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('[Delivery] Calculate fee error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // ADDRESS VALIDATION
  // ============================================================================

  /**
   * POST /api/delivery/validate-address
   * Check if address is within delivery zone
   */
  router.post('/validate-address', async (req, res) => {
    try {
      const { address } = req.body;

      if (!address) {
        return res.status(400).json({
          success: false,
          error: 'Address is required',
        });
      }

      const result = await deliveryService.validateDeliveryAddress(address);
      res.json(result);
    } catch (error) {
      console.error('[Delivery] Validate address error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // SCHEDULING
  // ============================================================================

  /**
   * GET /api/delivery/slots
   * Get available time slots for a date
   */
  router.get('/slots', async (req, res) => {
    try {
      const { date, optionType, zoneId } = req.query;

      if (!date) {
        return res.status(400).json({
          success: false,
          error: 'Date is required',
        });
      }

      const result = await deliveryService.getDeliverySlots(
        date,
        optionType || null,
        zoneId ? parseInt(zoneId) : null
      );

      res.json(result);
    } catch (error) {
      console.error('[Delivery] Get slots error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/delivery/available-dates
   * Get available dates for delivery/pickup
   */
  router.get('/available-dates', async (req, res) => {
    try {
      const { optionType, daysAhead = 14 } = req.query;

      const result = await deliveryService.getAvailableDates(
        optionType,
        parseInt(daysAhead)
      );

      res.json(result);
    } catch (error) {
      console.error('[Delivery] Get available dates error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/delivery/schedule
   * Schedule delivery/pickup for an order
   */
  router.post('/schedule', async (req, res) => {
    try {
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
        return res.status(400).json({
          success: false,
          error: 'fulfillmentType is required',
        });
      }

      if (!transactionId && !orderId) {
        return res.status(400).json({
          success: false,
          error: 'transactionId or orderId is required',
        });
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
        return res.status(400).json(result);
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('[Delivery] Schedule error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // FULFILLMENT MANAGEMENT
  // ============================================================================

  /**
   * GET /api/delivery/fulfillment/:transactionId
   * Get fulfillment details for an order
   */
  router.get('/fulfillment/:transactionId', async (req, res) => {
    try {
      const { transactionId } = req.params;

      const result = await deliveryService.getFulfillment(parseInt(transactionId));

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('[Delivery] Get fulfillment error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * PUT /api/delivery/fulfillment/:id/status
   * Update fulfillment status
   */
  router.put('/fulfillment/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes, deliveredTo, trackingNumber, trackingUrl } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          error: 'Status is required',
        });
      }

      const validStatuses = [
        'pending', 'processing', 'ready_for_pickup', 'out_for_delivery',
        'in_transit', 'delivered', 'failed_delivery', 'returned', 'cancelled',
      ];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
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
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('[Delivery] Update status error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/delivery/pending
   * Get pending fulfillments
   */
  router.get('/pending', async (req, res) => {
    try {
      const { status, fulfillmentType, date } = req.query;

      const result = await deliveryService.getPendingFulfillments({
        status,
        fulfillmentType,
        date,
      });

      res.json(result);
    } catch (error) {
      console.error('[Delivery] Get pending error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/delivery/ready-for-pickup
   * Get orders ready for customer pickup
   */
  router.get('/ready-for-pickup', async (req, res) => {
    try {
      const result = await deliveryService.getReadyForPickup();
      res.json(result);
    } catch (error) {
      console.error('[Delivery] Get ready for pickup error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/delivery/process-pickup
   * Process a customer pickup by code
   */
  router.post('/process-pickup', async (req, res) => {
    try {
      const { pickupCode } = req.body;

      if (!pickupCode) {
        return res.status(400).json({
          success: false,
          error: 'Pickup code is required',
        });
      }

      const result = await deliveryService.processPickup(
        pickupCode,
        req.user?.id
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('[Delivery] Process pickup error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // ZONES
  // ============================================================================

  /**
   * GET /api/delivery/zones
   * Get all delivery zones
   */
  router.get('/zones', async (req, res) => {
    try {
      const result = await deliveryService.getDeliveryZones();
      res.json(result);
    } catch (error) {
      console.error('[Delivery] Get zones error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return router;
};
