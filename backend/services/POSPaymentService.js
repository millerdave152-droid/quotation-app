const bcrypt = require('bcrypt');

/**
 * POS Payment Service
 * Handles payment processing for POS transactions including:
 * - Card payments via Stripe
 * - Customer account/tab payments
 * - Gift card validation and redemption
 */

class POSPaymentService {
  /**
   * @param {Pool} pool - PostgreSQL connection pool
   * @param {object} cache - Cache module
   * @param {StripeService} stripeService - Stripe service instance
   */
  constructor(pool, cache, stripeService) {
    this.pool = pool;
    this.cache = cache;
    this.stripeService = stripeService;
  }

  // ============================================================================
  // CARD PAYMENT METHODS (Stripe Integration)
  // ============================================================================

  /**
   * Create a Stripe PaymentIntent for POS card payment
   * @param {number} amountCents - Amount in cents
   * @param {object} metadata - Additional metadata for the payment
   * @returns {Promise<object>} PaymentIntent details
   */
  async createCardPaymentIntent(amountCents, metadata = {}) {
    if (!this.stripeService?.isConfigured()) {
      throw new Error('Stripe is not configured. Card payments are unavailable.');
    }

    if (!amountCents || amountCents <= 0) {
      throw new Error('Invalid payment amount');
    }

    const paymentIntent = await this.stripeService.createPaymentIntent(amountCents, {
      source: 'pos',
      ...metadata
    });

    return {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status
    };
  }

  /**
   * Cancel a PaymentIntent (e.g. on component unmount)
   * @param {string} paymentIntentId - Stripe PaymentIntent ID
   */
  async cancelPaymentIntent(paymentIntentId) {
    if (!this.stripeService?.isConfigured()) {
      throw new Error('Stripe is not configured');
    }
    // Delegate to Stripe — may throw if already captured/cancelled
    await this.stripeService.stripe.paymentIntents.cancel(paymentIntentId);
  }

  /**
   * Confirm and retrieve card payment details after successful charge
   * @param {string} paymentIntentId - Stripe PaymentIntent ID
   * @returns {Promise<object>} Payment confirmation details
   */
  async confirmCardPayment(paymentIntentId) {
    if (!this.stripeService?.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    if (!paymentIntentId) {
      throw new Error('Payment intent ID is required');
    }

    const status = await this.stripeService.getPaymentStatus(paymentIntentId);

    if (status.status !== 'succeeded') {
      return {
        success: false,
        status: status.status,
        error: `Payment not completed. Status: ${status.status}`
      };
    }

    // Retrieve full payment intent for card details
    const paymentIntent = await this.stripeService.stripe.paymentIntents.retrieve(
      paymentIntentId,
      { expand: ['latest_charge.payment_method_details'] }
    );

    const charge = paymentIntent.latest_charge;
    const cardDetails = charge?.payment_method_details?.card || {};

    return {
      success: true,
      paymentIntentId,
      chargeId: charge?.id || null,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      cardBrand: cardDetails.brand || null,
      cardLastFour: cardDetails.last4 || null,
      authorizationCode: charge?.authorization_code || null,
      receiptUrl: charge?.receipt_url || null
    };
  }

  // ============================================================================
  // CUSTOMER ACCOUNT/TAB PAYMENT METHODS
  // ============================================================================

  /**
   * Check customer's available credit
   * @param {number} customerId - Customer ID
   * @returns {Promise<object>} Credit availability details
   */
  async checkCustomerCredit(customerId) {
    if (!customerId) {
      throw new Error('Customer ID is required');
    }

    const result = await this.pool.query(`
      SELECT
        id,
        name,
        company_name,
        credit_limit,
        current_balance,
        (credit_limit - current_balance) as available_credit
      FROM customers
      WHERE id = $1
    `, [customerId]);

    if (result.rows.length === 0) {
      throw new Error('Customer not found');
    }

    const customer = result.rows[0];

    return {
      customerId: customer.id,
      customerName: customer.name || customer.company_name,
      creditLimit: parseFloat(customer.credit_limit || 0),
      currentBalance: parseFloat(customer.current_balance || 0),
      availableCredit: parseFloat(customer.available_credit || 0),
      hasCredit: parseFloat(customer.credit_limit || 0) > 0
    };
  }

  /**
   * Check if customer has sufficient credit for an amount
   * @param {number} customerId - Customer ID
   * @param {number} amountCents - Amount to check in cents
   * @returns {Promise<object>} Eligibility result
   */
  async checkCreditAvailability(customerId, amountCents) {
    const credit = await this.checkCustomerCredit(customerId);
    const amountDollars = amountCents / 100;

    return {
      ...credit,
      requestedAmount: amountDollars,
      isEligible: credit.availableCredit >= amountDollars,
      shortfall: credit.availableCredit < amountDollars
        ? amountDollars - credit.availableCredit
        : 0
    };
  }

  /**
   * Charge an amount to customer's account
   * @param {number} customerId - Customer ID
   * @param {number} amountCents - Amount in cents
   * @param {number} transactionId - Associated transaction ID
   * @param {string} notes - Optional notes
   * @returns {Promise<object>} Charge result
   */
  async chargeCustomerAccount(customerId, amountCents, transactionId, notes = '') {
    const amountDollars = amountCents / 100;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check credit availability inside transaction with row lock
      const creditCheck = await client.query(
        `SELECT credit_limit, current_balance FROM customers WHERE id = $1 FOR UPDATE`,
        [customerId]
      );

      if (creditCheck.rows.length === 0) {
        throw new Error('Customer not found');
      }

      const creditLimit = parseFloat(creditCheck.rows[0].credit_limit || 0);
      const currentBalance = parseFloat(creditCheck.rows[0].current_balance || 0);
      const availableCredit = creditLimit - currentBalance;

      if (amountDollars > availableCredit) {
        throw new Error(
          `Insufficient credit. Available: $${availableCredit.toFixed(2)}, ` +
          `Requested: $${amountDollars.toFixed(2)}`
        );
      }

      // Update customer balance
      const updateResult = await client.query(`
        UPDATE customers
        SET current_balance = current_balance + $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING current_balance, credit_limit
      `, [amountDollars, customerId]);

      const newBalance = parseFloat(updateResult.rows[0].current_balance);
      const updatedCreditLimit = parseFloat(updateResult.rows[0].credit_limit);

      // Insert payment record with account reference
      const paymentResult = await client.query(`
        INSERT INTO payments (
          transaction_id,
          payment_method,
          amount,
          customer_account_id,
          status,
          processor_reference,
          processed_at
        ) VALUES ($1, 'account', $2, $3, 'completed', $4, NOW())
        RETURNING payment_id
      `, [
        transactionId,
        amountDollars,
        customerId,
        notes ? `ACCOUNT:${notes}` : 'ACCOUNT:Charged to customer tab'
      ]);

      await client.query('COMMIT');

      // Invalidate customer cache
      this.cache?.invalidatePattern('customers:');

      return {
        success: true,
        paymentId: paymentResult.rows[0].payment_id,
        customerId,
        amountCharged: amountDollars,
        newBalance,
        availableCredit: updatedCreditLimit - newBalance,
        transactionId
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // GIFT CARD METHODS (Placeholder for future implementation)
  // ============================================================================

  /**
   * Validate a gift card and get its balance
   * @param {string} cardNumber - Gift card number
   * @param {string} pin - Optional PIN
   * @returns {Promise<object>} Gift card details
   */
  async validateGiftCard(cardNumber, pin = null) {
    if (!cardNumber) {
      throw new Error('Gift card number is required');
    }

    const result = await this.pool.query(`
      SELECT
        id,
        card_number,
        initial_amount_cents,
        current_balance_cents,
        status,
        expires_at,
        pin_hash
      FROM gift_cards
      WHERE card_number = $1
    `, [cardNumber]);

    if (result.rows.length === 0) {
      return {
        valid: false,
        error: 'Gift card not found'
      };
    }

    const card = result.rows[0];

    // Check expiration
    if (card.expires_at && new Date(card.expires_at) < new Date()) {
      return {
        valid: false,
        error: 'Gift card has expired',
        cardNumber: card.card_number
      };
    }

    // Check status
    if (card.status !== 'active') {
      return {
        valid: false,
        error: `Gift card is ${card.status}`,
        cardNumber: card.card_number
      };
    }

    if (card.pin_hash) {
      if (!pin) {
        return {
          valid: false,
          error: 'PIN required',
          cardNumber: card.card_number
        };
      }

      const pinValid = await bcrypt.compare(String(pin), card.pin_hash);
      if (!pinValid) {
        return {
          valid: false,
          error: 'Invalid PIN',
          cardNumber: card.card_number
        };
      }
    }

    return {
      valid: true,
      cardId: card.id,
      cardNumber: card.card_number,
      balanceCents: card.current_balance_cents,
      balanceDollars: card.current_balance_cents / 100,
      initialAmountCents: card.initial_amount_cents,
      status: card.status,
      expiresAt: card.expires_at
    };
  }

  /**
   * Redeem a gift card for payment
   * @param {string} cardNumber - Gift card number
   * @param {number} amountCents - Amount to redeem in cents
   * @param {number} transactionId - Associated transaction ID
   * @param {number} userId - User performing the redemption
   * @returns {Promise<object>} Redemption result
   */
  async redeemGiftCard(cardNumber, amountCents, transactionId, userId, pin = null) {
    // Validate the card first
    const validation = await this.validateGiftCard(cardNumber, pin);

    if (!validation.valid) {
      throw new Error(validation.error);
    }

    if (validation.balanceCents < amountCents) {
      throw new Error(
        `Insufficient gift card balance. Available: $${validation.balanceDollars.toFixed(2)}`
      );
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const newBalance = validation.balanceCents - amountCents;

      // Insert payment record
      const paymentResult = await client.query(`
        INSERT INTO payments (
          transaction_id,
          payment_method,
          amount,
          processor_reference,
          status,
          processed_at
        ) VALUES ($1, 'gift_card', $2, $3, 'completed', NOW())
        RETURNING payment_id
      `, [
        transactionId,
        amountCents / 100,
        `GC:${cardNumber}`
      ]);

      // Decrement gift card balance
      await client.query(`
        UPDATE gift_cards
        SET current_balance_cents = current_balance_cents - $1,
            updated_at = NOW()
        WHERE id = $2
      `, [amountCents, validation.cardId]);

      // Record gift card transaction
      await client.query(`
        INSERT INTO gift_card_transactions (
          gift_card_id,
          transaction_id,
          payment_id,
          amount_cents,
          transaction_type,
          balance_after_cents,
          performed_by,
          notes
        ) VALUES ($1, $2, $3, $4, 'redeem', $5, $6, $7)
      `, [
        validation.cardId,
        transactionId,
        paymentResult.rows[0].payment_id,
        -amountCents, // Negative for redemption
        newBalance,
        userId,
        `POS redemption for transaction ${transactionId}`
      ]);

      await client.query('COMMIT');

      return {
        success: true,
        paymentId: paymentResult.rows[0].payment_id,
        cardNumber,
        amountRedeemed: amountCents / 100,
        previousBalance: validation.balanceDollars,
        newBalance: newBalance / 100,
        transactionId
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Issue a new gift card
   * @param {number} amountCents - Initial amount in cents
   * @param {number} userId - User issuing the card
   * @param {object} options - Additional options
   * @returns {Promise<object>} New gift card details
   */
  async issueGiftCard(amountCents, userId, options = {}) {
    const { customerId = null, expiresInDays = 365 } = options;

    if (amountCents <= 0) {
      throw new Error('Gift card amount must be positive');
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Generate card number
      const cardNumResult = await client.query('SELECT generate_gift_card_number() as card_number');
      const cardNumber = cardNumResult.rows[0].card_number;

      // Calculate expiration
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      // Create gift card
      const cardResult = await client.query(`
        INSERT INTO gift_cards (
          card_number,
          initial_amount_cents,
          current_balance_cents,
          status,
          customer_id,
          issued_by,
          expires_at
        ) VALUES ($1, $2, $2, 'active', $3, $4, $5)
        RETURNING id, card_number, initial_amount_cents, current_balance_cents, expires_at
      `, [cardNumber, amountCents, customerId, userId, expiresAt]);

      const card = cardResult.rows[0];

      // Record initial load transaction
      await client.query(`
        INSERT INTO gift_card_transactions (
          gift_card_id,
          amount_cents,
          transaction_type,
          balance_after_cents,
          performed_by,
          notes
        ) VALUES ($1, $2, 'load', $2, $3, 'Initial card activation')
      `, [card.id, amountCents, userId]);

      await client.query('COMMIT');

      return {
        success: true,
        cardId: card.id,
        cardNumber: card.card_number,
        amountCents: card.initial_amount_cents,
        amountDollars: card.initial_amount_cents / 100,
        expiresAt: card.expires_at
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // PAYMENT RECORD METHODS
  // ============================================================================

  /**
   * Record a payment with Stripe details
   * @param {object} paymentData - Payment data
   * @returns {Promise<object>} Payment record
   */
  async recordStripePayment(paymentData) {
    const {
      transactionId,
      paymentMethod,
      amount,
      paymentIntentId,
      chargeId,
      cardBrand,
      cardLastFour,
      authorizationCode
    } = paymentData;

    const result = await this.pool.query(`
      INSERT INTO payments (
        transaction_id,
        payment_method,
        amount,
        stripe_payment_intent_id,
        stripe_charge_id,
        card_brand,
        card_last_four,
        authorization_code,
        status,
        processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed', NOW())
      RETURNING payment_id
    `, [
      transactionId,
      paymentMethod,
      amount,
      paymentIntentId,
      chargeId,
      cardBrand,
      cardLastFour,
      authorizationCode
    ]);

    return {
      paymentId: result.rows[0].payment_id,
      transactionId,
      amount,
      paymentIntentId
    };
  }

  /**
   * Get payment details by ID
   * @param {number} paymentId - Payment ID
   * @returns {Promise<object>} Payment details
   */
  async getPayment(paymentId) {
    const result = await this.pool.query(`
      SELECT
        p.*,
        t.transaction_number,
        c.name as customer_name
      FROM payments p
      LEFT JOIN transactions t ON p.transaction_id = t.transaction_id
      LEFT JOIN customers c ON p.customer_account_id = c.id
      WHERE p.payment_id = $1
    `, [paymentId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }
}

module.exports = POSPaymentService;
