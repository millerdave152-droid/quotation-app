/**
 * Customer Payments Routes
 * Handles payment tracking and customer credit management
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/payments/customer/:customerId
 * Get all payments for a specific customer
 */
router.get('/customer/:customerId', authenticate, async (req, res) => {
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
router.get('/customer/:customerId/summary', authenticate, async (req, res) => {
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
router.post('/', authenticate, async (req, res) => {
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
router.put('/:id', authenticate, async (req, res) => {
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
router.delete('/:id', authenticate, async (req, res) => {
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
router.put('/customer/:customerId/credit-limit', authenticate, async (req, res) => {
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
router.get('/stats', authenticate, async (req, res) => {
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

// ============================================
// CUSTOMER PORTAL PAYMENT ENDPOINTS
// ============================================

const StripeService = require('../services/StripeService');
const cache = require('../cache');
let stripeService = null;

function getStripeService() {
  if (!stripeService) {
    stripeService = new StripeService(pool, cache);
  }
  return stripeService;
}

/**
 * POST /api/payments/portal/create-session/:token
 * Create a Stripe checkout session for a quote deposit/payment
 */
router.post('/portal/create-session/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { paymentType = 'deposit' } = req.body;

    // Get quote by portal token
    const quoteResult = await pool.query(`
      SELECT
        q.*,
        c.name as customer_name,
        c.email as customer_email,
        c.stripe_customer_id
      FROM quotations q
      JOIN customers c ON q.customer_id = c.id
      WHERE q.portal_token = $1
    `, [token]);

    if (quoteResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Quote not found' });
    }

    const quote = quoteResult.rows[0];

    if (!['ACCEPTED', 'WON', 'SENT', 'VIEWED'].includes(quote.status)) {
      return res.status(400).json({ success: false, error: 'Quote is not in a payable state' });
    }

    const stripe = getStripeService();
    if (!stripe.isConfigured()) {
      return res.status(503).json({ success: false, error: 'Payment processing not available' });
    }

    // Calculate payment amount
    let amountCents;
    if (paymentType === 'deposit') {
      amountCents = quote.deposit_required_cents || Math.round(quote.total_cents * 0.25);
    } else {
      // Full payment
      const paidResult = await pool.query(`
        SELECT COALESCE(SUM(amount), 0) as paid
        FROM customer_payments
        WHERE quotation_id = $1 AND payment_type = 'payment'
      `, [quote.id]);
      const paidAmount = parseInt(paidResult.rows[0].paid) || 0;
      amountCents = quote.total_cents - paidAmount;
    }

    if (amountCents <= 0) {
      return res.status(400).json({ success: false, error: 'No payment required' });
    }

    // Create Stripe checkout session
    const session = await stripe.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: quote.customer_email,
      client_reference_id: quote.id.toString(),
      line_items: [{
        price_data: {
          currency: 'cad',
          product_data: {
            name: `Quote #${quote.quote_number} - ${paymentType === 'deposit' ? 'Deposit' : 'Payment'}`,
            description: `Payment for Quote #${quote.quote_number}`
          },
          unit_amount: amountCents
        },
        quantity: 1
      }],
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/customer-portal/${token}?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/customer-portal/${token}?payment=cancelled`,
      metadata: {
        quote_id: quote.id.toString(),
        customer_id: quote.customer_id.toString(),
        payment_type: paymentType,
        portal_token: token
      }
    });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('Error creating payment session:', error);
    res.status(500).json({ success: false, error: 'Failed to create payment session' });
  }
});

/**
 * POST /api/payments/webhook
 * Handle Stripe webhooks
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const stripe = getStripeService();
    if (!stripe.isConfigured()) {
      return res.status(503).send('Payment processing not configured');
    }

    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.stripe.webhooks.constructEvent(
        req.body,
        sig,
        stripe.webhookSecret
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Webhook handler failed');
  }
});

async function handleCheckoutComplete(session) {
  const { quote_id, customer_id, payment_type, portal_token } = session.metadata;

  if (!quote_id) return;

  // Record the payment
  await pool.query(`
    INSERT INTO customer_payments (
      customer_id, quotation_id, amount, payment_method, payment_type,
      reference_number, notes, payment_date
    ) VALUES ($1, $2, $3, 'stripe', 'payment', $4, $5, NOW())
  `, [
    customer_id,
    quote_id,
    session.amount_total,
    session.payment_intent,
    `Online ${payment_type} payment via Stripe`
  ]);

  // Update quote if deposit paid
  if (payment_type === 'deposit') {
    await pool.query(`
      UPDATE quotations SET
        deposit_paid = true,
        deposit_paid_at = NOW(),
        deposit_amount_cents = $1
      WHERE id = $2
    `, [session.amount_total, quote_id]);
  }

  // Check if fully paid
  const totalPaidResult = await pool.query(`
    SELECT COALESCE(SUM(amount), 0) as total_paid
    FROM customer_payments
    WHERE quotation_id = $1 AND payment_type = 'payment'
  `, [quote_id]);

  const quoteResult = await pool.query(`
    SELECT total_cents FROM quotations WHERE id = $1
  `, [quote_id]);

  const totalPaid = parseInt(totalPaidResult.rows[0].total_paid);
  const totalDue = parseInt(quoteResult.rows[0]?.total_cents || 0);

  if (totalPaid >= totalDue) {
    await pool.query(`
      UPDATE quotations SET
        status = 'WON',
        payment_status = 'paid',
        paid_at = NOW()
      WHERE id = $1
    `, [quote_id]);
  }

  console.log(`Payment recorded for quote ${quote_id}: $${(session.amount_total / 100).toFixed(2)}`);
}

async function handlePaymentSuccess(paymentIntent) {
  console.log(`Payment succeeded: ${paymentIntent.id}`);
}

async function handlePaymentFailed(paymentIntent) {
  console.log(`Payment failed: ${paymentIntent.id}`);
}

/**
 * GET /api/payments/portal/status/:token
 * Get payment status for a quote
 */
router.get('/portal/status/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const quoteResult = await pool.query(`
      SELECT
        q.id,
        q.quote_number,
        q.total_cents,
        q.deposit_required_cents,
        q.deposit_paid,
        q.deposit_amount_cents,
        q.payment_status,
        q.status
      FROM quotations q
      WHERE q.portal_token = $1
    `, [token]);

    if (quoteResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Quote not found' });
    }

    const quote = quoteResult.rows[0];

    // Get payment history
    const paymentsResult = await pool.query(`
      SELECT amount, payment_date, payment_method, notes
      FROM customer_payments
      WHERE quotation_id = $1
      ORDER BY payment_date DESC
    `, [quote.id]);

    const totalPaid = paymentsResult.rows.reduce((sum, p) => sum + parseInt(p.amount), 0);
    const remaining = quote.total_cents - totalPaid;

    res.json({
      success: true,
      data: {
        quoteNumber: quote.quote_number,
        totalCents: quote.total_cents,
        depositRequired: quote.deposit_required_cents || Math.round(quote.total_cents * 0.25),
        depositPaid: quote.deposit_paid,
        depositAmount: quote.deposit_amount_cents,
        totalPaid,
        remaining: remaining > 0 ? remaining : 0,
        fullyPaid: remaining <= 0,
        payments: paymentsResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching payment status:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment status' });
  }
});

module.exports = router;
