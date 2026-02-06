/**
 * Shared Validation Schemas
 * Standardized Joi schemas for Quote, Order, and POS endpoints
 */

const Joi = require('joi');

// ============================================================================
// COMMON FIELD SCHEMAS
// ============================================================================

const id = Joi.number().integer().positive();
const optionalId = id.optional().allow(null);
const requiredId = id.required();

const email = Joi.string().email().max(255);
const phone = Joi.string().pattern(/^[\d\s\-\+\(\)]+$/).min(10).max(20);
const postalCode = Joi.string().pattern(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/).message('Invalid Canadian postal code');

const cents = Joi.number().integer().min(0);
const dollars = Joi.number().min(0).precision(2);
const percentage = Joi.number().min(0).max(100).precision(2);
const quantity = Joi.number().integer().min(1).max(9999);

const isoDate = Joi.date().iso();
const isoDateString = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/);

// ============================================================================
// ENUM SCHEMAS
// ============================================================================

const taxProvince = Joi.string().valid(
  'ON', 'BC', 'AB', 'SK', 'MB', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU'
).default('ON');

const quoteStatus = Joi.string().valid(
  'DRAFT', 'SENT', 'PENDING_APPROVAL', 'APPROVED', 'WON', 'LOST', 'EXPIRED',
  'draft', 'sent', 'pending_approval', 'approved', 'won', 'lost', 'expired'
);

const orderSource = Joi.string().valid('quote', 'pos', 'online', 'phone', 'import');

const orderStatus = Joi.string().valid(
  'pending', 'order_confirmed', 'processing', 'ready_for_pickup',
  'out_for_delivery', 'order_completed', 'cancelled', 'voided'
);

const paymentStatus = Joi.string().valid('unpaid', 'partial', 'paid', 'refunded', 'overdue');

const deliveryStatus = Joi.string().valid(
  'not_applicable', 'pending', 'scheduled', 'in_transit', 'delivered'
);

const transactionStatus = Joi.string().valid('pending', 'completed', 'voided', 'refunded');

const paymentMethod = Joi.string().valid('cash', 'credit', 'debit', 'gift_card', 'account', 'check', 'other');

const paymentTerms = Joi.string().valid('immediate', 'net_7', 'net_15', 'net_30', 'net_45', 'net_60');

const customerType = Joi.string().valid('Retail', 'Commercial', 'Wholesale', 'VIP');

// ============================================================================
// PAGINATION & SORTING SCHEMAS
// ============================================================================

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(500).default(50),
  sortBy: Joi.string().max(50),
  sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').default('DESC')
});

const dateRangeSchema = Joi.object({
  startDate: isoDateString,
  endDate: isoDateString
});

// ============================================================================
// LINE ITEM SCHEMAS
// ============================================================================

const createLineItemSchema = Joi.object({
  productId: requiredId,
  quantity: quantity.required(),
  unitPriceCents: cents.optional(),
  unitPrice: dollars.optional(), // Support both cents and dollars
  discountPercent: percentage.default(0),
  discountAmountCents: cents.default(0),
  discountAmount: dollars.optional(),
  taxable: Joi.boolean().default(true),
  serialNumber: Joi.string().max(100).optional().allow('', null),
  notes: Joi.string().max(500).optional().allow('', null)
});

const updateLineItemSchema = Joi.object({
  quantity: quantity.optional(),
  unitPriceCents: cents.optional(),
  unitPrice: dollars.optional(),
  discountPercent: percentage.optional(),
  discountAmountCents: cents.optional(),
  discountAmount: dollars.optional(),
  taxable: Joi.boolean().optional(),
  serialNumber: Joi.string().max(100).optional().allow('', null),
  notes: Joi.string().max(500).optional().allow('', null)
}).min(1);

// ============================================================================
// PAYMENT SCHEMAS
// ============================================================================

const createPaymentSchema = Joi.object({
  paymentMethod: paymentMethod.required(),
  amountCents: cents.optional(),
  amount: dollars.optional(), // Support both
  cashTenderedCents: cents.optional(),
  cashTendered: dollars.optional(),
  cardLastFour: Joi.string().pattern(/^\d{4}$/).optional(),
  cardBrand: Joi.string().max(20).optional(),
  authorizationCode: Joi.string().max(50).optional(),
  processorReference: Joi.string().max(100).optional(),
  giftCardNumber: Joi.string().max(30).optional(),
  giftCardPin: Joi.string().max(10).optional()
}).or('amountCents', 'amount');

// ============================================================================
// CUSTOMER SCHEMAS
// ============================================================================

const customerSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  email: email.optional().allow('', null),
  phone: phone.required(),
  company: Joi.string().max(255).optional().allow('', null),
  address: Joi.string().max(500).optional().allow('', null),
  city: Joi.string().max(100).optional().allow('', null),
  province: Joi.string().max(50).optional().allow('', null),
  postalCode: postalCode.optional().allow('', null),
  customerType: customerType.default('Retail'),
  taxNumber: Joi.string().max(100).optional().allow('', null),
  creditLimit: dollars.default(0),
  paymentTerms: paymentTerms.default('immediate'),
  notes: Joi.string().max(2000).optional().allow('', null)
});

const updateCustomerSchema = customerSchema.fork(
  ['name', 'phone'],
  (schema) => schema.optional()
);

// ============================================================================
// QUOTE SCHEMAS
// ============================================================================

const createQuoteSchema = Joi.object({
  customerId: requiredId,
  salesRepId: optionalId,
  salesRepName: Joi.string().max(100).optional(),
  items: Joi.array().items(createLineItemSchema).min(1).required(),
  discountPercent: percentage.default(0),
  discountCents: cents.default(0),
  discountAmount: dollars.optional(),
  taxProvince: taxProvince,
  notes: Joi.string().max(2000).optional().allow('', null),
  internalNotes: Joi.string().max(2000).optional().allow('', null),
  validUntil: isoDateString.optional()
});

const updateQuoteSchema = Joi.object({
  customerId: optionalId,
  salesRepId: optionalId,
  salesRepName: Joi.string().max(100).optional().allow('', null),
  items: Joi.array().items(createLineItemSchema).min(1).optional(),
  discountPercent: percentage.optional(),
  discountCents: cents.optional(),
  discountAmount: dollars.optional(),
  taxProvince: taxProvince.optional(),
  notes: Joi.string().max(2000).optional().allow('', null),
  internalNotes: Joi.string().max(2000).optional().allow('', null),
  validUntil: isoDateString.optional().allow(null)
});

const quoteStatusUpdateSchema = Joi.object({
  status: quoteStatus.required(),
  reason: Joi.string().max(500).optional(),
  notes: Joi.string().max(2000).optional()
});

const quoteQuerySchema = paginationSchema.keys({
  status: Joi.alternatives().try(
    quoteStatus,
    Joi.array().items(quoteStatus)
  ),
  customerId: id.optional(),
  salesRepId: id.optional(),
  search: Joi.string().max(100).optional(),
  requiresApproval: Joi.boolean().optional(),
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional()
});

// ============================================================================
// ORDER SCHEMAS
// ============================================================================

const createOrderSchema = Joi.object({
  source: orderSource.required(),
  sourceId: optionalId,
  sourceReference: Joi.string().max(50).optional(),
  customerId: optionalId,
  items: Joi.array().items(createLineItemSchema).min(1).required(),
  payments: Joi.array().items(createPaymentSchema).optional(),
  discountPercent: percentage.default(0),
  discountCents: cents.default(0),
  discountAmount: dollars.optional(),
  taxProvince: taxProvince,
  shiftId: optionalId,
  registerId: optionalId,
  salesRepId: optionalId,
  notes: Joi.string().max(2000).optional().allow('', null)
});

const updateOrderSchema = Joi.object({
  customerId: optionalId,
  status: orderStatus.optional(),
  paymentStatus: paymentStatus.optional(),
  deliveryStatus: deliveryStatus.optional(),
  notes: Joi.string().max(2000).optional().allow('', null)
}).min(1);

const orderStatusTransitionSchema = Joi.object({
  status: orderStatus.required(),
  reason: Joi.string().max(500).optional(),
  notes: Joi.string().max(2000).optional()
});

const orderQuerySchema = paginationSchema.keys({
  status: Joi.alternatives().try(
    orderStatus,
    Joi.array().items(orderStatus)
  ),
  paymentStatus: Joi.alternatives().try(
    paymentStatus,
    Joi.array().items(paymentStatus)
  ),
  deliveryStatus: Joi.alternatives().try(
    deliveryStatus,
    Joi.array().items(deliveryStatus)
  ),
  source: Joi.alternatives().try(
    orderSource,
    Joi.array().items(orderSource)
  ),
  customerId: id.optional(),
  search: Joi.string().max(100).optional(),
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional()
});

// ============================================================================
// POS TRANSACTION SCHEMAS
// ============================================================================

const createTransactionSchema = Joi.object({
  shiftId: requiredId,
  customerId: optionalId,
  quoteId: optionalId,
  salespersonId: optionalId,
  items: Joi.array().items(
    createLineItemSchema.keys({
      productName: Joi.string().max(255).optional(),
      productSku: Joi.string().max(100).optional()
    })
  ).min(1).required(),
  payments: Joi.array().items(createPaymentSchema).min(1).required(),
  discountAmount: dollars.default(0),
  discountAmountCents: cents.optional(),
  discountReason: Joi.string().max(255).optional().allow('', null),
  taxProvince: taxProvince
});

const voidTransactionSchema = Joi.object({
  reason: Joi.string().min(5).max(500).required()
});

const refundTransactionSchema = Joi.object({
  amountCents: cents.optional(),
  amount: dollars.optional(),
  items: Joi.array().items(
    Joi.object({
      itemId: requiredId,
      quantity: quantity
    })
  ).optional(),
  reason: Joi.string().max(500).optional()
}).or('amountCents', 'amount', 'items');

const transactionQuerySchema = paginationSchema.keys({
  status: Joi.alternatives().try(
    transactionStatus,
    Joi.array().items(transactionStatus)
  ),
  shiftId: id.optional(),
  registerId: id.optional(),
  customerId: id.optional(),
  search: Joi.string().max(100).optional(),
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional()
});

// ============================================================================
// REGISTER & SHIFT SCHEMAS
// ============================================================================

const denominationsSchema = Joi.object({
  bills: Joi.object({
    hundreds: Joi.number().integer().min(0).default(0),
    fifties: Joi.number().integer().min(0).default(0),
    twenties: Joi.number().integer().min(0).default(0),
    tens: Joi.number().integer().min(0).default(0),
    fives: Joi.number().integer().min(0).default(0)
  }).default(),
  coins: Joi.object({
    toonies: Joi.number().integer().min(0).default(0),
    loonies: Joi.number().integer().min(0).default(0),
    quarters: Joi.number().integer().min(0).default(0),
    dimes: Joi.number().integer().min(0).default(0),
    nickels: Joi.number().integer().min(0).default(0),
    pennies: Joi.number().integer().min(0).default(0)
  }).default(),
  rolls: Joi.object({
    toonies: Joi.number().integer().min(0).default(0),
    loonies: Joi.number().integer().min(0).default(0),
    quarters: Joi.number().integer().min(0).default(0),
    dimes: Joi.number().integer().min(0).default(0),
    nickels: Joi.number().integer().min(0).default(0)
  }).optional()
});

const openShiftSchema = Joi.object({
  openingCash: dollars.required(),
  denominations: denominationsSchema.optional()
});

const closeShiftSchema = Joi.object({
  closingCash: dollars.required(),
  denominations: denominationsSchema.optional(),
  blindClose: Joi.boolean().default(false)
});

const createRegisterSchema = Joi.object({
  registerName: Joi.string().min(2).max(100).required(),
  location: Joi.string().max(255).optional().allow('', null)
});

const updateRegisterSchema = Joi.object({
  registerName: Joi.string().min(2).max(100).optional(),
  location: Joi.string().max(255).optional().allow('', null),
  isActive: Joi.boolean().optional()
}).min(1);

// ============================================================================
// VALIDATION MIDDLEWARE FACTORY
// ============================================================================

/**
 * Creates validation middleware for request body, query, or params
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} property - Request property to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details
        },
        meta: { timestamp: new Date().toISOString() }
      });
    }

    // Replace with validated and sanitized values
    req[property] = value;
    next();
  };
};

/**
 * Validate ID parameter
 */
const validateId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = parseInt(req.params[paramName], 10);

    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid ${paramName}: must be a positive integer`
        },
        meta: { timestamp: new Date().toISOString() }
      });
    }

    req.params[paramName] = id;
    next();
  };
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Field schemas
  id,
  optionalId,
  requiredId,
  email,
  phone,
  postalCode,
  cents,
  dollars,
  percentage,
  quantity,
  isoDate,
  isoDateString,

  // Enum schemas
  taxProvince,
  quoteStatus,
  orderSource,
  orderStatus,
  paymentStatus,
  deliveryStatus,
  transactionStatus,
  paymentMethod,
  paymentTerms,
  customerType,

  // Common schemas
  paginationSchema,
  dateRangeSchema,
  denominationsSchema,

  // Line item schemas
  createLineItemSchema,
  updateLineItemSchema,

  // Payment schemas
  createPaymentSchema,

  // Customer schemas
  customerSchema,
  updateCustomerSchema,

  // Quote schemas
  createQuoteSchema,
  updateQuoteSchema,
  quoteStatusUpdateSchema,
  quoteQuerySchema,

  // Order schemas
  createOrderSchema,
  updateOrderSchema,
  orderStatusTransitionSchema,
  orderQuerySchema,

  // Transaction schemas
  createTransactionSchema,
  voidTransactionSchema,
  refundTransactionSchema,
  transactionQuerySchema,

  // Register/Shift schemas
  openShiftSchema,
  closeShiftSchema,
  createRegisterSchema,
  updateRegisterSchema,

  // Middleware
  validate,
  validateId
};
