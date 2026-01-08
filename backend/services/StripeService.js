/**
 * Stripe Service
 * Handles Stripe payment processing, checkout sessions, and webhooks
 */

const Stripe = require('stripe');
const crypto = require('crypto');

class StripeService {
  constructor(pool, cache, config = {}) {
    this.pool = pool;
    this.cache = cache;

    // Initialize Stripe with API key
    const apiKey = config.secretKey || process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      console.warn('Stripe API key not configured. Payment features will be disabled.');
      this.stripe = null;
    } else {
      this.stripe = new Stripe(apiKey, {
        apiVersion: '2024-12-18.acacia'
      });
    }

    this.webhookSecret = config.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
    this.currency = config.currency || 'cad';
  }

  /**
   * Check if Stripe is configured
   */
  isConfigured() {
    return this.stripe !== null;
  }

  /**
   * Create a payment intent
   * @param {number} amountCents - Amount in cents
   * @param {object} metadata - Metadata to attach
   * @returns {Promise<object>} Payment intent
   */
  async createPaymentIntent(amountCents, metadata = {}) {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: this.currency,
      metadata,
      automatic_payment_methods: {
        enabled: true
      }
    });

    return paymentIntent;
  }

  /**
   * Create a checkout session for an invoice
   * @param {number} invoiceId - Invoice ID
   * @param {object} options - Checkout options
   * @returns {Promise<object>} Checkout session
   */
  async createCheckoutSession(invoiceId, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    const {
      successUrl,
      cancelUrl,
      allowDeposit = false,
      depositPercent = 25
    } = options;

    // Get invoice details
    const invoiceResult = await this.pool.query(`
      SELECT
        i.*,
        c.email,
        c.contact_name,
        c.company_name,
        c.stripe_customer_id
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.id = $1
    `, [invoiceId]);

    if (invoiceResult.rows.length === 0) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    const invoice = invoiceResult.rows[0];

    if (invoice.status === 'paid') {
      throw new Error('Invoice is already paid');
    }

    if (invoice.status === 'void') {
      throw new Error('Cannot pay voided invoice');
    }

    // Get or create Stripe customer
    let stripeCustomerId = invoice.stripe_customer_id;
    if (!stripeCustomerId && invoice.email) {
      const customer = await this.stripe.customers.create({
        email: invoice.email,
        name: invoice.contact_name || invoice.company_name,
        metadata: {
          customer_id: invoice.customer_id
        }
      });
      stripeCustomerId = customer.id;

      // Save to database
      await this.pool.query(`
        UPDATE customers
        SET stripe_customer_id = $2, stripe_created_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [invoice.customer_id, stripeCustomerId]);
    }

    // Get invoice items
    const itemsResult = await this.pool.query(`
      SELECT * FROM invoice_items WHERE invoice_id = $1
    `, [invoiceId]);

    // Build line items for checkout
    const lineItems = itemsResult.rows.map(item => ({
      price_data: {
        currency: this.currency,
        product_data: {
          name: item.description || `Item ${item.id}`,
        },
        unit_amount: item.unit_price_cents
      },
      quantity: item.quantity
    }));

    // Add tax if any
    if (invoice.tax_cents > 0) {
      lineItems.push({
        price_data: {
          currency: this.currency,
          product_data: {
            name: 'HST (13%)'
          },
          unit_amount: invoice.tax_cents
        },
        quantity: 1
      });
    }

    // Create checkout session
    const sessionParams = {
      customer: stripeCustomerId,
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl || `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/payment/cancelled`,
      metadata: {
        invoice_id: invoiceId,
        quotation_id: invoice.quotation_id,
        order_id: invoice.order_id,
        customer_id: invoice.customer_id
      },
      payment_intent_data: {
        metadata: {
          invoice_id: invoiceId,
          quotation_id: invoice.quotation_id
        }
      }
    };

    const session = await this.stripe.checkout.sessions.create(sessionParams);

    // Update invoice with checkout session ID
    await this.pool.query(`
      UPDATE invoices
      SET stripe_checkout_session_id = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [invoiceId, session.id]);

    return session;
  }

  /**
   * Generate a payment link for a quotation
   * @param {number} quotationId - Quotation ID
   * @param {object} options - Link options
   * @returns {Promise<object>} Payment link details
   */
  async generatePaymentLink(quotationId, options = {}) {
    const {
      amountCents = null,
      depositPercent = null,
      expiresInDays = 7
    } = options;

    // Get quotation
    const quoteResult = await this.pool.query(`
      SELECT q.*, c.email, c.contact_name, c.company_name
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.id = $1
    `, [quotationId]);

    if (quoteResult.rows.length === 0) {
      throw new Error(`Quotation ${quotationId} not found`);
    }

    const quote = quoteResult.rows[0];

    // Calculate amount
    let paymentAmount = amountCents;
    let depositRequired = null;

    if (!paymentAmount) {
      if (depositPercent) {
        paymentAmount = Math.round(quote.total_cents * depositPercent / 100);
        depositRequired = paymentAmount;
      } else {
        paymentAmount = quote.balance_due_cents || quote.total_cents;
      }
    }

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    // Build payment link URL
    const paymentLinkUrl = `${process.env.FRONTEND_URL}/pay/${token}`;

    // Update quotation
    await this.pool.query(`
      UPDATE quotations
      SET
        payment_link_token = $2,
        payment_link_expires_at = $3,
        payment_link_url = $4,
        deposit_required_cents = $5,
        deposit_percent = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [quotationId, token, expiresAt, paymentLinkUrl, depositRequired, depositPercent]);

    this.cache?.invalidatePattern('quotes:*');

    return {
      token,
      url: paymentLinkUrl,
      expiresAt,
      amountCents: paymentAmount,
      depositRequired,
      quotationId
    };
  }

  /**
   * Get payment link details by token
   * @param {string} token - Payment link token
   * @returns {Promise<object|null>} Quote and payment details
   */
  async getPaymentLinkByToken(token) {
    const result = await this.pool.query(`
      SELECT
        q.*,
        c.company_name,
        c.contact_name,
        c.email,
        c.phone
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.payment_link_token = $1
    `, [token]);

    if (result.rows.length === 0) {
      return null;
    }

    const quote = result.rows[0];

    // Check if expired
    if (quote.payment_link_expires_at && new Date(quote.payment_link_expires_at) < new Date()) {
      return { expired: true, quote };
    }

    // Get items
    const itemsResult = await this.pool.query(`
      SELECT qi.*, p.model, p.manufacturer, p.name as product_name
      FROM quotation_items qi
      JOIN products p ON qi.product_id = p.id
      WHERE qi.quotation_id = $1
    `, [quote.id]);

    return {
      expired: false,
      quote,
      items: itemsResult.rows
    };
  }

  /**
   * Process payment via payment link
   * @param {string} token - Payment link token
   * @param {object} paymentData - Payment details
   * @returns {Promise<object>} Payment result
   */
  async processPaymentLink(token, paymentData) {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    const linkData = await this.getPaymentLinkByToken(token);

    if (!linkData) {
      throw new Error('Invalid payment link');
    }

    if (linkData.expired) {
      throw new Error('Payment link has expired');
    }

    const { quote } = linkData;
    const amountCents = quote.deposit_required_cents || quote.balance_due_cents || quote.total_cents;

    // Create payment intent
    const paymentIntent = await this.createPaymentIntent(amountCents, {
      quotation_id: quote.id,
      customer_id: quote.customer_id,
      payment_type: quote.deposit_required_cents ? 'deposit' : 'full'
    });

    // Update quotation with payment intent
    await this.pool.query(`
      UPDATE quotations
      SET
        stripe_payment_intent_id = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [quote.id, paymentIntent.id]);

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents
    };
  }

  /**
   * Handle Stripe webhook events
   * @param {string} payload - Raw request body
   * @param {string} signature - Stripe signature header
   * @returns {Promise<object>} Processing result
   */
  async handleWebhook(payload, signature) {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    // Verify webhook signature
    let event;
    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }

    // Check if we've already processed this event
    const existingEvent = await this.pool.query(`
      SELECT id FROM stripe_webhook_events WHERE stripe_event_id = $1
    `, [event.id]);

    if (existingEvent.rows.length > 0) {
      return { status: 'already_processed', eventId: event.id };
    }

    // Store the event
    await this.pool.query(`
      INSERT INTO stripe_webhook_events (
        stripe_event_id, event_type, payload, api_version
      )
      VALUES ($1, $2, $3, $4)
    `, [event.id, event.type, JSON.stringify(event.data), event.api_version]);

    // Process based on event type
    let result = { status: 'processed', eventId: event.id };

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          result.details = await this.handleCheckoutCompleted(event.data.object);
          break;

        case 'payment_intent.succeeded':
          result.details = await this.handlePaymentSucceeded(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          result.details = await this.handlePaymentFailed(event.data.object);
          break;

        case 'charge.refunded':
          result.details = await this.handleRefund(event.data.object);
          break;

        default:
          result.status = 'ignored';
          result.reason = `Unhandled event type: ${event.type}`;
      }

      // Mark as processed
      await this.pool.query(`
        UPDATE stripe_webhook_events
        SET processed = true, processed_at = CURRENT_TIMESTAMP
        WHERE stripe_event_id = $1
      `, [event.id]);

    } catch (error) {
      // Log error but don't throw - webhook should return 200
      await this.pool.query(`
        UPDATE stripe_webhook_events
        SET
          processing_attempts = processing_attempts + 1,
          last_attempt_at = CURRENT_TIMESTAMP,
          error_message = $2
        WHERE stripe_event_id = $1
      `, [event.id, error.message]);

      result.status = 'error';
      result.error = error.message;
    }

    return result;
  }

  /**
   * Handle checkout.session.completed event
   */
  async handleCheckoutCompleted(session) {
    const { invoice_id, quotation_id, order_id, customer_id } = session.metadata;

    // Update invoice if exists
    if (invoice_id) {
      await this.pool.query(`
        UPDATE invoices
        SET
          amount_paid_cents = total_cents,
          balance_due_cents = 0,
          status = 'paid',
          paid_at = CURRENT_TIMESTAMP,
          stripe_checkout_session_id = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [invoice_id, session.id]);
    }

    // Update quotation payment status
    if (quotation_id) {
      await this.pool.query(`
        UPDATE quotations
        SET
          payment_status = 'paid',
          deposit_paid_cents = COALESCE(deposit_required_cents, total_cents),
          deposit_paid_at = CURRENT_TIMESTAMP,
          payment_completed_at = CURRENT_TIMESTAMP,
          stripe_checkout_session_id = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [quotation_id, session.id]);
    }

    // Log transaction
    await this.pool.query(`
      INSERT INTO payment_transactions (
        quotation_id, order_id, invoice_id, customer_id,
        stripe_checkout_session_id, transaction_type,
        amount_cents, currency, status, processed_at
      )
      VALUES ($1, $2, $3, $4, $5, 'payment', $6, $7, 'succeeded', CURRENT_TIMESTAMP)
    `, [
      quotation_id, order_id, invoice_id, customer_id,
      session.id, session.amount_total, session.currency
    ]);

    this.cache?.invalidatePattern('quotes:*');
    this.cache?.invalidatePattern('invoices:*');

    return { invoiceId: invoice_id, quotationId: quotation_id };
  }

  /**
   * Handle payment_intent.succeeded event
   */
  async handlePaymentSucceeded(paymentIntent) {
    const { quotation_id, invoice_id, customer_id, payment_type } = paymentIntent.metadata;

    // Determine if this is deposit or full payment
    const isDeposit = payment_type === 'deposit';

    if (quotation_id) {
      await this.pool.query(`
        UPDATE quotations
        SET
          payment_status = $2,
          ${isDeposit ? 'deposit_paid_cents = $3, deposit_paid_at = CURRENT_TIMESTAMP' : 'payment_completed_at = CURRENT_TIMESTAMP'},
          stripe_payment_intent_id = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [
        quotation_id,
        isDeposit ? 'deposit_paid' : 'paid',
        paymentIntent.amount,
        paymentIntent.id
      ]);
    }

    // Log transaction
    await this.pool.query(`
      INSERT INTO payment_transactions (
        quotation_id, invoice_id, customer_id,
        stripe_payment_intent_id, stripe_charge_id,
        transaction_type, amount_cents, currency, status,
        card_brand, card_last4, processed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'succeeded', $9, $10, CURRENT_TIMESTAMP)
    `, [
      quotation_id,
      invoice_id,
      customer_id,
      paymentIntent.id,
      paymentIntent.latest_charge,
      isDeposit ? 'deposit' : 'payment',
      paymentIntent.amount,
      paymentIntent.currency,
      paymentIntent.payment_method_types?.[0],
      null // Would need charge details for card info
    ]);

    this.cache?.invalidatePattern('quotes:*');

    return { quotationId: quotation_id, amount: paymentIntent.amount };
  }

  /**
   * Handle payment_intent.payment_failed event
   */
  async handlePaymentFailed(paymentIntent) {
    const { quotation_id } = paymentIntent.metadata;

    if (quotation_id) {
      await this.pool.query(`
        UPDATE quotations
        SET
          payment_status = 'failed',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [quotation_id]);
    }

    // Log failed transaction
    await this.pool.query(`
      INSERT INTO payment_transactions (
        quotation_id, stripe_payment_intent_id,
        transaction_type, amount_cents, currency, status,
        failure_code, failure_message, processed_at
      )
      VALUES ($1, $2, 'payment', $3, $4, 'failed', $5, $6, CURRENT_TIMESTAMP)
    `, [
      quotation_id,
      paymentIntent.id,
      paymentIntent.amount,
      paymentIntent.currency,
      paymentIntent.last_payment_error?.code,
      paymentIntent.last_payment_error?.message
    ]);

    this.cache?.invalidatePattern('quotes:*');

    return { quotationId: quotation_id, error: paymentIntent.last_payment_error?.message };
  }

  /**
   * Handle charge.refunded event
   */
  async handleRefund(charge) {
    // Log refund transaction
    await this.pool.query(`
      INSERT INTO payment_transactions (
        stripe_charge_id, stripe_refund_id,
        transaction_type, amount_cents, currency, status, processed_at
      )
      VALUES ($1, $2, 'refund', $3, $4, 'succeeded', CURRENT_TIMESTAMP)
    `, [
      charge.id,
      charge.refunds?.data?.[0]?.id,
      charge.amount_refunded,
      charge.currency
    ]);

    return { chargeId: charge.id, amountRefunded: charge.amount_refunded };
  }

  /**
   * Get payment status for a payment intent
   * @param {string} paymentIntentId - Stripe payment intent ID
   * @returns {Promise<object>} Payment status
   */
  async getPaymentStatus(paymentIntentId) {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

    return {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      metadata: paymentIntent.metadata
    };
  }

  /**
   * Refund a payment
   * @param {string} chargeId - Stripe charge ID
   * @param {number} amountCents - Amount to refund (null for full refund)
   * @param {string} reason - Refund reason
   * @returns {Promise<object>} Refund details
   */
  async refundPayment(chargeId, amountCents = null, reason = '') {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    const refundParams = {
      charge: chargeId,
      reason: reason || 'requested_by_customer'
    };

    if (amountCents) {
      refundParams.amount = amountCents;
    }

    const refund = await this.stripe.refunds.create(refundParams);

    return refund;
  }
}

module.exports = StripeService;
