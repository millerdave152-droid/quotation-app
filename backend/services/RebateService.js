/**
 * RebateService - Manufacturer Rebate Management
 * Handles instant rebates, mail-in rebates, and online rebates
 */

class RebateService {
  constructor(pool) {
    this.db = pool;
  }

  // ============================================================================
  // GET PRODUCT REBATES
  // Returns all active rebates for a specific product
  // ============================================================================

  async getProductRebates(productId) {
    const query = `
      SELECT
        r.id as rebate_id,
        r.name,
        r.description,
        r.rebate_type,
        r.amount,
        r.amount_type,
        r.max_rebate_amount,
        r.manufacturer,
        r.valid_from,
        r.valid_to,
        r.terms_url,
        r.submission_url,
        r.requires_upc,
        r.requires_receipt,
        r.requires_registration,
        r.claim_deadline_days,
        r.stackable_with_promotions,
        r.stackable_with_other_rebates,
        r.max_claims_per_customer,
        rp.min_quantity,
        rp.max_quantity,
        rp.override_amount,
        p.name as product_name,
        p.price as product_price,
        p.sku,
        EXTRACT(DAY FROM r.valid_to - NOW()) as days_remaining
      FROM rebates r
      INNER JOIN rebate_products rp ON r.id = rp.rebate_id
      LEFT JOIN products p ON rp.product_id = p.id
      LEFT JOIN categories c ON rp.category_id = c.id
      WHERE r.is_active = true
        AND NOW() BETWEEN r.valid_from AND r.valid_to
        AND (r.max_total_claims IS NULL OR r.current_claim_count < r.max_total_claims)
        AND (
          rp.product_id = $1
          OR rp.category_id = (SELECT category_id FROM products WHERE id = $1)
          OR (SELECT sku FROM products WHERE id = $1) LIKE rp.sku_pattern
        )
      ORDER BY r.rebate_type, r.amount DESC
    `;

    const result = await this.db.query(query, [productId]);

    return result.rows.map(row => this._formatRebateDetails(row));
  }

  // ============================================================================
  // GET CART REBATES
  // Analyze entire cart for applicable rebates
  // ============================================================================

  async getCartRebates(cartItems) {
    if (!cartItems || cartItems.length === 0) {
      return {
        instantRebates: [],
        mailInRebates: [],
        onlineRebates: [],
        totalInstantSavings: 0,
        totalMailInSavings: 0,
        totalOnlineSavings: 0,
        totalPotentialSavings: 0,
      };
    }

    const productIds = cartItems.map(item => item.productId || item.product_id);
    const quantities = {};
    cartItems.forEach(item => {
      const pid = item.productId || item.product_id;
      quantities[pid] = (quantities[pid] || 0) + (item.quantity || 1);
    });

    // Get all active rebates for cart products
    const query = `
      WITH cart_products AS (
        SELECT
          p.id as product_id,
          p.name as product_name,
          p.price as product_price,
          p.sku,
          p.category_id
        FROM products p
        WHERE p.id = ANY($1)
      )
      SELECT DISTINCT
        r.id as rebate_id,
        r.name as rebate_name,
        r.description,
        r.rebate_type,
        r.amount,
        r.amount_type,
        r.max_rebate_amount,
        r.manufacturer,
        r.valid_to,
        r.terms_url,
        r.submission_url,
        r.requires_upc,
        r.requires_receipt,
        r.requires_registration,
        r.claim_deadline_days,
        r.stackable_with_promotions,
        r.stackable_with_other_rebates,
        rp.min_quantity,
        rp.max_quantity,
        rp.override_amount,
        cp.product_id,
        cp.product_name,
        cp.product_price,
        cp.sku,
        EXTRACT(DAY FROM r.valid_to - NOW())::INTEGER as days_remaining
      FROM rebates r
      INNER JOIN rebate_products rp ON r.id = rp.rebate_id
      INNER JOIN cart_products cp ON (
        rp.product_id = cp.product_id
        OR rp.category_id = cp.category_id
        OR cp.sku LIKE COALESCE(rp.sku_pattern, '')
      )
      WHERE r.is_active = true
        AND NOW() BETWEEN r.valid_from AND r.valid_to
        AND (r.max_total_claims IS NULL OR r.current_claim_count < r.max_total_claims)
      ORDER BY r.rebate_type, r.amount DESC
    `;

    const result = await this.db.query(query, [productIds]);

    const instantRebates = [];
    const mailInRebates = [];
    const onlineRebates = [];
    const appliedRebateIds = new Set();

    for (const row of result.rows) {
      const quantity = quantities[row.product_id] || 1;
      const minQty = row.min_quantity || 1;

      // Check quantity requirement
      if (quantity < minQty) {
        continue;
      }

      // Calculate rebate amount
      const eligibleQty = row.max_quantity
        ? Math.min(quantity, row.max_quantity)
        : quantity;

      const unitRebate = this._calculateRebateAmount(
        row.override_amount || row.amount,
        row.amount_type,
        row.product_price,
        row.max_rebate_amount
      );

      const totalRebate = unitRebate * eligibleQty;

      // Check stacking rules
      if (!row.stackable_with_other_rebates && appliedRebateIds.has(row.product_id)) {
        continue;
      }

      const rebateInfo = {
        rebateId: row.rebate_id,
        productId: row.product_id,
        productName: row.product_name,
        manufacturer: row.manufacturer,
        rebateName: row.rebate_name,
        description: row.description,
        amount: totalRebate,
        unitAmount: unitRebate,
        quantity: eligibleQty,
        daysRemaining: row.days_remaining,
        stackableWithPromotions: row.stackable_with_promotions,
      };

      if (row.rebate_type === 'instant') {
        instantRebates.push({
          ...rebateInfo,
          applied: false, // Will be set to true when actually applied
        });
      } else if (row.rebate_type === 'mail_in') {
        mailInRebates.push({
          ...rebateInfo,
          deadline: this._calculateDeadline(row.claim_deadline_days),
          deadlineDays: row.claim_deadline_days,
          submissionUrl: row.submission_url,
          termsUrl: row.terms_url,
          requiresUpc: row.requires_upc,
          requiresReceipt: row.requires_receipt,
          instructions: this._generateMailInInstructions(row),
        });
      } else if (row.rebate_type === 'online') {
        onlineRebates.push({
          ...rebateInfo,
          deadline: this._calculateDeadline(row.claim_deadline_days),
          deadlineDays: row.claim_deadline_days,
          submissionUrl: row.submission_url,
          termsUrl: row.terms_url,
          requiresRegistration: row.requires_registration,
          instructions: this._generateOnlineInstructions(row),
        });
      }

      appliedRebateIds.add(row.product_id);
    }

    const totalInstantSavings = instantRebates.reduce((sum, r) => sum + r.amount, 0);
    const totalMailInSavings = mailInRebates.reduce((sum, r) => sum + r.amount, 0);
    const totalOnlineSavings = onlineRebates.reduce((sum, r) => sum + r.amount, 0);

    return {
      instantRebates,
      mailInRebates,
      onlineRebates,
      totalInstantSavings: Math.round(totalInstantSavings * 100) / 100,
      totalMailInSavings: Math.round(totalMailInSavings * 100) / 100,
      totalOnlineSavings: Math.round(totalOnlineSavings * 100) / 100,
      totalPotentialSavings: Math.round(
        (totalInstantSavings + totalMailInSavings + totalOnlineSavings) * 100
      ) / 100,
    };
  }

  // ============================================================================
  // APPLY INSTANT REBATE
  // Apply instant rebate as a line-level discount
  // ============================================================================

  async applyInstantRebate(transactionId, rebateId, productId, userId) {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Validate rebate is active and eligible
      const rebateQuery = `
        SELECT
          r.*,
          rp.min_quantity,
          rp.max_quantity,
          rp.override_amount
        FROM rebates r
        INNER JOIN rebate_products rp ON r.id = rp.rebate_id
        WHERE r.id = $1
          AND r.is_active = true
          AND r.rebate_type = 'instant'
          AND NOW() BETWEEN r.valid_from AND r.valid_to
          AND (r.max_total_claims IS NULL OR r.current_claim_count < r.max_total_claims)
          AND (
            rp.product_id = $2
            OR rp.category_id = (SELECT category_id FROM products WHERE id = $2)
          )
        LIMIT 1
      `;

      const rebateResult = await client.query(rebateQuery, [rebateId, productId]);

      if (rebateResult.rows.length === 0) {
        throw new Error('Rebate not found or not eligible for this product');
      }

      const rebate = rebateResult.rows[0];

      // Get transaction item details
      const itemQuery = `
        SELECT ti.*, p.price as unit_price
        FROM transaction_items ti
        JOIN products p ON ti.product_id = p.id
        WHERE ti.transaction_id = $1 AND ti.product_id = $2
      `;

      const itemResult = await client.query(itemQuery, [transactionId, productId]);

      if (itemResult.rows.length === 0) {
        throw new Error('Product not found in transaction');
      }

      const item = itemResult.rows[0];

      // Check quantity requirement
      if (item.quantity < (rebate.min_quantity || 1)) {
        throw new Error(`Minimum quantity of ${rebate.min_quantity} required for this rebate`);
      }

      // Check if rebate already applied
      const existingQuery = `
        SELECT id FROM applied_rebates
        WHERE transaction_id = $1 AND rebate_id = $2 AND product_id = $3
      `;

      const existingResult = await client.query(existingQuery, [transactionId, rebateId, productId]);

      if (existingResult.rows.length > 0) {
        throw new Error('Rebate already applied to this transaction');
      }

      // Calculate rebate amount
      const eligibleQty = rebate.max_quantity
        ? Math.min(item.quantity, rebate.max_quantity)
        : item.quantity;

      const unitRebate = this._calculateRebateAmount(
        rebate.override_amount || rebate.amount,
        rebate.amount_type,
        item.unit_price,
        rebate.max_rebate_amount
      );

      const totalRebate = unitRebate * eligibleQty;

      // Record applied rebate
      const applyQuery = `
        INSERT INTO applied_rebates (
          transaction_id, rebate_id, product_id, rebate_amount, quantity, is_instant
        ) VALUES ($1, $2, $3, $4, $5, true)
        RETURNING id
      `;

      const applyResult = await client.query(applyQuery, [
        transactionId,
        rebateId,
        productId,
        totalRebate,
        eligibleQty,
      ]);

      // Update transaction item with discount (if discount column exists)
      const updateItemQuery = `
        UPDATE transaction_items
        SET
          discount_amount = COALESCE(discount_amount, 0) + $1,
          discount_reason = COALESCE(discount_reason || '; ', '') || $2
        WHERE transaction_id = $3 AND product_id = $4
      `;

      await client.query(updateItemQuery, [
        totalRebate,
        `Manufacturer Rebate: ${rebate.name}`,
        transactionId,
        productId,
      ]);

      // Update rebate claim count
      await client.query(
        'UPDATE rebates SET current_claim_count = current_claim_count + 1 WHERE id = $1',
        [rebateId]
      );

      await client.query('COMMIT');

      return {
        success: true,
        appliedRebateId: applyResult.rows[0].id,
        rebateId,
        productId,
        amount: totalRebate,
        quantity: eligibleQty,
        rebateName: rebate.name,
        manufacturer: rebate.manufacturer,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // CREATE REBATE CLAIM
  // Create tracking record for mail-in/online rebates
  // ============================================================================

  async createRebateClaim(orderId, rebateId, customerId, options = {}) {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Get rebate details
      const rebateQuery = `
        SELECT * FROM rebates
        WHERE id = $1
          AND is_active = true
          AND rebate_type IN ('mail_in', 'online')
          AND NOW() BETWEEN valid_from AND valid_to
      `;

      const rebateResult = await client.query(rebateQuery, [rebateId]);

      if (rebateResult.rows.length === 0) {
        throw new Error('Rebate not found or not eligible for claims');
      }

      const rebate = rebateResult.rows[0];

      // Check customer claim limit
      if (rebate.max_claims_per_customer) {
        const customerClaimsQuery = `
          SELECT COUNT(*) as claim_count
          FROM rebate_claims
          WHERE rebate_id = $1 AND customer_id = $2
        `;

        const claimsResult = await client.query(customerClaimsQuery, [rebateId, customerId]);

        if (parseInt(claimsResult.rows[0].claim_count) >= rebate.max_claims_per_customer) {
          throw new Error(`Maximum ${rebate.max_claims_per_customer} claims per customer exceeded`);
        }
      }

      // Get order details for calculating rebate amount
      const orderQuery = `
        SELECT
          o.id,
          o.customer_id,
          oi.product_id,
          oi.quantity,
          oi.unit_price,
          p.name as product_name
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        JOIN products p ON oi.product_id = p.id
        JOIN rebate_products rp ON (
          rp.rebate_id = $1
          AND (
            rp.product_id = oi.product_id
            OR rp.category_id = p.category_id
          )
        )
        WHERE o.id = $2
      `;

      const orderResult = await client.query(orderQuery, [rebateId, orderId]);

      if (orderResult.rows.length === 0) {
        throw new Error('No eligible products found in order for this rebate');
      }

      // Calculate total rebate amount
      let totalRebateAmount = 0;
      let totalQuantity = 0;

      for (const item of orderResult.rows) {
        const unitRebate = this._calculateRebateAmount(
          rebate.amount,
          rebate.amount_type,
          item.unit_price,
          rebate.max_rebate_amount
        );
        totalRebateAmount += unitRebate * item.quantity;
        totalQuantity += item.quantity;
      }

      // Get customer info
      const customerQuery = `
        SELECT name, email, phone, address, city, state, postal_code
        FROM customers
        WHERE id = $1
      `;

      const customerResult = await client.query(customerQuery, [customerId]);
      const customer = customerResult.rows[0] || {};

      // Create the claim
      const claimQuery = `
        INSERT INTO rebate_claims (
          rebate_id,
          order_id,
          customer_id,
          claim_status,
          rebate_amount,
          quantity,
          customer_name,
          customer_email,
          customer_phone,
          mailing_address,
          submission_method,
          customer_notes
        ) VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const mailingAddress = customer.address
        ? `${customer.address}, ${customer.city}, ${customer.state} ${customer.postal_code}`
        : options.mailingAddress;

      const claimResult = await client.query(claimQuery, [
        rebateId,
        orderId,
        customerId,
        totalRebateAmount,
        totalQuantity,
        customer.name || options.customerName,
        customer.email || options.customerEmail,
        customer.phone || options.customerPhone,
        mailingAddress,
        rebate.rebate_type === 'mail_in' ? 'mail' : 'online',
        options.notes,
      ]);

      const claim = claimResult.rows[0];

      // Record in applied_rebates for tracking
      await client.query(`
        INSERT INTO applied_rebates (order_id, rebate_id, rebate_amount, quantity, is_instant, claim_id)
        VALUES ($1, $2, $3, $4, false, $5)
      `, [orderId, rebateId, totalRebateAmount, totalQuantity, claim.id]);

      await client.query('COMMIT');

      return {
        claimId: claim.id,
        rebateId,
        orderId,
        customerId,
        status: 'pending',
        rebateAmount: totalRebateAmount,
        quantity: totalQuantity,
        rebateName: rebate.name,
        manufacturer: rebate.manufacturer,
        rebateType: rebate.rebate_type,
        submissionUrl: rebate.submission_url,
        termsUrl: rebate.terms_url,
        deadline: this._calculateDeadline(rebate.claim_deadline_days),
        deadlineDays: rebate.claim_deadline_days,
        requiresUpc: rebate.requires_upc,
        requiresReceipt: rebate.requires_receipt,
        requiresRegistration: rebate.requires_registration,
        instructions: rebate.rebate_type === 'mail_in'
          ? this._generateMailInInstructions(rebate)
          : this._generateOnlineInstructions(rebate),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // GET CUSTOMER REBATE CLAIMS
  // Show customer their pending rebates and deadlines
  // ============================================================================

  async getCustomerRebateClaims(customerId, options = {}) {
    const { status, includeExpired = false } = options;

    let whereClause = 'WHERE rc.customer_id = $1';
    const params = [customerId];

    if (status) {
      params.push(status);
      whereClause += ` AND rc.claim_status = $${params.length}`;
    }

    if (!includeExpired) {
      whereClause += ` AND rc.claim_status != 'expired'`;
    }

    const query = `
      SELECT
        rc.id as claim_id,
        rc.claim_status as status,
        rc.rebate_amount,
        rc.quantity,
        rc.submitted_at,
        rc.claim_reference,
        rc.processed_at,
        rc.paid_at,
        rc.payment_method,
        rc.denial_reason,
        rc.receipt_uploaded,
        rc.upc_uploaded,
        rc.registration_completed,
        rc.created_at,
        r.id as rebate_id,
        r.name as rebate_name,
        r.description as rebate_description,
        r.rebate_type,
        r.manufacturer,
        r.submission_url,
        r.terms_url,
        r.requires_upc,
        r.requires_receipt,
        r.requires_registration,
        r.claim_deadline_days,
        o.id as order_id,
        o.created_at as order_date,
        -- Calculate deadline from order date
        (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) as submission_deadline,
        EXTRACT(DAY FROM (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) - NOW())::INTEGER as days_until_deadline,
        -- Get products from order
        (
          SELECT json_agg(json_build_object(
            'productId', oi.product_id,
            'productName', p.name,
            'quantity', oi.quantity
          ))
          FROM order_items oi
          JOIN products p ON oi.product_id = p.id
          JOIN rebate_products rp ON (
            rp.rebate_id = r.id
            AND (rp.product_id = oi.product_id OR rp.category_id = p.category_id)
          )
          WHERE oi.order_id = o.id
        ) as products
      FROM rebate_claims rc
      JOIN rebates r ON rc.rebate_id = r.id
      LEFT JOIN orders o ON rc.order_id = o.id
      ${whereClause}
      ORDER BY
        CASE rc.claim_status
          WHEN 'pending' THEN 1
          WHEN 'submitted' THEN 2
          WHEN 'processing' THEN 3
          WHEN 'approved' THEN 4
          WHEN 'paid' THEN 5
          WHEN 'denied' THEN 6
          WHEN 'expired' THEN 7
        END,
        rc.created_at DESC
    `;

    const result = await this.db.query(query, params);

    return result.rows.map(row => ({
      claimId: row.claim_id,
      status: row.status,
      rebateAmount: parseFloat(row.rebate_amount),
      quantity: row.quantity,
      submittedAt: row.submitted_at,
      claimReference: row.claim_reference,
      processedAt: row.processed_at,
      paidAt: row.paid_at,
      paymentMethod: row.payment_method,
      denialReason: row.denial_reason,
      createdAt: row.created_at,
      rebate: {
        rebateId: row.rebate_id,
        name: row.rebate_name,
        description: row.rebate_description,
        type: row.rebate_type,
        manufacturer: row.manufacturer,
        submissionUrl: row.submission_url,
        termsUrl: row.terms_url,
      },
      order: {
        orderId: row.order_id,
        orderDate: row.order_date,
        products: row.products || [],
      },
      deadline: {
        date: row.submission_deadline,
        daysRemaining: row.days_until_deadline,
        isUrgent: row.days_until_deadline <= 7 && row.days_until_deadline > 0,
        isExpired: row.days_until_deadline < 0,
      },
      requirements: {
        upc: { required: row.requires_upc, completed: row.upc_uploaded },
        receipt: { required: row.requires_receipt, completed: row.receipt_uploaded },
        registration: { required: row.requires_registration, completed: row.registration_completed },
      },
      nextSteps: this._getNextSteps(row),
    }));
  }

  // ============================================================================
  // UPDATE CLAIM STATUS
  // Update claim status (for admin/processing)
  // ============================================================================

  async updateClaimStatus(claimId, status, options = {}) {
    const { claimReference, denialReason, paymentMethod, paymentReference, notes, userId } = options;

    const updates = ['claim_status = $2', 'updated_at = NOW()'];
    const params = [claimId, status];
    let paramIndex = 3;

    if (status === 'submitted') {
      updates.push(`submitted_at = NOW()`);
      if (claimReference) {
        updates.push(`claim_reference = $${paramIndex++}`);
        params.push(claimReference);
      }
    }

    if (status === 'approved' || status === 'denied') {
      updates.push(`processed_at = NOW()`);
      updates.push(`processed_by = $${paramIndex++}`);
      params.push(userId);
    }

    if (status === 'denied' && denialReason) {
      updates.push(`denial_reason = $${paramIndex++}`);
      params.push(denialReason);
    }

    if (status === 'paid') {
      updates.push(`paid_at = NOW()`);
      if (paymentMethod) {
        updates.push(`payment_method = $${paramIndex++}`);
        params.push(paymentMethod);
      }
      if (paymentReference) {
        updates.push(`payment_reference = $${paramIndex++}`);
        params.push(paymentReference);
      }
    }

    if (notes) {
      updates.push(`internal_notes = COALESCE(internal_notes || E'\\n', '') || $${paramIndex++}`);
      params.push(`[${new Date().toISOString()}] ${notes}`);
    }

    const query = `
      UPDATE rebate_claims
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.db.query(query, params);

    if (result.rows.length === 0) {
      throw new Error('Claim not found');
    }

    return result.rows[0];
  }

  // ============================================================================
  // GET REBATE BY ID
  // ============================================================================

  async getRebateById(rebateId) {
    const query = `
      SELECT
        r.*,
        json_agg(DISTINCT jsonb_build_object(
          'productId', rp.product_id,
          'categoryId', rp.category_id,
          'skuPattern', rp.sku_pattern,
          'minQuantity', rp.min_quantity,
          'maxQuantity', rp.max_quantity,
          'overrideAmount', rp.override_amount
        )) FILTER (WHERE rp.id IS NOT NULL) as eligible_products
      FROM rebates r
      LEFT JOIN rebate_products rp ON r.id = rp.rebate_id
      WHERE r.id = $1
      GROUP BY r.id
    `;

    const result = await this.db.query(query, [rebateId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this._formatRebateDetails(result.rows[0]);
  }

  // ============================================================================
  // LIST ACTIVE REBATES
  // Get all currently active rebates (for admin/display)
  // ============================================================================

  async listActiveRebates(options = {}) {
    const { manufacturer, rebateType, page = 1, limit = 50 } = options;

    let whereClause = `WHERE r.is_active = true AND NOW() BETWEEN r.valid_from AND r.valid_to`;
    const params = [];
    let paramIndex = 1;

    if (manufacturer) {
      whereClause += ` AND r.manufacturer = $${paramIndex++}`;
      params.push(manufacturer);
    }

    if (rebateType) {
      whereClause += ` AND r.rebate_type = $${paramIndex++}`;
      params.push(rebateType);
    }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const query = `
      SELECT
        r.*,
        COUNT(DISTINCT rp.product_id) as product_count,
        COUNT(DISTINCT rp.category_id) as category_count,
        EXTRACT(DAY FROM r.valid_to - NOW())::INTEGER as days_remaining
      FROM rebates r
      LEFT JOIN rebate_products rp ON r.id = rp.rebate_id
      ${whereClause}
      GROUP BY r.id
      ORDER BY r.rebate_type, r.valid_to
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM rebates r
      ${whereClause}
    `;

    const [dataResult, countResult] = await Promise.all([
      this.db.query(query, params),
      this.db.query(countQuery, params.slice(0, -2)),
    ]);

    return {
      rebates: dataResult.rows.map(row => this._formatRebateDetails(row)),
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
      },
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  _calculateRebateAmount(amount, amountType, productPrice, maxAmount) {
    let rebateAmount;

    if (amountType === 'percent') {
      // FIX: Use integer arithmetic to avoid floating-point precision issues
      // Calculate as cents first, then round
      rebateAmount = Math.round(productPrice * amount) / 100;
      if (maxAmount && rebateAmount > maxAmount) {
        rebateAmount = maxAmount;
      }
    } else {
      rebateAmount = amount;
    }

    // Return with 2 decimal place precision for currency
    return Math.round(rebateAmount * 100) / 100;
  }

  _calculateDeadline(daysFromNow) {
    if (!daysFromNow) return null;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + daysFromNow);
    return deadline.toISOString();
  }

  _formatRebateDetails(row) {
    return {
      rebateId: row.rebate_id || row.id,
      name: row.name || row.rebate_name,
      description: row.description,
      rebateType: row.rebate_type,
      amount: parseFloat(row.amount),
      amountType: row.amount_type,
      maxRebateAmount: row.max_rebate_amount ? parseFloat(row.max_rebate_amount) : null,
      manufacturer: row.manufacturer,
      manufacturerCode: row.manufacturer_rebate_code,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      daysRemaining: row.days_remaining,
      termsUrl: row.terms_url,
      submissionUrl: row.submission_url,
      requirements: {
        upc: row.requires_upc,
        receipt: row.requires_receipt,
        registration: row.requires_registration,
        minQuantity: row.min_quantity || 1,
        maxQuantity: row.max_quantity,
      },
      claimDeadlineDays: row.claim_deadline_days,
      stacking: {
        withPromotions: row.stackable_with_promotions,
        withOtherRebates: row.stackable_with_other_rebates,
      },
      limits: {
        perCustomer: row.max_claims_per_customer,
        total: row.max_total_claims,
        currentCount: row.current_claim_count,
      },
      product: row.product_id ? {
        productId: row.product_id,
        productName: row.product_name,
        price: parseFloat(row.product_price || 0),
        sku: row.sku,
      } : null,
      eligibleProducts: row.eligible_products,
    };
  }

  _generateMailInInstructions(rebate) {
    const steps = ['Complete your purchase'];

    if (rebate.requires_receipt) {
      steps.push('Keep your original receipt');
    }

    if (rebate.requires_upc) {
      steps.push('Cut out the UPC barcode from the product packaging');
    }

    steps.push(`Visit ${rebate.submission_url || 'the manufacturer website'} to download the rebate form`);
    steps.push('Fill out the rebate form completely');
    steps.push(`Mail all required documents within ${rebate.claim_deadline_days || 30} days of purchase`);
    steps.push('Allow 6-8 weeks for processing');

    return {
      steps,
      requiredDocuments: [
        rebate.requires_receipt && 'Original receipt or copy',
        rebate.requires_upc && 'UPC barcode from packaging',
        'Completed rebate form',
      ].filter(Boolean),
      processingTime: '6-8 weeks',
      paymentMethod: 'Prepaid Visa card or check',
    };
  }

  _generateOnlineInstructions(rebate) {
    const steps = ['Complete your purchase'];

    if (rebate.requires_registration) {
      steps.push('Register your product on the manufacturer website');
    }

    steps.push(`Visit ${rebate.submission_url || 'the manufacturer website'}`);

    if (rebate.requires_receipt) {
      steps.push('Upload a photo or scan of your receipt');
    }

    steps.push('Enter your product serial number');
    steps.push(`Submit within ${rebate.claim_deadline_days || 30} days of purchase`);

    return {
      steps,
      requiredDocuments: [
        rebate.requires_receipt && 'Digital copy of receipt',
        'Product serial number',
        rebate.requires_registration && 'Product registration confirmation',
      ].filter(Boolean),
      processingTime: '2-4 weeks',
      paymentMethod: 'Direct deposit or prepaid card',
    };
  }

  _getNextSteps(claim) {
    const steps = [];

    if (claim.status === 'pending') {
      if (claim.requires_receipt && !claim.receipt_uploaded) {
        steps.push({ action: 'upload_receipt', label: 'Upload your receipt' });
      }
      if (claim.requires_upc && !claim.upc_uploaded) {
        steps.push({ action: 'upload_upc', label: 'Upload UPC barcode' });
      }
      if (claim.requires_registration && !claim.registration_completed) {
        steps.push({ action: 'register_product', label: 'Register your product' });
      }
      if (steps.length === 0) {
        steps.push({ action: 'submit_claim', label: 'Submit your claim', url: claim.submission_url });
      }
    } else if (claim.status === 'submitted') {
      steps.push({ action: 'wait', label: 'Claim is being processed' });
    } else if (claim.status === 'approved') {
      steps.push({ action: 'wait', label: 'Payment is being processed' });
    }

    return steps;
  }
}

module.exports = RebateService;
