/**
 * TeleTime POS - Moneris Vault Service
 *
 * Secure card tokenization using the Moneris Vault API.
 * Replaces raw card data with data_key tokens for repeat transactions
 * and cross-channel customer recognition.
 *
 * Moneris Vault operations:
 *   res_add_cc        — tokenize a card (store in vault)
 *   res_purchase_cc   — charge a stored token
 *   res_preauth_cc    — pre-auth a stored token
 *   res_delete         — remove a token from vault
 *   res_lookup_masked  — retrieve masked card info for a token
 *
 * SECURITY:
 *   - moneris_token (data_key) is NEVER returned to API consumers
 *   - Only this service reads/writes the moneris_token column
 *   - All operations are audit-logged via AuditLogService
 *
 * PCI SCOPE NOTE: This service stores Moneris vault tokens.
 * Vault tokens are classified as sensitive authentication data
 * under PCI DSS v4.0.1 requirement 3.3.
 * Any table storing vault tokens is in PCI scope.
 * Do not add vault token columns to non-payment tables.
 *
 * CURRENT STATUS (audited 2026-03-31):
 *   - customer_payment_tokens: moneris_token stored alongside card_bin, last_four,
 *     expiry_date. Co-location expands PCI scope. Recommended: extract moneris_token
 *     to a dedicated payment_vault_tokens table with restricted DB role access.
 *   - fraud_scores: moneris_token column exists but is never populated (0 rows).
 *     Should be dropped in a future migration to reduce PCI scope.
 */

const logger = require('../utils/logger');

class MonerisVaultService {
  /**
   * @param {Pool} pool - PostgreSQL connection pool
   * @param {MonerisService} monerisService - Gateway service for XML requests
   * @param {AuditLogService} auditLogService - Hash-chain audit logger
   */
  constructor(pool, monerisService, auditLogService) {
    this.pool = pool;
    this.moneris = monerisService;
    this.audit = auditLogService;
  }

  // ============================================================================
  // TOKEN STORAGE
  // ============================================================================

  /**
   * Store a card in Moneris Vault and save the token locally.
   *
   * Called after a successful card-present or MOTO transaction when the
   * customer opts in to saving their card.
   *
   * @param {object} cardData
   * @param {string}  cardData.cardNumber  - Full PAN (will be sent to Moneris only)
   * @param {string}  cardData.expDate     - Expiry in YYMM format (Moneris format)
   * @param {string}  [cardData.cardBin]   - First 6-8 digits
   * @param {string}  [cardData.lastFour]  - Last 4 digits
   * @param {string}  [cardData.cardType]  - credit / debit
   * @param {string}  [cardData.cardBrand] - visa / mastercard / amex / discover
   * @param {string}  [cardData.cryptType] - Moneris crypt type (default '7')
   * @param {number} customerId - Customer FK
   * @param {object} [options]
   * @param {string}  [options.nickname]   - Customer-facing label
   * @param {boolean} [options.isDefault]  - Set as default payment method
   * @param {number}  [options.createdBy]  - Employee ID who initiated the save
   * @returns {Promise<object>} Saved token metadata (without moneris_token)
   */
  async storeCardToken(cardData, customerId, options = {}) {
    const { nickname, isDefault = false, createdBy = null } = options;

    if (!this.moneris.isConfigured()) {
      throw new Error('Moneris is not configured');
    }

    // Derive BIN and last four from full card number if not provided
    const pan = (cardData.cardNumber || '').replace(/\D/g, '');
    const cardBin = cardData.cardBin || pan.substring(0, 6);
    const lastFour = cardData.lastFour || pan.slice(-4);
    const expDate = cardData.expDate; // YYMM per Moneris spec

    // Check for duplicate (same customer + last four)
    const existing = await this.pool.query(
      `SELECT id, is_active FROM customer_payment_tokens
       WHERE customer_id = $1 AND last_four = $2`,
      [customerId, lastFour]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.is_active) {
        throw new Error(`A card ending in ${lastFour} is already saved for this customer`);
      }
      // Reactivate: delete the old inactive row so we can insert fresh
      await this.pool.query('DELETE FROM customer_payment_tokens WHERE id = $1', [row.id]);
    }

    // ---------------------------------------------------------------
    // Send to Moneris Vault: res_add_cc
    // ---------------------------------------------------------------
    const xml = this.moneris._buildXml('res_add_cc', {
      pan: pan,
      expdate: expDate,
      crypt_type: cardData.cryptType || '7',
      cust_id: String(customerId),
    });

    const response = await this.moneris._sendGatewayRequest(xml);
    const dataKey = this._extractDataKey(response);

    if (!dataKey) {
      const msg = response.message || 'Moneris Vault did not return a data_key';
      logger.error({ response: response.rawXml?.substring(0, 500) },
        '[MonerisVault] res_add_cc failed');
      throw new Error(`Vault tokenization failed: ${msg}`);
    }

    // ---------------------------------------------------------------
    // If setting as default, clear existing defaults first
    // ---------------------------------------------------------------
    if (isDefault) {
      await this.pool.query(
        `UPDATE customer_payment_tokens SET is_default = false, updated_at = NOW()
         WHERE customer_id = $1 AND is_default = true`,
        [customerId]
      );
    }

    // ---------------------------------------------------------------
    // Persist token locally
    // ---------------------------------------------------------------
    const { rows } = await this.pool.query(
      `INSERT INTO customer_payment_tokens (
         customer_id, moneris_token, card_bin, last_four,
         card_type, card_brand, expiry_date, nickname,
         is_default, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, customer_id, card_bin, last_four, card_type, card_brand,
                 expiry_date, nickname, is_default, created_at`,
      [
        customerId, dataKey, cardBin, lastFour,
        cardData.cardType || null, cardData.cardBrand || null,
        expDate, nickname || `${(cardData.cardBrand || 'Card').toUpperCase()} ending ${lastFour}`,
        isDefault, createdBy,
      ]
    );

    // Audit
    this.audit.log(createdBy, 'vault.card_saved', 'customer_payment_token', rows[0].id, {
      customer_id: customerId,
      card_brand: cardData.cardBrand,
      last_four: lastFour,
      is_default: isDefault,
    });

    logger.info({ customerId, tokenId: rows[0].id, lastFour },
      '[MonerisVault] Card tokenized and saved');

    return rows[0]; // Never includes moneris_token
  }

  /**
   * Store a token from an already-completed Moneris Checkout or transaction
   * that returned a data_key (e.g. from Moneris Checkout callback).
   *
   * @param {object} monerisResponse - Response containing data_key
   * @param {number} customerId
   * @param {object} [options]
   * @returns {Promise<object>} Saved token metadata
   */
  async storeExistingToken(monerisResponse, customerId, options = {}) {
    const { nickname, isDefault = false, createdBy = null } = options;

    const dataKey = monerisResponse.data_key || monerisResponse.dataKey;
    if (!dataKey) {
      throw new Error('No data_key found in Moneris response');
    }

    const lastFour = monerisResponse.last_four || monerisResponse.lastFour
                  || monerisResponse.f4l4?.slice(-4) || '????';
    const cardBin = monerisResponse.card_bin || monerisResponse.cardBin
                 || monerisResponse.f4l4?.substring(0, 4) || null;

    // Check duplicate
    const existing = await this.pool.query(
      `SELECT id FROM customer_payment_tokens
       WHERE customer_id = $1 AND last_four = $2 AND is_active = true`,
      [customerId, lastFour]
    );
    if (existing.rows.length > 0) {
      throw new Error(`A card ending in ${lastFour} is already saved for this customer`);
    }

    if (isDefault) {
      await this.pool.query(
        `UPDATE customer_payment_tokens SET is_default = false, updated_at = NOW()
         WHERE customer_id = $1 AND is_default = true`,
        [customerId]
      );
    }

    const { rows } = await this.pool.query(
      `INSERT INTO customer_payment_tokens (
         customer_id, moneris_token, card_bin, last_four,
         card_type, card_brand, expiry_date, nickname,
         is_default, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, customer_id, card_bin, last_four, card_type, card_brand,
                 expiry_date, nickname, is_default, created_at`,
      [
        customerId, dataKey, cardBin, lastFour,
        monerisResponse.card_type || monerisResponse.cardType || null,
        monerisResponse.card_brand || monerisResponse.cardBrand || null,
        monerisResponse.expiry_date || monerisResponse.expDate || null,
        nickname || `Card ending ${lastFour}`,
        isDefault, createdBy,
      ]
    );

    this.audit.log(createdBy, 'vault.token_imported', 'customer_payment_token', rows[0].id, {
      customer_id: customerId,
      last_four: lastFour,
    });

    return rows[0];
  }

  // ============================================================================
  // TOKEN RETRIEVAL
  // ============================================================================

  /**
   * Get all active saved payment methods for a customer.
   * NEVER returns the moneris_token column.
   *
   * @param {number} customerId
   * @returns {Promise<Array>} Payment method list
   */
  async getCustomerTokens(customerId) {
    const { rows } = await this.pool.query(
      `SELECT id, customer_id, card_bin, last_four, card_type, card_brand,
              expiry_date, nickname, is_default, last_used_at, use_count,
              created_at, updated_at
       FROM customer_payment_tokens
       WHERE customer_id = $1 AND is_active = true
       ORDER BY is_default DESC, last_used_at DESC NULLS LAST, created_at DESC`,
      [customerId]
    );

    // Annotate with expiry status
    return rows.map(row => ({
      ...row,
      is_expired: this._isExpired(row.expiry_date),
      display_expiry: this._formatExpiry(row.expiry_date),
    }));
  }

  /**
   * Get a single payment method by ID.
   * NEVER returns the moneris_token column.
   *
   * @param {number} customerId
   * @param {number} tokenId
   * @returns {Promise<object|null>}
   */
  async getToken(customerId, tokenId) {
    const { rows } = await this.pool.query(
      `SELECT id, customer_id, card_bin, last_four, card_type, card_brand,
              expiry_date, nickname, is_default, last_used_at, use_count,
              created_at, updated_at
       FROM customer_payment_tokens
       WHERE id = $1 AND customer_id = $2 AND is_active = true`,
      [tokenId, customerId]
    );

    if (rows.length === 0) return null;

    return {
      ...rows[0],
      is_expired: this._isExpired(rows[0].expiry_date),
      display_expiry: this._formatExpiry(rows[0].expiry_date),
    };
  }

  // ============================================================================
  // TOKEN TRANSACTIONS
  // ============================================================================

  /**
   * Process a purchase using a stored Vault token (res_purchase_cc).
   *
   * @param {number} customerId
   * @param {number} tokenId - customer_payment_tokens.id
   * @param {number} amountCents - Amount in cents
   * @param {object} [metadata]
   * @param {string}  [metadata.orderId]     - Order reference
   * @param {number}  [metadata.employeeId]  - Employee processing
   * @param {string}  [metadata.description] - Dynamic descriptor
   * @returns {Promise<object>} Purchase result
   */
  async processTokenTransaction(customerId, tokenId, amountCents, metadata = {}) {
    if (!this.moneris.isConfigured()) {
      throw new Error('Moneris is not configured');
    }

    // Retrieve the token (including moneris_token — internal only)
    const { rows } = await this.pool.query(
      `SELECT id, moneris_token, card_bin, last_four, card_brand, expiry_date
       FROM customer_payment_tokens
       WHERE id = $1 AND customer_id = $2 AND is_active = true`,
      [tokenId, customerId]
    );

    if (rows.length === 0) {
      throw new Error('Payment method not found or inactive');
    }

    const token = rows[0];

    // Check expiry
    if (this._isExpired(token.expiry_date)) {
      throw new Error('This payment method has expired. Please add a new card.');
    }

    const dataKey = token.moneris_token;
    const amount = (amountCents / 100).toFixed(2);
    const orderId = metadata.orderId || this.moneris._generateOrderId('VLT');

    // ---------------------------------------------------------------
    // Moneris Vault: res_purchase_cc
    // ---------------------------------------------------------------
    const xml = this.moneris._buildXml('res_purchase_cc', {
      data_key: dataKey,
      order_id: orderId,
      amount: amount,
      cust_id: String(customerId),
      crypt_type: '7',
    });

    const response = await this.moneris._sendGatewayRequest(xml);
    const approved = this.moneris._isApproved(response.responseCode);

    // Update usage stats
    if (approved) {
      await this.pool.query(
        `UPDATE customer_payment_tokens
         SET last_used_at = NOW(), use_count = use_count + 1, updated_at = NOW()
         WHERE id = $1`,
        [tokenId]
      );
    }

    // Audit
    this.audit.log(metadata.employeeId || null, 'vault.token_charge', 'customer_payment_token', tokenId, {
      customer_id: customerId,
      amount_cents: amountCents,
      approved,
      order_id: orderId,
      last_four: token.last_four,
      response_code: response.responseCode,
    });

    logger.info({
      customerId, tokenId, amountCents, approved,
      orderId, responseCode: response.responseCode,
    }, '[MonerisVault] Token purchase processed');

    return {
      success: approved,
      monerisOrderId: orderId,
      monerisTransId: response.transId,
      authCode: response.authCode,
      responseCode: response.responseCode,
      message: response.message,
      amount: amountCents,
      cardBrand: token.card_brand,
      lastFour: token.last_four,
      referenceNum: response.referenceNum,
      complete: response.complete === 'true',
    };
  }

  /**
   * Pre-authorize using a stored Vault token (res_preauth_cc).
   * Used for holds that will be captured later.
   *
   * @param {number} customerId
   * @param {number} tokenId
   * @param {number} amountCents
   * @param {object} [metadata]
   * @returns {Promise<object>} Pre-auth result
   */
  async preauthTokenTransaction(customerId, tokenId, amountCents, metadata = {}) {
    if (!this.moneris.isConfigured()) {
      throw new Error('Moneris is not configured');
    }

    const { rows } = await this.pool.query(
      `SELECT id, moneris_token, card_bin, last_four, card_brand, expiry_date
       FROM customer_payment_tokens
       WHERE id = $1 AND customer_id = $2 AND is_active = true`,
      [tokenId, customerId]
    );

    if (rows.length === 0) {
      throw new Error('Payment method not found or inactive');
    }

    const token = rows[0];
    if (this._isExpired(token.expiry_date)) {
      throw new Error('This payment method has expired.');
    }

    const amount = (amountCents / 100).toFixed(2);
    const orderId = metadata.orderId || this.moneris._generateOrderId('VPA');

    const xml = this.moneris._buildXml('res_preauth_cc', {
      data_key: token.moneris_token,
      order_id: orderId,
      amount: amount,
      cust_id: String(customerId),
      crypt_type: '7',
    });

    const response = await this.moneris._sendGatewayRequest(xml);
    const approved = this.moneris._isApproved(response.responseCode);

    if (approved) {
      await this.pool.query(
        `UPDATE customer_payment_tokens
         SET last_used_at = NOW(), use_count = use_count + 1, updated_at = NOW()
         WHERE id = $1`,
        [tokenId]
      );
    }

    this.audit.log(metadata.employeeId || null, 'vault.token_preauth', 'customer_payment_token', tokenId, {
      customer_id: customerId,
      amount_cents: amountCents,
      approved,
      order_id: orderId,
    });

    return {
      success: approved,
      monerisOrderId: orderId,
      monerisTransId: response.transId,
      authCode: response.authCode,
      responseCode: response.responseCode,
      message: response.message,
      amount: amountCents,
      lastFour: token.last_four,
    };
  }

  // ============================================================================
  // TOKEN MANAGEMENT
  // ============================================================================

  /**
   * Delete a saved payment method.
   * Removes from Moneris Vault (res_delete) and soft-deletes locally.
   *
   * @param {number} customerId
   * @param {number} tokenId
   * @param {number} [userId] - Employee performing the deletion
   * @returns {Promise<object>} Deletion result
   */
  async deleteToken(customerId, tokenId, userId = null) {
    // Retrieve the token (need moneris_token for vault deletion)
    const { rows } = await this.pool.query(
      `SELECT id, moneris_token, last_four, card_brand
       FROM customer_payment_tokens
       WHERE id = $1 AND customer_id = $2 AND is_active = true`,
      [tokenId, customerId]
    );

    if (rows.length === 0) {
      throw new Error('Payment method not found');
    }

    const token = rows[0];
    let vaultDeleted = false;

    // ---------------------------------------------------------------
    // Moneris Vault: res_delete
    // ---------------------------------------------------------------
    if (this.moneris.isConfigured()) {
      try {
        const xml = this.moneris._buildXml('res_delete', {
          data_key: token.moneris_token,
        });
        const response = await this.moneris._sendGatewayRequest(xml);
        vaultDeleted = response.complete === 'true' || this.moneris._isApproved(response.responseCode);

        if (!vaultDeleted) {
          logger.warn({ responseCode: response.responseCode, message: response.message },
            '[MonerisVault] Vault deletion returned non-success — soft-deleting locally anyway');
        }
      } catch (err) {
        // Soft-delete locally even if Moneris call fails
        logger.error({ err, tokenId },
          '[MonerisVault] Vault deletion failed — soft-deleting locally');
      }
    }

    // ---------------------------------------------------------------
    // Soft-delete locally
    // ---------------------------------------------------------------
    await this.pool.query(
      `UPDATE customer_payment_tokens
       SET is_active = false, is_default = false, updated_at = NOW()
       WHERE id = $1`,
      [tokenId]
    );

    this.audit.log(userId, 'vault.card_deleted', 'customer_payment_token', tokenId, {
      customer_id: customerId,
      last_four: token.last_four,
      card_brand: token.card_brand,
      vault_deleted: vaultDeleted,
    });

    logger.info({ customerId, tokenId, lastFour: token.last_four, vaultDeleted },
      '[MonerisVault] Payment method deleted');

    return { deleted: true, vaultDeleted };
  }

  /**
   * Set a token as the default payment method for a customer.
   *
   * @param {number} customerId
   * @param {number} tokenId
   * @returns {Promise<void>}
   */
  async setDefault(customerId, tokenId) {
    // Clear existing default
    await this.pool.query(
      `UPDATE customer_payment_tokens SET is_default = false, updated_at = NOW()
       WHERE customer_id = $1 AND is_default = true`,
      [customerId]
    );

    const result = await this.pool.query(
      `UPDATE customer_payment_tokens SET is_default = true, updated_at = NOW()
       WHERE id = $1 AND customer_id = $2 AND is_active = true
       RETURNING id`,
      [tokenId, customerId]
    );

    if (result.rowCount === 0) {
      throw new Error('Payment method not found');
    }
  }

  /**
   * Update the nickname of a saved payment method.
   *
   * @param {number} customerId
   * @param {number} tokenId
   * @param {string} nickname
   * @returns {Promise<void>}
   */
  async updateNickname(customerId, tokenId, nickname) {
    const result = await this.pool.query(
      `UPDATE customer_payment_tokens SET nickname = $3, updated_at = NOW()
       WHERE id = $1 AND customer_id = $2 AND is_active = true
       RETURNING id`,
      [tokenId, customerId, nickname]
    );

    if (result.rowCount === 0) {
      throw new Error('Payment method not found');
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Extract the data_key from a Moneris Vault response.
   * Moneris returns it as <DataKey> in the XML response.
   */
  _extractDataKey(response) {
    if (response.rawXml) {
      const match = response.rawXml.match(/<DataKey>(.*?)<\/DataKey>/);
      if (match) return match[1].trim();
    }
    return null;
  }

  /**
   * Check if a card has expired based on YYMM expiry.
   * @param {string} expiry - YYMM format
   * @returns {boolean}
   */
  _isExpired(expiry) {
    if (!expiry || expiry.length !== 4) return false;
    const year = 2000 + parseInt(expiry.substring(0, 2), 10);
    const month = parseInt(expiry.substring(2, 4), 10);
    const now = new Date();
    // Card is valid through the last day of the expiry month
    return now > new Date(year, month, 0, 23, 59, 59);
  }

  /**
   * Format YYMM expiry to MM/YY for display.
   * @param {string} expiry - YYMM format
   * @returns {string} MM/YY
   */
  _formatExpiry(expiry) {
    if (!expiry || expiry.length !== 4) return 'N/A';
    return `${expiry.substring(2, 4)}/${expiry.substring(0, 2)}`;
  }
}

module.exports = MonerisVaultService;
