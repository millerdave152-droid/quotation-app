/**
 * TeleTime POS - Transaction Routes
 * Handles sales transactions, payments, voids, and refunds
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { roundDollars, dollarsToCents, parseDollars } = require('../utils/money');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole, requirePermission } = require('../middleware/auth');
const { fraudCheck } = require('../middleware/fraudCheck');
const { auditLogMiddleware } = require('../middleware/auditLog');
const { paymentLimiter } = require('../middleware/security');
const { validateBody, schemas } = require('../middleware/zodValidation');
const logger = require('../utils/logger');
const miraklService = require('../services/miraklService');

// ============================================================================
// MODULE STATE
// ============================================================================
let pool = null;
let cache = null;
let discountAuthorityService = null;
let commissionService = null;
let serialNumberService = null;

// ============================================================================
// TAX RATES BY PROVINCE
// ============================================================================
const TAX_RATES = {
  ON: { hst: 0.13, gst: 0, pst: 0 },        // Ontario - HST 13%
  BC: { hst: 0, gst: 0.05, pst: 0.07 },     // British Columbia - GST 5% + PST 7%
  AB: { hst: 0, gst: 0.05, pst: 0 },        // Alberta - GST 5% only
  SK: { hst: 0, gst: 0.05, pst: 0.06 },     // Saskatchewan - GST 5% + PST 6%
  MB: { hst: 0, gst: 0.05, pst: 0.07 },     // Manitoba - GST 5% + PST 7%
  QC: { hst: 0, gst: 0.05, pst: 0.09975 },  // Quebec - GST 5% + QST 9.975%
  NB: { hst: 0.15, gst: 0, pst: 0 },        // New Brunswick - HST 15%
  NS: { hst: 0.15, gst: 0, pst: 0 },        // Nova Scotia - HST 15%
  PE: { hst: 0.15, gst: 0, pst: 0 },        // PEI - HST 15%
  NL: { hst: 0.15, gst: 0, pst: 0 },        // Newfoundland - HST 15%
  YT: { hst: 0, gst: 0.05, pst: 0 },        // Yukon - GST 5% only
  NT: { hst: 0, gst: 0.05, pst: 0 },        // NWT - GST 5% only
  NU: { hst: 0, gst: 0.05, pst: 0 },        // Nunavut - GST 5% only
};

// ============================================================================
// INVENTORY HELPER (runs inside caller's transaction)
// ============================================================================

/**
 * Adjust inventory atomically within an existing DB transaction.
 * 1. Updates products.qty_on_hand
 * 2. UPSERTs location_inventory (skipped when locationId is null)
 * 3. Inserts an inventory_transactions audit row
 *
 * @param {object} client - pg client with an active BEGIN
 * @param {object} opts
 * @param {number} opts.productId
 * @param {number} opts.quantity - always positive
 * @param {string} opts.type - 'sale' | 'void' | 'return'
 * @param {number|null} opts.locationId
 * @param {number} opts.transactionId - POS transaction PK
 * @param {string} opts.transactionNumber
 * @param {number} opts.userId
 * @param {string} [opts.reason]
 * @returns {{ oldQty: number, newQty: number }}
 */
async function adjustInventoryInline(client, { productId, quantity, type, locationId, transactionId, transactionNumber, userId, reason }) {
  // delta: negative for sale, positive for void/return
  const delta = type === 'sale' ? -quantity : quantity;

  // 1. Update global stock
  const stockRes = await client.query(
    'UPDATE products SET qty_on_hand = COALESCE(qty_on_hand, 0) + $1 WHERE id = $2 RETURNING qty_on_hand',
    [delta, productId]
  );
  const newQty = stockRes.rows[0]?.qty_on_hand ?? 0;
  const oldQty = newQty - delta;

  // 2. UPSERT location_inventory (skip when no location)
  if (locationId != null) {
    await client.query(
      `INSERT INTO location_inventory (location_id, product_id, quantity_on_hand)
       VALUES ($1, $2, GREATEST(0, $3))
       ON CONFLICT (location_id, product_id)
       DO UPDATE SET quantity_on_hand = location_inventory.quantity_on_hand + $4,
                     updated_at = NOW()`,
      [locationId, productId, delta, delta]
    );
  }

  // 3. Audit row in inventory_transactions
  await client.query(
    `INSERT INTO inventory_transactions
       (product_id, location_id, transaction_type, quantity,
        qty_before, qty_after, reference_type, reference_id, reference_number,
        reason, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'pos_transaction', $7, $8, $9, $10)`,
    [
      productId, locationId, type, quantity,
      oldQty, newQty, transactionId, transactionNumber,
      reason || null, userId
    ]
  );

  return { oldQty, newQty };
}

/**
 * Resolve locationId from a shift's register via register_shifts → registers.
 * Returns null if the register has no location_id.
 */
async function resolveLocationId(client, shiftId) {
  const res = await client.query(
    `SELECT r.location_id
     FROM register_shifts rs
     JOIN registers r ON r.register_id = rs.register_id
     WHERE rs.shift_id = $1`,
    [shiftId]
  );
  return res.rows[0]?.location_id ?? null;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const transactionItemSchema = Joi.object({
  productId: Joi.number().integer().allow(null).required(),
  productName: Joi.string().max(500).optional().allow('', null),
  sku: Joi.string().max(200).optional().allow('', null),
  quantity: Joi.number().integer().min(1).required(),
  unitPrice: Joi.number().precision(2).required(),
  unitCost: Joi.number().precision(2).optional().allow(null),
  discountPercent: Joi.number().min(0).max(100).default(0),
  discountAmount: Joi.number().min(0).default(0),
  escalationId: Joi.number().integer().optional().allow(null),
  serialNumber: Joi.string().max(100).optional().allow('', null),
  taxable: Joi.boolean().default(true)
});

const paymentSchema = Joi.object({
  paymentMethod: Joi.string().valid('cash', 'credit', 'debit', 'gift_card', 'etransfer', 'store_credit', 'loyalty_points').required(),
  amount: Joi.number().precision(2).positive().required(),
  // Allow valid 4-digit card number OR empty/null values
  cardLastFour: Joi.alternatives().try(
    Joi.string().length(4).pattern(/^\d{4}$/),
    Joi.string().valid('', null),
    Joi.valid(null)
  ).optional(),
  cardBrand: Joi.string().max(20).optional().allow('', null),
  authorizationCode: Joi.string().max(50).optional().allow('', null),
  processorReference: Joi.string().max(100).optional().allow('', null),
  cardEntryMethod: Joi.string().max(50).optional().allow('', null),
  cardPresent: Joi.boolean().optional().allow(null),
  cardBin: Joi.string().max(12).optional().allow('', null),
  cashTendered: Joi.number().precision(2).optional().allow(null),
  changeGiven: Joi.number().precision(2).optional().allow(null),
  etransferReference: Joi.string().max(50).optional().allow('', null),
  storeCreditCode: Joi.string().max(20).optional().allow('', null),
  storeCreditId: Joi.number().integer().optional().allow(null),
  storeCreditAmountCents: Joi.number().integer().optional().allow(null),
  loyaltyPointsUsed: Joi.number().integer().optional().allow(null),
  loyaltyCustomerId: Joi.number().integer().optional().allow(null)
});

const tradeInSchema = Joi.object({
  assessmentId: Joi.number().integer().required(),
  creditAmount: Joi.number().precision(2).positive().required()
});

const createTransactionSchema = Joi.object({
  shiftId: Joi.number().integer().required(),
  customerId: Joi.number().integer().optional().allow(null),
  quoteId: Joi.number().integer().optional().allow(null),
  salespersonId: Joi.number().integer().required(),
  items: Joi.array().items(transactionItemSchema).min(1).required(),
  payments: Joi.array().items(paymentSchema).min(1).required(),
  tradeIns: Joi.array().items(tradeInSchema).optional().default([]),
  discountAmount: Joi.number().min(0).default(0),
  discountReason: Joi.string().max(200).optional().allow('', null),
  taxProvince: Joi.string().length(2).uppercase().default('ON'),
  deliveryFee: Joi.number().min(0).default(0),
  fulfillment: Joi.object({
    type: Joi.string().valid('pickup_now', 'pickup_scheduled', 'local_delivery', 'shipping').required(),
    fee: Joi.number().min(0).default(0),
    scheduledDate: Joi.string().allow(null).optional(),
    scheduledTimeStart: Joi.string().allow(null).optional(),
    scheduledTimeEnd: Joi.string().allow(null).optional(),
    address: Joi.object({
      streetNumber: Joi.string().allow('').required(),
      streetName: Joi.string().allow('').required(),
      street: Joi.string().allow('').optional(),
      unit: Joi.string().allow(null, '').optional(),
      buzzer: Joi.string().allow(null, '').optional(),
      city: Joi.string().allow('').required(),
      province: Joi.string().length(2).uppercase().required(),
      postalCode: Joi.string().allow('').required(),
      dwellingType: Joi.string().valid('house', 'townhouse', 'condo', 'apartment', 'commercial').allow(null, '').optional(),
      entryPoint: Joi.string().valid('front_door', 'back_door', 'side_door', 'garage', 'loading_dock', 'concierge').allow(null, '').optional(),
      floorNumber: Joi.string().max(20).allow(null, '').optional(),
    }).when('type', {
      is: Joi.valid('local_delivery', 'shipping'),
      then: Joi.required(),
      otherwise: Joi.optional().allow(null),
    }),
    dwellingType: Joi.string().valid('house', 'townhouse', 'condo', 'apartment', 'commercial').allow(null, '').optional(),
    entryPoint: Joi.string().valid('front_door', 'back_door', 'side_door', 'garage', 'loading_dock', 'concierge').allow(null, '').optional(),
    floorNumber: Joi.string().max(20).allow(null, '').optional(),
    elevatorRequired: Joi.boolean().default(false),
    elevatorDate: Joi.string().allow(null, '').optional(),
    elevatorTime: Joi.string().allow(null, '').optional(),
    conciergePhone: Joi.string().max(20).allow(null, '').optional(),
    conciergeNotes: Joi.string().allow(null, '').optional(),
    accessSteps: Joi.number().integer().min(0).default(0),
    accessNarrowStairs: Joi.boolean().default(false),
    accessHeightRestriction: Joi.number().integer().min(1).allow(null).optional(),
    accessWidthRestriction: Joi.number().integer().min(1).allow(null).optional(),
    accessNotes: Joi.string().allow(null, '').optional(),
    parkingType: Joi.string().valid('driveway', 'street', 'underground', 'parking_lot', 'no_parking').allow(null, '').optional(),
    parkingDistance: Joi.number().integer().min(0).allow(null).optional(),
    parkingNotes: Joi.string().allow(null, '').optional(),
    pathwayConfirmed: Joi.boolean().default(false),
    pathwayNotes: Joi.string().allow(null, '').optional(),
    deliveryDate: Joi.string().allow(null, '').optional(),
    deliveryWindowId: Joi.number().integer().allow(null).optional(),
    deliveryWindowStart: Joi.string().allow(null, '').optional(),
    deliveryWindowEnd: Joi.string().allow(null, '').optional(),
    pickupLocationId: Joi.number().integer().allow(null).optional(),
    pickupDate: Joi.string().allow(null, '').optional(),
    pickupTimePreference: Joi.string().valid('morning', 'afternoon', 'evening').allow(null, '').optional(),
    pickupPersonName: Joi.string().max(255).allow(null, '').optional(),
    pickupPersonPhone: Joi.string().max(20).allow(null, '').optional(),
    pickupVehicleType: Joi.string().valid('car', 'suv', 'truck', 'van', 'other').allow(null, '').optional(),
    pickupVehicleNotes: Joi.string().allow(null, '').optional(),
    zoneId: Joi.number().integer().allow(null).optional(),
    notes: Joi.string().allow(null, '').optional(),
  }).required(),
  promotion: Joi.object().optional().allow(null),
  commissionSplit: Joi.object({
    splits: Joi.array().items(Joi.object({
      userId: Joi.number().integer().required(),
      splitPercentage: Joi.number().min(1).max(100).required(),
      role: Joi.string().valid('primary', 'secondary', 'assist').default('primary'),
    })).min(2).required(),
  }).optional().allow(null),
  isDeposit: Joi.boolean().default(false),
  marketingSource: Joi.string().max(100).optional().allow('', null),
  marketingSourceDetail: Joi.string().max(255).optional().allow('', null),
  clientTransactionId: Joi.string().uuid().optional().allow(null),
});

const voidTransactionSchema = Joi.object({
  reason: Joi.string().min(1).max(500).required()
});

const refundSchema = Joi.object({
  amount: Joi.number().precision(2).positive().optional(),
  items: Joi.array().items(Joi.object({
    itemId: Joi.number().integer().required(),
    quantity: Joi.number().integer().min(1).required()
  })).optional(),
  reason: Joi.string().max(500).optional()
});

const listTransactionsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  dateRange: Joi.string().valid('today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'custom').optional(),
  customerId: Joi.number().integer().optional(),
  status: Joi.string().valid('pending', 'completed', 'voided', 'refunded', 'deposit_paid').optional(),
  shiftId: Joi.number().integer().optional(),
  salesRepId: Joi.number().integer().optional(),
  search: Joi.string().max(100).optional(),
  includeCounts: Joi.boolean().default(true)
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate taxes for a given subtotal and province
 */
function calculateTaxes(subtotal, province = 'ON') {
  const rates = TAX_RATES[province] || TAX_RATES.ON;

  return {
    hstAmount: roundDollars(subtotal * rates.hst),
    gstAmount: roundDollars(subtotal * rates.gst),
    pstAmount: roundDollars(subtotal * rates.pst),
    totalTax: roundDollars(subtotal * (rates.hst + rates.gst + rates.pst))
  };
}

/**
 * Calculate line item totals
 */
function calculateLineItem(item, taxRates) {
  const baseAmount = item.unitPrice * item.quantity;

  // Apply percentage discount first, then flat discount
  let discountAmount = item.discountAmount || 0;
  if (item.discountPercent > 0) {
    discountAmount += baseAmount * (item.discountPercent / 100);
  }

  const afterDiscount = baseAmount - discountAmount;

  // Calculate tax if taxable
  let taxAmount = 0;
  if (item.taxable !== false) {
    const totalRate = taxRates.hst + taxRates.gst + taxRates.pst;
    taxAmount = roundDollars(afterDiscount * totalRate);
  }

  const lineTotal = roundDollars(afterDiscount + taxAmount);

  return {
    discountAmount: roundDollars(discountAmount),
    taxAmount,
    lineTotal
  };
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/transactions
 * Create a new transaction
 */
router.post('/', authenticate, paymentLimiter, validateBody(schemas.transactionCreate), fraudCheck('transaction.create'), auditLogMiddleware('sale', 'transaction'), asyncHandler(async (req, res) => {
  req.log.info({
    userId: req.user?.id,
    username: req.user?.username,
    fulfillment: req.body?.fulfillment,
    paymentsCount: req.body?.payments?.length,
  }, '[Transaction] POST /api/transactions - START');
  const { error, value } = createTransactionSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const validationDetails = error.details.map(d => `${d.path.join('.')}: ${d.message}`);
    console.error('[Transaction JOI] Validation errors:', validationDetails);
    console.error('[Transaction JOI] Item productIds:', req.body.items?.map(i => ({ productId: i.productId, type: typeof i.productId })));
    req.log.error({ validationDetails }, '[Transaction] Validation errors');
    throw ApiError.badRequest('Validation failed: ' + validationDetails.join('; '), validationDetails);
  }

  const {
    shiftId,
    customerId,
    quoteId,
    salespersonId,
    items,
    payments,
    tradeIns,
    discountAmount,
    discountReason,
    taxProvince,
    deliveryFee,
    fulfillment,
    commissionSplit,
    isDeposit,
    marketingSource,
    marketingSourceDetail,
    clientTransactionId,
  } = value;

  // --- Discount Authority Enforcement ---
  if (discountAuthorityService) {
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    const userRole = userResult.rows[0]?.role || 'user';
    const enforcement = await discountAuthorityService.validateTransactionDiscounts({
      items: value.items,
      cartDiscountAmount: value.discountAmount || 0,
      employeeId: req.user.id,
      role: userRole,
    });
    if (!enforcement.valid) {
      throw ApiError.badRequest('Discount validation failed: ' + enforcement.errors.map(e => e.message).join('; '));
    }
    req._discountEnforcementResult = enforcement;
  }

  // Validate dwelling type and entry point are provided for local delivery fulfillment
  if (fulfillment && fulfillment.type === 'local_delivery') {
    const missingFields = [];
    const dwellingType = fulfillment.dwellingType || fulfillment.address?.dwellingType;
    if (!dwellingType) {
      missingFields.push({ field: 'fulfillment.dwellingType', message: 'Dwelling type is required for delivery orders' });
    }
    const entryPoint = fulfillment.entryPoint || fulfillment.address?.entryPoint;
    if (!entryPoint) {
      missingFields.push({ field: 'fulfillment.entryPoint', message: 'Entry point is required for delivery orders' });
    }
    const elevatorRequired = fulfillment.elevatorRequired || fulfillment.address?.elevatorRequired;
    if (elevatorRequired) {
      const elevatorDate = fulfillment.elevatorDate || fulfillment.address?.elevatorDate;
      const elevatorTime = fulfillment.elevatorTime || fulfillment.address?.elevatorTime;
      if (!elevatorDate) {
        missingFields.push({ field: 'fulfillment.elevatorDate', message: 'Elevator booking date is required when elevator booking is enabled' });
      }
      if (!elevatorTime) {
        missingFields.push({ field: 'fulfillment.elevatorTime', message: 'Elevator booking time is required when elevator booking is enabled' });
      }
    }
    const pathwayConfirmed = fulfillment.pathwayConfirmed || fulfillment.address?.pathwayConfirmed;
    if (!pathwayConfirmed) {
      missingFields.push({ field: 'fulfillment.pathwayConfirmed', message: 'Pathway confirmation is required for delivery orders' });
    }
    if (missingFields.length > 0) {
      const details = missingFields.map(f => `${f.field}: ${f.message}`);
      console.error('[Transaction] Delivery validation errors:', details);
      throw ApiError.badRequest('Validation failed: ' + details.join('; '), missingFields);
    }
  }

  // --- Idempotency check for offline replay ---
  if (clientTransactionId) {
    const existing = await pool.query(
      'SELECT transaction_id, transaction_number, created_at, total_amount, status FROM transactions WHERE client_transaction_id = $1',
      [clientTransactionId]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return res.success({
        transactionId: row.transaction_id,
        transactionNumber: row.transaction_number,
        totalAmount: parseDollars(row.total_amount),
        status: row.status,
        createdAt: row.created_at,
        idempotentReplay: true,
      });
    }
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify shift is open
    const shiftResult = await client.query(
      'SELECT shift_id, status FROM register_shifts WHERE shift_id = $1',
      [shiftId]
    );

    if (shiftResult.rows.length === 0) {
      throw ApiError.notFound('Register shift');
    }

    if (shiftResult.rows[0].status !== 'open') {
      throw ApiError.badRequest('Cannot create transaction on a closed shift');
    }

    // Resolve location from register for inventory tracking
    const _saleLocationId = await resolveLocationId(client, shiftId);

    // Get tax rates for province
    const taxRates = TAX_RATES[taxProvince] || TAX_RATES.ON;

    // Fetch product details and calculate line items
    let subtotal = 0;
    let totalTaxAmount = 0;
    const processedItems = [];

    for (const item of items) {
      // Fetch product details - try by ID first, then fall back to SKU/model
      let product = null;

      const productResult = await client.query(
        'SELECT id AS product_id, name, model AS sku, price, cost FROM products WHERE id = $1',
        [item.productId]
      );

      if (productResult.rows.length > 0) {
        product = productResult.rows[0];
      } else if (item.sku) {
        // Fallback: look up by SKU/model (handles ID mismatches from RLS, cache, or data sync)
        const skuResult = await client.query(
          'SELECT id AS product_id, name, model AS sku, price, cost FROM products WHERE model = $1 LIMIT 1',
          [item.sku]
        );
        if (skuResult.rows.length > 0) {
          product = skuResult.rows[0];
          req.log.warn({
            originalProductId: item.productId,
            resolvedProductId: product.product_id,
            sku: item.sku,
          }, '[Transaction] Product not found by ID, resolved by SKU');
        }
      }

      if (!product) {
        // Product not in DB (stale cache, deleted, or data-sync gap).
        // Use cart-provided data so the sale can still complete.
        req.log.warn({
          productId: item.productId,
          sku: item.sku || '(not provided)',
          productName: item.productName || '(not provided)',
        }, '[Transaction] Product not found by ID or SKU — using cart data');

        product = {
          product_id: item.productId,
          name: item.productName || `Unknown Product (${item.productId})`,
          sku: item.sku || `UNKNOWN-${item.productId}`,
          price: item.unitPrice || 0,
          cost: item.unitCost || 0,
          _fromCart: true, // flag to skip inventory adjustment
        };
      }

      // Calculate line item totals
      const lineCalc = calculateLineItem(item, taxRates);

      const baseAmount = item.unitPrice * item.quantity;
      subtotal += baseAmount - lineCalc.discountAmount;
      totalTaxAmount += lineCalc.taxAmount;

      processedItems.push({
        ...item,
        productId: product.product_id,
        productName: product.name,
        productSku: product.sku,
        unitCost: item.unitCost || product.cost,
        _fromCart: product._fromCart || false,
        ...lineCalc
      });
    }

    // Apply transaction-level discount
    const finalSubtotal = subtotal - (discountAmount || 0);

    const effectiveDeliveryFee = deliveryFee || fulfillment?.fee || 0;

    // Calculate EHF (Environmental Handling Fee — taxable, exclude warranties)
    let ehfAmount = 0;
    try {
      const taxEngine = require('../services/TaxEngine');
      const nonWarrantyItems = processedItems.filter(i => {
        const name = (i.productName || '').toLowerCase();
        const sku = (i.productSku || i.sku || '').toLowerCase();
        return !name.includes('warranty') && !name.includes('protection') && !name.includes('guardian')
          && !name.includes('excelsior') && !sku.startsWith('wrn-');
      });
      const ehfResult = taxEngine.calculateCartEHF(nonWarrantyItems.map(i => ({
        name: i.productName, sku: i.productSku, category: '', quantity: i.quantity,
        screen_size_inches: i.screen_size_inches
      })), taxProvince);
      ehfAmount = ehfResult.totalEHF;
    } catch { /* EHF optional */ }

    // Recalculate taxes on subtotal + EHF (EHF is taxable in Ontario)
    const taxes = calculateTaxes(finalSubtotal + ehfAmount, taxProvince);

    const totalAmount = finalSubtotal + ehfAmount + taxes.totalTax + effectiveDeliveryFee;

    // Validate payment total (skip for deposit payments)
    const paymentTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    if (!isDeposit && Math.abs(paymentTotal - totalAmount) > 0.01) {
      throw ApiError.badRequest(
        `Payment total ($${paymentTotal.toFixed(2)}) does not match transaction total ($${totalAmount.toFixed(2)})`
      );
    }
    if (isDeposit && paymentTotal > totalAmount) {
      throw ApiError.badRequest(
        `Deposit ($${paymentTotal.toFixed(2)}) cannot exceed transaction total ($${totalAmount.toFixed(2)})`
      );
    }

    // Generate transaction number using the function
    const txnNumResult = await client.query('SELECT generate_transaction_number() as txn_number');
    const transactionNumber = txnNumResult.rows[0].txn_number;

    // Determine transaction status based on payment type
    const etransferPayment = payments.find(p => p.paymentMethod === 'etransfer');
    const etransferReference = etransferPayment?.etransferReference || null;
    let transactionStatus = 'completed';
    if (isDeposit) {
      transactionStatus = 'deposit_paid';
    } else if (etransferPayment) {
      transactionStatus = 'pending';
    }

    // Insert transaction
    const depositAmount = isDeposit ? paymentTotal : null;
    const balanceDue = isDeposit ? roundDollars(totalAmount - paymentTotal) : null;

    // Calculate completed_at timestamp
    const completedAt = transactionStatus === 'completed' ? new Date() : null;

    // DEBUG: Log the transaction INSERT
    const txQuery = `INSERT INTO transactions (
        transaction_number, shift_id, customer_id, quote_id, user_id, salesperson_id,
        subtotal, discount_amount, discount_reason,
        hst_amount, gst_amount, pst_amount, tax_province,
        total_amount, status, completed_at,
        etransfer_reference, etransfer_status,
        is_deposit, deposit_amount, balance_due,
        marketing_source, marketing_source_detail,
        client_transaction_id,
        subtotal_cents, discount_amount_cents,
        hst_amount_cents, gst_amount_cents, pst_amount_cents,
        total_amount_cents, deposit_amount_cents, balance_due_cents,
        environmental_fee
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
        $25, $26, $27, $28, $29, $30, $31, $32, $33)
      RETURNING transaction_id, transaction_number, created_at`;
    const txParams = [
        transactionNumber,
        shiftId,
        customerId || null,
        quoteId || null,
        req.user.id,
        salespersonId,
        finalSubtotal,
        discountAmount || 0,
        discountReason || null,
        taxes.hstAmount,
        taxes.gstAmount,
        taxes.pstAmount,
        taxProvince,
        totalAmount,
        transactionStatus,
        completedAt,
        etransferReference,
        etransferPayment ? 'pending' : null,
        isDeposit || false,
        depositAmount,
        balanceDue,
        marketingSource || null,
        marketingSourceDetail || null,
        clientTransactionId || null,
        dollarsToCents(finalSubtotal),
        dollarsToCents(discountAmount || 0),
        dollarsToCents(taxes.hstAmount),
        dollarsToCents(taxes.gstAmount),
        dollarsToCents(taxes.pstAmount),
        dollarsToCents(totalAmount),
        depositAmount != null ? dollarsToCents(depositAmount) : null,
        balanceDue != null ? dollarsToCents(balanceDue) : null,
        ehfAmount
      ];
    const transactionResult = await client.query(txQuery, txParams);
    const transaction = transactionResult.rows[0];

    // TODO [Tax Engine Integration]: After transaction INSERT, call taxEngineService
    // to persist a province-aware breakdown in transaction_tax_breakdown:
    //
    //   await taxEngineService.calculateTax({
    //     subtotalCents: dollarsToCents(finalSubtotal),
    //     provinceCode: taxProvince,
    //     customerId: customerId || null,
    //     transactionId: transaction.transaction_id,
    //     transactionType: 'pos_sale',
    //   });
    //
    // This replaces the hardcoded TAX_RATES object above with DB-driven rates
    // and adds exemption certificate support. Wire up once migration 168 is live.

    // Insert transaction items
    const _inventoryQueue = [];
    for (const item of processedItems) {
      await client.query(
        `INSERT INTO transaction_items (
          transaction_id, product_id, product_name, product_sku,
          quantity, unit_price, unit_cost,
          discount_percent, discount_amount, tax_amount, line_total,
          serial_number, taxable,
          unit_price_cents, unit_cost_cents, discount_amount_cents, tax_amount_cents, line_total_cents
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          transaction.transaction_id,
          item._fromCart ? null : item.productId,
          item.productName,
          item.productSku,
          item.quantity,
          item.unitPrice,
          item.unitCost,
          item.discountPercent || 0,
          item.discountAmount,
          item.taxAmount,
          item.lineTotal,
          item.serialNumber || null,
          item.taxable !== false,
          dollarsToCents(item.unitPrice),
          item.unitCost != null ? dollarsToCents(item.unitCost) : null,
          dollarsToCents(item.discountAmount),
          dollarsToCents(item.taxAmount),
          dollarsToCents(item.lineTotal)
        ]
      );

      // Update inventory (global + location + audit) — skip for cart-only items
      if (!item._fromCart) {
        const { oldQty: _oldQty, newQty: _newQty } = await adjustInventoryInline(client, {
          productId: item.productId,
          quantity: item.quantity,
          type: 'sale',
          locationId: _saleLocationId,
          transactionId: transaction.transaction_id,
          transactionNumber: transaction.transaction_number,
          userId: req.user.id,
        });
        _inventoryQueue.push({ productId: item.productId, sku: item.productSku, oldQty: _oldQty, newQty: _newQty, source: 'POS_SALE' });
      }
    }

    // Insert payments
    for (const payment of payments) {
      const paymentStatus = payment.paymentMethod === 'etransfer' ? 'pending' : 'completed';
      await client.query(
        `INSERT INTO payments (
          transaction_id, payment_method, amount,
          card_last_four, card_brand, authorization_code, processor_reference,
          cash_tendered, change_given, status,
          amount_cents, cash_tendered_cents, change_given_cents,
          card_entry_method, card_present, card_bin
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          transaction.transaction_id,
          payment.paymentMethod,
          payment.amount,
          payment.cardLastFour || null,
          payment.cardBrand || null,
          payment.authorizationCode || null,
          payment.processorReference || null,
          payment.cashTendered || null,
          payment.changeGiven || null,
          paymentStatus,
          dollarsToCents(payment.amount),
          payment.cashTendered != null ? dollarsToCents(payment.cashTendered) : null,
          payment.changeGiven != null ? dollarsToCents(payment.changeGiven) : null,
          payment.cardEntryMethod || null,
          payment.cardPresent != null ? payment.cardPresent : true,
          payment.cardBin || null
        ]
      );
    }

    // Redeem store credits
    for (const payment of payments) {
      if (payment.paymentMethod === 'store_credit' && payment.storeCreditId && payment.storeCreditAmountCents) {
        const creditResult = await client.query(
          'SELECT id, current_balance, status FROM store_credits WHERE id = $1 FOR UPDATE',
          [payment.storeCreditId]
        );
        if (creditResult.rows.length > 0) {
          const sc = creditResult.rows[0];
          const redeemCents = payment.storeCreditAmountCents;
          const newBalance = sc.current_balance - redeemCents;
          const newStatus = newBalance <= 0 ? 'depleted' : 'active';
          await client.query(
            'UPDATE store_credits SET current_balance = $1, status = $2, updated_at = NOW() WHERE id = $3',
            [Math.max(newBalance, 0), newStatus, sc.id]
          );
          await client.query(
            `INSERT INTO store_credit_transactions (store_credit_id, transaction_id, amount_cents, transaction_type, balance_after, performed_by)
             VALUES ($1, $2, $3, 'redeem', $4, $5)`,
            [sc.id, transaction.transaction_id, -redeemCents, Math.max(newBalance, 0), req.user.id]
          );
        }
      }
    }

    // Redeem loyalty points
    for (const payment of payments) {
      if (payment.paymentMethod === 'loyalty_points' && payment.loyaltyPointsUsed && payment.loyaltyCustomerId) {
        const loyaltyResult = await client.query(
          'SELECT customer_id, points_balance FROM customer_loyalty WHERE customer_id = $1 FOR UPDATE',
          [payment.loyaltyCustomerId]
        );

        if (loyaltyResult.rows.length === 0) {
          throw ApiError.badRequest('Customer has no loyalty account');
        }

        const loyalty = loyaltyResult.rows[0];
        if (payment.loyaltyPointsUsed > loyalty.points_balance) {
          throw ApiError.badRequest(`Insufficient loyalty points. Available: ${loyalty.points_balance}, Requested: ${payment.loyaltyPointsUsed}`);
        }

        const newBalance = loyalty.points_balance - payment.loyaltyPointsUsed;

        await client.query(
          'UPDATE customer_loyalty SET points_balance = $1, updated_at = NOW() WHERE customer_id = $2',
          [newBalance, payment.loyaltyCustomerId]
        );

        await client.query(
          `INSERT INTO loyalty_transactions (
            customer_id, points, transaction_type, order_id, balance_after, description, performed_by
          ) VALUES ($1, $2, 'redeem', $3, $4, $5, $6)`,
          [
            payment.loyaltyCustomerId,
            -payment.loyaltyPointsUsed,
            orderId || null,
            newBalance,
            `Redeemed ${payment.loyaltyPointsUsed} points on POS transaction ${transaction.transaction_number}`,
            req.user.id,
          ]
        );
      }
    }

    // Insert fulfillment record
    if (fulfillment) {
      // Helper to ensure string or null (prevents boolean/number type issues)
      const toStringOrNull = (val) => val != null && val !== '' ? String(val) : null;
      const toIntOrNull = (val) => val != null ? parseInt(val, 10) || null : null;
      const toBool = (val) => Boolean(val);

      const dwellingType = toStringOrNull(fulfillment.dwellingType || fulfillment.address?.dwellingType);
      const entryPoint = toStringOrNull(fulfillment.entryPoint || fulfillment.address?.entryPoint);
      const floorNumber = toStringOrNull(fulfillment.floorNumber ?? fulfillment.address?.floorNumber);
      const elevatorRequired = toBool(fulfillment.elevatorRequired || fulfillment.address?.elevatorRequired);
      const elevatorDate = toStringOrNull(fulfillment.elevatorDate || fulfillment.address?.elevatorDate);
      const elevatorTime = toStringOrNull(fulfillment.elevatorTime || fulfillment.address?.elevatorTime);
      const conciergePhone = toStringOrNull(fulfillment.conciergePhone || fulfillment.address?.conciergePhone);
      const conciergeNotes = toStringOrNull(fulfillment.conciergeNotes || fulfillment.address?.conciergeNotes);
      const accessSteps = toIntOrNull(fulfillment.accessSteps ?? fulfillment.address?.accessSteps) || 0;
      const accessNarrowStairs = toBool(fulfillment.accessNarrowStairs || fulfillment.address?.accessNarrowStairs);
      const accessHeightRestriction = toIntOrNull(fulfillment.accessHeightRestriction || fulfillment.address?.accessHeightRestriction);
      const accessWidthRestriction = toIntOrNull(fulfillment.accessWidthRestriction || fulfillment.address?.accessWidthRestriction);
      const accessNotes = toStringOrNull(fulfillment.accessNotes || fulfillment.address?.accessNotes);
      const parkingType = toStringOrNull(fulfillment.parkingType || fulfillment.address?.parkingType);
      const parkingDistance = toIntOrNull(fulfillment.parkingDistance ?? fulfillment.address?.parkingDistance);
      const parkingNotes = toStringOrNull(fulfillment.parkingNotes || fulfillment.address?.parkingNotes);
      const pathwayConfirmed = toBool(fulfillment.pathwayConfirmed || fulfillment.address?.pathwayConfirmed);
      const pathwayNotes = toStringOrNull(fulfillment.pathwayNotes || fulfillment.address?.pathwayNotes);
      const deliveryDate = toStringOrNull(fulfillment.deliveryDate || fulfillment.address?.deliveryDate);
      const deliveryWindowId = toIntOrNull(fulfillment.deliveryWindowId ?? fulfillment.address?.deliveryWindowId);
      const deliveryWindowStart = toStringOrNull(fulfillment.deliveryWindowStart || fulfillment.address?.deliveryWindowStart);
      const deliveryWindowEnd = toStringOrNull(fulfillment.deliveryWindowEnd || fulfillment.address?.deliveryWindowEnd);
      const pickupLocationId = toIntOrNull(fulfillment.pickupLocationId);
      const pickupDate = toStringOrNull(fulfillment.pickupDate);
      const pickupTimePreference = toStringOrNull(fulfillment.pickupTimePreference);
      const pickupPersonName = toStringOrNull(fulfillment.pickupPersonName);
      const pickupPersonPhone = toStringOrNull(fulfillment.pickupPersonPhone);
      const pickupVehicleType = toStringOrNull(fulfillment.pickupVehicleType);
      const pickupVehicleNotes = toStringOrNull(fulfillment.pickupVehicleNotes);

      // DEBUG: Log the fulfillment INSERT
      // Use explicit type casts for nullable parameters to avoid PostgreSQL type inference issues
      const fulfillmentQuery = `INSERT INTO order_fulfillment (
          transaction_id, fulfillment_type, delivery_zone_id,
          scheduled_date, scheduled_time_start, scheduled_time_end,
          delivery_address, delivery_fee, dwelling_type, entry_point, floor_number,
          elevator_booking_required, elevator_booking_date, elevator_booking_time,
          concierge_phone, concierge_notes,
          access_steps, access_narrow_stairs, access_height_restriction, access_width_restriction, access_notes,
          parking_type, parking_distance, parking_notes,
          pathway_confirmed, pathway_notes,
          delivery_date, delivery_window_start, delivery_window_end, delivery_window_id,
          pickup_location_id, pickup_date, pickup_time_preference,
          pickup_person_name, pickup_person_phone, pickup_vehicle_type, pickup_vehicle_notes,
          customer_notes, created_by
        ) VALUES (
          $1, $2::fulfillment_option_type, $3,
          $4::date, $5::time, $6::time,
          $7::jsonb, $8, $9::dwelling_type, $10::varchar, $11::varchar,
          $12::boolean, $13::date, $14::time,
          $15::varchar, $16::text,
          $17::integer, $18::boolean, $19::integer, $20::integer, $21::text,
          $22::varchar, $23::integer, $24::text,
          $25::boolean, $26::text,
          $27::date, $28::time, $29::time, $30::integer,
          $31::integer, $32::date, $33::varchar,
          $34::varchar, $35::varchar, $36::varchar, $37::text,
          $38::text, $39::integer
        )`;
      const fulfillmentParams = [
          transaction.transaction_id,
          fulfillment.type,
          fulfillment.zoneId || null,
          fulfillment.scheduledDate || null,
          fulfillment.scheduledTimeStart || null,
          fulfillment.scheduledTimeEnd || null,
          fulfillment.address ? JSON.stringify(fulfillment.address) : null,
          effectiveDeliveryFee,
          dwellingType,
          entryPoint,
          floorNumber,
          elevatorRequired,
          elevatorDate,
          elevatorTime,
          conciergePhone,
          conciergeNotes,
          accessSteps,
          accessNarrowStairs,
          accessHeightRestriction,
          accessWidthRestriction,
          accessNotes,
          parkingType,
          parkingDistance,
          parkingNotes,
          pathwayConfirmed,
          pathwayNotes,
          deliveryDate,
          deliveryWindowStart,
          deliveryWindowEnd,
          deliveryWindowId,
          pickupLocationId,
          pickupDate,
          pickupTimePreference,
          pickupPersonName,
          pickupPersonPhone,
          pickupVehicleType,
          pickupVehicleNotes,
          fulfillment.notes || null,
          req.user.id,
        ];

      await client.query(fulfillmentQuery, fulfillmentParams);
    }

    // Process trade-ins if present
    let totalTradeInCredit = 0;
    if (tradeIns && tradeIns.length > 0) {
      for (const tradeIn of tradeIns) {
        // Verify trade-in assessment exists and is valid
        const assessmentResult = await client.query(
          `SELECT id, status, final_value FROM trade_in_assessments
           WHERE id = $1 AND status IN ('pending', 'approved')`,
          [tradeIn.assessmentId]
        );

        if (assessmentResult.rows.length === 0) {
          throw ApiError.badRequest(`Trade-in assessment ${tradeIn.assessmentId} not found or not in valid state`);
        }

        const assessment = assessmentResult.rows[0];
        totalTradeInCredit += tradeIn.creditAmount;

        // Link trade-in to transaction and update status to 'applied'
        await client.query(
          `UPDATE trade_in_assessments
           SET transaction_id = $1,
               status = 'applied',
               status_changed_at = NOW(),
               status_changed_by = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [transaction.transaction_id, req.user.id, tradeIn.assessmentId]
        );
      }
    }

    // If converted from quote, update quote status
    if (quoteId) {
      await client.query(
        "UPDATE quotations SET status = 'converted', updated_at = NOW() WHERE id = $1",
        [quoteId]
      );
    }

    // Insert commission splits if provided
    if (commissionSplit?.splits?.length > 0) {
      const totalPct = commissionSplit.splits.reduce((s, sp) => s + Number(sp.splitPercentage), 0);
      if (Math.abs(totalPct - 100) <= 0.01) {
        // Estimate commission at 3% for now; actual calculation happens via commission service
        const estimatedCommissionCents = dollarsToCents(totalAmount * 0.03);
        let remainderCents = estimatedCommissionCents;

        for (let i = 0; i < commissionSplit.splits.length; i++) {
          const sp = commissionSplit.splits[i];
          const commCents = i === commissionSplit.splits.length - 1
            ? remainderCents
            : Math.round(estimatedCommissionCents * (Number(sp.splitPercentage) / 100));
          remainderCents -= commCents;

          await client.query(
            `INSERT INTO order_commission_splits
              (transaction_id, user_id, split_percentage, commission_amount_cents, role, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')`,
            [transaction.transaction_id, sp.userId, sp.splitPercentage, commCents, sp.role || (i === 0 ? 'primary' : 'secondary')]
          );
        }
      }
    }

    await client.query('COMMIT');

    // Sync serial numbers to product_serials registry (after commit, non-blocking)
    if (serialNumberService && transactionStatus === 'completed') {
      let serialWarning = false;
      for (const item of processedItems) {
        if (!item.serialNumber) continue;
        try {
          await serialNumberService.markAsSold(
            item.serialNumber,
            transaction.transaction_id,
            customerId || null,
            req.user.id
          );
          req.log.info({ serial: item.serialNumber, transactionId: transaction.transaction_id }, '[Transaction] Serial marked as sold');
        } catch (serialErr) {
          serialWarning = true;
          req.log.error({ err: serialErr, serial: item.serialNumber, transactionId: transaction.transaction_id },
            '[Transaction] Serial sync failed (non-fatal)');
        }
      }
      if (serialWarning) {
        try {
          await pool.query(
            'UPDATE transactions SET serial_sync_warning = true WHERE transaction_id = $1',
            [transaction.transaction_id]
          );
          req.log.warn({ transactionId: transaction.transaction_id }, '[Transaction] Serial sync warning flagged');
        } catch (flagErr) {
          req.log.error({ err: flagErr }, '[Transaction] Failed to flag serial_sync_warning');
        }
      }
    }

    // Mark approved escalations as used (after commit so transaction ID is final)
    if (req._discountEnforcementResult?.itemEscalations) {
      for (const mapping of req._discountEnforcementResult.itemEscalations) {
        if (mapping.escalationId) {
          try {
            await discountAuthorityService.markEscalationUsed(mapping.escalationId, transaction.transaction_id);
          } catch (escErr) {
            req.log.error({ err: escErr }, '[Transaction] Failed to mark escalation used');
          }
        }
      }
    }

    // Queue marketplace inventory changes (non-blocking, after commit)
    for (const qi of _inventoryQueue) {
      try {
        await miraklService.queueInventoryChange(qi.productId, qi.sku, qi.oldQty, qi.newQty, qi.source);
      } catch (queueErr) {
        req.log.error({ err: queueErr }, '[MarketplaceQueue] POS_SALE queue error');
      }
    }

    // Auto-record commission for completed transactions
    if (transactionStatus === 'completed' && commissionService) {
      try {
        await commissionService.recordCommission(transaction.transaction_id, salespersonId);
        req.log.info({ transactionId: transaction.transaction_id, salespersonId }, '[Transaction] Commission recorded');
      } catch (commErr) {
        // Commission failure should not break the sale
        req.log.error({ err: commErr }, '[Transaction] Commission recording failed (non-fatal)');
      }
    }

    // Capture evidence snapshot for chargeback defense (non-blocking)
    if (transactionStatus === 'completed') {
      const fraudService = req.app.get('fraudService');
      if (fraudService) {
        fraudService.captureEvidenceSnapshot(transaction.transaction_id, {
          transaction_number: transaction.transaction_number,
          user_id: req.user.id,
          shift_id: shiftId,
          customer_id: customerId,
          payments,
          items: processedItems,
          total_amount: totalAmount,
        }).catch(err => req.log.error({ err }, '[Transaction] Evidence snapshot error'));
      }
    }

    // Invalidate relevant caches
    if (cache) {
      cache.invalidatePattern('transactions:');
      cache.invalidatePattern('products:');
      if (quoteId) {
        cache.invalidatePattern('quotes:');
      }
      // Invalidate walk-in customer context card cache
      if (customerId) {
        cache.del('short', `customer_context:${customerId}`);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        transactionId: transaction.transaction_id,
        transactionNumber: transaction.transaction_number,
        createdAt: transaction.created_at,
        totals: {
          subtotal: finalSubtotal,
          discountAmount: discountAmount || 0,
          hstAmount: taxes.hstAmount,
          gstAmount: taxes.gstAmount,
          pstAmount: taxes.pstAmount,
          totalTax: taxes.totalTax,
          totalAmount,
          tradeInCredit: totalTradeInCredit,
          amountDue: Math.max(0, totalAmount - totalTradeInCredit)
        },
        tradeIns: tradeIns && tradeIns.length > 0 ? {
          count: tradeIns.length,
          totalCredit: totalTradeInCredit,
          assessmentIds: tradeIns.map(ti => ti.assessmentId)
        } : null,
        deposit: isDeposit ? {
          isDeposit: true,
          depositAmount: paymentTotal,
          balanceDue,
          status: 'deposit_paid',
        } : null,
        status: transactionStatus,
        fulfillmentType: fulfillment?.type || 'pickup_now',
        deliveryAddress: fulfillment?.address?.street || fulfillment?.deliveryAddress || null,
        fraudAssessment: req.fraudAssessment || null,
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    req.log.error({ err }, '[Transaction] CREATE ERROR');
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/transactions
 * List transactions with filtering, pagination, and status counts
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = listTransactionsSchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    throw ApiError.badRequest('Validation failed');
  }

  const { page, limit, startDate, endDate, dateRange, customerId, status, shiftId, salesRepId, search, includeCounts } = value;
  const offset = (page - 1) * limit;

  // Build base WHERE clause (excludes status filter for counting)
  let baseWhereClause = 'WHERE 1=1';
  const baseParams = [];
  let paramIndex = 1;

  // Handle dateRange presets
  let effectiveStartDate = startDate;
  let effectiveEndDate = endDate;

  if (dateRange && dateRange !== 'custom') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (dateRange) {
      case 'today':
        effectiveStartDate = today;
        effectiveEndDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
        break;
      case 'yesterday':
        effectiveStartDate = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        effectiveEndDate = new Date(today.getTime() - 1);
        break;
      case 'this_week':
        const dayOfWeek = today.getDay();
        const startOfWeek = new Date(today.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
        effectiveStartDate = startOfWeek;
        effectiveEndDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
        break;
      case 'last_week':
        const lastWeekStart = new Date(today.getTime() - (today.getDay() + 7) * 24 * 60 * 60 * 1000);
        const lastWeekEnd = new Date(lastWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
        effectiveStartDate = lastWeekStart;
        effectiveEndDate = lastWeekEnd;
        break;
      case 'this_month':
        effectiveStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
        effectiveEndDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
        break;
      case 'last_month':
        effectiveStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        effectiveEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
    }
  }

  if (effectiveStartDate) {
    baseWhereClause += ` AND t.created_at >= $${paramIndex}`;
    baseParams.push(effectiveStartDate);
    paramIndex++;
  }

  if (effectiveEndDate) {
    baseWhereClause += ` AND t.created_at <= $${paramIndex}`;
    baseParams.push(effectiveEndDate);
    paramIndex++;
  }

  if (customerId) {
    baseWhereClause += ` AND t.customer_id = $${paramIndex}`;
    baseParams.push(customerId);
    paramIndex++;
  }

  if (shiftId) {
    baseWhereClause += ` AND t.shift_id = $${paramIndex}`;
    baseParams.push(shiftId);
    paramIndex++;
  }

  if (salesRepId) {
    baseWhereClause += ` AND (t.salesperson_id = $${paramIndex} OR t.user_id = $${paramIndex})`;
    baseParams.push(salesRepId);
    paramIndex++;
  }

  if (search) {
    baseWhereClause += ` AND (
      t.transaction_number ILIKE $${paramIndex}
      OR c.name ILIKE $${paramIndex}
      OR c.phone ILIKE $${paramIndex}
    )`;
    baseParams.push(`%${search}%`);
    paramIndex++;
  }

  // Build full WHERE clause (includes status filter for actual results)
  let fullWhereClause = baseWhereClause;
  const fullParams = [...baseParams];

  if (status) {
    fullWhereClause += ` AND t.status = $${paramIndex}`;
    fullParams.push(status);
    paramIndex++;
  }

  // Get status counts (using base filters WITHOUT status filter)
  // This allows users to see counts for all statuses regardless of which they're viewing
  let counts = null;
  if (includeCounts) {
    const countsResult = await pool.query(
      `SELECT
        t.status,
        COUNT(*) as count
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      ${baseWhereClause}
      GROUP BY t.status`,
      baseParams
    );

    // Initialize counts object with all statuses at 0
    counts = {
      all: 0,
      pending: 0,
      completed: 0,
      voided: 0,
      refunded: 0
    };

    // Populate from query results
    countsResult.rows.forEach(row => {
      const statusCount = parseInt(row.count, 10);
      counts[row.status] = statusCount;
      counts.all += statusCount;
    });
  }

  // Count total for pagination (with status filter applied)
  const countResult = await pool.query(
    `SELECT COUNT(*) as total
     FROM transactions t
     LEFT JOIN customers c ON t.customer_id = c.id
     ${fullWhereClause}`,
    fullParams
  );
  const total = parseInt(countResult.rows[0].total, 10);

  // Get transactions with customer name and item count
  const result = await pool.query(
    `SELECT
      t.transaction_id,
      t.transaction_number,
      t.customer_id,
      c.name as customer_name,
      t.subtotal,
      t.discount_amount,
      t.total_amount,
      t.status,
      t.created_at,
      t.completed_at,
      (SELECT COUNT(*) FROM transaction_items ti WHERE ti.transaction_id = t.transaction_id) as item_count,
      u.first_name || ' ' || u.last_name as cashier_name,
      sp.first_name || ' ' || sp.last_name as salesperson_name
    FROM transactions t
    LEFT JOIN customers c ON t.customer_id = c.id
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN users sp ON t.salesperson_id = sp.id
    ${fullWhereClause}
    ORDER BY t.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...fullParams, limit, offset]
  );

  res.json({
    success: true,
    data: result.rows.map(row => ({
      transactionId: row.transaction_id,
      transactionNumber: row.transaction_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      subtotal: parseDollars(row.subtotal),
      discountAmount: parseDollars(row.discount_amount),
      totalAmount: parseDollars(row.total_amount),
      status: row.status,
      itemCount: parseInt(row.item_count, 10),
      cashierName: row.cashier_name,
      salespersonName: row.salesperson_name,
      createdAt: row.created_at,
      completedAt: row.completed_at
    })),
    counts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + result.rows.length < total
    }
  });
}));

/**
 * GET /api/transactions/daily-summary
 * Get daily summary for a register shift
 */
router.get('/daily-summary', authenticate, asyncHandler(async (req, res) => {
  const { shiftId, date } = req.query;

  if (!shiftId && !date) {
    throw ApiError.badRequest('Either shiftId or date parameter is required');
  }

  let whereClause = '';
  const params = [];

  if (shiftId) {
    whereClause = 't.shift_id = $1';
    params.push(shiftId);
  } else {
    whereClause = 'DATE(t.created_at) = $1';
    params.push(date);
  }

  // Get summary statistics
  const summaryResult = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE t.status = 'completed') as transaction_count,
      COUNT(*) FILTER (WHERE t.status = 'voided') as void_count,
      COUNT(*) FILTER (WHERE t.status = 'refunded') as refund_count,
      COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) as total_sales,
      COALESCE(SUM(t.subtotal) FILTER (WHERE t.status = 'completed'), 0) as subtotal,
      COALESCE(SUM(t.discount_amount) FILTER (WHERE t.status = 'completed'), 0) as total_discounts,
      COALESCE(SUM(t.hst_amount + t.gst_amount + t.pst_amount) FILTER (WHERE t.status = 'completed'), 0) as total_tax
    FROM transactions t
    WHERE ${whereClause}`,
    params
  );

  // Get payment breakdown
  const paymentResult = await pool.query(
    `SELECT
      p.payment_method,
      COUNT(*) as count,
      SUM(p.amount) as total
    FROM payments p
    JOIN transactions t ON p.transaction_id = t.transaction_id
    WHERE ${whereClause} AND t.status = 'completed' AND p.status = 'completed'
    GROUP BY p.payment_method`,
    params
  );

  const summary = summaryResult.rows[0];
  const paymentBreakdown = {};

  paymentResult.rows.forEach(row => {
    paymentBreakdown[row.payment_method] = {
      count: parseInt(row.count, 10),
      total: parseDollars(row.total)
    };
  });

  res.json({
    success: true,
    data: {
      transactionCount: parseInt(summary.transaction_count, 10),
      voidCount: parseInt(summary.void_count, 10),
      refundCount: parseInt(summary.refund_count, 10),
      totalSales: parseDollars(summary.total_sales),
      subtotal: parseDollars(summary.subtotal),
      totalDiscounts: parseDollars(summary.total_discounts),
      totalTax: parseDollars(summary.total_tax),
      paymentBreakdown
    }
  });
}));

/**
 * GET /api/transactions/:id
 * Get full transaction details with items and payments
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Get transaction
  const transactionResult = await pool.query(
    `SELECT
      t.*,
      c.name as customer_name,
      c.email as customer_email,
      c.phone as customer_phone,
      u.first_name || ' ' || u.last_name as cashier_name,
      sp.first_name || ' ' || sp.last_name as salesperson_name,
      vb.first_name || ' ' || vb.last_name as voided_by_name,
      r.register_name,
      q.quote_number
    FROM transactions t
    LEFT JOIN customers c ON t.customer_id = c.id
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN users sp ON t.salesperson_id = sp.id
    LEFT JOIN users vb ON t.voided_by = vb.user_id
    LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
    LEFT JOIN registers r ON rs.register_id = r.register_id
    LEFT JOIN quotations q ON t.quote_id = q.id
    WHERE t.transaction_id = $1`,
    [id]
  );

  if (transactionResult.rows.length === 0) {
    throw ApiError.notFound('Transaction');
  }

  const transaction = transactionResult.rows[0];

  // Get items
  const itemsResult = await pool.query(
    `SELECT
      item_id,
      product_id,
      product_name,
      product_sku,
      quantity,
      unit_price,
      unit_cost,
      discount_percent,
      discount_amount,
      tax_amount,
      line_total,
      serial_number,
      taxable
    FROM transaction_items
    WHERE transaction_id = $1
    ORDER BY item_id`,
    [id]
  );

  // Get payments
  const paymentsResult = await pool.query(
    `SELECT
      payment_id,
      payment_method,
      amount,
      card_last_four,
      card_brand,
      authorization_code,
      processor_reference,
      cash_tendered,
      change_given,
      status,
      processed_at
    FROM payments
    WHERE transaction_id = $1
    ORDER BY processed_at`,
    [id]
  );

  // Get trade-ins linked to this transaction
  const tradeInsResult = await pool.query(
    `SELECT
      tia.id as assessment_id,
      tia.serial_number,
      tia.imei,
      tia.final_value,
      tia.condition_notes,
      tia.status,
      tia.assessed_at,
      COALESCE(tip.brand, tia.custom_brand) as brand,
      COALESCE(tip.model, tia.custom_model) as model,
      tip.variant,
      tic.name as category_name,
      ticond.condition_name
    FROM trade_in_assessments tia
    LEFT JOIN trade_in_products tip ON tia.trade_in_product_id = tip.id
    LEFT JOIN trade_in_categories tic ON tia.category_id = tic.id
    LEFT JOIN trade_in_conditions ticond ON tia.condition_id = ticond.id
    WHERE tia.transaction_id = $1
    ORDER BY tia.assessed_at`,
    [id]
  );

  const tradeInTotal = tradeInsResult.rows.reduce((sum, ti) => sum + parseDollars(ti.final_value), 0);

  res.json({
    success: true,
    data: {
      transactionId: transaction.transaction_id,
      transactionNumber: transaction.transaction_number,
      status: transaction.status,
      registerName: transaction.register_name,
      customer: transaction.customer_id ? {
        customerId: transaction.customer_id,
        name: transaction.customer_name,
        email: transaction.customer_email,
        phone: transaction.customer_phone
      } : null,
      quote: transaction.quote_id ? {
        quoteId: transaction.quote_id,
        quoteNumber: transaction.quote_number
      } : null,
      cashier: {
        userId: transaction.user_id,
        name: transaction.cashier_name
      },
      salesperson: transaction.salesperson_id ? {
        userId: transaction.salesperson_id,
        name: transaction.salesperson_name
      } : null,
      totals: {
        subtotal: parseDollars(transaction.subtotal),
        discountAmount: parseDollars(transaction.discount_amount),
        discountReason: transaction.discount_reason,
        hstAmount: parseDollars(transaction.hst_amount),
        gstAmount: parseDollars(transaction.gst_amount),
        pstAmount: parseDollars(transaction.pst_amount),
        taxProvince: transaction.tax_province,
        totalAmount: parseDollars(transaction.total_amount)
      },
      items: itemsResult.rows.map(item => ({
        itemId: item.item_id,
        productId: item.product_id,
        productName: item.product_name,
        productSku: item.product_sku,
        quantity: item.quantity,
        unitPrice: parseDollars(item.unit_price),
        unitCost: item.unit_cost ? parseDollars(item.unit_cost) : null,
        discountPercent: parseFloat(item.discount_percent),
        discountAmount: parseDollars(item.discount_amount),
        taxAmount: parseDollars(item.tax_amount),
        lineTotal: parseDollars(item.line_total),
        serialNumber: item.serial_number,
        taxable: item.taxable
      })),
      payments: paymentsResult.rows.map(payment => ({
        paymentId: payment.payment_id,
        paymentMethod: payment.payment_method,
        amount: parseDollars(payment.amount),
        cardLastFour: payment.card_last_four,
        cardBrand: payment.card_brand,
        authorizationCode: payment.authorization_code,
        processorReference: payment.processor_reference,
        cashTendered: payment.cash_tendered ? parseFloat(payment.cash_tendered) : null,
        changeGiven: payment.change_given ? parseFloat(payment.change_given) : null,
        status: payment.status,
        processedAt: payment.processed_at
      })),
      tradeIns: tradeInsResult.rows.length > 0 ? {
        items: tradeInsResult.rows.map(ti => ({
          assessmentId: ti.assessment_id,
          brand: ti.brand,
          model: ti.model,
          variant: ti.variant,
          category: ti.category_name,
          condition: ti.condition_name,
          serialNumber: ti.serial_number,
          imei: ti.imei,
          creditAmount: parseDollars(ti.final_value),
          notes: ti.condition_notes,
          status: ti.status,
          assessedAt: ti.assessed_at
        })),
        totalCredit: tradeInTotal,
        count: tradeInsResult.rows.length
      } : null,
      void: transaction.status === 'voided' ? {
        voidedBy: transaction.voided_by_name,
        reason: transaction.void_reason
      } : null,
      createdAt: transaction.created_at,
      completedAt: transaction.completed_at
    }
  });
}));

/**
 * POST /api/transactions/:id/void
 * Void a completed transaction
 */
router.post('/:id/void', authenticate, paymentLimiter, requirePermission('pos.checkout.void'), validateBody(schemas.void), fraudCheck('transaction.void'), auditLogMiddleware('void', 'transaction'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { error, value } = voidTransactionSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    throw ApiError.badRequest('Validation failed');
  }

  const { reason } = value;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get transaction
    const transactionResult = await client.query(
      'SELECT transaction_id, transaction_number, shift_id, status FROM transactions WHERE transaction_id = $1 FOR UPDATE',
      [id]
    );

    if (transactionResult.rows.length === 0) {
      throw ApiError.notFound('Transaction');
    }

    const transaction = transactionResult.rows[0];

    if (transaction.status !== 'completed') {
      throw ApiError.badRequest(`Cannot void transaction with status '${transaction.status}'`);
    }

    // Resolve location from original transaction's shift
    const _voidLocationId = transaction.shift_id ? await resolveLocationId(client, transaction.shift_id) : null;

    // Get items to restore inventory
    const itemsResult = await client.query(
      'SELECT ti.product_id, ti.quantity, ti.product_sku FROM transaction_items ti WHERE ti.transaction_id = $1',
      [id]
    );

    // Restore inventory
    const _voidQueue = [];
    for (const item of itemsResult.rows) {
      const { oldQty: _oldQty, newQty: _newQty } = await adjustInventoryInline(client, {
        productId: item.product_id,
        quantity: item.quantity,
        type: 'void',
        locationId: _voidLocationId,
        transactionId: transaction.transaction_id,
        transactionNumber: transaction.transaction_number,
        userId: req.user.id,
        reason: reason || 'Transaction voided',
      });
      _voidQueue.push({ productId: item.product_id, sku: item.product_sku, oldQty: _oldQty, newQty: _newQty, source: 'RETURN' });
    }

    // Update transaction status
    await client.query(
      `UPDATE transactions
       SET status = 'voided', voided_by = $1, void_reason = $2
       WHERE transaction_id = $3`,
      [req.user.id, reason, id]
    );

    // Update payment statuses
    await client.query(
      "UPDATE payments SET status = 'refunded' WHERE transaction_id = $1",
      [id]
    );

    // Revert any trade-ins linked to this transaction back to 'approved' status
    await client.query(
      `UPDATE trade_in_assessments
       SET transaction_id = NULL,
           status = 'approved',
           status_changed_at = NOW(),
           status_changed_by = $1,
           updated_at = NOW()
       WHERE transaction_id = $2 AND status = 'applied'`,
      [req.user.id, id]
    );

    await client.query('COMMIT');

    // Queue marketplace inventory changes (non-blocking, after commit)
    for (const qi of _voidQueue) {
      try {
        await miraklService.queueInventoryChange(qi.productId, qi.sku, qi.oldQty, qi.newQty, qi.source);
      } catch (queueErr) {
        req.log.error({ err: queueErr }, '[MarketplaceQueue] RETURN (void) queue error');
      }
    }

    // Invalidate caches
    if (cache) {
      cache.invalidatePattern('transactions:');
      cache.invalidatePattern('products:');
    }

    res.json({
      success: true,
      message: 'Transaction voided successfully',
      data: {
        transactionId: id,
        status: 'voided',
        voidedBy: req.user.id,
        voidReason: reason
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * POST /api/transactions/:id/collect-balance
 * Collect remaining balance on a deposit-paid transaction
 */
router.post('/:id/collect-balance', authenticate, paymentLimiter, auditLogMiddleware('collect_balance', 'transaction'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { paymentMethod, amount, cardLastFour, cardBrand, authorizationCode, processorReference, etransferReference } = req.body;

  if (!paymentMethod || !amount || amount <= 0) {
    throw ApiError.badRequest('paymentMethod and positive amount are required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const txnResult = await client.query(
      'SELECT transaction_id, transaction_number, status, balance_due, total_amount FROM transactions WHERE transaction_id = $1 FOR UPDATE',
      [id]
    );

    if (txnResult.rows.length === 0) {
      throw ApiError.notFound('Transaction');
    }

    const txn = txnResult.rows[0];
    if (txn.status !== 'deposit_paid') {
      throw ApiError.badRequest(`Transaction status is "${txn.status}", not "deposit_paid"`);
    }

    if (Math.abs(amount - txn.balance_due) > 0.01) {
      throw ApiError.badRequest(`Amount ($${amount.toFixed(2)}) must match balance due ($${parseFloat(txn.balance_due).toFixed(2)})`);
    }

    // Insert the balance payment
    await client.query(
      `INSERT INTO payments (
        transaction_id, payment_method, amount,
        card_last_four, card_brand, authorization_code, processor_reference, status,
        amount_cents, card_entry_method, card_present, card_bin
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $9, $10, $11)`,
      [
        id,
        paymentMethod,
        amount,
        cardLastFour || null,
        cardBrand || null,
        authorizationCode || null,
        processorReference || null,
        dollarsToCents(amount),
        req.body.cardEntryMethod || null,
        req.body.cardPresent != null ? req.body.cardPresent : true,
        req.body.cardBin || null,
      ]
    );

    // Update transaction to completed
    await client.query(
      `UPDATE transactions
       SET status = 'completed', balance_due = 0, balance_due_cents = 0, completed_at = NOW()
       WHERE transaction_id = $1`,
      [id]
    );

    await client.query('COMMIT');

    // Capture evidence snapshot for chargeback defense (non-blocking)
    const fraudService = req.app.get('fraudService');
    if (fraudService) {
      fraudService.captureEvidenceSnapshot(parseInt(id), {
        transaction_number: txn.transaction_number,
        user_id: req.user.id,
        shift_id: null,
        customer_id: null,
        payments: [{
          paymentMethod: paymentMethod,
          amount: amount,
          cardLastFour: cardLastFour,
          cardBrand: cardBrand,
          cardEntryMethod: req.body.cardEntryMethod || null,
        }],
        items: [],
        total_amount: parseFloat(txn.total_amount),
      }).catch(err => req.log.error({ err }, '[Transaction] Evidence snapshot error'));
    }

    res.json({
      success: true,
      data: { transactionId: parseInt(id), status: 'completed', balanceDue: 0 },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/transactions/:id/payments
 * List all payments on a transaction
 */
router.get('/:id/payments', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `SELECT payment_id, transaction_id, payment_method, amount,
            card_last_four, card_brand, authorization_code, processor_reference,
            cash_tendered, change_given, status, created_at
     FROM payments
     WHERE transaction_id = $1
     ORDER BY created_at`,
    [id]
  );

  res.json({ success: true, data: result.rows });
}));

/**
 * GET /api/transactions/:id/balance
 * Get outstanding balance on a transaction
 */
router.get('/:id/balance', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const txnResult = await pool.query(
    'SELECT transaction_id, total_amount, is_deposit, deposit_amount, balance_due, status FROM transactions WHERE transaction_id = $1',
    [id]
  );

  if (txnResult.rows.length === 0) {
    throw ApiError.notFound('Transaction');
  }

  const txn = txnResult.rows[0];
  const paymentsResult = await pool.query(
    'SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE transaction_id = $1 AND status = \'completed\'',
    [id]
  );

  const totalPaid = parseDollars(paymentsResult.rows[0]?.total_paid);

  res.json({
    success: true,
    data: {
      transactionId: txn.transaction_id,
      totalAmount: parseDollars(txn.total_amount),
      amountPaid: totalPaid,
      balanceDue: parseDollars(txn.balance_due),
      isDeposit: txn.is_deposit,
      depositAmount: txn.deposit_amount ? parseDollars(txn.deposit_amount) : null,
      paymentStatus: txn.status,
    },
  });
}));

/**
 * POST /api/transactions/:id/refund
 * Process full or partial refund
 */
router.post('/:id/refund', authenticate, paymentLimiter, requirePermission('pos.returns.process_refund'), validateBody(schemas.refund), fraudCheck('refund.process'), auditLogMiddleware('refund', 'transaction'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { error, value } = refundSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    throw ApiError.badRequest('Validation failed');
  }

  const { amount, items, reason } = value;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get transaction
    const transactionResult = await client.query(
      'SELECT transaction_id, transaction_number, shift_id, status, total_amount FROM transactions WHERE transaction_id = $1 FOR UPDATE',
      [id]
    );

    if (transactionResult.rows.length === 0) {
      throw ApiError.notFound('Transaction');
    }

    const transaction = transactionResult.rows[0];

    if (transaction.status !== 'completed') {
      throw ApiError.badRequest(`Cannot refund transaction with status '${transaction.status}'`);
    }

    // Resolve location from original transaction's shift
    const _refundLocationId = transaction.shift_id ? await resolveLocationId(client, transaction.shift_id) : null;

    let refundAmount = amount;
    let refundedItems = [];
    const _refundQueue = [];

    // If specific items provided, calculate refund amount from items
    if (items && items.length > 0) {
      refundAmount = 0;

      for (const refundItem of items) {
        const itemResult = await client.query(
          'SELECT item_id, product_id, product_sku, quantity, line_total FROM transaction_items WHERE item_id = $1 AND transaction_id = $2',
          [refundItem.itemId, id]
        );

        if (itemResult.rows.length === 0) {
          throw ApiError.badRequest(`Item ${refundItem.itemId} not found in transaction`);
        }

        const item = itemResult.rows[0];

        if (refundItem.quantity > item.quantity) {
          throw ApiError.badRequest(`Cannot refund more than purchased quantity for item ${refundItem.itemId}`);
        }

        // Calculate proportional refund
        const itemRefundAmount = (item.line_total / item.quantity) * refundItem.quantity;
        refundAmount += itemRefundAmount;

        // Restore inventory
        const { oldQty: _oldQty, newQty: _newQty } = await adjustInventoryInline(client, {
          productId: item.product_id,
          quantity: refundItem.quantity,
          type: 'return',
          locationId: _refundLocationId,
          transactionId: transaction.transaction_id,
          transactionNumber: transaction.transaction_number,
          userId: req.user.id,
          reason: reason || 'Partial refund',
        });
        _refundQueue.push({ productId: item.product_id, sku: item.product_sku, oldQty: _oldQty, newQty: _newQty, source: 'RETURN' });

        refundedItems.push({
          itemId: refundItem.itemId,
          quantity: refundItem.quantity,
          amount: roundDollars(itemRefundAmount)
        });
      }

      refundAmount = roundDollars(refundAmount);
    } else {
      // Full refund - use total amount if not specified
      if (!refundAmount) {
        refundAmount = parseDollars(transaction.total_amount);
      }

      // Restore all inventory
      const allItemsResult = await client.query(
        'SELECT product_id, product_sku, quantity FROM transaction_items WHERE transaction_id = $1',
        [id]
      );

      for (const item of allItemsResult.rows) {
        const { oldQty: _oldQty, newQty: _newQty } = await adjustInventoryInline(client, {
          productId: item.product_id,
          quantity: item.quantity,
          type: 'return',
          locationId: _refundLocationId,
          transactionId: transaction.transaction_id,
          transactionNumber: transaction.transaction_number,
          userId: req.user.id,
          reason: reason || 'Full refund',
        });
        _refundQueue.push({ productId: item.product_id, sku: item.product_sku, oldQty: _oldQty, newQty: _newQty, source: 'RETURN' });
      }
    }

    // Validate refund amount
    if (refundAmount > parseDollars(transaction.total_amount)) {
      throw ApiError.badRequest('Refund amount cannot exceed transaction total');
    }

    // Create refund payment record
    await client.query(
      `INSERT INTO payments (
        transaction_id, payment_method, amount, status, processed_at, amount_cents
      ) VALUES ($1, 'cash', $2, 'refunded', NOW(), $3)`,
      [id, -refundAmount, -dollarsToCents(refundAmount)]  // Negative amount for refund
    );

    // Update transaction status
    const isFullRefund = Math.abs(refundAmount - parseDollars(transaction.total_amount)) < 0.01;

    await client.query(
      `UPDATE transactions
       SET status = $1, void_reason = $2
       WHERE transaction_id = $3`,
      [isFullRefund ? 'refunded' : 'completed', reason || 'Refund processed', id]
    );

    await client.query('COMMIT');

    // Queue marketplace inventory changes (non-blocking, after commit)
    for (const qi of _refundQueue) {
      try {
        await miraklService.queueInventoryChange(qi.productId, qi.sku, qi.oldQty, qi.newQty, qi.source);
      } catch (queueErr) {
        req.log.error({ err: queueErr }, '[MarketplaceQueue] RETURN (refund) queue error');
      }
    }

    // Invalidate caches
    if (cache) {
      cache.invalidatePattern('transactions:');
      cache.invalidatePattern('products:');
    }

    res.json({
      success: true,
      message: isFullRefund ? 'Full refund processed successfully' : 'Partial refund processed successfully',
      data: {
        transactionId: id,
        refundAmount,
        isFullRefund,
        refundedItems: refundedItems.length > 0 ? refundedItems : null,
        reason
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize routes with dependencies
 * @param {object} deps - Dependencies
 * @param {Pool} deps.pool - PostgreSQL connection pool
 * @param {object} deps.cache - Cache module
 * @returns {Router} Express router instance
 */
const init = (deps) => {
  pool = deps.pool;
  cache = deps.cache;
  discountAuthorityService = deps.discountAuthorityService || null;
  serialNumberService = deps.serialNumberService || null;

  // Initialize CommissionService if not provided directly
  if (deps.commissionService) {
    commissionService = deps.commissionService;
  } else {
    const CommissionService = require('../services/CommissionService');
    commissionService = new CommissionService(pool, cache);
  }

  return router;
};

module.exports = { init };
