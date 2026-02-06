/**
 * TeleTime - Hub Exchanges API
 * Atomic exchange processing: return items + create new order in one transaction.
 * Handles price differences (customer pays or gets refund/credit).
 */

const express = require('express');
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');

const TAX_RATES = {
  ON: { hst: 0.13, gst: 0, pst: 0 },
  AB: { hst: 0, gst: 0.05, pst: 0 },
  BC: { hst: 0, gst: 0.05, pst: 0.07 },
  SK: { hst: 0, gst: 0.05, pst: 0.06 },
  MB: { hst: 0, gst: 0.05, pst: 0.07 },
  QC: { hst: 0, gst: 0.05, pst: 0.09975 },
  NB: { hst: 0.15, gst: 0, pst: 0 },
  NS: { hst: 0.15, gst: 0, pst: 0 },
  NL: { hst: 0.15, gst: 0, pst: 0 },
  PE: { hst: 0.15, gst: 0, pst: 0 },
};

function init({ pool }) {
  const router = express.Router();
  router.use(authenticate);

  // ---- Helper: generate unique store credit code ----
  function generateSCCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'SC-';
    for (let i = 0; i < 5; i++) code += chars.charAt(crypto.randomInt(chars.length));
    return code;
  }

  // ===========================================================================
  // POST / — Process exchange
  // ===========================================================================

  router.post('/', async (req, res) => {
    const {
      original_order_id,
      return_items,    // [{ order_item_id, quantity, reason_code_id, reason_notes, item_condition }]
      new_items,       // [{ product_id, quantity, unit_price }]  unit_price in cents
      payment_method,  // if customer owes more: 'cash'|'credit_card'|'debit_card'
      refund_method,   // if customer gets money back: 'original_payment'|'store_credit'|'cash'
      notes,
    } = req.body;
    const userId = req.user?.userId || req.user?.id;

    // ---- Validate inputs ----
    if (!original_order_id) return res.status(400).json({ error: 'original_order_id is required' });
    if (!return_items?.length) return res.status(400).json({ error: 'return_items are required' });
    if (!new_items?.length) return res.status(400).json({ error: 'new_items are required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ---- 1. Load original order ----
      const orderResult = await client.query(
        `SELECT uo.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
         FROM unified_orders uo
         LEFT JOIN customers c ON c.id = uo.customer_id
         WHERE uo.id = $1
         FOR UPDATE OF uo`,
        [original_order_id]
      );
      if (!orderResult.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Original order not found' });
      }
      const origOrder = orderResult.rows[0];

      if (!['completed', 'paid', 'fulfilled', 'delivered'].includes(origOrder.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Cannot exchange: order status is '${origOrder.status}'` });
      }

      // ---- 2. Validate return items & calculate return value ----
      const returnItemIds = return_items.map(i => i.order_item_id);
      const origItemsResult = await client.query(
        `SELECT id, product_id, product_name, product_sku, quantity, unit_price_cents
         FROM unified_order_items WHERE id = ANY($1) AND order_id = $2`,
        [returnItemIds, original_order_id]
      );
      const origItemMap = {};
      for (const row of origItemsResult.rows) origItemMap[row.id] = row;

      let returnSubtotalCents = 0;
      const validatedReturns = [];

      for (const ri of return_items) {
        const origItem = origItemMap[ri.order_item_id];
        if (!origItem) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Order item ${ri.order_item_id} not found in this order` });
        }
        if (ri.quantity < 1 || ri.quantity > origItem.quantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Invalid quantity ${ri.quantity} for '${origItem.product_name}' (max ${origItem.quantity})` });
        }

        // Check already-returned quantity
        const existingResult = await client.query(
          `SELECT COALESCE(SUM(hri.quantity), 0)::int AS returned
           FROM hub_return_items hri JOIN hub_returns hr ON hr.id = hri.return_id
           WHERE hri.original_order_item_id = $1 AND hr.status NOT IN ('cancelled','rejected')`,
          [ri.order_item_id]
        );
        const maxReturnable = origItem.quantity - existingResult.rows[0].returned;
        if (ri.quantity > maxReturnable) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Cannot return ${ri.quantity} of '${origItem.product_name}': only ${maxReturnable} remaining` });
        }

        const itemRefund = origItem.unit_price_cents * ri.quantity;
        returnSubtotalCents += itemRefund;

        validatedReturns.push({
          orderItemId: ri.order_item_id,
          productId: origItem.product_id,
          productName: origItem.product_name,
          quantity: ri.quantity,
          unitPriceCents: origItem.unit_price_cents,
          refundAmountCents: itemRefund,
          reasonCodeId: ri.reason_code_id,
          reasonNotes: ri.reason_notes || null,
          itemCondition: ri.item_condition || 'resellable',
        });
      }

      // ---- 3. Validate new items & calculate new order value ----
      let newSubtotalCents = 0;
      const validatedNewItems = [];

      for (const ni of new_items) {
        if (!ni.product_id || !ni.quantity || ni.quantity < 1) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Each new item requires product_id and quantity >= 1' });
        }

        // Get product info + price
        const prodResult = await client.query(
          'SELECT id, name, sku, price, cost FROM products WHERE id = $1',
          [ni.product_id]
        );
        if (!prodResult.rows.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Product ${ni.product_id} not found` });
        }
        const product = prodResult.rows[0];

        // Use provided unit_price (cents) or product price (dollars → cents)
        const unitPriceCents = ni.unit_price != null
          ? Math.round(ni.unit_price)
          : Math.round(parseFloat(product.price) * 100);
        const unitCostCents = product.cost ? Math.round(parseFloat(product.cost) * 100) : 0;
        const lineTotal = unitPriceCents * ni.quantity;
        newSubtotalCents += lineTotal;

        validatedNewItems.push({
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          quantity: ni.quantity,
          unitPriceCents,
          unitCostCents,
          lineTotalCents: lineTotal,
        });
      }

      // ---- 4. Calculate tax and difference ----
      const province = origOrder.tax_province || 'ON';
      const rates = TAX_RATES[province] || TAX_RATES.ON;
      const totalTaxRate = rates.hst + rates.gst + rates.pst;

      const returnTaxCents = origOrder.tax_exempt ? 0 : Math.round(returnSubtotalCents * totalTaxRate);
      const returnTotalCents = returnSubtotalCents + returnTaxCents;

      const newTaxCents = origOrder.tax_exempt ? 0 : Math.round(newSubtotalCents * totalTaxRate);
      const newTotalCents = newSubtotalCents + newTaxCents;

      const differenceCents = newTotalCents - returnTotalCents;
      // positive = customer pays, negative = customer gets refund, zero = even

      // ---- 5. Create return record (type = 'exchange') ----
      const rtnNumResult = await client.query('SELECT generate_return_number() AS rtn');
      const returnNumber = rtnNumResult.rows[0].rtn;

      const returnResult = await client.query(
        `INSERT INTO hub_returns (
          return_number, original_order_id, customer_id,
          return_type, status,
          refund_subtotal, refund_tax, refund_total,
          refund_method, initiated_by, notes, initiated_at
        ) VALUES ($1,$2,$3,'exchange','processing',$4,$5,$6,$7,$8,$9,NOW())
        RETURNING *`,
        [
          returnNumber, original_order_id, origOrder.customer_id,
          returnSubtotalCents, returnTaxCents, returnTotalCents,
          differenceCents < 0 ? (refund_method || 'store_credit') : null,
          userId, notes || `Exchange on order ${origOrder.order_number}`,
        ]
      );
      const returnRecord = returnResult.rows[0];

      // Insert return items
      for (const item of validatedReturns) {
        const disposition = item.itemCondition === 'resellable' ? 'return_to_stock' :
                            item.itemCondition === 'damaged' ? 'clearance' :
                            item.itemCondition === 'defective' ? 'rma_vendor' : 'dispose';

        await client.query(
          `INSERT INTO hub_return_items (
            return_id, original_order_item_id, product_id,
            quantity, unit_price_cents, refund_amount_cents,
            reason_code_id, reason_notes, item_condition, disposition
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            returnRecord.id, item.orderItemId, item.productId,
            item.quantity, item.unitPriceCents, item.refundAmountCents,
            item.reasonCodeId, item.reasonNotes, item.itemCondition, disposition,
          ]
        );
      }

      // ---- 6. Process inventory for returned items ----
      for (const item of validatedReturns) {
        const disposition = item.itemCondition === 'resellable' ? 'return_to_stock' :
                            item.itemCondition === 'damaged' ? 'clearance' :
                            item.itemCondition === 'defective' ? 'rma_vendor' : 'dispose';

        if (disposition === 'return_to_stock' || disposition === 'clearance') {
          try {
            await client.query(
              `SELECT * FROM restore_inventory($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [
                item.productId, item.quantity,
                `Exchange return: ${returnNumber}`, 'return', returnRecord.id,
                returnNumber, userId, null, null,
              ]
            );
          } catch (invErr) {
            console.error(`[Exchange] Inventory restore failed for product ${item.productId}:`, invErr.message);
          }
        } else {
          // RMA/dispose — audit only
          await client.query(
            `INSERT INTO inventory_transactions (
              product_id, transaction_type, quantity, qty_before, qty_after,
              reserved_before, reserved_after, reference_type, reference_id,
              reference_number, reason, created_by
            ) SELECT $1, 'damage', 0, qty_on_hand, qty_on_hand, qty_reserved, qty_reserved,
                     'return', $2, $3, $4, $5
            FROM products WHERE id = $1`,
            [item.productId, returnRecord.id, returnNumber,
             `Exchange ${disposition}: ${returnNumber}`, userId]
          );
        }
      }

      // ---- 7. Create new exchange order ----
      const newOrderNumResult = await client.query(
        `SELECT generate_order_number($1) as order_number`, ['EXC']
      );
      const newOrderNumber = newOrderNumResult.rows[0].order_number;

      const newOrderResult = await client.query(
        `INSERT INTO unified_orders (
          order_number, source, status,
          customer_id, customer_name, customer_email, customer_phone, customer_address,
          created_by, salesperson_id,
          subtotal_cents, taxable_amount_cents,
          tax_province, hst_rate, gst_rate, pst_rate,
          hst_cents, gst_cents, pst_cents,
          tax_exempt, tax_exempt_number,
          total_cents, amount_paid_cents,
          fulfillment_type,
          is_exchange, original_return_id,
          internal_notes, metadata
        ) VALUES (
          $1, 'exchange', 'order_processing',
          $2, $3, $4, $5, $6,
          $7, $8,
          $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17,
          $18, $19,
          $20, 0,
          $21,
          true, $22,
          $23, $24
        ) RETURNING *`,
        [
          newOrderNumber,
          origOrder.customer_id, origOrder.customer_name, origOrder.customer_email,
          origOrder.customer_phone, origOrder.customer_address,
          userId, origOrder.salesperson_id,
          newSubtotalCents, newSubtotalCents,
          province, rates.hst, rates.gst, rates.pst,
          origOrder.tax_exempt ? 0 : Math.round(newSubtotalCents * rates.hst),
          origOrder.tax_exempt ? 0 : Math.round(newSubtotalCents * rates.gst),
          origOrder.tax_exempt ? 0 : Math.round(newSubtotalCents * rates.pst),
          origOrder.tax_exempt || false, origOrder.tax_exempt_number || null,
          newTotalCents,
          origOrder.fulfillment_type || 'pickup',
          returnRecord.id,
          `Exchange from order ${origOrder.order_number} (return ${returnNumber})`,
          JSON.stringify({ exchange: true, original_order_id, return_id: returnRecord.id }),
        ]
      );
      const newOrder = newOrderResult.rows[0];

      // ---- 8. Insert new order items & deduct inventory ----
      let sortOrder = 0;
      for (const item of validatedNewItems) {
        sortOrder++;
        await client.query(
          `INSERT INTO unified_order_items (
            order_id, product_id, product_sku, product_name,
            quantity, unit_price_cents, unit_cost_cents,
            line_total_cents, sort_order
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            newOrder.id, item.productId, item.productSku, item.productName,
            item.quantity, item.unitPriceCents, item.unitCostCents,
            item.lineTotalCents, sortOrder,
          ]
        );

        // Deduct inventory for new items
        await client.query(
          `UPDATE products SET qty_on_hand = qty_on_hand - $1, updated_at = NOW() WHERE id = $2`,
          [item.quantity, item.productId]
        );
        await client.query(
          `INSERT INTO inventory_transactions (
            product_id, transaction_type, quantity, qty_before, qty_after,
            reserved_before, reserved_after, reference_type, reference_id,
            reference_number, reason, created_by
          ) SELECT $1, 'sale', $2,
                   qty_on_hand + $3, qty_on_hand, qty_reserved, qty_reserved,
                   'order', $4, $5, $6, $7
          FROM products WHERE id = $1`,
          [
            item.productId, -item.quantity, item.quantity,
            newOrder.id, newOrderNumber,
            `Exchange sale: ${newOrderNumber}`, userId,
          ]
        );
      }

      // ---- 9. Handle price difference ----
      let paymentInfo = null;

      if (differenceCents > 0) {
        // Customer owes more — record payment on new order
        const method = payment_method || 'cash';
        await client.query(
          `INSERT INTO unified_order_payments (
            order_id, payment_method, amount_cents, status,
            is_refund, processed_by, processed_at, notes
          ) VALUES ($1,$2,$3,'completed',false,$4,NOW(),$5)`,
          [newOrder.id, method, differenceCents, userId,
           `Difference payment for exchange ${returnNumber}`]
        );

        // Also credit the return value as a "payment" from the exchange
        await client.query(
          `INSERT INTO unified_order_payments (
            order_id, payment_method, amount_cents, status,
            is_refund, processed_by, processed_at, notes
          ) VALUES ($1,'exchange_credit',$2,'completed',false,$3,NOW(),$4)`,
          [newOrder.id, returnTotalCents, userId,
           `Exchange credit from return ${returnNumber}`]
        );

        // Update amount_paid
        await client.query(
          `UPDATE unified_orders SET amount_paid_cents = $1, status = 'paid', updated_at = NOW() WHERE id = $2`,
          [newTotalCents, newOrder.id]
        );

        paymentInfo = {
          type: 'customer_pays',
          method,
          amountCents: differenceCents,
          amount: differenceCents / 100,
        };

      } else if (differenceCents < 0) {
        // Customer gets money back
        const absDiff = Math.abs(differenceCents);
        const method = refund_method || 'store_credit';

        // Credit the full return value as exchange payment on the new order
        await client.query(
          `INSERT INTO unified_order_payments (
            order_id, payment_method, amount_cents, status,
            is_refund, processed_by, processed_at, notes
          ) VALUES ($1,'exchange_credit',$2,'completed',false,$3,NOW(),$4)`,
          [newOrder.id, newTotalCents, userId,
           `Exchange credit from return ${returnNumber}`]
        );

        await client.query(
          `UPDATE unified_orders SET amount_paid_cents = $1, status = 'paid', updated_at = NOW() WHERE id = $2`,
          [newTotalCents, newOrder.id]
        );

        // Issue refund for the difference
        if (method === 'store_credit') {
          // Generate store credit
          let scCode;
          for (let i = 0; i < 10; i++) {
            scCode = generateSCCode();
            const exists = await client.query('SELECT 1 FROM store_credits WHERE code = $1', [scCode]);
            if (!exists.rows.length) break;
          }

          const scResult = await client.query(
            `INSERT INTO store_credits (
              customer_id, code, original_amount, current_balance,
              source_type, source_id, issued_by, notes
            ) VALUES ($1,$2,$3,$3,'refund',$4,$5,$6)
            RETURNING *`,
            [origOrder.customer_id, scCode, absDiff, returnRecord.id, userId,
             `Exchange refund difference: ${returnNumber}`]
          );

          await client.query(
            `INSERT INTO store_credit_transactions (
              store_credit_id, amount_cents, transaction_type, balance_after, notes, performed_by
            ) VALUES ($1,$2,'issue',$3,$4,$5)`,
            [scResult.rows[0].id, absDiff, absDiff, `Exchange difference refund ${returnNumber}`, userId]
          );

          paymentInfo = {
            type: 'customer_refund',
            method: 'store_credit',
            storeCreditCode: scCode,
            amountCents: absDiff,
            amount: absDiff / 100,
          };
        } else if (method === 'cash') {
          // Record refund payment on original order
          await client.query(
            `INSERT INTO unified_order_payments (
              order_id, payment_method, amount_cents, status,
              is_refund, refund_reason, processed_by, processed_at, notes
            ) VALUES ($1,'cash',$2,'completed',true,$3,$4,NOW(),$5)`,
            [original_order_id, -absDiff, `Exchange difference refund`,
             userId, `Cash refund for exchange ${returnNumber}`]
          );

          paymentInfo = {
            type: 'customer_refund',
            method: 'cash',
            amountCents: absDiff,
            amount: absDiff / 100,
          };
        } else {
          // original_payment — record as refund on original order
          await client.query(
            `INSERT INTO unified_order_payments (
              order_id, payment_method, amount_cents, status,
              is_refund, refund_reason, processed_by, processed_at, notes
            ) VALUES ($1,'original_payment',$2,'completed',true,$3,$4,NOW(),$5)`,
            [original_order_id, -absDiff, `Exchange difference refund`,
             userId, `Refund to original payment for exchange ${returnNumber}`]
          );

          paymentInfo = {
            type: 'customer_refund',
            method: 'original_payment',
            amountCents: absDiff,
            amount: absDiff / 100,
          };
        }

      } else {
        // Even exchange
        await client.query(
          `INSERT INTO unified_order_payments (
            order_id, payment_method, amount_cents, status,
            is_refund, processed_by, processed_at, notes
          ) VALUES ($1,'exchange_credit',$2,'completed',false,$3,NOW(),$4)`,
          [newOrder.id, newTotalCents, userId,
           `Even exchange from return ${returnNumber}`]
        );

        await client.query(
          `UPDATE unified_orders SET amount_paid_cents = $1, status = 'paid', updated_at = NOW() WHERE id = $2`,
          [newTotalCents, newOrder.id]
        );

        paymentInfo = { type: 'even_exchange', amountCents: 0, amount: 0 };
      }

      // ---- 10. Link return → new order ----
      await client.query(
        `UPDATE hub_returns SET exchange_order_id = $1, status = 'completed', completed_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [newOrder.id, returnRecord.id]
      );

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        data: {
          return_id: returnRecord.id,
          return_number: returnNumber,
          new_order_id: newOrder.id,
          new_order_number: newOrderNumber,
          return_value: {
            subtotalCents: returnSubtotalCents,
            subtotal: returnSubtotalCents / 100,
            taxCents: returnTaxCents,
            tax: returnTaxCents / 100,
            totalCents: returnTotalCents,
            total: returnTotalCents / 100,
          },
          new_order_value: {
            subtotalCents: newSubtotalCents,
            subtotal: newSubtotalCents / 100,
            taxCents: newTaxCents,
            tax: newTaxCents / 100,
            totalCents: newTotalCents,
            total: newTotalCents / 100,
          },
          differenceCents,
          difference: differenceCents / 100,
          payment: paymentInfo,
          items_returned: validatedReturns.map(r => ({
            product: r.productName,
            quantity: r.quantity,
            valueCents: r.refundAmountCents,
          })),
          items_new: validatedNewItems.map(n => ({
            product: n.productName,
            quantity: n.quantity,
            valueCents: n.lineTotalCents,
          })),
        },
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[Exchange] Error:', err);
      res.status(err.statusCode || 500).json({ error: err.message || 'Exchange processing failed' });
    } finally {
      client.release();
    }
  });

  // ===========================================================================
  // GET /:id — Get exchange details by return ID
  // ===========================================================================

  router.get('/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const result = await pool.query(
        `SELECT hr.*,
                orig.order_number AS original_order_number, orig.total_cents AS original_order_total_cents,
                exc.id AS exchange_order_id, exc.order_number AS exchange_order_number,
                exc.total_cents AS exchange_order_total_cents, exc.status AS exchange_order_status,
                c.name AS customer_name, c.email AS customer_email
         FROM hub_returns hr
         LEFT JOIN unified_orders orig ON orig.id = hr.original_order_id
         LEFT JOIN unified_orders exc ON exc.id = hr.exchange_order_id
         LEFT JOIN customers c ON c.id = hr.customer_id
         WHERE hr.id = $1 AND hr.return_type = 'exchange'`,
        [id]
      );

      if (!result.rows.length) return res.status(404).json({ error: 'Exchange not found' });

      const row = result.rows[0];

      // Get return items
      const returnItems = await pool.query(
        `SELECT hri.*, p.name AS product_name, rrc.description AS reason
         FROM hub_return_items hri
         LEFT JOIN products p ON p.id = hri.product_id
         LEFT JOIN return_reason_codes rrc ON rrc.id = hri.reason_code_id
         WHERE hri.return_id = $1`,
        [id]
      );

      // Get new order items
      let newItems = [];
      if (row.exchange_order_id) {
        const newItemsResult = await pool.query(
          `SELECT product_id, product_name, product_sku, quantity, unit_price_cents, line_total_cents
           FROM unified_order_items WHERE order_id = $1 ORDER BY sort_order`,
          [row.exchange_order_id]
        );
        newItems = newItemsResult.rows;
      }

      res.json({
        success: true,
        data: {
          id: row.id,
          returnNumber: row.return_number,
          status: row.status,
          originalOrder: {
            id: row.original_order_id,
            orderNumber: row.original_order_number,
            totalCents: row.original_order_total_cents,
          },
          exchangeOrder: row.exchange_order_id ? {
            id: row.exchange_order_id,
            orderNumber: row.exchange_order_number,
            totalCents: row.exchange_order_total_cents,
            status: row.exchange_order_status,
          } : null,
          customer: { name: row.customer_name, email: row.customer_email },
          returnValueCents: row.refund_total,
          returnItems: returnItems.rows,
          newItems,
          differenceCents: (row.exchange_order_total_cents || 0) - row.refund_total,
          createdAt: row.created_at,
          completedAt: row.completed_at,
        },
      });
    } catch (err) {
      console.error('[Exchange] GET error:', err);
      res.status(500).json({ error: 'Failed to get exchange details' });
    }
  });

  return router;
}

module.exports = { init };
