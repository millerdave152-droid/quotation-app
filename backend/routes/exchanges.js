/**
 * TeleTime POS - Exchange Routes
 * Handles return-and-replace as a single atomic transaction
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const miraklService = require('../services/miraklService');

let pool = null;
let stripeService = null;

router.use(authenticate);

// ============================================================================
// POST / — Process a full exchange (return + new sale atomically)
// ============================================================================

router.post('/', asyncHandler(async (req, res) => {
  const {
    originalTransactionId,
    returnItems,       // [{ transactionItemId, quantity, reasonCodeId, reasonNotes, condition }]
    newItems,          // [{ productId, quantity }]
    paymentMethod,     // for difference payment: 'cash' | 'credit' | 'debit' | null
    paymentDetails,    // { cardLastFour, cardBrand, authorizationCode, cashTendered, changeGiven }
    differenceMethod,  // for refund of difference: 'original_payment' | 'store_credit' | 'cash' | null
    shiftId,
    notes,
  } = req.body;
  const userId = req.user.id;

  // Validate inputs
  if (!originalTransactionId) {
    throw ApiError.badRequest('originalTransactionId is required');
  }
  if (!returnItems?.length) {
    throw ApiError.badRequest('returnItems are required');
  }
  if (!newItems?.length) {
    throw ApiError.badRequest('newItems are required');
  }

  // Fetch original transaction
  const origTxResult = await pool.query(
    `SELECT t.*, c.name as customer_name
     FROM transactions t
     LEFT JOIN customers c ON t.customer_id = c.id
     WHERE t.transaction_id = $1`,
    [originalTransactionId]
  );
  if (origTxResult.rows.length === 0) {
    throw ApiError.notFound('Original transaction');
  }
  const origTx = origTxResult.rows[0];
  if (origTx.status !== 'completed') {
    throw ApiError.badRequest('Only completed transactions can be exchanged');
  }

  // Validate return items belong to original transaction
  const origItemsResult = await pool.query(
    `SELECT item_id, product_id, product_name, product_sku, quantity, unit_price, unit_cost,
            discount_percent, discount_amount, tax_amount, line_total, taxable
     FROM transaction_items WHERE transaction_id = $1`,
    [originalTransactionId]
  );
  const origItemMap = new Map(origItemsResult.rows.map(r => [r.item_id, r]));

  for (const ri of returnItems) {
    const orig = origItemMap.get(ri.transactionItemId);
    if (!orig) {
      throw ApiError.badRequest(`Item ${ri.transactionItemId} not found in original transaction`);
    }
    if (ri.quantity > orig.quantity) {
      throw ApiError.badRequest(`Return quantity exceeds original for item ${ri.transactionItemId}`);
    }
  }

  // Fetch new product details
  const newProductIds = newItems.map(i => i.productId);
  const productsResult = await pool.query(
    `SELECT id, name, sku, selling_price, cost_price, taxable
     FROM products WHERE id = ANY($1)`,
    [newProductIds]
  );
  const productMap = new Map(productsResult.rows.map(r => [r.id, r]));

  for (const ni of newItems) {
    if (!productMap.has(ni.productId)) {
      throw ApiError.badRequest(`Product ${ni.productId} not found`);
    }
  }

  // Calculate return credit (what the customer gets back)
  let returnSubtotal = 0;
  for (const ri of returnItems) {
    const orig = origItemMap.get(ri.transactionItemId);
    const unitNet = Number(orig.unit_price) - (Number(orig.discount_amount || 0) / orig.quantity);
    returnSubtotal += unitNet * ri.quantity;
  }

  // Calculate new items total
  let newSubtotal = 0;
  const processedNewItems = newItems.map(ni => {
    const prod = productMap.get(ni.productId);
    const unitPrice = Number(prod.selling_price);
    const lineTotal = unitPrice * ni.quantity;
    newSubtotal += lineTotal;
    return {
      productId: prod.id,
      productName: prod.name,
      productSku: prod.sku,
      quantity: ni.quantity,
      unitPrice,
      unitCost: Number(prod.cost_price || 0),
      lineTotal,
      taxable: prod.taxable !== false,
    };
  });

  // Tax calculation for new items (use same province as original)
  const taxProvince = origTx.tax_province || 'ON';
  const TAX_RATES = {
    ON: { hst: 0.13, gst: 0, pst: 0 },
    BC: { hst: 0, gst: 0.05, pst: 0.07 },
    AB: { hst: 0, gst: 0.05, pst: 0 },
    SK: { hst: 0, gst: 0.05, pst: 0.06 },
    MB: { hst: 0, gst: 0.05, pst: 0.07 },
    QC: { hst: 0, gst: 0.05, pst: 0.09975 },
    NB: { hst: 0.15, gst: 0, pst: 0 },
    NS: { hst: 0.15, gst: 0, pst: 0 },
    PE: { hst: 0.15, gst: 0, pst: 0 },
    NL: { hst: 0.15, gst: 0, pst: 0 },
    YT: { hst: 0, gst: 0.05, pst: 0 },
    NT: { hst: 0, gst: 0.05, pst: 0 },
    NU: { hst: 0, gst: 0.05, pst: 0 },
  };
  const rates = TAX_RATES[taxProvince] || TAX_RATES.ON;

  const taxableNewSubtotal = processedNewItems.reduce((s, i) => s + (i.taxable ? i.lineTotal : 0), 0);
  const newHst = Math.round(taxableNewSubtotal * rates.hst * 100) / 100;
  const newGst = Math.round(taxableNewSubtotal * rates.gst * 100) / 100;
  const newPst = Math.round(taxableNewSubtotal * rates.pst * 100) / 100;
  const newTax = Math.round((newHst + newGst + newPst) * 100) / 100;
  const newTotal = Math.round((newSubtotal + newTax) * 100) / 100;

  // Return credit tax (proportional from original)
  const origSubtotal = Number(origTx.subtotal) || 1;
  const returnRatio = returnSubtotal / origSubtotal;
  const returnTax = (Number(origTx.hst_amount || 0) + Number(origTx.gst_amount || 0) + Number(origTx.pst_amount || 0)) * returnRatio;
  const returnTotal = Math.round((returnSubtotal + returnTax) * 100) / 100;

  // Price difference
  const differenceCents = Math.round((newTotal - returnTotal) * 100);
  // positive = customer owes more, negative = customer gets refund

  // If customer owes more, we need payment info
  if (differenceCents > 0 && !paymentMethod) {
    throw ApiError.badRequest(`Customer owes ${(differenceCents / 100).toFixed(2)} — paymentMethod is required`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create the return record
    const returnNumber = `RTN-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const totalOriginalItems = origItemsResult.rows.reduce((s, r) => s + r.quantity, 0);
    const totalReturnItems = returnItems.reduce((s, i) => s + i.quantity, 0);
    const returnType = totalReturnItems >= totalOriginalItems ? 'full' : 'partial';

    const returnResult = await client.query(
      `INSERT INTO pos_returns (
        original_transaction_id, return_number, return_type, status,
        processed_by, is_exchange, notes,
        refund_subtotal, refund_tax, refund_total, refund_method
      ) VALUES ($1, $2, $3, 'processing', $4, true, $5, $6, $7, $8, 'exchange')
      RETURNING *`,
      [
        originalTransactionId, returnNumber, returnType, userId,
        notes || `Exchange for new items`,
        Math.round(returnSubtotal * 100),
        Math.round(returnTax * 100),
        Math.round(returnTotal * 100),
      ]
    );
    const returnRecord = returnResult.rows[0];

    // 2. Insert return items
    const _exchangeQueue = [];
    for (const ri of returnItems) {
      await client.query(
        `INSERT INTO return_items (return_id, transaction_item_id, quantity, reason_code_id, reason_notes, condition)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [returnRecord.id, ri.transactionItemId, ri.quantity, ri.reasonCodeId, ri.reasonNotes || null, ri.condition || 'resellable']
      );

      // Restore inventory for returned items
      const orig = origItemMap.get(ri.transactionItemId);
      const _stockRes = await client.query(
        'UPDATE products SET qty_on_hand = COALESCE(qty_on_hand, 0) + $1 WHERE id = $2 RETURNING qty_on_hand',
        [ri.quantity, orig.product_id]
      );
      const _newQty = _stockRes.rows[0]?.qty_on_hand ?? 0;
      _exchangeQueue.push({ productId: orig.product_id, sku: orig.product_sku, oldQty: _newQty - ri.quantity, newQty: _newQty, source: 'RETURN' });
    }

    // 3. Create the new exchange transaction
    const txnNumResult = await client.query('SELECT generate_transaction_number() as txn_number');
    const newTxnNumber = txnNumResult.rows[0].txn_number;

    const newTxResult = await client.query(
      `INSERT INTO transactions (
        transaction_number, shift_id, customer_id, user_id,
        subtotal, discount_amount,
        hst_amount, gst_amount, pst_amount, tax_province,
        total_amount, status, is_exchange, exchange_return_id, completed_at
      ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, 'completed', true, $11, NOW())
      RETURNING transaction_id, transaction_number, created_at`,
      [
        newTxnNumber,
        shiftId || origTx.shift_id,
        origTx.customer_id,
        userId,
        newSubtotal,
        newHst, newGst, newPst, taxProvince,
        newTotal,
        returnRecord.id,
      ]
    );
    const newTx = newTxResult.rows[0];

    // 4. Insert new transaction items and update inventory
    for (const item of processedNewItems) {
      const itemTax = item.taxable
        ? Math.round(item.lineTotal * (rates.hst + rates.gst + rates.pst) * 100) / 100
        : 0;

      await client.query(
        `INSERT INTO transaction_items (
          transaction_id, product_id, product_name, product_sku,
          quantity, unit_price, unit_cost,
          discount_percent, discount_amount, tax_amount, line_total, taxable
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, $8, $9, $10)`,
        [
          newTx.transaction_id,
          item.productId, item.productName, item.productSku,
          item.quantity, item.unitPrice, item.unitCost,
          itemTax, item.lineTotal, item.taxable,
        ]
      );

      const _stockRes2 = await client.query(
        'UPDATE products SET qty_on_hand = COALESCE(qty_on_hand, 0) - $1 WHERE id = $2 RETURNING qty_on_hand',
        [item.quantity, item.productId]
      );
      const _newQty2 = _stockRes2.rows[0]?.qty_on_hand ?? 0;
      _exchangeQueue.push({ productId: item.productId, sku: item.productSku, oldQty: _newQty2 + item.quantity, newQty: _newQty2, source: 'POS_SALE' });
    }

    // 5. Handle payment for difference
    let paymentRecord = null;
    let storeCreditInfo = null;

    if (differenceCents > 0) {
      // Customer owes more — create payment on new transaction
      const pd = paymentDetails || {};
      await client.query(
        `INSERT INTO payments (
          transaction_id, payment_method, amount,
          card_last_four, card_brand, authorization_code, processor_reference,
          cash_tendered, change_given, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed')`,
        [
          newTx.transaction_id,
          paymentMethod,
          differenceCents / 100,
          pd.cardLastFour || null,
          pd.cardBrand || null,
          pd.authorizationCode || null,
          pd.processorReference || null,
          pd.cashTendered || null,
          pd.changeGiven || null,
        ]
      );
      paymentRecord = { method: paymentMethod, amountCents: differenceCents };

    } else if (differenceCents < 0) {
      // Customer gets refund for the difference
      const refundAmountCents = Math.abs(differenceCents);
      const method = differenceMethod || 'store_credit';

      if (method === 'store_credit') {
        // Issue store credit for difference
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let creditCode = 'SC-';
        for (let i = 0; i < 5; i++) creditCode += chars.charAt(crypto.randomInt(chars.length));

        const creditResult = await client.query(
          `INSERT INTO store_credits (customer_id, code, original_amount, current_balance, source_type, source_id, issued_by, notes)
           VALUES ($1, $2, $3, $3, 'return', $4, $5, $6)
           RETURNING *`,
          [origTx.customer_id || null, creditCode, refundAmountCents, returnRecord.id, userId, `Exchange difference for ${returnNumber}`]
        );

        await client.query(
          `INSERT INTO store_credit_transactions (store_credit_id, amount_cents, transaction_type, balance_after, notes, performed_by)
           VALUES ($1, $2, 'issue', $3, $4, $5)`,
          [creditResult.rows[0].id, refundAmountCents, refundAmountCents, `Exchange difference`, userId]
        );

        storeCreditInfo = {
          id: creditResult.rows[0].id,
          code: creditResult.rows[0].code,
          amountCents: refundAmountCents,
        };
      }
      // For 'cash' difference refunds, just record it — cashier handles physically
      paymentRecord = { method, amountCents: -refundAmountCents, direction: 'refund' };

    } else {
      // Even exchange — record a zero-amount exchange payment
      await client.query(
        `INSERT INTO payments (
          transaction_id, payment_method, amount, status
        ) VALUES ($1, 'cash', 0, 'completed')`,
        [newTx.transaction_id]
      );
    }

    // 6. Link the return to the exchange transaction and complete it
    await client.query(
      `UPDATE pos_returns
       SET exchange_transaction_id = $1, status = 'completed', updated_at = NOW()
       WHERE id = $2`,
      [newTx.transaction_id, returnRecord.id]
    );

    await client.query('COMMIT');

    // Queue marketplace inventory changes (non-blocking, after commit)
    for (const qi of _exchangeQueue) {
      try {
        await miraklService.queueInventoryChange(qi.productId, qi.sku, qi.oldQty, qi.newQty, qi.source);
      } catch (queueErr) {
        console.error('[MarketplaceQueue] Exchange queue error:', queueErr.message);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        returnId: returnRecord.id,
        returnNumber: returnRecord.return_number,
        exchangeTransactionId: newTx.transaction_id,
        exchangeTransactionNumber: newTx.transaction_number,
        returnCreditCents: Math.round(returnTotal * 100),
        newTotalCents: Math.round(newTotal * 100),
        differenceCents,
        payment: paymentRecord,
        storeCredit: storeCreditInfo,
        returnItems: returnItems.map(ri => {
          const orig = origItemMap.get(ri.transactionItemId);
          return { ...ri, productName: orig?.product_name };
        }),
        newItems: processedNewItems,
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
// POST /calculate — Preview exchange calculation without processing
// ============================================================================

router.post('/calculate', asyncHandler(async (req, res) => {
  const { originalTransactionId, returnItemIds, newItems } = req.body;
  // returnItemIds: [{ transactionItemId, quantity }]
  // newItems: [{ productId, quantity }]

  if (!originalTransactionId || !returnItemIds?.length || !newItems?.length) {
    throw ApiError.badRequest('originalTransactionId, returnItemIds, and newItems are required');
  }

  // Fetch original transaction
  const origTx = await pool.query(
    'SELECT * FROM transactions WHERE transaction_id = $1', [originalTransactionId]
  );
  if (origTx.rows.length === 0) {
    throw ApiError.notFound('Transaction');
  }
  const tx = origTx.rows[0];

  // Get original items
  const origItems = await pool.query(
    'SELECT * FROM transaction_items WHERE transaction_id = $1', [originalTransactionId]
  );
  const itemMap = new Map(origItems.rows.map(r => [r.item_id, r]));

  // Calculate return value
  let returnSubtotal = 0;
  for (const ri of returnItemIds) {
    const orig = itemMap.get(ri.transactionItemId);
    if (!orig) continue;
    const unitNet = Number(orig.unit_price) - (Number(orig.discount_amount || 0) / orig.quantity);
    returnSubtotal += unitNet * ri.quantity;
  }

  const origSubtotal = Number(tx.subtotal) || 1;
  const returnRatio = returnSubtotal / origSubtotal;
  const returnTax = (Number(tx.hst_amount || 0) + Number(tx.gst_amount || 0) + Number(tx.pst_amount || 0)) * returnRatio;
  const returnTotalCents = Math.round((returnSubtotal + returnTax) * 100);

  // Get new product prices
  const productIds = newItems.map(i => i.productId);
  const products = await pool.query('SELECT id, name, sku, selling_price, taxable FROM products WHERE id = ANY($1)', [productIds]);
  const productMap = new Map(products.rows.map(r => [r.id, r]));

  const taxProvince = tx.tax_province || 'ON';
  const TAX_RATES = {
    ON: { hst: 0.13, gst: 0, pst: 0 },
    BC: { hst: 0, gst: 0.05, pst: 0.07 },
    AB: { hst: 0, gst: 0.05, pst: 0 },
    SK: { hst: 0, gst: 0.05, pst: 0.06 },
    MB: { hst: 0, gst: 0.05, pst: 0.07 },
    QC: { hst: 0, gst: 0.05, pst: 0.09975 },
  };
  const rates = TAX_RATES[taxProvince] || { hst: 0.13, gst: 0, pst: 0 };

  let newSubtotal = 0;
  const calculatedNewItems = newItems.map(ni => {
    const prod = productMap.get(ni.productId);
    if (!prod) return null;
    const lineTotal = Number(prod.selling_price) * ni.quantity;
    newSubtotal += lineTotal;
    return {
      productId: prod.id,
      productName: prod.name,
      productSku: prod.sku,
      unitPrice: Number(prod.selling_price),
      quantity: ni.quantity,
      lineTotal,
      taxable: prod.taxable !== false,
    };
  }).filter(Boolean);

  const taxableSubtotal = calculatedNewItems.reduce((s, i) => s + (i.taxable ? i.lineTotal : 0), 0);
  const newTax = Math.round(taxableSubtotal * (rates.hst + rates.gst + rates.pst) * 100) / 100;
  const newTotalCents = Math.round((newSubtotal + newTax) * 100);

  const differenceCents = newTotalCents - returnTotalCents;

  res.json({
    success: true,
    data: {
      returnCreditCents: returnTotalCents,
      newTotalCents,
      differenceCents,
      customerOwes: differenceCents > 0,
      customerRefund: differenceCents < 0,
      evenExchange: differenceCents === 0,
      newItems: calculatedNewItems,
    }
  });
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
