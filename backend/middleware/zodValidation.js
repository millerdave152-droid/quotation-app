/**
 * Zod Input Validation Middleware
 *
 * PCI DSS compliant request body validation for payment-related endpoints.
 * Uses Zod schemas for strict type checking and constraint enforcement.
 *
 * Usage:
 *   const { validateBody, schemas } = require('../middleware/zodValidation');
 *   router.post('/pay', validateBody(schemas.transactionCreate), handler);
 */

const { z } = require('zod');

// ============================================================================
// SHARED FIELD SCHEMAS
// ============================================================================

/** Positive dollar amount, max $99,999.99 */
const amountField = z.coerce.number()
  .positive('Amount must be positive')
  .max(99999.99, 'Amount must not exceed $99,999.99');

/** Card BIN: 6-8 digits */
const cardBinField = z.string()
  .regex(/^\d{6,8}$/, 'Card BIN must be 6-8 digits');

/** Last four digits of card number */
const lastFourField = z.string()
  .regex(/^\d{4}$/, 'Last four must be exactly 4 digits');

/** Card entry method enum */
const entryMethodField = z.enum([
  'chip', 'tap', 'contactless', 'swipe', 'manual', 'moto', 'ecommerce',
]);

/** Positive integer ID */
const positiveIntId = z.coerce.number().int().positive();

/** Optional positive integer ID */
const optionalPositiveIntId = z.coerce.number().int().positive().optional().nullable();

// ============================================================================
// PAYMENT SCHEMA (shared sub-object)
// ============================================================================

const paymentItemSchema = z.object({
  paymentMethod: z.enum([
    'cash', 'credit', 'debit', 'gift_card', 'etransfer', 'store_credit', 'loyalty_points',
  ]),
  amount: amountField,
  cardLastFour: z.string().regex(/^\d{4}$/).optional().nullable(),
  cardBrand: z.string().max(20).optional().nullable(),
  card_bin: cardBinField.optional().nullable(),
  cardBin: cardBinField.optional().nullable(),
  cardEntryMethod: entryMethodField.optional().nullable(),
  card_entry_method: entryMethodField.optional().nullable(),
  entry_method: entryMethodField.optional().nullable(),
  authorizationCode: z.string().max(50).optional().nullable(),
  processorReference: z.string().max(100).optional().nullable(),
  cashTendered: z.coerce.number().optional().nullable(),
  changeGiven: z.coerce.number().optional().nullable(),
  card_last_four: z.string().regex(/^\d{4}$/).optional().nullable(),
}).passthrough();

// ============================================================================
// TRANSACTION CREATION SCHEMA
// ============================================================================

const transactionCreateSchema = z.object({
  shiftId: positiveIntId,
  customerId: optionalPositiveIntId,
  quoteId: optionalPositiveIntId,
  salespersonId: positiveIntId,

  items: z.array(z.object({
    productId: positiveIntId.nullable(),
    quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
    unitPrice: z.coerce.number(),
    unitCost: z.coerce.number().optional().nullable(),
    discountPercent: z.coerce.number().min(0).max(100).default(0),
    discountAmount: z.coerce.number().min(0).default(0),
    escalationId: optionalPositiveIntId,
    serialNumber: z.string().max(100).optional().nullable(),
    taxable: z.boolean().default(true),
  }).passthrough()).min(1, 'At least one item is required'),

  payments: z.array(paymentItemSchema).min(1, 'At least one payment is required'),

  totalAmount: amountField.optional(),
  total_amount: amountField.optional(),

  discountAmount: z.coerce.number().min(0).default(0),
  discountReason: z.string().max(200).optional().nullable(),
  taxProvince: z.string().length(2).toUpperCase().default('ON'),
  deliveryFee: z.coerce.number().min(0).default(0),

  terminalId: z.union([positiveIntId, z.string().max(50)]).optional().nullable(),
  terminal_id: z.union([positiveIntId, z.string().max(50)]).optional().nullable(),
  locationId: optionalPositiveIntId,
  location_id: optionalPositiveIntId,

  isDeposit: z.boolean().default(false),
  marketingSource: z.string().max(100).optional().nullable(),
  marketingSourceDetail: z.string().max(255).optional().nullable(),
  clientTransactionId: z.string().uuid().optional().nullable(),
  currency: z.string().length(3).default('CAD'),
  category: z.string().max(100).optional().nullable(),
}).passthrough(); // Allow fulfillment, commissionSplit, etc. through

// ============================================================================
// MOTO TRANSACTION SCHEMA
// ============================================================================

const postalCodeRegex = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

const canadianProvinces = [
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
];

/**
 * Luhn algorithm check for credit card number validation.
 * @param {string} num - Digits-only string
 * @returns {boolean}
 */
function luhnCheck(num) {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * Detect card brand from first 1-6 digits of card number.
 * Returns brand string used for CVV length enforcement.
 */
function detectCardBrand(cardNumber) {
  const n = cardNumber.replace(/\D/g, '');
  if (/^3[47]/.test(n)) return 'amex';
  if (/^4/.test(n)) return 'visa';
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'mastercard';
  if (/^6(?:011|5|4[4-9]|22(?:1(?:2[6-9]|[3-9])|[2-8]|9(?:[01]|2[0-5])))/.test(n)) return 'discover';
  return 'unknown';
}

/** Full card number: 13-19 digits, must pass Luhn check */
const cardNumberField = z.string()
  .regex(/^\d{13,19}$/, 'Card number must be 13-19 digits')
  .refine(luhnCheck, { message: 'Card number fails Luhn check — invalid card' });

/** Expiry date: MM/YY format, must be current or future month */
const expiryDateField = z.string()
  .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Expiry must be MM/YY format')
  .refine((val) => {
    const [mm, yy] = val.split('/').map(Number);
    const now = new Date();
    const expYear = 2000 + yy;
    const expMonth = mm;
    // Card is valid through the last day of the expiry month
    return expYear > now.getFullYear() ||
      (expYear === now.getFullYear() && expMonth >= now.getMonth() + 1);
  }, { message: 'Card is expired' });

const billingAddressSchema = z.object({
  streetNumber: z.string().min(1, 'Street number is required').max(20),
  streetName: z.string().min(1, 'Street name is required').max(200),
  city: z.string().min(1, 'City is required').max(100),
  province: z.enum(canadianProvinces, { errorMap: () => ({ message: 'Must be a valid Canadian province code' }) }),
  postalCode: z.string().regex(postalCodeRegex, 'Postal code must be A1A 1A1 format'),
});

const deliveryAddressSchema = z.object({
  streetNumber: z.string().min(1).max(20),
  streetName: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  province: z.enum(canadianProvinces),
  postalCode: z.string().regex(postalCodeRegex, 'Postal code must be A1A 1A1 format'),
}).optional().nullable();

const motoTransactionSchema = transactionCreateSchema.extend({
  // Full card data (MOTO = card-not-present, so we need all fields)
  cardNumber: cardNumberField,
  expiryDate: expiryDateField,
  cvv: z.string().regex(/^\d{3,4}$/, 'CVV must be 3 or 4 digits'),
  cardholderName: z.string().min(2, 'Cardholder name too short').max(100, 'Cardholder name too long'),
  callbackPhone: z.string().regex(/^\d{10,11}$/, 'Callback phone must be 10-11 digits'),

  billingAddress: billingAddressSchema,
  deliveryAddress: deliveryAddressSchema,
  deliveryMethod: z.enum(['delivery', 'pickup', 'ship']).optional(),

  // Fraud override (manager PIN approval for over-limit)
  fraudOverride: z.object({
    logId: z.number().optional(),
    managerId: z.number().optional(),
    managerPin: z.string().optional(),
  }).optional().nullable(),
}).refine((data) => {
  // CVV length must match card brand: 4 for Amex, 3 for all others
  const brand = detectCardBrand(data.cardNumber);
  const expectedLen = brand === 'amex' ? 4 : 3;
  return data.cvv.length === expectedLen;
}, {
  message: 'CVV must be 4 digits for American Express, 3 digits for all other cards',
  path: ['cvv'],
});

// ============================================================================
// REFUND SCHEMA
// ============================================================================

const refundSchema = z.object({
  amount: amountField.optional(),
  items: z.array(z.object({
    itemId: positiveIntId,
    quantity: z.coerce.number().int().min(1),
  })).optional(),
  reason: z.string().min(1).max(500),
  refundAmount: amountField.optional(),
  total_refund_amount: amountField.optional(),
}).refine(
  data => data.amount || data.refundAmount || data.total_refund_amount || (data.items && data.items.length > 0),
  { message: 'Either amount, refundAmount, or items must be provided' }
);

// ============================================================================
// VOID SCHEMA
// ============================================================================

const voidSchema = z.object({
  reason: z.string().min(1, 'Void reason is required').max(500),
  void_reason: z.string().max(500).optional(),
}).passthrough();

// ============================================================================
// MONERIS SCHEMAS
// ============================================================================

const monerisCheckoutSchema = z.object({
  invoiceId: positiveIntId,
  successUrl: z.string().url('Success URL must be a valid URL'),
  cancelUrl: z.string().url('Cancel URL must be a valid URL'),
  allowDeposit: z.boolean().optional(),
  depositPercent: z.coerce.number().min(0).max(100).optional(),
});

const monerisPaymentLinkSchema = z.object({
  quotationId: positiveIntId,
  amountCents: z.coerce.number().int().positive().optional(),
  depositPercent: z.coerce.number().min(0).max(100).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(90).default(7),
});

const monerisRefundSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  transId: z.string().min(1, 'Transaction ID is required'),
  amountCents: z.coerce.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});

// ============================================================================
// QUOTE CONVERSION SCHEMA
// ============================================================================

const quoteConvertSchema = z.object({
  transactionId: positiveIntId.optional().nullable(),
  transactionNumber: z.string().max(50).optional().nullable(),
}).passthrough();

// ============================================================================
// MIDDLEWARE FACTORY
// ============================================================================

/**
 * Creates Express middleware that validates req.body against a Zod schema.
 * On validation failure, returns 400 with structured error details.
 * On success, replaces req.body with the parsed (coerced + defaulted) result.
 *
 * @param {import('zod').ZodSchema} schema - The Zod schema to validate against
 * @returns {Function} Express middleware
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));

      console.error('[ZodValidation] FAILED:', JSON.stringify(errors));

      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Request body validation failed',
        details: errors,
      });
    }

    // Replace body with parsed + coerced values
    req.body = result.data;
    next();
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  validateBody,
  schemas: {
    transactionCreate: transactionCreateSchema,
    motoTransaction: motoTransactionSchema,
    refund: refundSchema,
    void: voidSchema,
    monerisCheckout: monerisCheckoutSchema,
    monerisPaymentLink: monerisPaymentLinkSchema,
    monerisRefund: monerisRefundSchema,
    quoteConvert: quoteConvertSchema,
  },
  // Re-export individual fields for composability
  fields: {
    amountField,
    cardBinField,
    lastFourField,
    entryMethodField,
    positiveIntId,
    optionalPositiveIntId,
    paymentItemSchema,
    cardNumberField,
    expiryDateField,
    billingAddressSchema,
    deliveryAddressSchema,
    canadianProvinces,
  },
  // MOTO helpers
  luhnCheck,
  detectCardBrand,
};
