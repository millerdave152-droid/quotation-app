/**
 * Standardized Order Routes (v1)
 *
 * Base path: /api/v1/orders
 *
 * Endpoints:
 *   GET    /                    - List orders with filtering/pagination
 *   POST   /                    - Create new order
 *   GET    /:id                 - Get order by ID
 *   PUT    /:id                 - Update order
 *   PATCH  /:id/status          - Transition order status
 *   POST   /:id/void            - Void order
 *   POST   /:id/payments        - Add payment to order
 *   POST   /:id/refund          - Process refund
 *   GET    /:id/items           - Get order items
 *   POST   /:id/items           - Add item to order
 *   DELETE /:id/items/:itemId   - Remove order item
 */

const express = require('express');
const router = express.Router();

const {
  asyncHandler,
  authenticate,
  requireRole,
  parsePagination,
  parseDateRange,
  normalizeMoneyFields,
  validate,
  validateId
} = require('../../shared/middleware');

const {
  createOrderSchema,
  updateOrderSchema,
  orderStatusTransitionSchema,
  orderQuerySchema,
  createPaymentSchema,
  refundTransactionSchema,
  createLineItemSchema
} = require('../../shared/validation/schemas');

let pool = null;

// ============================================================================
// LIST ORDERS
// ============================================================================

router.get('/',
  authenticate,
  validate(orderQuerySchema, 'query'),
  parsePagination(50, 200),
  parseDateRange,
  asyncHandler(async (req, res) => {
    const { pagination, dateRange, query } = req;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      conditions.push(`status IN (${statuses.map(() => `$${idx++}`).join(', ')})`);
      params.push(...statuses);
    }

    if (query.paymentStatus) {
      const statuses = Array.isArray(query.paymentStatus) ? query.paymentStatus : [query.paymentStatus];
      conditions.push(`payment_status IN (${statuses.map(() => `$${idx++}`).join(', ')})`);
      params.push(...statuses);
    }

    if (query.source) {
      const sources = Array.isArray(query.source) ? query.source : [query.source];
      conditions.push(`source IN (${sources.map(() => `$${idx++}`).join(', ')})`);
      params.push(...sources);
    }

    if (query.customerId) {
      conditions.push(`customer_id = $${idx++}`);
      params.push(query.customerId);
    }

    if (dateRange.startDate) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(dateRange.startDate);
    }

    if (dateRange.endDate) {
      conditions.push(`created_at <= $${idx++}`);
      params.push(dateRange.endDate);
    }

    if (query.search) {
      conditions.push(`(order_number ILIKE $${idx++} OR source_reference ILIKE $${idx})`);
      const term = `%${query.search}%`;
      params.push(term, term);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sortColumns = {
      created_at: 'created_at',
      updated_at: 'updated_at',
      total: 'total_cents',
      status: 'status',
      number: 'order_number'
    };
    const sortBy = sortColumns[pagination.sortBy] || 'created_at';

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM orders ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const ordersResult = await pool.query(`
      SELECT
        o.*,
        c.name as customer_name,
        c.company as customer_company,
        c.email as customer_email
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      ${whereClause}
      ORDER BY ${sortBy} ${pagination.sortOrder}
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, pagination.limit, pagination.offset]);

    const orders = ordersResult.rows.map(formatOrderResponse);

    res.paginated(orders, {
      page: pagination.page,
      limit: pagination.limit,
      total
    });
  })
);

// ============================================================================
// CREATE ORDER
// ============================================================================

router.post('/',
  authenticate,
  normalizeMoneyFields(),
  validate(createOrderSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;
    const userId = req.user.id;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Generate order number
      const numberResult = await client.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 'ORD-(\\d+)') AS INTEGER)), 0) + 1 as next_num
        FROM orders
      `);
      const orderNumber = `ORD-${String(numberResult.rows[0].next_num).padStart(6, '0')}`;

      // Calculate totals
      let subtotalCents = 0;
      for (const item of data.items) {
        const itemTotal = (item.unitPriceCents || 0) * item.quantity;
        const discount = item.discountAmountCents || Math.round(itemTotal * (item.discountPercent || 0) / 100);
        subtotalCents += itemTotal - discount;
      }

      const discountCents = data.discountCents || Math.round(subtotalCents * (data.discountPercent || 0) / 100);
      const taxableAmount = subtotalCents - discountCents;

      const taxRates = getTaxRates(data.taxProvince || 'ON');
      const taxCents = Math.round(taxableAmount * taxRates.total);
      const totalCents = taxableAmount + taxCents;

      // Calculate payments
      let paidCents = 0;
      if (data.payments) {
        paidCents = data.payments.reduce((sum, p) => sum + (p.amountCents || 0), 0);
      }
      const balanceCents = totalCents - paidCents;
      const paymentStatus = paidCents >= totalCents ? 'paid' : paidCents > 0 ? 'partial' : 'unpaid';

      // Insert order
      const orderResult = await client.query(`
        INSERT INTO orders (
          order_number, source, source_id, source_reference,
          customer_id, status, payment_status, delivery_status,
          subtotal_cents, discount_cents, tax_cents, total_cents,
          paid_cents, balance_cents, tax_province,
          shift_id, register_id, sales_rep_id, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING id
      `, [
        orderNumber,
        data.source,
        data.sourceId || null,
        data.sourceReference || null,
        data.customerId || null,
        'pending',
        paymentStatus,
        'not_applicable',
        subtotalCents,
        discountCents,
        taxCents,
        totalCents,
        paidCents,
        balanceCents,
        data.taxProvince || 'ON',
        data.shiftId || null,
        data.registerId || null,
        data.salesRepId || userId,
        data.notes || null,
        userId
      ]);

      const orderId = orderResult.rows[0].id;

      // Insert items
      for (const item of data.items) {
        const product = await client.query(
          'SELECT * FROM products WHERE id = $1',
          [item.productId]
        );

        const productData = product.rows[0] || {};
        const unitPriceCents = item.unitPriceCents || Math.round((productData.price || 0) * 100);
        const lineTotalCents = unitPriceCents * item.quantity;
        const discountAmount = item.discountAmountCents || Math.round(lineTotalCents * (item.discountPercent || 0) / 100);

        await client.query(`
          INSERT INTO order_items (
            order_id, product_id, product_name, product_sku,
            quantity, unit_price_cents, discount_percent, discount_amount_cents,
            line_total_cents, taxable, serial_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          orderId,
          item.productId,
          productData.name || 'Unknown Product',
          productData.model || null,
          item.quantity,
          unitPriceCents,
          item.discountPercent || 0,
          discountAmount,
          lineTotalCents - discountAmount,
          item.taxable !== false,
          item.serialNumber || null
        ]);
      }

      // Insert payments
      if (data.payments) {
        for (const payment of data.payments) {
          await client.query(`
            INSERT INTO payments (
              order_id, payment_method, amount_cents,
              cash_tendered_cents, card_last_four, card_brand,
              authorization_code, processor_reference, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed')
          `, [
            orderId,
            payment.paymentMethod,
            payment.amountCents,
            payment.cashTenderedCents || null,
            payment.cardLastFour || null,
            payment.cardBrand || null,
            payment.authorizationCode || null,
            payment.processorReference || null
          ]);
        }
      }

      await client.query('COMMIT');

      const order = await getOrderById(orderId);
      res.created(order);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })
);

// ============================================================================
// GET ORDER BY ID
// ============================================================================

router.get('/:id',
  authenticate,
  validateId('id'),
  asyncHandler(async (req, res) => {
    const order = await getOrderById(req.params.id);

    if (!order) {
      return res.notFound('Order');
    }

    res.success(order);
  })
);

// ============================================================================
// UPDATE ORDER
// ============================================================================

router.put('/:id',
  authenticate,
  validateId('id'),
  validate(updateOrderSchema),
  asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const data = req.body;

    const existing = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );

    if (existing.rows.length === 0) {
      return res.notFound('Order');
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (data.customerId !== undefined) {
      updates.push(`customer_id = $${idx++}`);
      values.push(data.customerId);
    }
    if (data.notes !== undefined) {
      updates.push(`notes = $${idx++}`);
      values.push(data.notes);
    }

    updates.push('updated_at = NOW()');

    if (updates.length > 1) {
      values.push(orderId);
      await pool.query(
        `UPDATE orders SET ${updates.join(', ')} WHERE id = $${idx}`,
        values
      );
    }

    const order = await getOrderById(orderId);
    res.success(order);
  })
);

// ============================================================================
// TRANSITION ORDER STATUS
// ============================================================================

router.patch('/:id/status',
  authenticate,
  validateId('id'),
  validate(orderStatusTransitionSchema),
  asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const { status, reason, notes } = req.body;
    const userId = req.user.id;

    const existing = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );

    if (existing.rows.length === 0) {
      return res.notFound('Order');
    }

    const order = existing.rows[0];
    const currentStatus = order.status;

    // Validate transition
    const transitions = getOrderStatusTransitions(currentStatus);
    if (!transitions.includes(status)) {
      return res.apiError('INVALID_STATUS_TRANSITION',
        `Cannot transition from ${currentStatus} to ${status}`,
        { allowed: transitions }
      );
    }

    await pool.query(`
      UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2
    `, [status, orderId]);

    // Log status change
    await pool.query(`
      INSERT INTO order_status_history (order_id, from_status, to_status, reason, notes, changed_by)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [orderId, currentStatus, status, reason || null, notes || null, userId]);

    const updatedOrder = await getOrderById(orderId);
    res.success(updatedOrder);
  })
);

// ============================================================================
// VOID ORDER
// ============================================================================

router.post('/:id/void',
  authenticate,
  requireRole('admin', 'manager'),
  validateId('id'),
  asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const { reason } = req.body;
    const userId = req.user.id;

    if (!reason || reason.length < 5) {
      return res.validationError('Void reason is required (min 5 characters)');
    }

    const existing = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );

    if (existing.rows.length === 0) {
      return res.notFound('Order');
    }

    const order = existing.rows[0];

    if (order.status === 'voided') {
      return res.apiError('CONFLICT', 'Order is already voided');
    }

    await pool.query(`
      UPDATE orders SET
        status = 'voided',
        voided_at = NOW(),
        void_reason = $1,
        voided_by = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [reason, userId, orderId]);

    const updatedOrder = await getOrderById(orderId);
    res.success(updatedOrder);
  })
);

// ============================================================================
// ADD PAYMENT
// ============================================================================

router.post('/:id/payments',
  authenticate,
  validateId('id'),
  normalizeMoneyFields(),
  validate(createPaymentSchema),
  asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const payment = req.body;

    const existing = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );

    if (existing.rows.length === 0) {
      return res.notFound('Order');
    }

    const order = existing.rows[0];

    if (order.status === 'voided') {
      return res.apiError('BAD_REQUEST', 'Cannot add payment to voided order');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Insert payment
      await client.query(`
        INSERT INTO payments (
          order_id, payment_method, amount_cents,
          cash_tendered_cents, card_last_four, card_brand,
          authorization_code, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
      `, [
        orderId,
        payment.paymentMethod,
        payment.amountCents,
        payment.cashTenderedCents || null,
        payment.cardLastFour || null,
        payment.cardBrand || null,
        payment.authorizationCode || null
      ]);

      // Update order payment totals
      const newPaidCents = order.paid_cents + payment.amountCents;
      const newBalanceCents = order.total_cents - newPaidCents;
      const newPaymentStatus = newBalanceCents <= 0 ? 'paid' : 'partial';

      await client.query(`
        UPDATE orders SET
          paid_cents = $1,
          balance_cents = $2,
          payment_status = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [newPaidCents, newBalanceCents, newPaymentStatus, orderId]);

      await client.query('COMMIT');

      const updatedOrder = await getOrderById(orderId);
      res.success(updatedOrder);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })
);

// ============================================================================
// PROCESS REFUND
// ============================================================================

router.post('/:id/refund',
  authenticate,
  requireRole('admin', 'manager'),
  validateId('id'),
  validate(refundTransactionSchema),
  asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const { amountCents, reason } = req.body;
    const userId = req.user.id;

    const existing = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );

    if (existing.rows.length === 0) {
      return res.notFound('Order');
    }

    const order = existing.rows[0];

    if (amountCents > order.paid_cents) {
      return res.apiError('BAD_REQUEST', 'Refund amount exceeds paid amount');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Record refund payment
      await client.query(`
        INSERT INTO payments (
          order_id, payment_method, amount_cents, status
        ) VALUES ($1, 'refund', $2, 'completed')
      `, [orderId, -amountCents]);

      // Update order
      const newPaidCents = order.paid_cents - amountCents;
      const newBalanceCents = order.total_cents - newPaidCents;
      const newPaymentStatus = newPaidCents <= 0 ? 'refunded' : 'partial';

      await client.query(`
        UPDATE orders SET
          paid_cents = $1,
          balance_cents = $2,
          payment_status = $3,
          refunded_at = NOW(),
          refund_reason = $4,
          refunded_by = $5,
          updated_at = NOW()
        WHERE id = $6
      `, [newPaidCents, newBalanceCents, newPaymentStatus, reason || null, userId, orderId]);

      await client.query('COMMIT');

      const updatedOrder = await getOrderById(orderId);
      res.success(updatedOrder);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getOrderById(id) {
  const orderResult = await pool.query(`
    SELECT
      o.*,
      c.name as customer_name,
      c.company as customer_company,
      c.email as customer_email,
      c.phone as customer_phone
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE o.id = $1
  `, [id]);

  if (orderResult.rows.length === 0) {
    return null;
  }

  const order = orderResult.rows[0];

  const itemsResult = await pool.query(
    'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id',
    [id]
  );

  const paymentsResult = await pool.query(
    'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at',
    [id]
  );

  return formatOrderResponse(order, itemsResult.rows, paymentsResult.rows);
}

function formatOrderResponse(order, items = [], payments = []) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    source: order.source,
    sourceId: order.source_id,
    sourceReference: order.source_reference,
    status: order.status,
    paymentStatus: order.payment_status,
    deliveryStatus: order.delivery_status,
    customer: order.customer_id ? {
      id: order.customer_id,
      name: order.customer_name,
      company: order.customer_company,
      email: order.customer_email,
      phone: order.customer_phone
    } : null,
    items: items.map(item => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      productSku: item.product_sku,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      discountPercent: parseFloat(item.discount_percent) || 0,
      discountAmountCents: item.discount_amount_cents || 0,
      lineTotalCents: item.line_total_cents,
      taxable: item.taxable,
      serialNumber: item.serial_number
    })),
    payments: payments.map(p => ({
      id: p.id,
      paymentMethod: p.payment_method,
      amountCents: p.amount_cents,
      status: p.status,
      cardLastFour: p.card_last_four,
      cardBrand: p.card_brand,
      createdAt: p.created_at
    })),
    subtotalCents: order.subtotal_cents,
    discountCents: order.discount_cents,
    taxCents: order.tax_cents,
    totalCents: order.total_cents,
    paidCents: order.paid_cents,
    balanceCents: order.balance_cents,
    taxProvince: order.tax_province,
    shiftId: order.shift_id,
    registerId: order.register_id,
    salesRepId: order.sales_rep_id,
    notes: order.notes,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    completedAt: order.completed_at,
    voidedAt: order.voided_at,
    voidReason: order.void_reason
  };
}

function getTaxRates(province) {
  const rates = {
    ON: { total: 0.13 },
    BC: { total: 0.12 },
    AB: { total: 0.05 },
    SK: { total: 0.11 },
    MB: { total: 0.12 },
    QC: { total: 0.14975 },
    NB: { total: 0.15 },
    NS: { total: 0.15 },
    PE: { total: 0.15 },
    NL: { total: 0.15 },
    YT: { total: 0.05 },
    NT: { total: 0.05 },
    NU: { total: 0.05 }
  };
  return rates[province] || rates.ON;
}

function getOrderStatusTransitions(current) {
  const transitions = {
    pending: ['order_confirmed', 'cancelled', 'voided'],
    order_confirmed: ['processing', 'ready_for_pickup', 'cancelled', 'voided'],
    processing: ['ready_for_pickup', 'out_for_delivery', 'order_completed', 'cancelled'],
    ready_for_pickup: ['order_completed', 'cancelled'],
    out_for_delivery: ['order_completed', 'cancelled'],
    order_completed: [],
    cancelled: [],
    voided: []
  };
  return transitions[current] || [];
}

// ============================================================================
// MODULE INITIALIZATION
// ============================================================================

const init = (deps) => {
  pool = deps.pool;
  return router;
};

module.exports = { router, init };
