/**
 * AdvancedPricingService
 *
 * Handles all advanced pricing logic including:
 * - Volume discount rules and tiers
 * - Promotions and promo codes
 * - Discount stacking and conflict resolution
 * - Final price calculations
 */

const pool = require('../db');

class AdvancedPricingService {
  // ==================== VOLUME DISCOUNT RULES ====================

  /**
   * Get all volume discount rules with optional filters
   */
  async getVolumeDiscountRules(filters = {}) {
    const { isActive, scopeType, includeExpired } = filters;

    let query = `
      SELECT vdr.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', vdt.id,
              'min_quantity', vdt.min_quantity,
              'max_quantity', vdt.max_quantity,
              'discount_value', vdt.discount_value,
              'display_label', vdt.display_label
            ) ORDER BY vdt.min_quantity
          ) FILTER (WHERE vdt.id IS NOT NULL),
          '[]'
        ) as tiers
      FROM volume_discount_rules vdr
      LEFT JOIN volume_discount_tiers vdt ON vdr.id = vdt.rule_id
      WHERE 1=1
    `;

    const params = [];

    if (isActive !== undefined) {
      params.push(isActive);
      query += ` AND vdr.is_active = $${params.length}`;
    }

    if (scopeType) {
      params.push(scopeType);
      query += ` AND vdr.scope_type = $${params.length}`;
    }

    if (!includeExpired) {
      query += ` AND (vdr.valid_until IS NULL OR vdr.valid_until > NOW())`;
    }

    query += ` GROUP BY vdr.id ORDER BY vdr.priority DESC, vdr.created_at DESC`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get a single volume discount rule by ID
   */
  async getVolumeDiscountRuleById(ruleId) {
    const query = `
      SELECT vdr.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', vdt.id,
              'min_quantity', vdt.min_quantity,
              'max_quantity', vdt.max_quantity,
              'discount_value', vdt.discount_value,
              'display_label', vdt.display_label
            ) ORDER BY vdt.min_quantity
          ) FILTER (WHERE vdt.id IS NOT NULL),
          '[]'
        ) as tiers
      FROM volume_discount_rules vdr
      LEFT JOIN volume_discount_tiers vdt ON vdr.id = vdt.rule_id
      WHERE vdr.id = $1
      GROUP BY vdr.id
    `;

    const result = await pool.query(query, [ruleId]);
    return result.rows[0] || null;
  }

  /**
   * Create a new volume discount rule with tiers
   */
  async createVolumeDiscountRule(ruleData) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const {
        name,
        description,
        scope_type = 'all',
        scope_product_id,
        scope_category,
        scope_manufacturer,
        discount_type = 'percent',
        is_active = true,
        valid_from,
        valid_until,
        priority = 0,
        can_stack = true,
        stacking_group,
        tiers = [],
        created_by
      } = ruleData;

      // Create the rule
      const ruleResult = await client.query(`
        INSERT INTO volume_discount_rules (
          name, description, scope_type, scope_product_id, scope_category,
          scope_manufacturer, discount_type, is_active, valid_from, valid_until,
          priority, can_stack, stacking_group, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `, [
        name, description, scope_type, scope_product_id, scope_category,
        scope_manufacturer, discount_type, is_active, valid_from, valid_until,
        priority, can_stack, stacking_group, created_by
      ]);

      const rule = ruleResult.rows[0];

      // Create the tiers
      const createdTiers = [];
      for (const tier of tiers) {
        const tierResult = await client.query(`
          INSERT INTO volume_discount_tiers (rule_id, min_quantity, max_quantity, discount_value, display_label)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `, [rule.id, tier.min_quantity, tier.max_quantity, tier.discount_value, tier.display_label]);
        createdTiers.push(tierResult.rows[0]);
      }

      await client.query('COMMIT');

      return { ...rule, tiers: createdTiers };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update a volume discount rule
   */
  async updateVolumeDiscountRule(ruleId, ruleData) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const {
        name,
        description,
        scope_type,
        scope_product_id,
        scope_category,
        scope_manufacturer,
        discount_type,
        is_active,
        valid_from,
        valid_until,
        priority,
        can_stack,
        stacking_group,
        tiers
      } = ruleData;

      // Update the rule
      const ruleResult = await client.query(`
        UPDATE volume_discount_rules SET
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          scope_type = COALESCE($3, scope_type),
          scope_product_id = $4,
          scope_category = $5,
          scope_manufacturer = $6,
          discount_type = COALESCE($7, discount_type),
          is_active = COALESCE($8, is_active),
          valid_from = $9,
          valid_until = $10,
          priority = COALESCE($11, priority),
          can_stack = COALESCE($12, can_stack),
          stacking_group = $13,
          updated_at = NOW()
        WHERE id = $14
        RETURNING *
      `, [
        name, description, scope_type, scope_product_id, scope_category,
        scope_manufacturer, discount_type, is_active, valid_from, valid_until,
        priority, can_stack, stacking_group, ruleId
      ]);

      if (ruleResult.rows.length === 0) {
        throw new Error('Volume discount rule not found');
      }

      const rule = ruleResult.rows[0];

      // Update tiers if provided
      if (tiers) {
        // Delete existing tiers
        await client.query('DELETE FROM volume_discount_tiers WHERE rule_id = $1', [ruleId]);

        // Create new tiers
        const createdTiers = [];
        for (const tier of tiers) {
          const tierResult = await client.query(`
            INSERT INTO volume_discount_tiers (rule_id, min_quantity, max_quantity, discount_value, display_label)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
          `, [ruleId, tier.min_quantity, tier.max_quantity, tier.discount_value, tier.display_label]);
          createdTiers.push(tierResult.rows[0]);
        }
        rule.tiers = createdTiers;
      }

      await client.query('COMMIT');

      return rule;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a volume discount rule
   */
  async deleteVolumeDiscountRule(ruleId) {
    const result = await pool.query(
      'DELETE FROM volume_discount_rules WHERE id = $1 RETURNING id',
      [ruleId]
    );
    return result.rows.length > 0;
  }

  /**
   * Get applicable volume discount rules for a product
   */
  async getApplicableVolumeRules(productId, category, manufacturer) {
    const query = `
      SELECT vdr.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', vdt.id,
              'min_quantity', vdt.min_quantity,
              'max_quantity', vdt.max_quantity,
              'discount_value', vdt.discount_value,
              'display_label', vdt.display_label
            ) ORDER BY vdt.min_quantity
          ) FILTER (WHERE vdt.id IS NOT NULL),
          '[]'
        ) as tiers
      FROM volume_discount_rules vdr
      LEFT JOIN volume_discount_tiers vdt ON vdr.id = vdt.rule_id
      WHERE vdr.is_active = true
        AND (vdr.valid_from IS NULL OR vdr.valid_from <= NOW())
        AND (vdr.valid_until IS NULL OR vdr.valid_until > NOW())
        AND (
          vdr.scope_type = 'all'
          OR (vdr.scope_type = 'product' AND vdr.scope_product_id = $1)
          OR (vdr.scope_type = 'category' AND vdr.scope_category = $2)
          OR (vdr.scope_type = 'manufacturer' AND vdr.scope_manufacturer = $3)
        )
      GROUP BY vdr.id
      ORDER BY vdr.priority DESC
    `;

    const result = await pool.query(query, [productId, category, manufacturer]);
    return result.rows;
  }

  /**
   * Calculate volume discount for a quantity
   */
  calculateVolumeDiscountForQuantity(rules, quantity) {
    let bestDiscount = null;
    let bestRule = null;

    for (const rule of rules) {
      const tiers = rule.tiers || [];

      for (const tier of tiers) {
        const minQty = tier.min_quantity;
        const maxQty = tier.max_quantity;

        if (quantity >= minQty && (maxQty === null || quantity <= maxQty)) {
          const discountValue = parseFloat(tier.discount_value);

          if (!bestDiscount || discountValue > bestDiscount.value) {
            bestDiscount = {
              value: discountValue,
              type: rule.discount_type,
              label: tier.display_label || `${discountValue}% off for ${minQty}+ units`,
              ruleId: rule.id,
              ruleName: rule.name,
              tierId: tier.id,
              canStack: rule.can_stack,
              stackingGroup: rule.stacking_group
            };
            bestRule = rule;
          }
        }
      }
    }

    return bestDiscount;
  }

  // ==================== PROMOTIONS ====================

  /**
   * Get all promotions with optional filters
   */
  async getPromotions(filters = {}) {
    const { isActive, promoType, includeExpired } = filters;

    let query = `
      SELECT p.*,
        (SELECT COUNT(*) FROM promotion_usage pu WHERE pu.promotion_id = p.id) as times_used
      FROM promotions p
      WHERE 1=1
    `;

    const params = [];

    if (isActive !== undefined) {
      params.push(isActive);
      query += ` AND p.is_active = $${params.length}`;
    }

    if (promoType) {
      params.push(promoType);
      query += ` AND p.promo_type = $${params.length}`;
    }

    if (!includeExpired) {
      query += ` AND p.end_date > NOW()`;
    }

    query += ` ORDER BY p.created_at DESC`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get active promotions (auto-activate promotions currently valid)
   */
  async getActivePromotions(productIds = [], customerId = null) {
    const query = `
      SELECT p.*,
        (SELECT COUNT(*) FROM promotion_usage pu WHERE pu.promotion_id = p.id) as times_used,
        (SELECT COUNT(*) FROM promotion_usage pu WHERE pu.promotion_id = p.id AND pu.customer_id = $1) as customer_uses
      FROM promotions p
      WHERE p.is_active = true
        AND p.auto_activate = true
        AND p.start_date <= NOW()
        AND p.end_date > NOW()
        AND (p.max_uses_total IS NULL OR p.current_uses < p.max_uses_total)
      ORDER BY p.discount_value DESC
    `;

    const result = await pool.query(query, [customerId]);

    // Filter by product scope if needed
    return result.rows.filter(promo => {
      if (promo.scope_type === 'all') return true;
      if (promo.scope_type === 'product' && productIds.length > 0) {
        const scopeIds = promo.scope_value ? promo.scope_value.split(',').map(id => parseInt(id.trim())) : [];
        return productIds.some(id => scopeIds.includes(id));
      }
      return true;
    });
  }

  /**
   * Validate a promo code
   */
  async validatePromoCode(code, customerId = null, cartTotal = 0, cartItems = []) {
    const query = `
      SELECT p.*,
        (SELECT COUNT(*) FROM promotion_usage pu WHERE pu.promotion_id = p.id) as times_used,
        (SELECT COUNT(*) FROM promotion_usage pu WHERE pu.promotion_id = p.id AND pu.customer_id = $2) as customer_uses
      FROM promotions p
      WHERE p.promo_code = $1
    `;

    const result = await pool.query(query, [code.toUpperCase(), customerId]);

    if (result.rows.length === 0) {
      return { valid: false, error: 'Invalid promo code' };
    }

    const promo = result.rows[0];

    // Check if active
    if (!promo.is_active) {
      return { valid: false, error: 'This promo code is no longer active' };
    }

    // Check date range
    const now = new Date();
    if (new Date(promo.start_date) > now) {
      return { valid: false, error: 'This promo code is not yet valid' };
    }
    if (new Date(promo.end_date) < now) {
      return { valid: false, error: 'This promo code has expired' };
    }

    // Check total usage limit
    if (promo.max_uses_total && promo.times_used >= promo.max_uses_total) {
      return { valid: false, error: 'This promo code has reached its usage limit' };
    }

    // Check customer usage limit
    if (promo.max_uses_per_customer && customerId && promo.customer_uses >= promo.max_uses_per_customer) {
      return { valid: false, error: 'You have already used this promo code the maximum number of times' };
    }

    // Check minimum purchase
    if (promo.min_purchase_cents && cartTotal < promo.min_purchase_cents) {
      const minPurchase = (promo.min_purchase_cents / 100).toFixed(2);
      return { valid: false, error: `Minimum purchase of $${minPurchase} required` };
    }

    // Check minimum quantity
    if (promo.min_quantity) {
      const totalQuantity = cartItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
      if (totalQuantity < promo.min_quantity) {
        return { valid: false, error: `Minimum ${promo.min_quantity} items required` };
      }
    }

    return { valid: true, promotion: promo };
  }

  /**
   * Create a new promotion
   */
  async createPromotion(promoData) {
    const {
      promo_code,
      promo_name,
      description,
      promo_type = 'general',
      scope_type = 'all',
      scope_value,
      discount_type,
      discount_value,
      start_date,
      end_date,
      auto_activate = true,
      max_uses_total,
      max_uses_per_customer,
      min_purchase_cents,
      max_discount_cents,
      min_quantity,
      can_stack = false,
      stacking_group,
      created_by
    } = promoData;

    const result = await pool.query(`
      INSERT INTO promotions (
        promo_code, promo_name, description, promo_type, scope_type, scope_value,
        discount_type, discount_value, start_date, end_date, auto_activate,
        max_uses_total, max_uses_per_customer, min_purchase_cents, max_discount_cents,
        min_quantity, can_stack, stacking_group, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `, [
      promo_code?.toUpperCase(), promo_name, description, promo_type, scope_type, scope_value,
      discount_type, discount_value, start_date, end_date, auto_activate,
      max_uses_total, max_uses_per_customer, min_purchase_cents, max_discount_cents,
      min_quantity, can_stack, stacking_group, created_by
    ]);

    return result.rows[0];
  }

  /**
   * Update a promotion
   */
  async updatePromotion(promoId, promoData) {
    const {
      promo_code,
      promo_name,
      description,
      promo_type,
      scope_type,
      scope_value,
      discount_type,
      discount_value,
      start_date,
      end_date,
      auto_activate,
      max_uses_total,
      max_uses_per_customer,
      min_purchase_cents,
      max_discount_cents,
      min_quantity,
      can_stack,
      stacking_group,
      is_active
    } = promoData;

    const result = await pool.query(`
      UPDATE promotions SET
        promo_code = COALESCE($1, promo_code),
        promo_name = COALESCE($2, promo_name),
        description = COALESCE($3, description),
        promo_type = COALESCE($4, promo_type),
        scope_type = COALESCE($5, scope_type),
        scope_value = $6,
        discount_type = COALESCE($7, discount_type),
        discount_value = COALESCE($8, discount_value),
        start_date = COALESCE($9, start_date),
        end_date = COALESCE($10, end_date),
        auto_activate = COALESCE($11, auto_activate),
        max_uses_total = $12,
        max_uses_per_customer = $13,
        min_purchase_cents = $14,
        max_discount_cents = $15,
        min_quantity = $16,
        can_stack = COALESCE($17, can_stack),
        stacking_group = $18,
        is_active = COALESCE($19, is_active),
        updated_at = NOW()
      WHERE id = $20
      RETURNING *
    `, [
      promo_code?.toUpperCase(), promo_name, description, promo_type, scope_type, scope_value,
      discount_type, discount_value, start_date, end_date, auto_activate,
      max_uses_total, max_uses_per_customer, min_purchase_cents, max_discount_cents,
      min_quantity, can_stack, stacking_group, is_active, promoId
    ]);

    return result.rows[0] || null;
  }

  /**
   * Delete a promotion
   */
  async deletePromotion(promoId) {
    const result = await pool.query(
      'DELETE FROM promotions WHERE id = $1 RETURNING id',
      [promoId]
    );
    return result.rows.length > 0;
  }

  /**
   * Track promotion usage
   */
  async trackPromotionUsage(promoId, quotationId, customerId, discountAppliedCents) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Record usage
      await client.query(`
        INSERT INTO promotion_usage (promotion_id, quotation_id, customer_id, discount_applied_cents)
        VALUES ($1, $2, $3, $4)
      `, [promoId, quotationId, customerId, discountAppliedCents]);

      // Increment usage counter
      await client.query(`
        UPDATE promotions SET current_uses = current_uses + 1 WHERE id = $1
      `, [promoId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get promotion usage history
   */
  async getPromotionUsage(promoId) {
    const result = await pool.query(`
      SELECT pu.*,
        q.quotation_number,
        c.name as customer_name,
        c.email as customer_email
      FROM promotion_usage pu
      LEFT JOIN quotations q ON pu.quotation_id = q.id
      LEFT JOIN customers c ON pu.customer_id = c.id
      WHERE pu.promotion_id = $1
      ORDER BY pu.applied_at DESC
    `, [promoId]);

    return result.rows;
  }

  // ==================== STACKING & CALCULATION ====================

  /**
   * Get active stacking policy
   */
  async getStackingPolicy() {
    const result = await pool.query(
      'SELECT * FROM stacking_policies WHERE is_active = true LIMIT 1'
    );
    return result.rows[0] || {
      max_total_discount_percent: 50,
      min_margin_after_discounts_percent: 5,
      max_stackable_discounts: 3
    };
  }

  /**
   * Calculate stacked discounts with policy enforcement
   */
  async calculateStackedDiscounts(discounts, basePriceCents, costCents = null) {
    const policy = await this.getStackingPolicy();

    // Group discounts by stacking group
    const stackingGroups = {};
    const nonStackable = [];

    for (const discount of discounts) {
      if (!discount.canStack) {
        nonStackable.push(discount);
      } else if (discount.stackingGroup) {
        if (!stackingGroups[discount.stackingGroup]) {
          stackingGroups[discount.stackingGroup] = [];
        }
        stackingGroups[discount.stackingGroup].push(discount);
      } else {
        if (!stackingGroups['default']) {
          stackingGroups['default'] = [];
        }
        stackingGroups['default'].push(discount);
      }
    }

    // Select best discount from each stacking group
    const selectedDiscounts = [];

    // For non-stackable, take the best one
    if (nonStackable.length > 0) {
      const best = this.getBestDiscount(nonStackable, basePriceCents);
      if (best) selectedDiscounts.push(best);
    }

    // For each stacking group, take the best one
    for (const group of Object.values(stackingGroups)) {
      const best = this.getBestDiscount(group, basePriceCents);
      if (best) selectedDiscounts.push(best);
    }

    // Limit to max stackable discounts
    const limitedDiscounts = selectedDiscounts.slice(0, policy.max_stackable_discounts);

    // Calculate total discount
    let totalDiscountCents = 0;
    let currentPrice = basePriceCents;
    const appliedDiscounts = [];

    for (const discount of limitedDiscounts) {
      let discountAmount;

      if (discount.type === 'percent') {
        discountAmount = Math.round(currentPrice * (discount.value / 100));
      } else {
        discountAmount = Math.round(discount.value * 100); // Convert dollars to cents
      }

      // Apply max discount cap for promotions
      if (discount.maxDiscountCents && discountAmount > discount.maxDiscountCents) {
        discountAmount = discount.maxDiscountCents;
      }

      totalDiscountCents += discountAmount;
      currentPrice -= discountAmount;

      appliedDiscounts.push({
        ...discount,
        discountAmountCents: discountAmount
      });
    }

    // Enforce max total discount percent
    const maxDiscountCents = Math.round(basePriceCents * (policy.max_total_discount_percent / 100));
    if (totalDiscountCents > maxDiscountCents) {
      totalDiscountCents = maxDiscountCents;
      currentPrice = basePriceCents - totalDiscountCents;
    }

    // Enforce minimum margin if cost is provided
    if (costCents !== null) {
      const minPrice = Math.round(costCents * (1 + policy.min_margin_after_discounts_percent / 100));
      if (currentPrice < minPrice) {
        currentPrice = minPrice;
        totalDiscountCents = basePriceCents - currentPrice;
      }
    }

    return {
      originalPriceCents: basePriceCents,
      finalPriceCents: currentPrice,
      totalDiscountCents,
      totalDiscountPercent: ((totalDiscountCents / basePriceCents) * 100).toFixed(2),
      appliedDiscounts,
      policyApplied: {
        maxDiscountEnforced: totalDiscountCents >= maxDiscountCents,
        minMarginEnforced: costCents !== null && currentPrice <= Math.round(costCents * (1 + policy.min_margin_after_discounts_percent / 100))
      }
    };
  }

  /**
   * Get the best discount from a list
   */
  getBestDiscount(discounts, basePriceCents) {
    let best = null;
    let bestAmount = 0;

    for (const discount of discounts) {
      let amount;
      if (discount.type === 'percent') {
        amount = basePriceCents * (discount.value / 100);
      } else {
        amount = discount.value * 100;
      }

      if (amount > bestAmount) {
        bestAmount = amount;
        best = discount;
      }
    }

    return best;
  }

  // ==================== UNIFIED CALCULATION ====================

  /**
   * Calculate final price for a single product
   */
  async calculateProductPrice(productId, quantity, customerId = null, options = {}) {
    const { promoCode, includeVolumeDiscount = true } = options;

    // Get product details
    const productResult = await pool.query(
      'SELECT id, name, category, manufacturer, sell_price, cost FROM products WHERE id = $1',
      [productId]
    );

    if (productResult.rows.length === 0) {
      throw new Error('Product not found');
    }

    const product = productResult.rows[0];
    const basePriceCents = Math.round(parseFloat(product.sell_price) * 100);
    const costCents = product.cost ? Math.round(parseFloat(product.cost) * 100) : null;

    const discounts = [];

    // Get volume discounts
    if (includeVolumeDiscount && quantity > 1) {
      const volumeRules = await this.getApplicableVolumeRules(
        productId,
        product.category,
        product.manufacturer
      );

      const volumeDiscount = this.calculateVolumeDiscountForQuantity(volumeRules, quantity);
      if (volumeDiscount) {
        discounts.push({
          source: 'volume',
          ...volumeDiscount
        });
      }
    }

    // Validate promo code if provided
    if (promoCode) {
      const promoValidation = await this.validatePromoCode(
        promoCode,
        customerId,
        basePriceCents * quantity,
        [{ productId, quantity }]
      );

      if (promoValidation.valid) {
        const promo = promoValidation.promotion;
        discounts.push({
          source: 'promo',
          value: parseFloat(promo.discount_value),
          type: promo.discount_type,
          label: promo.promo_name,
          promoId: promo.id,
          promoCode: promo.promo_code,
          canStack: promo.can_stack,
          stackingGroup: promo.stacking_group,
          maxDiscountCents: promo.max_discount_cents
        });
      }
    }

    // Calculate stacked discounts
    const calculation = await this.calculateStackedDiscounts(discounts, basePriceCents, costCents);

    return {
      productId,
      productName: product.name,
      quantity,
      unitPriceCents: basePriceCents,
      unitFinalPriceCents: calculation.finalPriceCents,
      lineTotalCents: calculation.finalPriceCents * quantity,
      originalLineTotalCents: basePriceCents * quantity,
      totalDiscountCents: calculation.totalDiscountCents * quantity,
      discountPercent: calculation.totalDiscountPercent,
      appliedDiscounts: calculation.appliedDiscounts
    };
  }

  /**
   * Calculate totals for an entire quote
   */
  async calculateQuoteTotals(items, customerId = null, promoCode = null) {
    let subtotalCents = 0;
    let totalDiscountCents = 0;
    const lineItems = [];
    const allAppliedDiscounts = [];

    for (const item of items) {
      const calculation = await this.calculateProductPrice(
        item.productId,
        item.quantity,
        customerId,
        { promoCode, includeVolumeDiscount: true }
      );

      subtotalCents += calculation.originalLineTotalCents;
      totalDiscountCents += calculation.totalDiscountCents;

      lineItems.push(calculation);

      for (const discount of calculation.appliedDiscounts) {
        if (!allAppliedDiscounts.find(d => d.source === discount.source && d.value === discount.value)) {
          allAppliedDiscounts.push(discount);
        }
      }
    }

    const finalSubtotalCents = subtotalCents - totalDiscountCents;

    return {
      originalSubtotalCents: subtotalCents,
      discountTotalCents: totalDiscountCents,
      finalSubtotalCents,
      discountPercent: subtotalCents > 0 ? ((totalDiscountCents / subtotalCents) * 100).toFixed(2) : '0.00',
      lineItems,
      appliedDiscounts: allAppliedDiscounts,
      promoCodeApplied: promoCode || null
    };
  }

  /**
   * Save applied discounts to a quote
   */
  async saveAppliedDiscounts(quotationId, lineItems) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Clear existing applied discounts for this quote
      await client.query('DELETE FROM applied_discounts WHERE quotation_id = $1', [quotationId]);

      // Insert new applied discounts
      for (const item of lineItems) {
        for (const discount of item.appliedDiscounts || []) {
          await client.query(`
            INSERT INTO applied_discounts (
              quotation_id, quotation_item_id, discount_source, source_id,
              discount_type, discount_value, discount_amount_cents,
              original_price_cents, final_price_cents
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            quotationId,
            item.quotationItemId || null,
            discount.source,
            discount.ruleId || discount.promoId || null,
            discount.type,
            discount.value,
            discount.discountAmountCents,
            item.unitPriceCents,
            item.unitFinalPriceCents
          ]);
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new AdvancedPricingService();
