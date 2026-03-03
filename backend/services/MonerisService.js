/**
 * Moneris Service
 * Handles Moneris payment processing, checkout, and callbacks
 * Supports Moneris Gateway API and Moneris Checkout
 *
 * Environment Variables:
 *   MONERIS_STORE_ID      - Your Moneris store ID
 *   MONERIS_API_TOKEN     - Your Moneris API token
 *   MONERIS_CHECKOUT_ID   - Moneris Checkout profile ID (for hosted payments)
 *   MONERIS_ENVIRONMENT   - 'testing' or 'production' (defaults to 'testing')
 *   MONERIS_WEBHOOK_SECRET - Secret for verifying callback signatures
 */

const https = require('https');
const crypto = require('crypto');

// Moneris Gateway endpoints
const MONERIS_URLS = {
  testing: 'esqa.moneris.com',
  production: 'www3.moneris.com',
};

const MONERIS_CHECKOUT_URLS = {
  testing: 'gatewayt.moneris.com',
  production: 'gateway.moneris.com',
};

class MonerisService {
  constructor(pool, cache, config = {}) {
    this.pool = pool;
    this.cache = cache;

    // Initialize Moneris credentials
    this.storeId = config.storeId || process.env.MONERIS_STORE_ID;
    this.apiToken = config.apiToken || process.env.MONERIS_API_TOKEN;
    this.checkoutId = config.checkoutId || process.env.MONERIS_CHECKOUT_ID;
    this.environment = config.environment || process.env.MONERIS_ENVIRONMENT || 'testing';
    this.webhookSecret = config.webhookSecret || process.env.MONERIS_WEBHOOK_SECRET;
    this.currency = config.currency || 'CAD';

    if (!this.storeId || !this.apiToken) {
      console.warn('Moneris credentials not configured. Payment features will be disabled.');
    }
  }

  /**
   * Check if Moneris is configured
   */
  isConfigured() {
    return !!(this.storeId && this.apiToken);
  }

  // ============================================================================
  // GATEWAY API — XML-BASED REQUESTS
  // ============================================================================

  /**
   * Send an XML request to the Moneris Gateway
   * @param {string} xmlBody - The XML request body
   * @returns {Promise<object>} Parsed response
   */
  async _sendGatewayRequest(xmlBody) {
    const host = MONERIS_URLS[this.environment] || MONERIS_URLS.testing;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: host,
        port: 443,
        path: '/gateway2/servlet/MpgRequest',
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Content-Length': Buffer.byteLength(xmlBody),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = this._parseXmlResponse(data);
            resolve(parsed);
          } catch (err) {
            reject(new Error(`Moneris response parse error: ${err.message}`));
          }
        });
      });

      req.on('error', (err) => reject(new Error(`Moneris gateway error: ${err.message}`)));
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Moneris gateway timeout'));
      });

      req.write(xmlBody);
      req.end();
    });
  }

  /**
   * Parse Moneris XML response into a plain object
   */
  _parseXmlResponse(xml) {
    // Simple XML parser for Moneris flat responses
    const getValue = (tag) => {
      const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 's'));
      return match ? match[1].trim() : null;
    };

    return {
      responseCode: getValue('ResponseCode'),
      message: getValue('Message'),
      transId: getValue('TransID'),
      receiptId: getValue('ReceiptId'),
      referenceNum: getValue('ReferenceNum'),
      authCode: getValue('AuthCode'),
      transAmount: getValue('TransAmount'),
      cardType: getValue('CardType'),
      transType: getValue('TransType'),
      complete: getValue('Complete'),
      iso: getValue('ISO'),
      timedOut: getValue('TimedOut'),
      ticket: getValue('Ticket'),
      isVisaDebit: getValue('IsVisaDebit'),
      bankTotals: getValue('BankTotals'),
      rawXml: xml,
    };
  }

  /**
   * Build standard XML envelope
   */
  _buildXml(transactionType, fields) {
    const fieldXml = Object.entries(fields)
      .map(([key, value]) => `<${key}>${value}</${key}>`)
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<request>
  <store_id>${this.storeId}</store_id>
  <api_token>${this.apiToken}</api_token>
  <${transactionType}>${fieldXml}</${transactionType}>
</request>`;
  }

  /**
   * Generate a unique order ID for Moneris (max 50 chars)
   */
  _generateOrderId(prefix = 'ORD') {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Check if a Moneris response indicates success
   * Response codes 00-49 are approved, 50+ are declined/error
   */
  _isApproved(responseCode) {
    if (!responseCode) return false;
    const code = parseInt(responseCode, 10);
    return !isNaN(code) && code >= 0 && code < 50;
  }

  // ============================================================================
  // PAYMENT OPERATIONS
  // ============================================================================

  /**
   * Create a pre-authorization (hold funds on card)
   * Equivalent to Stripe's PaymentIntent creation
   * @param {number} amountCents - Amount in cents
   * @param {object} metadata - Additional metadata
   * @returns {Promise<object>} Pre-auth result
   */
  async createPaymentIntent(amountCents, metadata = {}) {
    if (!this.isConfigured()) {
      throw new Error('Moneris is not configured');
    }

    const orderId = this._generateOrderId('PI');
    const amount = (amountCents / 100).toFixed(2);

    // Use pre-authorization to hold funds (like a Stripe PaymentIntent)
    const xml = this._buildXml('preauth', {
      order_id: orderId,
      amount: amount,
      pan: metadata.cardNumber || '',
      expdate: metadata.expDate || '',
      crypt_type: '7', // SSL-enabled merchant
    });

    const response = await this._sendGatewayRequest(xml);
    const approved = this._isApproved(response.responseCode);

    // Store the pre-auth for later capture
    await this.pool.query(`
      INSERT INTO payment_transactions (
        quotation_id, order_id, customer_id,
        moneris_order_id, moneris_trans_id,
        transaction_type, amount_cents, currency, status,
        card_brand, processed_at
      )
      VALUES ($1, $2, $3, $4, $5, 'preauth', $6, $7, $8, $9, CURRENT_TIMESTAMP)
    `, [
      metadata.quotation_id || null,
      metadata.order_id || null,
      metadata.customer_id || null,
      orderId,
      response.transId,
      amountCents,
      this.currency.toLowerCase(),
      approved ? 'requires_capture' : 'failed',
      response.cardType,
    ]);

    return {
      id: orderId,
      monerisOrderId: orderId,
      monerisTransId: response.transId,
      status: approved ? 'requires_capture' : 'failed',
      amount: amountCents,
      currency: this.currency.toLowerCase(),
      authCode: response.authCode,
      responseCode: response.responseCode,
      message: response.message,
      metadata,
    };
  }

  /**
   * Process a purchase (auth + capture in one step)
   * For POS card-present transactions
   * @param {number} amountCents - Amount in cents
   * @param {object} cardDetails - Card info (for manual entry mode)
   * @param {object} metadata - Additional data
   * @returns {Promise<object>} Purchase result
   */
  async processPurchase(amountCents, cardDetails = {}, _metadata = {}) {
    if (!this.isConfigured()) {
      throw new Error('Moneris is not configured');
    }

    const orderId = this._generateOrderId('PUR');
    const amount = (amountCents / 100).toFixed(2);

    const xml = this._buildXml('purchase', {
      order_id: orderId,
      amount: amount,
      pan: cardDetails.cardNumber || '',
      expdate: cardDetails.expDate || '',
      crypt_type: '7',
    });

    const response = await this._sendGatewayRequest(xml);
    const approved = this._isApproved(response.responseCode);

    return {
      success: approved,
      monerisOrderId: orderId,
      monerisTransId: response.transId,
      authCode: response.authCode,
      responseCode: response.responseCode,
      message: response.message,
      amount: amountCents,
      cardType: response.cardType,
      referenceNum: response.referenceNum,
      complete: response.complete === 'true',
    };
  }

  /**
   * Capture a previously pre-authorized amount
   * @param {string} orderId - The original Moneris order ID
   * @param {string} transId - The original Moneris transaction ID
   * @param {number} amountCents - Amount to capture (can be less than pre-auth)
   * @returns {Promise<object>} Capture result
   */
  async capturePayment(orderId, transId, amountCents) {
    if (!this.isConfigured()) {
      throw new Error('Moneris is not configured');
    }

    const amount = (amountCents / 100).toFixed(2);

    const xml = this._buildXml('completion', {
      order_id: orderId,
      comp_amount: amount,
      txn_number: transId,
      crypt_type: '7',
    });

    const response = await this._sendGatewayRequest(xml);
    const approved = this._isApproved(response.responseCode);

    // Update transaction status
    await this.pool.query(`
      UPDATE payment_transactions
      SET status = $1, processed_at = CURRENT_TIMESTAMP
      WHERE moneris_order_id = $2
    `, [approved ? 'succeeded' : 'failed', orderId]);

    return {
      success: approved,
      monerisOrderId: orderId,
      monerisTransId: response.transId,
      authCode: response.authCode,
      responseCode: response.responseCode,
      message: response.message,
      amount: amountCents,
    };
  }

  /**
   * Void a pre-authorization (cancel before capture)
   * @param {string} orderId - The Moneris order ID
   * @param {string} transId - The Moneris transaction ID
   */
  async voidPayment(orderId, transId) {
    if (!this.isConfigured()) {
      throw new Error('Moneris is not configured');
    }

    const xml = this._buildXml('purchasecorrection', {
      order_id: orderId,
      txn_number: transId,
      crypt_type: '7',
    });

    const response = await this._sendGatewayRequest(xml);
    const approved = this._isApproved(response.responseCode);

    await this.pool.query(`
      UPDATE payment_transactions
      SET status = 'voided', processed_at = CURRENT_TIMESTAMP
      WHERE moneris_order_id = $1
    `, [orderId]);

    return {
      success: approved,
      responseCode: response.responseCode,
      message: response.message,
    };
  }

  // ============================================================================
  // REFUNDS
  // ============================================================================

  /**
   * Refund a completed purchase
   * @param {string} orderId - Original Moneris order ID
   * @param {string} transId - Original Moneris transaction ID
   * @param {number} amountCents - Amount to refund (null for full)
   * @param {string} reason - Refund reason
   * @returns {Promise<object>} Refund details
   */
  async refundPayment(orderId, transId, amountCents = null, _reason = '') {
    if (!this.isConfigured()) {
      throw new Error('Moneris is not configured');
    }

    // Look up original transaction amount if not specified
    if (!amountCents) {
      const txnResult = await this.pool.query(`
        SELECT amount_cents FROM payment_transactions
        WHERE moneris_order_id = $1 AND status = 'succeeded'
        LIMIT 1
      `, [orderId]);

      if (txnResult.rows.length > 0) {
        amountCents = txnResult.rows[0].amount_cents;
      } else {
        throw new Error('Original transaction not found');
      }
    }

    const amount = (amountCents / 100).toFixed(2);

    const xml = this._buildXml('refund', {
      order_id: orderId,
      amount: amount,
      txn_number: transId,
      crypt_type: '7',
    });

    const response = await this._sendGatewayRequest(xml);
    const approved = this._isApproved(response.responseCode);

    // Log refund transaction
    await this.pool.query(`
      INSERT INTO payment_transactions (
        moneris_order_id, moneris_trans_id, moneris_refund_id,
        transaction_type, amount_cents, currency, status,
        failure_message, processed_at
      )
      VALUES ($1, $2, $3, 'refund', $4, $5, $6, $7, CURRENT_TIMESTAMP)
    `, [
      orderId,
      transId,
      response.transId,
      amountCents,
      this.currency.toLowerCase(),
      approved ? 'succeeded' : 'failed',
      approved ? null : response.message,
    ]);

    return {
      success: approved,
      refundId: response.transId,
      monerisOrderId: orderId,
      responseCode: response.responseCode,
      message: response.message,
      amount: amountCents,
    };
  }

  // ============================================================================
  // MONERIS CHECKOUT (Hosted Payment Page)
  // ============================================================================

  /**
   * Create a Moneris Checkout session (hosted payment page)
   * Equivalent to Stripe Checkout Sessions
   * @param {number} invoiceId - Invoice ID
   * @param {object} options - Checkout options
   * @returns {Promise<object>} Checkout session details
   */
  async createCheckoutSession(invoiceId, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Moneris is not configured');
    }

    if (!this.checkoutId) {
      throw new Error('Moneris Checkout ID not configured');
    }

    const { successUrl, cancelUrl } = options;

    // Get invoice details
    const invoiceResult = await this.pool.query(`
      SELECT
        i.*,
        c.email,
        c.contact_name,
        c.company_name
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

    const orderId = this._generateOrderId('CHK');
    const amount = (invoice.total_cents / 100).toFixed(2);

    // Build Moneris Checkout request
    const checkoutHost = MONERIS_CHECKOUT_URLS[this.environment] || MONERIS_CHECKOUT_URLS.testing;
    const checkoutRequest = JSON.stringify({
      store_id: this.storeId,
      api_token: this.apiToken,
      checkout_id: this.checkoutId,
      txn_total: amount,
      order_no: orderId,
      cust_id: invoice.customer_id ? String(invoice.customer_id) : '',
      environment: this.environment === 'production' ? 'prod' : 'qa',
      action: 'preload',
      language: 'en',
      ask_cvv: 'Y',
      dynamic_descriptor: 'TeleTime',
      token: {
        data_key: '',
        issuer_id: '',
      },
      contact_details: {
        first_name: invoice.contact_name?.split(' ')[0] || '',
        last_name: invoice.contact_name?.split(' ').slice(1).join(' ') || '',
        email: invoice.email || '',
      },
    });

    // Send preload request to get checkout ticket
    const ticketResponse = await new Promise((resolve, reject) => {
      const reqOptions = {
        hostname: checkoutHost,
        port: 443,
        path: '/chkt/request/request.php',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(checkoutRequest),
        },
      };

      const req = https.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (err) { reject(new Error(`Moneris Checkout parse error: ${err.message}`)); }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('Moneris Checkout timeout')); });
      req.write(checkoutRequest);
      req.end();
    });

    if (ticketResponse.response?.error) {
      throw new Error(`Moneris Checkout error: ${ticketResponse.response.error.message}`);
    }

    const ticket = ticketResponse.response?.ticket;
    if (!ticket) {
      throw new Error('Failed to get Moneris Checkout ticket');
    }

    // Build the hosted checkout URL
    const checkoutUrl = `https://${checkoutHost}/chkt/js/chkt_v1.00.js`;

    // Update invoice with Moneris checkout info
    await this.pool.query(`
      UPDATE invoices
      SET moneris_checkout_id = $2, moneris_order_id = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [invoiceId, ticket, orderId]);

    return {
      id: ticket,
      ticket,
      url: checkoutUrl,
      orderId,
      amount: invoice.total_cents,
      environment: this.environment,
      checkoutId: this.checkoutId,
    };
  }

  // ============================================================================
  // PAYMENT LINKS (Token-Based)
  // ============================================================================

  /**
   * Generate a payment link for a quotation
   * Uses internal token system (not Moneris-specific)
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

    if (quote.payment_link_expires_at && new Date(quote.payment_link_expires_at) < new Date()) {
      return { expired: true, quote };
    }

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
   */
  async processPaymentLink(token, paymentData) {
    if (!this.isConfigured()) {
      throw new Error('Moneris is not configured');
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

    // Process purchase via Moneris Gateway
    const result = await this.processPurchase(amountCents, {
      cardNumber: paymentData.card?.number,
      expDate: paymentData.card?.exp_month + paymentData.card?.exp_year?.slice(-2),
    }, {
      quotation_id: quote.id,
      customer_id: quote.customer_id,
      payment_type: quote.deposit_required_cents ? 'deposit' : 'full',
    });

    if (result.success) {
      // Update quotation
      await this.pool.query(`
        UPDATE quotations
        SET
          moneris_order_id = $2,
          moneris_trans_id = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [quote.id, result.monerisOrderId, result.monerisTransId]);
    }

    return {
      success: result.success,
      monerisOrderId: result.monerisOrderId,
      authCode: result.authCode,
      amountCents,
      message: result.message,
    };
  }

  // ============================================================================
  // WEBHOOK / CALLBACK HANDLING
  // ============================================================================

  /**
   * Handle Moneris callback/webhook events
   * @param {object} payload - Callback payload from Moneris
   * @returns {Promise<object>} Processing result
   */
  async handleWebhook(payload) {
    // Verify callback authenticity if webhook secret is set
    if (this.webhookSecret && payload.signature) {
      const expected = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(JSON.stringify(payload.data || payload))
        .digest('hex');

      if (expected !== payload.signature) {
        throw new Error('Webhook signature verification failed');
      }
    }

    const eventType = payload.type || payload.event_type || 'unknown';
    const orderId = payload.order_id || payload.data?.order_id;

    // Check for duplicate processing
    const existing = await this.pool.query(
      'SELECT id FROM moneris_webhook_events WHERE moneris_event_id = $1',
      [payload.id || orderId]
    );

    if (existing.rows.length > 0) {
      return { status: 'already_processed', eventId: payload.id };
    }

    // Store the event
    await this.pool.query(`
      INSERT INTO moneris_webhook_events (
        moneris_event_id, event_type, payload
      ) VALUES ($1, $2, $3)
    `, [payload.id || orderId, eventType, JSON.stringify(payload)]);

    let result = { status: 'processed', eventId: payload.id };

    try {
      switch (eventType) {
        case 'payment_completed':
        case 'checkout_completed':
          result.details = await this._handlePaymentCompleted(payload);
          break;

        case 'payment_failed':
          result.details = await this._handlePaymentFailed(payload);
          break;

        case 'refund_completed':
          result.details = await this._handleRefundCompleted(payload);
          break;

        default:
          result.status = 'ignored';
          result.reason = `Unhandled event type: ${eventType}`;
      }

      await this.pool.query(`
        UPDATE moneris_webhook_events
        SET processed = true, processed_at = CURRENT_TIMESTAMP
        WHERE moneris_event_id = $1
      `, [payload.id || orderId]);

    } catch (error) {
      await this.pool.query(`
        UPDATE moneris_webhook_events
        SET
          processing_attempts = processing_attempts + 1,
          last_attempt_at = CURRENT_TIMESTAMP,
          error_message = $2
        WHERE moneris_event_id = $1
      `, [payload.id || orderId, error.message]);

      result.status = 'error';
      result.error = error.message;
    }

    return result;
  }

  async _handlePaymentCompleted(payload) {
    const orderId = payload.order_id || payload.data?.order_id;

    // Find the related quotation/invoice by moneris_order_id
    const txnResult = await this.pool.query(`
      SELECT quotation_id, invoice_id, customer_id
      FROM payment_transactions
      WHERE moneris_order_id = $1
      LIMIT 1
    `, [orderId]);

    if (txnResult.rows.length === 0) return { orderId, status: 'no_matching_transaction' };

    const { quotation_id, invoice_id, customer_id } = txnResult.rows[0];

    if (invoice_id) {
      await this.pool.query(`
        UPDATE invoices
        SET amount_paid_cents = total_cents, balance_due_cents = 0,
            status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [invoice_id]);
    }

    if (quotation_id) {
      await this.pool.query(`
        UPDATE quotations
        SET payment_status = 'paid', payment_completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [quotation_id]);
    }

    this.cache?.invalidatePattern('quotes:*');
    this.cache?.invalidatePattern('invoices:*');

    return { quotationId: quotation_id, invoiceId: invoice_id };
  }

  async _handlePaymentFailed(payload) {
    const orderId = payload.order_id || payload.data?.order_id;

    const txnResult = await this.pool.query(`
      SELECT quotation_id FROM payment_transactions
      WHERE moneris_order_id = $1 LIMIT 1
    `, [orderId]);

    if (txnResult.rows.length > 0 && txnResult.rows[0].quotation_id) {
      await this.pool.query(`
        UPDATE quotations SET payment_status = 'failed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [txnResult.rows[0].quotation_id]);
    }

    this.cache?.invalidatePattern('quotes:*');
    return { orderId, status: 'failed' };
  }

  async _handleRefundCompleted(payload) {
    const orderId = payload.order_id || payload.data?.order_id;
    const amountCents = payload.amount ? Math.round(parseFloat(payload.amount) * 100) : null;

    await this.pool.query(`
      INSERT INTO payment_transactions (
        moneris_order_id, moneris_refund_id,
        transaction_type, amount_cents, currency, status, processed_at
      ) VALUES ($1, $2, 'refund', $3, $4, 'succeeded', CURRENT_TIMESTAMP)
    `, [orderId, payload.refund_id || null, amountCents, this.currency.toLowerCase()]);

    return { orderId, amountRefunded: amountCents };
  }

  // ============================================================================
  // PAYMENT STATUS
  // ============================================================================

  /**
   * Get payment status by Moneris order ID
   * @param {string} orderId - Moneris order ID
   * @returns {Promise<object>} Payment status
   */
  async getPaymentStatus(orderId) {
    const result = await this.pool.query(`
      SELECT
        moneris_order_id, moneris_trans_id,
        transaction_type, amount_cents, currency, status,
        card_brand, processed_at
      FROM payment_transactions
      WHERE moneris_order_id = $1
      ORDER BY processed_at DESC
      LIMIT 1
    `, [orderId]);

    if (result.rows.length === 0) {
      return { id: orderId, status: 'not_found' };
    }

    const txn = result.rows[0];
    return {
      id: txn.moneris_order_id,
      transId: txn.moneris_trans_id,
      status: txn.status,
      amount: txn.amount_cents,
      currency: txn.currency,
      cardType: txn.card_brand,
    };
  }
}

module.exports = MonerisService;
