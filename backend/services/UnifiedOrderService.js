/**
 * TeleTime - Unified Order Service
 * Single source of truth for quotes, orders, invoices, and POS transactions
 */

const { ApiError } = require('../middleware/errorHandler');

// ============================================================================
// TAX RATES BY PROVINCE
// ============================================================================

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

// ============================================================================
// STATUS TRANSITIONS (valid from -> to)
// ============================================================================

const VALID_TRANSITIONS = {
  draft: ['quote_sent', 'order_pending', 'void'],
  quote_sent: ['quote_viewed', 'quote_expired', 'quote_rejected', 'quote_approved', 'void'],
  quote_viewed: ['quote_expired', 'quote_rejected', 'quote_approved', 'void'],
  quote_expired: ['quote_sent', 'void'],  // Can resend
  quote_rejected: ['quote_sent', 'void'], // Can resend
  quote_approved: ['order_pending', 'invoice_sent', 'paid', 'void'],
  order_pending: ['order_processing', 'order_ready', 'order_completed', 'awaiting_etransfer', 'void'],
  awaiting_etransfer: ['order_pending', 'order_processing', 'paid', 'void'],
  order_processing: ['order_ready', 'order_completed', 'awaiting_etransfer', 'void'],
  order_ready: ['order_completed', 'void'],
  order_completed: ['invoice_sent', 'paid', 'partial_refund', 'refunded'],
  invoice_sent: ['invoice_overdue', 'paid', 'partial_refund', 'void'],
  invoice_overdue: ['paid', 'partial_refund', 'void'],
  paid: ['partial_refund', 'refunded'],
  partial_refund: ['refunded'],
  refunded: ['archived'],
  void: ['archived'],
  archived: [],
};

// ============================================================================
// SERVICE CLASS
// ============================================================================

class UnifiedOrderService {
  constructor(pool) {
    this.pool = pool;
  }

  // ==========================================================================
  // CREATE ORDER
  // ==========================================================================

  /**
   * Create a new unified order (quote, POS transaction, etc.)
   * @param {Object} data - Order data
   * @param {Object} options - Creation options
   * @returns {Promise<Object>} Created order
   */
  async create(data, options = {}) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Generate order number
      const prefix = this._getOrderPrefix(data.source || 'pos');
      const orderNumberResult = await client.query(
        `SELECT generate_order_number($1) as order_number`,
        [prefix]
      );
      const orderNumber = orderNumberResult.rows[0].order_number;

      // Get tax rates
      const province = data.taxProvince || 'ON';
      const taxRates = TAX_RATES[province] || TAX_RATES.ON;

      // Insert order
      const orderResult = await client.query(
        `INSERT INTO unified_orders (
          order_number, source, status,
          customer_id, customer_name, customer_email, customer_phone, customer_address,
          created_by, salesperson_id,
          register_id, shift_id,
          quote_expiry_date, quote_valid_days,
          order_discount_cents, order_discount_type, order_discount_reason, order_discount_code,
          tax_province, hst_rate, gst_rate, pst_rate,
          tax_exempt, tax_exempt_number,
          fulfillment_type,
          delivery_cents, delivery_method, delivery_address, delivery_instructions,
          delivery_date, delivery_time_slot,
          delivery_street_number, delivery_street_name, delivery_unit, delivery_buzzer,
          delivery_city, delivery_province, delivery_postal_code,
          deposit_required_cents,
          internal_notes, customer_notes,
          metadata, tags,
          marketing_source_id, marketing_source_detail
        ) VALUES (
          $1, $2, $3,
          $4, $5, $6, $7, $8,
          $9, $10,
          $11, $12,
          $13, $14,
          $15, $16, $17, $18,
          $19, $20, $21, $22,
          $23, $24,
          $25,
          $26, $27, $28, $29,
          $30, $31,
          $32, $33, $34, $35,
          $36, $37, $38,
          $39,
          $40, $41,
          $42, $43,
          $44, $45
        ) RETURNING *`,
        [
          orderNumber,
          data.source || 'pos',
          data.status || 'draft',
          data.customerId || null,
          data.customerName || null,
          data.customerEmail || null,
          data.customerPhone || null,
          data.customerAddress || null,
          data.createdBy || null,
          data.salespersonId || null,
          data.registerId || null,
          data.shiftId || null,
          data.quoteExpiryDate || null,
          data.quoteValidDays || 30,
          data.orderDiscountCents || 0,
          data.orderDiscountType || null,
          data.orderDiscountReason || null,
          data.orderDiscountCode || null,
          province,
          taxRates.hst,
          taxRates.gst,
          taxRates.pst,
          data.taxExempt || false,
          data.taxExemptNumber || null,
          data.fulfillmentType || null,
          data.deliveryCents || 0,
          data.deliveryMethod || null,
          typeof data.deliveryAddress === 'object' ? this._formatDeliveryAddress(data.deliveryAddress) : (data.deliveryAddress || null),
          data.deliveryInstructions || null,
          data.deliveryDate || null,
          data.deliveryTimeSlot || null,
          ...(this._extractDeliveryFields(data.deliveryAddress)),
          data.depositRequiredCents || 0,
          data.internalNotes || null,
          data.customerNotes || null,
          JSON.stringify(data.metadata || {}),
          data.tags || [],
          data.marketingSourceId || null,
          data.marketingSourceDetail || null,
        ]
      );

      const order = orderResult.rows[0];

      // Insert items
      if (data.items && data.items.length > 0) {
        for (let i = 0; i < data.items.length; i++) {
          const item = data.items[i];
          await this._insertItem(client, order.id, item, i);
        }
      }

      // Recalculate totals
      await client.query('SELECT recalculate_order_totals($1)', [order.id]);

      // Record initial status
      await client.query(
        `INSERT INTO unified_order_status_history (order_id, to_status, changed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [order.id, order.status, data.createdBy, 'Order created']
      );

      await client.query('COMMIT');

      // Return full order
      return this.getById(order.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // CREATE POS TRANSACTION
  // ==========================================================================

  /**
   * Create a POS transaction with items and payments in one call
   * @param {Object} data - Transaction data including items and payments
   * @returns {Promise<Object>} Created transaction
   */
  async createPOSTransaction(data) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Validate shift
      if (!data.shiftId) {
        throw ApiError.badRequest('Shift ID is required for POS transactions');
      }

      const shiftResult = await client.query(
        `SELECT * FROM register_shifts WHERE shift_id = $1 AND status = 'open'`,
        [data.shiftId]
      );

      if (shiftResult.rows.length === 0) {
        throw ApiError.badRequest('Invalid or closed shift');
      }

      const shift = shiftResult.rows[0];

      // Create order
      const orderNumber = await this._generateOrderNumber(client, 'TXN');

      const province = data.taxProvince || 'ON';
      const taxRates = TAX_RATES[province] || TAX_RATES.ON;

      const orderResult = await client.query(
        `INSERT INTO unified_orders (
          order_number, source, status,
          customer_id, customer_name, customer_email, customer_phone,
          created_by, salesperson_id,
          register_id, shift_id,
          order_discount_cents, order_discount_reason,
          tax_province, hst_rate, gst_rate, pst_rate,
          metadata
        ) VALUES (
          $1, 'pos', 'order_pending',
          $2, $3, $4, $5,
          $6, $7,
          $8, $9,
          $10, $11,
          $12, $13, $14, $15,
          $16
        ) RETURNING *`,
        [
          orderNumber,
          data.customerId || null,
          data.customerName || null,
          data.customerEmail || null,
          data.customerPhone || null,
          data.createdBy,
          data.salespersonId || data.createdBy,
          shift.register_id,
          data.shiftId,
          data.discountCents || 0,
          data.discountReason || null,
          province,
          taxRates.hst,
          taxRates.gst,
          taxRates.pst,
          JSON.stringify({
            quoteId: data.quoteId || null,
            legacyTransactionId: null,
          }),
        ]
      );

      const order = orderResult.rows[0];

      // Insert items
      for (let i = 0; i < data.items.length; i++) {
        await this._insertItem(client, order.id, data.items[i], i);
      }

      // Recalculate totals
      await client.query('SELECT recalculate_order_totals($1)', [order.id]);

      // Get updated order
      const updatedOrder = await client.query(
        'SELECT * FROM unified_orders WHERE id = $1',
        [order.id]
      );

      // Process payments
      let totalPaid = 0;
      for (const payment of data.payments) {
        const paymentResult = await this._insertPayment(
          client,
          order.id,
          payment,
          data.createdBy
        );
        if (paymentResult.status === 'completed') {
          totalPaid += paymentResult.amount_cents;
        }
      }

      // Update amount paid
      await client.query(
        'UPDATE unified_orders SET amount_paid_cents = $1 WHERE id = $2',
        [totalPaid, order.id]
      );

      // Determine final status
      const finalTotal = updatedOrder.rows[0].total_cents;
      let finalStatus = 'order_pending';

      if (totalPaid >= finalTotal) {
        finalStatus = 'paid';
      }

      // Transition to final status
      await client.query(
        `SELECT transition_order_status($1, $2::order_status, $3, $4)`,
        [order.id, finalStatus, data.createdBy, 'POS transaction completed']
      );

      // If converting from quote, update quote reference
      if (data.quoteId) {
        await client.query(
          `UPDATE unified_orders
           SET status = 'quote_approved'::order_status,
               quote_approved_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND source = 'quote'`,
          [data.quoteId]
        );
      }

      await client.query('COMMIT');

      // Return full order with items and payments
      return this.getById(order.id, { includeItems: true, includePayments: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // CREATE QUOTE
  // ==========================================================================

  /**
   * Create a new quote
   * @param {Object} data - Quote data
   * @returns {Promise<Object>} Created quote
   */
  async createQuote(data) {
    // Set quote-specific defaults
    const quoteData = {
      ...data,
      source: 'quote',
      status: 'draft',
      quoteExpiryDate:
        data.quoteExpiryDate ||
        new Date(Date.now() + (data.quoteValidDays || 30) * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
      quoteValidDays: data.quoteValidDays || 30,
    };

    return this.create(quoteData);
  }

  // ==========================================================================
  // GET BY ID
  // ==========================================================================

  /**
   * Get order by ID with optional includes
   * @param {number} id - Order ID
   * @param {Object} options - Include options
   * @returns {Promise<Object>} Order with requested includes
   */
  async getById(id, options = {}) {
    const { includeItems = true, includePayments = true, includeHistory = false } = options;

    const orderResult = await this.pool.query(
      `SELECT
        o.*,
        c.name as customer_display_name,
        c.email as customer_display_email,
        c.phone as customer_display_phone,
        cb.first_name || ' ' || cb.last_name as created_by_name,
        sp.first_name || ' ' || sp.last_name as salesperson_display_name,
        r.register_name,
        rs.opened_at as shift_opened_at
      FROM unified_orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users cb ON o.created_by = cb.id
      LEFT JOIN users sp ON o.salesperson_id = sp.id
      LEFT JOIN registers r ON o.register_id = r.register_id
      LEFT JOIN register_shifts rs ON o.shift_id = rs.shift_id
      WHERE o.id = $1`,
      [id]
    );

    if (orderResult.rows.length === 0) {
      return null;
    }

    const order = this._mapOrderRow(orderResult.rows[0]);

    // Include items
    if (includeItems) {
      const itemsResult = await this.pool.query(
        `SELECT * FROM unified_order_items WHERE order_id = $1 ORDER BY sort_order, id`,
        [id]
      );
      order.items = itemsResult.rows.map(this._mapItemRow);
    }

    // Include payments
    if (includePayments) {
      const paymentsResult = await this.pool.query(
        `SELECT
          p.*,
          u.first_name || ' ' || u.last_name as processed_by_name
        FROM unified_order_payments p
        LEFT JOIN users u ON p.processed_by = u.id
        WHERE p.order_id = $1
        ORDER BY p.created_at`,
        [id]
      );
      order.payments = paymentsResult.rows.map(this._mapPaymentRow);
    }

    // Include history
    if (includeHistory) {
      const historyResult = await this.pool.query(
        `SELECT
          h.*,
          u.first_name || ' ' || u.last_name as changed_by_display_name
        FROM unified_order_status_history h
        LEFT JOIN users u ON h.changed_by = u.id
        WHERE h.order_id = $1
        ORDER BY h.changed_at DESC`,
        [id]
      );
      order.statusHistory = historyResult.rows.map((row) => ({
        id: row.id,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        changedBy: row.changed_by,
        changedByName: row.changed_by_display_name || row.changed_by_name,
        reason: row.reason,
        notes: row.notes,
        changedAt: row.changed_at,
      }));
    }

    return order;
  }

  // ==========================================================================
  // GET BY ORDER NUMBER
  // ==========================================================================

  /**
   * Get order by order number
   * @param {string} orderNumber - Order number
   * @param {Object} options - Include options
   * @returns {Promise<Object>} Order
   */
  async getByOrderNumber(orderNumber, options = {}) {
    const result = await this.pool.query(
      'SELECT id FROM unified_orders WHERE order_number = $1',
      [orderNumber]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.getById(result.rows[0].id, options);
  }

  // ==========================================================================
  // UPDATE ORDER
  // ==========================================================================

  /**
   * Update an existing order
   * @param {number} id - Order ID
   * @param {Object} data - Update data
   * @param {number} userId - User making the update
   * @returns {Promise<Object>} Updated order
   */
  async update(id, data, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get current order
      const current = await this.getById(id);
      if (!current) {
        throw ApiError.notFound('Order');
      }

      // Build update fields
      const updates = [];
      const values = [];
      let paramIndex = 1;

      const allowedFields = [
        'customerName',
        'customerEmail',
        'customerPhone',
        'customerAddress',
        'salespersonId',
        'orderDiscountCents',
        'orderDiscountType',
        'orderDiscountReason',
        'orderDiscountCode',
        'taxExempt',
        'taxExemptNumber',
        'deliveryCents',
        'deliveryMethod',
        'deliveryAddress',
        'deliveryInstructions',
        'deliveryDate',
        'deliveryTimeSlot',
        'depositRequiredCents',
        'internalNotes',
        'customerNotes',
        'quoteExpiryDate',
        'quoteValidDays',
        'invoiceTerms',
        'tags',
        'fulfillmentType',
        'deliveryStreetNumber',
        'deliveryStreetName',
        'deliveryUnit',
        'deliveryBuzzer',
        'deliveryCity',
        'deliveryProvince',
        'deliveryPostalCode',
      ];

      const fieldMapping = {
        customerName: 'customer_name',
        customerEmail: 'customer_email',
        customerPhone: 'customer_phone',
        customerAddress: 'customer_address',
        salespersonId: 'salesperson_id',
        orderDiscountCents: 'order_discount_cents',
        orderDiscountType: 'order_discount_type',
        orderDiscountReason: 'order_discount_reason',
        orderDiscountCode: 'order_discount_code',
        taxExempt: 'tax_exempt',
        taxExemptNumber: 'tax_exempt_number',
        deliveryCents: 'delivery_cents',
        deliveryMethod: 'delivery_method',
        deliveryAddress: 'delivery_address',
        deliveryInstructions: 'delivery_instructions',
        deliveryDate: 'delivery_date',
        deliveryTimeSlot: 'delivery_time_slot',
        depositRequiredCents: 'deposit_required_cents',
        internalNotes: 'internal_notes',
        customerNotes: 'customer_notes',
        quoteExpiryDate: 'quote_expiry_date',
        quoteValidDays: 'quote_valid_days',
        invoiceTerms: 'invoice_terms',
        tags: 'tags',
        fulfillmentType: 'fulfillment_type',
        deliveryStreetNumber: 'delivery_street_number',
        deliveryStreetName: 'delivery_street_name',
        deliveryUnit: 'delivery_unit',
        deliveryBuzzer: 'delivery_buzzer',
        deliveryCity: 'delivery_city',
        deliveryProvince: 'delivery_province',
        deliveryPostalCode: 'delivery_postal_code',
      };

      // If deliveryAddress is a structured object, expand it into individual fields
      if (data.deliveryAddress && typeof data.deliveryAddress === 'object') {
        const addr = data.deliveryAddress;
        data.deliveryStreetNumber = addr.streetNumber;
        data.deliveryStreetName = addr.streetName;
        data.deliveryUnit = addr.unit || null;
        data.deliveryBuzzer = addr.buzzer || null;
        data.deliveryCity = addr.city;
        data.deliveryProvince = addr.province;
        data.deliveryPostalCode = addr.postalCode;
        data.deliveryAddress = this._formatDeliveryAddress(addr);
      }

      for (const field of allowedFields) {
        if (data[field] !== undefined) {
          updates.push(`${fieldMapping[field]} = $${paramIndex}`);
          values.push(data[field]);
          paramIndex++;
        }
      }

      if (updates.length > 0) {
        values.push(id);
        await client.query(
          `UPDATE unified_orders SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values
        );
      }

      // Update items if provided
      if (data.items) {
        // Remove existing items
        await client.query('DELETE FROM unified_order_items WHERE order_id = $1', [id]);

        // Insert new items
        for (let i = 0; i < data.items.length; i++) {
          await this._insertItem(client, id, data.items[i], i);
        }
      }

      // Recalculate totals
      await client.query('SELECT recalculate_order_totals($1)', [id]);

      await client.query('COMMIT');

      return this.getById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // TRANSITION STATUS
  // ==========================================================================

  /**
   * Transition order to a new status
   * @param {number} id - Order ID
   * @param {string} newStatus - New status
   * @param {Object} options - Transition options
   * @returns {Promise<Object>} Updated order
   */
  async transitionStatus(id, newStatus, options = {}) {
    const { userId, reason, notes } = options;

    // Validate transition
    const order = await this.getById(id, { includeItems: false, includePayments: false });
    if (!order) {
      throw ApiError.notFound('Order');
    }

    const validNext = VALID_TRANSITIONS[order.status] || [];
    if (!validNext.includes(newStatus)) {
      throw ApiError.badRequest(
        `Invalid status transition from '${order.status}' to '${newStatus}'`
      );
    }

    // Validate fulfillment details before completing orders
    if (newStatus === 'completed') {
      if (order.fulfillmentType === 'delivery') {
        const DeliveryDetailsService = require('./DeliveryDetailsService');
        const dds = new DeliveryDetailsService(this.pool);
        const validation = await dds.validateForCompletion(id);
        if (!validation.valid) {
          throw ApiError.badRequest(
            `Cannot complete delivery order: ${validation.errors.join('; ')}`
          );
        }
      }
      if (order.fulfillmentType === 'pickup') {
        const PickupDetailsService = require('./PickupDetailsService');
        const pds = new PickupDetailsService(this.pool);
        const validation = await pds.validateForCompletion(id);
        if (!validation.valid) {
          throw ApiError.badRequest(
            `Cannot complete pickup order: ${validation.errors.join('; ')}`
          );
        }
      }
    }

    // Perform transition
    await this.pool.query(`SELECT transition_order_status($1, $2::order_status, $3, $4, $5)`, [
      id,
      newStatus,
      userId || null,
      reason || null,
      notes || null,
    ]);

    return this.getById(id);
  }

  // ==========================================================================
  // ADD PAYMENT
  // ==========================================================================

  /**
   * Add a payment to an order
   * @param {number} orderId - Order ID
   * @param {Object} payment - Payment data
   * @param {number} userId - Processing user ID
   * @returns {Promise<Object>} Payment record
   */
  async addPayment(orderId, payment, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Lock the order row and get current balance
      const orderRow = await client.query(
        'SELECT id, total_cents, amount_paid_cents, amount_due_cents, status FROM unified_orders WHERE id = $1 FOR UPDATE',
        [orderId]
      );

      if (orderRow.rows.length === 0) {
        throw ApiError.notFound('Order');
      }

      const { total_cents, amount_due_cents, status } = orderRow.rows[0];

      // Validate order has balance due (skip for pending e-transfers and refund-type payments)
      if (payment.status !== 'pending' && !payment.isRefund) {
        if (amount_due_cents <= 0) {
          throw ApiError.badRequest('Order is already paid in full');
        }

        // Validate amount doesn't exceed balance due
        if (payment.amountCents > amount_due_cents) {
          throw ApiError.badRequest(
            `Payment amount ($${(payment.amountCents / 100).toFixed(2)}) exceeds balance due ($${(amount_due_cents / 100).toFixed(2)})`
          );
        }
      }

      const paymentResult = await this._insertPayment(client, orderId, payment, userId);

      // Trigger auto-recalculates amount_paid_cents and payment_status via
      // trg_recalculate_on_payment_change, but we also call explicitly to
      // ensure the values are up-to-date within this transaction
      await client.query('SELECT recalculate_order_totals($1)', [orderId]);

      // Check if order is now fully paid and transition status
      const updatedOrder = await client.query(
        'SELECT total_cents, amount_paid_cents, amount_due_cents, payment_status, status FROM unified_orders WHERE id = $1',
        [orderId]
      );

      const updated = updatedOrder.rows[0];

      if (updated.amount_paid_cents >= updated.total_cents && updated.total_cents > 0 && updated.status !== 'paid') {
        try {
          await client.query(`SELECT transition_order_status($1, 'paid'::order_status, $2, $3)`, [
            orderId,
            userId,
            'Payment received in full',
          ]);
        } catch (transitionErr) {
          // Status transition may fail if current status doesn't allow it — non-fatal
          console.warn(`Could not transition order ${orderId} to paid:`, transitionErr.message);
        }
      }

      await client.query('COMMIT');

      const mappedPayment = this._mapPaymentRow(paymentResult);

      return {
        ...mappedPayment,
        orderBalance: {
          totalCents: updated.total_cents,
          amountPaidCents: updated.amount_paid_cents,
          balanceDueCents: updated.amount_due_cents,
          balanceDue: updated.amount_due_cents / 100,
          paymentStatus: updated.payment_status || 'unpaid',
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // PROCESS REFUND
  // ==========================================================================

  /**
   * Process a refund for an order
   * @param {number} orderId - Order ID
   * @param {Object} refund - Refund data
   * @param {number} userId - Processing user ID
   * @returns {Promise<Object>} Refund payment record
   */
  async processRefund(orderId, refund, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const order = await this.getById(orderId, { includeItems: false, includePayments: true });
      if (!order) {
        throw ApiError.notFound('Order');
      }

      // Validate refund amount
      const maxRefund = order.amountPaidCents;
      if (refund.amountCents > maxRefund) {
        throw ApiError.badRequest(`Cannot refund more than paid amount: ${maxRefund / 100}`);
      }

      // Create refund payment record
      const refundResult = await client.query(
        `INSERT INTO unified_order_payments (
          order_id, payment_method, amount_cents, status,
          is_refund, refund_reason, original_payment_id,
          processed_by, processed_at, notes
        ) VALUES ($1, $2, $3, 'completed', TRUE, $4, $5, $6, CURRENT_TIMESTAMP, $7)
        RETURNING *`,
        [
          orderId,
          refund.paymentMethod || order.payments[0]?.paymentMethod || 'cash',
          refund.amountCents,
          refund.reason || null,
          refund.originalPaymentId || null,
          userId,
          refund.notes || null,
        ]
      );

      // Recalculate totals
      await client.query('SELECT recalculate_order_totals($1)', [orderId]);

      // Determine new order status
      const updatedOrder = await client.query(
        'SELECT total_cents, amount_paid_cents, amount_due_cents, payment_status FROM unified_orders WHERE id = $1',
        [orderId]
      );

      const updated = updatedOrder.rows[0];
      let newStatus;

      if (updated.amount_paid_cents <= 0) {
        newStatus = 'refunded';
      } else if (updated.amount_paid_cents < updated.total_cents) {
        newStatus = 'partial_refund';
      }

      if (newStatus) {
        try {
          await client.query(`SELECT transition_order_status($1, $2::order_status, $3, $4)`, [
            orderId,
            newStatus,
            userId,
            refund.reason || 'Refund processed',
          ]);
        } catch (transitionErr) {
          console.warn(`Could not transition order ${orderId} to ${newStatus}:`, transitionErr.message);
        }
      }

      await client.query('COMMIT');

      const mappedRefund = this._mapPaymentRow(refundResult.rows[0]);
      return {
        ...mappedRefund,
        orderBalance: {
          totalCents: updated.total_cents,
          amountPaidCents: updated.amount_paid_cents,
          balanceDueCents: updated.amount_due_cents,
          balanceDue: updated.amount_due_cents / 100,
          paymentStatus: updated.payment_status || 'unpaid',
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // VOID ORDER
  // ==========================================================================

  /**
   * Void an order
   * @param {number} id - Order ID
   * @param {string} reason - Void reason
   * @param {number} userId - User voiding the order
   * @returns {Promise<Object>} Voided order
   */
  async void(id, reason, userId) {
    return this.transitionStatus(id, 'void', {
      userId,
      reason,
      notes: 'Order voided',
    });
  }

  // ==========================================================================
  // SEARCH / LIST
  // ==========================================================================

  /**
   * Search orders with filters and pagination
   * @param {Object} filters - Search filters
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Search results with pagination
   */
  async search(filters = {}, options = {}) {
    const {
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortDir = 'DESC',
    } = options;

    // Whitelist sortBy to prevent SQL injection
    const ALLOWED_SORT_COLUMNS = ['created_at', 'updated_at', 'order_number', 'status', 'total_cents', 'customer_name'];
    const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : 'created_at';
    const safeSortDir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (page - 1) * limit;
    const where = [];
    const params = [];
    let paramIndex = 1;

    // Build where clauses
    if (filters.source) {
      where.push(`o.source = $${paramIndex}`);
      params.push(filters.source);
      paramIndex++;
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        where.push(`o.status = ANY($${paramIndex})`);
        params.push(filters.status);
      } else {
        where.push(`o.status = $${paramIndex}`);
        params.push(filters.status);
      }
      paramIndex++;
    }

    if (filters.customerId) {
      where.push(`o.customer_id = $${paramIndex}`);
      params.push(filters.customerId);
      paramIndex++;
    }

    if (filters.salespersonId) {
      where.push(`o.salesperson_id = $${paramIndex}`);
      params.push(filters.salespersonId);
      paramIndex++;
    }

    if (filters.shiftId) {
      where.push(`o.shift_id = $${paramIndex}`);
      params.push(filters.shiftId);
      paramIndex++;
    }

    if (filters.dateFrom) {
      where.push(`o.created_at >= $${paramIndex}`);
      params.push(filters.dateFrom);
      paramIndex++;
    }

    if (filters.dateTo) {
      where.push(`o.created_at <= $${paramIndex}`);
      params.push(filters.dateTo);
      paramIndex++;
    }

    if (filters.search) {
      where.push(`(
        o.order_number ILIKE $${paramIndex} OR
        o.customer_name ILIKE $${paramIndex} OR
        o.customer_email ILIKE $${paramIndex} OR
        o.invoice_number ILIKE $${paramIndex}
      )`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM unified_orders o ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get orders
    params.push(limit, offset);
    const ordersResult = await this.pool.query(
      `SELECT
        o.*,
        c.name as customer_display_name,
        sp.first_name || ' ' || sp.last_name as salesperson_display_name,
        (SELECT COUNT(*) FROM unified_order_items WHERE order_id = o.id) as item_count
      FROM unified_orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users sp ON o.salesperson_id = sp.id
      ${whereClause}
      ORDER BY o.${safeSortBy} ${safeSortDir}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    return {
      data: ordersResult.rows.map(this._mapOrderRow),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==========================================================================
  // CONVERT QUOTE TO ORDER
  // ==========================================================================

  /**
   * Convert a quote to an order
   * @param {number} quoteId - Quote ID
   * @param {number} userId - User performing conversion
   * @returns {Promise<Object>} Converted order
   */
  async convertQuoteToOrder(quoteId, userId) {
    const quote = await this.getById(quoteId);

    if (!quote) {
      throw ApiError.notFound('Quote');
    }

    if (quote.source !== 'quote') {
      throw ApiError.badRequest('Order is not a quote');
    }

    return this.transitionStatus(quoteId, 'order_pending', {
      userId,
      reason: 'Quote converted to order',
    });
  }

  // ==========================================================================
  // SEND QUOTE
  // ==========================================================================

  /**
   * Mark quote as sent
   * @param {number} quoteId - Quote ID
   * @param {number} userId - User sending
   * @returns {Promise<Object>} Updated quote
   */
  async sendQuote(quoteId, userId) {
    return this.transitionStatus(quoteId, 'quote_sent', {
      userId,
      reason: 'Quote sent to customer',
    });
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Get order number prefix based on source
   */
  _extractDeliveryFields(deliveryAddress) {
    if (deliveryAddress && typeof deliveryAddress === 'object') {
      return [
        deliveryAddress.streetNumber || null,
        deliveryAddress.streetName || null,
        deliveryAddress.unit || null,
        deliveryAddress.buzzer || null,
        deliveryAddress.city || null,
        deliveryAddress.province || null,
        deliveryAddress.postalCode || null,
      ];
    }
    return [null, null, null, null, null, null, null];
  }

  _formatDeliveryAddress(addr) {
    if (!addr) return null;
    const street = addr.unit
      ? `${addr.unit}-${addr.streetNumber} ${addr.streetName}`
      : `${addr.streetNumber} ${addr.streetName}`;
    return `${street}, ${addr.city}, ${addr.province} ${addr.postalCode}`;
  }

  _getOrderPrefix(source) {
    const prefixes = {
      quote: 'QT',
      pos: 'TXN',
      online: 'WEB',
      phone: 'PHN',
      import: 'IMP',
      api: 'API',
    };
    return prefixes[source] || 'ORD';
  }

  /**
   * Generate order number
   */
  async _generateOrderNumber(client, prefix) {
    const result = await client.query(`SELECT generate_order_number($1) as order_number`, [
      prefix,
    ]);
    return result.rows[0].order_number;
  }

  /**
   * Insert order item
   */
  async _insertItem(client, orderId, item, sortOrder) {
    // Calculate line total
    const lineSubtotal = item.unitPriceCents * item.quantity;
    let lineDiscount = 0;

    if (item.discountType === 'percent') {
      lineDiscount = Math.round((lineSubtotal * (item.discountPercent || 0)) / 100);
    } else if (item.discountType === 'fixed_amount') {
      lineDiscount = item.discountCents || 0;
    }

    const lineTotal = lineSubtotal - lineDiscount;

    return client.query(
      `INSERT INTO unified_order_items (
        order_id, product_id, product_sku, product_name, product_description,
        manufacturer, model, quantity, unit_price_cents, unit_cost_cents,
        discount_type, discount_percent, discount_cents, discount_reason,
        line_total_cents, taxable, serial_number, is_special_order,
        special_order_notes, notes, sort_order, metadata
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22
      ) RETURNING *`,
      [
        orderId,
        item.productId || null,
        item.productSku || item.sku || null,
        item.productName || item.name,
        item.productDescription || item.description || null,
        item.manufacturer || null,
        item.model || null,
        item.quantity || 1,
        item.unitPriceCents,
        item.unitCostCents || null,
        item.discountType || null,
        item.discountPercent || 0,
        item.discountCents || 0,
        item.discountReason || null,
        lineTotal,
        item.taxable !== false,
        item.serialNumber || null,
        item.isSpecialOrder || false,
        item.specialOrderNotes || null,
        item.notes || null,
        sortOrder,
        JSON.stringify(item.metadata || {}),
      ]
    );
  }

  /**
   * Insert payment
   */
  async _insertPayment(client, orderId, payment, userId) {
    const result = await client.query(
      `INSERT INTO unified_order_payments (
        order_id, payment_method, amount_cents, status,
        cash_tendered_cents, change_given_cents,
        card_brand, card_last_four, authorization_code, processor_reference,
        check_number, gift_card_number,
        processed_by, processed_at, notes, metadata
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7, $8, $9, $10,
        $11, $12,
        $13, CURRENT_TIMESTAMP, $14, $15
      ) RETURNING *`,
      [
        orderId,
        payment.paymentMethod,
        payment.amountCents,
        payment.status || 'completed',
        payment.cashTenderedCents || null,
        payment.changeGivenCents || null,
        payment.cardBrand || null,
        payment.cardLastFour || null,
        payment.authorizationCode || null,
        payment.processorReference || null,
        payment.checkNumber || null,
        payment.giftCardNumber || null,
        userId,
        payment.notes || null,
        JSON.stringify(payment.metadata || {}),
      ]
    );

    return result.rows[0];
  }

  /**
   * Map database row to camelCase object
   */
  _mapOrderRow(row) {
    return {
      id: row.id,
      orderNumber: row.order_number,
      source: row.source,
      status: row.status,

      // Customer
      customerId: row.customer_id,
      customerName: row.customer_name || row.customer_display_name,
      customerEmail: row.customer_email || row.customer_display_email,
      customerPhone: row.customer_phone || row.customer_display_phone,
      customerAddress: row.customer_address,

      // Attribution
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      salespersonId: row.salesperson_id,
      salespersonName: row.salesperson_display_name,

      // POS fields
      registerId: row.register_id,
      registerName: row.register_name,
      shiftId: row.shift_id,

      // Quote fields
      quoteExpiryDate: row.quote_expiry_date,
      quoteValidDays: row.quote_valid_days,
      quoteRevision: row.quote_revision,
      quoteSentAt: row.quote_sent_at,
      quoteViewedAt: row.quote_viewed_at,
      quoteApprovedAt: row.quote_approved_at,
      quoteApprovedBy: row.quote_approved_by,
      quoteRejectionReason: row.quote_rejection_reason,

      // Financials (convert cents to dollars for display)
      subtotalCents: row.subtotal_cents,
      subtotal: row.subtotal_cents / 100,
      itemDiscountCents: row.item_discount_cents,
      itemDiscount: row.item_discount_cents / 100,
      orderDiscountCents: row.order_discount_cents,
      orderDiscount: row.order_discount_cents / 100,
      orderDiscountType: row.order_discount_type,
      orderDiscountReason: row.order_discount_reason,
      orderDiscountCode: row.order_discount_code,
      taxableAmountCents: row.taxable_amount_cents,

      // Tax
      taxProvince: row.tax_province,
      hstRate: parseFloat(row.hst_rate),
      hstCents: row.hst_cents,
      hst: row.hst_cents / 100,
      gstRate: parseFloat(row.gst_rate),
      gstCents: row.gst_cents,
      gst: row.gst_cents / 100,
      pstRate: parseFloat(row.pst_rate),
      pstCents: row.pst_cents,
      pst: row.pst_cents / 100,
      taxExempt: row.tax_exempt,
      taxExemptNumber: row.tax_exempt_number,
      totalTaxCents: row.hst_cents + row.gst_cents + row.pst_cents,
      totalTax: (row.hst_cents + row.gst_cents + row.pst_cents) / 100,

      // Delivery
      deliveryCents: row.delivery_cents,
      delivery: row.delivery_cents / 100,
      deliveryMethod: row.delivery_method,
      deliveryAddress: row.delivery_address,
      deliveryInstructions: row.delivery_instructions,
      deliveryDate: row.delivery_date,
      deliveryTimeSlot: row.delivery_time_slot,
      deliveryStreetNumber: row.delivery_street_number,
      deliveryStreetName: row.delivery_street_name,
      deliveryUnit: row.delivery_unit,
      deliveryBuzzer: row.delivery_buzzer,
      deliveryCity: row.delivery_city,
      deliveryProvince: row.delivery_province,
      deliveryPostalCode: row.delivery_postal_code,
      fulfillmentType: row.fulfillment_type,

      // Totals
      totalCents: row.total_cents,
      total: row.total_cents / 100,
      amountPaidCents: row.amount_paid_cents,
      amountPaid: row.amount_paid_cents / 100,
      amountDueCents: row.amount_due_cents,
      amountDue: row.amount_due_cents / 100,
      depositRequiredCents: row.deposit_required_cents,
      depositRequired: row.deposit_required_cents / 100,
      depositPaidCents: row.deposit_paid_cents,
      depositPaid: row.deposit_paid_cents / 100,
      paymentStatus: row.payment_status || 'unpaid',

      // Invoice
      invoiceNumber: row.invoice_number,
      invoiceDate: row.invoice_date,
      invoiceDueDate: row.invoice_due_date,
      invoiceTerms: row.invoice_terms,

      // Notes
      internalNotes: row.internal_notes,
      customerNotes: row.customer_notes,

      // Marketing
      marketingSourceId: row.marketing_source_id,
      marketingSourceDetail: row.marketing_source_detail,

      // Metadata
      metadata: row.metadata,
      tags: row.tags,
      itemCount: row.item_count ? parseInt(row.item_count, 10) : undefined,

      // Timestamps
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      voidedAt: row.voided_at,
      voidedBy: row.voided_by,
      voidReason: row.void_reason,

      // Legacy
      legacyQuoteId: row.legacy_quote_id,
      legacyTransactionId: row.legacy_transaction_id,
    };
  }

  /**
   * Map item row to camelCase
   */
  _mapItemRow(row) {
    return {
      id: row.id,
      orderId: row.order_id,
      productId: row.product_id,
      productSku: row.product_sku,
      productName: row.product_name,
      productDescription: row.product_description,
      manufacturer: row.manufacturer,
      model: row.model,
      quantity: row.quantity,
      unitPriceCents: row.unit_price_cents,
      unitPrice: row.unit_price_cents / 100,
      unitCostCents: row.unit_cost_cents,
      unitCost: row.unit_cost_cents ? row.unit_cost_cents / 100 : null,
      discountType: row.discount_type,
      discountPercent: parseFloat(row.discount_percent || 0),
      discountCents: row.discount_cents,
      discountReason: row.discount_reason,
      lineSubtotalCents: row.line_subtotal_cents,
      lineSubtotal: row.line_subtotal_cents / 100,
      lineDiscountCents: row.line_discount_cents,
      lineDiscount: row.line_discount_cents / 100,
      lineTotalCents: row.line_total_cents,
      lineTotal: row.line_total_cents / 100,
      taxable: row.taxable,
      taxCents: row.tax_cents,
      serialNumber: row.serial_number,
      lotNumber: row.lot_number,
      fulfilledQuantity: row.fulfilled_quantity,
      backorderedQuantity: row.backordered_quantity,
      fulfillmentStatus: row.fulfillment_status,
      isSpecialOrder: row.is_special_order,
      specialOrderEta: row.special_order_eta,
      specialOrderNotes: row.special_order_notes,
      warrantyId: row.warranty_id,
      warrantyExpires: row.warranty_expires,
      sortOrder: row.sort_order,
      notes: row.notes,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map payment row to camelCase
   */
  _mapPaymentRow(row) {
    return {
      id: row.id,
      orderId: row.order_id,
      paymentMethod: row.payment_method,
      amountCents: row.amount_cents,
      amount: row.amount_cents / 100,
      status: row.status,
      cashTenderedCents: row.cash_tendered_cents,
      cashTendered: row.cash_tendered_cents ? row.cash_tendered_cents / 100 : null,
      changeGivenCents: row.change_given_cents,
      changeGiven: row.change_given_cents ? row.change_given_cents / 100 : null,
      cardBrand: row.card_brand,
      cardLastFour: row.card_last_four,
      cardExpiry: row.card_expiry,
      authorizationCode: row.authorization_code,
      processorReference: row.processor_reference,
      checkNumber: row.check_number,
      giftCardNumber: row.gift_card_number,
      financingProvider: row.financing_provider,
      financingAccount: row.financing_account,
      financingTerms: row.financing_terms,
      isRefund: row.is_refund,
      refundReason: row.refund_reason,
      originalPaymentId: row.original_payment_id,
      processedBy: row.processed_by,
      processedByName: row.processed_by_name,
      processedAt: row.processed_at,
      voidedAt: row.voided_at,
      etransferReference: row.etransfer_reference,
      etransferStatus: row.etransfer_status,
      etransferReceivedAt: row.etransfer_received_at,
      etransferConfirmedBy: row.etransfer_confirmed_by,
      notes: row.notes,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  }
}

module.exports = UnifiedOrderService;
