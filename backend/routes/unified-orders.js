/**
 * TeleTime - Unified Orders API Routes
 * RESTful API for the unified order model
 * Supports quotes, POS transactions, orders, and invoices
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const UnifiedOrderService = require('../services/UnifiedOrderService');
const DeliveryDetailsService = require('../services/DeliveryDetailsService');
const DeliveryWindowService = require('../services/DeliveryWindowService');
const PickupDetailsService = require('../services/PickupDetailsService');

// ============================================================================
// MODULE STATE
// ============================================================================

let orderService = null;
let deliveryDetailsService = null;
let deliveryWindowService = null;
let pickupDetailsService = null;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createOrderItemSchema = Joi.object({
  productId: Joi.number().integer().optional(),
  productSku: Joi.string().max(100).optional(),
  productName: Joi.string().max(255).required(),
  name: Joi.string().max(255).optional(), // Alias
  productDescription: Joi.string().optional(),
  description: Joi.string().optional(), // Alias
  manufacturer: Joi.string().max(255).optional(),
  model: Joi.string().max(255).optional(),
  quantity: Joi.number().integer().min(1).required(),
  unitPriceCents: Joi.number().integer().min(0).required(),
  unitCostCents: Joi.number().integer().min(0).optional(),
  discountType: Joi.string().valid('percent', 'fixed_amount', 'buy_x_get_y', 'bundle').optional(),
  discountPercent: Joi.number().min(0).max(100).optional(),
  discountCents: Joi.number().integer().min(0).optional(),
  discountReason: Joi.string().max(255).optional(),
  taxable: Joi.boolean().optional(),
  serialNumber: Joi.string().max(100).optional(),
  isSpecialOrder: Joi.boolean().optional(),
  specialOrderNotes: Joi.string().optional(),
  notes: Joi.string().optional(),
  metadata: Joi.object().optional(),
});

const VALID_PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
const POSTAL_CODE_REGEX = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

const deliveryAddressSchema = Joi.object({
  streetNumber: Joi.string().max(20).required(),
  streetName: Joi.string().max(255).required(),
  unit: Joi.string().max(50).optional().allow('', null),
  buzzer: Joi.string().max(50).optional().allow('', null),
  city: Joi.string().max(100).required(),
  province: Joi.string().valid(...VALID_PROVINCES).required(),
  postalCode: Joi.string().pattern(POSTAL_CODE_REGEX).required()
    .messages({ 'string.pattern.base': 'Postal code must be in A1A 1A1 format' }),
});

const createOrderSchema = Joi.object({
  source: Joi.string().valid('quote', 'pos', 'online', 'phone', 'import', 'api').optional(),
  status: Joi.string().optional(),
  customerId: Joi.number().integer().optional(),
  customerName: Joi.string().max(255).optional(),
  customerEmail: Joi.string().email().optional().allow('', null),
  customerPhone: Joi.string().max(50).optional().allow('', null),
  customerAddress: Joi.string().optional(),
  createdBy: Joi.number().integer().optional(),
  salespersonId: Joi.number().integer().optional(),
  registerId: Joi.number().integer().optional(),
  shiftId: Joi.number().integer().optional(),
  quoteExpiryDate: Joi.string().optional(),
  quoteValidDays: Joi.number().integer().min(1).max(365).optional(),
  orderDiscountCents: Joi.number().integer().min(0).optional(),
  orderDiscountType: Joi.string().valid('percent', 'fixed_amount').optional(),
  orderDiscountReason: Joi.string().max(255).optional(),
  orderDiscountCode: Joi.string().max(50).optional(),
  taxProvince: Joi.string().length(2).optional(),
  taxExempt: Joi.boolean().optional(),
  taxExemptNumber: Joi.string().max(50).optional(),
  fulfillmentType: Joi.string().valid('pickup', 'delivery').required(),
  deliveryCents: Joi.number().integer().min(0).optional(),
  deliveryMethod: Joi.string().max(50).optional(),
  deliveryAddress: Joi.alternatives().try(Joi.string(), deliveryAddressSchema).optional(),
  deliveryInstructions: Joi.string().optional(),
  deliveryDate: Joi.string().optional(),
  deliveryTimeSlot: Joi.string().max(50).optional(),
  depositRequiredCents: Joi.number().integer().min(0).optional(),
  internalNotes: Joi.string().optional(),
  customerNotes: Joi.string().optional(),
  metadata: Joi.object().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  marketingSourceId: Joi.number().integer().optional().allow(null),
  marketingSourceDetail: Joi.string().max(500).optional().allow('', null),
  items: Joi.array().items(createOrderItemSchema).min(0).required(),
});

const createPaymentSchema = Joi.object({
  paymentMethod: Joi.string().valid(
    'cash', 'credit_card', 'debit_card', 'gift_card',
    'store_credit', 'check', 'bank_transfer', 'etransfer', 'financing', 'other'
  ).required(),
  amountCents: Joi.number().integer().required(),
  status: Joi.string().valid('pending', 'authorized', 'captured', 'completed', 'failed').optional(),
  cashTenderedCents: Joi.number().integer().min(0).optional(),
  changeGivenCents: Joi.number().integer().min(0).optional(),
  cardBrand: Joi.string().max(20).optional().allow('', null),
  cardLastFour: Joi.alternatives().try(
    Joi.string().length(4).pattern(/^\d{4}$/),
    Joi.string().valid('', null),
    Joi.valid(null)
  ).optional(),
  authorizationCode: Joi.string().max(50).optional().allow('', null),
  processorReference: Joi.string().max(100).optional(),
  checkNumber: Joi.string().max(50).optional(),
  giftCardNumber: Joi.string().max(50).optional(),
  notes: Joi.string().optional(),
  metadata: Joi.object().optional(),
});

const createPOSTransactionSchema = Joi.object({
  shiftId: Joi.number().integer().required(),
  customerId: Joi.number().integer().optional(),
  customerName: Joi.string().max(255).optional(),
  customerEmail: Joi.string().email().optional().allow('', null),
  customerPhone: Joi.string().max(50).optional().allow('', null),
  salespersonId: Joi.number().integer().optional(),
  quoteId: Joi.number().integer().optional(),
  discountCents: Joi.number().integer().min(0).optional(),
  discountReason: Joi.string().max(255).optional(),
  taxProvince: Joi.string().length(2).optional(),
  items: Joi.array().items(createOrderItemSchema).min(1).required(),
  payments: Joi.array().items(createPaymentSchema).min(1).required(),
});

const updateOrderSchema = Joi.object({
  customerName: Joi.string().max(255).optional(),
  customerEmail: Joi.string().email().optional().allow('', null),
  customerPhone: Joi.string().max(50).optional().allow('', null),
  customerAddress: Joi.string().optional(),
  salespersonId: Joi.number().integer().optional().allow(null),
  orderDiscountCents: Joi.number().integer().min(0).optional(),
  orderDiscountType: Joi.string().valid('percent', 'fixed_amount').optional().allow(null),
  orderDiscountReason: Joi.string().max(255).optional().allow('', null),
  orderDiscountCode: Joi.string().max(50).optional().allow('', null),
  taxExempt: Joi.boolean().optional(),
  taxExemptNumber: Joi.string().max(50).optional().allow('', null),
  fulfillmentType: Joi.string().valid('pickup', 'delivery').optional(),
  deliveryCents: Joi.number().integer().min(0).optional(),
  deliveryMethod: Joi.string().max(50).optional().allow('', null),
  deliveryAddress: Joi.alternatives().try(Joi.string().allow('', null), deliveryAddressSchema).optional(),
  deliveryInstructions: Joi.string().optional().allow('', null),
  deliveryDate: Joi.string().optional().allow(null),
  deliveryTimeSlot: Joi.string().max(50).optional().allow('', null),
  depositRequiredCents: Joi.number().integer().min(0).optional(),
  internalNotes: Joi.string().optional().allow('', null),
  customerNotes: Joi.string().optional().allow('', null),
  quoteExpiryDate: Joi.string().optional().allow(null),
  quoteValidDays: Joi.number().integer().min(1).max(365).optional(),
  invoiceTerms: Joi.string().max(100).optional().allow('', null),
  tags: Joi.array().items(Joi.string()).optional(),
  marketingSourceId: Joi.number().integer().optional().allow(null),
  marketingSourceDetail: Joi.string().max(500).optional().allow('', null),
  items: Joi.array().items(createOrderItemSchema).optional(),
}).min(1);

const transitionStatusSchema = Joi.object({
  status: Joi.string().required(),
  reason: Joi.string().max(500).optional(),
  notes: Joi.string().optional(),
});

const refundSchema = Joi.object({
  amountCents: Joi.number().integer().min(1).required(),
  paymentMethod: Joi.string().optional(),
  reason: Joi.string().max(500).optional(),
  originalPaymentId: Joi.number().integer().optional(),
  notes: Joi.string().optional(),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function validateRequest(schema, data) {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const details = error.details.map(d => ({
      field: d.path.join('.'),
      message: d.message,
    }));
    throw ApiError.badRequest('Validation failed', details);
  }

  return value;
}

// ============================================================================
// ROUTES - ORDER CRUD
// ============================================================================

/**
 * POST /api/unified-orders
 * Create a new order
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const data = validateRequest(createOrderSchema, req.body);

  if (!data.createdBy) {
    data.createdBy = req.user.id;
  }

  const order = await orderService.create(data);

  res.status(201).json({
    success: true,
    data: order,
  });
}));

/**
 * POST /api/unified-orders/pos-transaction
 * Create a POS transaction with items and payments
 */
router.post('/pos-transaction', authenticate, asyncHandler(async (req, res) => {
  const data = validateRequest(createPOSTransactionSchema, req.body);

  data.createdBy = req.user.id;

  const transaction = await orderService.createPOSTransaction(data);

  res.status(201).json({
    success: true,
    data: transaction,
  });
}));

/**
 * POST /api/unified-orders/quote
 * Create a new quote
 */
router.post('/quote', authenticate, asyncHandler(async (req, res) => {
  const data = validateRequest(createOrderSchema, req.body);

  data.createdBy = req.user.id;

  const quote = await orderService.createQuote(data);

  res.status(201).json({
    success: true,
    data: quote,
  });
}));

/**
 * GET /api/unified-orders
 * Search/list orders with filters
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const filters = {
    source: req.query.source,
    status: req.query.status,
    customerId: req.query.customerId ? parseInt(req.query.customerId, 10) : undefined,
    salespersonId: req.query.salespersonId ? parseInt(req.query.salespersonId, 10) : undefined,
    shiftId: req.query.shiftId ? parseInt(req.query.shiftId, 10) : undefined,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    search: req.query.search,
  };

  const pagination = {
    page: req.query.page ? parseInt(req.query.page, 10) : 1,
    limit: req.query.limit ? Math.min(parseInt(req.query.limit, 10), 100) : 50,
    sortBy: req.query.sortBy || 'created_at',
    sortDir: req.query.sortDir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
  };

  const result = await orderService.search(filters, pagination);

  res.json({
    success: true,
    ...result,
  });
}));

/**
 * GET /api/unified-orders/pickups/pending
 * Get pending pickups for warehouse/store staff view
 * Query: ?location_id=1&date=2026-02-15&status=ready
 */
router.get('/pickups/pending', authenticate, asyncHandler(async (req, res) => {
  const filters = {};
  if (req.query.location_id) filters.locationId = parseInt(req.query.location_id);
  if (req.query.date) filters.date = req.query.date;
  if (req.query.status) filters.status = req.query.status;

  const pickups = await pickupDetailsService.getPendingPickups(filters);

  res.json({
    success: true,
    data: pickups,
    count: pickups.length,
  });
}));

/**
 * GET /api/unified-orders/:id
 * Get order by ID
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const includeItems = req.query.includeItems !== 'false';
  const includePayments = req.query.includePayments !== 'false';
  const includeHistory = req.query.includeHistory === 'true';

  const order = await orderService.getById(parseInt(id, 10), {
    includeItems,
    includePayments,
    includeHistory,
  });

  if (!order) {
    throw ApiError.notFound('Order');
  }

  res.json({
    success: true,
    data: order,
  });
}));

/**
 * GET /api/unified-orders/number/:orderNumber
 * Get order by order number
 */
router.get('/number/:orderNumber', authenticate, asyncHandler(async (req, res) => {
  const { orderNumber } = req.params;
  const includeItems = req.query.includeItems !== 'false';
  const includePayments = req.query.includePayments !== 'false';
  const includeHistory = req.query.includeHistory === 'true';

  const order = await orderService.getByOrderNumber(orderNumber, {
    includeItems,
    includePayments,
    includeHistory,
  });

  if (!order) {
    throw ApiError.notFound('Order');
  }

  res.json({
    success: true,
    data: order,
  });
}));

/**
 * PUT /api/unified-orders/:id
 * Update an order
 */
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = validateRequest(updateOrderSchema, req.body);

  const order = await orderService.update(parseInt(id, 10), data, req.user.id);

  res.json({
    success: true,
    data: order,
  });
}));

// ============================================================================
// ROUTES - STATUS TRANSITIONS
// ============================================================================

/**
 * POST /api/unified-orders/:id/transition
 * Transition order to new status
 */
router.post('/:id/transition', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = validateRequest(transitionStatusSchema, req.body);

  const order = await orderService.transitionStatus(parseInt(id, 10), data.status, {
    userId: req.user.id,
    reason: data.reason,
    notes: data.notes,
  });

  res.json({
    success: true,
    data: order,
  });
}));

/**
 * POST /api/unified-orders/:id/void
 * Void an order
 */
router.post('/:id/void', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    throw ApiError.badRequest('Void reason is required');
  }

  const order = await orderService.void(parseInt(id, 10), reason, req.user.id);

  res.json({
    success: true,
    data: order,
  });
}));

/**
 * POST /api/unified-orders/:id/send-quote
 * Mark quote as sent
 */
router.post('/:id/send-quote', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await orderService.sendQuote(parseInt(id, 10), req.user.id);

  res.json({
    success: true,
    data: order,
  });
}));

/**
 * POST /api/unified-orders/:id/convert-to-order
 * Convert quote to order
 */
router.post('/:id/convert-to-order', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await orderService.convertQuoteToOrder(parseInt(id, 10), req.user.id);

  res.json({
    success: true,
    data: order,
  });
}));

// ============================================================================
// ROUTES - PAYMENTS
// ============================================================================

/**
 * POST /api/unified-orders/:id/payments
 * Add payment to order
 */
router.post('/:id/payments', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = validateRequest(createPaymentSchema, req.body);

  const payment = await orderService.addPayment(parseInt(id, 10), data, req.user.id);

  res.status(201).json({
    success: true,
    data: payment,
  });
}));

/**
 * POST /api/unified-orders/:id/refund
 * Process refund
 */
router.post('/:id/refund', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = validateRequest(refundSchema, req.body);

  const refund = await orderService.processRefund(parseInt(id, 10), data, req.user.id);

  res.json({
    success: true,
    data: refund,
  });
}));

/**
 * GET /api/unified-orders/:id/payments
 * List all payments on an order
 */
router.get('/:id/payments', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await orderService.getById(parseInt(id, 10), { includeItems: false, includePayments: true });
  if (!order) {
    throw ApiError.notFound('Order');
  }

  res.json({
    success: true,
    data: order.payments || [],
  });
}));

/**
 * GET /api/unified-orders/:id/balance
 * Get outstanding balance on an order
 */
router.get('/:id/balance', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await orderService.getById(parseInt(id, 10), { includeItems: false, includePayments: true });
  if (!order) {
    throw ApiError.notFound('Order');
  }

  res.json({
    success: true,
    data: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalCents: order.totalCents,
      total: order.total,
      amountPaidCents: order.amountPaidCents,
      amountPaid: order.amountPaid,
      amountDueCents: order.amountDueCents,
      amountDue: order.amountDue,
      depositRequiredCents: order.depositRequiredCents,
      depositRequired: order.depositRequired,
      depositPaidCents: order.depositPaidCents,
      depositPaid: order.depositPaid,
      paymentStatus: order.paymentStatus,
      payments: (order.payments || []).length,
    },
  });
}));

// ============================================================================
// ROUTES - ORDER ITEMS
// ============================================================================

/**
 * POST /api/unified-orders/:id/items
 * Add item to order
 */
router.post('/:id/items', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = validateRequest(createOrderItemSchema, req.body);

  const order = await orderService.getById(parseInt(id, 10));
  if (!order) {
    throw ApiError.notFound('Order');
  }

  const items = [...(order.items || []), data];
  const updated = await orderService.update(parseInt(id, 10), { items }, req.user.id);

  res.status(201).json({
    success: true,
    data: updated.items[updated.items.length - 1],
  });
}));

/**
 * DELETE /api/unified-orders/:id/items/:itemId
 * Remove order item
 */
router.delete('/:id/items/:itemId', authenticate, asyncHandler(async (req, res) => {
  const { id, itemId } = req.params;

  const order = await orderService.getById(parseInt(id, 10));
  if (!order) {
    throw ApiError.notFound('Order');
  }

  const items = order.items.filter(item => item.id !== parseInt(itemId, 10));
  await orderService.update(parseInt(id, 10), { items }, req.user.id);

  res.json({
    success: true,
    message: 'Item removed',
  });
}));

// ============================================================================
// ROUTES - REPORTS
// ============================================================================

/**
 * GET /api/unified-orders/shift/:shiftId/summary
 * Get shift sales summary
 */
router.get('/shift/:shiftId/summary', authenticate, asyncHandler(async (req, res) => {
  const { shiftId } = req.params;

  const result = await orderService.search(
    { shiftId: parseInt(shiftId, 10), source: 'pos' },
    { limit: 1000 }
  );

  const orders = result.data;
  let totalSales = 0;
  let totalRefunds = 0;
  const paymentBreakdown = {};

  for (const order of orders) {
    if (order.status === 'paid' || order.status === 'order_completed') {
      totalSales += order.totalCents;
    }

    for (const payment of order.payments || []) {
      if (payment.isRefund) {
        totalRefunds += payment.amountCents;
      } else if (payment.status === 'completed') {
        if (!paymentBreakdown[payment.paymentMethod]) {
          paymentBreakdown[payment.paymentMethod] = { count: 0, total: 0 };
        }
        paymentBreakdown[payment.paymentMethod].count++;
        paymentBreakdown[payment.paymentMethod].total += payment.amountCents;
      }
    }
  }

  res.json({
    success: true,
    data: {
      orderCount: orders.length,
      totalSales: totalSales / 100,
      totalRefunds: totalRefunds / 100,
      netSales: (totalSales - totalRefunds) / 100,
      paymentBreakdown: Object.fromEntries(
        Object.entries(paymentBreakdown).map(([method, data]) => [
          method,
          { count: data.count, total: data.total / 100 },
        ])
      ),
    },
  });
}));

/**
 * GET /api/unified-orders/reports/daily
 * Get daily sales summary
 */
router.get('/reports/daily', authenticate, asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];

  const result = await orderService.search(
    {
      dateFrom: `${date}T00:00:00`,
      dateTo: `${date}T23:59:59`,
    },
    { limit: 1000 }
  );

  const orders = result.data;
  let orderCount = 0;
  let quoteCount = 0;
  let totalSales = 0;
  const productTotals = {};
  const salespersonTotals = {};

  for (const order of orders) {
    if (order.source === 'quote') {
      quoteCount++;
    } else {
      orderCount++;
      totalSales += order.totalCents;
    }

    const spName = order.salespersonName || 'Unknown';
    if (!salespersonTotals[spName]) {
      salespersonTotals[spName] = { count: 0, total: 0 };
    }
    salespersonTotals[spName].count++;
    salespersonTotals[spName].total += order.totalCents;

    for (const item of order.items || []) {
      if (!productTotals[item.productName]) {
        productTotals[item.productName] = { quantity: 0, total: 0 };
      }
      productTotals[item.productName].quantity += item.quantity;
      productTotals[item.productName].total += item.lineTotalCents;
    }
  }

  const topProducts = Object.entries(productTotals)
    .map(([productName, data]) => ({
      productName,
      quantity: data.quantity,
      total: data.total / 100,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const salesBySalesperson = Object.entries(salespersonTotals)
    .map(([salespersonName, data]) => ({
      salespersonName,
      count: data.count,
      total: data.total / 100,
    }))
    .sort((a, b) => b.total - a.total);

  res.json({
    success: true,
    data: {
      date,
      orderCount,
      quoteCount,
      totalSales: totalSales / 100,
      averageOrderValue: orderCount > 0 ? (totalSales / orderCount) / 100 : 0,
      topProducts,
      salesBySalesperson,
    },
  });
}));

// ============================================================================
// DELIVERY DETAILS
// ============================================================================

const deliveryDetailsSchema = Joi.object({
  // Address
  streetNumber: Joi.string().max(20).required(),
  streetName: Joi.string().max(255).required(),
  unit: Joi.string().max(50).optional().allow('', null),
  buzzer: Joi.string().max(50).optional().allow('', null),
  city: Joi.string().max(100).required(),
  province: Joi.string().valid(...VALID_PROVINCES).required(),
  postalCode: Joi.string().pattern(POSTAL_CODE_REGEX).required()
    .messages({ 'string.pattern.base': 'Postal code must be in A1A 1A1 format' }),

  // Dwelling
  dwellingType: Joi.string().valid('house', 'townhouse', 'condo', 'apartment', 'commercial').required(),
  entryPoint: Joi.string().max(50).optional().allow('', null),
  floorNumber: Joi.string().max(20).optional().allow('', null),

  // Elevator
  elevatorRequired: Joi.boolean().optional(),
  elevatorBookingDate: Joi.string().optional().allow('', null),
  elevatorBookingTime: Joi.string().max(50).optional().allow('', null),
  conciergePhone: Joi.string().max(20).optional().allow('', null),
  conciergeNotes: Joi.string().optional().allow('', null),

  // Access
  accessSteps: Joi.number().integer().min(0).optional(),
  accessNarrowStairs: Joi.boolean().optional(),
  accessHeightRestriction: Joi.number().integer().min(0).optional().allow(null),
  accessWidthRestriction: Joi.number().integer().min(0).optional().allow(null),
  accessNotes: Joi.string().optional().allow('', null),

  // Parking
  parkingType: Joi.string().max(50).optional().allow('', null),
  parkingDistance: Joi.number().integer().min(0).optional().allow(null),
  parkingNotes: Joi.string().optional().allow('', null),

  // Confirmation
  pathwayConfirmed: Joi.boolean().optional(),
  pathwayNotes: Joi.string().optional().allow('', null),
});

/**
 * POST /api/unified-orders/:id/delivery-details
 * Create or update delivery details for an order
 */
router.post('/:id/delivery-details', authenticate, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) {
    throw ApiError.badRequest('Invalid order ID');
  }

  const data = validateRequest(deliveryDetailsSchema, req.body);
  const details = await deliveryDetailsService.upsert(orderId, data);

  res.status(200).json({
    success: true,
    data: details,
  });
}));

/**
 * GET /api/unified-orders/:id/delivery-details
 * Get delivery details for an order
 */
router.get('/:id/delivery-details', authenticate, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) {
    throw ApiError.badRequest('Invalid order ID');
  }

  const details = await deliveryDetailsService.getByOrderId(orderId);

  if (!details) {
    throw ApiError.notFound('Delivery details');
  }

  res.json({
    success: true,
    data: details,
  });
}));

/**
 * GET /api/unified-orders/:id/delivery-details/validate
 * Validate delivery details are complete for order completion
 */
router.get('/:id/delivery-details/validate', authenticate, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) {
    throw ApiError.badRequest('Invalid order ID');
  }

  const result = await deliveryDetailsService.validateForCompletion(orderId);

  res.json({
    success: true,
    data: result,
  });
}));

// ============================================================================
// DELIVERY SCHEDULING
// ============================================================================

const scheduleDeliverySchema = Joi.object({
  windowId: Joi.number().integer().required(),
  deliveryDate: Joi.string().isoDate().required(),
  notes: Joi.string().optional().allow('', null),
});

/**
 * POST /api/unified-orders/:id/schedule-delivery
 * Schedule a delivery window for an order
 */
router.post('/:id/schedule-delivery', authenticate, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) {
    throw ApiError.badRequest('Invalid order ID');
  }

  const data = validateRequest(scheduleDeliverySchema, req.body);
  const result = await deliveryWindowService.scheduleDelivery(orderId, data);

  res.status(200).json({
    success: true,
    data: result,
  });
}));

// ============================================================================
// PICKUP DETAILS
// ============================================================================

const pickupDetailsSchema = Joi.object({
  locationId: Joi.number().integer().required(),
  pickupDate: Joi.string().isoDate().required(),
  pickupTimePreference: Joi.string().max(50).optional().allow('', null),
  pickupPersonName: Joi.string().max(255).required(),
  pickupPersonPhone: Joi.string().max(20).required(),
  pickupPersonEmail: Joi.string().email().optional().allow('', null),
  vehicleType: Joi.string().max(50).optional().allow('', null),
  vehicleNotes: Joi.string().optional().allow('', null),
  notes: Joi.string().optional().allow('', null),
});

const updatePickupDetailsSchema = Joi.object({
  locationId: Joi.number().integer().optional(),
  pickupDate: Joi.string().isoDate().optional(),
  pickupTimePreference: Joi.string().max(50).optional().allow('', null),
  pickupPersonName: Joi.string().max(255).optional(),
  pickupPersonPhone: Joi.string().max(20).optional(),
  pickupPersonEmail: Joi.string().email().optional().allow('', null),
  vehicleType: Joi.string().max(50).optional().allow('', null),
  vehicleNotes: Joi.string().optional().allow('', null),
  notes: Joi.string().optional().allow('', null),
}).min(1);

/**
 * POST /api/unified-orders/:id/pickup-details
 * Create or set pickup details for an order
 */
router.post('/:id/pickup-details', authenticate, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) throw ApiError.badRequest('Invalid order ID');

  const data = validateRequest(pickupDetailsSchema, req.body);
  const details = await pickupDetailsService.upsert(orderId, data);

  res.status(200).json({ success: true, data: details });
}));

/**
 * GET /api/unified-orders/:id/pickup-details
 * Get pickup details for an order
 */
router.get('/:id/pickup-details', authenticate, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) throw ApiError.badRequest('Invalid order ID');

  const details = await pickupDetailsService.getByOrderId(orderId);
  if (!details) throw ApiError.notFound('Pickup details');

  res.json({ success: true, data: details });
}));

/**
 * PUT /api/unified-orders/:id/pickup-details
 * Update pickup details for an order
 */
router.put('/:id/pickup-details', authenticate, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) throw ApiError.badRequest('Invalid order ID');

  const data = validateRequest(updatePickupDetailsSchema, req.body);
  const details = await pickupDetailsService.update(orderId, data);

  res.json({ success: true, data: details });
}));

/**
 * POST /api/unified-orders/:id/mark-ready-for-pickup
 * Mark order as ready for pickup, sets ready_at timestamp
 */
router.post('/:id/mark-ready-for-pickup', authenticate, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) throw ApiError.badRequest('Invalid order ID');

  const details = await pickupDetailsService.markReady(orderId);

  res.json({ success: true, data: details });
}));

/**
 * POST /api/unified-orders/:id/complete-pickup
 * Complete pickup, sets picked_up_at and staff name
 */
router.post('/:id/complete-pickup', authenticate, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) throw ApiError.badRequest('Invalid order ID');

  const staffName = req.body.staffName || req.user.name || req.user.email;
  const details = await pickupDetailsService.completePickup(orderId, staffName);

  res.json({ success: true, data: details });
}));

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize routes with dependencies
 */
const init = (deps) => {
  orderService = new UnifiedOrderService(deps.pool);
  deliveryDetailsService = new DeliveryDetailsService(deps.pool);
  deliveryWindowService = new DeliveryWindowService(deps.pool);
  pickupDetailsService = new PickupDetailsService(deps.pool);
  return router;
};

module.exports = { init };
