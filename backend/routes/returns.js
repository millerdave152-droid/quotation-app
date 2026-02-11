/**
 * TeleTime POS - Returns Routes
 * Handles invoice lookup and return initiation
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

let pool = null;
let stripeService = null;

// ============================================================================
// MIDDLEWARE
// ============================================================================

router.use(authenticate);

// ============================================================================
// GET / — Search transactions for return initiation
// ============================================================================

router.get('/', asyncHandler(async (req, res) => {
  const { search, startDate, endDate, dateRange, page = 1, limit = 20 } = req.query;
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const limitVal = Math.min(100, Math.max(1, parseInt(limit)));

  const conditions = ["t.status = 'completed'"];
  const params = [];
  let paramIndex = 1;

  // Text search: transaction number, customer name, customer phone
  if (search && search.trim()) {
    const searchTerm = `%${search.trim()}%`;
    conditions.push(`(
      t.transaction_number ILIKE $${paramIndex}
      OR c.name ILIKE $${paramIndex}
      OR c.phone ILIKE $${paramIndex}
    )`);
    params.push(searchTerm);
    paramIndex++;
  }

  // Date range preset
  if (dateRange && dateRange !== 'all_time') {
    let dateCondition;
    switch (dateRange) {
      case 'today':
        dateCondition = `t.created_at >= CURRENT_DATE`;
        break;
      case 'this_week':
        dateCondition = `t.created_at >= date_trunc('week', CURRENT_DATE)`;
        break;
      case 'this_month':
        dateCondition = `t.created_at >= date_trunc('month', CURRENT_DATE)`;
        break;
      case 'last_month':
        dateCondition = `t.created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND t.created_at < date_trunc('month', CURRENT_DATE)`;
        break;
    }
    if (dateCondition) conditions.push(dateCondition);
  }

  // Custom date range
  if (startDate) {
    conditions.push(`t.created_at >= $${paramIndex}`);
    params.push(startDate);
    paramIndex++;
  }
  if (endDate) {
    conditions.push(`t.created_at <= $${paramIndex}::date + INTERVAL '1 day'`);
    params.push(endDate);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count query
  const countQuery = `
    SELECT COUNT(*) as total
    FROM transactions t
    LEFT JOIN customers c ON t.customer_id = c.id
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Main query with item count and summary
  const dataQuery = `
    SELECT
      t.transaction_id,
      t.transaction_number,
      t.created_at,
      t.total_amount,
      t.status,
      t.customer_id,
      c.name as customer_name,
      c.phone as customer_phone,
      c.email as customer_email,
      COALESCE(items.item_count, 0) as item_count,
      COALESCE(items.item_summary, '') as item_summary
    FROM transactions t
    LEFT JOIN customers c ON t.customer_id = c.id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) as item_count,
        STRING_AGG(sub.name, ', ') as item_summary
      FROM (
        SELECT ti.product_name as name
        FROM transaction_items ti
        WHERE ti.transaction_id = t.transaction_id
        ORDER BY ti.item_id
        LIMIT 3
      ) sub
    ) items ON true
    ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const dataResult = await pool.query(dataQuery, [...params, limitVal, offset]);

  res.json({
    success: true,
    data: dataResult.rows,
    pagination: {
      page: parseInt(page),
      limit: limitVal,
      total,
      totalPages: Math.ceil(total / limitVal)
    }
  });
}));

// ============================================================================
// POST / — Create a return record (stub)
// ============================================================================

router.post('/', asyncHandler(async (req, res) => {
  const { originalTransactionId, returnType = 'full', notes } = req.body;
  const userId = req.user.id;

  if (!originalTransactionId) {
    return res.status(400).json({ success: false, error: 'originalTransactionId is required' });
  }

  // Verify the transaction exists and is completed
  const txResult = await pool.query(
    'SELECT transaction_id, transaction_number, status FROM transactions WHERE transaction_id = $1',
    [originalTransactionId]
  );
  if (txResult.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Transaction not found' });
  }
  if (txResult.rows[0].status !== 'completed') {
    return res.status(400).json({ success: false, error: 'Only completed transactions can be returned' });
  }

  // Generate return number
  const returnNumber = `RTN-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const insertResult = await pool.query(
    `INSERT INTO pos_returns (original_transaction_id, return_number, return_type, status, processed_by, notes)
     VALUES ($1, $2, $3, 'initiated', $4, $5)
     RETURNING *`,
    [originalTransactionId, returnNumber, returnType, userId, notes || null]
  );

  res.status(201).json({
    success: true,
    data: insertResult.rows[0]
  });
}));

// ============================================================================
// GET /reason-codes — List active return reason codes
// ============================================================================

router.get('/reason-codes', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT id, code, description, requires_notes FROM return_reason_codes WHERE active = true ORDER BY sort_order'
  );
  res.json({ success: true, data: result.rows });
}));

// ============================================================================
// GET /:id/items — Get transaction items for a return (items from original tx)
// ============================================================================

router.get('/:id/items', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Verify return exists and get original transaction id
  const returnResult = await pool.query(
    'SELECT id, original_transaction_id FROM pos_returns WHERE id = $1',
    [id]
  );
  if (returnResult.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Return not found' });
  }

  const txId = returnResult.rows[0].original_transaction_id;

  // Fetch original transaction items
  const itemsResult = await pool.query(
    `SELECT ti.item_id, ti.product_id, ti.product_name, ti.product_sku,
            ti.quantity, ti.unit_price, ti.discount_percent, ti.discount_amount
     FROM transaction_items ti
     WHERE ti.transaction_id = $1
     ORDER BY ti.item_id`,
    [txId]
  );

  // Fetch already-added return items for this return
  const returnItemsResult = await pool.query(
    `SELECT ri.id, ri.transaction_item_id, ri.quantity, ri.reason_code_id, ri.reason_notes, ri.condition,
            rrc.code as reason_code, rrc.description as reason_description
     FROM return_items ri
     JOIN return_reason_codes rrc ON ri.reason_code_id = rrc.id
     WHERE ri.return_id = $1`,
    [id]
  );

  res.json({
    success: true,
    data: {
      transactionItems: itemsResult.rows,
      returnItems: returnItemsResult.rows,
    }
  });
}));

// ============================================================================
// POST /:id/items — Add items to a return
// ============================================================================

router.post('/:id/items', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'items array is required' });
  }

  // Verify return exists and is in initiated status
  const returnResult = await pool.query(
    'SELECT id, status, original_transaction_id FROM pos_returns WHERE id = $1',
    [id]
  );
  if (returnResult.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Return not found' });
  }
  if (returnResult.rows[0].status !== 'initiated') {
    return res.status(400).json({ success: false, error: 'Can only add items to returns in initiated status' });
  }

  const txId = returnResult.rows[0].original_transaction_id;

  // Validate all items belong to the original transaction
  const validItemIds = await pool.query(
    'SELECT item_id, quantity FROM transaction_items WHERE transaction_id = $1',
    [txId]
  );
  const validMap = new Map(validItemIds.rows.map(r => [r.item_id, r.quantity]));

  for (const item of items) {
    if (!validMap.has(item.transactionItemId)) {
      return res.status(400).json({
        success: false,
        error: `Transaction item ${item.transactionItemId} does not belong to the original transaction`
      });
    }
    if (item.quantity > validMap.get(item.transactionItemId)) {
      return res.status(400).json({
        success: false,
        error: `Return quantity for item ${item.transactionItemId} exceeds original quantity`
      });
    }
  }

  // Delete existing return items for this return and replace
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM return_items WHERE return_id = $1', [id]);

    const inserted = [];
    for (const item of items) {
      const result = await client.query(
        `INSERT INTO return_items (return_id, transaction_item_id, quantity, reason_code_id, reason_notes, condition)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, item.transactionItemId, item.quantity, item.reasonCodeId, item.reasonNotes || null, item.condition || 'resellable']
      );
      inserted.push(result.rows[0]);
    }

    // Update return type based on whether all items are included
    const totalOriginalItems = validItemIds.rows.reduce((sum, r) => sum + r.quantity, 0);
    const totalReturnItems = items.reduce((sum, i) => sum + i.quantity, 0);
    const returnType = totalReturnItems >= totalOriginalItems ? 'full' : 'partial';

    await client.query(
      'UPDATE pos_returns SET return_type = $1, updated_at = NOW() WHERE id = $2',
      [returnType, id]
    );

    await client.query('COMMIT');

    res.status(201).json({ success: true, data: inserted });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ============================================================================
// GET /:id/payment-info — Get original payment methods and refund calculation
// ============================================================================

router.get('/:id/payment-info', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Get return with original transaction info
  const returnResult = await pool.query(
    `SELECT r.*, t.subtotal, t.total_amount, t.hst_amount, t.gst_amount, t.pst_amount,
            t.tax_province, t.transaction_number
     FROM pos_returns r
     JOIN transactions t ON r.original_transaction_id = t.transaction_id
     WHERE r.id = $1`,
    [id]
  );
  if (returnResult.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Return not found' });
  }
  const returnData = returnResult.rows[0];

  // Get original payments
  const paymentsResult = await pool.query(
    `SELECT payment_id, payment_method, amount, card_last_four, card_brand,
            stripe_payment_intent_id, stripe_charge_id, status
     FROM payments
     WHERE transaction_id = $1 AND status = 'completed'`,
    [returnData.original_transaction_id]
  );

  // Get return items to calculate refund amounts
  const returnItemsResult = await pool.query(
    `SELECT ri.quantity, ri.condition, ti.unit_price, ti.quantity as original_quantity,
            ti.discount_amount, ti.discount_percent, ti.product_name
     FROM return_items ri
     JOIN transaction_items ti ON ri.transaction_item_id = ti.item_id
     WHERE ri.return_id = $1`,
    [id]
  );

  // Calculate refund subtotal from return items
  let refundSubtotal = 0;
  for (const item of returnItemsResult.rows) {
    const linePrice = Number(item.unit_price) * item.quantity;
    const discountPerUnit = item.original_quantity > 0
      ? Number(item.discount_amount || 0) / item.original_quantity
      : 0;
    refundSubtotal += linePrice - (discountPerUnit * item.quantity);
  }

  // Calculate proportional tax refund
  const originalSubtotal = Number(returnData.subtotal) || 1;
  const refundRatio = refundSubtotal / originalSubtotal;
  const refundHst = Math.round(Number(returnData.hst_amount || 0) * refundRatio * 100) / 100;
  const refundGst = Math.round(Number(returnData.gst_amount || 0) * refundRatio * 100) / 100;
  const refundPst = Math.round(Number(returnData.pst_amount || 0) * refundRatio * 100) / 100;
  const refundTax = Math.round((refundHst + refundGst + refundPst) * 100) / 100;
  const refundTotal = Math.round((refundSubtotal + refundTax) * 100) / 100;

  // Convert to cents for consistency
  const refundSubtotalCents = Math.round(refundSubtotal * 100);
  const refundTaxCents = Math.round(refundTax * 100);
  const refundTotalCents = Math.round(refundTotal * 100);

  // Default restocking fee: 0 for damaged/defective, potentially applicable for resellable customer-fault returns
  const hasRestockableItems = returnItemsResult.rows.some(i => i.condition === 'resellable');

  res.json({
    success: true,
    data: {
      returnId: parseInt(id),
      transactionNumber: returnData.transaction_number,
      originalPayments: paymentsResult.rows,
      refundBreakdown: {
        subtotalCents: refundSubtotalCents,
        taxCents: refundTaxCents,
        hstCents: Math.round(refundHst * 100),
        gstCents: Math.round(refundGst * 100),
        pstCents: Math.round(refundPst * 100),
        totalCents: refundTotalCents,
        taxProvince: returnData.tax_province,
      },
      hasRestockableItems,
      returnItems: returnItemsResult.rows,
    }
  });
}));

// ============================================================================
// POST /:id/process-refund — Process the refund
// ============================================================================

router.post('/:id/process-refund', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { refundMethod, restockingFeeCents = 0 } = req.body;
  // refundMethod: 'original_payment' | 'store_credit' | 'cash' | 'gift_card'

  if (!refundMethod) {
    return res.status(400).json({ success: false, error: 'refundMethod is required' });
  }

  // Fetch return record
  const returnResult = await pool.query(
    `SELECT r.*, t.subtotal, t.total_amount, t.hst_amount, t.gst_amount, t.pst_amount, t.customer_id
     FROM pos_returns r
     JOIN transactions t ON r.original_transaction_id = t.transaction_id
     WHERE r.id = $1`,
    [id]
  );
  if (returnResult.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Return not found' });
  }
  const returnData = returnResult.rows[0];

  if (returnData.status === 'completed') {
    return res.status(400).json({ success: false, error: 'Return has already been processed' });
  }
  if (returnData.status === 'cancelled') {
    return res.status(400).json({ success: false, error: 'Return has been cancelled' });
  }

  // Calculate refund amounts from return items
  const returnItemsResult = await pool.query(
    `SELECT ri.quantity, ti.unit_price, ti.quantity as original_quantity, ti.discount_amount
     FROM return_items ri
     JOIN transaction_items ti ON ri.transaction_item_id = ti.item_id
     WHERE ri.return_id = $1`,
    [id]
  );

  if (returnItemsResult.rows.length === 0) {
    return res.status(400).json({ success: false, error: 'No return items found. Add items before processing refund.' });
  }

  let refundSubtotal = 0;
  for (const item of returnItemsResult.rows) {
    const linePrice = Number(item.unit_price) * item.quantity;
    const discountPerUnit = item.original_quantity > 0
      ? Number(item.discount_amount || 0) / item.original_quantity
      : 0;
    refundSubtotal += linePrice - (discountPerUnit * item.quantity);
  }

  const originalSubtotal = Number(returnData.subtotal) || 1;
  const refundRatio = refundSubtotal / originalSubtotal;
  const refundTax = (Number(returnData.hst_amount || 0) + Number(returnData.gst_amount || 0) + Number(returnData.pst_amount || 0)) * refundRatio;

  const refundSubtotalCents = Math.round(refundSubtotal * 100);
  const refundTaxCents = Math.round(refundTax * 100);
  const restockingFee = Math.max(0, parseInt(restockingFeeCents) || 0);
  const refundTotalCents = refundSubtotalCents + refundTaxCents - restockingFee;

  if (refundTotalCents <= 0) {
    return res.status(400).json({ success: false, error: 'Refund total must be greater than zero' });
  }

  // Get original payments
  const paymentsResult = await pool.query(
    `SELECT payment_id, payment_method, amount, stripe_charge_id, stripe_payment_intent_id
     FROM payments
     WHERE transaction_id = $1 AND status = 'completed'
     ORDER BY amount DESC`,
    [returnData.original_transaction_id]
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let stripeRefundId = null;
    const allocations = [];

    if (refundMethod === 'original_payment') {
      // Refund back to each original payment method proportionally
      const totalPaid = paymentsResult.rows.reduce((s, p) => s + Math.round(Number(p.amount) * 100), 0);
      let remainingRefund = refundTotalCents;

      for (const payment of paymentsResult.rows) {
        if (remainingRefund <= 0) break;

        const paymentCents = Math.round(Number(payment.amount) * 100);
        const proportion = paymentCents / totalPaid;
        let allocationCents = Math.min(
          Math.round(refundTotalCents * proportion),
          paymentCents,
          remainingRefund
        );

        // Last payment gets the remainder to avoid rounding issues
        if (payment === paymentsResult.rows[paymentsResult.rows.length - 1] || allocationCents > remainingRefund) {
          allocationCents = remainingRefund;
        }

        let paymentStripeRefundId = null;

        // Process Stripe refund for card payments
        if ((payment.payment_method === 'credit' || payment.payment_method === 'debit') && payment.stripe_charge_id && stripeService?.isConfigured()) {
          try {
            const refund = await stripeService.refundPayment(
              payment.stripe_charge_id,
              allocationCents,
              'requested_by_customer'
            );
            paymentStripeRefundId = refund.id;
            if (!stripeRefundId) stripeRefundId = refund.id;
          } catch (stripeErr) {
            await client.query('ROLLBACK');
            return res.status(502).json({
              success: false,
              error: `Stripe refund failed: ${stripeErr.message}`
            });
          }
        }

        // Record allocation
        await client.query(
          `INSERT INTO return_payment_allocations (return_id, original_payment_id, refund_amount_cents, refund_method, stripe_refund_id, status)
           VALUES ($1, $2, $3, $4, $5, 'completed')`,
          [id, payment.payment_id, allocationCents, payment.payment_method, paymentStripeRefundId]
        );

        allocations.push({
          paymentId: payment.payment_id,
          method: payment.payment_method,
          amountCents: allocationCents,
          stripeRefundId: paymentStripeRefundId,
        });

        remainingRefund -= allocationCents;
      }
    } else {
      // store_credit, cash, or gift_card — single allocation record
      await client.query(
        `INSERT INTO return_payment_allocations (return_id, original_payment_id, refund_amount_cents, refund_method, status)
         VALUES ($1, $2, $3, $4, 'completed')`,
        [id, paymentsResult.rows[0]?.payment_id || 0, refundTotalCents, refundMethod]
      );

      const allocation = {
        paymentId: paymentsResult.rows[0]?.payment_id,
        method: refundMethod,
        amountCents: refundTotalCents,
      };

      // Issue store credit if that method was selected
      if (refundMethod === 'store_credit') {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let creditCode;
        let codeAttempts = 0;
        while (codeAttempts < 10) {
          creditCode = 'SC-';
          for (let i = 0; i < 5; i++) creditCode += chars.charAt(crypto.randomInt(chars.length));
          const exists = await client.query('SELECT 1 FROM store_credits WHERE code = $1', [creditCode]);
          if (exists.rows.length === 0) break;
          codeAttempts++;
        }

        const creditResult = await client.query(
          `INSERT INTO store_credits (customer_id, code, original_amount, current_balance, source_type, source_id, issued_by, notes)
           VALUES ($1, $2, $3, $3, 'return', $4, $5, $6)
           RETURNING *`,
          [returnData.customer_id || null, creditCode, refundTotalCents, parseInt(id), req.user.id, `Refund for return ${returnData.return_number}`]
        );

        await client.query(
          `INSERT INTO store_credit_transactions (store_credit_id, amount_cents, transaction_type, balance_after, notes, performed_by)
           VALUES ($1, $2, 'issue', $3, $4, $5)`,
          [creditResult.rows[0].id, refundTotalCents, refundTotalCents, `Issued from return ${returnData.return_number}`, req.user.id]
        );

        allocation.storeCredit = {
          id: creditResult.rows[0].id,
          code: creditResult.rows[0].code,
          amountCents: refundTotalCents,
          customerId: returnData.customer_id,
        };
      }

      allocations.push(allocation);
    }

    // Update the return record
    await client.query(
      `UPDATE pos_returns
       SET status = 'completed',
           refund_subtotal = $1,
           refund_tax = $2,
           refund_total = $3,
           restocking_fee = $4,
           refund_method = $5,
           stripe_refund_id = $6,
           total_refund_amount = $7,
           updated_at = NOW()
       WHERE id = $8`,
      [
        refundSubtotalCents,
        refundTaxCents,
        refundTotalCents,
        restockingFee,
        refundMethod,
        stripeRefundId,
        refundTotalCents / 100, // total_refund_amount is NUMERIC(10,2) in dollars
        id
      ]
    );

    // Update original transaction status so it appears in reports
    // Full return → 'refunded', partial return → keep 'completed' but record void_reason
    if (returnData.return_type === 'full') {
      await client.query(
        `UPDATE transactions SET status = 'refunded', void_reason = $1
         WHERE transaction_id = $2`,
        [`Return ${returnData.return_number}: full refund via ${refundMethod}`, returnData.original_transaction_id]
      );
    } else {
      await client.query(
        `UPDATE transactions SET void_reason = $1
         WHERE transaction_id = $2`,
        [`Return ${returnData.return_number}: partial refund of $${(refundTotalCents / 100).toFixed(2)} via ${refundMethod}`, returnData.original_transaction_id]
      );
    }

    await client.query('COMMIT');

    // Extract store credit info if issued
    const storeCreditInfo = allocations.find(a => a.storeCredit)?.storeCredit || null;

    res.json({
      success: true,
      data: {
        returnId: parseInt(id),
        status: 'completed',
        refundSubtotalCents,
        refundTaxCents,
        refundTotalCents,
        restockingFeeCents: restockingFee,
        refundMethod,
        stripeRefundId,
        allocations,
        storeCredit: storeCreditInfo,
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
// INIT
// ============================================================================

const init = (deps) => {
  pool = deps.pool;
  stripeService = deps.stripeService || null;
  return router;
};

module.exports = { init };
