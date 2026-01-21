/**
 * Dynamic Pricing Service
 * Provides AI-powered pricing recommendations based on:
 * - Customer tier and history
 * - Inventory levels
 * - Demand patterns
 * - Competitive positioning
 * - Margin protection
 */

class DynamicPricingService {
  constructor(pool) {
    this.pool = pool;

    // Default pricing rules configuration
    this.config = {
      // Customer tier discounts
      tierDiscounts: {
        platinum: 0.15,  // 15% discount
        gold: 0.10,      // 10% discount
        silver: 0.05,    // 5% discount
        bronze: 0.02     // 2% discount
      },
      // Inventory-based pricing
      inventoryThresholds: {
        overstock: { threshold: 200, discountRate: 0.10 },  // >200 units, 10% off
        high: { threshold: 100, discountRate: 0.05 },       // 100-200 units, 5% off
        normal: { threshold: 20, discountRate: 0 },         // 20-100 units, base price
        low: { threshold: 10, premiumRate: 0.05 },          // 10-20 units, 5% premium
        critical: { threshold: 0, premiumRate: 0.10 }       // <10 units, 10% premium
      },
      // Minimum margin protection
      minMarginPercent: 0.15,  // 15% minimum margin
      // Maximum discount cap
      maxDiscountPercent: 0.25,  // 25% max discount
      // Quantity break discounts
      quantityBreaks: [
        { minQty: 10, discount: 0.03 },   // 10+ units: 3% off
        { minQty: 25, discount: 0.05 },   // 25+ units: 5% off
        { minQty: 50, discount: 0.08 },   // 50+ units: 8% off
        { minQty: 100, discount: 0.10 }   // 100+ units: 10% off
      ]
    };
  }

  /**
   * Get dynamic price recommendation for a product
   * @param {number} productId - Product ID
   * @param {object} context - Pricing context
   * @param {number} context.customerId - Customer ID (optional)
   * @param {number} context.quantity - Quantity being purchased
   */
  async getPriceRecommendation(productId, context = {}) {
    const { customerId, quantity = 1 } = context;

    // Get product info
    const product = await this.getProduct(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    const basePrice = product.base_price_cents;
    const costPrice = product.cost_price_cents || Math.round(basePrice * 0.6); // Assume 40% margin if no cost

    // Calculate all applicable adjustments
    const adjustments = [];
    let recommendedPrice = basePrice;

    // 1. Customer tier adjustment
    if (customerId) {
      const tierAdjustment = await this.getCustomerTierAdjustment(customerId, basePrice);
      if (tierAdjustment.discount > 0) {
        adjustments.push(tierAdjustment);
        recommendedPrice -= tierAdjustment.discountCents;
      }
    }

    // 2. Inventory level adjustment
    const inventoryAdjustment = await this.getInventoryAdjustment(productId, basePrice);
    if (inventoryAdjustment.adjustment !== 0) {
      adjustments.push(inventoryAdjustment);
      recommendedPrice += inventoryAdjustment.adjustmentCents;
    }

    // 3. Quantity break discount
    if (quantity > 1) {
      const quantityAdjustment = this.getQuantityBreakAdjustment(quantity, basePrice);
      if (quantityAdjustment.discount > 0) {
        adjustments.push(quantityAdjustment);
        recommendedPrice -= quantityAdjustment.discountCents;
      }
    }

    // 4. Demand-based adjustment
    const demandAdjustment = await this.getDemandAdjustment(productId, basePrice);
    if (demandAdjustment.adjustment !== 0) {
      adjustments.push(demandAdjustment);
      recommendedPrice += demandAdjustment.adjustmentCents;
    }

    // 5. Apply margin protection
    const minPrice = Math.round(costPrice * (1 + this.config.minMarginPercent));
    const maxDiscount = Math.round(basePrice * this.config.maxDiscountPercent);

    if (recommendedPrice < minPrice) {
      recommendedPrice = minPrice;
      adjustments.push({
        type: 'margin_protection',
        description: 'Minimum margin enforced',
        original: recommendedPrice,
        protected: minPrice
      });
    }

    if (basePrice - recommendedPrice > maxDiscount) {
      recommendedPrice = basePrice - maxDiscount;
      adjustments.push({
        type: 'max_discount_cap',
        description: 'Maximum discount cap applied',
        cappedAt: this.config.maxDiscountPercent * 100
      });
    }

    // Calculate final metrics
    const totalDiscount = basePrice - recommendedPrice;
    const discountPercent = Math.round((totalDiscount / basePrice) * 100 * 10) / 10;
    const margin = recommendedPrice - costPrice;
    const marginPercent = Math.round((margin / recommendedPrice) * 100 * 10) / 10;

    return {
      productId,
      productName: product.name,
      sku: product.sku,
      basePrice,
      recommendedPrice,
      costPrice,
      totalDiscount,
      discountPercent,
      margin,
      marginPercent,
      quantity,
      lineTotal: recommendedPrice * quantity,
      adjustments,
      priceConfidence: this.calculateConfidence(adjustments),
      competitivePosition: await this.getCompetitivePosition(productId, recommendedPrice)
    };
  }

  /**
   * Get customer tier-based discount
   */
  async getCustomerTierAdjustment(customerId, basePrice) {
    const result = await this.pool.query(`
      SELECT clv_segment, clv_score, total_transactions
      FROM customers
      WHERE id = $1
    `, [customerId]);

    if (result.rows.length === 0) {
      return { type: 'customer_tier', discount: 0, discountCents: 0 };
    }

    const customer = result.rows[0];
    const tier = customer.clv_segment || 'bronze';
    const discount = this.config.tierDiscounts[tier] || 0;
    const discountCents = Math.round(basePrice * discount);

    return {
      type: 'customer_tier',
      tier,
      clvScore: customer.clv_score,
      discount,
      discountCents,
      description: `${tier.charAt(0).toUpperCase() + tier.slice(1)} tier: ${discount * 100}% off`
    };
  }

  /**
   * Get inventory-based price adjustment
   */
  async getInventoryAdjustment(productId, basePrice) {
    const result = await this.pool.query(`
      SELECT
        COALESCE(stock_quantity, 0) as stock,
        COALESCE(reorder_level, 20) as reorder_level
      FROM products
      WHERE id = $1
    `, [productId]);

    if (result.rows.length === 0) {
      return { type: 'inventory', adjustment: 0, adjustmentCents: 0 };
    }

    const { stock, reorder_level } = result.rows[0];
    const thresholds = this.config.inventoryThresholds;
    let adjustment = 0;
    let reason = '';

    if (stock > thresholds.overstock.threshold) {
      adjustment = -thresholds.overstock.discountRate;
      reason = 'Overstock clearance';
    } else if (stock > thresholds.high.threshold) {
      adjustment = -thresholds.high.discountRate;
      reason = 'High inventory discount';
    } else if (stock <= thresholds.critical.threshold) {
      adjustment = thresholds.critical.premiumRate;
      reason = 'Limited availability';
    } else if (stock <= thresholds.low.threshold) {
      adjustment = thresholds.low.premiumRate;
      reason = 'Low stock premium';
    }

    return {
      type: 'inventory',
      stockLevel: stock,
      reorderLevel: reorder_level,
      adjustment,
      adjustmentCents: Math.round(basePrice * adjustment),
      description: reason || 'Standard inventory level'
    };
  }

  /**
   * Get quantity break discount
   */
  getQuantityBreakAdjustment(quantity, basePrice) {
    let applicableDiscount = 0;
    let breakLevel = null;

    for (const breakPoint of this.config.quantityBreaks) {
      if (quantity >= breakPoint.minQty) {
        applicableDiscount = breakPoint.discount;
        breakLevel = breakPoint.minQty;
      }
    }

    return {
      type: 'quantity_break',
      quantity,
      breakLevel,
      discount: applicableDiscount,
      discountCents: Math.round(basePrice * applicableDiscount),
      description: breakLevel
        ? `Quantity discount for ${breakLevel}+ units: ${applicableDiscount * 100}% off`
        : 'No quantity discount applicable'
    };
  }

  /**
   * Get demand-based adjustment
   * Higher demand = potential premium pricing
   */
  async getDemandAdjustment(productId, basePrice) {
    // Analyze recent sales velocity
    const result = await this.pool.query(`
      WITH recent_sales AS (
        SELECT
          COUNT(*) as sales_30d,
          SUM(quantity) as units_30d
        FROM quote_items qi
        JOIN quotations q ON qi.quotation_id = q.id
        WHERE qi.product_id = $1
          AND q.status = 'WON'
          AND q.won_at > NOW() - INTERVAL '30 days'
      ),
      prev_sales AS (
        SELECT
          COUNT(*) as sales_prev,
          SUM(quantity) as units_prev
        FROM quote_items qi
        JOIN quotations q ON qi.quotation_id = q.id
        WHERE qi.product_id = $1
          AND q.status = 'WON'
          AND q.won_at > NOW() - INTERVAL '60 days'
          AND q.won_at <= NOW() - INTERVAL '30 days'
      )
      SELECT
        COALESCE(r.sales_30d, 0) as recent_sales,
        COALESCE(r.units_30d, 0) as recent_units,
        COALESCE(p.sales_prev, 0) as prev_sales,
        COALESCE(p.units_prev, 0) as prev_units
      FROM recent_sales r
      CROSS JOIN prev_sales p
    `, [productId]);

    const { recent_sales, recent_units, prev_sales, prev_units } = result.rows[0];

    // Calculate demand growth
    let demandGrowth = 0;
    if (prev_units > 0) {
      demandGrowth = (recent_units - prev_units) / prev_units;
    } else if (recent_units > 0) {
      demandGrowth = 1; // 100% growth from zero
    }

    // Apply demand-based adjustment
    let adjustment = 0;
    let reason = 'Stable demand';

    if (demandGrowth > 0.5) {
      adjustment = 0.05;  // 5% premium for high demand
      reason = 'High demand premium';
    } else if (demandGrowth > 0.25) {
      adjustment = 0.02;  // 2% premium for growing demand
      reason = 'Growing demand';
    } else if (demandGrowth < -0.25) {
      adjustment = -0.05;  // 5% discount for declining demand
      reason = 'Demand stimulation discount';
    }

    return {
      type: 'demand',
      recentSales: recent_sales,
      recentUnits: recent_units,
      demandGrowth: Math.round(demandGrowth * 100),
      adjustment,
      adjustmentCents: Math.round(basePrice * adjustment),
      description: reason
    };
  }

  /**
   * Get competitive position analysis
   */
  async getCompetitivePosition(productId, recommendedPrice) {
    // Get similar products in same category
    const result = await this.pool.query(`
      SELECT
        p2.id,
        p2.name,
        p2.base_price_cents,
        p2.brand
      FROM products p1
      JOIN products p2 ON p1.category = p2.category
      WHERE p1.id = $1
        AND p2.id != $1
        AND p2.active = true
      ORDER BY ABS(p2.base_price_cents - $2)
      LIMIT 5
    `, [productId, recommendedPrice]);

    const competitors = result.rows;
    if (competitors.length === 0) {
      return { position: 'unknown', competitors: [] };
    }

    const avgPrice = competitors.reduce((sum, c) => sum + c.base_price_cents, 0) / competitors.length;
    const priceDiff = ((recommendedPrice - avgPrice) / avgPrice) * 100;

    let position;
    if (priceDiff < -15) position = 'budget';
    else if (priceDiff < -5) position = 'value';
    else if (priceDiff <= 5) position = 'competitive';
    else if (priceDiff <= 15) position = 'premium';
    else position = 'luxury';

    return {
      position,
      averageCompetitorPrice: avgPrice,
      priceDifferencePercent: Math.round(priceDiff * 10) / 10,
      competitors: competitors.map(c => ({
        id: c.id,
        name: c.name,
        price: c.base_price_cents,
        brand: c.brand
      }))
    };
  }

  /**
   * Calculate price confidence score
   */
  calculateConfidence(adjustments) {
    // Higher confidence when fewer adjustments and more data
    const baseConfidence = 80;
    const adjustmentPenalty = Math.min(adjustments.length * 5, 20);
    return Math.max(baseConfidence - adjustmentPenalty, 60);
  }

  /**
   * Get pricing rules summary
   */
  async getPricingRules() {
    return {
      tierDiscounts: this.config.tierDiscounts,
      inventoryThresholds: this.config.inventoryThresholds,
      quantityBreaks: this.config.quantityBreaks,
      minMarginPercent: this.config.minMarginPercent,
      maxDiscountPercent: this.config.maxDiscountPercent
    };
  }

  /**
   * Get bulk pricing recommendations
   */
  async getBulkPriceRecommendations(productIds, customerId = null) {
    const recommendations = await Promise.all(
      productIds.map(id => this.getPriceRecommendation(id, { customerId }))
    );
    return recommendations;
  }

  /**
   * Analyze quote pricing
   */
  async analyzeQuotePricing(quoteId) {
    // Get quote items
    const result = await this.pool.query(`
      SELECT
        qi.product_id,
        qi.quantity,
        qi.unit_price_cents,
        qi.line_total_cents,
        p.name as product_name,
        p.base_price_cents,
        p.cost_price_cents,
        q.customer_id
      FROM quote_items qi
      JOIN products p ON qi.product_id = p.id
      JOIN quotations q ON qi.quotation_id = q.id
      WHERE q.id = $1
    `, [quoteId]);

    const items = result.rows;
    if (items.length === 0) {
      return { error: 'No items found in quote' };
    }

    const customerId = items[0].customer_id;
    const analysis = [];

    for (const item of items) {
      const recommendation = await this.getPriceRecommendation(item.product_id, {
        customerId,
        quantity: item.quantity
      });

      const currentPrice = item.unit_price_cents;
      const diff = currentPrice - recommendation.recommendedPrice;
      const diffPercent = Math.round((diff / recommendation.recommendedPrice) * 100 * 10) / 10;

      analysis.push({
        productId: item.product_id,
        productName: item.product_name,
        quantity: item.quantity,
        currentPrice,
        recommendedPrice: recommendation.recommendedPrice,
        difference: diff,
        differencePercent: diffPercent,
        status: Math.abs(diffPercent) <= 5 ? 'optimal' :
                diffPercent > 0 ? 'above_recommended' : 'below_recommended',
        recommendation
      });
    }

    // Summary
    const totalCurrent = items.reduce((sum, i) => sum + i.line_total_cents, 0);
    const totalRecommended = analysis.reduce((sum, a) =>
      sum + (a.recommendedPrice * a.quantity), 0);

    return {
      quoteId,
      customerId,
      itemCount: items.length,
      totalCurrentPrice: totalCurrent,
      totalRecommendedPrice: totalRecommended,
      pricingGap: totalCurrent - totalRecommended,
      pricingGapPercent: Math.round((totalCurrent - totalRecommended) / totalRecommended * 100 * 10) / 10,
      items: analysis
    };
  }

  /**
   * Get product info
   */
  async getProduct(productId) {
    const result = await this.pool.query(`
      SELECT id, name, sku, base_price_cents, cost_price_cents, category, brand
      FROM products
      WHERE id = $1
    `, [productId]);

    return result.rows[0] || null;
  }
}

module.exports = DynamicPricingService;
