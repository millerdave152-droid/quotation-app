/**
 * Customer Payments Routes
 * Handles payment tracking and customer credit management
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');

/**
 * GET /api/payments/customer/:customerId
 * Get all payments for a specific customer
 */
router.get('/customer/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    const result = await pool.query(`
      SELECT
        p.*,
        q.quotation_number,
        q.quote_number
      FROM customer_payments p
      LEFT JOIN quotations q ON p.quotation_id = q.id
      WHERE p.customer_id = $1
      ORDER BY p.payment_date DESC
    `, [customerId]);

    res.json({
      success: true,
      payments: result.rows
    });
  } catch (error) {
    console.error('Error fetching customer payments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payments'
    });
  }
});

/**
 * GET /api/payments/customer/:customerId/summary
 * Get payment summary for a customer
 */
router.get('/customer/:customerId/summary', async (req, res) => {
  try {
    const { customerId } = req.params;

    const result = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.credit_limit,
        c.current_balance,
        c.available_credit,
        c.payment_terms,
        c.credit_status,
        COALESCE(SUM(CASE WHEN q.status IN ('Approved', 'Converted') THEN q.total_amount ELSE 0 END), 0) as total_invoiced,
        COALESCE((
          SELECT SUM(amount)
          FROM customer_payments
          WHERE customer_id = c.id
          AND payment_type = 'payment'
        ), 0) as total_paid,
        COALESCE((
          SELECT COUNT(*)
          FROM customer_payments
          WHERE customer_id = c.id
        ), 0) as payment_count,
        (
          SELECT payment_date
          FROM customer_payments
          WHERE customer_id = c.id
          ORDER BY payment_date DESC
          LIMIT 1
        ) as last_payment_date
      FROM customers c
      LEFT JOIN quotations q ON c.id = q.customer_id
      WHERE c.id = $1
      GROUP BY c.id, c.name, c.credit_limit, c.current_balance, c.available_credit,
               c.payment_terms, c.credit_status
    `, [customerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    res.json({
      success: true,
      summary: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching payment summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment summary'
    });
  }
});

/**
 * POST /api/payments
 * Record a new payment
 */
router.post('/', async (req, res) => {
  try {
    const {
      customer_id,
      quotation_id,
      amount,
      payment_method = 'Cash',
      payment_type = 'payment',
      reference_number,
      notes,
      created_by,
      payment_date
    } = req.body;

    if (!customer_id || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Customer ID and amount are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Payment amount must be greater than zero'
      });
    }

    const result = await pool.query(`
      INSERT INTO customer_payments (
        customer_id, quotation_id, amount, payment_method,
        payment_type, reference_number, notes, created_by, payment_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      customer_id,
      quotation_id || null,
      amount,
      payment_method,
      payment_type,
      reference_number || null,
      notes || null,
      created_by || 'system',
      payment_date || new Date()
    ]);

    console.log(`💰 Payment recorded: $${amount} for customer ${customer_id}`);

    res.status(201).json({
      success: true,
      payment: result.rows[0],
      message: 'Payment recorded successfully'
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record payment'
    });
  }
});

/**
 * PUT /api/payments/:id
 * Update a payment record
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      amount,
      payment_method,
      payment_type,
      reference_number,
      notes,
      payment_date
    } = req.body;

    const result = await pool.query(`
      UPDATE customer_payments
      SET
        amount = COALESCE($1, amount),
        payment_method = COALESCE($2, payment_method),
        payment_type = COALESCE($3, payment_type),
        reference_number = COALESCE($4, reference_number),
        notes = COALESCE($5, notes),
        payment_date = COALESCE($6, payment_date),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `, [amount, payment_method, payment_type, reference_number, notes, payment_date, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    res.json({
      success: true,
      payment: result.rows[0],
      message: 'Payment updated successfully'
    });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update payment'
    });
  }
});

/**
 * DELETE /api/payments/:id
 * Delete a payment record
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM customer_payments WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    console.log(`🗑️ Payment deleted: ${id}`);

    res.json({
      success: true,
      message: 'Payment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete payment'
    });
  }
});

/**
 * PUT /api/payments/customer/:customerId/credit-limit
 * Update customer credit limit
 */
router.put('/customer/:customerId/credit-limit', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { credit_limit, payment_terms } = req.body;

    if (credit_limit !== undefined && credit_limit < 0) {
      return res.status(400).json({
        success: false,
        error: 'Credit limit cannot be negative'
      });
    }

    const result = await pool.query(`
      UPDATE customers
      SET
        credit_limit = COALESCE($1, credit_limit),
        payment_terms = COALESCE($2, payment_terms),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, name, credit_limit, current_balance, available_credit,
                payment_terms, credit_status
    `, [credit_limit, payment_terms, customerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    console.log(`📊 Credit limit updated for customer ${customerId}: $${credit_limit}`);

    res.json({
      success: true,
      customer: result.rows[0],
      message: 'Credit limit updated successfully'
    });
  } catch (error) {
    console.error('Error updating credit limit:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update credit limit'
    });
  }
});

/**
 * GET /api/payments/stats
 * Get overall payment statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(DISTINCT customer_id) as total_customers_with_payments,
        COUNT(*) as total_payments,
        COALESCE(SUM(amount), 0) as total_amount_received,
        COALESCE(AVG(amount), 0) as average_payment,
        (
          SELECT COUNT(*)
          FROM customers
          WHERE credit_limit > 0
        ) as customers_with_credit,
        (
          SELECT COUNT(*)
          FROM customers
          WHERE credit_status = 'overlimit'
        ) as customers_overlimit,
        (
          SELECT COUNT(*)
          FROM customers
          WHERE credit_status = 'warning'
        ) as customers_warning,
        (
          SELECT SUM(current_balance)
          FROM customers
        ) as total_outstanding_balance
      FROM customer_payments
      WHERE payment_type = 'payment'
    `);

    res.json({
      success: true,
      stats: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching payment stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment statistics'
    });
  }
});

module.exports = router;
