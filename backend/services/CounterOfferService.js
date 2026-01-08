/**
 * Counter-Offer Service
 * Handles negotiation flow between customers and supervisors
 */

const crypto = require('crypto');

class CounterOfferService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Generate a secure random token for magic links
   * @returns {string} 64-character hex token
   */
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create a counter-offer on a quote
   * @param {object} params - Counter-offer parameters
   * @returns {Promise<object>} Created counter-offer
   */
  async createCounterOffer({
    quotationId,
    submittedByType, // 'customer', 'salesperson', 'supervisor'
    submittedByUserId = null,
    submittedByName,
    submittedByEmail,
    counterOfferTotalCents,
    message = ''
  }) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get current quote total
      const quoteResult = await client.query(
        'SELECT total_cents, quote_number, customer_id FROM quotations WHERE id = $1',
        [quotationId]
      );

      if (quoteResult.rows.length === 0) {
        throw new Error('Quote not found');
      }

      const originalTotalCents = quoteResult.rows[0].total_cents;
      const quoteNumber = quoteResult.rows[0].quote_number;

      // Generate magic link token for customer access
      let accessToken = null;
      let tokenExpiresAt = null;

      if (submittedByType === 'supervisor') {
        // When supervisor counters, generate token for customer to respond
        accessToken = this.generateToken();
        tokenExpiresAt = new Date();
        tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 7); // Valid for 7 days
      }

      // Insert counter-offer
      const result = await client.query(`
        INSERT INTO quote_counter_offers (
          quotation_id, submitted_by_type, submitted_by_user_id,
          submitted_by_name, submitted_by_email,
          counter_offer_total_cents, original_total_cents,
          message, access_token, token_expires_at, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
        RETURNING *
      `, [
        quotationId,
        submittedByType,
        submittedByUserId,
        submittedByName,
        submittedByEmail,
        counterOfferTotalCents,
        originalTotalCents,
        message,
        accessToken,
        tokenExpiresAt
      ]);

      const counterOffer = result.rows[0];

      // Update quote negotiation status
      let negotiationStatus = 'awaiting_supervisor';
      if (submittedByType === 'supervisor') {
        negotiationStatus = 'awaiting_customer';
      }

      await client.query(`
        UPDATE quotations
        SET negotiation_status = $1,
            counter_offer_count = COALESCE(counter_offer_count, 0) + 1,
            last_counter_offer_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [negotiationStatus, quotationId]);

      // Log event
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, description, user_name, metadata, activity_category)
        VALUES ($1, 'COUNTER_OFFER', $2, $3, $4, 'negotiation')
      `, [
        quotationId,
        `Counter-offer submitted by ${submittedByType}: $${(counterOfferTotalCents / 100).toFixed(2)}`,
        submittedByName,
        JSON.stringify({
          counterOfferTotalCents,
          originalTotalCents,
          submittedByType,
          counterOfferId: counterOffer.id
        })
      ]);

      await client.query('COMMIT');

      return {
        ...counterOffer,
        quote_number: quoteNumber,
        access_url: accessToken ? `/quote/counter/${accessToken}` : null
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating counter-offer:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get counter-offer by access token (magic link)
   * @param {string} token - Access token
   * @returns {Promise<object|null>}
   */
  async getCounterOfferByToken(token) {
    const result = await this.pool.query(`
      SELECT
        co.*,
        q.quote_number,
        q.total_cents as current_quote_total_cents,
        q.subtotal_cents,
        q.discount_percent,
        q.tax_rate,
        q.status as quote_status,
        q.negotiation_status,
        c.name as customer_name,
        c.email as customer_email,
        c.company as customer_company
      FROM quote_counter_offers co
      JOIN quotations q ON co.quotation_id = q.id
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE co.access_token = $1
        AND co.token_expires_at > CURRENT_TIMESTAMP
        AND co.status = 'pending'
    `, [token]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get all counter-offers for a quote
   * @param {number} quotationId - Quote ID
   * @returns {Promise<Array>}
   */
  async getCounterOffersForQuote(quotationId) {
    const result = await this.pool.query(`
      SELECT
        co.*,
        u.first_name || ' ' || u.last_name as submitted_by_full_name,
        ru.first_name || ' ' || ru.last_name as response_by_full_name
      FROM quote_counter_offers co
      LEFT JOIN users u ON co.submitted_by_user_id = u.id
      LEFT JOIN users ru ON co.response_by_user_id = ru.id
      WHERE co.quotation_id = $1
      ORDER BY co.created_at DESC
    `, [quotationId]);

    return result.rows;
  }

  /**
   * Accept a counter-offer
   * @param {number} counterOfferId - Counter-offer ID
   * @param {object} respondedBy - User accepting the offer
   * @param {string} responseMessage - Optional message
   * @returns {Promise<object>}
   */
  async acceptCounterOffer(counterOfferId, respondedBy, responseMessage = '') {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get counter-offer and quote
      const offerResult = await client.query(`
        SELECT co.*, q.id as quotation_id, q.quote_number
        FROM quote_counter_offers co
        JOIN quotations q ON co.quotation_id = q.id
        WHERE co.id = $1 AND co.status = 'pending'
      `, [counterOfferId]);

      if (offerResult.rows.length === 0) {
        throw new Error('Counter-offer not found or already processed');
      }

      const offer = offerResult.rows[0];

      // Update counter-offer status
      await client.query(`
        UPDATE quote_counter_offers
        SET status = 'accepted',
            response_by_user_id = $1,
            response_by_name = $2,
            response_message = $3,
            responded_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [respondedBy.id, respondedBy.name, responseMessage, counterOfferId]);

      // Update quote with new total
      await client.query(`
        UPDATE quotations
        SET total_cents = $1,
            negotiation_status = 'negotiation_complete',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [offer.counter_offer_total_cents, offer.quotation_id]);

      // Log event
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, description, user_name, metadata, activity_category)
        VALUES ($1, 'COUNTER_OFFER_ACCEPTED', $2, $3, $4, 'negotiation')
      `, [
        offer.quotation_id,
        `Counter-offer accepted: $${(offer.counter_offer_total_cents / 100).toFixed(2)}`,
        respondedBy.name,
        JSON.stringify({
          counterOfferId: counterOfferId,
          acceptedTotalCents: offer.counter_offer_total_cents,
          originalTotalCents: offer.original_total_cents
        })
      ]);

      await client.query('COMMIT');

      return {
        success: true,
        message: 'Counter-offer accepted',
        newTotalCents: offer.counter_offer_total_cents,
        quoteNumber: offer.quote_number
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error accepting counter-offer:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reject a counter-offer
   * @param {number} counterOfferId - Counter-offer ID
   * @param {object} respondedBy - User rejecting the offer
   * @param {string} responseMessage - Reason for rejection
   * @returns {Promise<object>}
   */
  async rejectCounterOffer(counterOfferId, respondedBy, responseMessage) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get counter-offer
      const offerResult = await client.query(`
        SELECT co.*, q.id as quotation_id, q.quote_number
        FROM quote_counter_offers co
        JOIN quotations q ON co.quotation_id = q.id
        WHERE co.id = $1 AND co.status = 'pending'
      `, [counterOfferId]);

      if (offerResult.rows.length === 0) {
        throw new Error('Counter-offer not found or already processed');
      }

      const offer = offerResult.rows[0];

      // Update counter-offer status
      await client.query(`
        UPDATE quote_counter_offers
        SET status = 'rejected',
            response_by_user_id = $1,
            response_by_name = $2,
            response_message = $3,
            responded_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [respondedBy.id, respondedBy.name, responseMessage, counterOfferId]);

      // Update quote negotiation status
      await client.query(`
        UPDATE quotations
        SET negotiation_status = 'negotiation_complete',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [offer.quotation_id]);

      // Log event
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, description, user_name, metadata, activity_category)
        VALUES ($1, 'COUNTER_OFFER_REJECTED', $2, $3, $4, 'negotiation')
      `, [
        offer.quotation_id,
        `Counter-offer rejected: ${responseMessage || 'No reason provided'}`,
        respondedBy.name,
        JSON.stringify({
          counterOfferId: counterOfferId,
          rejectedTotalCents: offer.counter_offer_total_cents,
          reason: responseMessage
        })
      ]);

      await client.query('COMMIT');

      return {
        success: true,
        message: 'Counter-offer rejected',
        quoteNumber: offer.quote_number
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error rejecting counter-offer:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Supervisor sends a counter to customer's counter-offer
   * @param {number} counterOfferId - Original counter-offer ID
   * @param {object} supervisor - Supervisor user object
   * @param {number} newOfferTotalCents - Supervisor's counter-offer amount
   * @param {string} message - Message to customer
   * @returns {Promise<object>}
   */
  async sendSupervisorCounter(counterOfferId, supervisor, newOfferTotalCents, message = '') {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get original counter-offer
      const offerResult = await client.query(`
        SELECT co.*, q.id as quotation_id, q.quote_number, q.total_cents
        FROM quote_counter_offers co
        JOIN quotations q ON co.quotation_id = q.id
        WHERE co.id = $1 AND co.status = 'pending'
      `, [counterOfferId]);

      if (offerResult.rows.length === 0) {
        throw new Error('Counter-offer not found or already processed');
      }

      const originalOffer = offerResult.rows[0];

      // Mark original offer as countered
      await client.query(`
        UPDATE quote_counter_offers
        SET status = 'countered',
            response_by_user_id = $1,
            response_by_name = $2,
            response_message = 'Counter-offer sent',
            responded_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [supervisor.id, supervisor.name, counterOfferId]);

      // Create new counter-offer from supervisor
      const accessToken = this.generateToken();
      const tokenExpiresAt = new Date();
      tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 7);

      const newOfferResult = await client.query(`
        INSERT INTO quote_counter_offers (
          quotation_id, submitted_by_type, submitted_by_user_id,
          submitted_by_name, submitted_by_email,
          counter_offer_total_cents, original_total_cents,
          message, access_token, token_expires_at, status
        )
        VALUES ($1, 'supervisor', $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
        RETURNING *
      `, [
        originalOffer.quotation_id,
        supervisor.id,
        supervisor.name,
        supervisor.email,
        newOfferTotalCents,
        originalOffer.counter_offer_total_cents, // Customer's offer is the new "original"
        message,
        accessToken,
        tokenExpiresAt
      ]);

      // Update quote
      await client.query(`
        UPDATE quotations
        SET negotiation_status = 'awaiting_customer',
            counter_offer_count = COALESCE(counter_offer_count, 0) + 1,
            last_counter_offer_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [originalOffer.quotation_id]);

      // Log event
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, description, user_name, metadata, activity_category)
        VALUES ($1, 'SUPERVISOR_COUNTER', $2, $3, $4, 'negotiation')
      `, [
        originalOffer.quotation_id,
        `Supervisor counter-offer: $${(newOfferTotalCents / 100).toFixed(2)}`,
        supervisor.name,
        JSON.stringify({
          originalCounterOfferId: counterOfferId,
          newCounterOfferId: newOfferResult.rows[0].id,
          supervisorOfferCents: newOfferTotalCents,
          customerOfferCents: originalOffer.counter_offer_total_cents
        })
      ]);

      await client.query('COMMIT');

      return {
        success: true,
        counterOffer: newOfferResult.rows[0],
        accessUrl: `/quote/counter/${accessToken}`,
        quoteNumber: originalOffer.quote_number
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error sending supervisor counter:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Customer responds to supervisor's counter via magic link
   * @param {string} token - Access token from magic link
   * @param {string} action - 'accept' or 'counter'
   * @param {object} customerInfo - Customer name/email
   * @param {number} newOfferCents - New offer if countering
   * @param {string} message - Optional message
   * @returns {Promise<object>}
   */
  async customerResponse(token, action, customerInfo, newOfferCents = null, message = '') {
    const offer = await this.getCounterOfferByToken(token);

    if (!offer) {
      throw new Error('Invalid or expired link');
    }

    if (action === 'accept') {
      // Customer accepts supervisor's offer
      return this.acceptCounterOffer(
        offer.id,
        { id: null, name: customerInfo.name || 'Customer', email: customerInfo.email },
        message
      );
    } else if (action === 'counter') {
      if (!newOfferCents) {
        throw new Error('Counter-offer amount required');
      }

      // Create new counter-offer from customer
      return this.createCounterOffer({
        quotationId: offer.quotation_id,
        submittedByType: 'customer',
        submittedByUserId: null,
        submittedByName: customerInfo.name || 'Customer',
        submittedByEmail: customerInfo.email,
        counterOfferTotalCents: newOfferCents,
        message
      });
    } else {
      throw new Error('Invalid action');
    }
  }

  /**
   * Generate customer portal link for a quote
   * @param {number} quotationId - Quote ID
   * @returns {Promise<string>} Portal URL
   */
  async generateCustomerPortalLink(quotationId) {
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // Valid for 30 days

    await this.pool.query(`
      UPDATE quotations
      SET customer_portal_token = $1,
          customer_portal_token_expires = $2
      WHERE id = $3
    `, [token, expiresAt, quotationId]);

    return `/quote/view/${token}`;
  }

  /**
   * Get quote by customer portal token
   * @param {string} token - Portal token
   * @returns {Promise<object|null>}
   */
  async getQuoteByPortalToken(token) {
    const result = await this.pool.query(`
      SELECT
        q.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.company as customer_company,
        c.address as customer_address
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.customer_portal_token = $1
        AND q.customer_portal_token_expires > CURRENT_TIMESTAMP
    `, [token]);

    if (result.rows.length === 0) {
      return null;
    }

    // Get items
    const items = await this.pool.query(`
      SELECT * FROM quotation_items WHERE quotation_id = $1
    `, [result.rows[0].id]);

    return {
      ...result.rows[0],
      items: items.rows
    };
  }

  /**
   * Get pending counter-offers that need supervisor attention
   * @param {number} supervisorId - Supervisor user ID (optional, for filtering)
   * @returns {Promise<Array>}
   */
  async getPendingCounterOffers(supervisorId = null) {
    let query = `
      SELECT
        co.*,
        q.quote_number,
        q.total_cents as quote_total_cents,
        c.name as customer_name,
        c.company as customer_company
      FROM quote_counter_offers co
      JOIN quotations q ON co.quotation_id = q.id
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE co.status = 'pending'
        AND co.submitted_by_type IN ('customer', 'salesperson')
        AND q.negotiation_status = 'awaiting_supervisor'
      ORDER BY co.created_at DESC
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }
}

module.exports = CounterOfferService;
