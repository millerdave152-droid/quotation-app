/**
 * Quote Acceptance Service
 * Handles generating acceptance tokens and processing quote acceptance via magic links
 */

const crypto = require('crypto');

class QuoteAcceptanceService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Generate a secure random token
   * @returns {string} 64-character hex token
   */
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create an acceptance token for a quotation
   * @param {number} quotationId - Quotation ID
   * @param {string} customerEmail - Customer email
   * @returns {Promise<object>} Created token record
   */
  async createAcceptanceToken(quotationId, customerEmail) {
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14); // 14-day expiry

    const result = await this.pool.query(`
      INSERT INTO quote_acceptance_tokens (quotation_id, access_token, customer_email, token_expires_at)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [quotationId, token, customerEmail, expiresAt]);

    return result.rows[0];
  }

  /**
   * Get quote details by acceptance token
   * @param {string} token - Access token
   * @returns {Promise<object|null>} Quote data or null if invalid
   */
  async getQuoteByToken(token) {
    const result = await this.pool.query(`
      SELECT
        t.id AS token_id,
        t.quotation_id,
        t.customer_email,
        t.token_expires_at,
        t.accepted_at,
        q.quote_number,
        q.quotation_number,
        q.total_cents,
        q.status AS quote_status,
        q.notes,
        q.created_at AS quote_created_at,
        c.name AS customer_name,
        c.company AS customer_company,
        c.email AS customer_email_record
      FROM quote_acceptance_tokens t
      JOIN quotations q ON q.id = t.quotation_id
      LEFT JOIN customers c ON c.id = q.customer_id
      WHERE t.access_token = $1
    `, [token]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    // Check if expired
    if (new Date() > new Date(row.token_expires_at)) {
      return { ...row, expired: true };
    }

    // Check if already accepted
    if (row.accepted_at) {
      return { ...row, already_accepted: true };
    }

    // Get quote items
    const itemsResult = await this.pool.query(`
      SELECT
        qi.id, qi.product_id, qi.quantity, qi.unit_price_cents, qi.total_cents,
        qi.discount_percent, qi.notes,
        p.name AS product_name, p.model, p.manufacturer
      FROM quotation_items qi
      LEFT JOIN products p ON p.id = qi.product_id
      WHERE qi.quotation_id = $1
      ORDER BY qi.id
    `, [row.quotation_id]);

    return {
      ...row,
      items: itemsResult.rows,
      expired: false,
      already_accepted: false,
    };
  }

  /**
   * Accept a quote via token
   * @param {string} token - Access token
   * @param {string} ipAddress - Client IP
   * @param {string} userAgent - Client user agent
   * @returns {Promise<object>} Updated quote
   */
  async acceptQuote(token, ipAddress, userAgent) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Validate token
      const tokenResult = await client.query(`
        SELECT t.*, q.status AS quote_status
        FROM quote_acceptance_tokens t
        JOIN quotations q ON q.id = t.quotation_id
        WHERE t.access_token = $1
        FOR UPDATE
      `, [token]);

      if (tokenResult.rows.length === 0) {
        throw new Error('Invalid token');
      }

      const tokenRow = tokenResult.rows[0];

      if (new Date() > new Date(tokenRow.token_expires_at)) {
        throw new Error('Token has expired');
      }

      if (tokenRow.accepted_at) {
        throw new Error('Quote has already been accepted');
      }

      // Mark token as used
      await client.query(`
        UPDATE quote_acceptance_tokens
        SET accepted_at = CURRENT_TIMESTAMP, ip_address = $2, user_agent = $3
        WHERE access_token = $1
      `, [token, ipAddress, userAgent]);

      // Update quote status to won
      await client.query(`
        UPDATE quotations SET status = 'won', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status NOT IN ('won', 'lost')
      `, [tokenRow.quotation_id]);

      await client.query('COMMIT');

      return { success: true, quotation_id: tokenRow.quotation_id };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = QuoteAcceptanceService;
