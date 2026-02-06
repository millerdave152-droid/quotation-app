/**
 * TeleTime POS - Promotion Engine
 *
 * Orchestrates promotion logic for POS transactions:
 * - Finds applicable promotions for a cart
 * - Validates promotion rules against cart contents
 * - Calculates discount amounts
 * - Handles promotion stacking rules
 * - Applies promo codes
 * - Tracks usage
 *
 * Business Rules:
 * - Only one promo code can be applied at a time
 * - Auto-apply promotions can stack with promo codes
 * - Shows best auto-apply if multiple qualify
 * - Expired/maxed-out promos return clear error messages
 */

class PromotionEngine {
  constructor(pool, promotionService = null) {
    this.pool = pool;
    this.promotionService = promotionService;
  }

  // ============================================================================
  // ERROR TYPES
  // ============================================================================

  static ErrorCodes = {
    INVALID_CODE: 'INVALID_CODE',
    EXPIRED: 'EXPIRED',
    NOT_STARTED: 'NOT_STARTED',
    USAGE_LIMIT_REACHED: 'USAGE_LIMIT_REACHED',
    CUSTOMER_LIMIT_REACHED: 'CUSTOMER_LIMIT_REACHED',
    MIN_ORDER_NOT_MET: 'MIN_ORDER_NOT_MET',
    MIN_QUANTITY_NOT_MET: 'MIN_QUANTITY_NOT_MET',
    CUSTOMER_TIER_INVALID: 'CUSTOMER_TIER_INVALID',
    PRODUCTS_NOT_ELIGIBLE: 'PRODUCTS_NOT_ELIGIBLE',
    RULE_NOT_MET: 'RULE_NOT_MET',
    ALREADY_APPLIED: 'ALREADY_APPLIED',
    CANNOT_COMBINE: 'CANNOT_COMBINE',
    PROMOTION_PAUSED: 'PROMOTION_PAUSED',
    NO_DISCOUNT: 'NO_DISCOUNT',
  };

  /**
   * Create a promotion error with code and user-friendly message
   */
  _createError(code, message, details = {}) {
    return {
      code,
      message,
      ...details,
    };
  }

  // ============================================================================
  // MAIN PUBLIC METHODS
  // ============================================================================

  /**
   * Find all applicable promotions for a cart
   * Returns auto-apply promotions sorted by discount value (best first)
   *
   * @param {object} cart - Cart object
   * @param {Array} cart.items - Cart items [{productId, quantity, unitPriceCents, categoryName, brandName}]
   * @param {object} cart.customer - Customer object {id, pricingTier}
   * @param {number} cart.subtotalCents - Cart subtotal in cents
   * @param {Array} cart.appliedPromotions - Already applied promotion IDs
   * @returns {object} Result with applicable promotions
   */
  async findApplicablePromotions(cart) {
    try {
      const { items: rawItems, customer = null, subtotalCents = 0, appliedPromotions = [] } = cart || {};
      const items = rawItems || [];

      // Calculate subtotal if not provided
      const calculatedSubtotal = subtotalCents || this._calculateSubtotal(items);

      // Get all active auto-apply promotions
      const autoApplyPromos = await this._getAutoApplyPromotions();

      // Get all promotions requiring codes (for display purposes)
      const codePromotions = await this._getCodePromotions();

      // Validate and calculate discount for each auto-apply promotion
      const validAutoApply = [];
      const invalidAutoApply = [];

      for (const promo of autoApplyPromos) {
        // Skip if already applied
        if (appliedPromotions.includes(promo.id)) {
          continue;
        }

        const validation = await this.validatePromotion(promo, cart);

        if (validation.valid) {
          const discount = await this.calculateDiscount(cart, promo);

          if (discount.discountCents > 0) {
            validAutoApply.push({
              promotion: promo,
              discountCents: discount.discountCents,
              description: discount.description,
              affectedItems: discount.affectedItems,
              freeItems: discount.freeItems,
            });
          }
        } else {
          invalidAutoApply.push({
            promotion: promo,
            reason: validation.error,
          });
        }
      }

      // Sort by discount value (highest first)
      validAutoApply.sort((a, b) => b.discountCents - a.discountCents);

      // Determine best auto-apply promotion
      const bestAutoApply = validAutoApply.length > 0 ? validAutoApply[0] : null;

      // Get stackable auto-apply promotions (excluding best if not stackable)
      const stackableAutoApply = this._getStackablePromotions(validAutoApply, bestAutoApply);

      // Calculate total auto-apply discount
      const totalAutoApplyDiscount = this._calculateStackedDiscount(
        bestAutoApply ? [bestAutoApply, ...stackableAutoApply] : stackableAutoApply
      );

      return {
        success: true,
        data: {
          // Best single auto-apply promotion
          bestPromotion: bestAutoApply,

          // All valid auto-apply promotions
          autoApplyPromotions: validAutoApply,

          // Stackable promotions (can combine with promo code)
          stackablePromotions: stackableAutoApply,

          // Promotions requiring code entry
          availableCodePromotions: codePromotions.map((p) => ({
            id: p.id,
            code: p.promo_code,
            name: p.name,
            description: p.description,
            promoType: p.promo_type,
            badgeText: p.badge_text,
          })),

          // Total discount from auto-apply
          totalAutoApplyDiscountCents: totalAutoApplyDiscount,

          // Why some promotions didn't apply
          ineligiblePromotions: invalidAutoApply,

          // Summary
          summary: {
            autoApplyCount: validAutoApply.length,
            codePromotionsAvailable: codePromotions.length,
            bestDiscountCents: bestAutoApply?.discountCents || 0,
            totalStackedDiscountCents: totalAutoApplyDiscount,
          },
        },
      };
    } catch (error) {
      console.error('[PromotionEngine] findApplicablePromotions error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Apply a promo code to the cart
   * Validates the code and returns the discount if valid
   *
   * @param {object} cart - Cart object
   * @param {string} code - Promo code to apply
   * @returns {object} Result with promotion details or error
   */
  async applyPromoCode(cart, code) {
    try {
      if (!code || typeof code !== 'string') {
        return {
          success: false,
          error: this._createError(
            PromotionEngine.ErrorCodes.INVALID_CODE,
            'Please enter a promo code'
          ),
        };
      }

      const normalizedCode = code.trim().toUpperCase();

      // Check if a promo code is already applied
      const { appliedPromoCode } = cart;
      if (appliedPromoCode) {
        return {
          success: false,
          error: this._createError(
            PromotionEngine.ErrorCodes.ALREADY_APPLIED,
            'A promo code is already applied. Remove it first to use a different code.',
            { currentCode: appliedPromoCode }
          ),
        };
      }

      // Find promotion by code
      const promo = await this._getPromotionByCode(normalizedCode);

      if (!promo) {
        return {
          success: false,
          error: this._createError(
            PromotionEngine.ErrorCodes.INVALID_CODE,
            `Promo code "${normalizedCode}" is not valid`
          ),
        };
      }

      // Validate the promotion against the cart
      const validation = await this.validatePromotion(promo, cart);

      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      // Calculate the discount
      const discount = await this.calculateDiscount(cart, promo);

      if (discount.discountCents <= 0) {
        return {
          success: false,
          error: this._createError(
            PromotionEngine.ErrorCodes.NO_DISCOUNT,
            'This promo code does not apply to any items in your cart'
          ),
        };
      }

      // Check stacking with existing auto-apply promotions
      const stackingResult = await this._checkCodeStacking(promo, cart);

      return {
        success: true,
        data: {
          promotion: {
            id: promo.id,
            code: promo.promo_code,
            name: promo.name,
            promoType: promo.promo_type,
            description: promo.description,
          },
          discountCents: discount.discountCents,
          discountDollars: discount.discountCents / 100,
          description: discount.description,
          affectedItems: discount.affectedItems,
          freeItems: discount.freeItems,

          // Stacking info
          canStackWithAutoApply: stackingResult.canStack,
          stackableAutoApply: stackingResult.stackablePromotions,
          totalWithStacking: discount.discountCents + stackingResult.stackedDiscountCents,

          // For UI
          message: `Promo code applied! You save $${(discount.discountCents / 100).toFixed(2)}`,
        },
      };
    } catch (error) {
      console.error('[PromotionEngine] applyPromoCode error:', error);
      return {
        success: false,
        error: this._createError(
          PromotionEngine.ErrorCodes.INVALID_CODE,
          'An error occurred while applying the promo code'
        ),
      };
    }
  }

  /**
   * Calculate the discount amount for a promotion
   *
   * @param {object} cart - Cart object
   * @param {object} promotion - Promotion object
   * @returns {object} Discount calculation result
   */
  async calculateDiscount(cart, promotion) {
    const { items: rawItems, subtotalCents = 0 } = cart || {};
    const items = rawItems || [];
    const calculatedSubtotal = subtotalCents || this._calculateSubtotal(items);

    let discountCents = 0;
    let affectedItems = [];
    let freeItems = [];
    let description = '';

    try {
      switch (promotion.promo_type || promotion.promoType) {
        case 'percent_order':
          discountCents = Math.round(
            calculatedSubtotal * (promotion.discount_percent || promotion.discountPercent) / 100
          );
          // Apply max discount cap
          if (promotion.max_discount_cents || promotion.maxDiscountCents) {
            discountCents = Math.min(
              discountCents,
              promotion.max_discount_cents || promotion.maxDiscountCents
            );
          }
          description = `${promotion.discount_percent || promotion.discountPercent}% off entire order`;
          affectedItems = items.map((item) => ({
            itemId: item.id,
            productId: item.productId,
            discountCents: Math.round(
              (item.quantity * item.unitPriceCents) *
              (promotion.discount_percent || promotion.discountPercent) / 100
            ),
          }));
          break;

        case 'fixed_order':
          discountCents = Math.min(
            promotion.discount_amount_cents || promotion.discountAmountCents,
            calculatedSubtotal
          );
          description = `$${(discountCents / 100).toFixed(2)} off order`;
          break;

        case 'percent_product':
        case 'category_percent':
          const matchingItemsPercent = await this._getMatchingItems(promotion.id, items);
          for (const item of matchingItemsPercent) {
            const itemDiscount = Math.round(
              (item.quantity * item.unitPriceCents) *
              (promotion.discount_percent || promotion.discountPercent) / 100
            );
            discountCents += itemDiscount;
            affectedItems.push({
              itemId: item.id,
              productId: item.productId,
              discountCents: itemDiscount,
            });
          }
          if (promotion.max_discount_cents || promotion.maxDiscountCents) {
            discountCents = Math.min(
              discountCents,
              promotion.max_discount_cents || promotion.maxDiscountCents
            );
          }
          description = `${promotion.discount_percent || promotion.discountPercent}% off select items`;
          break;

        case 'fixed_product':
        case 'category_fixed':
          const matchingItemsFixed = await this._getMatchingItems(promotion.id, items);
          for (const item of matchingItemsFixed) {
            const itemDiscount = item.quantity *
              (promotion.discount_amount_cents || promotion.discountAmountCents);
            discountCents += itemDiscount;
            affectedItems.push({
              itemId: item.id,
              productId: item.productId,
              discountCents: itemDiscount,
            });
          }
          description = `$${((promotion.discount_amount_cents || promotion.discountAmountCents) / 100).toFixed(2)} off each qualifying item`;
          break;

        case 'buy_x_get_y':
          const buyQty = promotion.buy_quantity || promotion.buyQuantity;
          const getQty = promotion.get_quantity || promotion.getQuantity;
          const getDiscountPct = promotion.get_discount_percent || promotion.getDiscountPercent || 100;

          const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
          const setSize = buyQty + getQty;
          const fullSets = Math.floor(totalQty / setSize);

          if (fullSets > 0) {
            // Sort items by price (lowest first for free items)
            const sortedItems = [...items].sort((a, b) => a.unitPriceCents - b.unitPriceCents);
            let freeQtyRemaining = fullSets * getQty;

            for (const item of sortedItems) {
              if (freeQtyRemaining <= 0) break;

              const freeQty = Math.min(item.quantity, freeQtyRemaining);
              const itemDiscount = Math.round(freeQty * item.unitPriceCents * getDiscountPct / 100);

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
          description = getDiscountPct === 100
            ? `Buy ${buyQty} Get ${getQty} Free`
            : `Buy ${buyQty} Get ${getQty} at ${getDiscountPct}% off`;
          break;

        case 'bundle':
          const bundleItems = promotion.bundle_items || promotion.bundleItems || [];
          const bundlePrice = promotion.bundle_price_cents || promotion.bundlePriceCents;
          let bundleComplete = true;
          let regularBundlePrice = 0;

          for (const bundleItem of bundleItems) {
            const cartItem = items.find((i) => i.productId === bundleItem.productId);
            if (!cartItem || cartItem.quantity < bundleItem.quantity) {
              bundleComplete = false;
              break;
            }
            regularBundlePrice += bundleItem.quantity * cartItem.unitPriceCents;
          }

          if (bundleComplete) {
            discountCents = Math.max(0, regularBundlePrice - bundlePrice);
            description = `Bundle deal: Save $${(discountCents / 100).toFixed(2)}`;
          }
          break;

        case 'free_item_threshold':
          const threshold = promotion.threshold_amount_cents || promotion.thresholdAmountCents;

          if (calculatedSubtotal >= threshold) {
            const freeProductId = promotion.free_item_product_id || promotion.freeItemProductId;
            const freeItemValue = promotion.free_item_value_cents || promotion.freeItemValueCents;

            if (freeProductId) {
              // Get product price
              const productResult = await this.pool.query(
                `SELECT retail_price_cents, name FROM products WHERE id = $1`,
                [freeProductId]
              );
              if (productResult.rows.length > 0) {
                discountCents = productResult.rows[0].retail_price_cents;
                freeItems.push({
                  productId: freeProductId,
                  productName: productResult.rows[0].name,
                  quantity: 1,
                  valueCents: discountCents,
                });
                description = `Free ${productResult.rows[0].name} with purchase over $${(threshold / 100).toFixed(2)}`;
              }
            } else if (freeItemValue) {
              discountCents = freeItemValue;
              freeItems.push({
                productId: null,
                quantity: 1,
                valueCents: freeItemValue,
                description: `Free item up to $${(freeItemValue / 100).toFixed(2)}`,
              });
              description = `Free item (up to $${(freeItemValue / 100).toFixed(2)}) with purchase over $${(threshold / 100).toFixed(2)}`;
            }
          }
          break;

        default:
          console.warn(`[PromotionEngine] Unknown promotion type: ${promotion.promo_type || promotion.promoType}`);
      }

      return {
        success: true,
        discountCents,
        discountDollars: discountCents / 100,
        description,
        affectedItems,
        freeItems,
        promoType: promotion.promo_type || promotion.promoType,
      };
    } catch (error) {
      console.error('[PromotionEngine] calculateDiscount error:', error);
      return {
        success: false,
        discountCents: 0,
        discountDollars: 0,
        description: '',
        affectedItems: [],
        freeItems: [],
        error: error.message,
      };
    }
  }

  /**
   * Validate a promotion against the cart
   *
   * @param {object} promotion - Promotion object
   * @param {object} cart - Cart object
   * @returns {object} Validation result
   */
  async validatePromotion(promotion, cart) {
    const { items: rawItems, customer = null, subtotalCents = 0 } = cart || {};
    const items = rawItems || [];
    const calculatedSubtotal = subtotalCents || this._calculateSubtotal(items);
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const now = new Date();

    // Check status
    const status = promotion.status;
    if (status === 'paused') {
      return {
        valid: false,
        error: this._createError(
          PromotionEngine.ErrorCodes.PROMOTION_PAUSED,
          'This promotion is currently paused'
        ),
      };
    }

    if (status === 'archived' || status === 'draft') {
      return {
        valid: false,
        error: this._createError(
          PromotionEngine.ErrorCodes.INVALID_CODE,
          'This promotion is not available'
        ),
      };
    }

    // Check dates
    const startDate = promotion.start_date || promotion.startDate;
    const endDate = promotion.end_date || promotion.endDate;

    if (startDate && new Date(startDate) > now) {
      return {
        valid: false,
        error: this._createError(
          PromotionEngine.ErrorCodes.NOT_STARTED,
          `This promotion starts on ${new Date(startDate).toLocaleDateString()}`,
          { startsAt: startDate }
        ),
      };
    }

    if (endDate && new Date(endDate) < now) {
      return {
        valid: false,
        error: this._createError(
          PromotionEngine.ErrorCodes.EXPIRED,
          'This promotion has expired',
          { expiredAt: endDate }
        ),
      };
    }

    // Check total usage limit
    const maxUsesTotal = promotion.max_uses_total || promotion.maxUsesTotal;
    const currentUses = promotion.current_uses || promotion.currentUses || 0;

    if (maxUsesTotal && currentUses >= maxUsesTotal) {
      return {
        valid: false,
        error: this._createError(
          PromotionEngine.ErrorCodes.USAGE_LIMIT_REACHED,
          'This promotion has reached its usage limit'
        ),
      };
    }

    // Check per-customer usage limit
    const maxUsesPerCustomer = promotion.max_uses_per_customer || promotion.maxUsesPerCustomer;

    if (maxUsesPerCustomer && customer?.id) {
      const customerUsageCount = await this._getCustomerUsageCount(promotion.id, customer.id);

      if (customerUsageCount >= maxUsesPerCustomer) {
        return {
          valid: false,
          error: this._createError(
            PromotionEngine.ErrorCodes.CUSTOMER_LIMIT_REACHED,
            `You've already used this promotion ${maxUsesPerCustomer} time${maxUsesPerCustomer > 1 ? 's' : ''}`,
            { usageCount: customerUsageCount, maxUses: maxUsesPerCustomer }
          ),
        };
      }
    }

    // Check minimum order amount
    const minOrderCents = promotion.min_order_cents || promotion.minOrderCents || 0;

    if (minOrderCents > 0 && calculatedSubtotal < minOrderCents) {
      const needed = minOrderCents - calculatedSubtotal;
      return {
        valid: false,
        error: this._createError(
          PromotionEngine.ErrorCodes.MIN_ORDER_NOT_MET,
          `Add $${(needed / 100).toFixed(2)} more to use this promotion (minimum: $${(minOrderCents / 100).toFixed(2)})`,
          { minimum: minOrderCents, current: calculatedSubtotal, needed }
        ),
      };
    }

    // Check minimum quantity
    const minQuantity = promotion.min_quantity || promotion.minQuantity || 0;

    if (minQuantity > 0 && totalQuantity < minQuantity) {
      const needed = minQuantity - totalQuantity;
      return {
        valid: false,
        error: this._createError(
          PromotionEngine.ErrorCodes.MIN_QUANTITY_NOT_MET,
          `Add ${needed} more item${needed > 1 ? 's' : ''} to use this promotion (minimum: ${minQuantity})`,
          { minimum: minQuantity, current: totalQuantity, needed }
        ),
      };
    }

    // Check customer tier
    const tierRequired = promotion.customer_tier_required || promotion.customerTierRequired;
    const tiersAllowed = promotion.customer_tiers_allowed || promotion.customerTiersAllowed;

    if (tierRequired && customer) {
      const customerTier = customer.pricingTier || customer.pricing_tier;
      if (customerTier !== tierRequired) {
        return {
          valid: false,
          error: this._createError(
            PromotionEngine.ErrorCodes.CUSTOMER_TIER_INVALID,
            `This promotion is only available for ${tierRequired} customers`,
            { required: tierRequired, current: customerTier }
          ),
        };
      }
    }

    if (tiersAllowed && tiersAllowed.length > 0 && customer) {
      const customerTier = customer.pricingTier || customer.pricing_tier;
      if (!tiersAllowed.includes(customerTier)) {
        return {
          valid: false,
          error: this._createError(
            PromotionEngine.ErrorCodes.CUSTOMER_TIER_INVALID,
            `This promotion is only available for ${tiersAllowed.join(', ')} customers`,
            { allowed: tiersAllowed, current: customerTier }
          ),
        };
      }
    }

    // Check product eligibility for product-specific promotions
    const promoType = promotion.promo_type || promotion.promoType;
    if (['percent_product', 'fixed_product', 'category_percent', 'category_fixed'].includes(promoType)) {
      const matchingItems = await this._getMatchingItems(promotion.id, items);

      if (matchingItems.length === 0) {
        return {
          valid: false,
          error: this._createError(
            PromotionEngine.ErrorCodes.PRODUCTS_NOT_ELIGIBLE,
            'None of your cart items qualify for this promotion'
          ),
        };
      }
    }

    // Check bundle completeness
    if (promoType === 'bundle') {
      const bundleItems = promotion.bundle_items || promotion.bundleItems || [];

      for (const bundleItem of bundleItems) {
        const cartItem = items.find((i) => i.productId === bundleItem.productId);
        if (!cartItem || cartItem.quantity < bundleItem.quantity) {
          return {
            valid: false,
            error: this._createError(
              PromotionEngine.ErrorCodes.PRODUCTS_NOT_ELIGIBLE,
              'Your cart is missing items required for this bundle deal'
            ),
          };
        }
      }
    }

    // Check custom rules
    const rules = await this._getPromotionRules(promotion.id);
    for (const rule of rules) {
      const ruleResult = await this._validateRule(rule, cart);
      if (!ruleResult.valid) {
        return {
          valid: false,
          error: this._createError(
            PromotionEngine.ErrorCodes.RULE_NOT_MET,
            ruleResult.message || 'Promotion requirements not met',
            { rule: rule.rule_type }
          ),
        };
      }
    }

    // Check schedule restrictions
    const scheduleValid = await this._checkScheduleRestrictions(promotion.id);
    if (!scheduleValid) {
      return {
        valid: false,
        error: this._createError(
          PromotionEngine.ErrorCodes.RULE_NOT_MET,
          'This promotion is not available at this time'
        ),
      };
    }

    return { valid: true };
  }

  /**
   * Record promotion usage after successful transaction
   *
   * @param {number} promotionId - Promotion ID
   * @param {number} customerId - Customer ID (optional)
   * @param {number} orderId - Transaction/Order ID
   * @param {number} discountCents - Discount amount applied
   * @param {object} metadata - Additional metadata
   * @returns {object} Usage record result
   */
  async recordUsage(promotionId, customerId, orderId, discountCents, metadata = {}) {
    try {
      const { userId, codeEntered, itemsAffected, freeItemsGiven, isQuote = false } = metadata;

      // Insert usage record
      const result = await this.pool.query(
        `INSERT INTO pos_promotion_usage (
          promotion_id,
          ${isQuote ? 'quotation_id' : 'transaction_id'},
          customer_id,
          user_id,
          discount_applied_cents,
          items_affected,
          free_items_given,
          code_entered
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [
          promotionId,
          orderId,
          customerId || null,
          userId || null,
          discountCents,
          itemsAffected ? JSON.stringify(itemsAffected) : null,
          freeItemsGiven ? JSON.stringify(freeItemsGiven) : null,
          codeEntered || null,
        ]
      );

      // Increment usage counter on promotion
      await this.pool.query(
        `UPDATE pos_promotions
        SET current_uses = current_uses + 1,
            updated_at = NOW()
        WHERE id = $1`,
        [promotionId]
      );

      // Check if promotion is now exhausted
      await this.pool.query(
        `UPDATE pos_promotions
        SET status = 'exhausted', updated_at = NOW()
        WHERE id = $1
        AND max_uses_total IS NOT NULL
        AND current_uses >= max_uses_total
        AND status = 'active'`,
        [promotionId]
      );

      return {
        success: true,
        usageId: result.rows[0].id,
      };
    } catch (error) {
      console.error('[PromotionEngine] recordUsage error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get the best combination of promotions for a cart
   * Considers stacking rules and returns optimal discount
   *
   * @param {object} cart - Cart object
   * @param {string} promoCode - Optional promo code
   * @returns {object} Optimized promotion combination
   */
  async getBestPromotionCombination(cart, promoCode = null) {
    try {
      let codePromotion = null;
      let codeDiscount = 0;

      // If promo code provided, validate and calculate
      if (promoCode) {
        const codeResult = await this.applyPromoCode(cart, promoCode);
        if (codeResult.success) {
          codePromotion = codeResult.data;
          codeDiscount = codeResult.data.discountCents;
        } else {
          return {
            success: false,
            error: codeResult.error,
          };
        }
      }

      // Get all applicable auto-apply promotions
      const applicableResult = await this.findApplicablePromotions(cart);

      if (!applicableResult.success) {
        return applicableResult;
      }

      const { autoApplyPromotions, bestPromotion, stackablePromotions } = applicableResult.data;

      // Calculate total discount based on stacking rules
      let totalDiscount = codeDiscount;
      const appliedPromotions = [];

      if (codePromotion) {
        appliedPromotions.push({
          type: 'code',
          promotion: codePromotion.promotion,
          discountCents: codePromotion.discountCents,
        });
      }

      // Add stackable auto-apply promotions
      for (const stackable of stackablePromotions) {
        // Check if this can stack with the code promotion
        if (codePromotion) {
          const canStack = await this._canPromotionsStack(
            codePromotion.promotion.id,
            stackable.promotion.id
          );
          if (!canStack) continue;
        }

        totalDiscount += stackable.discountCents;
        appliedPromotions.push({
          type: 'auto',
          promotion: stackable.promotion,
          discountCents: stackable.discountCents,
        });
      }

      // If no code promotion, add best auto-apply
      if (!codePromotion && bestPromotion) {
        totalDiscount += bestPromotion.discountCents;
        appliedPromotions.push({
          type: 'auto',
          promotion: bestPromotion.promotion,
          discountCents: bestPromotion.discountCents,
        });
      }

      return {
        success: true,
        data: {
          appliedPromotions,
          totalDiscountCents: totalDiscount,
          totalDiscountDollars: totalDiscount / 100,
          hasCodePromotion: !!codePromotion,
          autoApplyCount: appliedPromotions.filter((p) => p.type === 'auto').length,
          summary: `Total savings: $${(totalDiscount / 100).toFixed(2)}`,
        },
      };
    } catch (error) {
      console.error('[PromotionEngine] getBestPromotionCombination error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Calculate cart subtotal from items
   */
  _calculateSubtotal(items) {
    if (!items || !Array.isArray(items)) return 0;
    return items.reduce((sum, item) => {
      const price = item.unitPriceCents || Math.round((item.unitPrice || 0) * 100);
      return sum + (item.quantity * price);
    }, 0);
  }

  /**
   * Get all active auto-apply promotions
   */
  async _getAutoApplyPromotions() {
    const result = await this.pool.query(
      `SELECT * FROM pos_promotions
      WHERE status = 'active'
      AND (auto_apply = TRUE OR promo_code IS NULL)
      AND (start_date IS NULL OR start_date <= NOW())
      AND (end_date IS NULL OR end_date > NOW())
      AND (max_uses_total IS NULL OR current_uses < max_uses_total)
      ORDER BY priority DESC`
    );
    return result.rows;
  }

  /**
   * Get all promotions requiring a code
   */
  async _getCodePromotions() {
    const result = await this.pool.query(
      `SELECT * FROM pos_promotions
      WHERE status = 'active'
      AND promo_code IS NOT NULL
      AND auto_apply = FALSE
      AND (start_date IS NULL OR start_date <= NOW())
      AND (end_date IS NULL OR end_date > NOW())
      AND (max_uses_total IS NULL OR current_uses < max_uses_total)
      ORDER BY priority DESC`
    );
    return result.rows;
  }

  /**
   * Get promotion by promo code
   */
  async _getPromotionByCode(code) {
    const result = await this.pool.query(
      `SELECT * FROM pos_promotions
      WHERE UPPER(promo_code) = UPPER($1)`,
      [code]
    );
    return result.rows[0] || null;
  }

  /**
   * Get customer's usage count for a promotion
   */
  async _getCustomerUsageCount(promotionId, customerId) {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM pos_promotion_usage
      WHERE promotion_id = $1
      AND customer_id = $2
      AND status = 'applied'`,
      [promotionId, customerId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get items that match promotion's product targeting
   */
  async _getMatchingItems(promotionId, items) {
    // Get included product targets
    const includeResult = await this.pool.query(
      `SELECT * FROM pos_promotion_products
      WHERE promotion_id = $1 AND is_included = TRUE`,
      [promotionId]
    );

    // Get excluded product targets
    const excludeResult = await this.pool.query(
      `SELECT * FROM pos_promotion_products
      WHERE promotion_id = $1 AND is_included = FALSE`,
      [promotionId]
    );

    const includes = includeResult.rows;
    const excludes = excludeResult.rows;

    // If no include rules, all items are potentially eligible
    const matchingItems = items.filter((item) => {
      // Check exclusions first
      const isExcluded = excludes.some((excl) => {
        if (excl.product_id && excl.product_id === item.productId) return true;
        if (excl.category_name && excl.category_name === (item.categoryName || item.category)) return true;
        if (excl.brand_name && excl.brand_name === (item.brandName || item.brand)) return true;
        if (excl.sku_pattern && item.sku && item.sku.match(new RegExp(excl.sku_pattern.replace(/%/g, '.*')))) return true;
        return false;
      });

      if (isExcluded) return false;

      // If no include rules, item is eligible
      if (includes.length === 0) return true;

      // Check inclusions
      return includes.some((incl) => {
        if (incl.product_id && incl.product_id === item.productId) return true;
        if (incl.category_name && incl.category_name === (item.categoryName || item.category)) return true;
        if (incl.brand_name && incl.brand_name === (item.brandName || item.brand)) return true;
        if (incl.sku_pattern && item.sku && item.sku.match(new RegExp(incl.sku_pattern.replace(/%/g, '.*')))) return true;
        return false;
      });
    });

    return matchingItems;
  }

  /**
   * Get promotion rules
   */
  async _getPromotionRules(promotionId) {
    const result = await this.pool.query(
      `SELECT * FROM pos_promotion_rules WHERE promotion_id = $1`,
      [promotionId]
    );
    return result.rows;
  }

  /**
   * Validate a single rule against the cart
   */
  async _validateRule(rule, cart) {
    const { items, customer, subtotalCents } = cart;
    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);

    switch (rule.rule_type) {
      case 'min_order_amount':
        return {
          valid: subtotalCents >= rule.value_int,
          message: `Minimum order of $${(rule.value_int / 100).toFixed(2)} required`,
        };

      case 'min_order_quantity':
        return {
          valid: totalQty >= rule.value_int,
          message: `Minimum ${rule.value_int} items required`,
        };

      case 'min_product_quantity':
        if (rule.product_id) {
          const item = items.find((i) => i.productId === rule.product_id);
          return {
            valid: item && item.quantity >= rule.value_int,
            message: `Minimum ${rule.value_int} of specific product required`,
          };
        }
        return { valid: true };

      case 'customer_tier':
        if (!customer) return { valid: false, message: 'Customer required for this promotion' };
        const customerTier = customer.pricingTier || customer.pricing_tier;
        const allowedTiers = rule.value_array || [rule.value_text];
        return {
          valid: allowedTiers.includes(customerTier),
          message: `Only available for ${allowedTiers.join(', ')} customers`,
        };

      case 'first_purchase':
        if (!customer?.id) return { valid: true }; // Guest checkout allowed
        const purchaseCount = await this._getCustomerPurchaseCount(customer.id);
        return {
          valid: purchaseCount === 0,
          message: 'Only valid for first-time customers',
        };

      case 'day_of_week':
        const today = new Date().getDay();
        const validDays = rule.value_array || [];
        return {
          valid: validDays.includes(today),
          message: 'Not valid today',
        };

      case 'time_of_day':
        if (rule.value_range) {
          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          const { min, max } = rule.value_range;
          return {
            valid: currentMinutes >= min && currentMinutes <= max,
            message: 'Not valid at this time',
          };
        }
        return { valid: true };

      case 'payment_method':
        // This would be checked at payment time
        return { valid: true };

      case 'exclude_on_sale':
        // Filter out items that are already on sale
        return { valid: true };

      default:
        return { valid: true };
    }
  }

  /**
   * Get customer's purchase count
   */
  async _getCustomerPurchaseCount(customerId) {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM transactions WHERE customer_id = $1`,
      [customerId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Check schedule restrictions for a promotion
   */
  async _checkScheduleRestrictions(promotionId) {
    const result = await this.pool.query(
      `SELECT * FROM pos_promotion_schedules WHERE promotion_id = $1`,
      [promotionId]
    );

    if (result.rows.length === 0) {
      return true; // No schedule restrictions
    }

    const schedule = result.rows[0];
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

    // Check day of week
    if (schedule.valid_days && schedule.valid_days.length > 0) {
      if (!schedule.valid_days.includes(currentDay)) {
        return false;
      }
    }

    // Check time of day
    if (schedule.valid_time_start && schedule.valid_time_end) {
      if (currentTime < schedule.valid_time_start || currentTime > schedule.valid_time_end) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get stackable promotions from valid auto-apply list
   */
  _getStackablePromotions(validPromotions, bestPromotion) {
    if (!bestPromotion) {
      return validPromotions.filter((p) => p.promotion.combinable);
    }

    return validPromotions.filter((p) => {
      // Skip the best promotion itself
      if (p.promotion.id === bestPromotion.promotion.id) return false;

      // Must be marked as combinable
      if (!p.promotion.combinable) return false;

      // If in same combination group as best, can't stack
      if (
        p.promotion.combination_group &&
        bestPromotion.promotion.combination_group &&
        p.promotion.combination_group === bestPromotion.promotion.combination_group
      ) {
        return false;
      }

      return true;
    });
  }

  /**
   * Calculate total discount from stacked promotions
   */
  _calculateStackedDiscount(promotions) {
    return promotions.reduce((sum, p) => sum + p.discountCents, 0);
  }

  /**
   * Check if code promotion can stack with auto-apply promotions
   */
  async _checkCodeStacking(codePromotion, cart) {
    const { appliedPromotions = [] } = cart;

    // Get all auto-apply promotions that are currently applied or could be applied
    const applicableResult = await this.findApplicablePromotions({
      ...cart,
      appliedPromotions: [],
    });

    if (!applicableResult.success) {
      return {
        canStack: false,
        stackablePromotions: [],
        stackedDiscountCents: 0,
      };
    }

    const stackable = [];
    let stackedDiscount = 0;

    for (const autoPromo of applicableResult.data.stackablePromotions) {
      // Check if this can stack with code promotion
      const canStack = await this._canPromotionsStack(codePromotion.id, autoPromo.promotion.id);

      if (canStack) {
        stackable.push(autoPromo);
        stackedDiscount += autoPromo.discountCents;
      }
    }

    return {
      canStack: stackable.length > 0 || codePromotion.combinable,
      stackablePromotions: stackable,
      stackedDiscountCents: stackedDiscount,
    };
  }

  /**
   * Check if two promotions can stack together
   */
  async _canPromotionsStack(promoId1, promoId2) {
    // Check explicit combination rules
    const result = await this.pool.query(
      `SELECT * FROM pos_promotion_combinations
      WHERE (promotion_id = $1 AND cannot_combine_with_id = $2)
      OR (promotion_id = $2 AND cannot_combine_with_id = $1)`,
      [promoId1, promoId2]
    );

    if (result.rows.length > 0) {
      return false; // Explicit deny rule exists
    }

    // Check if either has explicit allow rules
    const allowResult = await this.pool.query(
      `SELECT * FROM pos_promotion_combinations
      WHERE promotion_id IN ($1, $2) AND can_combine_with_id IS NOT NULL`,
      [promoId1, promoId2]
    );

    // If there are allow rules, check if the other promo is in the list
    if (allowResult.rows.length > 0) {
      const allowed1 = allowResult.rows
        .filter((r) => r.promotion_id === promoId1)
        .map((r) => r.can_combine_with_id);
      const allowed2 = allowResult.rows
        .filter((r) => r.promotion_id === promoId2)
        .map((r) => r.can_combine_with_id);

      // If promo1 has allow rules, promo2 must be in them (and vice versa)
      if (allowed1.length > 0 && !allowed1.includes(promoId2)) return false;
      if (allowed2.length > 0 && !allowed2.includes(promoId1)) return false;
    }

    // Get both promotions to check combinable flag and combination groups
    const promosResult = await this.pool.query(
      `SELECT id, combinable, combination_group FROM pos_promotions WHERE id IN ($1, $2)`,
      [promoId1, promoId2]
    );

    const promos = promosResult.rows;
    if (promos.length !== 2) return false;

    const promo1 = promos.find((p) => p.id === promoId1);
    const promo2 = promos.find((p) => p.id === promoId2);

    // Both must be combinable
    if (!promo1.combinable && !promo2.combinable) return false;

    // Can't be in the same combination group
    if (
      promo1.combination_group &&
      promo2.combination_group &&
      promo1.combination_group === promo2.combination_group
    ) {
      return false;
    }

    return true;
  }

  // ============================================================================
  // CART CHECK METHOD (for automatic promotion detection)
  // ============================================================================

  /**
   * Check cart for all applicable promotions with near-miss detection
   * Designed for performance - call on cart changes with debouncing
   *
   * @param {object} cart - Cart object
   * @param {Array} cart.items - Cart items
   * @param {object} cart.customer - Customer (optional)
   * @param {number} cart.subtotalCents - Subtotal in cents
   * @param {number} cart.appliedPromotionId - Currently applied promotion (optional)
   * @returns {object} Comprehensive promotion check result
   */
  async checkCartPromotions(cart) {
    try {
      const { items: rawItems, customer = null, subtotalCents = 0, appliedPromotionId = null } = cart || {};
      const items = rawItems || [];
      const calculatedSubtotal = subtotalCents || this._calculateSubtotal(items);
      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

      // Early return for empty cart
      if (items.length === 0 || calculatedSubtotal === 0) {
        return {
          success: true,
          data: {
            autoApplied: [],
            available: [],
            nearMiss: [],
            bestAutoApply: null,
            totalAutoDiscountCents: 0,
            summary: {
              hasAutoApply: false,
              hasAvailableCodes: false,
              hasNearMiss: false,
            },
          },
        };
      }

      // Get all promotions in parallel for performance
      const [autoApplyPromosRaw, codePromosRaw] = await Promise.all([
        this._getAutoApplyPromotions(),
        this._getCodePromotions(),
      ]);

      // Process auto-apply promotions
      const autoApplied = [];
      const nearMiss = [];

      for (const promo of autoApplyPromosRaw) {
        // Skip if this is the currently applied promo
        if (appliedPromotionId && promo.id === appliedPromotionId) {
          continue;
        }

        const validation = await this.validatePromotion(promo, { items, customer, subtotalCents: calculatedSubtotal });

        if (validation.valid) {
          const discount = await this.calculateDiscount({ items, subtotalCents: calculatedSubtotal }, promo);

          if (discount.discountCents > 0) {
            autoApplied.push({
              id: promo.id,
              name: promo.name,
              description: promo.description,
              promoType: promo.promo_type,
              discountCents: discount.discountCents,
              discountDescription: discount.description,
              badgeText: promo.badge_text,
              priority: promo.priority || 0,
              combinable: promo.combinable || false,
            });
          }
        } else if (validation.error) {
          // Check for near-miss conditions
          const nearMissInfo = this._checkNearMiss(promo, validation.error, calculatedSubtotal, totalQuantity);
          if (nearMissInfo) {
            nearMiss.push(nearMissInfo);
          }
        }
      }

      // Sort auto-apply by discount (highest first)
      autoApplied.sort((a, b) => b.discountCents - a.discountCents);

      // Get best auto-apply
      const bestAutoApply = autoApplied.length > 0 ? autoApplied[0] : null;

      // Process code promotions for availability display
      const available = [];
      for (const promo of codePromosRaw) {
        // Only show codes that could potentially apply
        const preValidation = await this._quickValidateForDisplay(promo, { items, customer, subtotalCents: calculatedSubtotal });

        if (preValidation.displayable) {
          available.push({
            id: promo.id,
            code: promo.promo_code,
            name: promo.name,
            description: promo.description,
            promoType: promo.promo_type,
            badgeText: promo.badge_text,
            hint: preValidation.hint,
            potentialDiscountCents: preValidation.potentialDiscount,
          });
        }

        // Also check for near-miss on code promotions
        if (preValidation.nearMiss) {
          nearMiss.push(preValidation.nearMiss);
        }
      }

      // Sort near-miss by how close they are (smallest gap first)
      nearMiss.sort((a, b) => {
        if (a.type === 'amount' && b.type === 'amount') {
          return a.neededCents - b.neededCents;
        }
        if (a.type === 'quantity' && b.type === 'quantity') {
          return a.neededQuantity - b.neededQuantity;
        }
        // Amount-based near misses first (usually more actionable)
        return a.type === 'amount' ? -1 : 1;
      });

      // Limit near-miss to top 3 most relevant
      const topNearMiss = nearMiss.slice(0, 3);

      // Calculate total auto-apply discount (considering stacking)
      let totalAutoDiscountCents = 0;
      if (bestAutoApply) {
        totalAutoDiscountCents = bestAutoApply.discountCents;

        // Add stackable promotions
        for (const promo of autoApplied.slice(1)) {
          if (promo.combinable && !bestAutoApply.combinable) {
            // Can stack if one is combinable
            totalAutoDiscountCents += promo.discountCents;
          } else if (promo.combinable && bestAutoApply.combinable) {
            // Both combinable - can stack
            totalAutoDiscountCents += promo.discountCents;
          }
        }
      }

      return {
        success: true,
        data: {
          // Promotions that will auto-apply (sorted by discount)
          autoApplied,

          // Code promotions available to offer customer
          available,

          // Promotions customer is close to qualifying for
          nearMiss: topNearMiss,

          // Best single auto-apply promotion
          bestAutoApply,

          // Total discount from all auto-apply
          totalAutoDiscountCents,

          // Quick summary flags
          summary: {
            hasAutoApply: autoApplied.length > 0,
            hasAvailableCodes: available.length > 0,
            hasNearMiss: topNearMiss.length > 0,
            autoApplyCount: autoApplied.length,
            availableCodesCount: available.length,
            nearMissCount: topNearMiss.length,
          },
        },
      };
    } catch (error) {
      console.error('[PromotionEngine] checkCartPromotions error:', error);
      return {
        success: false,
        error: error.message,
        data: {
          autoApplied: [],
          available: [],
          nearMiss: [],
          bestAutoApply: null,
          totalAutoDiscountCents: 0,
          summary: {
            hasAutoApply: false,
            hasAvailableCodes: false,
            hasNearMiss: false,
          },
        },
      };
    }
  }

  /**
   * Check if a promotion validation error indicates a near-miss
   * @private
   */
  _checkNearMiss(promotion, error, currentSubtotal, currentQuantity) {
    // Near-miss threshold: within 20% of requirement or $20/$5 items
    const AMOUNT_THRESHOLD_PERCENT = 0.20;
    const AMOUNT_THRESHOLD_CENTS = 2000; // $20
    const QUANTITY_THRESHOLD = 5;

    if (error.code === PromotionEngine.ErrorCodes.MIN_ORDER_NOT_MET) {
      const neededCents = error.needed;
      const minRequired = error.minimum;

      // Check if within threshold
      const percentAway = neededCents / minRequired;
      if (percentAway <= AMOUNT_THRESHOLD_PERCENT || neededCents <= AMOUNT_THRESHOLD_CENTS) {
        return {
          type: 'amount',
          promotionId: promotion.id,
          promotionName: promotion.name,
          description: promotion.description,
          promoType: promotion.promo_type,
          message: `Add $${(neededCents / 100).toFixed(2)} more to unlock: ${promotion.name}`,
          neededCents,
          currentCents: currentSubtotal,
          requiredCents: minRequired,
          percentComplete: Math.round((currentSubtotal / minRequired) * 100),
        };
      }
    }

    if (error.code === PromotionEngine.ErrorCodes.MIN_QUANTITY_NOT_MET) {
      const neededQty = error.needed;
      const minRequired = error.minimum;

      if (neededQty <= QUANTITY_THRESHOLD) {
        return {
          type: 'quantity',
          promotionId: promotion.id,
          promotionName: promotion.name,
          description: promotion.description,
          promoType: promotion.promo_type,
          message: `Add ${neededQty} more item${neededQty > 1 ? 's' : ''} to unlock: ${promotion.name}`,
          neededQuantity: neededQty,
          currentQuantity,
          requiredQuantity: minRequired,
          percentComplete: Math.round((currentQuantity / minRequired) * 100),
        };
      }
    }

    return null;
  }

  /**
   * Quick validation for display purposes (not full validation)
   * @private
   */
  async _quickValidateForDisplay(promotion, cart) {
    const { items, customer, subtotalCents } = cart;
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const now = new Date();

    // Check basic status
    if (promotion.status !== 'active') {
      return { displayable: false };
    }

    // Check dates
    if (promotion.start_date && new Date(promotion.start_date) > now) {
      return { displayable: false };
    }
    if (promotion.end_date && new Date(promotion.end_date) < now) {
      return { displayable: false };
    }

    // Check usage limits
    if (promotion.max_uses_total && promotion.current_uses >= promotion.max_uses_total) {
      return { displayable: false };
    }

    // Check customer tier if required
    if (promotion.customer_tier_required && customer) {
      const customerTier = customer.pricingTier || customer.pricing_tier;
      if (customerTier !== promotion.customer_tier_required) {
        return { displayable: false };
      }
    }

    // Check minimum requirements for display/near-miss
    const minOrderCents = promotion.min_order_cents || 0;
    const minQuantity = promotion.min_quantity || 0;
    let hint = null;
    let nearMiss = null;

    if (minOrderCents > 0 && subtotalCents < minOrderCents) {
      const needed = minOrderCents - subtotalCents;
      const percentAway = needed / minOrderCents;

      hint = `Minimum $${(minOrderCents / 100).toFixed(2)} order required`;

      // Check for near-miss
      if (percentAway <= 0.20 || needed <= 2000) {
        nearMiss = {
          type: 'amount',
          promotionId: promotion.id,
          promotionName: promotion.name,
          description: promotion.description,
          promoType: promotion.promo_type,
          code: promotion.promo_code,
          message: `Add $${(needed / 100).toFixed(2)} more to use code ${promotion.promo_code}`,
          neededCents: needed,
          currentCents: subtotalCents,
          requiredCents: minOrderCents,
          percentComplete: Math.round((subtotalCents / minOrderCents) * 100),
        };
      }
    }

    if (minQuantity > 0 && totalQuantity < minQuantity) {
      const needed = minQuantity - totalQuantity;
      hint = hint || `Minimum ${minQuantity} items required`;

      if (needed <= 5 && !nearMiss) {
        nearMiss = {
          type: 'quantity',
          promotionId: promotion.id,
          promotionName: promotion.name,
          description: promotion.description,
          promoType: promotion.promo_type,
          code: promotion.promo_code,
          message: `Add ${needed} more item${needed > 1 ? 's' : ''} to use code ${promotion.promo_code}`,
          neededQuantity: needed,
          currentQuantity: totalQuantity,
          requiredQuantity: minQuantity,
          percentComplete: Math.round((totalQuantity / minQuantity) * 100),
        };
      }
    }

    // Calculate potential discount for display
    let potentialDiscount = 0;
    try {
      const discountResult = await this.calculateDiscount({ items, subtotalCents }, promotion);
      potentialDiscount = discountResult.discountCents || 0;
    } catch {
      // Ignore calculation errors for display purposes
    }

    return {
      displayable: true,
      hint,
      nearMiss,
      potentialDiscount,
    };
  }
}

module.exports = PromotionEngine;
