/**
 * TeleTime - Customer Pricing Service
 *
 * Handles customer-specific pricing including:
 * - Pricing tier discounts (retail, wholesale, VIP, etc.)
 * - Customer-specific product/category pricing
 * - Volume discounts
 * - Price override workflow with approval
 * - Audit logging
 */

class CustomerPricingService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
    this.CACHE_TTL = 300; // 5 minutes
  }

  // ============================================================================
  // CUSTOMER PRICING LOOKUP
  // ============================================================================

  /**
   * Get customer's pricing tier and configuration
   * @param {number} customerId
   * @returns {object} Customer pricing info
   */
  async getCustomerPricingInfo(customerId) {
    if (!customerId) {
      return this._getDefaultPricingInfo();
    }

    const cacheKey = `customer_pricing:${customerId}`;
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    const result = await this.pool.query(
      `SELECT
        c.customer_id,
        c.name as customer_name,
        c.pricing_tier,
        c.default_discount_percent,
        c.cost_plus_margin_percent,
        c.show_cost_pricing,
        c.credit_limit_cents,
        ptc.display_name as tier_name,
        ptc.base_discount_percent as tier_base_discount,
        ptc.can_see_cost,
        ptc.requires_approval_over_percent,
        ptc.max_additional_discount_percent,
        ptc.volume_discount_eligible
      FROM customers c
      LEFT JOIN pricing_tier_config ptc ON c.pricing_tier = ptc.tier
      WHERE c.customer_id = $1`,
      [customerId]
    );

    if (result.rows.length === 0) {
      return this._getDefaultPricingInfo();
    }

    const row = result.rows[0];
    const info = {
      customerId: row.customer_id,
      customerName: row.customer_name,
      pricingTier: row.pricing_tier || 'retail',
      tierName: row.tier_name || 'Retail',
      tierBaseDiscount: parseFloat(row.tier_base_discount || 0),
      customerDiscount: parseFloat(row.default_discount_percent || 0),
      effectiveDiscount: Math.max(
        parseFloat(row.tier_base_discount || 0),
        parseFloat(row.default_discount_percent || 0)
      ),
      costPlusMargin: row.cost_plus_margin_percent
        ? parseFloat(row.cost_plus_margin_percent)
        : null,
      canSeeCost: row.can_see_cost || row.show_cost_pricing || false,
      creditLimitCents: row.credit_limit_cents,
      requiresApprovalOverPercent: parseFloat(row.requires_approval_over_percent || 15),
      maxAdditionalDiscount: parseFloat(row.max_additional_discount_percent || 10),
      volumeDiscountEligible: row.volume_discount_eligible !== false,
    };

    if (this.cache) {
      this.cache.set(cacheKey, info, this.CACHE_TTL);
    }

    return info;
  }

  /**
   * Get default pricing info for non-customers
   */
  _getDefaultPricingInfo() {
    return {
      customerId: null,
      customerName: null,
      pricingTier: 'retail',
      tierName: 'Retail',
      tierBaseDiscount: 0,
      customerDiscount: 0,
      effectiveDiscount: 0,
      costPlusMargin: null,
      canSeeCost: false,
      creditLimitCents: null,
      requiresApprovalOverPercent: 15,
      maxAdditionalDiscount: 10,
      volumeDiscountEligible: true,
    };
  }

  // ============================================================================
  // PRICE CALCULATION
  // ============================================================================

  /**
   * Calculate customer-specific price for a product
   * @param {number} customerId - Customer ID (null for retail)
   * @param {number} productId - Product ID
   * @param {number} quantity - Quantity for volume pricing
   * @returns {object} Price breakdown
   */
  async calculateCustomerPrice(customerId, productId, quantity = 1) {
    // Use database function for complex calculation
    const result = await this.pool.query(
      `SELECT * FROM calculate_customer_price($1, $2, $3)`,
      [customerId, productId, quantity]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const basePriceCents = row.base_price_cents;
    const customerPriceCents = row.customer_price_cents;
    const discountPercent = parseFloat(row.discount_percent || 0);
    const volumeDiscountPercent = parseFloat(row.volume_discount_percent || 0);
    const totalDiscountPercent = parseFloat(row.total_discount_percent || 0);

    return {
      productId,
      customerId,
      quantity,
      basePriceCents,
      customerPriceCents,
      savingsCents: basePriceCents - customerPriceCents,
      savingsPercent: basePriceCents > 0
        ? ((basePriceCents - customerPriceCents) / basePriceCents) * 100
        : 0,
      discountPercent,
      volumeDiscountPercent,
      totalDiscountPercent,
      pricingSource: row.pricing_source,
      // Formatted values
      basePrice: basePriceCents / 100,
      customerPrice: customerPriceCents / 100,
      savings: (basePriceCents - customerPriceCents) / 100,
    };
  }

  /**
   * Calculate prices for multiple products
   * @param {number} customerId
   * @param {Array<{productId, quantity}>} items
   * @returns {Array} Price breakdowns
   */
  async calculateBulkPrices(customerId, items) {
    const prices = await Promise.all(
      items.map((item) =>
        this.calculateCustomerPrice(customerId, item.productId, item.quantity)
      )
    );

    const validPrices = prices.filter((p) => p !== null);

    // Calculate totals
    const totals = validPrices.reduce(
      (acc, p) => ({
        baseTotalCents: acc.baseTotalCents + p.basePriceCents * p.quantity,
        customerTotalCents:
          acc.customerTotalCents + p.customerPriceCents * p.quantity,
        totalSavingsCents: acc.totalSavingsCents + p.savingsCents * p.quantity,
      }),
      { baseTotalCents: 0, customerTotalCents: 0, totalSavingsCents: 0 }
    );

    return {
      items: validPrices,
      totals: {
        ...totals,
        baseTotal: totals.baseTotalCents / 100,
        customerTotal: totals.customerTotalCents / 100,
        totalSavings: totals.totalSavingsCents / 100,
        savingsPercent:
          totals.baseTotalCents > 0
            ? (totals.totalSavingsCents / totals.baseTotalCents) * 100
            : 0,
      },
    };
  }

  // ============================================================================
  // CUSTOMER-SPECIFIC PRICING RULES
  // ============================================================================

  /**
   * Get customer's specific product prices
   */
  async getCustomerProductPrices(customerId) {
    const result = await this.pool.query(
      `SELECT
        cpp.id,
        cpp.product_id,
        p.name as product_name,
        p.sku as product_sku,
        p.price as base_price_cents,
        cpp.pricing_type,
        cpp.fixed_price_cents,
        cpp.discount_percent,
        cpp.cost_plus_percent,
        cpp.effective_from,
        cpp.effective_to,
        cpp.notes
      FROM customer_product_pricing cpp
      JOIN products p ON cpp.product_id = p.product_id
      WHERE cpp.customer_id = $1
        AND cpp.effective_from <= CURRENT_DATE
        AND (cpp.effective_to IS NULL OR cpp.effective_to >= CURRENT_DATE)
      ORDER BY p.name`,
      [customerId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      productSku: row.product_sku,
      basePriceCents: row.base_price_cents,
      pricingType: row.pricing_type,
      fixedPriceCents: row.fixed_price_cents,
      discountPercent: row.discount_percent
        ? parseFloat(row.discount_percent)
        : null,
      costPlusPercent: row.cost_plus_percent
        ? parseFloat(row.cost_plus_percent)
        : null,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      notes: row.notes,
    }));
  }

  /**
   * Set customer-specific product price
   */
  async setCustomerProductPrice(customerId, productId, pricing, userId) {
    const {
      pricingType,
      fixedPriceCents,
      discountPercent,
      costPlusPercent,
      effectiveFrom,
      effectiveTo,
      notes,
    } = pricing;

    // Use transaction to atomically expire old pricing and insert new
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Expire existing pricing
      await client.query(
        `UPDATE customer_product_pricing
         SET effective_to = CURRENT_DATE - INTERVAL '1 day'
         WHERE customer_id = $1
           AND product_id = $2
           AND effective_to IS NULL`,
        [customerId, productId]
      );

      // Insert new pricing
      const result = await client.query(
        `INSERT INTO customer_product_pricing (
          customer_id, product_id, pricing_type,
          fixed_price_cents, discount_percent, cost_plus_percent,
          effective_from, effective_to, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id`,
        [
          customerId,
          productId,
          pricingType,
          fixedPriceCents || null,
          discountPercent || null,
          costPlusPercent || null,
          effectiveFrom || 'CURRENT_DATE',
          effectiveTo || null,
          notes || null,
          userId,
        ]
      );

      await client.query('COMMIT');

      // Invalidate cache
      this._invalidateCustomerCache(customerId);

      return { id: result.rows[0].id, success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Remove customer-specific product price
   */
  async removeCustomerProductPrice(customerId, productId, userId) {
    await this.pool.query(
      `UPDATE customer_product_pricing
       SET effective_to = CURRENT_DATE - INTERVAL '1 day'
       WHERE customer_id = $1
         AND product_id = $2
         AND effective_to IS NULL`,
      [customerId, productId]
    );

    this._invalidateCustomerCache(customerId);

    return { success: true };
  }

  // ============================================================================
  // PRICE OVERRIDE WORKFLOW
  // ============================================================================

  /**
   * Check if a price override requires approval
   */
  async checkOverrideRequiresApproval(
    customerId,
    originalPriceCents,
    overridePriceCents
  ) {
    const discountPercent =
      ((originalPriceCents - overridePriceCents) / originalPriceCents) * 100;

    const result = await this.pool.query(
      `SELECT check_override_requires_approval($1, $2) as requires_approval`,
      [customerId, discountPercent]
    );

    const pricingInfo = await this.getCustomerPricingInfo(customerId);

    return {
      requiresApproval: result.rows[0].requires_approval,
      discountPercent,
      threshold: pricingInfo.requiresApprovalOverPercent,
      maxAllowed: pricingInfo.maxAdditionalDiscount,
      exceedsMax:
        discountPercent >
        pricingInfo.effectiveDiscount + pricingInfo.maxAdditionalDiscount,
    };
  }

  /**
   * Request a price override
   */
  async requestPriceOverride(data) {
    const {
      transactionId,
      quoteId,
      productId,
      customerId,
      originalPriceCents,
      customerTierPriceCents,
      overridePriceCents,
      overrideReason,
      userId,
      ipAddress,
      sessionId,
    } = data;

    // Calculate discount and check approval requirement
    const discountPercent =
      ((originalPriceCents - overridePriceCents) / originalPriceCents) * 100;

    const approvalCheck = await this.checkOverrideRequiresApproval(
      customerId,
      originalPriceCents,
      overridePriceCents
    );

    // Get product cost for margin impact
    const productResult = await this.pool.query(
      `SELECT cost FROM products WHERE product_id = $1`,
      [productId]
    );
    const costCents = productResult.rows[0]?.cost
      ? Math.round(productResult.rows[0].cost * 100)
      : null;

    const marginImpactCents = costCents
      ? (customerTierPriceCents || originalPriceCents) -
        overridePriceCents
      : null;

    const result = await this.pool.query(
      `INSERT INTO price_override_log (
        transaction_id, quote_id, product_id, customer_id,
        original_price_cents, customer_tier_price_cents, override_price_cents,
        override_discount_percent, price_difference_cents, margin_impact_cents,
        override_reason, requires_approval, status,
        created_by, ip_address, session_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, status, requires_approval`,
      [
        transactionId || null,
        quoteId || null,
        productId,
        customerId,
        originalPriceCents,
        customerTierPriceCents || null,
        overridePriceCents,
        discountPercent,
        overridePriceCents - originalPriceCents,
        marginImpactCents,
        overrideReason,
        approvalCheck.requiresApproval,
        approvalCheck.requiresApproval ? 'pending' : 'auto_approved',
        userId,
        ipAddress || null,
        sessionId || null,
      ]
    );

    const override = result.rows[0];

    return {
      overrideId: override.id,
      status: override.status,
      requiresApproval: override.requires_approval,
      discountPercent,
      approvalCheck,
    };
  }

  /**
   * Approve a pending price override
   */
  async approveOverride(overrideId, approverId, notes = null) {
    const result = await this.pool.query(
      `UPDATE price_override_log
       SET status = 'approved',
           approved_by = $2,
           approved_at = NOW(),
           approval_notes = $3
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [overrideId, approverId, notes]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Override not found or already processed' };
    }

    return { success: true, override: this._formatOverride(result.rows[0]) };
  }

  /**
   * Reject a pending price override
   */
  async rejectOverride(overrideId, approverId, reason) {
    const result = await this.pool.query(
      `UPDATE price_override_log
       SET status = 'rejected',
           approved_by = $2,
           approved_at = NOW(),
           approval_notes = $3
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [overrideId, approverId, reason]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Override not found or already processed' };
    }

    return { success: true, override: this._formatOverride(result.rows[0]) };
  }

  /**
   * Get pending overrides for approval
   */
  async getPendingOverrides(options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await this.pool.query(
      `SELECT
        pol.*,
        p.name as product_name,
        p.sku as product_sku,
        c.name as customer_name,
        c.pricing_tier,
        u.first_name || ' ' || u.last_name as requested_by_name
      FROM price_override_log pol
      JOIN products p ON pol.product_id = p.product_id
      LEFT JOIN customers c ON pol.customer_id = c.customer_id
      JOIN users u ON pol.created_by = u.user_id
      WHERE pol.status = 'pending'
      ORDER BY pol.created_at ASC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows.map((row) => this._formatOverride(row));
  }

  /**
   * Get override history
   */
  async getOverrideHistory(options = {}) {
    const {
      customerId,
      productId,
      userId,
      status,
      startDate,
      endDate,
      limit = 100,
      offset = 0,
    } = options;

    let whereClause = '1=1';
    const params = [];
    let paramIndex = 1;

    if (customerId) {
      whereClause += ` AND pol.customer_id = $${paramIndex}`;
      params.push(customerId);
      paramIndex++;
    }

    if (productId) {
      whereClause += ` AND pol.product_id = $${paramIndex}`;
      params.push(productId);
      paramIndex++;
    }

    if (userId) {
      whereClause += ` AND pol.created_by = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (status) {
      whereClause += ` AND pol.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (startDate) {
      whereClause += ` AND pol.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND pol.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    const result = await this.pool.query(
      `SELECT
        pol.*,
        p.name as product_name,
        p.sku as product_sku,
        c.name as customer_name,
        c.pricing_tier,
        u_created.first_name || ' ' || u_created.last_name as requested_by_name,
        u_approved.first_name || ' ' || u_approved.last_name as approved_by_name
      FROM price_override_log pol
      JOIN products p ON pol.product_id = p.product_id
      LEFT JOIN customers c ON pol.customer_id = c.customer_id
      JOIN users u_created ON pol.created_by = u_created.user_id
      LEFT JOIN users u_approved ON pol.approved_by = u_approved.user_id
      WHERE ${whereClause}
      ORDER BY pol.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return result.rows.map((row) => this._formatOverride(row));
  }

  // ============================================================================
  // VOLUME PRICING
  // ============================================================================

  /**
   * Get applicable volume discounts for a product/customer
   */
  async getVolumeDiscounts(productId, customerId = null) {
    // Get product category
    const productResult = await this.pool.query(
      `SELECT category_id FROM products WHERE product_id = $1`,
      [productId]
    );

    if (productResult.rows.length === 0) {
      return [];
    }

    const categoryId = productResult.rows[0].category_id;

    // Get customer tier
    let customerTier = null;
    if (customerId) {
      const customerResult = await this.pool.query(
        `SELECT pricing_tier FROM customers WHERE customer_id = $1`,
        [customerId]
      );
      customerTier = customerResult.rows[0]?.pricing_tier;
    }

    const result = await this.pool.query(
      `SELECT
        vpr.*
      FROM volume_pricing_rules vpr
      WHERE vpr.is_active = TRUE
        AND vpr.effective_from <= CURRENT_DATE
        AND (vpr.effective_to IS NULL OR vpr.effective_to >= CURRENT_DATE)
        AND (
          vpr.product_id = $1
          OR vpr.category_id = $2
          OR (vpr.product_id IS NULL AND vpr.category_id IS NULL)
        )
        AND (
          vpr.customer_id = $3
          OR vpr.pricing_tier = $4
          OR (vpr.customer_id IS NULL AND vpr.pricing_tier IS NULL)
        )
      ORDER BY
        CASE WHEN vpr.customer_id IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN vpr.product_id IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN vpr.category_id IS NOT NULL THEN 0 ELSE 1 END,
        vpr.min_quantity ASC`,
      [productId, categoryId, customerId, customerTier]
    );

    return result.rows.map((row) => ({
      id: row.id,
      minQuantity: row.min_quantity,
      maxQuantity: row.max_quantity,
      discountPercent: parseFloat(row.discount_percent),
      productId: row.product_id,
      categoryId: row.category_id,
      customerId: row.customer_id,
      pricingTier: row.pricing_tier,
    }));
  }

  // ============================================================================
  // TIER MANAGEMENT
  // ============================================================================

  /**
   * Get all pricing tiers
   */
  async getPricingTiers() {
    const result = await this.pool.query(
      `SELECT * FROM pricing_tier_config ORDER BY base_discount_percent ASC`
    );

    return result.rows.map((row) => ({
      tier: row.tier,
      displayName: row.display_name,
      description: row.description,
      baseDiscountPercent: parseFloat(row.base_discount_percent),
      canSeeCost: row.can_see_cost,
      requiresApprovalOverPercent: parseFloat(row.requires_approval_over_percent),
      maxAdditionalDiscountPercent: parseFloat(row.max_additional_discount_percent),
      volumeDiscountEligible: row.volume_discount_eligible,
    }));
  }

  /**
   * Update customer's pricing tier
   */
  async setCustomerTier(customerId, tier, userId) {
    await this.pool.query(
      `UPDATE customers
       SET pricing_tier = $2, updated_at = NOW()
       WHERE customer_id = $1`,
      [customerId, tier]
    );

    this._invalidateCustomerCache(customerId);

    return { success: true };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Format override row
   */
  _formatOverride(row) {
    return {
      id: row.id,
      transactionId: row.transaction_id,
      quoteId: row.quote_id,
      productId: row.product_id,
      productName: row.product_name,
      productSku: row.product_sku,
      customerId: row.customer_id,
      customerName: row.customer_name,
      pricingTier: row.pricing_tier,
      originalPriceCents: row.original_price_cents,
      customerTierPriceCents: row.customer_tier_price_cents,
      overridePriceCents: row.override_price_cents,
      overrideDiscountPercent: row.override_discount_percent
        ? parseFloat(row.override_discount_percent)
        : null,
      priceDifferenceCents: row.price_difference_cents,
      marginImpactCents: row.margin_impact_cents,
      overrideReason: row.override_reason,
      requiresApproval: row.requires_approval,
      status: row.status,
      requestedBy: row.requested_by_name || null,
      approvedBy: row.approved_by_name || null,
      approvedAt: row.approved_at,
      approvalNotes: row.approval_notes,
      createdAt: row.created_at,
      // Formatted prices
      originalPrice: row.original_price_cents / 100,
      customerTierPrice: row.customer_tier_price_cents
        ? row.customer_tier_price_cents / 100
        : null,
      overridePrice: row.override_price_cents / 100,
      priceDifference: row.price_difference_cents / 100,
    };
  }

  /**
   * Invalidate customer cache
   */
  _invalidateCustomerCache(customerId) {
    if (this.cache) {
      this.cache.invalidatePattern(`customer_pricing:${customerId}`);
    }
  }
}

module.exports = CustomerPricingService;
