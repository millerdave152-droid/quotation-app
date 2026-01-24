/**
 * Orders API Routes
 * Handles order management, creation, and status updates
 * Uses consistent error handling with asyncHandler and ApiError
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const { validateJoi, orderSchemas } = require('../middleware/validation');

module.exports = (pool, cache, orderService, inventoryService) => {

  /**
   * GET /api/orders
   * List orders with filters
   */
  router.get('/', authenticate, asyncHandler(async (req, res) => {
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
  }));

  /**
   * GET /api/orders/:id
   * Get order by ID
   */
  router.get('/:id', authenticate, asyncHandler(async (req, res) => {
    const order = await orderService.getOrderById(parseInt(req.params.id));

    if (!order) {
      throw ApiError.notFound('Order');
    }

    res.json(order);
  }));

  /**
   * POST /api/orders
   * Create a new order directly (without quote)
   */
  router.post('/', authenticate, validateJoi(orderSchemas.create), asyncHandler(async (req, res) => {
    const { customerId, items, deliveryDate, deliverySlotId, deliveryCents, notes, createdBy } = req.body;

    const order = await orderService.createOrder({
      customerId,
      items,
      deliveryDate,
      deliverySlotId,
      deliveryCents,
      notes,
      createdBy: createdBy || 'api'
    });

    res.status(201).json(order);
  }));

  /**
   * POST /api/orders/from-quote/:quoteId
   * Convert a quotation to an order
   */
  router.post('/from-quote/:quoteId', authenticate, asyncHandler(async (req, res) => {
    const quoteId = parseInt(req.params.quoteId);

    if (isNaN(quoteId)) {
      throw ApiError.badRequest('Invalid quote ID');
    }

    const result = await orderService.convertQuoteToOrder(
      quoteId,
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
  }));

  /**
   * PATCH /api/orders/:id/status
   * Update order status
   */
  router.patch('/:id/status', authenticate, validateJoi(orderSchemas.status), asyncHandler(async (req, res) => {
    const orderId = parseInt(req.params.id);

    if (isNaN(orderId)) {
      throw ApiError.badRequest('Invalid order ID');
    }

    const order = await orderService.updateOrderStatus(
      orderId,
      req.body.status,
      req.body.updatedBy || 'api'
    );

    res.json(order);
  }));

  /**
   * PATCH /api/orders/:id/payment
   * Update order payment status
   */
  router.patch('/:id/payment', authenticate, validateJoi(orderSchemas.payment), asyncHandler(async (req, res) => {
    const orderId = parseInt(req.params.id);

    if (isNaN(orderId)) {
      throw ApiError.badRequest('Invalid order ID');
    }

    const order = await orderService.updatePaymentStatus(
      orderId,
      req.body.paymentStatus,
      {
        depositPaidCents: req.body.depositPaidCents,
        amountPaidCents: req.body.amountPaidCents,
        stripePaymentIntentId: req.body.stripePaymentIntentId
      }
    );

    res.json(order);
  }));

  /**
   * POST /api/orders/:id/cancel
   * Cancel an order
   */
  router.post('/:id/cancel', authenticate, asyncHandler(async (req, res) => {
    const orderId = parseInt(req.params.id);

    if (isNaN(orderId)) {
      throw ApiError.badRequest('Invalid order ID');
    }

    const order = await orderService.cancelOrder(
      orderId,
      req.body.reason,
      req.body.cancelledBy || 'api'
    );

    res.json(order);
  }));

  /**
   * GET /api/orders/by-quote/:quoteId
   * Get order by quotation ID
   */
  router.get('/by-quote/:quoteId', authenticate, asyncHandler(async (req, res) => {
    const quoteId = parseInt(req.params.quoteId);

    if (isNaN(quoteId)) {
      throw ApiError.badRequest('Invalid quote ID');
    }

    const order = await orderService.getOrderByQuote(quoteId);

    if (!order) {
      throw ApiError.notFound('Order for this quote');
    }

    res.json(order);
  }));

  return router;
};
