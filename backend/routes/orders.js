/**
 * Orders API Routes
 */

const express = require('express');
const router = express.Router();

module.exports = (pool, cache, orderService, inventoryService) => {

  /**
   * GET /api/orders
   * List orders with filters
   */
  router.get('/', async (req, res) => {
    try {
      const result = await orderService.getOrders({
        customerId: req.query.customerId,
        status: req.query.status,
        paymentStatus: req.query.paymentStatus,
        deliveryStatus: req.query.deliveryStatus,
        search: req.query.search,
        fromDate: req.query.fromDate,
        toDate: req.query.toDate,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 50,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder
      });

      res.json(result);
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/orders/:id
   * Get order by ID
   */
  router.get('/:id', async (req, res) => {
    try {
      const order = await orderService.getOrderById(parseInt(req.params.id));

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json(order);
    } catch (error) {
      console.error('Error fetching order:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/orders
   * Create a new order directly (without quote)
   */
  router.post('/', async (req, res) => {
    try {
      const order = await orderService.createOrder({
        customerId: req.body.customerId,
        items: req.body.items,
        deliveryDate: req.body.deliveryDate,
        deliverySlotId: req.body.deliverySlotId,
        deliveryCents: req.body.deliveryCents,
        notes: req.body.notes,
        createdBy: req.body.createdBy || 'api'
      });

      res.status(201).json(order);
    } catch (error) {
      console.error('Error creating order:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/quotes/:id/convert
   * Convert a quotation to an order
   */
  router.post('/from-quote/:quoteId', async (req, res) => {
    try {
      const result = await orderService.convertQuoteToOrder(
        parseInt(req.params.quoteId),
        {
          paymentStatus: req.body.paymentStatus,
          depositPaidCents: req.body.depositPaidCents,
          deliveryDate: req.body.deliveryDate,
          deliverySlotId: req.body.deliverySlotId,
          notes: req.body.notes,
          createdBy: req.body.createdBy || 'api'
        }
      );

      res.status(201).json(result);
    } catch (error) {
      console.error('Error converting quote to order:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * PATCH /api/orders/:id/status
   * Update order status
   */
  router.patch('/:id/status', async (req, res) => {
    try {
      const order = await orderService.updateOrderStatus(
        parseInt(req.params.id),
        req.body.status,
        req.body.updatedBy || 'api'
      );

      res.json(order);
    } catch (error) {
      console.error('Error updating order status:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * PATCH /api/orders/:id/payment
   * Update order payment status
   */
  router.patch('/:id/payment', async (req, res) => {
    try {
      const order = await orderService.updatePaymentStatus(
        parseInt(req.params.id),
        req.body.paymentStatus,
        {
          depositPaidCents: req.body.depositPaidCents,
          amountPaidCents: req.body.amountPaidCents,
          stripePaymentIntentId: req.body.stripePaymentIntentId
        }
      );

      res.json(order);
    } catch (error) {
      console.error('Error updating payment status:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/orders/:id/cancel
   * Cancel an order
   */
  router.post('/:id/cancel', async (req, res) => {
    try {
      const order = await orderService.cancelOrder(
        parseInt(req.params.id),
        req.body.reason,
        req.body.cancelledBy || 'api'
      );

      res.json(order);
    } catch (error) {
      console.error('Error cancelling order:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * GET /api/orders/by-quote/:quoteId
   * Get order by quotation ID
   */
  router.get('/by-quote/:quoteId', async (req, res) => {
    try {
      const order = await orderService.getOrderByQuote(parseInt(req.params.quoteId));

      if (!order) {
        return res.status(404).json({ error: 'No order found for this quote' });
      }

      res.json(order);
    } catch (error) {
      console.error('Error fetching order by quote:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
