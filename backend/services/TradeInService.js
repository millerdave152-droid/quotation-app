/**
 * TradeInService - Trade-In Processing for POS
 *
 * Handles device trade-in assessments, value calculations,
 * and application of trade-in credits to purchases.
 *
 * Business Rules:
 * - Trade-in value cannot exceed purchase total
 * - Multiple trade-ins allowed per transaction
 * - Manager approval required if trade-in > $500
 * - Serial number required for electronics categories
 */

class TradeInService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;

    // Configuration
    this.config = {
      managerApprovalThreshold: 500.00, // Require approval above this value
      assessmentValidityHours: 72, // Assessments expire after 72 hours
      maxTradeInsPerTransaction: 5, // Maximum trade-ins per order
      cacheTimeout: 300, // 5 minutes cache for product lookups
    };
  }

  // ============================================================================
  // 1. SEARCH TRADE-IN PRODUCTS
  // Search by brand, model, category
  // ============================================================================

  async searchTradeInProducts(query, options = {}) {
    const {
      brand,
      model,
      categoryId,
      searchTerm,
      activeOnly = true,
      limit = 50,
      offset = 0,
    } = { ...query, ...options };

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Base conditions
    if (activeOnly) {
      conditions.push(`tip.is_active = true`);
      conditions.push(`tic.is_active = true`);
    }

    // Brand filter
    if (brand) {
      conditions.push(`tip.brand ILIKE $${paramIndex}`);
      params.push(`%${brand}%`);
      paramIndex++;
    }

    // Model filter
    if (model) {
      conditions.push(`(tip.model ILIKE $${paramIndex} OR tip.model_pattern ILIKE $${paramIndex})`);
      params.push(`%${model}%`);
      paramIndex++;
    }

    // Category filter
    if (categoryId) {
      conditions.push(`tip.category_id = $${paramIndex}`);
      params.push(categoryId);
      paramIndex++;
    }

    // General search term (searches brand, model, variant)
    if (searchTerm) {
      conditions.push(`(
        tip.brand ILIKE $${paramIndex} OR
        tip.model ILIKE $${paramIndex} OR
        tip.variant ILIKE $${paramIndex} OR
        tip.model_pattern ILIKE $${paramIndex}
      )`);
      params.push(`%${searchTerm}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Add pagination params
    params.push(limit);
    params.push(offset);

    const searchQuery = `
      SELECT
        tip.id,
        tip.category_id,
        tip.brand,
        tip.model,
        tip.model_pattern,
        tip.variant,
        tip.release_year,
        tip.base_value,
        tip.specifications,
        tip.is_active,
        tic.name as category_name,
        tic.requires_serial,
        tic.requires_imei,
        tic.requires_photos,
        tic.min_photos,
        tic.max_age_years,
        tic.icon as category_icon,
        -- Check if product age is acceptable
        CASE
          WHEN tip.release_year IS NULL THEN true
          WHEN COALESCE(tip.override_max_age_years, tic.max_age_years) IS NULL THEN true
          WHEN (EXTRACT(YEAR FROM CURRENT_DATE) - tip.release_year) <= COALESCE(tip.override_max_age_years, tic.max_age_years) THEN true
          ELSE false
        END as is_age_acceptable,
        -- Get condition multipliers for preview
        (
          SELECT json_agg(json_build_object(
            'id', ticon.id,
            'name', ticon.condition_name,
            'code', ticon.condition_code,
            'multiplier', ticon.value_multiplier,
            'estimatedValue', ROUND(tip.base_value * ticon.value_multiplier, 2)
          ) ORDER BY ticon.display_order)
          FROM trade_in_conditions ticon
          WHERE ticon.is_active = true
        ) as condition_values
      FROM trade_in_products tip
      JOIN trade_in_categories tic ON tip.category_id = tic.id
      ${whereClause}
      ORDER BY
        tip.brand ASC,
        tip.model ASC,
        tip.variant ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    // Get count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM trade_in_products tip
      JOIN trade_in_categories tic ON tip.category_id = tic.id
      ${whereClause}
    `;

    const [productsResult, countResult] = await Promise.all([
      this.pool.query(searchQuery, params),
      this.pool.query(countQuery, params.slice(0, -2)), // Exclude limit/offset
    ]);

    return {
      products: productsResult.rows.map(row => this._formatTradeInProduct(row)),
      pagination: {
        total: parseInt(countResult.rows[0]?.total || 0),
        limit,
        offset,
        hasMore: offset + productsResult.rows.length < parseInt(countResult.rows[0]?.total || 0),
      },
    };
  }

  // ============================================================================
  // 2. ASSESS TRADE-IN
  // Calculate trade-in value based on product and condition
  // ============================================================================

  async assessTradeIn(productId, conditionId, options = {}) {
    const { serialNumber, imei, customAdjustment = 0, adjustmentReason } = options;

    // Get product details
    const productQuery = `
      SELECT
        tip.*,
        tic.name as category_name,
        tic.requires_serial,
        tic.requires_imei,
        tic.max_age_years
      FROM trade_in_products tip
      JOIN trade_in_categories tic ON tip.category_id = tic.id
      WHERE tip.id = $1 AND tip.is_active = true
    `;

    const productResult = await this.pool.query(productQuery, [productId]);

    if (productResult.rows.length === 0) {
      throw new Error('Trade-in product not found or inactive');
    }

    const product = productResult.rows[0];

    // Validate serial number if required
    if (product.requires_serial && !serialNumber) {
      throw new Error(`Serial number is required for ${product.category_name}`);
    }

    // Validate IMEI if required (smartphones)
    if (product.requires_imei && !imei) {
      throw new Error(`IMEI is required for ${product.category_name}`);
    }

    // Validate IMEI format if provided
    if (imei && !this._validateIMEI(imei)) {
      throw new Error('Invalid IMEI format. Must be 15 digits.');
    }

    // Check product age
    const maxAge = product.override_max_age_years || product.max_age_years;
    if (product.release_year && maxAge) {
      const productAge = new Date().getFullYear() - product.release_year;
      if (productAge > maxAge) {
        throw new Error(`This ${product.brand} ${product.model} is too old for trade-in (${productAge} years, max ${maxAge} years)`);
      }
    }

    // Get condition details
    const conditionQuery = `
      SELECT * FROM trade_in_conditions
      WHERE id = $1 AND is_active = true
    `;

    const conditionResult = await this.pool.query(conditionQuery, [conditionId]);

    if (conditionResult.rows.length === 0) {
      throw new Error('Invalid condition grade');
    }

    const condition = conditionResult.rows[0];

    // Calculate value
    const baseValue = parseFloat(product.base_value);
    const conditionMultiplier = parseFloat(condition.value_multiplier);
    const adjustment = parseFloat(customAdjustment || 0);

    // Formula: (base × multiplier) + adjustment
    const assessedValue = Math.max(0, Math.round(((baseValue * conditionMultiplier) + adjustment) * 100) / 100);

    // Check if manager approval required
    const requiresApproval = assessedValue > this.config.managerApprovalThreshold;

    return {
      product: {
        id: product.id,
        brand: product.brand,
        model: product.model,
        variant: product.variant,
        categoryName: product.category_name,
        releaseYear: product.release_year,
        specifications: product.specifications,
      },
      condition: {
        id: condition.id,
        name: condition.condition_name,
        code: condition.condition_code,
        multiplier: conditionMultiplier,
        criteria: condition.condition_criteria,
        checklist: condition.checklist,
      },
      calculation: {
        baseValue,
        conditionMultiplier,
        adjustmentAmount: adjustment,
        adjustmentReason: adjustmentReason || null,
        assessedValue,
      },
      requirements: {
        serialNumber: product.requires_serial,
        imei: product.requires_imei,
        photos: product.requires_photos,
        minPhotos: product.min_photos,
      },
      validation: {
        serialProvided: !!serialNumber,
        imeiProvided: !!imei,
        imeiValid: imei ? this._validateIMEI(imei) : null,
      },
      requiresManagerApproval: requiresApproval,
      approvalThreshold: this.config.managerApprovalThreshold,
    };
  }

  // ============================================================================
  // 3. CREATE TRADE-IN ASSESSMENT
  // Store assessment record in database
  // ============================================================================

  async createTradeInAssessment(assessmentData) {
    const {
      productId,
      customBrand,
      customModel,
      customDescription,
      serialNumber,
      imei,
      conditionId,
      conditionNotes,
      damageDetails,
      adjustmentAmount = 0,
      adjustmentReason,
      customerId,
      assessedBy,
      photos = [],
      internalNotes,
    } = assessmentData;

    // Validate: must have either productId or custom entry
    if (!productId && !customBrand) {
      throw new Error('Either productId or custom product details required');
    }

    // Get product and condition details for value calculation
    let baseValue;
    let categoryId;
    let requiresSerial = true;
    let requiresImei = false;

    if (productId) {
      const productQuery = `
        SELECT tip.*, tic.requires_serial, tic.requires_imei
        FROM trade_in_products tip
        JOIN trade_in_categories tic ON tip.category_id = tic.id
        WHERE tip.id = $1
      `;
      const productResult = await this.pool.query(productQuery, [productId]);

      if (productResult.rows.length === 0) {
        throw new Error('Trade-in product not found');
      }

      const product = productResult.rows[0];
      baseValue = parseFloat(product.base_value);
      categoryId = product.category_id;
      requiresSerial = product.requires_serial;
      requiresImei = product.requires_imei;
    } else {
      // Custom product - require base value
      if (!assessmentData.baseValue) {
        throw new Error('Base value required for custom trade-in');
      }
      baseValue = parseFloat(assessmentData.baseValue);
      categoryId = assessmentData.categoryId;
    }

    // Validate serial number
    if (requiresSerial && !serialNumber) {
      throw new Error('Serial number is required');
    }

    // Validate IMEI
    if (requiresImei && !imei) {
      throw new Error('IMEI is required for this device type');
    }

    if (imei && !this._validateIMEI(imei)) {
      throw new Error('Invalid IMEI format');
    }

    // Check for duplicate serial number in pending/applied assessments
    if (serialNumber) {
      const duplicateCheck = await this.pool.query(`
        SELECT id FROM trade_in_assessments
        WHERE serial_number = $1
          AND status IN ('pending', 'approved', 'applied')
      `, [serialNumber]);

      if (duplicateCheck.rows.length > 0) {
        throw new Error('This serial number already has an active trade-in assessment');
      }
    }

    // Get condition multiplier
    const conditionQuery = `SELECT * FROM trade_in_conditions WHERE id = $1`;
    const conditionResult = await this.pool.query(conditionQuery, [conditionId]);

    if (conditionResult.rows.length === 0) {
      throw new Error('Invalid condition ID');
    }

    const condition = conditionResult.rows[0];
    const conditionMultiplier = parseFloat(condition.value_multiplier);

    // Calculate assessed value (trigger will also do this, but we need it for validation)
    const assessedValue = Math.max(0, Math.round(((baseValue * conditionMultiplier) + parseFloat(adjustmentAmount || 0)) * 100) / 100);

    // Determine initial status
    const requiresApproval = assessedValue > this.config.managerApprovalThreshold;
    const initialStatus = requiresApproval ? 'pending' : 'approved';

    // Calculate validity period
    const validUntil = new Date();
    validUntil.setHours(validUntil.getHours() + this.config.assessmentValidityHours);

    // Insert assessment
    const insertQuery = `
      INSERT INTO trade_in_assessments (
        trade_in_product_id,
        category_id,
        custom_brand,
        custom_model,
        custom_description,
        serial_number,
        imei,
        condition_id,
        condition_notes,
        damage_details,
        base_value,
        condition_multiplier,
        adjustment_amount,
        adjustment_reason,
        assessed_value,
        final_value,
        customer_id,
        assessed_by,
        status,
        valid_until,
        internal_notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      )
      RETURNING *
    `;

    const insertResult = await this.pool.query(insertQuery, [
      productId || null,
      categoryId || null,
      customBrand || null,
      customModel || null,
      customDescription || null,
      serialNumber || null,
      imei || null,
      conditionId,
      conditionNotes || null,
      damageDetails ? JSON.stringify(damageDetails) : null,
      baseValue,
      conditionMultiplier,
      adjustmentAmount || 0,
      adjustmentReason || null,
      assessedValue,
      assessedValue,  // final_value = assessed_value initially
      customerId || null,
      assessedBy,
      initialStatus,
      validUntil,
      internalNotes || null,
    ]);

    const assessment = insertResult.rows[0];

    // Add photos if provided
    if (photos && photos.length > 0) {
      await this._addPhotos(assessment.id, photos, assessedBy);
    }

    // Fetch complete assessment with related data
    return this.getAssessment(assessment.id);
  }

  // ============================================================================
  // 4. APPLY TRADE-IN TO CART
  // Add trade-in credit as negative line item
  // ============================================================================

  async applyTradeInToCart(cartId, assessmentId, options = {}) {
    const { userId } = options;

    // Get assessment
    const assessment = await this.getAssessment(assessmentId);

    if (!assessment) {
      throw new Error('Trade-in assessment not found');
    }

    // Validate assessment status
    if (assessment.status === 'applied') {
      throw new Error('This trade-in has already been applied to an order');
    }

    if (assessment.status === 'void') {
      throw new Error('This trade-in assessment has been voided');
    }

    if (assessment.status === 'expired') {
      throw new Error('This trade-in assessment has expired');
    }

    if (assessment.status === 'rejected') {
      throw new Error('This trade-in assessment was rejected');
    }

    // Check if assessment requires approval and hasn't been approved
    if (assessment.status === 'pending' && assessment.requiresApproval) {
      throw new Error('This trade-in requires manager approval before it can be applied');
    }

    // Check validity
    if (assessment.validUntil && new Date(assessment.validUntil) < new Date()) {
      // Mark as expired
      await this.pool.query(`
        UPDATE trade_in_assessments
        SET status = 'expired', status_changed_at = NOW()
        WHERE id = $1
      `, [assessmentId]);
      throw new Error('This trade-in assessment has expired');
    }

    // Get cart/order details to validate trade-in amount
    const cartQuery = `
      SELECT
        t.transaction_id,
        t.subtotal,
        t.total_amount,
        t.status as transaction_status,
        -- Count existing trade-ins on this transaction
        (SELECT COUNT(*) FROM trade_in_assessments WHERE transaction_id = t.transaction_id AND status = 'applied') as existing_trade_ins,
        -- Sum existing trade-in values
        (SELECT COALESCE(SUM(final_value), 0) FROM trade_in_assessments WHERE transaction_id = t.transaction_id AND status = 'applied') as existing_trade_in_total
      FROM transactions t
      WHERE t.transaction_id = $1
    `;

    const cartResult = await this.pool.query(cartQuery, [cartId]);

    if (cartResult.rows.length === 0) {
      throw new Error('Cart/Transaction not found');
    }

    const cart = cartResult.rows[0];

    // Check max trade-ins per transaction
    if (parseInt(cart.existing_trade_ins) >= this.config.maxTradeInsPerTransaction) {
      throw new Error(`Maximum ${this.config.maxTradeInsPerTransaction} trade-ins allowed per transaction`);
    }

    // Validate trade-in value doesn't exceed cart total
    const totalTradeInValue = parseFloat(cart.existing_trade_in_total) + parseFloat(assessment.finalValue);
    const cartTotal = parseFloat(cart.total_amount);

    if (totalTradeInValue > cartTotal) {
      throw new Error(`Trade-in value ($${assessment.finalValue}) would exceed purchase total. Maximum additional trade-in: $${Math.max(0, cartTotal - parseFloat(cart.existing_trade_in_total)).toFixed(2)}`);
    }

    // Start transaction
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update assessment to link to cart and set status to applied
      await client.query(`
        UPDATE trade_in_assessments
        SET
          transaction_id = $1,
          status = 'applied',
          status_changed_at = NOW(),
          status_changed_by = $2
        WHERE id = $3
      `, [cartId, userId, assessmentId]);

      // Add negative line item to transaction_items
      const itemDescription = assessment.product
        ? `Trade-In: ${assessment.product.brand} ${assessment.product.model}${assessment.product.variant ? ` (${assessment.product.variant})` : ''}`
        : `Trade-In: ${assessment.customBrand || ''} ${assessment.customModel || ''}`;

      await client.query(`
        INSERT INTO transaction_items (
          transaction_id,
          product_name,
          product_sku,
          quantity,
          unit_price,
          line_total,
          serial_number
        ) VALUES (
          $1, $2, 'TRADE-IN', 1, $3, $3, $4
        )
      `, [
        cartId,
        itemDescription,
        -assessment.finalValue, // Negative value
        assessment.serialNumber,
      ]);

      // Update transaction totals
      await client.query(`
        UPDATE transactions
        SET
          subtotal = subtotal - $1,
          total_amount = total_amount - $1,
          updated_at = NOW()
        WHERE transaction_id = $2
      `, [assessment.finalValue, cartId]);

      await client.query('COMMIT');

      // Get updated cart totals
      const updatedCart = await this.pool.query(`
        SELECT subtotal, total_amount,
          (SELECT COALESCE(SUM(final_value), 0) FROM trade_in_assessments WHERE transaction_id = $1 AND status = 'applied') as total_trade_in_value
        FROM transactions WHERE transaction_id = $1
      `, [cartId]);

      return {
        success: true,
        assessmentId,
        transactionId: cartId,
        tradeInValue: assessment.finalValue,
        totalTradeInValue: parseFloat(updatedCart.rows[0]?.total_trade_in_value || 0),
        newSubtotal: parseFloat(updatedCart.rows[0]?.subtotal || 0),
        newTotal: parseFloat(updatedCart.rows[0]?.total_amount || 0),
        itemDescription,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // 5. GET CUSTOMER TRADE-INS
  // History of customer's trade-ins
  // ============================================================================

  async getCustomerTradeIns(customerId, options = {}) {
    const {
      status,
      includeVoided = false,
      limit = 50,
      offset = 0,
    } = options;

    const conditions = [`tia.customer_id = $1`];
    const params = [customerId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`tia.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (!includeVoided) {
      conditions.push(`tia.status != 'void'`);
    }

    params.push(limit, offset);

    const query = `
      SELECT
        tia.*,
        tip.brand as product_brand,
        tip.model as product_model,
        tip.variant as product_variant,
        tic.name as category_name,
        ticon.condition_name,
        ticon.condition_code,
        t.transaction_number,
        o.id as order_id,
        u.first_name || ' ' || u.last_name as assessed_by_name,
        -- Photos
        (
          SELECT json_agg(json_build_object(
            'id', tp.id,
            'url', tp.photo_url,
            'type', tp.photo_type
          ))
          FROM trade_in_photos tp
          WHERE tp.assessment_id = tia.id
        ) as photos
      FROM trade_in_assessments tia
      LEFT JOIN trade_in_products tip ON tia.trade_in_product_id = tip.id
      LEFT JOIN trade_in_categories tic ON tia.category_id = tic.id
      LEFT JOIN trade_in_conditions ticon ON tia.condition_id = ticon.id
      LEFT JOIN transactions t ON tia.transaction_id = t.transaction_id
      LEFT JOIN orders o ON tia.order_id = o.id
      LEFT JOIN users u ON tia.assessed_by = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY tia.assessed_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM trade_in_assessments tia
      WHERE ${conditions.join(' AND ')}
    `;

    const [tradesResult, countResult] = await Promise.all([
      this.pool.query(query, params),
      this.pool.query(countQuery, params.slice(0, -2)),
    ]);

    // Calculate summary stats
    const summaryQuery = `
      SELECT
        COUNT(*) FILTER (WHERE status = 'applied') as completed_count,
        COUNT(*) FILTER (WHERE status IN ('pending', 'approved')) as pending_count,
        COALESCE(SUM(final_value) FILTER (WHERE status = 'applied'), 0) as total_value_traded
      FROM trade_in_assessments
      WHERE customer_id = $1 AND status != 'void'
    `;
    const summaryResult = await this.pool.query(summaryQuery, [customerId]);

    return {
      tradeIns: tradesResult.rows.map(row => this._formatAssessment(row)),
      pagination: {
        total: parseInt(countResult.rows[0]?.total || 0),
        limit,
        offset,
      },
      summary: {
        completedCount: parseInt(summaryResult.rows[0]?.completed_count || 0),
        pendingCount: parseInt(summaryResult.rows[0]?.pending_count || 0),
        totalValueTraded: parseFloat(summaryResult.rows[0]?.total_value_traded || 0),
      },
    };
  }

  // ============================================================================
  // 6. VOID TRADE-IN
  // Void an assessment (if sale cancelled)
  // ============================================================================

  async voidTradeIn(assessmentId, reason, options = {}) {
    const { userId, reverseFromTransaction = true } = options;

    if (!reason || reason.trim().length < 5) {
      throw new Error('Reason for voiding is required (minimum 5 characters)');
    }

    // Get assessment
    const assessment = await this.getAssessment(assessmentId);

    if (!assessment) {
      throw new Error('Trade-in assessment not found');
    }

    if (assessment.status === 'void') {
      throw new Error('This trade-in has already been voided');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // If assessment was applied to a transaction, reverse it
      if (assessment.status === 'applied' && assessment.transactionId && reverseFromTransaction) {
        // Remove the trade-in line item
        await client.query(`
          DELETE FROM transaction_items
          WHERE transaction_id = $1
            AND product_sku = 'TRADE-IN'
            AND serial_number = $2
        `, [assessment.transactionId, assessment.serialNumber]);

        // Update transaction totals (add back the trade-in value)
        await client.query(`
          UPDATE transactions
          SET
            subtotal = subtotal + $1,
            total_amount = total_amount + $1,
            updated_at = NOW()
          WHERE transaction_id = $2
        `, [assessment.finalValue, assessment.transactionId]);
      }

      // Update assessment status
      await client.query(`
        UPDATE trade_in_assessments
        SET
          status = 'void',
          status_reason = $1,
          status_changed_at = NOW(),
          status_changed_by = $2,
          internal_notes = COALESCE(internal_notes || E'\\n', '') ||
            '[' || NOW()::TEXT || '] VOIDED: ' || $1
        WHERE id = $3
      `, [reason, userId, assessmentId]);

      await client.query('COMMIT');

      return {
        success: true,
        assessmentId,
        previousStatus: assessment.status,
        newStatus: 'void',
        reason,
        transactionReversed: assessment.status === 'applied' && reverseFromTransaction,
        reversedValue: assessment.status === 'applied' ? assessment.finalValue : 0,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // ADDITIONAL HELPER METHODS
  // ============================================================================

  /**
   * Get single assessment by ID
   */
  async getAssessment(assessmentId) {
    const query = `
      SELECT
        tia.*,
        tip.brand as product_brand,
        tip.model as product_model,
        tip.variant as product_variant,
        tip.specifications as product_specs,
        tic.name as category_name,
        tic.requires_serial,
        tic.requires_imei,
        tic.requires_photos,
        tic.min_photos,
        ticon.condition_name,
        ticon.condition_code,
        ticon.color as condition_color,
        t.transaction_number,
        o.id as order_id,
        u.first_name || ' ' || u.last_name as assessed_by_name,
        ou.first_name || ' ' || ou.last_name as override_by_name,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        -- Photos
        (
          SELECT json_agg(json_build_object(
            'id', tp.id,
            'url', tp.photo_url,
            'type', tp.photo_type,
            'description', tp.description
          ) ORDER BY tp.uploaded_at)
          FROM trade_in_photos tp
          WHERE tp.assessment_id = tia.id
        ) as photos
      FROM trade_in_assessments tia
      LEFT JOIN trade_in_products tip ON tia.trade_in_product_id = tip.id
      LEFT JOIN trade_in_categories tic ON tia.category_id = tic.id
      LEFT JOIN trade_in_conditions ticon ON tia.condition_id = ticon.id
      LEFT JOIN transactions t ON tia.transaction_id = t.transaction_id
      LEFT JOIN orders o ON tia.order_id = o.id
      LEFT JOIN users u ON tia.assessed_by = u.id
      LEFT JOIN users ou ON tia.override_by = ou.id
      LEFT JOIN customers c ON tia.customer_id = c.id
      WHERE tia.id = $1
    `;

    const result = await this.pool.query(query, [assessmentId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this._formatAssessment(result.rows[0]);
  }

  /**
   * Get all categories
   */
  async getCategories(activeOnly = true) {
    const query = `
      SELECT
        id, name, description, requires_serial, requires_imei,
        requires_photos, min_photos, max_age_years,
        minimum_value, maximum_value, icon, is_active
      FROM trade_in_categories
      ${activeOnly ? 'WHERE is_active = true' : ''}
      ORDER BY display_order, name
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Get all conditions
   */
  async getConditions(activeOnly = true) {
    const query = `
      SELECT
        id, condition_name, condition_code, value_multiplier,
        condition_criteria, checklist, color, is_active
      FROM trade_in_conditions
      ${activeOnly ? 'WHERE is_active = true' : ''}
      ORDER BY display_order
    `;

    const result = await this.pool.query(query);
    return result.rows.map(row => ({
      id: row.id,
      name: row.condition_name,
      code: row.condition_code,
      multiplier: parseFloat(row.value_multiplier),
      criteria: row.condition_criteria,
      checklist: row.checklist,
      color: row.color,
      isActive: row.is_active,
    }));
  }

  /**
   * Approve trade-in (manager action)
   */
  async approveTradeIn(assessmentId, options = {}) {
    const { userId, overrideValue, overrideReason } = options;

    const assessment = await this.getAssessment(assessmentId);

    if (!assessment) {
      throw new Error('Trade-in assessment not found');
    }

    if (assessment.status !== 'pending') {
      throw new Error(`Cannot approve assessment with status: ${assessment.status}`);
    }

    const updateQuery = `
      UPDATE trade_in_assessments
      SET
        status = 'approved',
        status_changed_at = NOW(),
        status_changed_by = $1,
        override_value = $2,
        override_reason = $3,
        override_by = CASE WHEN $2 IS NOT NULL THEN $1 ELSE NULL END,
        override_at = CASE WHEN $2 IS NOT NULL THEN NOW() ELSE NULL END,
        final_value = COALESCE($2, assessed_value)
      WHERE id = $4
      RETURNING *
    `;

    const result = await this.pool.query(updateQuery, [
      userId,
      overrideValue || null,
      overrideReason || null,
      assessmentId,
    ]);

    return this.getAssessment(assessmentId);
  }

  /**
   * Reject trade-in (manager action)
   */
  async rejectTradeIn(assessmentId, reason, userId) {
    if (!reason || reason.trim().length < 5) {
      throw new Error('Rejection reason is required (minimum 5 characters)');
    }

    const assessment = await this.getAssessment(assessmentId);

    if (!assessment) {
      throw new Error('Trade-in assessment not found');
    }

    if (assessment.status !== 'pending') {
      throw new Error(`Cannot reject assessment with status: ${assessment.status}`);
    }

    await this.pool.query(`
      UPDATE trade_in_assessments
      SET
        status = 'rejected',
        status_reason = $1,
        status_changed_at = NOW(),
        status_changed_by = $2
      WHERE id = $3
    `, [reason, userId, assessmentId]);

    return this.getAssessment(assessmentId);
  }

  /**
   * Get pending assessments requiring approval
   */
  async getPendingApprovals(options = {}) {
    const { limit = 50 } = options;

    const query = `
      SELECT
        tia.*,
        tip.brand as product_brand,
        tip.model as product_model,
        tip.variant as product_variant,
        tic.name as category_name,
        ticon.condition_name,
        u.first_name || ' ' || u.last_name as assessed_by_name,
        c.name as customer_name
      FROM trade_in_assessments tia
      LEFT JOIN trade_in_products tip ON tia.trade_in_product_id = tip.id
      LEFT JOIN trade_in_categories tic ON tia.category_id = tic.id
      LEFT JOIN trade_in_conditions ticon ON tia.condition_id = ticon.id
      LEFT JOIN users u ON tia.assessed_by = u.id
      LEFT JOIN customers c ON tia.customer_id = c.id
      WHERE tia.status = 'pending'
        AND tia.final_value > $1
        AND (tia.valid_until IS NULL OR tia.valid_until > NOW())
      ORDER BY tia.assessed_at DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [this.config.managerApprovalThreshold, limit]);

    return result.rows.map(row => this._formatAssessment(row));
  }

  /**
   * Add photos to assessment
   */
  async _addPhotos(assessmentId, photos, uploadedBy) {
    for (const photo of photos) {
      await this.pool.query(`
        INSERT INTO trade_in_photos (
          assessment_id, photo_url, photo_type, description, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        assessmentId,
        photo.url,
        photo.type || 'general',
        photo.description || null,
        uploadedBy,
      ]);
    }
  }

  /**
   * Validate IMEI format (15 digits)
   */
  _validateIMEI(imei) {
    const cleanIMEI = imei.replace(/\D/g, '');
    return cleanIMEI.length === 15 && this._luhnCheck(cleanIMEI);
  }

  /**
   * Luhn algorithm check for IMEI validation
   */
  _luhnCheck(num) {
    let sum = 0;
    let isEven = false;

    for (let i = num.length - 1; i >= 0; i--) {
      let digit = parseInt(num[i], 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  /**
   * Format trade-in product for API response
   */
  _formatTradeInProduct(row) {
    return {
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryIcon: row.category_icon,
      brand: row.brand,
      model: row.model,
      modelPattern: row.model_pattern,
      variant: row.variant,
      releaseYear: row.release_year,
      baseValue: parseFloat(row.base_value),
      specifications: row.specifications,
      isActive: row.is_active,
      isAgeAcceptable: row.is_age_acceptable,
      requirements: {
        serial: row.requires_serial,
        imei: row.requires_imei,
        photos: row.requires_photos,
        minPhotos: row.min_photos,
      },
      maxAgeYears: row.max_age_years,
      conditionValues: row.condition_values,
    };
  }

  /**
   * Format assessment for API response
   */
  _formatAssessment(row) {
    return {
      id: row.id,
      transactionId: row.transaction_id,
      orderId: row.order_id,
      transactionNumber: row.transaction_number,
      customerId: row.customer_id,
      customer: row.customer_name ? {
        name: row.customer_name,
        email: row.customer_email,
        phone: row.customer_phone,
      } : null,
      product: row.product_brand ? {
        id: row.trade_in_product_id,
        brand: row.product_brand,
        model: row.product_model,
        variant: row.product_variant,
        specifications: row.product_specs,
      } : null,
      customBrand: row.custom_brand,
      customModel: row.custom_model,
      customDescription: row.custom_description,
      categoryName: row.category_name,
      serialNumber: row.serial_number,
      imei: row.imei,
      condition: {
        id: row.condition_id,
        name: row.condition_name,
        code: row.condition_code,
        color: row.condition_color,
      },
      conditionNotes: row.condition_notes,
      damageDetails: row.damage_details,
      calculation: {
        baseValue: parseFloat(row.base_value),
        conditionMultiplier: parseFloat(row.condition_multiplier),
        adjustmentAmount: parseFloat(row.adjustment_amount || 0),
        adjustmentReason: row.adjustment_reason,
        assessedValue: parseFloat(row.assessed_value),
      },
      override: row.override_value ? {
        value: parseFloat(row.override_value),
        reason: row.override_reason,
        by: row.override_by_name,
        at: row.override_at,
      } : null,
      finalValue: parseFloat(row.final_value),
      requiresApproval: parseFloat(row.final_value) > this.config.managerApprovalThreshold,
      status: row.status,
      statusReason: row.status_reason,
      statusChangedAt: row.status_changed_at,
      assessedBy: row.assessed_by_name,
      assessedAt: row.assessed_at,
      validUntil: row.valid_until,
      isExpired: row.valid_until ? new Date(row.valid_until) < new Date() : false,
      photos: row.photos || [],
      internalNotes: row.internal_notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = TradeInService;
