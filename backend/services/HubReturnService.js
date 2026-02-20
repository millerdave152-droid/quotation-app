/**
 * TeleTime - Hub Return Service
 * Manages returns against unified_orders with item-level tracking,
 * refund calculation, and status workflow.
 */

const crypto = require('crypto');
const { ApiError } = require('../middleware/errorHandler');

class HubReturnService {
  constructor(pool, opts = {}) {
    this.pool = pool;
    this.stripeService = opts.stripeService || null;
  }

  // ==========================================================================
  // CREATE RETURN
  // ==========================================================================

  async create(data, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify order exists
      const orderResult = await client.query(
        `SELECT uo.id, uo.order_number, uo.customer_id, uo.status, uo.total_cents,
                uo.hst_rate, uo.gst_rate, uo.pst_rate, uo.tax_exempt
         FROM unified_orders uo
         WHERE uo.id = $1`,
        [data.originalOrderId]
      );
      if (orderResult.rows.length === 0) {
        throw ApiError.notFound('Order');
      }
      const order = orderResult.rows[0];

      if (!['completed', 'paid', 'fulfilled', 'delivered'].includes(order.status)) {
        throw ApiError.badRequest(`Cannot initiate return: order status is '${order.status}'`);
      }

      // Validate items
      if (!data.items || data.items.length === 0) {
        throw ApiError.badRequest('At least one return item is required');
      }

      // Fetch original order items to validate quantities and prices
      const orderItemIds = data.items.map(i => i.orderItemId);
      const orderItemsResult = await client.query(
        `SELECT id, product_id, product_name, quantity, unit_price_cents
         FROM unified_order_items
         WHERE id = ANY($1) AND order_id = $2`,
        [orderItemIds, data.originalOrderId]
      );

      const orderItemMap = {};
      for (const row of orderItemsResult.rows) {
        orderItemMap[row.id] = row;
      }

      // Validate each return item
      let refundSubtotal = 0;
      const validatedItems = [];

      for (const item of data.items) {
        const orderItem = orderItemMap[item.orderItemId];
        if (!orderItem) {
          throw ApiError.badRequest(`Order item ${item.orderItemId} not found in this order`);
        }

        if (item.quantity < 1 || item.quantity > orderItem.quantity) {
          throw ApiError.badRequest(
            `Invalid quantity ${item.quantity} for item '${orderItem.product_name}' (max: ${orderItem.quantity})`
          );
        }

        // Check for existing returns on this item
        const existingReturns = await client.query(
          `SELECT COALESCE(SUM(hri.quantity), 0)::INTEGER AS returned_qty
           FROM hub_return_items hri
           JOIN hub_returns hr ON hr.id = hri.return_id
           WHERE hri.original_order_item_id = $1
             AND hr.status NOT IN ('cancelled', 'rejected')`,
          [item.orderItemId]
        );
        const alreadyReturned = existingReturns.rows[0].returned_qty;
        const maxReturnable = orderItem.quantity - alreadyReturned;

        if (item.quantity > maxReturnable) {
          throw ApiError.badRequest(
            `Cannot return ${item.quantity} of '${orderItem.product_name}': only ${maxReturnable} remaining (${alreadyReturned} already returned)`
          );
        }

        const itemRefund = orderItem.unit_price_cents * item.quantity;
        refundSubtotal += itemRefund;

        validatedItems.push({
          orderItemId: item.orderItemId,
          productId: orderItem.product_id,
          quantity: item.quantity,
          unitPriceCents: orderItem.unit_price_cents,
          refundAmountCents: itemRefund,
          reasonCodeId: item.reasonCodeId,
          reasonNotes: item.reasonNotes || null,
          itemCondition: item.itemCondition || 'resellable',
        });
      }

      // Calculate tax on refund
      let refundTax = 0;
      if (!order.tax_exempt) {
        const taxRate = parseFloat(order.hst_rate || 0) +
                        parseFloat(order.gst_rate || 0) +
                        parseFloat(order.pst_rate || 0);
        refundTax = Math.round(refundSubtotal * taxRate);
      }

      const refundTotal = refundSubtotal + refundTax;

      // Determine return type
      const returnType = data.returnType || (
        validatedItems.length === orderItemsResult.rows.length &&
        validatedItems.every((vi, i) => vi.quantity === orderItemsResult.rows.find(oi => oi.id === vi.orderItemId)?.quantity)
          ? 'full'
          : 'partial'
      );

      // Generate return number
      const numResult = await client.query('SELECT generate_return_number() AS return_number');
      const returnNumber = numResult.rows[0].return_number;

      // Insert return
      const returnResult = await client.query(
        `INSERT INTO hub_returns (
          return_number, original_order_id, customer_id,
          return_type, status,
          refund_subtotal, refund_tax, refund_total,
          refund_method,
          initiated_by, notes, initiated_at
        ) VALUES ($1, $2, $3, $4, 'initiated', $5, $6, $7, $8, $9, $10, NOW())
        RETURNING *`,
        [
          returnNumber,
          data.originalOrderId,
          order.customer_id,
          returnType,
          refundSubtotal,
          refundTax,
          refundTotal,
          data.refundMethod || null,
          userId,
          data.notes || null,
        ]
      );
      const returnRecord = returnResult.rows[0];

      // Insert return items
      for (const item of validatedItems) {
        await client.query(
          `INSERT INTO hub_return_items (
            return_id, original_order_item_id, product_id,
            quantity, unit_price_cents, refund_amount_cents,
            reason_code_id, reason_notes, item_condition
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            returnRecord.id,
            item.orderItemId,
            item.productId,
            item.quantity,
            item.unitPriceCents,
            item.refundAmountCents,
            item.reasonCodeId,
            item.reasonNotes,
            item.itemCondition,
          ]
        );
      }

      await client.query('COMMIT');

      return this.getById(returnRecord.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // GET BY ID
  // ==========================================================================

  async getById(id) {
    const result = await this.pool.query(
      `SELECT hr.*,
              uo.order_number AS original_order_number,
              uo.total_cents AS original_order_total,
              c.name AS customer_name,
              c.email AS customer_email,
              c.phone AS customer_phone,
              CONCAT(iu.first_name, ' ', iu.last_name) AS initiated_by_name,
              CONCAT(au.first_name, ' ', au.last_name) AS approved_by_name,
              CONCAT(pu.first_name, ' ', pu.last_name) AS processed_by_name
       FROM hub_returns hr
       JOIN unified_orders uo ON uo.id = hr.original_order_id
       LEFT JOIN customers c ON c.id = hr.customer_id
       LEFT JOIN users iu ON iu.id = hr.initiated_by
       LEFT JOIN users au ON au.id = hr.approved_by
       LEFT JOIN users pu ON pu.id = hr.processed_by
       WHERE hr.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Fetch return items
    const itemsResult = await this.pool.query(
      `SELECT hri.*,
              rrc.code AS reason_code,
              rrc.description AS reason_description,
              uoi.product_name, uoi.product_sku, uoi.manufacturer, uoi.model
       FROM hub_return_items hri
       JOIN return_reason_codes rrc ON rrc.id = hri.reason_code_id
       JOIN unified_order_items uoi ON uoi.id = hri.original_order_item_id
       WHERE hri.return_id = $1
       ORDER BY hri.id`,
      [id]
    );

    return {
      ...this._mapReturnRow(row),
      items: itemsResult.rows.map(item => ({
        id: item.id,
        originalOrderItemId: item.original_order_item_id,
        productId: item.product_id,
        productName: item.product_name,
        productSku: item.product_sku,
        manufacturer: item.manufacturer,
        model: item.model,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
        unitPrice: item.unit_price_cents / 100,
        refundAmountCents: item.refund_amount_cents,
        refundAmount: item.refund_amount_cents / 100,
        reasonCode: item.reason_code,
        reasonDescription: item.reason_description,
        reasonNotes: item.reason_notes,
        itemCondition: item.item_condition,
        disposition: item.disposition,
      })),
    };
  }

  // ==========================================================================
  // SEARCH
  // ==========================================================================

  async search(filters = {}, pagination = {}) {
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`hr.status = $${paramIndex++}`);
      values.push(filters.status);
    }
    if (filters.customerId) {
      conditions.push(`hr.customer_id = $${paramIndex++}`);
      values.push(filters.customerId);
    }
    if (filters.originalOrderId) {
      conditions.push(`hr.original_order_id = $${paramIndex++}`);
      values.push(filters.originalOrderId);
    }
    if (filters.dateFrom) {
      conditions.push(`hr.initiated_at >= $${paramIndex++}`);
      values.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push(`hr.initiated_at <= $${paramIndex++}::date + INTERVAL '1 day'`);
      values.push(filters.dateTo);
    }
    if (filters.search) {
      conditions.push(`(hr.return_number ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const page = pagination.page || 1;
    const limit = Math.min(pagination.limit || 50, 100);
    const offset = (page - 1) * limit;

    // Count
    const countValues = [...values];
    const countResult = await this.pool.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM hub_returns hr
       LEFT JOIN customers c ON c.id = hr.customer_id
       ${whereClause}`,
      countValues
    );
    const total = countResult.rows[0].total;

    // Data
    values.push(limit, offset);
    const result = await this.pool.query(
      `SELECT hr.*,
              uo.order_number AS original_order_number,
              c.name AS customer_name,
              c.email AS customer_email,
              CONCAT(iu.first_name, ' ', iu.last_name) AS initiated_by_name,
              (SELECT COUNT(*)::INTEGER FROM hub_return_items WHERE return_id = hr.id) AS item_count
       FROM hub_returns hr
       JOIN unified_orders uo ON uo.id = hr.original_order_id
       LEFT JOIN customers c ON c.id = hr.customer_id
       LEFT JOIN users iu ON iu.id = hr.initiated_by
       ${whereClause}
       ORDER BY hr.initiated_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      values
    );

    return {
      data: result.rows.map(row => ({
        ...this._mapReturnRow(row),
        itemCount: row.item_count,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ==========================================================================
  // STATUS TRANSITIONS
  // ==========================================================================

  async approve(returnId, userId) {
    return this._transition(returnId, 'approved', {
      from: ['initiated'],
      setFields: { approved_by: userId, approved_at: 'NOW()' },
    });
  }

  async reject(returnId, userId, reason) {
    return this._transition(returnId, 'rejected', {
      from: ['initiated'],
      setFields: { approved_by: userId, approved_at: 'NOW()', notes: reason },
    });
  }

  async startProcessing(returnId, userId) {
    return this._transition(returnId, 'processing', {
      from: ['approved'],
      setFields: { processed_by: userId },
    });
  }

  async complete(returnId, userId) {
    return this._transition(returnId, 'completed', {
      from: ['processing'],
      setFields: { processed_by: userId, completed_at: 'NOW()' },
    });
  }

  async cancel(returnId) {
    return this._transition(returnId, 'cancelled', {
      from: ['initiated', 'approved'],
    });
  }

  async _transition(returnId, newStatus, options) {
    const result = await this.pool.query(
      'SELECT id, status FROM hub_returns WHERE id = $1',
      [returnId]
    );
    if (result.rows.length === 0) {
      throw ApiError.notFound('Return');
    }

    const current = result.rows[0];
    if (!options.from.includes(current.status)) {
      throw ApiError.badRequest(
        `Cannot transition from '${current.status}' to '${newStatus}'`
      );
    }

    const sets = ['status = $1', 'updated_at = NOW()'];
    const values = [newStatus];
    let paramIndex = 2;

    if (options.setFields) {
      for (const [col, val] of Object.entries(options.setFields)) {
        if (val === 'NOW()') {
          sets.push(`${col} = NOW()`);
        } else {
          sets.push(`${col} = $${paramIndex++}`);
          values.push(val);
        }
      }
    }

    values.push(returnId);
    await this.pool.query(
      `UPDATE hub_returns SET ${sets.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    return this.getById(returnId);
  }

  // ==========================================================================
  // PROCESS REFUND
  // ==========================================================================

  /**
   * Process the actual refund for a return.
   * Handles original_payment (Stripe), store_credit, and cash refund methods.
   * @param {number} returnId
   * @param {string} refundMethod - 'original_payment' | 'store_credit' | 'cash'
   * @param {number} userId - Staff processing the refund
   * @param {Object} opts - Optional: { shiftId } for cash refunds
   */
  async processRefund(returnId, refundMethod, userId, opts = {}) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Load the return with a row lock
      const returnResult = await client.query(
        `SELECT hr.*, c.name AS customer_name, c.email AS customer_email
         FROM hub_returns hr
         LEFT JOIN customers c ON c.id = hr.customer_id
         WHERE hr.id = $1
         FOR UPDATE OF hr`,
        [returnId]
      );
      if (returnResult.rows.length === 0) {
        throw ApiError.notFound('Return');
      }
      const ret = returnResult.rows[0];

      if (!['approved', 'processing'].includes(ret.status)) {
        throw ApiError.badRequest(
          `Cannot process refund: return status is '${ret.status}'. Must be 'approved' or 'processing'.`
        );
      }

      const refundAmountCents = ret.refund_total - (ret.restocking_fee || 0);
      if (refundAmountCents <= 0) {
        throw ApiError.badRequest('Refund amount must be greater than zero after restocking fee');
      }

      let stripeRefundId = null;
      let storeCreditId = null;
      let storeCreditCode = null;
      const refundDetails = { method: refundMethod, amountCents: refundAmountCents };

      // ----- ORIGINAL PAYMENT REFUND -----
      if (refundMethod === 'original_payment') {
        // Find original order payments with Stripe references
        const paymentsResult = await client.query(
          `SELECT id, payment_method, amount_cents, processor_reference, status
           FROM unified_order_payments
           WHERE order_id = $1 AND status = 'completed' AND is_refund = false
           ORDER BY amount_cents DESC`,
          [ret.original_order_id]
        );

        if (paymentsResult.rows.length === 0) {
          throw ApiError.badRequest('No completed payments found on original order');
        }

        let remainingRefund = refundAmountCents;
        const refundAllocations = [];

        for (const payment of paymentsResult.rows) {
          if (remainingRefund <= 0) break;

          const allocationCents = Math.min(remainingRefund, payment.amount_cents);

          // Attempt Stripe refund for card payments
          if (['credit_card', 'debit_card'].includes(payment.payment_method) && payment.processor_reference) {
            if (!this.stripeService?.isConfigured()) {
              throw ApiError.badRequest(
                'Stripe is not configured. Cannot refund card payments. Use store_credit or cash instead.'
              );
            }

            try {
              const refund = await this.stripeService.refundPayment(
                payment.processor_reference,
                allocationCents,
                'requested_by_customer'
              );
              stripeRefundId = stripeRefundId || refund.id;

              refundAllocations.push({
                paymentId: payment.id,
                amount: allocationCents,
                method: payment.payment_method,
                stripeRefundId: refund.id,
              });
            } catch (stripeErr) {
              await client.query('ROLLBACK');
              throw ApiError.create(502, `Stripe refund failed: ${stripeErr.message}`);
            }
          } else {
            // Non-card payment — record allocation without external call
            refundAllocations.push({
              paymentId: payment.id,
              amount: allocationCents,
              method: payment.payment_method,
              stripeRefundId: null,
            });
          }

          remainingRefund -= allocationCents;
        }

        if (remainingRefund > 0) {
          // Refund exceeds original payments — issue remainder as store credit
          const creditResult = await this._createStoreCredit(
            client, ret.customer_id, remainingRefund, returnId, ret.return_number, userId
          );
          storeCreditId = creditResult.id;
          storeCreditCode = creditResult.code;
          refundDetails.storeCreditRemainder = remainingRefund;
        }

        // Record refund payment entries on the order
        for (const alloc of refundAllocations) {
          await client.query(
            `INSERT INTO unified_order_payments (
              order_id, payment_method, amount_cents, status,
              is_refund, refund_reason, original_payment_id,
              processor_reference, processed_by, processed_at, notes
            ) VALUES ($1, $2, $3, 'completed', true, $4, $5, $6, $7, NOW(), $8)`,
            [
              ret.original_order_id,
              alloc.method,
              -alloc.amount,
              `Return ${ret.return_number}`,
              alloc.paymentId,
              alloc.stripeRefundId,
              userId,
              `Refund for return ${ret.return_number}`,
            ]
          );
        }

      // ----- STORE CREDIT REFUND -----
      } else if (refundMethod === 'store_credit') {
        const creditResult = await this._createStoreCredit(
          client, ret.customer_id, refundAmountCents, returnId, ret.return_number, userId
        );
        storeCreditId = creditResult.id;
        storeCreditCode = creditResult.code;
        refundDetails.storeCreditCode = storeCreditCode;

      // ----- CASH REFUND -----
      } else if (refundMethod === 'cash') {
        // Record a refund payment on the order
        await client.query(
          `INSERT INTO unified_order_payments (
            order_id, payment_method, amount_cents, status,
            is_refund, refund_reason, processed_by, processed_at, notes
          ) VALUES ($1, 'cash', $2, 'completed', true, $3, $4, NOW(), $5)`,
          [
            ret.original_order_id,
            -refundAmountCents,
            `Return ${ret.return_number}`,
            userId,
            `Cash refund for return ${ret.return_number}`,
          ]
        );

        // Record cash drawer movement if shift is available
        if (opts.shiftId) {
          try {
            await client.query(
              `INSERT INTO cash_movements (
                shift_id, user_id, movement_type, amount, reason, reference_number, notes
              ) VALUES ($1, $2, 'refund', $3, $4, $5, $6)`,
              [
                opts.shiftId,
                userId,
                -(refundAmountCents / 100),
                `Cash refund for return ${ret.return_number}`,
                ret.return_number,
                `Order ${ret.original_order_id}`,
              ]
            );
          } catch {
            // Cash drawer recording is non-critical — don't fail the refund
          }
        }
      } else {
        throw ApiError.badRequest(`Invalid refund method: ${refundMethod}`);
      }

      // ----- INVENTORY DISPOSITION -----
      const returnItems = await client.query(
        `SELECT hri.*, hri.item_condition
         FROM hub_return_items hri
         WHERE hri.return_id = $1`,
        [returnId]
      );

      const inventoryResults = [];

      for (const item of returnItems.rows) {
        // Default disposition based on condition
        const disposition = item.disposition || (
          item.item_condition === 'resellable' ? 'return_to_stock' :
          item.item_condition === 'damaged' ? 'clearance' :
          item.item_condition === 'defective' ? 'rma_vendor' : 'dispose'
        );

        // Update disposition on the return item
        await client.query(
          'UPDATE hub_return_items SET disposition = $1 WHERE id = $2',
          [disposition, item.id]
        );

        // Process inventory adjustment based on disposition
        if (item.product_id) {
          const invResult = await this._adjustInventoryForReturn(
            client, item.product_id, item.quantity, disposition,
            ret.original_order_id, ret.return_number, returnId, userId
          );
          inventoryResults.push({
            productId: item.product_id,
            quantity: item.quantity,
            disposition,
            ...invResult,
          });
        }
      }

      // ----- UPDATE RETURN RECORD -----
      await client.query(
        `UPDATE hub_returns SET
          status = 'completed',
          refund_method = $1,
          stripe_refund_id = $2,
          store_credit_id = $3,
          processed_by = $4,
          completed_at = NOW(),
          updated_at = NOW()
        WHERE id = $5`,
        [refundMethod, stripeRefundId, storeCreditId, userId, returnId]
      );

      // Recalculate order payment totals
      await client.query(
        `UPDATE unified_orders SET
          amount_paid_cents = (
            SELECT COALESCE(SUM(amount_cents), 0)
            FROM unified_order_payments
            WHERE order_id = $1 AND status = 'completed'
          ),
          updated_at = NOW()
        WHERE id = $1`,
        [ret.original_order_id]
      );
      await client.query(
        `UPDATE unified_orders SET
          amount_due_cents = total_cents - amount_paid_cents,
          updated_at = NOW()
        WHERE id = $1`,
        [ret.original_order_id]
      );

      await client.query('COMMIT');

      const completedReturn = await this.getById(returnId);

      return {
        ...completedReturn,
        refundDetails: {
          method: refundMethod,
          refundAmountCents,
          refundAmount: refundAmountCents / 100,
          stripeRefundId,
          storeCreditId,
          storeCreditCode,
          inventoryAdjustments: inventoryResults,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create a store credit linked to a return
   */
  async _createStoreCredit(client, customerId, amountCents, returnId, returnNumber, userId) {
    // Generate unique SC-XXXXX code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    let attempts = 0;
    while (attempts < 10) {
      code = 'SC-';
      for (let i = 0; i < 5; i++) code += chars.charAt(crypto.randomInt(chars.length));
      const exists = await client.query('SELECT 1 FROM store_credits WHERE code = $1', [code]);
      if (exists.rows.length === 0) break;
      attempts++;
    }
    if (attempts >= 10) {
      throw ApiError.create(500, 'Failed to generate unique store credit code');
    }

    const result = await client.query(
      `INSERT INTO store_credits (
        customer_id, code, original_amount, current_balance,
        source_type, source_id, issued_by, notes
      ) VALUES ($1, $2, $3, $3, 'return', $4, $5, $6)
      RETURNING *`,
      [
        customerId || null,
        code,
        amountCents,
        returnId,
        userId,
        `Refund for return ${returnNumber}`,
      ]
    );

    // Record the issuance transaction
    await client.query(
      `INSERT INTO store_credit_transactions (
        store_credit_id, amount_cents, transaction_type, balance_after, notes, performed_by
      ) VALUES ($1, $2, 'issue', $3, $4, $5)`,
      [result.rows[0].id, amountCents, amountCents, `Issued from return ${returnNumber}`, userId]
    );

    return result.rows[0];
  }

  // ==========================================================================
  // REASON CODES
  // ==========================================================================

  async getReasonCodes() {
    const result = await this.pool.query(
      `SELECT * FROM return_reason_codes WHERE active = true ORDER BY sort_order, id`
    );
    return result.rows.map(row => ({
      id: row.id,
      code: row.code,
      description: row.description,
      requiresNotes: row.requires_notes,
      sortOrder: row.sort_order,
    }));
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Adjust inventory based on return item disposition.
   * Uses restore_inventory() PL/pgSQL function for proper audit trail.
   */
  async _adjustInventoryForReturn(client, productId, quantity, disposition, orderId, returnNumber, returnId, userId) {
    switch (disposition) {
      case 'return_to_stock': {
        // Restore to sellable inventory via PL/pgSQL function
        const result = await client.query(
          `SELECT * FROM restore_inventory($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            productId,
            quantity,
            `Return to stock: ${returnNumber}`,
            'return',
            returnId,
            returnNumber,
            userId,
            null, // default location
            null, // no original transaction to reverse
          ]
        );
        const row = result.rows[0];
        return { success: row.success, message: row.message, transactionLogId: row.transaction_log_id };
      }

      case 'clearance': {
        // Still restore to inventory but mark as clearance via reason
        const result = await client.query(
          `SELECT * FROM restore_inventory($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            productId,
            quantity,
            `Return clearance: ${returnNumber}`,
            'return',
            returnId,
            returnNumber,
            userId,
            null,
            null,
          ]
        );
        const row = result.rows[0];
        return { success: row.success, message: row.message, transactionLogId: row.transaction_log_id };
      }

      case 'rma_vendor': {
        // Record as damage/write-off — does not restore sellable stock
        // Log the transaction for audit but don't add back to qty_on_hand
        await client.query(
          `INSERT INTO inventory_transactions (
            product_id, transaction_type, quantity,
            qty_before, qty_after, reserved_before, reserved_after,
            reference_type, reference_id, reference_number,
            reason, created_by
          )
          SELECT $1, 'damage', 0,
                 qty_on_hand, qty_on_hand, qty_reserved, qty_reserved,
                 'return', $2, $3,
                 $4, $5
          FROM products WHERE id = $1`,
          [productId, returnId, returnNumber, `RMA to vendor: ${returnNumber}`, userId]
        );
        return { success: true, message: `${quantity} unit(s) sent to vendor RMA` };
      }

      case 'dispose': {
        // Write-off — record for audit, no inventory restoration
        await client.query(
          `INSERT INTO inventory_transactions (
            product_id, transaction_type, quantity,
            qty_before, qty_after, reserved_before, reserved_after,
            reference_type, reference_id, reference_number,
            reason, created_by
          )
          SELECT $1, 'damage', 0,
                 qty_on_hand, qty_on_hand, qty_reserved, qty_reserved,
                 'return', $2, $3,
                 $4, $5
          FROM products WHERE id = $1`,
          [productId, returnId, returnNumber, `Disposed: ${returnNumber}`, userId]
        );
        return { success: true, message: `${quantity} unit(s) disposed/written off` };
      }

      default:
        return { success: false, message: `Unknown disposition: ${disposition}` };
    }
  }

  _mapReturnRow(row) {
    return {
      id: row.id,
      returnNumber: row.return_number,
      originalOrderId: row.original_order_id,
      originalOrderNumber: row.original_order_number || null,
      originalOrderTotal: row.original_order_total != null ? row.original_order_total / 100 : null,
      customerId: row.customer_id,
      customerName: row.customer_name || null,
      customerEmail: row.customer_email || null,
      customerPhone: row.customer_phone || null,
      returnType: row.return_type,
      status: row.status,
      refundSubtotalCents: row.refund_subtotal,
      refundSubtotal: row.refund_subtotal / 100,
      refundTaxCents: row.refund_tax,
      refundTax: row.refund_tax / 100,
      refundTotalCents: row.refund_total,
      refundTotal: row.refund_total / 100,
      restockingFeeCents: row.restocking_fee,
      restockingFee: row.restocking_fee / 100,
      refundMethod: row.refund_method,
      stripeRefundId: row.stripe_refund_id,
      storeCreditId: row.store_credit_id,
      exchangeOrderId: row.exchange_order_id,
      initiatedBy: row.initiated_by,
      initiatedByName: row.initiated_by_name || null,
      approvedBy: row.approved_by,
      approvedByName: row.approved_by_name || null,
      processedBy: row.processed_by,
      processedByName: row.processed_by_name || null,
      notes: row.notes,
      initiatedAt: row.initiated_at,
      approvedAt: row.approved_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = HubReturnService;
