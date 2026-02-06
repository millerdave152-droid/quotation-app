/**
 * TeleTime POS - Upsell Service
 * Determines next-best-actions for upselling at checkout
 */

let db = require('../db');

class UpsellService {
  constructor() {
    // Cache for strategy lookups (TTL: 5 minutes)
    this.strategyCache = new Map();
    this.CACHE_TTL = 5 * 60 * 1000;

    // Maximum offers per checkout
    this.MAX_OFFERS = 3;

    // Priority weights for scoring
    this.PRIORITY_WEIGHTS = {
      margin: 0.35,
      relevance: 0.30,
      conversion_history: 0.20,
      urgency: 0.15,
    };
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Get prioritized upsell offers for a cart/customer context
   * @param {object} cart - Cart data with items, totals
   * @param {object} customer - Optional customer data
   * @param {object} options - Additional options
   * @returns {Promise<object>} Prioritized upsell offers
   */
  async getUpsellOffers(cart, customer = null, options = {}) {
    const {
      location = 'checkout',
      sessionId = null,
      maxOffers = this.MAX_OFFERS,
      excludeShownOffers = [],
      searchHistory = [], // Products customer searched for
    } = options;

    try {
      // 1. Build context
      const context = await this._buildContext(cart, customer);

      // 2. Evaluate all triggers to find matching strategies
      const matchingStrategies = await this.evaluateTriggers(cart, customer, {
        location,
        context,
      });

      if (matchingStrategies.length === 0) {
        return { offers: [], context: { reason: 'no_matching_strategies' } };
      }

      // 3. Get offers for each matching strategy
      const allOffers = [];
      for (const strategy of matchingStrategies) {
        const strategyOffers = await this._getStrategyOffers(
          strategy,
          cart,
          customer,
          context
        );
        allOffers.push(...strategyOffers);
      }

      // 4. Filter offers based on business rules
      const filteredOffers = await this._filterOffers(allOffers, {
        customer,
        cart,
        searchHistory,
        excludeShownOffers,
        context,
      });

      // 5. Score and rank offers
      const scoredOffers = await this._scoreOffers(filteredOffers, context);

      // 6. Select top offers (max 3)
      const topOffers = scoredOffers.slice(0, maxOffers);

      // 7. Enrich offers with display data
      const enrichedOffers = await this._enrichOffers(topOffers, cart);

      // 8. Record impressions if session provided
      if (sessionId && enrichedOffers.length > 0) {
        await this._recordImpressions(enrichedOffers, sessionId, customer?.id);
      }

      return {
        offers: enrichedOffers,
        context: {
          strategiesMatched: matchingStrategies.length,
          offersEvaluated: allOffers.length,
          offersFiltered: filteredOffers.length,
          cartValue: context.cartValueCents,
          customerType: context.customerType,
        },
      };
    } catch (error) {
      console.error('[UpsellService] getUpsellOffers error:', error);
      return { offers: [], error: error.message };
    }
  }

  /**
   * Evaluate all triggers against cart/customer context
   * @param {object} cart - Cart data
   * @param {object} customer - Customer data
   * @param {object} options - Additional options
   * @returns {Promise<Array>} Matching strategies
   */
  async evaluateTriggers(cart, customer = null, options = {}) {
    const { location = 'checkout', context = null } = options;

    try {
      const ctx = context || (await this._buildContext(cart, customer));

      // Get all active strategies for the location
      const strategies = await this._getActiveStrategies(location);

      const matchingStrategies = [];

      for (const strategy of strategies) {
        const matches = await this._evaluateStrategy(strategy, ctx, customer);
        if (matches) {
          matchingStrategies.push({
            ...strategy,
            matchScore: matches.score,
            matchReason: matches.reason,
          });
        }
      }

      // Sort by priority (lower = higher priority) then by match score
      matchingStrategies.sort((a, b) => {
        if (a.display_priority !== b.display_priority) {
          return a.display_priority - b.display_priority;
        }
        return b.matchScore - a.matchScore;
      });

      return matchingStrategies;
    } catch (error) {
      console.error('[UpsellService] evaluateTriggers error:', error);
      return [];
    }
  }

  /**
   * Calculate upgrade value proposition
   * @param {number} currentProductId - Current product ID
   * @param {number} upgradeProductId - Suggested upgrade product ID
   * @returns {Promise<object>} Upgrade value analysis
   */
  async calculateUpgradeValue(currentProductId, upgradeProductId) {
    try {
      // Get both products
      const [currentProduct, upgradeProduct] = await Promise.all([
        this._getProduct(currentProductId),
        this._getProduct(upgradeProductId),
      ]);

      if (!currentProduct || !upgradeProduct) {
        return { valid: false, reason: 'product_not_found' };
      }

      const currentPrice = currentProduct.price_cents || currentProduct.price * 100;
      const upgradePrice = upgradeProduct.price_cents || upgradeProduct.price * 100;
      const priceDifference = upgradePrice - currentPrice;

      if (priceDifference <= 0) {
        return { valid: false, reason: 'not_an_upgrade' };
      }

      // Calculate value propositions
      const dailyCostOver3Years = priceDifference / (3 * 365);
      const monthlyCost = priceDifference / 12;
      const percentageIncrease = ((priceDifference / currentPrice) * 100).toFixed(1);

      // Get margin data
      const currentCost = currentProduct.cost_cents || currentProduct.cost * 100 || 0;
      const upgradeCost = upgradeProduct.cost_cents || upgradeProduct.cost * 100 || 0;
      const additionalMargin = (upgradePrice - upgradeCost) - (currentPrice - currentCost);

      // Feature comparison (if available)
      const featureComparison = this._compareFeatures(currentProduct, upgradeProduct);

      // Generate value proposition text
      const valueProposition = this._generateValueProposition(
        priceDifference,
        dailyCostOver3Years,
        featureComparison,
        currentProduct,
        upgradeProduct
      );

      return {
        valid: true,
        currentProduct: {
          id: currentProduct.id || currentProduct.product_id,
          name: currentProduct.name || currentProduct.product_name,
          price: currentPrice / 100,
          priceCents: currentPrice,
        },
        upgradeProduct: {
          id: upgradeProduct.id || upgradeProduct.product_id,
          name: upgradeProduct.name || upgradeProduct.product_name,
          price: upgradePrice / 100,
          priceCents: upgradePrice,
        },
        priceDifference: priceDifference / 100,
        priceDifferenceCents: priceDifference,
        percentageIncrease: parseFloat(percentageIncrease),
        dailyCostOver3Years: Math.round(dailyCostOver3Years) / 100,
        monthlyCost: Math.round(monthlyCost) / 100,
        additionalMargin: additionalMargin / 100,
        additionalMarginCents: additionalMargin,
        featureComparison,
        valueProposition,
      };
    } catch (error) {
      console.error('[UpsellService] calculateUpgradeValue error:', error);
      return { valid: false, reason: 'calculation_error', error: error.message };
    }
  }

  /**
   * Record upsell result for analytics
   * @param {number} offerId - Offer ID
   * @param {number} orderId - Order ID (null if not converted)
   * @param {string} result - 'accepted', 'declined', 'ignored'
   * @param {object} options - Additional tracking data
   * @returns {Promise<object>} Result record
   */
  async recordUpsellResult(offerId, orderId, result, options = {}) {
    const {
      customerId = null,
      userId = null,
      sessionId = null,
      revenueAddedCents = 0,
      marginAddedCents = 0,
      declineReason = null,
      metadata = {},
    } = options;

    try {
      // Get offer and strategy info
      const offer = await db.query(
        'SELECT id, strategy_id FROM upsell_offers WHERE id = $1',
        [offerId]
      );

      if (offer.rows.length === 0) {
        throw new Error('Offer not found');
      }

      const strategyId = offer.rows[0].strategy_id;

      // Check if we're updating an existing impression or creating new
      let resultId;

      if (sessionId) {
        // Try to update existing shown record
        const updateResult = await db.query(
          `UPDATE upsell_results
           SET result = $1,
               order_id = $2,
               decided_at = NOW(),
               revenue_added_cents = $3,
               margin_added_cents = $4,
               decline_reason = $5,
               metadata = metadata || $6
           WHERE offer_id = $7 AND session_id = $8 AND result = 'shown'
           RETURNING id`,
          [result, orderId, revenueAddedCents, marginAddedCents, declineReason,
           JSON.stringify(metadata), offerId, sessionId]
        );

        if (updateResult.rows.length > 0) {
          resultId = updateResult.rows[0].id;
        }
      }

      // If no existing record, create new one
      if (!resultId) {
        const insertResult = await db.query(
          `INSERT INTO upsell_results (
            strategy_id, offer_id, order_id, customer_id, user_id,
            session_id, result, revenue_added_cents, margin_added_cents,
            decline_reason, metadata, decided_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
          RETURNING id`,
          [strategyId, offerId, orderId, customerId, userId, sessionId,
           result, revenueAddedCents, marginAddedCents, declineReason, metadata]
        );
        resultId = insertResult.rows[0].id;
      }

      // Update strategy counters
      if (result === 'accepted') {
        await db.query(
          `UPDATE upsell_strategies
           SET total_conversions = total_conversions + 1,
               total_revenue_cents = total_revenue_cents + $1
           WHERE id = $2`,
          [revenueAddedCents, strategyId]
        );

        // Update offer redemption counter
        await db.query(
          `UPDATE upsell_offers
           SET current_redemptions = current_redemptions + 1
           WHERE id = $1`,
          [offerId]
        );
      }

      return {
        success: true,
        resultId,
        strategyId,
        offerId,
        result,
        revenueAdded: revenueAddedCents / 100,
      };
    } catch (error) {
      console.error('[UpsellService] recordUpsellResult error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get service add-on recommendations for products in cart
   * @param {Array} cartItems - Cart items
   * @returns {Promise<Array>} Recommended services
   */
  async getServiceRecommendations(cartItems) {
    try {
      const categoryIds = [...new Set(cartItems.map(item => item.categoryId).filter(Boolean))];
      const productIds = cartItems.map(item => item.productId);

      const services = await db.query(
        `SELECT s.*,
                CASE
                  WHEN $1::int[] && s.eligible_products THEN 'product'
                  WHEN $2::int[] && s.eligible_categories THEN 'category'
                  ELSE 'general'
                END as match_type
         FROM services s
         WHERE s.is_active = true
           AND s.show_in_checkout = true
           AND (
             s.eligible_products IS NULL
             OR s.eligible_products && $1::int[]
             OR s.eligible_categories && $2::int[]
           )
         ORDER BY
           CASE WHEN $1::int[] && s.eligible_products THEN 0 ELSE 1 END,
           s.display_order`,
        [productIds, categoryIds]
      );

      return services.rows.map(service => ({
        serviceId: service.id,
        code: service.service_code,
        name: service.name,
        description: service.description,
        price: service.base_price_cents / 100,
        priceCents: service.base_price_cents,
        serviceType: service.service_type,
        requiresScheduling: service.requires_scheduling,
        durationMinutes: service.duration_minutes,
        matchType: service.match_type,
        icon: service.icon,
      }));
    } catch (error) {
      console.error('[UpsellService] getServiceRecommendations error:', error);
      return [];
    }
  }

  /**
   * Get membership offers for customer
   * @param {object} customer - Customer data
   * @param {number} cartValueCents - Cart value
   * @returns {Promise<Array>} Membership offers
   */
  async getMembershipOffers(customer, cartValueCents) {
    try {
      // Check if customer already has membership
      if (customer?.id) {
        const existingMembership = await db.query(
          `SELECT cm.*, mp.program_code
           FROM customer_memberships cm
           JOIN membership_programs mp ON mp.id = cm.program_id
           WHERE cm.customer_id = $1 AND cm.status = 'active'`,
          [customer.id]
        );

        if (existingMembership.rows.length > 0) {
          const currentTier = existingMembership.rows[0];

          // Offer upgrade if not on highest tier
          const higherTiers = await db.query(
            `SELECT * FROM membership_programs
             WHERE is_active = true AND tier_level > $1
             ORDER BY tier_level ASC LIMIT 1`,
            [currentTier.tier_level || 1]
          );

          if (higherTiers.rows.length > 0) {
            const upgrade = higherTiers.rows[0];
            const potentialSavings = Math.round(cartValueCents * (upgrade.discount_percent / 100));

            return [{
              type: 'upgrade',
              currentProgram: currentTier.program_code,
              program: this._formatMembershipProgram(upgrade),
              potentialSavings: potentialSavings / 100,
              potentialSavingsCents: potentialSavings,
              message: `Upgrade to ${upgrade.name} and save ${upgrade.discount_percent}% on every purchase!`,
            }];
          }

          return []; // Already on highest tier
        }
      }

      // Get available membership programs
      const programs = await db.query(
        `SELECT * FROM membership_programs
         WHERE is_active = true
         ORDER BY tier_level ASC`
      );

      return programs.rows.map(program => {
        const potentialSavings = Math.round(cartValueCents * (program.discount_percent / 100));
        const signupBonus = program.signup_bonus_cents || 0;

        return {
          type: 'signup',
          program: this._formatMembershipProgram(program),
          potentialSavings: potentialSavings / 100,
          potentialSavingsCents: potentialSavings,
          signupBonus: signupBonus / 100,
          signupBonusCents: signupBonus,
          totalValue: (potentialSavings + signupBonus) / 100,
          message: program.discount_percent > 0
            ? `Join ${program.name} and save ${program.discount_percent}% today!`
            : `Join ${program.name} and start earning rewards!`,
        };
      });
    } catch (error) {
      console.error('[UpsellService] getMembershipOffers error:', error);
      return [];
    }
  }

  /**
   * Get financing options for cart value
   * @param {number} cartValueCents - Cart value in cents
   * @returns {Promise<Array>} Available financing options
   */
  async getFinancingOptions(cartValueCents) {
    try {
      const options = await db.query(
        `SELECT * FROM financing_options
         WHERE is_active = true
           AND min_amount_cents <= $1
           AND (max_amount_cents IS NULL OR max_amount_cents >= $1)
           AND (promo_end_date IS NULL OR promo_end_date >= CURRENT_DATE)
         ORDER BY
           CASE WHEN is_promotional THEN 0 ELSE 1 END,
           apr ASC,
           term_months ASC`,
        [cartValueCents]
      );

      return options.rows.map(option => {
        const monthlyPayment = this._calculateMonthlyPayment(
          cartValueCents,
          option.apr,
          option.term_months
        );

        return {
          financingId: option.id,
          code: option.financing_code,
          name: option.name,
          description: option.description,
          provider: option.provider,
          termMonths: option.term_months,
          apr: parseFloat(option.apr),
          isPromotional: option.is_promotional,
          monthlyPayment: monthlyPayment / 100,
          monthlyPaymentCents: monthlyPayment,
          displayText: option.display_text?.replace('$XX', `$${(monthlyPayment / 100).toFixed(2)}`),
          highlightText: option.highlight_text,
          promoEndDate: option.promo_end_date,
          requiresApplication: option.requires_application,
          instantDecision: option.instant_decision,
        };
      });
    } catch (error) {
      console.error('[UpsellService] getFinancingOptions error:', error);
      return [];
    }
  }

  /**
   * Get upsell analytics for a time period
   * @param {object} options - Date range and filters
   * @returns {Promise<object>} Analytics data
   */
  async getAnalytics(options = {}) {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date(),
      strategyId = null,
      upsellType = null,
    } = options;

    try {
      // Overall metrics
      const overallQuery = `
        SELECT
          COUNT(*) FILTER (WHERE result = 'shown') AS impressions,
          COUNT(*) FILTER (WHERE result = 'accepted') AS conversions,
          COUNT(*) FILTER (WHERE result = 'declined') AS declines,
          COUNT(*) FILTER (WHERE result = 'ignored') AS ignored,
          SUM(revenue_added_cents) FILTER (WHERE result = 'accepted') AS total_revenue_cents,
          AVG(revenue_added_cents) FILTER (WHERE result = 'accepted') AS avg_revenue_cents
        FROM upsell_results ur
        JOIN upsell_strategies us ON us.id = ur.strategy_id
        WHERE ur.shown_at >= $1 AND ur.shown_at <= $2
          AND ($3::int IS NULL OR ur.strategy_id = $3)
          AND ($4::text IS NULL OR us.upsell_type = $4)
      `;

      const overall = await db.query(overallQuery, [startDate, endDate, strategyId, upsellType]);

      // By type breakdown
      const byTypeQuery = `
        SELECT
          us.upsell_type,
          COUNT(*) FILTER (WHERE ur.result = 'shown') AS impressions,
          COUNT(*) FILTER (WHERE ur.result = 'accepted') AS conversions,
          SUM(ur.revenue_added_cents) FILTER (WHERE ur.result = 'accepted') AS revenue_cents
        FROM upsell_results ur
        JOIN upsell_strategies us ON us.id = ur.strategy_id
        WHERE ur.shown_at >= $1 AND ur.shown_at <= $2
        GROUP BY us.upsell_type
      `;

      const byType = await db.query(byTypeQuery, [startDate, endDate]);

      // Top performing strategies
      const topStrategiesQuery = `
        SELECT
          us.id,
          us.name,
          us.upsell_type,
          COUNT(*) FILTER (WHERE ur.result = 'shown') AS impressions,
          COUNT(*) FILTER (WHERE ur.result = 'accepted') AS conversions,
          SUM(ur.revenue_added_cents) FILTER (WHERE ur.result = 'accepted') AS revenue_cents,
          CASE WHEN COUNT(*) FILTER (WHERE ur.result = 'shown') > 0
            THEN ROUND((COUNT(*) FILTER (WHERE ur.result = 'accepted')::decimal /
                       COUNT(*) FILTER (WHERE ur.result = 'shown')) * 100, 2)
            ELSE 0
          END AS conversion_rate
        FROM upsell_strategies us
        LEFT JOIN upsell_results ur ON ur.strategy_id = us.id
          AND ur.shown_at >= $1 AND ur.shown_at <= $2
        WHERE us.is_active = true
        GROUP BY us.id
        HAVING COUNT(*) FILTER (WHERE ur.result = 'shown') > 0
        ORDER BY revenue_cents DESC NULLS LAST
        LIMIT 10
      `;

      const topStrategies = await db.query(topStrategiesQuery, [startDate, endDate]);

      // Daily trend
      const trendQuery = `
        SELECT
          DATE(ur.shown_at) AS date,
          COUNT(*) FILTER (WHERE ur.result = 'shown') AS impressions,
          COUNT(*) FILTER (WHERE ur.result = 'accepted') AS conversions,
          SUM(ur.revenue_added_cents) FILTER (WHERE ur.result = 'accepted') AS revenue_cents
        FROM upsell_results ur
        WHERE ur.shown_at >= $1 AND ur.shown_at <= $2
        GROUP BY DATE(ur.shown_at)
        ORDER BY date
      `;

      const trend = await db.query(trendQuery, [startDate, endDate]);

      const metrics = overall.rows[0];
      const conversionRate = metrics.impressions > 0
        ? ((metrics.conversions / metrics.impressions) * 100).toFixed(2)
        : 0;

      return {
        period: { startDate, endDate },
        summary: {
          impressions: parseInt(metrics.impressions) || 0,
          conversions: parseInt(metrics.conversions) || 0,
          declines: parseInt(metrics.declines) || 0,
          ignored: parseInt(metrics.ignored) || 0,
          conversionRate: parseFloat(conversionRate),
          totalRevenue: (metrics.total_revenue_cents || 0) / 100,
          avgRevenuePerConversion: (metrics.avg_revenue_cents || 0) / 100,
        },
        byType: byType.rows.map(row => ({
          type: row.upsell_type,
          impressions: parseInt(row.impressions) || 0,
          conversions: parseInt(row.conversions) || 0,
          revenue: (row.revenue_cents || 0) / 100,
          conversionRate: row.impressions > 0
            ? ((row.conversions / row.impressions) * 100).toFixed(2)
            : 0,
        })),
        topStrategies: topStrategies.rows.map(row => ({
          id: row.id,
          name: row.name,
          type: row.upsell_type,
          impressions: parseInt(row.impressions) || 0,
          conversions: parseInt(row.conversions) || 0,
          revenue: (row.revenue_cents || 0) / 100,
          conversionRate: parseFloat(row.conversion_rate) || 0,
        })),
        dailyTrend: trend.rows.map(row => ({
          date: row.date,
          impressions: parseInt(row.impressions) || 0,
          conversions: parseInt(row.conversions) || 0,
          revenue: (row.revenue_cents || 0) / 100,
        })),
      };
    } catch (error) {
      console.error('[UpsellService] getAnalytics error:', error);
      throw error;
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Build context object from cart and customer
   */
  async _buildContext(cart, customer) {
    const items = cart.items || [];
    const cartValueCents = Math.round((cart.total || cart.subtotal || 0) * 100);
    const itemCount = items.reduce((sum, item) => sum + (item.quantity || 1), 0);

    // Extract product and category IDs
    const productIds = items.map(item => item.productId || item.product_id).filter(Boolean);
    const categoryIds = [...new Set(items.map(item => item.categoryId || item.category_id).filter(Boolean))];

    // Determine customer type
    let customerType = 'guest';
    let orderCount = 0;
    let lifetimeValue = 0;
    let hasMembership = false;

    if (customer?.id) {
      const customerStats = await db.query(
        `SELECT
           COUNT(DISTINCT o.id) as order_count,
           COALESCE(SUM(o.total_cents), 0) as lifetime_value,
           EXISTS(
             SELECT 1 FROM customer_memberships cm
             WHERE cm.customer_id = $1 AND cm.status = 'active'
           ) as has_membership
         FROM customers c
         LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'completed'
         WHERE c.id = $1
         GROUP BY c.id`,
        [customer.id]
      );

      if (customerStats.rows.length > 0) {
        const stats = customerStats.rows[0];
        orderCount = parseInt(stats.order_count) || 0;
        lifetimeValue = parseInt(stats.lifetime_value) || 0;
        hasMembership = stats.has_membership;

        customerType = orderCount === 0 ? 'new' : 'returning';
        if (orderCount >= 5 || lifetimeValue >= 100000) {
          customerType = 'vip';
        }
      }
    }

    // Get current time info for time-based triggers
    const now = new Date();
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
    const hourOfDay = now.getHours();

    return {
      productIds,
      categoryIds,
      cartValueCents,
      itemCount,
      customerType,
      customerId: customer?.id || null,
      orderCount,
      lifetimeValueCents: lifetimeValue,
      hasMembership,
      dayOfWeek,
      hourOfDay,
      timestamp: now,
    };
  }

  /**
   * Get active strategies for a location
   */
  async _getActiveStrategies(location) {
    const cacheKey = `strategies:${location}`;

    // Check cache
    if (this.strategyCache.has(cacheKey)) {
      const cached = this.strategyCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }
    }

    const result = await db.query(
      `SELECT *
       FROM upsell_strategies
       WHERE is_active = true
         AND (start_date IS NULL OR start_date <= CURRENT_DATE)
         AND (end_date IS NULL OR end_date >= CURRENT_DATE)
         AND (display_location = $1 OR display_location = 'any')
       ORDER BY display_priority ASC`,
      [location]
    );

    // Cache result
    this.strategyCache.set(cacheKey, {
      data: result.rows,
      timestamp: Date.now(),
    });

    return result.rows;
  }

  /**
   * Evaluate if a strategy matches the context
   */
  async _evaluateStrategy(strategy, context, customer) {
    const { trigger_type, trigger_value, conditions } = strategy;
    const triggerConfig = typeof trigger_value === 'string'
      ? JSON.parse(trigger_value)
      : trigger_value;

    let matches = false;
    let score = 0;
    let reason = '';

    switch (trigger_type) {
      case 'product':
        const triggerProducts = triggerConfig.product_ids || [];
        matches = context.productIds.some(id => triggerProducts.includes(id));
        if (matches) {
          score = 90;
          reason = 'product_match';
        }
        break;

      case 'category':
        const triggerCategories = triggerConfig.category_ids || [];
        const excludeProducts = triggerConfig.exclude_products || [];
        matches = context.categoryIds.some(id => triggerCategories.includes(id));

        // Check exclusions
        if (matches && excludeProducts.length > 0) {
          matches = !context.productIds.some(id => excludeProducts.includes(id));
        }

        // Check min price if specified
        if (matches && triggerConfig.min_price_cents) {
          matches = context.cartValueCents >= triggerConfig.min_price_cents;
        }

        if (matches) {
          score = 80;
          reason = 'category_match';
        }
        break;

      case 'cart_value':
        const minCents = triggerConfig.min_cents || 0;
        const maxCents = triggerConfig.max_cents || Infinity;
        matches = context.cartValueCents >= minCents && context.cartValueCents <= maxCents;
        if (matches) {
          // Higher score for higher cart values
          score = Math.min(100, 50 + (context.cartValueCents / 1000));
          reason = 'cart_value_match';
        }
        break;

      case 'customer_type':
        const allowedTypes = triggerConfig.types || [];
        matches = allowedTypes.includes(context.customerType);

        // Check membership status if specified
        if (matches && triggerConfig.has_membership !== undefined) {
          matches = context.hasMembership === triggerConfig.has_membership;
        }

        // Check order count if specified
        if (matches && triggerConfig.min_orders) {
          matches = context.orderCount >= triggerConfig.min_orders;
        }

        if (matches) {
          score = 70;
          reason = 'customer_type_match';
        }
        break;

      case 'cart_item_count':
        const minItems = triggerConfig.min_items || 0;
        const maxItems = triggerConfig.max_items || Infinity;
        matches = context.itemCount >= minItems && context.itemCount <= maxItems;
        if (matches) {
          score = 60;
          reason = 'item_count_match';
        }
        break;

      case 'time_based':
        const allowedDays = triggerConfig.days || [];
        const hours = triggerConfig.hours || {};

        const dayMatch = allowedDays.length === 0 || allowedDays.includes(context.dayOfWeek);
        const hourMatch = (!hours.start || context.hourOfDay >= hours.start) &&
                         (!hours.end || context.hourOfDay <= hours.end);

        matches = dayMatch && hourMatch;
        if (matches) {
          score = 50;
          reason = 'time_match';
        }
        break;

      case 'customer_history':
        const minOrders = triggerConfig.min_orders || 0;
        const minLifetimeValue = triggerConfig.min_lifetime_value_cents || 0;

        matches = context.orderCount >= minOrders &&
                  context.lifetimeValueCents >= minLifetimeValue;
        if (matches) {
          score = 85;
          reason = 'history_match';
        }
        break;
    }

    // Check additional conditions
    if (matches && conditions) {
      const condConfig = typeof conditions === 'string' ? JSON.parse(conditions) : conditions;

      // Max times per customer
      if (condConfig.max_times_per_customer && customer?.id) {
        const shown = await db.query(
          `SELECT COUNT(*) as count FROM upsell_results
           WHERE strategy_id = $1 AND customer_id = $2 AND result = 'accepted'`,
          [strategy.id, customer.id]
        );
        if (parseInt(shown.rows[0].count) >= condConfig.max_times_per_customer) {
          matches = false;
          reason = 'max_per_customer_reached';
        }
      }
    }

    return matches ? { score, reason } : null;
  }

  /**
   * Get offers for a matching strategy
   */
  async _getStrategyOffers(strategy, cart, customer, context) {
    const offers = await db.query(
      `SELECT uo.*, us.upsell_type
       FROM upsell_offers uo
       JOIN upsell_strategies us ON us.id = uo.strategy_id
       WHERE uo.strategy_id = $1
         AND uo.is_active = true
         AND (uo.valid_from IS NULL OR uo.valid_from <= NOW())
         AND (uo.valid_to IS NULL OR uo.valid_to >= NOW())
         AND (uo.max_redemptions IS NULL OR uo.current_redemptions < uo.max_redemptions)
       ORDER BY uo.display_order ASC`,
      [strategy.id]
    );

    return offers.rows.map(offer => ({
      ...offer,
      strategyName: strategy.name,
      strategyPriority: strategy.display_priority,
      matchScore: strategy.matchScore,
      matchReason: strategy.matchReason,
    }));
  }

  /**
   * Filter offers based on business rules
   */
  async _filterOffers(offers, options) {
    const { customer, cart, searchHistory, excludeShownOffers, context } = options;

    const filtered = [];

    for (const offer of offers) {
      // Skip already shown offers
      if (excludeShownOffers.includes(offer.id)) {
        continue;
      }

      // Don't offer membership to existing members
      if (offer.target_type === 'membership' && context.hasMembership) {
        continue;
      }

      // Don't show upgrade if customer searched for lower model
      if (offer.upsell_type === 'upgrade' && searchHistory.length > 0) {
        const searchedForLower = searchHistory.some(searchedId => {
          const cartHasUpgrade = cart.items?.some(item =>
            item.productId === offer.target_product_id
          );
          return !cartHasUpgrade && searchedId !== offer.target_product_id;
        });

        if (searchedForLower) {
          continue;
        }
      }

      // Check per-customer redemption limits
      if (offer.max_per_customer && customer?.id) {
        const redeemed = await db.query(
          `SELECT COUNT(*) as count FROM upsell_results
           WHERE offer_id = $1 AND customer_id = $2 AND result = 'accepted'`,
          [offer.id, customer.id]
        );

        if (parseInt(redeemed.rows[0].count) >= offer.max_per_customer) {
          continue;
        }
      }

      // Check source product/category match
      if (offer.source_product_ids && offer.source_product_ids.length > 0) {
        const hasMatch = context.productIds.some(id =>
          offer.source_product_ids.includes(id)
        );
        if (!hasMatch) continue;
      }

      if (offer.source_category_ids && offer.source_category_ids.length > 0) {
        const hasMatch = context.categoryIds.some(id =>
          offer.source_category_ids.includes(id)
        );
        if (!hasMatch) continue;
      }

      filtered.push(offer);
    }

    return filtered;
  }

  /**
   * Score and rank offers
   */
  async _scoreOffers(offers, context) {
    const scored = [];

    for (const offer of offers) {
      let score = offer.matchScore || 50;

      // Margin boost (if we have margin data)
      if (offer.target_product_id) {
        const product = await this._getProduct(offer.target_product_id);
        if (product) {
          const margin = this._calculateMargin(product);
          score += margin * this.PRIORITY_WEIGHTS.margin;
        }
      }

      // Relevance from strategy match
      score += (offer.matchScore || 0) * this.PRIORITY_WEIGHTS.relevance;

      // Historical conversion rate boost
      if (offer.strategy_id) {
        const conversionRate = await this._getStrategyConversionRate(offer.strategy_id);
        score += conversionRate * this.PRIORITY_WEIGHTS.conversion_history;
      }

      // Urgency boost for time-limited offers
      if (offer.valid_to) {
        const hoursLeft = (new Date(offer.valid_to) - new Date()) / (1000 * 60 * 60);
        if (hoursLeft <= 24) {
          score += 20 * this.PRIORITY_WEIGHTS.urgency;
        } else if (hoursLeft <= 72) {
          score += 10 * this.PRIORITY_WEIGHTS.urgency;
        }
      }

      // Strategy priority adjustment
      score -= (offer.strategyPriority || 100) * 0.1;

      scored.push({
        ...offer,
        finalScore: Math.round(score * 100) / 100,
      });
    }

    // Sort by score descending
    scored.sort((a, b) => b.finalScore - a.finalScore);

    return scored;
  }

  /**
   * Enrich offers with display data
   */
  async _enrichOffers(offers, cart) {
    const enriched = [];

    for (const offer of offers) {
      const enrichedOffer = {
        offerId: offer.id,
        strategyId: offer.strategy_id,
        type: offer.upsell_type,
        targetType: offer.target_type,
        title: offer.offer_title,
        subtitle: offer.offer_subtitle,
        description: offer.offer_description,
        imageUrl: offer.offer_image_url,
        badgeText: offer.badge_text,
        badgeColor: offer.badge_color,
        ctaText: offer.cta_text,
        priority: offer.finalScore,
        validTo: offer.valid_to,
      };

      // Add type-specific data
      switch (offer.upsell_type) {
        case 'upgrade':
          if (offer.target_product_id) {
            // Find current item in cart
            const currentItem = cart.items?.find(item => {
              return offer.source_product_ids?.includes(item.productId);
            });

            if (currentItem) {
              const upgradeValue = await this.calculateUpgradeValue(
                currentItem.productId,
                offer.target_product_id
              );

              if (upgradeValue.valid) {
                enrichedOffer.currentItem = upgradeValue.currentProduct;
                enrichedOffer.suggestedItem = upgradeValue.upgradeProduct;
                enrichedOffer.priceDifference = upgradeValue.priceDifference;
                enrichedOffer.priceDifferenceCents = upgradeValue.priceDifferenceCents;
                enrichedOffer.valueProposition = upgradeValue.valueProposition;
                enrichedOffer.featureComparison = upgradeValue.featureComparison;
              }
            }
          }
          break;

        case 'service':
          if (offer.target_service_id) {
            const service = await this._getService(offer.target_service_id);
            if (service) {
              enrichedOffer.service = {
                id: service.id,
                name: service.name,
                description: service.description,
                price: service.base_price_cents / 100,
                priceCents: service.base_price_cents,
                serviceType: service.service_type,
                duration: service.duration_minutes,
                requiresScheduling: service.requires_scheduling,
              };
            }
          }
          break;

        case 'membership':
          if (offer.target_membership_id) {
            const program = await this._getMembershipProgram(offer.target_membership_id);
            if (program) {
              const cartValue = Math.round((cart.total || 0) * 100);
              const potentialSavings = Math.round(cartValue * (program.discount_percent / 100));

              enrichedOffer.membership = this._formatMembershipProgram(program);
              enrichedOffer.potentialSavings = potentialSavings / 100;
              enrichedOffer.potentialSavingsCents = potentialSavings;
              enrichedOffer.signupBonus = (program.signup_bonus_cents || 0) / 100;
            }
          }
          break;

        case 'financing':
          if (offer.target_financing_id) {
            const financing = await this._getFinancingOption(offer.target_financing_id);
            if (financing) {
              const cartValue = Math.round((cart.total || 0) * 100);
              const monthlyPayment = this._calculateMonthlyPayment(
                cartValue,
                financing.apr,
                financing.term_months
              );

              enrichedOffer.financing = {
                id: financing.id,
                name: financing.name,
                provider: financing.provider,
                termMonths: financing.term_months,
                apr: parseFloat(financing.apr),
                monthlyPayment: monthlyPayment / 100,
                monthlyPaymentCents: monthlyPayment,
                isPromotional: financing.is_promotional,
                highlightText: financing.highlight_text,
              };
            }
          }
          break;
      }

      // Add value display
      if (offer.offer_value_cents) {
        enrichedOffer.offerValue = offer.offer_value_cents / 100;
        enrichedOffer.offerValueCents = offer.offer_value_cents;
      }
      if (offer.offer_value_percent) {
        enrichedOffer.offerValuePercent = parseFloat(offer.offer_value_percent);
      }

      // Add urgency if time-limited
      if (offer.valid_to) {
        const hoursLeft = (new Date(offer.valid_to) - new Date()) / (1000 * 60 * 60);
        if (hoursLeft <= 24) {
          enrichedOffer.urgency = 'Today only!';
          enrichedOffer.urgencyLevel = 'high';
        } else if (hoursLeft <= 72) {
          enrichedOffer.urgency = `Ends in ${Math.ceil(hoursLeft / 24)} days`;
          enrichedOffer.urgencyLevel = 'medium';
        }
      }

      enriched.push(enrichedOffer);
    }

    return enriched;
  }

  /**
   * Record impressions for shown offers
   */
  async _recordImpressions(offers, sessionId, customerId) {
    for (const offer of offers) {
      await db.query(
        `INSERT INTO upsell_results (strategy_id, offer_id, session_id, customer_id, result)
         VALUES ($1, $2, $3, $4, 'shown')
         ON CONFLICT DO NOTHING`,
        [offer.strategyId, offer.offerId, sessionId, customerId]
      );

      // Update strategy impression count
      await db.query(
        `UPDATE upsell_strategies
         SET total_impressions = total_impressions + 1
         WHERE id = $1`,
        [offer.strategyId]
      );
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  async _getProduct(productId) {
    const result = await db.query(
      `SELECT * FROM products WHERE id = $1 OR product_id = $1`,
      [productId]
    );
    return result.rows[0] || null;
  }

  async _getService(serviceId) {
    const result = await db.query(
      'SELECT * FROM services WHERE id = $1',
      [serviceId]
    );
    return result.rows[0] || null;
  }

  async _getMembershipProgram(programId) {
    const result = await db.query(
      'SELECT * FROM membership_programs WHERE id = $1',
      [programId]
    );
    return result.rows[0] || null;
  }

  async _getFinancingOption(financingId) {
    const result = await db.query(
      'SELECT * FROM financing_options WHERE id = $1',
      [financingId]
    );
    return result.rows[0] || null;
  }

  async _getStrategyConversionRate(strategyId) {
    const result = await db.query(
      `SELECT
         CASE WHEN total_impressions > 0
           THEN (total_conversions::decimal / total_impressions) * 100
           ELSE 0
         END as rate
       FROM upsell_strategies WHERE id = $1`,
      [strategyId]
    );
    return result.rows[0]?.rate || 0;
  }

  _calculateMargin(product) {
    const price = product.price_cents || product.price * 100 || 0;
    const cost = product.cost_cents || product.cost * 100 || 0;
    if (price === 0) return 0;
    return ((price - cost) / price) * 100;
  }

  _calculateMonthlyPayment(amountCents, apr, termMonths) {
    if (apr === 0) {
      return Math.ceil(amountCents / termMonths);
    }

    const monthlyRate = apr / 100 / 12;
    const payment = amountCents * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
                    (Math.pow(1 + monthlyRate, termMonths) - 1);
    return Math.ceil(payment);
  }

  _compareFeatures(currentProduct, upgradeProduct) {
    const features = [];

    // Size comparison (for TVs, monitors)
    const currentSize = this._extractSize(currentProduct.name);
    const upgradeSize = this._extractSize(upgradeProduct.name);
    if (currentSize && upgradeSize && upgradeSize > currentSize) {
      features.push({
        feature: 'Screen Size',
        current: `${currentSize}"`,
        upgrade: `${upgradeSize}"`,
        improvement: `+${upgradeSize - currentSize}" larger`,
      });
    }

    // Storage comparison
    const currentStorage = this._extractStorage(currentProduct.name);
    const upgradeStorage = this._extractStorage(upgradeProduct.name);
    if (currentStorage && upgradeStorage && upgradeStorage > currentStorage) {
      features.push({
        feature: 'Storage',
        current: this._formatStorage(currentStorage),
        upgrade: this._formatStorage(upgradeStorage),
        improvement: `${upgradeStorage / currentStorage}x more storage`,
      });
    }

    return features;
  }

  _extractSize(name) {
    const match = name?.match(/(\d+)["\s]*(?:inch|in|"|'')/i);
    return match ? parseInt(match[1]) : null;
  }

  _extractStorage(name) {
    const match = name?.match(/(\d+)\s*(GB|TB)/i);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2].toUpperCase();
    return unit === 'TB' ? value * 1000 : value;
  }

  _formatStorage(gb) {
    return gb >= 1000 ? `${gb / 1000}TB` : `${gb}GB`;
  }

  _generateValueProposition(priceDiff, dailyCost, features, current, upgrade) {
    const propositions = [];

    // Daily cost framing
    if (dailyCost < 1) {
      propositions.push(`That's only $${dailyCost.toFixed(2)} per day over 3 years!`);
    } else if (dailyCost < 5) {
      const weeklyCost = dailyCost * 7;
      propositions.push(`Less than $${weeklyCost.toFixed(2)} per week for a better experience!`);
    }

    // Feature-based
    if (features.length > 0) {
      const mainFeature = features[0];
      propositions.push(`Get ${mainFeature.improvement} for just $${(priceDiff / 100).toFixed(0)} more!`);
    }

    // Percentage framing
    if (priceDiff < current.priceCents * 0.2) {
      propositions.push(`Just ${((priceDiff / current.priceCents) * 100).toFixed(0)}% more for a significant upgrade!`);
    }

    return propositions[0] || `Upgrade for just $${(priceDiff / 100).toFixed(2)} more!`;
  }

  _formatMembershipProgram(program) {
    return {
      id: program.id,
      code: program.program_code,
      name: program.name,
      description: program.description,
      annualFee: program.annual_fee_cents / 100,
      annualFeeCents: program.annual_fee_cents,
      monthlyFee: program.monthly_fee_cents / 100,
      discountPercent: parseFloat(program.discount_percent) || 0,
      pointsMultiplier: parseFloat(program.points_multiplier) || 1,
      freeShippingThreshold: program.free_shipping_threshold_cents
        ? program.free_shipping_threshold_cents / 100
        : null,
      signupBonus: program.signup_bonus_cents / 100,
      signupBonusCents: program.signup_bonus_cents,
      tierLevel: program.tier_level,
      badgeColor: program.badge_color,
    };
  }

  /**
   * Clear strategy cache
   */
  clearCache() {
    this.strategyCache.clear();
  }
}

UpsellService.prototype._setPool = function(p) { db = p; };

module.exports = new UpsellService();
