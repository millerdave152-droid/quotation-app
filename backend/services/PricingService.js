/**
 * Pricing Service
 * Handles pricing calculations, margins, violations, and customer-specific pricing
 */

class PricingService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Get all price points for a product
   * @param {number} productId - Product ID
   * @returns {Promise<object>} Price points
   */
  async getPricePoints(productId) {
    const cacheKey = `pricing:points:${productId}`;

    const fetchPrices = async () => {
      const result = await this.pool.query(`
        SELECT
          id,
          model,
          manufacturer,
          name,
          cost_cents,
          msrp_cents,
          map_cents,
          lap_cents,
          umrp_cents,
          pmap_cents,
          promo_price_cents,
          promo_name,
          promo_start_date,
          promo_end_date,
          min_margin_percent,
          target_margin_percent,
          price_effective_date,
          price_expiry_date,
          price_source,
          price_last_updated
        FROM products
        WHERE id = $1
      `, [productId]);

      if (result.rows.length === 0) {
        throw new Error(`Product ${productId} not found`);
      }

      const product = result.rows[0];

      // Check if promo is active
      const now = new Date();
      const promoActive = product.promo_price_cents &&
        (!product.promo_start_date || new Date(product.promo_start_date) <= now) &&
        (!product.promo_end_date || new Date(product.promo_end_date) >= now);

      return {
        ...product,
        promo_active: promoActive,
        effective_sell_price: promoActive ? product.promo_price_cents : product.msrp_cents
      };
    };

    if (!this.cache) {
      return await fetchPrices();
    }

    return await this.cache.cacheQuery(cacheKey, 'short', fetchPrices);
  }

  /**
   * Calculate margins at different price points
   * @param {number} productId - Product ID
   * @param {number} sellPriceCents - Optional specific sell price
   * @returns {Promise<object>} Margin calculations
   */
  async calculateMargins(productId, sellPriceCents = null) {
    const pricePoints = await this.getPricePoints(productId);
    const costCents = pricePoints.cost_cents || 0;

    if (!costCents) {
      return {
        error: 'No cost data available',
        pricePoints
      };
    }

    const calculateMargin = (sellPrice) => {
      if (!sellPrice || sellPrice <= 0) return null;
      const margin = ((sellPrice - costCents) / sellPrice) * 100;
      return Math.round(margin * 100) / 100;
    };

    const calculateMarkup = (sellPrice) => {
      if (!sellPrice || costCents <= 0) return null;
      const markup = ((sellPrice - costCents) / costCents) * 100;
      return Math.round(markup * 100) / 100;
    };

    const calculateProfit = (sellPrice) => {
      if (!sellPrice) return null;
      return sellPrice - costCents;
    };

    const margins = {
      productId,
      model: pricePoints.model,
      manufacturer: pricePoints.manufacturer,
      cost_cents: costCents,
      min_margin_percent: pricePoints.min_margin_percent,
      target_margin_percent: pricePoints.target_margin_percent,

      // At MSRP
      msrp: {
        price_cents: pricePoints.msrp_cents,
        margin_percent: calculateMargin(pricePoints.msrp_cents),
        markup_percent: calculateMarkup(pricePoints.msrp_cents),
        profit_cents: calculateProfit(pricePoints.msrp_cents)
      },

      // At MAP
      map: {
        price_cents: pricePoints.map_cents,
        margin_percent: calculateMargin(pricePoints.map_cents),
        markup_percent: calculateMarkup(pricePoints.map_cents),
        profit_cents: calculateProfit(pricePoints.map_cents)
      },

      // At LAP
      lap: {
        price_cents: pricePoints.lap_cents,
        margin_percent: calculateMargin(pricePoints.lap_cents),
        markup_percent: calculateMarkup(pricePoints.lap_cents),
        profit_cents: calculateProfit(pricePoints.lap_cents)
      },

      // At UMRP
      umrp: {
        price_cents: pricePoints.umrp_cents,
        margin_percent: calculateMargin(pricePoints.umrp_cents),
        markup_percent: calculateMarkup(pricePoints.umrp_cents),
        profit_cents: calculateProfit(pricePoints.umrp_cents)
      },

      // At Promo Price
      promo: pricePoints.promo_active ? {
        price_cents: pricePoints.promo_price_cents,
        margin_percent: calculateMargin(pricePoints.promo_price_cents),
        markup_percent: calculateMarkup(pricePoints.promo_price_cents),
        profit_cents: calculateProfit(pricePoints.promo_price_cents),
        promo_name: pricePoints.promo_name,
        ends: pricePoints.promo_end_date
      } : null
    };

    // If specific sell price provided
    if (sellPriceCents) {
      margins.custom = {
        price_cents: sellPriceCents,
        margin_percent: calculateMargin(sellPriceCents),
        markup_percent: calculateMarkup(sellPriceCents),
        profit_cents: calculateProfit(sellPriceCents)
      };
    }

    return margins;
  }

  /**
   * Check for price violations
   * @param {number} productId - Product ID
   * @param {number} sellPriceCents - Proposed sell price
   * @returns {Promise<object>} Violation check results
   */
  async checkPriceViolations(productId, sellPriceCents) {
    const pricePoints = await this.getPricePoints(productId);
    const violations = [];

    // Check MAP violation
    if (pricePoints.map_cents && sellPriceCents < pricePoints.map_cents) {
      violations.push({
        type: 'below_map',
        severity: 'high',
        threshold_cents: pricePoints.map_cents,
        difference_cents: pricePoints.map_cents - sellPriceCents,
        message: `Price is $${((pricePoints.map_cents - sellPriceCents) / 100).toFixed(2)} below MAP`
      });
    }

    // Check UMRP violation
    if (pricePoints.umrp_cents && sellPriceCents < pricePoints.umrp_cents) {
      violations.push({
        type: 'below_umrp',
        severity: 'high',
        threshold_cents: pricePoints.umrp_cents,
        difference_cents: pricePoints.umrp_cents - sellPriceCents,
        message: `Price is $${((pricePoints.umrp_cents - sellPriceCents) / 100).toFixed(2)} below UMRP`
      });
    }

    // Check LAP violation
    if (pricePoints.lap_cents && sellPriceCents < pricePoints.lap_cents) {
      violations.push({
        type: 'below_lap',
        severity: 'medium',
        threshold_cents: pricePoints.lap_cents,
        difference_cents: pricePoints.lap_cents - sellPriceCents,
        message: `Price is $${((pricePoints.lap_cents - sellPriceCents) / 100).toFixed(2)} below LAP`
      });
    }

    // Check cost violation (selling below cost)
    if (pricePoints.cost_cents && sellPriceCents < pricePoints.cost_cents) {
      violations.push({
        type: 'below_cost',
        severity: 'critical',
        threshold_cents: pricePoints.cost_cents,
        difference_cents: pricePoints.cost_cents - sellPriceCents,
        message: `Price is $${((pricePoints.cost_cents - sellPriceCents) / 100).toFixed(2)} below cost`
      });
    }

    // Check minimum margin violation
    if (pricePoints.cost_cents && pricePoints.min_margin_percent) {
      const margin = ((sellPriceCents - pricePoints.cost_cents) / sellPriceCents) * 100;
      if (margin < pricePoints.min_margin_percent) {
        violations.push({
          type: 'below_min_margin',
          severity: 'medium',
          threshold_percent: pricePoints.min_margin_percent,
          actual_percent: Math.round(margin * 100) / 100,
          message: `Margin ${margin.toFixed(1)}% is below minimum ${pricePoints.min_margin_percent}%`
        });
      }
    }

    return {
      productId,
      sellPriceCents,
      hasViolations: violations.length > 0,
      violations,
      requiresApproval: violations.some(v => ['critical', 'high'].includes(v.severity))
    };
  }

  /**
   * Log a price violation
   * @param {object} violationData - Violation details
   * @returns {Promise<object>} Created violation record
   */
  async logViolation(violationData) {
    const {
      productId,
      quotationId = null,
      orderId = null,
      violationType,
      quotedPriceCents,
      thresholdPriceCents,
      createdBy
    } = violationData;

    const result = await this.pool.query(`
      INSERT INTO price_violations (
        product_id, quotation_id, order_id,
        violation_type, quoted_price_cents, threshold_price_cents,
        difference_cents, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      productId, quotationId, orderId,
      violationType, quotedPriceCents, thresholdPriceCents,
      thresholdPriceCents - quotedPriceCents, createdBy
    ]);

    return result.rows[0];
  }

  /**
   * Get recommended price for a product/customer combination
   * @param {number} productId - Product ID
   * @param {number} customerId - Customer ID (optional)
   * @returns {Promise<object>} Recommended price
   */
  async getRecommendedPrice(productId, customerId = null) {
    const pricePoints = await this.getPricePoints(productId);

    let recommendation = {
      productId,
      basePrice: pricePoints.msrp_cents,
      priceSource: 'msrp'
    };

    // Check for active promo
    if (pricePoints.promo_active) {
      recommendation.basePrice = pricePoints.promo_price_cents;
      recommendation.priceSource = 'promo';
      recommendation.promoName = pricePoints.promo_name;
    }

    // If customer provided, check for customer-specific pricing
    if (customerId) {
      // Check negotiated price first
      const negotiatedResult = await this.pool.query(`
        SELECT *
        FROM customer_negotiated_prices
        WHERE customer_id = $1
          AND product_id = $2
          AND is_active = true
          AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
          AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
        ORDER BY negotiated_price_cents ASC
        LIMIT 1
      `, [customerId, productId]);

      if (negotiatedResult.rows.length > 0) {
        const negotiated = negotiatedResult.rows[0];
        recommendation.recommendedPrice = negotiated.negotiated_price_cents;
        recommendation.priceSource = 'negotiated';
        recommendation.validUntil = negotiated.valid_until;
        return recommendation;
      }

      // Check customer price tier
      const tierResult = await this.pool.query(`
        SELECT cpt.*
        FROM customers c
        JOIN customer_price_tiers cpt ON c.price_tier_id = cpt.id
        WHERE c.id = $1 AND cpt.is_active = true
      `, [customerId]);

      if (tierResult.rows.length > 0) {
        const tier = tierResult.rows[0];
        recommendation.tier = tier.tier_name;

        // Apply tier discount
        if (tier.discount_percent > 0) {
          const discountedPrice = Math.round(
            recommendation.basePrice * (1 - tier.discount_percent / 100)
          );
          recommendation.recommendedPrice = discountedPrice;
          recommendation.discountPercent = tier.discount_percent;
          recommendation.priceSource = 'tier';
        }
      }

      // Check for category discount
      const categoryResult = await this.pool.query(`
        SELECT ccd.*
        FROM customer_category_discounts ccd
        JOIN products p ON (
          p.category = ccd.category
          AND (ccd.manufacturer IS NULL OR p.manufacturer = ccd.manufacturer)
        )
        WHERE ccd.customer_id = $1
          AND p.id = $2
          AND ccd.is_active = true
          AND (ccd.valid_from IS NULL OR ccd.valid_from <= CURRENT_DATE)
          AND (ccd.valid_until IS NULL OR ccd.valid_until >= CURRENT_DATE)
        ORDER BY ccd.discount_percent DESC
        LIMIT 1
      `, [customerId, productId]);

      if (categoryResult.rows.length > 0) {
        const categoryDiscount = categoryResult.rows[0];
        const discountedPrice = Math.round(
          recommendation.basePrice * (1 - categoryDiscount.discount_percent / 100)
        );

        // Use category discount if better than tier
        if (!recommendation.recommendedPrice || discountedPrice < recommendation.recommendedPrice) {
          recommendation.recommendedPrice = discountedPrice;
          recommendation.discountPercent = categoryDiscount.discount_percent;
          recommendation.priceSource = 'category_discount';
        }
      }

      // Check customer's purchase history for this product
      const historyResult = await this.pool.query(`
        SELECT * FROM customer_product_history
        WHERE customer_id = $1 AND product_id = $2
      `, [customerId, productId]);

      if (historyResult.rows.length > 0) {
        recommendation.purchaseHistory = {
          timesPurchased: historyResult.rows[0].times_purchased,
          lastPricePaid: historyResult.rows[0].last_price_paid_cents,
          avgPricePaid: historyResult.rows[0].avg_price_paid_cents,
          lastPurchaseDate: historyResult.rows[0].last_purchase_date
        };
      }
    }

    // If no customer-specific pricing, use base
    if (!recommendation.recommendedPrice) {
      recommendation.recommendedPrice = recommendation.basePrice;
    }

    // Validate recommended price against minimums
    const violations = await this.checkPriceViolations(productId, recommendation.recommendedPrice);
    recommendation.hasViolations = violations.hasViolations;
    recommendation.violations = violations.violations;

    return recommendation;
  }

  /**
   * Simulate margin at a proposed price
   * @param {number} productId - Product ID
   * @param {number} proposedPriceCents - Proposed sell price
   * @returns {Promise<object>} Simulation results
   */
  async simulateMargin(productId, proposedPriceCents) {
    const pricePoints = await this.getPricePoints(productId);
    const costCents = pricePoints.cost_cents || 0;

    if (!costCents) {
      return { error: 'No cost data available' };
    }

    const margin = ((proposedPriceCents - costCents) / proposedPriceCents) * 100;
    const markup = ((proposedPriceCents - costCents) / costCents) * 100;
    const profit = proposedPriceCents - costCents;

    // Check violations
    const violations = await this.checkPriceViolations(productId, proposedPriceCents);

    // Compare to MSRP
    const msrpDiscount = pricePoints.msrp_cents
      ? ((pricePoints.msrp_cents - proposedPriceCents) / pricePoints.msrp_cents) * 100
      : null;

    return {
      productId,
      model: pricePoints.model,
      manufacturer: pricePoints.manufacturer,
      proposedPriceCents,
      costCents,
      profitCents: profit,
      marginPercent: Math.round(margin * 100) / 100,
      markupPercent: Math.round(markup * 100) / 100,
      msrpCents: pricePoints.msrp_cents,
      discountFromMsrp: msrpDiscount ? Math.round(msrpDiscount * 100) / 100 : null,
      meetsMinMargin: margin >= (pricePoints.min_margin_percent || 0),
      meetsTargetMargin: margin >= (pricePoints.target_margin_percent || 0),
      ...violations
    };
  }

  /**
   * Get customer price history for a product
   * @param {number} customerId - Customer ID
   * @param {number} productId - Product ID (optional, for all products if null)
   * @returns {Promise<Array>} Price history
   */
  async getCustomerPriceHistory(customerId, productId = null) {
    let query = `
      SELECT
        cph.*,
        p.model,
        p.manufacturer,
        p.name as product_name,
        p.msrp_cents as current_msrp
      FROM customer_product_history cph
      JOIN products p ON cph.product_id = p.id
      WHERE cph.customer_id = $1
    `;
    const params = [customerId];

    if (productId) {
      query += ` AND cph.product_id = $2`;
      params.push(productId);
    }

    query += ` ORDER BY cph.last_purchase_date DESC NULLS LAST`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get pending price violations
   * @param {object} options - Filter options
   * @returns {Promise<Array>} Violations
   */
  async getPendingViolations(options = {}) {
    const { status = 'pending', limit = 50 } = options;

    const result = await this.pool.query(`
      SELECT
        pv.*,
        p.model,
        p.manufacturer,
        p.msrp_cents,
        q.quote_number,
        o.order_number,
        c.company_name,
        c.contact_name
      FROM price_violations pv
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN quotations q ON pv.quotation_id = q.id
      LEFT JOIN orders o ON pv.order_id = o.id
      LEFT JOIN customers c ON q.customer_id = c.id OR o.customer_id = c.id
      WHERE pv.status = $1
      ORDER BY pv.created_at DESC
      LIMIT $2
    `, [status, limit]);

    return result.rows;
  }

  /**
   * Approve or reject a price violation
   * @param {number} violationId - Violation ID
   * @param {string} status - 'approved' or 'rejected'
   * @param {string} approvedBy - User approving
   * @param {string} notes - Approval notes
   * @returns {Promise<object>} Updated violation
   */
  async resolveViolation(violationId, status, approvedBy, notes = '') {
    if (!['approved', 'rejected'].includes(status)) {
      throw new Error('Status must be approved or rejected');
    }

    const result = await this.pool.query(`
      UPDATE price_violations
      SET
        status = $2,
        approved_by = $3,
        approval_notes = $4,
        resolved_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [violationId, status, approvedBy, notes]);

    return result.rows[0];
  }

  /**
   * Update customer product history after a purchase/quote
   * @param {number} customerId - Customer ID
   * @param {number} productId - Product ID
   * @param {object} data - Purchase/quote data
   * @returns {Promise<object>} Updated history record
   */
  async updateCustomerProductHistory(customerId, productId, data) {
    const {
      pricePaidCents,
      quantity = 1,
      type = 'purchase' // 'purchase' or 'quote'
    } = data;

    const result = await this.pool.query(`
      INSERT INTO customer_product_history (
        customer_id, product_id,
        times_purchased, total_qty_purchased,
        first_purchase_date, last_purchase_date,
        avg_price_paid_cents, min_price_paid_cents, max_price_paid_cents,
        last_price_paid_cents,
        times_quoted, last_quoted_date, last_quoted_price_cents
      )
      VALUES (
        $1, $2,
        ${type === 'purchase' ? 1 : 0},
        ${type === 'purchase' ? '$3' : 0},
        ${type === 'purchase' ? 'CURRENT_DATE' : 'NULL'},
        ${type === 'purchase' ? 'CURRENT_DATE' : 'NULL'},
        ${type === 'purchase' ? '$4' : 'NULL'},
        ${type === 'purchase' ? '$4' : 'NULL'},
        ${type === 'purchase' ? '$4' : 'NULL'},
        ${type === 'purchase' ? '$4' : 'NULL'},
        ${type === 'quote' ? 1 : 0},
        ${type === 'quote' ? 'CURRENT_DATE' : 'NULL'},
        ${type === 'quote' ? '$4' : 'NULL'}
      )
      ON CONFLICT (customer_id, product_id) DO UPDATE SET
        times_purchased = customer_product_history.times_purchased + ${type === 'purchase' ? 1 : 0},
        total_qty_purchased = customer_product_history.total_qty_purchased + ${type === 'purchase' ? '$3' : 0},
        first_purchase_date = COALESCE(customer_product_history.first_purchase_date, ${type === 'purchase' ? 'CURRENT_DATE' : 'customer_product_history.first_purchase_date'}),
        last_purchase_date = ${type === 'purchase' ? 'CURRENT_DATE' : 'customer_product_history.last_purchase_date'},
        avg_price_paid_cents = ${type === 'purchase' ? 'CASE WHEN customer_product_history.times_purchased = 0 THEN $4 ELSE (customer_product_history.avg_price_paid_cents * customer_product_history.times_purchased + $4) / (customer_product_history.times_purchased + 1) END' : 'customer_product_history.avg_price_paid_cents'},
        min_price_paid_cents = ${type === 'purchase' ? 'LEAST(COALESCE(customer_product_history.min_price_paid_cents, $4), $4)' : 'customer_product_history.min_price_paid_cents'},
        max_price_paid_cents = ${type === 'purchase' ? 'GREATEST(COALESCE(customer_product_history.max_price_paid_cents, $4), $4)' : 'customer_product_history.max_price_paid_cents'},
        last_price_paid_cents = ${type === 'purchase' ? '$4' : 'customer_product_history.last_price_paid_cents'},
        times_quoted = customer_product_history.times_quoted + ${type === 'quote' ? 1 : 0},
        last_quoted_date = ${type === 'quote' ? 'CURRENT_DATE' : 'customer_product_history.last_quoted_date'},
        last_quoted_price_cents = ${type === 'quote' ? '$4' : 'customer_product_history.last_quoted_price_cents'},
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [customerId, productId, quantity, pricePaidCents]);

    return result.rows[0];
  }
}

module.exports = PricingService;
