/**
 * TeleTime - E-Transfer Payment Service
 * Manages e-transfer payment initiation, tracking, and confirmation
 * against unified_order_payments.
 */

const crypto = require('crypto');
const { ApiError } = require('../middleware/errorHandler');

class ETransferService {
  constructor(pool, opts = {}) {
    this.pool = pool;
    this.companyEmail = opts.companyEmail || process.env.ETRANSFER_EMAIL || 'payments@teletime.ca';
    this.emailService = opts.emailService || null;
  }

  // ==========================================================================
  // REFERENCE GENERATION
  // ==========================================================================

  /**
   * Generate a unique e-transfer reference code.
   * Format: TT-YYYY-XXXXX (5 random alphanumeric characters)
   */
  async generateReference() {
    const year = new Date().getFullYear();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let attempts = 0;

    while (attempts < 10) {
      let random = '';
      for (let i = 0; i < 5; i++) {
        random += chars.charAt(crypto.randomInt(chars.length));
      }

      const reference = `TT-${year}-${random}`;

      // Check uniqueness
      const exists = await this.pool.query(
        `SELECT 1 FROM unified_order_payments WHERE etransfer_reference = $1`,
        [reference]
      );

      if (exists.rows.length === 0) {
        return reference;
      }

      attempts++;
    }

    throw ApiError.create(500, 'Failed to generate unique e-transfer reference');
  }

  // ==========================================================================
  // INITIATE E-TRANSFER PAYMENT
  // ==========================================================================

  /**
   * Create an e-transfer payment record on an order.
   * Sets the payment to pending and returns instructions.
   * @param {number} orderId
   * @param {number} amountCents - Amount to pay via e-transfer (null = full balance)
   * @param {number} userId - Staff initiating
   * @returns {Object} Payment record with instructions
   */
  async initiate(orderId, amountCents, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Load order
      const orderResult = await client.query(
        `SELECT id, order_number, total_cents, amount_paid_cents, status,
                customer_name, customer_email
         FROM unified_orders WHERE id = $1 FOR UPDATE`,
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        throw ApiError.notFound('Order');
      }

      const order = orderResult.rows[0];
      const balanceDue = order.total_cents - order.amount_paid_cents;

      if (balanceDue <= 0) {
        throw ApiError.badRequest('Order is already fully paid');
      }

      // Default to full balance if no amount specified
      const paymentAmount = amountCents || balanceDue;

      if (paymentAmount > balanceDue) {
        throw ApiError.badRequest(
          `Amount ($${(paymentAmount / 100).toFixed(2)}) exceeds balance due ($${(balanceDue / 100).toFixed(2)})`
        );
      }

      // Generate reference
      const reference = await this.generateReference();

      // Insert payment record
      const paymentResult = await client.query(
        `INSERT INTO unified_order_payments (
          order_id, payment_method, amount_cents, status,
          etransfer_reference, etransfer_status,
          processed_by, processed_at, notes
        ) VALUES ($1, 'etransfer', $2, 'pending', $3, 'pending', $4, NOW(), $5)
        RETURNING *`,
        [
          orderId,
          paymentAmount,
          reference,
          userId,
          `E-transfer initiated for order ${order.order_number}`,
        ]
      );

      // Update order status to awaiting_etransfer if applicable
      // Only transition if order is in a state that supports it
      const transitionableStatuses = [
        'order_pending', 'order_processing', 'invoice_sent',
        'quote_approved', 'draft',
      ];

      if (transitionableStatuses.includes(order.status)) {
        try {
          await client.query(
            `UPDATE unified_orders SET status = 'awaiting_etransfer', updated_at = NOW() WHERE id = $1`,
            [orderId]
          );

          // Record status change in history
          await client.query(
            `INSERT INTO unified_order_status_history (
              order_id, from_status, to_status, changed_by, reason
            ) VALUES ($1, $2, 'awaiting_etransfer', $3, $4)`,
            [orderId, order.status, userId, 'E-transfer payment initiated']
          );
        } catch {
          // If awaiting_etransfer enum value doesn't exist yet, skip the transition
        }
      }

      await client.query('COMMIT');

      return {
        paymentId: paymentResult.rows[0].id,
        referenceCode: reference,
        amountCents: paymentAmount,
        amount: paymentAmount / 100,
        orderId,
        orderNumber: order.order_number,
        companyEmail: this.companyEmail,
        instructions: [
          `Send an Interac e-Transfer to: ${this.companyEmail}`,
          `Amount: $${(paymentAmount / 100).toFixed(2)}`,
          `Include reference code in the memo: ${reference}`,
          'No security question required — auto-deposit is enabled.',
        ],
        status: 'pending',
        etransferStatus: 'pending',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // LIST PENDING
  // ==========================================================================

  /**
   * Get all pending e-transfer payments for reconciliation.
   */
  async getPending(filters = {}) {
    const conditions = [
      "p.payment_method = 'etransfer'",
      "p.etransfer_status IN ('pending', 'received')",
    ];
    const values = [];
    let paramIndex = 1;

    if (filters.dateFrom) {
      conditions.push(`p.created_at >= $${paramIndex++}`);
      values.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push(`p.created_at <= $${paramIndex++}::date + INTERVAL '1 day'`);
      values.push(filters.dateTo);
    }
    if (filters.search) {
      conditions.push(`(p.etransfer_reference ILIKE $${paramIndex} OR uo.order_number ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 100);
    const offset = (page - 1) * limit;

    const countResult = await this.pool.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM unified_order_payments p
       JOIN unified_orders uo ON uo.id = p.order_id
       LEFT JOIN customers c ON c.id = uo.customer_id
       WHERE ${conditions.join(' AND ')}`,
      values
    );
    const total = countResult.rows[0].total;

    values.push(limit, offset);
    const result = await this.pool.query(
      `SELECT p.id, p.order_id, p.amount_cents, p.status, p.etransfer_reference,
              p.etransfer_status, p.etransfer_received_at, p.created_at, p.notes,
              uo.order_number, uo.total_cents AS order_total_cents,
              uo.amount_paid_cents AS order_paid_cents,
              uo.customer_name, uo.customer_email,
              c.name AS customer_display_name,
              c.phone AS customer_phone,
              u.name AS processed_by_name
       FROM unified_order_payments p
       JOIN unified_orders uo ON uo.id = p.order_id
       LEFT JOIN customers c ON c.id = uo.customer_id
       LEFT JOIN users u ON u.id = p.processed_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.created_at ASC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      values
    );

    return {
      data: result.rows.map(row => ({
        id: row.id,
        orderId: row.order_id,
        orderNumber: row.order_number,
        amountCents: row.amount_cents,
        amount: row.amount_cents / 100,
        referenceCode: row.etransfer_reference,
        etransferStatus: row.etransfer_status,
        etransferReceivedAt: row.etransfer_received_at,
        status: row.status,
        customerName: row.customer_display_name || row.customer_name,
        customerEmail: row.customer_email,
        customerPhone: row.customer_phone,
        orderTotalCents: row.order_total_cents,
        orderTotal: row.order_total_cents / 100,
        orderPaidCents: row.order_paid_cents,
        orderPaid: row.order_paid_cents / 100,
        orderBalanceDue: (row.order_total_cents - row.order_paid_cents) / 100,
        processedByName: row.processed_by_name,
        createdAt: row.created_at,
        notes: row.notes,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ==========================================================================
  // MARK AS RECEIVED
  // ==========================================================================

  /**
   * Mark an e-transfer as received (money arrived, not yet confirmed).
   */
  async markReceived(reference, userId) {
    const result = await this.pool.query(
      `UPDATE unified_order_payments
       SET etransfer_status = 'received', etransfer_received_at = NOW(), updated_at = NOW()
       WHERE etransfer_reference = $1 AND etransfer_status = 'pending'
       RETURNING *`,
      [reference.toUpperCase()]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound('E-transfer payment not found or not in pending status');
    }

    const row = result.rows[0];
    return {
      id: row.id,
      orderId: row.order_id,
      referenceCode: row.etransfer_reference,
      etransferStatus: 'received',
      receivedAt: row.etransfer_received_at,
    };
  }

  // ==========================================================================
  // CONFIRM
  // ==========================================================================

  /**
   * Confirm an e-transfer payment. Completes the payment and
   * updates the order status if fully paid.
   * @param {string} reference - E-transfer reference code
   * @param {number} userId - Staff confirming
   * @param {Object} opts - { notes }
   */
  async confirm(reference, userId, opts = {}) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Lock the payment row
      const paymentResult = await client.query(
        `SELECT p.*, uo.order_number, uo.total_cents, uo.amount_paid_cents, uo.status AS order_status,
                uo.customer_email, uo.customer_name
         FROM unified_order_payments p
         JOIN unified_orders uo ON uo.id = p.order_id
         WHERE p.etransfer_reference = $1
         FOR UPDATE OF p`,
        [reference.toUpperCase()]
      );

      if (paymentResult.rows.length === 0) {
        throw ApiError.notFound('E-transfer payment not found');
      }

      const payment = paymentResult.rows[0];

      if (payment.etransfer_status === 'confirmed') {
        throw ApiError.badRequest('E-transfer already confirmed');
      }

      if (payment.etransfer_status === 'failed') {
        throw ApiError.badRequest('Cannot confirm a failed e-transfer');
      }

      // Update payment to confirmed + completed
      await client.query(
        `UPDATE unified_order_payments
         SET status = 'completed',
             etransfer_status = 'confirmed',
             etransfer_received_at = COALESCE(etransfer_received_at, NOW()),
             etransfer_confirmed_by = $1,
             notes = COALESCE($2, notes),
             metadata = jsonb_set(
               COALESCE(metadata, '{}'),
               '{confirmation}',
               $3::jsonb
             )
         WHERE id = $4`,
        [
          userId,
          opts.notes || null,
          JSON.stringify({
            confirmedBy: userId,
            confirmedAt: new Date().toISOString(),
            notes: opts.notes || null,
          }),
          payment.id,
        ]
      );

      // Recalculate order totals (this updates amount_paid_cents)
      await client.query('SELECT recalculate_order_totals($1)', [payment.order_id]);

      // Check if order is now fully paid
      const updatedOrder = await client.query(
        'SELECT total_cents, amount_paid_cents, status FROM unified_orders WHERE id = $1',
        [payment.order_id]
      );

      const { total_cents, amount_paid_cents, status } = updatedOrder.rows[0];
      const fullyPaid = amount_paid_cents >= total_cents;

      if (fullyPaid && status !== 'paid') {
        // Transition to paid
        try {
          await client.query(
            `SELECT transition_order_status($1, 'paid'::order_status, $2, $3)`,
            [payment.order_id, userId, 'E-transfer payment confirmed']
          );
        } catch {
          // If transition fails (e.g., invalid from-state), just update directly
          await client.query(
            `UPDATE unified_orders SET status = 'paid', updated_at = NOW() WHERE id = $1`,
            [payment.order_id]
          );

          await client.query(
            `INSERT INTO unified_order_status_history (
              order_id, from_status, to_status, changed_by, reason
            ) VALUES ($1, $2, 'paid', $3, 'E-transfer payment confirmed — fully paid')`,
            [payment.order_id, status, userId]
          );
        }
      } else if (status === 'awaiting_etransfer') {
        // Move back to order_pending if partially paid
        await client.query(
          `UPDATE unified_orders SET status = 'order_pending', updated_at = NOW() WHERE id = $1`,
          [payment.order_id]
        );

        await client.query(
          `INSERT INTO unified_order_status_history (
            order_id, from_status, to_status, changed_by, reason
          ) VALUES ($1, 'awaiting_etransfer', 'order_pending', $2, 'E-transfer confirmed, balance remaining')`,
          [payment.order_id, userId]
        );
      }

      await client.query('COMMIT');

      // Send confirmation email (non-blocking)
      if (this.emailService && payment.customer_email) {
        this._sendConfirmationEmail(payment, fullyPaid).catch(err => {
          console.warn('Failed to send e-transfer confirmation email:', err.message);
        });
      }

      return {
        success: true,
        orderId: payment.order_id,
        orderNumber: payment.order_number,
        paymentId: payment.id,
        referenceCode: payment.etransfer_reference,
        amountCents: payment.amount_cents,
        amount: payment.amount_cents / 100,
        fullyPaid,
        orderBalanceDueCents: fullyPaid ? 0 : total_cents - amount_paid_cents,
        orderBalanceDue: fullyPaid ? 0 : (total_cents - amount_paid_cents) / 100,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // MARK FAILED
  // ==========================================================================

  /**
   * Mark an e-transfer as failed (e.g., cancelled by customer).
   */
  async markFailed(reference, userId, reason) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE unified_order_payments
         SET status = 'failed',
             etransfer_status = 'failed',
             notes = $1
         WHERE etransfer_reference = $2 AND etransfer_status IN ('pending', 'received')
         RETURNING *`,
        [reason || 'E-transfer failed/cancelled', reference.toUpperCase()]
      );

      if (result.rows.length === 0) {
        throw ApiError.notFound('E-transfer payment not found or already confirmed/failed');
      }

      const payment = result.rows[0];

      // If order was awaiting_etransfer, move it back
      const orderResult = await client.query(
        `SELECT status FROM unified_orders WHERE id = $1`,
        [payment.order_id]
      );

      if (orderResult.rows[0]?.status === 'awaiting_etransfer') {
        await client.query(
          `UPDATE unified_orders SET status = 'order_pending', updated_at = NOW() WHERE id = $1`,
          [payment.order_id]
        );

        await client.query(
          `INSERT INTO unified_order_status_history (
            order_id, from_status, to_status, changed_by, reason
          ) VALUES ($1, 'awaiting_etransfer', 'order_pending', $2, $3)`,
          [payment.order_id, userId, reason || 'E-transfer failed']
        );
      }

      await client.query('COMMIT');

      return {
        success: true,
        orderId: payment.order_id,
        referenceCode: reference,
        status: 'failed',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // LOOKUP BY REFERENCE
  // ==========================================================================

  async getByReference(reference) {
    const result = await this.pool.query(
      `SELECT p.*, uo.order_number, uo.total_cents, uo.amount_paid_cents,
              uo.customer_name, uo.customer_email,
              c.name AS customer_display_name,
              u.name AS processed_by_name,
              cu.name AS confirmed_by_name
       FROM unified_order_payments p
       JOIN unified_orders uo ON uo.id = p.order_id
       LEFT JOIN customers c ON c.id = uo.customer_id
       LEFT JOIN users u ON u.id = p.processed_by
       LEFT JOIN users cu ON cu.id = p.etransfer_confirmed_by
       WHERE p.etransfer_reference = $1`,
      [reference.toUpperCase()]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      orderId: row.order_id,
      orderNumber: row.order_number,
      amountCents: row.amount_cents,
      amount: row.amount_cents / 100,
      status: row.status,
      referenceCode: row.etransfer_reference,
      etransferStatus: row.etransfer_status,
      etransferReceivedAt: row.etransfer_received_at,
      confirmedByName: row.confirmed_by_name,
      customerName: row.customer_display_name || row.customer_name,
      customerEmail: row.customer_email,
      orderTotalCents: row.total_cents,
      orderTotal: row.total_cents / 100,
      orderPaidCents: row.amount_paid_cents,
      orderBalanceDueCents: row.total_cents - row.amount_paid_cents,
      processedByName: row.processed_by_name,
      notes: row.notes,
      createdAt: row.created_at,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  async _sendConfirmationEmail(payment, fullyPaid) {
    if (!this.emailService) return;

    try {
      await this.emailService.sendEmail({
        to: payment.customer_email,
        subject: `Payment Confirmed - ${payment.order_number}`,
        text: [
          `Hi ${payment.customer_name || 'there'},`,
          '',
          `Your e-transfer payment of $${(payment.amount_cents / 100).toFixed(2)} has been confirmed.`,
          `Reference: ${payment.etransfer_reference}`,
          `Order: ${payment.order_number}`,
          '',
          fullyPaid
            ? 'Your order is now fully paid. Thank you!'
            : `Remaining balance: $${((payment.total_cents - payment.amount_paid_cents - payment.amount_cents) / 100).toFixed(2)}`,
          '',
          'Thank you for your business!',
          'TeleTime',
        ].join('\n'),
      });
    } catch (err) {
      console.warn('E-transfer confirmation email failed:', err.message);
    }
  }
}

module.exports = ETransferService;
