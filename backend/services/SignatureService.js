/**
 * Signature Service
 * Manages customer signature capture, storage, and retrieval
 */

class SignatureService {
  /**
   * @param {Pool} pool - PostgreSQL connection pool
   * @param {object} cache - Cache module
   */
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  // ============================================================================
  // SIGNATURE CAPTURE
  // ============================================================================

  /**
   * Capture and store a signature
   * @param {object} signatureData - Signature information
   * @param {number} userId - User capturing the signature
   * @returns {Promise<object>} Created signature record
   */
  async captureSignature(signatureData, userId) {
    const {
      orderId,
      transactionId,
      signatureType,
      tradeInAssessmentId,
      financingApplicationId,
      signatureData: data,
      signatureFormat = 'svg',
      signerName,
      signerEmail,
      signerPhone,
      termsVersion,
      termsAccepted = true,
      legalText,
      ipAddress,
      deviceInfo,
      geolocation,
    } = signatureData;

    // Validate required fields
    if (!data) {
      throw new Error('Signature data is required');
    }
    if (!signerName || signerName.trim().length < 2) {
      throw new Error('Signer name is required');
    }
    if (!signatureType) {
      throw new Error('Signature type is required');
    }

    const result = await this.pool.query(`
      INSERT INTO signatures (
        order_id,
        transaction_id,
        signature_type,
        trade_in_assessment_id,
        financing_application_id,
        signature_data,
        signature_format,
        signer_name,
        signer_email,
        signer_phone,
        terms_version,
        terms_accepted,
        legal_text,
        captured_by,
        ip_address,
        device_info,
        geolocation,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'valid')
      RETURNING *
    `, [
      orderId || null,
      transactionId || null,
      signatureType,
      tradeInAssessmentId || null,
      financingApplicationId || null,
      data,
      signatureFormat,
      signerName.trim(),
      signerEmail || null,
      signerPhone || null,
      termsVersion || null,
      termsAccepted,
      legalText || null,
      userId,
      ipAddress || null,
      deviceInfo ? JSON.stringify(deviceInfo) : null,
      geolocation ? JSON.stringify(geolocation) : null,
    ]);

    const signature = this.formatSignature(result.rows[0]);

    // Invalidate relevant caches
    if (orderId) {
      this.cache?.invalidatePattern(`signatures:order:${orderId}`);
    }

    return signature;
  }

  // ============================================================================
  // SIGNATURE RETRIEVAL
  // ============================================================================

  /**
   * Get signature by ID
   * @param {number} signatureId - Signature ID
   * @returns {Promise<object>} Signature record
   */
  async getSignature(signatureId) {
    const result = await this.pool.query(`
      SELECT
        s.*,
        u.first_name || ' ' || u.last_name as captured_by_name,
        vu.first_name || ' ' || vu.last_name as voided_by_name
      FROM signatures s
      LEFT JOIN users u ON s.captured_by = u.id
      LEFT JOIN users vu ON s.voided_by = vu.id
      WHERE s.id = $1
    `, [signatureId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.formatSignature(result.rows[0]);
  }

  /**
   * Get all signatures for an order
   * @param {number} orderId - Order ID
   * @returns {Promise<Array>} Signatures for the order
   */
  async getOrderSignatures(orderId) {
    const cacheKey = `signatures:order:${orderId}`;
    const cached = this.cache?.get(cacheKey);
    if (cached) return cached;

    const result = await this.pool.query(`
      SELECT
        s.*,
        u.first_name || ' ' || u.last_name as captured_by_name
      FROM signatures s
      LEFT JOIN users u ON s.captured_by = u.id
      WHERE s.order_id = $1
      ORDER BY s.captured_at DESC
    `, [orderId]);

    const signatures = result.rows.map(row => this.formatSignature(row));

    this.cache?.set(cacheKey, signatures, 300); // 5 min cache

    return signatures;
  }

  /**
   * Get all signatures for a transaction
   * @param {number} transactionId - Transaction ID
   * @returns {Promise<Array>} Signatures for the transaction
   */
  async getTransactionSignatures(transactionId) {
    const result = await this.pool.query(`
      SELECT
        s.*,
        u.first_name || ' ' || u.last_name as captured_by_name
      FROM signatures s
      LEFT JOIN users u ON s.captured_by = u.id
      WHERE s.transaction_id = $1
      ORDER BY s.captured_at DESC
    `, [transactionId]);

    return result.rows.map(row => this.formatSignature(row));
  }

  /**
   * Check if order has a valid signature of a specific type
   * @param {number} orderId - Order ID
   * @param {string} signatureType - Signature type
   * @returns {Promise<boolean>} Whether signature exists
   */
  async hasValidSignature(orderId, signatureType) {
    const result = await this.pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM signatures
        WHERE order_id = $1
          AND signature_type = $2
          AND status = 'valid'
      ) as has_signature
    `, [orderId, signatureType]);

    return result.rows[0].has_signature;
  }

  // ============================================================================
  // SIGNATURE REQUIREMENTS
  // ============================================================================

  /**
   * Get signature requirements for an order
   * @param {number} orderId - Order ID
   * @returns {Promise<Array>} Required signatures with their status
   */
  async getRequiredSignatures(orderId) {
    // Get requirements from the database function
    const reqResult = await this.pool.query(
      'SELECT * FROM get_required_signatures($1)',
      [orderId]
    );

    // Get existing signatures for this order
    const existingSignatures = await this.getOrderSignatures(orderId);

    // Map requirements with completion status
    const requirements = reqResult.rows.map(req => {
      const existingSig = existingSignatures.find(
        s => s.signatureType === req.signature_type && s.status === 'valid'
      );

      return {
        requirementId: req.requirement_id,
        signatureType: req.signature_type,
        title: req.title,
        description: req.description,
        legalText: req.legal_text,
        termsVersion: req.terms_version,
        isRequired: req.is_required,
        allowTypedName: req.allow_typed_name,
        requirePrintedName: req.require_printed_name,
        reason: req.reason,
        isComplete: !!existingSig,
        signature: existingSig || null,
      };
    });

    return requirements;
  }

  /**
   * Get all active signature requirements
   * @returns {Promise<Array>} All active requirements
   */
  async getAllRequirements() {
    const result = await this.pool.query(`
      SELECT
        sr.*,
        c.name as category_name,
        p.name as product_name
      FROM signature_requirements sr
      LEFT JOIN categories c ON sr.category_id = c.id
      LEFT JOIN products p ON sr.product_id = p.id
      WHERE sr.is_active = TRUE
      ORDER BY sr.priority DESC, sr.requirement_type
    `);

    return result.rows;
  }

  /**
   * Create a new signature requirement
   * @param {object} data - Requirement data
   * @param {number} userId - Creating user
   * @returns {Promise<object>} Created requirement
   */
  async createRequirement(data, userId) {
    const {
      requirementType,
      thresholdValue,
      categoryId,
      productId,
      signatureType,
      title,
      description,
      legalText,
      termsVersion,
      isRequired = true,
      allowTypedName = true,
      requirePrintedName = true,
      priority = 100,
    } = data;

    const result = await this.pool.query(`
      INSERT INTO signature_requirements (
        requirement_type,
        threshold_value,
        category_id,
        product_id,
        signature_type,
        title,
        description,
        legal_text,
        terms_version,
        is_required,
        allow_typed_name,
        require_printed_name,
        priority,
        is_active,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE, $14)
      RETURNING *
    `, [
      requirementType,
      thresholdValue || null,
      categoryId || null,
      productId || null,
      signatureType,
      title,
      description || null,
      legalText || null,
      termsVersion || null,
      isRequired,
      allowTypedName,
      requirePrintedName,
      priority,
      userId,
    ]);

    return result.rows[0];
  }

  /**
   * Update a signature requirement
   * @param {number} requirementId - Requirement ID
   * @param {object} data - Updated data
   * @param {number} userId - Updating user
   * @returns {Promise<object>} Updated requirement
   */
  async updateRequirement(requirementId, data, userId) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = [
      'threshold_value', 'category_id', 'product_id', 'title',
      'description', 'legal_text', 'terms_version', 'is_required',
      'allow_typed_name', 'require_printed_name', 'priority', 'is_active'
    ];

    // Build dynamic update
    for (const field of allowedFields) {
      const camelField = field.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
      if (data[camelField] !== undefined) {
        fields.push(`${field} = $${paramIndex}`);
        values.push(data[camelField]);
        paramIndex++;
      }
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push(`updated_by = $${paramIndex}`);
    values.push(userId);
    paramIndex++;

    values.push(requirementId);

    const result = await this.pool.query(`
      UPDATE signature_requirements
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    return result.rows[0];
  }

  // ============================================================================
  // SIGNATURE MANAGEMENT
  // ============================================================================

  /**
   * Void a signature
   * @param {number} signatureId - Signature ID
   * @param {string} reason - Reason for voiding
   * @param {number} userId - User voiding the signature
   * @returns {Promise<object>} Updated signature
   */
  async voidSignature(signatureId, reason, userId) {
    if (!reason || reason.trim().length < 5) {
      throw new Error('A reason is required to void a signature');
    }

    const result = await this.pool.query(`
      UPDATE signatures
      SET status = 'voided',
          voided_at = NOW(),
          voided_by = $1,
          voided_reason = $2,
          updated_at = NOW()
      WHERE id = $3 AND status = 'valid'
      RETURNING *
    `, [userId, reason.trim(), signatureId]);

    if (result.rows.length === 0) {
      throw new Error('Signature not found or already voided');
    }

    const signature = this.formatSignature(result.rows[0]);

    // Invalidate cache
    if (signature.orderId) {
      this.cache?.invalidatePattern(`signatures:order:${signature.orderId}`);
    }

    return signature;
  }

  /**
   * Supersede a signature (replace with new one)
   * @param {number} oldSignatureId - Old signature to supersede
   * @param {object} newSignatureData - New signature data
   * @param {number} userId - User performing the action
   * @returns {Promise<object>} New signature
   */
  async supersedeSignature(oldSignatureId, newSignatureData, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Mark old signature as superseded
      await client.query(`
        UPDATE signatures
        SET status = 'superseded', updated_at = NOW()
        WHERE id = $1 AND status = 'valid'
      `, [oldSignatureId]);

      // Get old signature details for reference
      const oldSig = await client.query(
        'SELECT order_id, transaction_id, signature_type FROM signatures WHERE id = $1',
        [oldSignatureId]
      );

      if (oldSig.rows.length === 0) {
        throw new Error('Original signature not found');
      }

      // Create new signature with same references
      const newData = {
        ...newSignatureData,
        orderId: newSignatureData.orderId || oldSig.rows[0].order_id,
        transactionId: newSignatureData.transactionId || oldSig.rows[0].transaction_id,
        signatureType: newSignatureData.signatureType || oldSig.rows[0].signature_type,
      };

      await client.query('COMMIT');

      // Capture the new signature
      return await this.captureSignature(newData, userId);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // SIGNATURE TEMPLATES
  // ============================================================================

  /**
   * Get signature template by code
   * @param {string} templateCode - Template code
   * @returns {Promise<object>} Template
   */
  async getTemplate(templateCode) {
    const result = await this.pool.query(`
      SELECT * FROM signature_templates
      WHERE template_code = $1 AND is_active = TRUE
    `, [templateCode]);

    return result.rows[0] || null;
  }

  /**
   * Get default template for signature type
   * @param {string} signatureType - Signature type
   * @returns {Promise<object>} Default template
   */
  async getDefaultTemplate(signatureType) {
    const result = await this.pool.query(`
      SELECT * FROM signature_templates
      WHERE signature_type = $1 AND is_default = TRUE AND is_active = TRUE
      LIMIT 1
    `, [signatureType]);

    return result.rows[0] || null;
  }

  /**
   * Get all templates
   * @returns {Promise<Array>} All active templates
   */
  async getAllTemplates() {
    const result = await this.pool.query(`
      SELECT * FROM signature_templates
      WHERE is_active = TRUE
      ORDER BY signature_type, is_default DESC, template_name
    `);

    return result.rows;
  }

  // ============================================================================
  // AUDIT & REPORTING
  // ============================================================================

  /**
   * Get signature audit log
   * @param {object} filters - Filter options
   * @returns {Promise<Array>} Audit log entries
   */
  async getAuditLog(filters = {}) {
    const { startDate, endDate, signatureType, status, limit = 100, offset = 0 } = filters;

    let query = 'SELECT * FROM v_signature_audit WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND captured_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND captured_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (signatureType) {
      query += ` AND signature_type = $${paramIndex}`;
      params.push(signatureType);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY captured_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Format signature record for API response
   */
  formatSignature(row) {
    if (!row) return null;

    return {
      id: row.id,
      orderId: row.order_id,
      transactionId: row.transaction_id,
      signatureType: row.signature_type,
      tradeInAssessmentId: row.trade_in_assessment_id,
      financingApplicationId: row.financing_application_id,
      signatureData: row.signature_data,
      signatureFormat: row.signature_format,
      signerName: row.signer_name,
      signerEmail: row.signer_email,
      signerPhone: row.signer_phone,
      termsVersion: row.terms_version,
      termsAccepted: row.terms_accepted,
      legalText: row.legal_text,
      capturedAt: row.captured_at,
      capturedBy: row.captured_by,
      capturedByName: row.captured_by_name,
      ipAddress: row.ip_address,
      deviceInfo: row.device_info,
      geolocation: row.geolocation,
      status: row.status,
      voidedAt: row.voided_at,
      voidedBy: row.voided_by,
      voidedByName: row.voided_by_name,
      voidedReason: row.voided_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = SignatureService;
