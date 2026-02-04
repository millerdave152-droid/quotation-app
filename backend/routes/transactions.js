/**
 * TeleTime POS - Transaction Routes
 * Handles sales transactions, payments, voids, and refunds
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole, requirePermission } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let pool = null;
let cache = null;

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
// VALIDATION SCHEMAS
// ============================================================================

const transactionItemSchema = Joi.object({
  productId: Joi.number().integer().required(),
  quantity: Joi.number().integer().min(1).required(),
  unitPrice: Joi.number().precision(2).required(),
  unitCost: Joi.number().precision(2).optional().allow(null),
  discountPercent: Joi.number().min(0).max(100).default(0),
  discountAmount: Joi.number().min(0).default(0),
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
      streetNumber: Joi.string().required(),
      streetName: Joi.string().required(),
      street: Joi.string().optional(),
      unit: Joi.string().allow(null, '').optional(),
      buzzer: Joi.string().allow(null, '').optional(),
      city: Joi.string().required(),
      province: Joi.string().length(2).uppercase().required(),
      postalCode: Joi.string().pattern(/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i).required(),
      dwellingType: Joi.string().valid('house', 'townhouse', 'condo', 'apartment', 'commercial').optional(),
      entryPoint: Joi.string().valid('front_door', 'back_door', 'side_door', 'garage', 'loading_dock', 'concierge').optional(),
      floorNumber: Joi.string().max(20).allow(null, '').optional(),
    }).allow(null).optional(),
    dwellingType: Joi.string().valid('house', 'townhouse', 'condo', 'apartment', 'commercial').optional(),
    entryPoint: Joi.string().valid('front_door', 'back_door', 'side_door', 'garage', 'loading_dock', 'concierge').optional(),
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
    hstAmount: parseFloat((subtotal * rates.hst).toFixed(2)),
    gstAmount: parseFloat((subtotal * rates.gst).toFixed(2)),
    pstAmount: parseFloat((subtotal * rates.pst).toFixed(2)),
    totalTax: parseFloat((subtotal * (rates.hst + rates.gst + rates.pst)).toFixed(2))
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
    taxAmount = parseFloat((afterDiscount * totalRate).toFixed(2));
  }

  const lineTotal = parseFloat((afterDiscount + taxAmount).toFixed(2));

  return {
    discountAmount: parseFloat(discountAmount.toFixed(2)),
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
router.post('/', authenticate, asyncHandler(async (req, res) => {
  console.log('[Transaction] POST /api/transactions body:', JSON.stringify(req.body, null, 2));
  const { error, value } = createTransactionSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    console.error('[Transaction] Validation errors:', error.details.map(d => `${d.path.join('.')}: ${d.message}`).join('; '));
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message
      }))
    });
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
  } = value;

  // Validate dwelling type and entry point are provided for delivery fulfillment types
  if (fulfillment && ['local_delivery', 'shipping'].includes(fulfillment.type)) {
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
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: missingFields
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

    // Get tax rates for province
    const taxRates = TAX_RATES[taxProvince] || TAX_RATES.ON;

    // Fetch product details and calculate line items
    let subtotal = 0;
    let totalTaxAmount = 0;
    const processedItems = [];

    for (const item of items) {
      // Fetch product details
      const productResult = await client.query(
        'SELECT id AS product_id, name, model AS sku, price, cost FROM products WHERE id = $1',
        [item.productId]
      );

      if (productResult.rows.length === 0) {
        throw ApiError.badRequest(`Product with ID ${item.productId} not found`);
      }

      const product = productResult.rows[0];

      // Calculate line item totals
      const lineCalc = calculateLineItem(item, taxRates);

      const baseAmount = item.unitPrice * item.quantity;
      subtotal += baseAmount - lineCalc.discountAmount;
      totalTaxAmount += lineCalc.taxAmount;

      processedItems.push({
        ...item,
        productName: product.name,
        productSku: product.sku,
        unitCost: item.unitCost || product.cost,
        ...lineCalc
      });
    }

    // Apply transaction-level discount
    const finalSubtotal = subtotal - (discountAmount || 0);

    // Recalculate taxes after transaction discount if needed
    const taxes = calculateTaxes(finalSubtotal, taxProvince);
    const effectiveDeliveryFee = deliveryFee || fulfillment?.fee || 0;
    const totalAmount = finalSubtotal + taxes.totalTax + effectiveDeliveryFee;

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
    const balanceDue = isDeposit ? parseFloat((totalAmount - paymentTotal).toFixed(2)) : null;

    // Calculate completed_at timestamp
    const completedAt = transactionStatus === 'completed' ? new Date() : null;

    const transactionResult = await client.query(
      `INSERT INTO transactions (
        transaction_number, shift_id, customer_id, quote_id, user_id, salesperson_id,
        subtotal, discount_amount, discount_reason,
        hst_amount, gst_amount, pst_amount, tax_province,
        total_amount, status, completed_at,
        etransfer_reference, etransfer_status,
        is_deposit, deposit_amount, balance_due,
        marketing_source, marketing_source_detail
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING transaction_id, transaction_number, created_at`,
      [
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
        marketingSourceDetail || null
      ]
    );

    const transaction = transactionResult.rows[0];

    // Insert transaction items
    for (const item of processedItems) {
      await client.query(
        `INSERT INTO transaction_items (
          transaction_id, product_id, product_name, product_sku,
          quantity, unit_price, unit_cost,
          discount_percent, discount_amount, tax_amount, line_total,
          serial_number, taxable
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          transaction.transaction_id,
          item.productId,
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
          item.taxable !== false
        ]
      );

      // Update inventory
      await client.query(
        'UPDATE products SET qty_on_hand = COALESCE(qty_on_hand, 0) - $1 WHERE id = $2',
        [item.quantity, item.productId]
      );
    }

    // Insert payments
    for (const payment of payments) {
      const paymentStatus = payment.paymentMethod === 'etransfer' ? 'pending' : 'completed';
      await client.query(
        `INSERT INTO payments (
          transaction_id, payment_method, amount,
          card_last_four, card_brand, authorization_code, processor_reference,
          cash_tendered, change_given, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
          paymentStatus
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

    // Insert fulfillment record
    if (fulfillment) {
      const dwellingType = fulfillment.dwellingType || fulfillment.address?.dwellingType || null;
      const entryPoint = fulfillment.entryPoint || fulfillment.address?.entryPoint || null;
      const floorNumber = fulfillment.floorNumber || fulfillment.address?.floorNumber || null;
      const elevatorRequired = fulfillment.elevatorRequired || fulfillment.address?.elevatorRequired || false;
      const elevatorDate = fulfillment.elevatorDate || fulfillment.address?.elevatorDate || null;
      const elevatorTime = fulfillment.elevatorTime || fulfillment.address?.elevatorTime || null;
      const conciergePhone = fulfillment.conciergePhone || fulfillment.address?.conciergePhone || null;
      const conciergeNotes = fulfillment.conciergeNotes || fulfillment.address?.conciergeNotes || null;
      const accessSteps = fulfillment.accessSteps ?? fulfillment.address?.accessSteps ?? 0;
      const accessNarrowStairs = fulfillment.accessNarrowStairs || fulfillment.address?.accessNarrowStairs || false;
      const accessHeightRestriction = fulfillment.accessHeightRestriction || fulfillment.address?.accessHeightRestriction || null;
      const accessWidthRestriction = fulfillment.accessWidthRestriction || fulfillment.address?.accessWidthRestriction || null;
      const accessNotes = fulfillment.accessNotes || fulfillment.address?.accessNotes || null;
      const parkingType = fulfillment.parkingType || fulfillment.address?.parkingType || null;
      const parkingDistance = fulfillment.parkingDistance ?? fulfillment.address?.parkingDistance ?? null;
      const parkingNotes = fulfillment.parkingNotes || fulfillment.address?.parkingNotes || null;
      const pathwayConfirmed = fulfillment.pathwayConfirmed || fulfillment.address?.pathwayConfirmed || false;
      const pathwayNotes = fulfillment.pathwayNotes || fulfillment.address?.pathwayNotes || null;
      const deliveryDate = fulfillment.deliveryDate || fulfillment.address?.deliveryDate || null;
      const deliveryWindowId = fulfillment.deliveryWindowId ?? fulfillment.address?.deliveryWindowId ?? null;
      const deliveryWindowStart = fulfillment.deliveryWindowStart || fulfillment.address?.deliveryWindowStart || null;
      const deliveryWindowEnd = fulfillment.deliveryWindowEnd || fulfillment.address?.deliveryWindowEnd || null;
      const pickupLocationId = fulfillment.pickupLocationId || null;
      const pickupDate = fulfillment.pickupDate || null;
      const pickupTimePreference = fulfillment.pickupTimePreference || null;
      const pickupPersonName = fulfillment.pickupPersonName || null;
      const pickupPersonPhone = fulfillment.pickupPersonPhone || null;
      const pickupVehicleType = fulfillment.pickupVehicleType || null;
      const pickupVehicleNotes = fulfillment.pickupVehicleNotes || null;
      await client.query(
        `INSERT INTO order_fulfillment (
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
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39)`,
        [
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
        ]
      );
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
        const estimatedCommissionCents = Math.round(totalAmount * 100 * 0.03);
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

    // Invalidate relevant caches
    if (cache) {
      cache.invalidatePattern('transactions:');
      cache.invalidatePattern('products:');
      if (quoteId) {
        cache.invalidatePattern('quotes:');
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
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Transaction] CREATE ERROR:', err.message, err.stack);
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
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message
      }))
    });
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
      LEFT JOIN customers c ON t.customer_id = c.customer_id
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
     LEFT JOIN customers c ON t.customer_id = c.customer_id
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
    LEFT JOIN customers c ON t.customer_id = c.customer_id
    LEFT JOIN users u ON t.user_id = u.user_id
    LEFT JOIN users sp ON t.salesperson_id = sp.user_id
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
      subtotal: parseFloat(row.subtotal),
      discountAmount: parseFloat(row.discount_amount),
      totalAmount: parseFloat(row.total_amount),
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
      total: parseFloat(row.total)
    };
  });

  res.json({
    success: true,
    data: {
      transactionCount: parseInt(summary.transaction_count, 10),
      voidCount: parseInt(summary.void_count, 10),
      refundCount: parseInt(summary.refund_count, 10),
      totalSales: parseFloat(summary.total_sales),
      subtotal: parseFloat(summary.subtotal),
      totalDiscounts: parseFloat(summary.total_discounts),
      totalTax: parseFloat(summary.total_tax),
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
    LEFT JOIN customers c ON t.customer_id = c.customer_id
    LEFT JOIN users u ON t.user_id = u.user_id
    LEFT JOIN users sp ON t.salesperson_id = sp.user_id
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

  const tradeInTotal = tradeInsResult.rows.reduce((sum, ti) => sum + parseFloat(ti.final_value), 0);

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
        subtotal: parseFloat(transaction.subtotal),
        discountAmount: parseFloat(transaction.discount_amount),
        discountReason: transaction.discount_reason,
        hstAmount: parseFloat(transaction.hst_amount),
        gstAmount: parseFloat(transaction.gst_amount),
        pstAmount: parseFloat(transaction.pst_amount),
        taxProvince: transaction.tax_province,
        totalAmount: parseFloat(transaction.total_amount)
      },
      items: itemsResult.rows.map(item => ({
        itemId: item.item_id,
        productId: item.product_id,
        productName: item.product_name,
        productSku: item.product_sku,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price),
        unitCost: item.unit_cost ? parseFloat(item.unit_cost) : null,
        discountPercent: parseFloat(item.discount_percent),
        discountAmount: parseFloat(item.discount_amount),
        taxAmount: parseFloat(item.tax_amount),
        lineTotal: parseFloat(item.line_total),
        serialNumber: item.serial_number,
        taxable: item.taxable
      })),
      payments: paymentsResult.rows.map(payment => ({
        paymentId: payment.payment_id,
        paymentMethod: payment.payment_method,
        amount: parseFloat(payment.amount),
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
          creditAmount: parseFloat(ti.final_value),
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
router.post('/:id/void', authenticate, requirePermission('pos.checkout.void'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { error, value } = voidTransactionSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message
      }))
    });
  }

  const { reason } = value;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get transaction
    const transactionResult = await client.query(
      'SELECT transaction_id, status FROM transactions WHERE transaction_id = $1 FOR UPDATE',
      [id]
    );

    if (transactionResult.rows.length === 0) {
      throw ApiError.notFound('Transaction');
    }

    const transaction = transactionResult.rows[0];

    if (transaction.status !== 'completed') {
      throw ApiError.badRequest(`Cannot void transaction with status '${transaction.status}'`);
    }

    // Get items to restore inventory
    const itemsResult = await client.query(
      'SELECT product_id, quantity FROM transaction_items WHERE transaction_id = $1',
      [id]
    );

    // Restore inventory
    for (const item of itemsResult.rows) {
      await client.query(
        'UPDATE products SET qty_on_hand = COALESCE(qty_on_hand, 0) + $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
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
router.post('/:id/collect-balance', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { paymentMethod, amount, cardLastFour, cardBrand, authorizationCode, processorReference, etransferReference } = req.body;

  if (!paymentMethod || !amount || amount <= 0) {
    throw ApiError.badRequest('paymentMethod and positive amount are required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const txnResult = await client.query(
      'SELECT transaction_id, status, balance_due, total_amount FROM transactions WHERE transaction_id = $1 FOR UPDATE',
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
        card_last_four, card_brand, authorization_code, processor_reference, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')`,
      [
        id,
        paymentMethod,
        amount,
        cardLastFour || null,
        cardBrand || null,
        authorizationCode || null,
        processorReference || null,
      ]
    );

    // Update transaction to completed
    await client.query(
      `UPDATE transactions
       SET status = 'completed', balance_due = 0, completed_at = NOW()
       WHERE transaction_id = $1`,
      [id]
    );

    await client.query('COMMIT');

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
    `SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE transaction_id = $1 AND status = 'completed'`,
    [id]
  );

  const totalPaid = parseFloat(paymentsResult.rows[0].total_paid);

  res.json({
    success: true,
    data: {
      transactionId: txn.transaction_id,
      totalAmount: parseFloat(txn.total_amount),
      amountPaid: totalPaid,
      balanceDue: parseFloat(txn.balance_due || 0),
      isDeposit: txn.is_deposit,
      depositAmount: txn.deposit_amount ? parseFloat(txn.deposit_amount) : null,
      paymentStatus: txn.status,
    },
  });
}));

/**
 * POST /api/transactions/:id/refund
 * Process full or partial refund
 */
router.post('/:id/refund', authenticate, requirePermission('pos.returns.process_refund'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { error, value } = refundSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message
      }))
    });
  }

  const { amount, items, reason } = value;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get transaction
    const transactionResult = await client.query(
      'SELECT transaction_id, status, total_amount FROM transactions WHERE transaction_id = $1 FOR UPDATE',
      [id]
    );

    if (transactionResult.rows.length === 0) {
      throw ApiError.notFound('Transaction');
    }

    const transaction = transactionResult.rows[0];

    if (transaction.status !== 'completed') {
      throw ApiError.badRequest(`Cannot refund transaction with status '${transaction.status}'`);
    }

    let refundAmount = amount;
    let refundedItems = [];

    // If specific items provided, calculate refund amount from items
    if (items && items.length > 0) {
      refundAmount = 0;

      for (const refundItem of items) {
        const itemResult = await client.query(
          'SELECT item_id, product_id, quantity, line_total FROM transaction_items WHERE item_id = $1 AND transaction_id = $2',
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
        await client.query(
          'UPDATE products SET qty_on_hand = COALESCE(qty_on_hand, 0) + $1 WHERE id = $2',
          [refundItem.quantity, item.product_id]
        );

        refundedItems.push({
          itemId: refundItem.itemId,
          quantity: refundItem.quantity,
          amount: parseFloat(itemRefundAmount.toFixed(2))
        });
      }

      refundAmount = parseFloat(refundAmount.toFixed(2));
    } else {
      // Full refund - use total amount if not specified
      if (!refundAmount) {
        refundAmount = parseFloat(transaction.total_amount);
      }

      // Restore all inventory
      const allItemsResult = await client.query(
        'SELECT product_id, quantity FROM transaction_items WHERE transaction_id = $1',
        [id]
      );

      for (const item of allItemsResult.rows) {
        await client.query(
          'UPDATE products SET qty_on_hand = COALESCE(qty_on_hand, 0) + $1 WHERE id = $2',
          [item.quantity, item.product_id]
        );
      }
    }

    // Validate refund amount
    if (refundAmount > parseFloat(transaction.total_amount)) {
      throw ApiError.badRequest('Refund amount cannot exceed transaction total');
    }

    // Create refund payment record
    await client.query(
      `INSERT INTO payments (
        transaction_id, payment_method, amount, status, processed_at
      ) VALUES ($1, 'cash', $2, 'refunded', NOW())`,
      [id, -refundAmount]  // Negative amount for refund
    );

    // Update transaction status
    const isFullRefund = Math.abs(refundAmount - parseFloat(transaction.total_amount)) < 0.01;

    await client.query(
      `UPDATE transactions
       SET status = $1, void_reason = $2
       WHERE transaction_id = $3`,
      [isFullRefund ? 'refunded' : 'completed', reason || 'Refund processed', id]
    );

    await client.query('COMMIT');

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
  return router;
};

module.exports = { init };
