/**
 * TeleTime POS - Promotion Service
 *
 * Handles promotion operations:
 * - CRUD for promotions
 * - Promotion validation
 * - Discount calculation
 * - Usage tracking
 * - Promo code redemption
 */

class POSPromotionService {
  constructor(pool) {
    this.pool = pool;
  }

  // ============================================================================
  // PROMOTION CRUD
  // ============================================================================

  /**
   * Create a new promotion
   * @param {object} data - Promotion data
   * @returns {object} Created promotion
   */
  async createPromotion(data) {
    const {
      promoCode,
      name,
      description,
      internalNotes,
      promoType,
      discountPercent,
      discountAmountCents,
      maxDiscountCents,
      buyQuantity,
      getQuantity,
      getDiscountPercent,
      getProductId,
      bundlePriceCents,
      bundleItems,
      thresholdAmountCents,
      freeItemProductId,
      freeItemValueCents,
      startDate,
      endDate,
      maxUsesTotal,
      maxUsesPerCustomer,
      minOrderCents,
      minQuantity,
      customerTierRequired,
      customerTiersAllowed,
      autoApply,
      combinable,
      combinationGroup,
      priority,
      displayName,
      badgeText,
      badgeColor,
      showInCatalog,
      showCountdown,
      createdBy,
    } = data;

    const result = await this.pool.query(
      `INSERT INTO pos_promotions (
        promo_code, name, description, internal_notes, promo_type,
        discount_percent, discount_amount_cents, max_discount_cents,
        buy_quantity, get_quantity, get_discount_percent, get_product_id,
        bundle_price_cents, bundle_items,
        threshold_amount_cents, free_item_product_id, free_item_value_cents,
        start_date, end_date, max_uses_total, max_uses_per_customer,
        min_order_cents, min_quantity,
        customer_tier_required, customer_tiers_allowed,
        auto_apply, combinable, combination_group, priority,
        display_name, badge_text, badge_color, show_in_catalog, show_countdown,
        created_by, status
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14,
        $15, $16, $17,
        $18, $19, $20, $21,
        $22, $23,
        $24, $25,
        $26, $27, $28, $29,
        $30, $31, $32, $33, $34,
        $35, 'active'
      )
      RETURNING *`,
      [
        promoCode || null,
        name,
        description || null,
        internalNotes || null,
        promoType,
        discountPercent || null,
        discountAmountCents || null,
        maxDiscountCents || null,
        buyQuantity || null,
        getQuantity || null,
        getDiscountPercent || null,
        getProductId || null,
        bundlePriceCents || null,
        bundleItems ? JSON.stringify(bundleItems) : null,
        thresholdAmountCents || null,
        freeItemProductId || null,
        freeItemValueCents || null,
        startDate || new Date(),
        endDate || null,
        maxUsesTotal || null,
        maxUsesPerCustomer || null,
        minOrderCents || 0,
        minQuantity || 0,
        customerTierRequired || null,
        customerTiersAllowed || null,
        autoApply !== false,
        combinable || false,
        combinationGroup || null,
        priority || 0,
        displayName || null,
        badgeText || null,
        badgeColor || '#10B981',
        showInCatalog !== false,
        showCountdown || false,
        createdBy || null,
      ]
    );

    return this._formatPromotion(result.rows[0]);
  }

  /**
   * Get promotion by ID
   * @param {number} id - Promotion ID
   * @returns {object|null} Promotion or null
   */
  async getPromotionById(id) {
    const result = await this.pool.query(
      `SELECT p.*,
        (SELECT json_agg(pp.*) FROM pos_promotion_products pp WHERE pp.promotion_id = p.id) AS products,
        (SELECT json_agg(pr.*) FROM pos_promotion_rules pr WHERE pr.promotion_id = p.id) AS rules
      FROM pos_promotions p
      WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this._formatPromotion(result.rows[0]);
  }

  /**
   * Get promotion by promo code
   * @param {string} code - Promo code
   * @returns {object|null} Promotion or null
   */
  async getPromotionByCode(code) {
    const result = await this.pool.query(
      `SELECT p.*,
        (SELECT json_agg(pp.*) FROM pos_promotion_products pp WHERE pp.promotion_id = p.id) AS products,
        (SELECT json_agg(pr.*) FROM pos_promotion_rules pr WHERE pr.promotion_id = p.id) AS rules
      FROM pos_promotions p
      WHERE UPPER(p.promo_code) = UPPER($1)`,
      [code]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this._formatPromotion(result.rows[0]);
  }

  /**
   * List promotions with filters
   * @param {object} filters - Filter options
   * @returns {Array} Promotions
   */
  async listPromotions(filters = {}) {
    const {
      status,
      promoType,
      autoApply,
      activeOnly,
      search,
      limit = 50,
      offset = 0,
    } = filters;

    let query = `
      SELECT p.*,
        COALESCE(p.max_uses_total - p.current_uses, 999999) AS uses_remaining,
        (SELECT COUNT(*) FROM pos_promotion_usage pu WHERE pu.promotion_id = p.id AND pu.status = 'applied') AS total_redemptions
      FROM pos_promotions p
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND p.status = $${paramIndex++}`;
      params.push(status);
    }

    if (promoType) {
      query += ` AND p.promo_type = $${paramIndex++}`;
      params.push(promoType);
    }

    if (autoApply !== undefined) {
      query += ` AND p.auto_apply = $${paramIndex++}`;
      params.push(autoApply);
    }

    if (activeOnly) {
      query += ` AND p.status = 'active'
        AND (p.start_date IS NULL OR p.start_date <= NOW())
        AND (p.end_date IS NULL OR p.end_date > NOW())
        AND (p.max_uses_total IS NULL OR p.current_uses < p.max_uses_total)`;
    }

    if (search) {
      query += ` AND (
        p.name ILIKE $${paramIndex} OR
        p.promo_code ILIKE $${paramIndex} OR
        p.description ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY p.priority DESC, p.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);
    return result.rows.map((row) => this._formatPromotion(row));
  }

  /**
   * Update promotion
   * @param {number} id - Promotion ID
   * @param {object} updates - Fields to update
   * @returns {object} Updated promotion
   */
  async updatePromotion(id, updates) {
    const allowedFields = [
      'name',
      'description',
      'internal_notes',
      'discount_percent',
      'discount_amount_cents',
      'max_discount_cents',
      'start_date',
      'end_date',
      'max_uses_total',
      'max_uses_per_customer',
      'min_order_cents',
      'min_quantity',
      'customer_tier_required',
      'customer_tiers_allowed',
      'auto_apply',
      'combinable',
      'combination_group',
      'priority',
      'display_name',
      'badge_text',
      'badge_color',
      'show_in_catalog',
      'show_countdown',
      'status',
    ];

    const setClauses = [];
    const params = [id];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      if (allowedFields.includes(snakeKey)) {
        setClauses.push(`${snakeKey} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) {
      return this.getPromotionById(id);
    }

    const result = await this.pool.query(
      `UPDATE pos_promotions
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
      params
    );

    return this._formatPromotion(result.rows[0]);
  }

  /**
   * Delete promotion
   * @param {number} id - Promotion ID
   * @returns {boolean} Success
   */
  async deletePromotion(id) {
    const result = await this.pool.query(
      `DELETE FROM pos_promotions WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rowCount > 0;
  }

  // ============================================================================
  // PROMOTION PRODUCTS/RULES
  // ============================================================================

  /**
   * Add products to a promotion
   * @param {number} promotionId - Promotion ID
   * @param {Array} products - Array of product targets
   */
  async addPromotionProducts(promotionId, products) {
    const values = products.map((p, i) => {
      const base = i * 8;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    });

    const params = products.flatMap((p) => [
      promotionId,
      p.targetType,
      p.productId || null,
      p.categoryName || null,
      p.brandName || null,
      p.isIncluded !== false,
      p.productRole || null,
      p.requiredQuantity || 1,
    ]);

    await this.pool.query(
      `INSERT INTO pos_promotion_products
        (promotion_id, target_type, product_id, category_name, brand_name, is_included, product_role, required_quantity)
      VALUES ${values.join(', ')}`,
      params
    );
  }

  /**
   * Add rules to a promotion
   * @param {number} promotionId - Promotion ID
   * @param {Array} rules - Array of rules
   */
  async addPromotionRules(promotionId, rules) {
    for (const rule of rules) {
      await this.pool.query(
        `INSERT INTO pos_promotion_rules
          (promotion_id, rule_type, rule_operator, value_int, value_decimal, value_text, value_array, product_id, is_required, rule_group, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          promotionId,
          rule.ruleType,
          rule.operator || '>=',
          rule.valueInt || null,
          rule.valueDecimal || null,
          rule.valueText || null,
          rule.valueArray ? JSON.stringify(rule.valueArray) : null,
          rule.productId || null,
          rule.isRequired !== false,
          rule.ruleGroup || null,
          rule.description || null,
        ]
      );
    }
  }

  /**
   * Clear and replace promotion products
   * @param {number} promotionId - Promotion ID
   * @param {Array} products - New products
   */
  async replacePromotionProducts(promotionId, products) {
    await this.pool.query(
      `DELETE FROM pos_promotion_products WHERE promotion_id = $1`,
      [promotionId]
    );

    if (products && products.length > 0) {
      await this.addPromotionProducts(promotionId, products);
    }
  }

  // ============================================================================
  // PROMOTION VALIDATION & CALCULATION
  // ============================================================================

  /**
   * Validate a promo code
   * @param {string} code - Promo code
   * @param {number} customerId - Customer ID (optional)
   * @param {number} subtotalCents - Cart subtotal
   * @returns {object} Validation result
   */
  async validatePromoCode(code, customerId = null, subtotalCents = 0) {
    const promo = await this.getPromotionByCode(code);

    if (!promo) {
      return { valid: false, error: 'Invalid promo code' };
    }

    // Check if promotion is valid
    const validityResult = await this.pool.query(
      `SELECT is_promotion_valid($1) AS valid`,
      [promo.id]
    );

    if (!validityResult.rows[0].valid) {
      return { valid: false, error: 'This promotion is no longer active' };
    }

    // Check customer eligibility
    const eligibilityResult = await this.pool.query(
      `SELECT * FROM can_customer_use_promotion($1, $2)`,
      [promo.id, customerId]
    );

    if (!eligibilityResult.rows[0].can_use) {
      return { valid: false, error: eligibilityResult.rows[0].reason };
    }

    // Check minimum order
    if (promo.minOrderCents && subtotalCents < promo.minOrderCents) {
      return {
        valid: false,
        error: `Minimum order of $${(promo.minOrderCents / 100).toFixed(2)} required`,
        minRequired: promo.minOrderCents,
        currentAmount: subtotalCents,
      };
    }

    return {
      valid: true,
      promotion: promo,
    };
  }

  /**
   * Get applicable promotions for a cart
   * @param {object} cart - Cart data
   * @returns {Array} Applicable promotions with calculated discounts
   */
  async getApplicablePromotions(cart) {
    const { customerId, items, subtotalCents } = cart;

    // Format cart items for the database function
    const cartItemsJson = JSON.stringify(
      items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents || Math.round(item.unitPrice * 100),
        categoryName: item.categoryName || item.category,
        brandName: item.brandName || item.brand,
      }))
    );

    const result = await this.pool.query(
      `SELECT * FROM get_applicable_promotions($1, $2::jsonb, $3, TRUE)`,
      [customerId || null, cartItemsJson, subtotalCents]
    );

    return result.rows.map((row) => ({
      promotionId: row.promotion_id,
      promoCode: row.promo_code,
      name: row.name,
      promoType: row.promo_type,
      discountPreviewCents: row.discount_preview_cents,
      requiresCode: row.requires_code,
      priority: row.priority,
    }));
  }

  /**
   * Calculate discount for a specific promotion
   * @param {number} promotionId - Promotion ID
   * @param {object} cart - Cart data
   * @returns {object} Discount calculation result
   */
  async calculateDiscount(promotionId, cart) {
    const promo = await this.getPromotionById(promotionId);

    if (!promo) {
      return { success: false, error: 'Promotion not found' };
    }

    const { items, subtotalCents } = cart;
    let discountCents = 0;
    let affectedItems = [];
    let freeItems = [];

    switch (promo.promoType) {
      case 'percent_order':
        discountCents = Math.round(subtotalCents * promo.discountPercent / 100);
        if (promo.maxDiscountCents) {
          discountCents = Math.min(discountCents, promo.maxDiscountCents);
        }
        affectedItems = items.map((item) => ({
          itemId: item.id,
          productId: item.productId,
          discountCents: Math.round(
            item.quantity * (item.unitPriceCents || item.unitPrice * 100) * promo.discountPercent / 100
          ),
        }));
        break;

      case 'fixed_order':
        discountCents = Math.min(promo.discountAmountCents, subtotalCents);
        break;

      case 'percent_product':
      case 'category_percent':
        const matchingItems = await this._getMatchingItems(promotionId, items);
        for (const item of matchingItems) {
          const itemDiscount = Math.round(
            item.quantity * (item.unitPriceCents || item.unitPrice * 100) * promo.discountPercent / 100
          );
          discountCents += itemDiscount;
          affectedItems.push({
            itemId: item.id,
            productId: item.productId,
            discountCents: itemDiscount,
          });
        }
        if (promo.maxDiscountCents) {
          discountCents = Math.min(discountCents, promo.maxDiscountCents);
        }
        break;

      case 'fixed_product':
      case 'category_fixed':
        const fixedMatchingItems = await this._getMatchingItems(promotionId, items);
        for (const item of fixedMatchingItems) {
          const itemDiscount = item.quantity * promo.discountAmountCents;
          discountCents += itemDiscount;
          affectedItems.push({
            itemId: item.id,
            productId: item.productId,
            discountCents: itemDiscount,
          });
        }
        break;

      case 'buy_x_get_y':
        const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
        const setSize = promo.buyQuantity + promo.getQuantity;
        const fullSets = Math.floor(totalQty / setSize);

        if (fullSets > 0) {
          // Sort items by price (lowest first for free items)
          const sortedItems = [...items].sort(
            (a, b) => (a.unitPriceCents || a.unitPrice * 100) - (b.unitPriceCents || b.unitPrice * 100)
          );

          let freeQtyRemaining = fullSets * promo.getQuantity;
          for (const item of sortedItems) {
            if (freeQtyRemaining <= 0) break;

            const freeQty = Math.min(item.quantity, freeQtyRemaining);
            const itemPrice = item.unitPriceCents || item.unitPrice * 100;
            const itemDiscount = Math.round(freeQty * itemPrice * promo.getDiscountPercent / 100);

            discountCents += itemDiscount;
            affectedItems.push({
              itemId: item.id,
              productId: item.productId,
              discountCents: itemDiscount,
              freeQuantity: freeQty,
            });
            freeQtyRemaining -= freeQty;
          }
        }
        break;

      case 'bundle':
        // Check if all bundle items are present
        const bundleItems = promo.bundleItems || [];
        let bundleComplete = true;

        for (const bundleItem of bundleItems) {
          const cartItem = items.find((i) => i.productId === bundleItem.productId);
          if (!cartItem || cartItem.quantity < bundleItem.quantity) {
            bundleComplete = false;
            break;
          }
        }

        if (bundleComplete) {
          // Calculate regular price of bundle items
          let regularPrice = 0;
          for (const bundleItem of bundleItems) {
            const cartItem = items.find((i) => i.productId === bundleItem.productId);
            regularPrice += bundleItem.quantity * (cartItem.unitPriceCents || cartItem.unitPrice * 100);
          }
          discountCents = Math.max(0, regularPrice - promo.bundlePriceCents);
        }
        break;

      case 'free_item_threshold':
        if (subtotalCents >= promo.thresholdAmountCents) {
          if (promo.freeItemProductId) {
            // Specific free item
            const productResult = await this.pool.query(
              `SELECT retail_price_cents FROM products WHERE id = $1`,
              [promo.freeItemProductId]
            );
            if (productResult.rows.length > 0) {
              freeItems.push({
                productId: promo.freeItemProductId,
                quantity: 1,
                valueCents: productResult.rows[0].retail_price_cents,
              });
              discountCents = productResult.rows[0].retail_price_cents;
            }
          } else if (promo.freeItemValueCents) {
            // Any item up to value
            freeItems.push({
              productId: null,
              quantity: 1,
              valueCents: promo.freeItemValueCents,
              description: `Free item up to $${(promo.freeItemValueCents / 100).toFixed(2)}`,
            });
            discountCents = promo.freeItemValueCents;
          }
        }
        break;
    }

    return {
      success: true,
      promotionId,
      promoCode: promo.promoCode,
      promoType: promo.promoType,
      discountCents,
      affectedItems,
      freeItems,
      description: this._getDiscountDescription(promo, discountCents),
    };
  }

  /**
   * Get items that match a promotion's product targeting
   * @private
   */
  async _getMatchingItems(promotionId, items) {
    const productTargets = await this.pool.query(
      `SELECT * FROM pos_promotion_products WHERE promotion_id = $1 AND is_included = TRUE`,
      [promotionId]
    );

    const matching = [];
    for (const item of items) {
      const isMatch = productTargets.rows.some((target) => {
        if (target.product_id && target.product_id === item.productId) return true;
        if (target.category_name && target.category_name === (item.categoryName || item.category)) return true;
        if (target.brand_name && target.brand_name === (item.brandName || item.brand)) return true;
        return false;
      });

      // If no specific targets, apply to all
      if (productTargets.rows.length === 0 || isMatch) {
        matching.push(item);
      }
    }

    // Check exclusions
    const exclusions = await this.pool.query(
      `SELECT * FROM pos_promotion_products WHERE promotion_id = $1 AND is_included = FALSE`,
      [promotionId]
    );

    return matching.filter((item) => {
      return !exclusions.rows.some((excl) => {
        if (excl.product_id && excl.product_id === item.productId) return true;
        if (excl.category_name && excl.category_name === (item.categoryName || item.category)) return true;
        if (excl.brand_name && excl.brand_name === (item.brandName || item.brand)) return true;
        return false;
      });
    });
  }

  /**
   * Generate discount description
   * @private
   */
  _getDiscountDescription(promo, discountCents) {
    const discountDollars = (discountCents / 100).toFixed(2);

    switch (promo.promoType) {
      case 'percent_order':
        return `${promo.discountPercent}% off entire order (-$${discountDollars})`;
      case 'fixed_order':
        return `$${discountDollars} off order`;
      case 'percent_product':
      case 'category_percent':
        return `${promo.discountPercent}% off select items (-$${discountDollars})`;
      case 'buy_x_get_y':
        return `Buy ${promo.buyQuantity} Get ${promo.getQuantity} ${promo.getDiscountPercent === 100 ? 'Free' : `${promo.getDiscountPercent}% Off`} (-$${discountDollars})`;
      case 'bundle':
        return `Bundle price: $${(promo.bundlePriceCents / 100).toFixed(2)} (save $${discountDollars})`;
      case 'free_item_threshold':
        return `Free item (value: $${discountDollars})`;
      default:
        return `Discount: -$${discountDollars}`;
    }
  }

  // ============================================================================
  // PROMOTION USAGE
  // ============================================================================

  /**
   * Apply promotion to a transaction
   * @param {object} data - Application data
   * @returns {object} Result
   */
  async applyPromotion(data) {
    const {
      promotionId,
      transactionId,
      quotationId,
      customerId,
      userId,
      discountCents,
      itemsAffected,
      codeEntered,
    } = data;

    const result = await this.pool.query(
      `SELECT * FROM apply_promotion($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        promotionId,
        transactionId || null,
        quotationId || null,
        customerId || null,
        userId || null,
        discountCents,
        itemsAffected ? JSON.stringify(itemsAffected) : null,
        codeEntered || null,
      ]
    );

    const row = result.rows[0];
    return {
      success: row.success,
      usageId: row.usage_id,
      error: row.error_message,
    };
  }

  /**
   * Void a promotion usage
   * @param {number} usageId - Usage ID
   * @param {number} userId - User performing void
   * @param {string} reason - Reason for voiding
   * @returns {boolean} Success
   */
  async voidPromotionUsage(usageId, userId, reason = null) {
    const result = await this.pool.query(
      `SELECT void_promotion_usage($1, $2, $3) AS success`,
      [usageId, userId, reason]
    );
    return result.rows[0].success;
  }

  /**
   * Get usage history for a promotion
   * @param {number} promotionId - Promotion ID
   * @param {object} options - Filter options
   * @returns {Array} Usage records
   */
  async getPromotionUsage(promotionId, options = {}) {
    const { limit = 50, offset = 0, status = 'applied' } = options;

    const result = await this.pool.query(
      `SELECT pu.*,
        c.name AS customer_name,
        u.name AS user_name
      FROM pos_promotion_usage pu
      LEFT JOIN customers c ON pu.customer_id = c.id
      LEFT JOIN users u ON pu.user_id = u.id
      WHERE pu.promotion_id = $1
      AND ($4::VARCHAR IS NULL OR pu.status = $4)
      ORDER BY pu.applied_at DESC
      LIMIT $2 OFFSET $3`,
      [promotionId, limit, offset, status]
    );

    return result.rows.map((row) => ({
      id: row.id,
      promotionId: row.promotion_id,
      transactionId: row.transaction_id,
      quotationId: row.quotation_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      userId: row.user_id,
      userName: row.user_name,
      discountAppliedCents: row.discount_applied_cents,
      itemsAffected: row.items_affected,
      freeItemsGiven: row.free_items_given,
      codeEntered: row.code_entered,
      status: row.status,
      appliedAt: row.applied_at,
      voidedAt: row.voided_at,
      voidReason: row.void_reason,
    }));
  }

  /**
   * Get customer's usage count for a promotion
   * @param {number} promotionId - Promotion ID
   * @param {number} customerId - Customer ID
   * @returns {number} Usage count
   */
  async getCustomerUsageCount(promotionId, customerId) {
    const result = await this.pool.query(
      `SELECT get_customer_promo_usage_count($1, $2) AS count`,
      [promotionId, customerId]
    );
    return result.rows[0].count;
  }

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  /**
   * Get promotion performance summary
   * @param {number} promotionId - Promotion ID
   * @returns {object} Performance metrics
   */
  async getPromotionPerformance(promotionId) {
    const result = await this.pool.query(
      `SELECT * FROM v_promotion_usage_summary WHERE promotion_id = $1`,
      [promotionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      promotionId: row.promotion_id,
      name: row.name,
      promoCode: row.promo_code,
      promoType: row.promo_type,
      status: row.status,
      currentUses: row.current_uses,
      maxUsesTotal: row.max_uses_total,
      totalDiscountCents: row.total_discount_cents,
      totalDiscountDollars: row.total_discount_cents / 100,
      uniqueCustomers: parseInt(row.unique_customers, 10),
      transactionCount: parseInt(row.transaction_count, 10),
      firstUsed: row.first_used,
      lastUsed: row.last_used,
      averageDiscountCents: row.transaction_count > 0
        ? Math.round(row.total_discount_cents / row.transaction_count)
        : 0,
    };
  }

  /**
   * Get all active promotions summary
   * @returns {Array} Active promotions with metrics
   */
  async getActivePromotionsSummary() {
    const result = await this.pool.query(`SELECT * FROM v_active_promotions`);
    return result.rows.map((row) => this._formatPromotion(row));
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Format promotion from database row
   * @private
   */
  _formatPromotion(row) {
    return {
      id: row.id,
      promoCode: row.promo_code,
      name: row.name,
      description: row.description,
      internalNotes: row.internal_notes,
      promoType: row.promo_type,
      status: row.status,
      discountPercent: row.discount_percent ? parseFloat(row.discount_percent) : null,
      discountAmountCents: row.discount_amount_cents,
      maxDiscountCents: row.max_discount_cents,
      buyQuantity: row.buy_quantity,
      getQuantity: row.get_quantity,
      getDiscountPercent: row.get_discount_percent ? parseFloat(row.get_discount_percent) : null,
      getProductId: row.get_product_id,
      bundlePriceCents: row.bundle_price_cents,
      bundleItems: row.bundle_items,
      thresholdAmountCents: row.threshold_amount_cents,
      freeItemProductId: row.free_item_product_id,
      freeItemValueCents: row.free_item_value_cents,
      startDate: row.start_date,
      endDate: row.end_date,
      maxUsesTotal: row.max_uses_total,
      maxUsesPerCustomer: row.max_uses_per_customer,
      currentUses: row.current_uses,
      minOrderCents: row.min_order_cents,
      minQuantity: row.min_quantity,
      customerTierRequired: row.customer_tier_required,
      customerTiersAllowed: row.customer_tiers_allowed,
      autoApply: row.auto_apply,
      combinable: row.combinable,
      combinationGroup: row.combination_group,
      priority: row.priority,
      displayName: row.display_name,
      badgeText: row.badge_text,
      badgeColor: row.badge_color,
      showInCatalog: row.show_in_catalog,
      showCountdown: row.show_countdown,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Aggregated fields (if present)
      usesRemaining: row.uses_remaining,
      daysRemaining: row.days_remaining ? parseFloat(row.days_remaining) : null,
      productCount: row.product_count,
      ruleCount: row.rule_count,
      totalRedemptions: row.total_redemptions,
      // Nested data (if present)
      products: row.products,
      rules: row.rules,
    };
  }
}

module.exports = POSPromotionService;
