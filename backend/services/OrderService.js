/**
 * Order Service
 * Handles order creation, quote conversion, and order management
 */

const { ApiError } = require('../middleware/errorHandler');

class OrderService {
  constructor(pool, cache, inventoryService) {
    this.pool = pool;
    this.cache = cache;
    this.inventoryService = inventoryService;
  }

  /**
   * Generate a unique order number
   * Format: ORD-YYYYMMDD-XXXX
   * @returns {Promise<string>} Generated order number
   */
  async generateOrderNumber() {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');

    const result = await this.pool.query(`
      SELECT COUNT(*) + 1 as seq
      FROM orders
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    const seq = String(result.rows[0].seq).padStart(4, '0');
    return `ORD-${dateStr}-${seq}`;
  }

  /**
   * Convert a quotation to an order (atomic transaction)
   * @param {number} quotationId - Quotation ID to convert
   * @param {object} options - Conversion options
   * @returns {Promise<object>} Created order
   */
  async convertQuoteToOrder(quotationId, options = {}) {
    const {
      paymentStatus = 'unpaid',
      depositPaidCents = 0,
      deliveryDate = null,
      deliverySlotId = null,
      notes = '',
      createdBy = 'system'
    } = options;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Get and validate the quotation
      const quoteResult = await client.query(`
        SELECT
          q.*,
          c.id as customer_id,
          c.name as customer_name,
          c.company,
          c.email
        FROM quotations q
        LEFT JOIN customers c ON q.customer_id = c.id
        WHERE q.id = $1
      `, [quotationId]);

      if (quoteResult.rows.length === 0) {
        throw ApiError.notFound('Quotation', { id: quotationId });
      }

      const quote = quoteResult.rows[0];

      // Validate quote status
      const validStatuses = ['DRAFT', 'SENT', 'APPROVED'];
      if (!validStatuses.includes(quote.status)) {
        throw ApiError.validation(`Cannot convert quote with status ${quote.status}. Valid statuses: ${validStatuses.join(', ')}`);
      }

      // Check if already converted
      if (quote.converted_to_order_id) {
        throw ApiError.conflict(`Quote already converted to order ${quote.converted_to_order_id}`);
      }

      // 2. Get quotation items
      const itemsResult = await client.query(`
        SELECT
          qi.*,
          p.model,
          p.manufacturer,
          p.name as product_name
        FROM quotation_items qi
        JOIN products p ON qi.product_id = p.id
        WHERE qi.quotation_id = $1
      `, [quotationId]);

      if (itemsResult.rows.length === 0) {
        throw ApiError.validation('Quotation has no items');
      }

      // 3. Generate order number
      const orderNumber = await this.generateOrderNumber();

      // 4. Create order
      const orderResult = await client.query(`
        INSERT INTO orders (
          order_number, quotation_id, customer_id, status,
          subtotal_cents, tax_cents, delivery_cents, total_cents,
          payment_status, delivery_date, delivery_slot_id, notes, created_by
        )
        VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        orderNumber,
        quotationId,
        quote.customer_id,
        quote.subtotal_cents || 0,
        quote.tax_cents || 0,
        quote.delivery_cents || 0,
        quote.total_cents || 0,
        paymentStatus,
        deliveryDate,
        deliverySlotId,
        notes,
        createdBy
      ]);

      const order = orderResult.rows[0];

      // 5. Copy items to order_items using batch INSERT (optimized from N+1)
      if (itemsResult.rows.length > 0) {
        const valuesPerRow = 5;
        const placeholders = itemsResult.rows.map((_, i) =>
          `(${Array.from({length: valuesPerRow}, (_, j) => `$${i * valuesPerRow + j + 1}`).join(', ')})`
        ).join(', ');

        const values = itemsResult.rows.flatMap(item => [
          order.id,
          item.product_id,
          item.quantity,
          item.unit_price_cents,
          item.total_cents
        ]);

        await client.query(`
          INSERT INTO order_items (
            order_id, product_id, quantity, unit_price_cents, total_cents
          )
          VALUES ${placeholders}
        `, values);
      }

      // 6. Convert inventory reservations
      if (this.inventoryService) {
        await this.inventoryService.convertReservation(quotationId, order.id);
      }

      // 7. Update quotation status
      await client.query(`
        UPDATE quotations
        SET
          status = 'WON',
          converted_to_order_id = $2,
          converted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [quotationId, order.id]);

      // 8. Log the conversion event
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, description, created_by)
        VALUES ($1, 'converted_to_order', $2, $3)
      `, [quotationId, `Converted to order ${orderNumber}`, createdBy]);

      await client.query('COMMIT');

      // Invalidate cache
      this.cache?.invalidatePattern('quotes:*');
      this.cache?.invalidatePattern('orders:*');

      return {
        order,
        items: itemsResult.rows,
        quote: quote
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create a new order directly (without quote)
   * @param {object} orderData - Order details
   * @returns {Promise<object>} Created order
   */
  async createOrder(orderData) {
    const {
      customerId,
      items, // Array of {product_id, quantity, unit_price_cents}
      deliveryDate = null,
      deliverySlotId = null,
      deliveryCents = 0,
      notes = '',
      createdBy = 'system'
    } = orderData;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Calculate totals
      let subtotalCents = 0;
      for (const item of items) {
        subtotalCents += item.unit_price_cents * item.quantity;
      }

      // Get tax rate (assuming Ontario 13% HST for now)
      const taxRate = 0.13;
      const taxCents = Math.round(subtotalCents * taxRate);
      const totalCents = subtotalCents + taxCents + (deliveryCents || 0);

      // Generate order number
      const orderNumber = await this.generateOrderNumber();

      // Create order
      const orderResult = await client.query(`
        INSERT INTO orders (
          order_number, customer_id, status,
          subtotal_cents, tax_cents, delivery_cents, total_cents,
          payment_status, delivery_date, delivery_slot_id, notes, created_by
        )
        VALUES ($1, $2, 'pending', $3, $4, $5, $6, 'unpaid', $7, $8, $9, $10)
        RETURNING *
      `, [
        orderNumber,
        customerId,
        subtotalCents,
        taxCents,
        deliveryCents,
        totalCents,
        deliveryDate,
        deliverySlotId,
        notes,
        createdBy
      ]);

      const order = orderResult.rows[0];

      // Create order items
      const orderItems = [];
      for (const item of items) {
        const itemResult = await client.query(`
          INSERT INTO order_items (
            order_id, product_id, quantity, unit_price_cents, total_cents
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `, [
          order.id,
          item.product_id,
          item.quantity,
          item.unit_price_cents,
          item.unit_price_cents * item.quantity
        ]);
        orderItems.push(itemResult.rows[0]);
      }

      await client.query('COMMIT');

      this.cache?.invalidatePattern('orders:*');

      return { order, items: orderItems };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get order by ID
   * @param {number} orderId - Order ID
   * @returns {Promise<object>} Order with items
   */
  async getOrderById(orderId) {
    const orderResult = await this.pool.query(`
      SELECT
        o.*,
        c.name as customer_name,
        c.company,
        c.email,
        c.phone,
        c.address,
        c.city,
        c.province,
        c.postal_code,
        q.quote_number
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN quotations q ON o.quotation_id = q.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      return null;
    }

    const order = orderResult.rows[0];

    // Get items
    const itemsResult = await this.pool.query(`
      SELECT
        oi.*,
        p.model,
        p.manufacturer,
        p.name as product_name,
        p.category
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
    `, [orderId]);

    return {
      ...order,
      items: itemsResult.rows
    };
  }

  /**
   * Get order by quote ID
   * @param {number} quotationId - Quotation ID
   * @returns {Promise<object|null>} Order if exists
   */
  async getOrderByQuote(quotationId) {
    const result = await this.pool.query(`
      SELECT id FROM orders WHERE quotation_id = $1
    `, [quotationId]);

    if (result.rows.length === 0) {
      return null;
    }

    return await this.getOrderById(result.rows[0].id);
  }

  /**
   * Update order status
   * @param {number} orderId - Order ID
   * @param {string} status - New status
   * @param {string} updatedBy - User making update
   * @returns {Promise<object>} Updated order
   */
  async updateOrderStatus(orderId, status, updatedBy = 'system') {
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Valid values: ${validStatuses.join(', ')}`);
    }

    const result = await this.pool.query(`
      UPDATE orders
      SET
        status = $2,
        updated_at = CURRENT_TIMESTAMP,
        ${status === 'delivered' ? 'delivered_at = CURRENT_TIMESTAMP,' : ''}
        ${status === 'cancelled' ? 'cancelled_at = CURRENT_TIMESTAMP,' : ''}
        updated_by = $3
      WHERE id = $1
      RETURNING *
    `, [orderId, status, updatedBy]);

    if (result.rows.length === 0) {
      throw new Error(`Order ${orderId} not found`);
    }

    this.cache?.invalidatePattern('orders:*');

    return result.rows[0];
  }

  /**
   * Update order payment status
   * @param {number} orderId - Order ID
   * @param {string} paymentStatus - New payment status
   * @param {object} paymentDetails - Optional payment details
   * @returns {Promise<object>} Updated order
   */
  async updatePaymentStatus(orderId, paymentStatus, paymentDetails = {}) {
    const validStatuses = ['unpaid', 'deposit_paid', 'paid', 'refunded'];

    if (!validStatuses.includes(paymentStatus)) {
      throw new Error(`Invalid payment status. Valid values: ${validStatuses.join(', ')}`);
    }

    const {
      depositPaidCents = null,
      amountPaidCents = null,
      stripePaymentIntentId = null
    } = paymentDetails;

    const result = await this.pool.query(`
      UPDATE orders
      SET
        payment_status = $2,
        deposit_paid_cents = COALESCE($3, deposit_paid_cents),
        amount_paid_cents = COALESCE($4, amount_paid_cents),
        stripe_payment_intent_id = COALESCE($5, stripe_payment_intent_id),
        paid_at = ${paymentStatus === 'paid' ? 'CURRENT_TIMESTAMP' : 'paid_at'},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [orderId, paymentStatus, depositPaidCents, amountPaidCents, stripePaymentIntentId]);

    if (result.rows.length === 0) {
      throw new Error(`Order ${orderId} not found`);
    }

    this.cache?.invalidatePattern('orders:*');

    return result.rows[0];
  }

  /**
   * Get orders with filters
   * @param {object} options - Filter options
   * @returns {Promise<object>} Orders with pagination
   */
  async getOrders(options = {}) {
    const {
      customerId,
      status,
      paymentStatus,
      deliveryStatus,
      search,
      fromDate,
      toDate,
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (customerId) {
      conditions.push(`o.customer_id = $${paramIndex++}`);
      params.push(customerId);
    }

    if (status) {
      conditions.push(`o.status = $${paramIndex++}`);
      params.push(status);
    }

    if (paymentStatus) {
      conditions.push(`o.payment_status = $${paramIndex++}`);
      params.push(paymentStatus);
    }

    if (deliveryStatus) {
      conditions.push(`o.delivery_status = $${paramIndex++}`);
      params.push(deliveryStatus);
    }

    if (search) {
      conditions.push(`(
        o.order_number ILIKE $${paramIndex} OR
        c.name ILIKE $${paramIndex} OR
        c.company ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (fromDate) {
      conditions.push(`o.created_at >= $${paramIndex++}`);
      params.push(fromDate);
    }

    if (toDate) {
      conditions.push(`o.created_at <= $${paramIndex++}`);
      params.push(toDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await this.pool.query(`
      SELECT COUNT(*) as total
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].total);

    // Get orders
    const validSortColumns = ['order_number', 'created_at', 'total_cents', 'status', 'payment_status'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const ordersResult = await this.pool.query(`
      SELECT
        o.*,
        c.name as customer_name,
        c.company,
        c.email,
        q.quote_number,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN quotations q ON o.quotation_id = q.id
      ${whereClause}
      ORDER BY o.${sortColumn} ${order}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    return {
      orders: ordersResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Cancel an order
   * @param {number} orderId - Order ID
   * @param {string} reason - Cancellation reason
   * @param {string} cancelledBy - User cancelling
   * @returns {Promise<object>} Cancelled order
   */
  async cancelOrder(orderId, reason, cancelledBy = 'system') {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get order
      const orderResult = await client.query(`
        SELECT * FROM orders WHERE id = $1
      `, [orderId]);

      if (orderResult.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }

      const order = orderResult.rows[0];

      if (order.status === 'cancelled') {
        throw new Error('Order is already cancelled');
      }

      if (['shipped', 'delivered'].includes(order.status)) {
        throw new Error(`Cannot cancel order with status ${order.status}`);
      }

      // Update order
      await client.query(`
        UPDATE orders
        SET
          status = 'cancelled',
          cancelled_at = CURRENT_TIMESTAMP,
          cancellation_reason = $2,
          cancelled_by = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [orderId, reason, cancelledBy]);

      // Release any inventory reservations
      if (this.inventoryService && order.quotation_id) {
        await this.inventoryService.releaseReservation(
          order.quotation_id,
          'order_cancelled',
          cancelledBy
        );
      }

      await client.query('COMMIT');

      this.cache?.invalidatePattern('orders:*');
      this.cache?.invalidatePattern('inventory:*');

      return await this.getOrderById(orderId);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = OrderService;
