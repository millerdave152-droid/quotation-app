/**
 * TeleTime - Volume Discount Service
 *
 * Handles volume/quantity tier pricing for POS and quotes.
 * Pricing priority (highest to lowest):
 * 1. Customer-specific volume tier for this product
 * 2. Customer tier default volume pricing (wholesale, dealer, etc.)
 * 3. Product default volume tiers
 * 4. Base product price
 *
 * Integrates with:
 * - CustomerPricingService for customer tier info
 * - Database functions: get_volume_price(), get_cart_volume_prices()
 */

class VolumeDiscountService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
    this.CACHE_TTL = 60; // 1 minute for volume pricing (changes less frequently)
  }

  // ============================================================================
  // MAIN API - getVolumePrice()
  // ============================================================================

  /**
   * Get volume pricing for a product
   * @param {number} productId - Product ID
   * @param {number} quantity - Quantity being purchased
   * @param {number|null} customerId - Optional customer ID for customer-specific pricing
   * @returns {object} Volume pricing result
   */
  async getVolumePrice(productId, quantity, customerId = null) {
    if (!productId || productId <= 0) {
      return this._createErrorResponse('Invalid product ID');
    }

    if (!quantity || quantity <= 0) {
      return this._createErrorResponse('Invalid quantity');
    }

    // Check cache first
    const cacheKey = `volume_price:${productId}:${quantity}:${customerId || 'null'}`;
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    try {
      // Use optimized database function
      const result = await this.pool.query(
        `SELECT * FROM get_volume_price($1, $2, $3, NULL)`,
        [productId, quantity, customerId]
      );

      if (result.rows.length === 0 || result.rows[0].pricing_source === 'error') {
        return this._createErrorResponse('Product not found');
      }

      const row = result.rows[0];
      const response = this._formatVolumePriceResponse(row, productId, quantity, customerId);

      // Cache the result
      if (this.cache) {
        this.cache.set(cacheKey, response, this.CACHE_TTL);
      }

      return response;
    } catch (error) {
      console.error('[VolumeDiscountService] Error getting volume price:', error);
      return this._createErrorResponse('Failed to calculate volume price');
    }
  }

  /**
   * Get volume pricing for multiple products (batch)
   * @param {Array<{productId, quantity}>} items - Array of items
   * @param {number|null} customerId - Optional customer ID
   * @returns {object} Batch pricing result
   */
  async getCartVolumePrices(items, customerId = null) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return {
        success: false,
        error: 'Items array is required',
        items: [],
        totals: this._createEmptyTotals(),
      };
    }

    try {
      // Format items for database function
      const itemsJson = JSON.stringify(
        items.map(item => ({
          product_id: item.productId,
          quantity: item.quantity,
        }))
      );

      const result = await this.pool.query(
        `SELECT * FROM get_cart_volume_prices($1::jsonb, $2)`,
        [itemsJson, customerId]
      );

      const formattedItems = result.rows.map(row => ({
        productId: row.product_id,
        quantity: row.quantity,
        basePriceCents: row.base_price_cents,
        volumePriceCents: row.volume_price_cents,
        unitPrice: row.volume_price_cents / 100,
        discountPercent: parseFloat(row.discount_percent || 0),
        tierName: row.tier_name,
        lineTotalCents: parseInt(row.line_total_cents),
        lineTotal: parseInt(row.line_total_cents) / 100,
        savingsCents: row.savings_cents,
        savings: row.savings_cents / 100,
      }));

      // Calculate totals
      const totals = formattedItems.reduce(
        (acc, item) => ({
          baseTotalCents: acc.baseTotalCents + (item.basePriceCents * item.quantity),
          volumeTotalCents: acc.volumeTotalCents + item.lineTotalCents,
          totalSavingsCents: acc.totalSavingsCents + (item.savingsCents * item.quantity),
          itemCount: acc.itemCount + item.quantity,
        }),
        { baseTotalCents: 0, volumeTotalCents: 0, totalSavingsCents: 0, itemCount: 0 }
      );

      return {
        success: true,
        customerId,
        items: formattedItems,
        totals: {
          ...totals,
          baseTotal: totals.baseTotalCents / 100,
          volumeTotal: totals.volumeTotalCents / 100,
          totalSavings: totals.totalSavingsCents / 100,
          averageDiscountPercent: totals.baseTotalCents > 0
            ? (totals.totalSavingsCents / totals.baseTotalCents) * 100
            : 0,
        },
      };
    } catch (error) {
      console.error('[VolumeDiscountService] Error getting cart volume prices:', error);
      return {
        success: false,
        error: 'Failed to calculate cart volume prices',
        items: [],
        totals: this._createEmptyTotals(),
      };
    }
  }

  // ============================================================================
  // VOLUME TIER MANAGEMENT
  // ============================================================================

  /**
   * Get all volume tiers for a product
   * @param {number} productId
   * @returns {Array} Volume tiers
   */
  async getProductVolumeTiers(productId) {
    const result = await this.pool.query(
      `SELECT
        pvt.id,
        pvt.min_qty,
        pvt.max_qty,
        pvt.price_cents,
        pvt.discount_percent,
        pvt.tier_name,
        pvt.is_active,
        pvt.created_at,
        pvt.updated_at
      FROM product_volume_tiers pvt
      WHERE pvt.product_id = $1
      ORDER BY pvt.min_qty ASC`,
      [productId]
    );

    return result.rows.map(row => ({
      id: row.id,
      minQty: row.min_qty,
      maxQty: row.max_qty,
      priceCents: row.price_cents,
      discountPercent: row.discount_percent ? parseFloat(row.discount_percent) : null,
      tierName: row.tier_name,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Create a volume tier for a product
   * @param {number} productId
   * @param {object} tierData
   * @param {number} userId - User creating the tier
   * @returns {object} Created tier
   */
  async createProductVolumeTier(productId, tierData, userId) {
    const { minQty, maxQty, priceCents, discountPercent, tierName } = tierData;

    // Validate: must have either priceCents or discountPercent, not both
    if ((priceCents && discountPercent) || (!priceCents && !discountPercent)) {
      throw new Error('Must specify either priceCents or discountPercent, not both');
    }

    const result = await this.pool.query(
      `INSERT INTO product_volume_tiers (
        product_id, min_qty, max_qty, price_cents, discount_percent, tier_name, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [productId, minQty, maxQty || null, priceCents || null, discountPercent || null, tierName || null, userId]
    );

    this._invalidateProductCache(productId);

    return this._formatTier(result.rows[0]);
  }

  /**
   * Update a volume tier
   * @param {number} tierId
   * @param {object} tierData
   * @returns {object} Updated tier
   */
  async updateProductVolumeTier(tierId, tierData) {
    const { minQty, maxQty, priceCents, discountPercent, tierName, isActive } = tierData;

    // Get current tier to know product_id for cache invalidation
    const current = await this.pool.query(
      `SELECT product_id FROM product_volume_tiers WHERE id = $1`,
      [tierId]
    );

    if (current.rows.length === 0) {
      return null;
    }

    const result = await this.pool.query(
      `UPDATE product_volume_tiers
       SET min_qty = COALESCE($2, min_qty),
           max_qty = $3,
           price_cents = $4,
           discount_percent = $5,
           tier_name = COALESCE($6, tier_name),
           is_active = COALESCE($7, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [tierId, minQty, maxQty, priceCents, discountPercent, tierName, isActive]
    );

    this._invalidateProductCache(current.rows[0].product_id);

    return this._formatTier(result.rows[0]);
  }

  /**
   * Delete a volume tier
   * @param {number} tierId
   * @returns {boolean} Success
   */
  async deleteProductVolumeTier(tierId) {
    // Get product_id for cache invalidation
    const current = await this.pool.query(
      `SELECT product_id FROM product_volume_tiers WHERE id = $1`,
      [tierId]
    );

    if (current.rows.length === 0) {
      return false;
    }

    await this.pool.query(
      `DELETE FROM product_volume_tiers WHERE id = $1`,
      [tierId]
    );

    this._invalidateProductCache(current.rows[0].product_id);

    return true;
  }

  // ============================================================================
  // CUSTOMER VOLUME TIERS
  // ============================================================================

  /**
   * Get customer-specific volume tiers
   * @param {number} customerId
   * @param {number|null} productId - Optional product filter
   * @returns {Array} Customer volume tiers
   */
  async getCustomerVolumeTiers(customerId, productId = null) {
    let query = `
      SELECT
        cvt.*,
        p.name as product_name,
        p.model as product_sku,
        c.name as category_name
      FROM customer_volume_tiers cvt
      LEFT JOIN products p ON cvt.product_id = p.id
      LEFT JOIN categories c ON cvt.category_id = c.id
      WHERE cvt.customer_id = $1
        AND cvt.is_active = TRUE
        AND cvt.effective_from <= CURRENT_DATE
        AND (cvt.effective_to IS NULL OR cvt.effective_to >= CURRENT_DATE)
    `;

    const params = [customerId];

    if (productId) {
      query += ` AND (cvt.product_id = $2 OR cvt.product_id IS NULL)`;
      params.push(productId);
    }

    query += ` ORDER BY cvt.min_qty ASC`;

    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      id: row.id,
      customerId: row.customer_id,
      productId: row.product_id,
      productName: row.product_name,
      productSku: row.product_sku,
      categoryId: row.category_id,
      categoryName: row.category_name,
      minQty: row.min_qty,
      maxQty: row.max_qty,
      priceCents: row.price_cents,
      discountPercent: row.discount_percent ? parseFloat(row.discount_percent) : null,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      notes: row.notes,
    }));
  }

  /**
   * Create a customer-specific volume tier
   * @param {number} customerId
   * @param {object} tierData
   * @param {number} userId
   * @returns {object} Created tier
   */
  async createCustomerVolumeTier(customerId, tierData, userId) {
    const {
      productId,
      categoryId,
      minQty,
      maxQty,
      priceCents,
      discountPercent,
      effectiveFrom,
      effectiveTo,
      notes,
    } = tierData;

    const result = await this.pool.query(
      `INSERT INTO customer_volume_tiers (
        customer_id, product_id, category_id, min_qty, max_qty,
        price_cents, discount_percent, effective_from, effective_to, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        customerId,
        productId || null,
        categoryId || null,
        minQty,
        maxQty || null,
        priceCents || null,
        discountPercent || null,
        effectiveFrom || 'CURRENT_DATE',
        effectiveTo || null,
        notes || null,
        userId,
      ]
    );

    this._invalidateCustomerCache(customerId);

    return {
      id: result.rows[0].id,
      success: true,
    };
  }

  // ============================================================================
  // TIER VOLUME OVERRIDES (Customer pricing tier-specific)
  // ============================================================================

  /**
   * Get tier volume overrides
   * @param {string} pricingTier - Pricing tier (wholesale, dealer, etc.)
   * @returns {Array} Tier overrides
   */
  async getTierVolumeOverrides(pricingTier) {
    const result = await this.pool.query(
      `SELECT *
       FROM tier_volume_overrides
       WHERE pricing_tier = $1
         AND is_active = TRUE
         AND effective_from <= CURRENT_DATE
         AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
       ORDER BY priority DESC, min_qty ASC`,
      [pricingTier]
    );

    return result.rows.map(row => ({
      id: row.id,
      productId: row.product_id,
      pricingTier: row.pricing_tier,
      minQty: row.min_qty,
      maxQty: row.max_qty,
      priceCents: row.price_cents,
      discountPercent: row.discount_percent ? parseFloat(row.discount_percent) : null,
      additionalDiscountPercent: row.additional_discount_percent
        ? parseFloat(row.additional_discount_percent)
        : null,
      priority: row.priority,
    }));
  }

  /**
   * Create a tier volume override
   * @param {object} overrideData
   * @param {number} userId
   * @returns {object} Created override
   */
  async createTierVolumeOverride(overrideData, userId) {
    const {
      productId,
      pricingTier,
      minQty,
      maxQty,
      priceCents,
      discountPercent,
      additionalDiscountPercent,
      priority,
      effectiveFrom,
      effectiveTo,
    } = overrideData;

    const result = await this.pool.query(
      `INSERT INTO tier_volume_overrides (
        product_id, pricing_tier, min_qty, max_qty,
        price_cents, discount_percent, additional_discount_percent,
        priority, effective_from, effective_to, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        productId || null,
        pricingTier,
        minQty,
        maxQty || null,
        priceCents || null,
        discountPercent || null,
        additionalDiscountPercent || null,
        priority || 0,
        effectiveFrom || 'CURRENT_DATE',
        effectiveTo || null,
        userId,
      ]
    );

    return {
      id: result.rows[0].id,
      success: true,
    };
  }

  // ============================================================================
  // PRODUCTS WITH VOLUME PRICING
  // ============================================================================

  /**
   * Get products that have volume pricing configured
   * @param {object} options
   * @returns {Array} Products with volume pricing
   */
  async getProductsWithVolumePricing(options = {}) {
    const { limit = 100, offset = 0, onlyActive = true } = options;

    const result = await this.pool.query(
      `SELECT
        p.id as product_id,
        p.name as product_name,
        p.model,
        COALESCE(p.retail_price_cents, (p.price * 100)::INTEGER) as base_price_cents,
        p.has_volume_pricing,
        (SELECT COUNT(*) FROM product_volume_tiers pvt WHERE pvt.product_id = p.id AND pvt.is_active) as tier_count
      FROM products p
      WHERE p.has_volume_pricing = TRUE
        AND ($1 = FALSE OR p.active = TRUE)
      ORDER BY p.name ASC
      LIMIT $2 OFFSET $3`,
      [onlyActive, limit, offset]
    );

    return result.rows.map(row => ({
      productId: row.product_id,
      productName: row.product_name,
      model: row.model,
      basePriceCents: row.base_price_cents,
      basePrice: row.base_price_cents / 100,
      hasVolumePricing: row.has_volume_pricing,
      tierCount: parseInt(row.tier_count),
    }));
  }

  // ============================================================================
  // VOLUME PRICING PREVIEW
  // ============================================================================

  /**
   * Preview volume pricing for a product across all quantity breaks
   * Useful for displaying a volume pricing table in the UI
   * @param {number} productId
   * @param {number|null} customerId
   * @returns {Array} Price at each quantity break
   */
  async previewVolumePricing(productId, customerId = null) {
    // Get all tiers for this product
    const tiers = await this.getProductVolumeTiers(productId);
    const activeTiers = tiers.filter(t => t.isActive);

    if (activeTiers.length === 0) {
      // No volume pricing, return base price
      const basePrice = await this._getProductBasePrice(productId);
      return [{
        minQty: 1,
        maxQty: null,
        unitPriceCents: basePrice,
        unitPrice: basePrice / 100,
        tierName: 'Standard',
        discountPercent: 0,
      }];
    }

    // For each tier, get the actual price (may include customer-specific overrides)
    const previews = await Promise.all(
      activeTiers.map(async (tier) => {
        const price = await this.getVolumePrice(productId, tier.minQty, customerId);
        return {
          minQty: tier.minQty,
          maxQty: tier.maxQty,
          unitPriceCents: price.volumePriceCents,
          unitPrice: price.unitPrice,
          tierName: tier.tierName || price.tierName,
          discountPercent: price.percentOff,
          pricingSource: price.pricingSource,
        };
      })
    );

    return previews;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Format volume price response
   */
  _formatVolumePriceResponse(row, productId, quantity, customerId) {
    const basePriceCents = row.base_price_cents;
    const volumePriceCents = row.volume_price_cents;
    const discountPercent = parseFloat(row.discount_percent || 0);
    const savingsCents = row.savings_cents || (basePriceCents - volumePriceCents);

    return {
      success: true,
      productId,
      quantity,
      customerId,
      // Price info
      basePriceCents,
      volumePriceCents,
      unitPrice: volumePriceCents / 100,
      basePrice: basePriceCents / 100,
      // Discount info
      tierName: row.tier_name || 'Standard',
      percentOff: discountPercent,
      totalDiscount: savingsCents / 100,
      totalDiscountCents: savingsCents,
      // Pricing source for debugging
      pricingSource: row.pricing_source,
      // Line total
      lineTotalCents: volumePriceCents * quantity,
      lineTotal: (volumePriceCents * quantity) / 100,
      // Savings
      savingsPerUnit: savingsCents / 100,
      totalSavings: (savingsCents * quantity) / 100,
    };
  }

  /**
   * Create error response
   */
  _createErrorResponse(error) {
    return {
      success: false,
      error,
      productId: null,
      quantity: null,
      customerId: null,
      basePriceCents: 0,
      volumePriceCents: 0,
      unitPrice: 0,
      tierName: null,
      percentOff: 0,
      totalDiscount: 0,
      pricingSource: 'error',
    };
  }

  /**
   * Create empty totals for error cases
   */
  _createEmptyTotals() {
    return {
      baseTotalCents: 0,
      volumeTotalCents: 0,
      totalSavingsCents: 0,
      itemCount: 0,
      baseTotal: 0,
      volumeTotal: 0,
      totalSavings: 0,
      averageDiscountPercent: 0,
    };
  }

  /**
   * Format tier row
   */
  _formatTier(row) {
    return {
      id: row.id,
      productId: row.product_id,
      minQty: row.min_qty,
      maxQty: row.max_qty,
      priceCents: row.price_cents,
      discountPercent: row.discount_percent ? parseFloat(row.discount_percent) : null,
      tierName: row.tier_name,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get product base price
   */
  async _getProductBasePrice(productId) {
    const result = await this.pool.query(
      `SELECT COALESCE(retail_price_cents, (price * 100)::INTEGER) as price_cents
       FROM products WHERE id = $1`,
      [productId]
    );
    return result.rows[0]?.price_cents || 0;
  }

  /**
   * Invalidate product volume pricing cache
   */
  _invalidateProductCache(productId) {
    if (this.cache) {
      this.cache.invalidatePattern(`volume_price:${productId}:*`);
    }
  }

  /**
   * Invalidate customer volume pricing cache
   */
  _invalidateCustomerCache(customerId) {
    if (this.cache) {
      this.cache.invalidatePattern(`volume_price:*:*:${customerId}`);
    }
  }
}

module.exports = VolumeDiscountService;
