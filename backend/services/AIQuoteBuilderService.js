/**
 * AI Quote Builder Service
 * Provides intelligent suggestions for quote building including:
 * - Product bundles and packages
 * - Cross-sell opportunities
 * - Upsell suggestions
 * - Promotional offers
 * - Discount recommendations
 */

class AIQuoteBuilderService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Get comprehensive AI suggestions for current quote
   */
  async getQuoteSuggestions(quoteItems = [], customerId = null, options = {}) {
    const [
      bundles,
      crossSells,
      upsells,
      promotions,
      discountSuggestions,
      customerPreferences
    ] = await Promise.all([
      this.getBundleSuggestions(quoteItems),
      this.getCrossSellSuggestions(quoteItems),
      this.getUpsellSuggestions(quoteItems),
      this.getApplicablePromotions(quoteItems),
      this.getDiscountRecommendations(quoteItems, customerId),
      customerId ? this.getCustomerPreferences(customerId) : null
    ]);

    return {
      bundles,
      crossSells,
      upsells,
      promotions,
      discountSuggestions,
      customerPreferences,
      summary: this.generateSuggestionsSummary({
        bundles, crossSells, upsells, promotions, discountSuggestions
      }),
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get bundle suggestions based on quote items
   */
  async getBundleSuggestions(quoteItems = []) {
    if (quoteItems.length === 0) return [];

    const categories = [...new Set(quoteItems.map(i => i.category).filter(Boolean))];
    const manufacturers = [...new Set(quoteItems.map(i => i.manufacturer).filter(Boolean))];
    const itemIds = quoteItems.map(i => i.id).filter(Boolean);

    // Find complementary products that form bundles
    const result = await this.pool.query(`
      WITH quote_categories AS (
        SELECT UNNEST($1::text[]) as category
      ),
      complementary AS (
        SELECT DISTINCT
          p.id,
          p.model,
          p.description,
          p.category,
          p.manufacturer,
          p.sell_price,
          p.msrp,
          CASE
            WHEN p.category IN ('Parts', 'Accessories') THEN 'accessory'
            WHEN p.category LIKE '%Service%' OR p.category LIKE '%Installation%' THEN 'service'
            WHEN p.category LIKE '%Warranty%' OR p.category LIKE '%Protection%' THEN 'protection'
            ELSE 'complement'
          END as bundle_type,
          CASE
            WHEN p.sell_price < 100 THEN 0.9
            WHEN p.sell_price < 300 THEN 0.75
            ELSE 0.6
          END as confidence
        FROM products p
        WHERE p.is_active = true
          AND p.id NOT IN (SELECT UNNEST($2::int[]))
          AND (
            -- Accessories for main items
            (p.category IN ('Parts', 'Accessories') AND p.manufacturer = ANY($3::text[]))
            OR
            -- Services and warranties
            (p.category LIKE '%Service%' OR p.category LIKE '%Warranty%' OR p.category LIKE '%Installation%')
            OR
            -- Complementary categories
            EXISTS (
              SELECT 1 FROM quote_categories qc
              WHERE (
                (qc.category LIKE '%Range%' AND p.category LIKE '%Hood%') OR
                (qc.category LIKE '%Washer%' AND p.category LIKE '%Dryer%') OR
                (qc.category LIKE '%Dryer%' AND p.category LIKE '%Washer%') OR
                (qc.category LIKE '%Refrigerator%' AND p.category IN ('Parts', 'Accessories')) OR
                (qc.category LIKE '%Dishwasher%' AND p.category LIKE '%Disposal%')
              )
            )
          )
        ORDER BY confidence DESC, p.sell_price ASC
        LIMIT 10
      )
      SELECT * FROM complementary
    `, [categories, itemIds.length > 0 ? itemIds : [0], manufacturers]);

    return result.rows.map(row => ({
      productId: row.id,
      productName: row.model,
      description: row.description,
      category: row.category,
      manufacturer: row.manufacturer,
      price: parseFloat(row.sell_price) || 0,
      msrp: parseFloat(row.msrp) || 0,
      bundleType: row.bundle_type,
      confidence: parseFloat(row.confidence),
      reason: this.getBundleReason(row.bundle_type, row.category),
      savingsIfBundled: row.bundle_type === 'accessory' ? 10 : 5
    }));
  }

  /**
   * Get cross-sell suggestions
   */
  async getCrossSellSuggestions(quoteItems = []) {
    if (quoteItems.length === 0) return [];

    const categories = [...new Set(quoteItems.map(i => i.category).filter(Boolean))];
    const itemIds = quoteItems.map(i => i.id).filter(Boolean);

    // Find frequently bought together products
    const result = await this.pool.query(`
      WITH quote_products AS (
        SELECT UNNEST($1::int[]) as product_id
      ),
      co_purchased AS (
        SELECT
          qi2.product_id as suggested_id,
          COUNT(DISTINCT qi1.quotation_id) as co_purchase_count,
          AVG(qi2.quantity) as avg_quantity
        FROM quotation_items qi1
        JOIN quotation_items qi2 ON qi1.quotation_id = qi2.quotation_id
        JOIN quotations q ON qi1.quotation_id = q.id
        WHERE qi1.product_id = ANY($1::int[])
          AND qi2.product_id != ALL($1::int[])
          AND q.status = 'WON'
          AND q.created_at > NOW() - INTERVAL '365 days'
        GROUP BY qi2.product_id
        HAVING COUNT(DISTINCT qi1.quotation_id) >= 2
      )
      SELECT
        p.id,
        p.model,
        p.description,
        p.category,
        p.manufacturer,
        p.sell_price,
        cp.co_purchase_count,
        cp.avg_quantity,
        LEAST(0.95, 0.5 + (cp.co_purchase_count * 0.1)) as confidence
      FROM co_purchased cp
      JOIN products p ON cp.suggested_id = p.id
      WHERE p.is_active = true
      ORDER BY cp.co_purchase_count DESC, confidence DESC
      LIMIT 6
    `, [itemIds.length > 0 ? itemIds : [0]]);

    return result.rows.map(row => ({
      productId: row.id,
      productName: row.model,
      description: row.description,
      category: row.category,
      manufacturer: row.manufacturer,
      price: parseFloat(row.sell_price) || 0,
      confidence: parseFloat(row.confidence),
      coPurchaseCount: parseInt(row.co_purchase_count),
      reason: `Purchased together ${row.co_purchase_count} times with similar items`,
      type: 'cross_sell'
    }));
  }

  /**
   * Get upsell suggestions (premium alternatives)
   */
  async getUpsellSuggestions(quoteItems = []) {
    if (quoteItems.length === 0) return [];

    const suggestions = [];

    for (const item of quoteItems) {
      if (!item.id || !item.category) continue;

      const result = await this.pool.query(`
        SELECT
          p.id,
          p.model,
          p.description,
          p.category,
          p.manufacturer,
          p.sell_price,
          p.msrp,
          p.sell_price - $2 as price_difference
        FROM products p
        WHERE p.category = $1
          AND p.is_active = true
          AND p.id != $3
          AND p.sell_price > $2
          AND p.sell_price <= $2 * 1.5
        ORDER BY p.sell_price ASC
        LIMIT 2
      `, [item.category, item.sell || item.price || 0, item.id]);

      for (const row of result.rows) {
        suggestions.push({
          sourceProductId: item.id,
          sourceProductName: item.name || item.model,
          productId: row.id,
          productName: row.model,
          description: row.description,
          category: row.category,
          manufacturer: row.manufacturer,
          currentPrice: parseFloat(item.sell || item.price) || 0,
          upgradedPrice: parseFloat(row.sell_price) || 0,
          priceDifference: parseFloat(row.price_difference) || 0,
          reason: `Upgrade to ${row.model} for enhanced features`,
          type: 'upsell'
        });
      }
    }

    return suggestions.slice(0, 4);
  }

  /**
   * Get applicable promotions for quote items
   */
  async getApplicablePromotions(quoteItems = []) {
    if (quoteItems.length === 0) return [];

    const categories = [...new Set(quoteItems.map(i => i.category).filter(Boolean))];
    const manufacturers = [...new Set(quoteItems.map(i => i.manufacturer).filter(Boolean))];
    const totalValue = quoteItems.reduce((sum, i) => sum + (parseFloat(i.sell || i.price) || 0), 0);

    // Check for available promotions
    const result = await this.pool.query(`
      SELECT
        id,
        name,
        description,
        promo_type,
        discount_type,
        discount_value,
        min_purchase_amount,
        applicable_categories,
        applicable_manufacturers,
        start_date,
        end_date,
        is_stackable
      FROM promotions
      WHERE is_active = true
        AND (start_date IS NULL OR start_date <= NOW())
        AND (end_date IS NULL OR end_date >= NOW())
        AND (
          min_purchase_amount IS NULL
          OR min_purchase_amount <= $1
        )
        AND (
          applicable_categories IS NULL
          OR applicable_categories && $2::text[]
        )
        AND (
          applicable_manufacturers IS NULL
          OR applicable_manufacturers && $3::text[]
        )
      ORDER BY discount_value DESC
      LIMIT 5
    `, [totalValue * 100, categories, manufacturers]);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      promoType: row.promo_type,
      discountType: row.discount_type,
      discountValue: parseFloat(row.discount_value),
      minPurchase: parseFloat(row.min_purchase_amount) / 100,
      applicableCategories: row.applicable_categories,
      applicableManufacturers: row.applicable_manufacturers,
      validUntil: row.end_date,
      isStackable: row.is_stackable,
      estimatedSavings: this.calculatePromotionSavings(row, totalValue * 100)
    }));
  }

  /**
   * Get discount recommendations based on customer and quote
   */
  async getDiscountRecommendations(quoteItems = [], customerId = null) {
    const recommendations = [];
    const totalValue = quoteItems.reduce((sum, i) => sum + (parseFloat(i.sell || i.price) || 0), 0);

    // Volume discount suggestion
    if (quoteItems.length >= 3) {
      recommendations.push({
        type: 'volume',
        reason: 'Multi-item discount',
        description: `${quoteItems.length} items in cart qualifies for volume pricing`,
        suggestedDiscount: Math.min(5 + quoteItems.length, 15),
        confidence: 0.8
      });
    }

    // High-value order discount
    if (totalValue >= 5000) {
      recommendations.push({
        type: 'high_value',
        reason: 'Premium order discount',
        description: 'Order value qualifies for premium customer pricing',
        suggestedDiscount: totalValue >= 10000 ? 8 : 5,
        confidence: 0.85
      });
    }

    // Customer loyalty discount
    if (customerId) {
      const customerResult = await this.pool.query(`
        SELECT
          c.clv_score,
          c.clv_segment,
          c.total_transactions,
          COUNT(q.id) as past_quotes
        FROM customers c
        LEFT JOIN quotations q ON q.customer_id = c.id AND q.status = 'WON'
        WHERE c.id = $1
        GROUP BY c.id
      `, [customerId]);

      if (customerResult.rows.length > 0) {
        const customer = customerResult.rows[0];

        if (customer.clv_segment === 'platinum' || customer.clv_segment === 'gold') {
          recommendations.push({
            type: 'loyalty',
            reason: `${customer.clv_segment.charAt(0).toUpperCase() + customer.clv_segment.slice(1)} customer`,
            description: `Valued ${customer.clv_segment} customer with ${customer.past_quotes} previous purchases`,
            suggestedDiscount: customer.clv_segment === 'platinum' ? 10 : 7,
            confidence: 0.9
          });
        }

        if (parseInt(customer.total_transactions) >= 5) {
          recommendations.push({
            type: 'repeat_customer',
            reason: 'Repeat customer appreciation',
            description: `Customer has completed ${customer.total_transactions} transactions`,
            suggestedDiscount: 3,
            confidence: 0.75
          });
        }
      }
    }

    // Bundle discount suggestion
    const categories = [...new Set(quoteItems.map(i => i.category).filter(Boolean))];
    if (categories.length >= 2) {
      recommendations.push({
        type: 'bundle',
        reason: 'Multi-category bundle',
        description: `${categories.length} different product categories - consider bundle pricing`,
        suggestedDiscount: 5,
        confidence: 0.7
      });
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get customer preferences and buying patterns
   */
  async getCustomerPreferences(customerId) {
    const result = await this.pool.query(`
      WITH customer_history AS (
        SELECT
          qi.product_id,
          p.category,
          p.manufacturer,
          qi.unit_price_cents,
          q.created_at
        FROM quotations q
        JOIN quotation_items qi ON qi.quotation_id = q.id
        JOIN products p ON p.id = qi.product_id
        WHERE q.customer_id = $1
          AND q.status = 'WON'
          AND q.created_at > NOW() - INTERVAL '2 years'
      )
      SELECT
        (SELECT ARRAY_AGG(DISTINCT category) FROM customer_history LIMIT 5) as preferred_categories,
        (SELECT ARRAY_AGG(DISTINCT manufacturer) FROM customer_history LIMIT 5) as preferred_manufacturers,
        (SELECT AVG(unit_price_cents) FROM customer_history) as avg_price_point,
        (SELECT COUNT(*) FROM customer_history) as total_items_purchased
    `, [customerId]);

    if (result.rows.length === 0 || result.rows[0].total_items_purchased === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      preferredCategories: row.preferred_categories || [],
      preferredManufacturers: row.preferred_manufacturers || [],
      avgPricePoint: Math.round(parseFloat(row.avg_price_point) / 100) || 0,
      totalItemsPurchased: parseInt(row.total_items_purchased),
      insight: this.generateCustomerInsight(row)
    };
  }

  /**
   * Generate summary of all suggestions
   */
  generateSuggestionsSummary(suggestions) {
    const { bundles, crossSells, upsells, promotions, discountSuggestions } = suggestions;

    const summary = {
      totalSuggestions: 0,
      potentialAdditionalRevenue: 0,
      potentialSavingsForCustomer: 0,
      highlights: []
    };

    if (bundles?.length > 0) {
      summary.totalSuggestions += bundles.length;
      summary.potentialAdditionalRevenue += bundles.reduce((sum, b) => sum + b.price, 0);
      summary.highlights.push(`${bundles.length} complementary products available`);
    }

    if (crossSells?.length > 0) {
      summary.totalSuggestions += crossSells.length;
      summary.potentialAdditionalRevenue += crossSells.reduce((sum, c) => sum + c.price, 0);
      summary.highlights.push(`${crossSells.length} frequently bought together items`);
    }

    if (upsells?.length > 0) {
      summary.totalSuggestions += upsells.length;
      summary.highlights.push(`${upsells.length} premium upgrade options`);
    }

    if (promotions?.length > 0) {
      summary.potentialSavingsForCustomer += promotions.reduce((sum, p) => sum + (p.estimatedSavings || 0), 0);
      summary.highlights.push(`${promotions.length} promotional offers applicable`);
    }

    if (discountSuggestions?.length > 0) {
      const maxDiscount = Math.max(...discountSuggestions.map(d => d.suggestedDiscount));
      summary.highlights.push(`Up to ${maxDiscount}% discount recommended`);
    }

    return summary;
  }

  /**
   * Helper: Get bundle reason text
   */
  getBundleReason(bundleType, category) {
    switch (bundleType) {
      case 'accessory':
        return `Essential accessory for your selected items`;
      case 'service':
        return `Professional ${category.toLowerCase()} service recommended`;
      case 'protection':
        return `Protect your investment with extended coverage`;
      default:
        return `Complements your selection perfectly`;
    }
  }

  /**
   * Helper: Calculate promotion savings
   */
  calculatePromotionSavings(promo, totalCents) {
    if (promo.discount_type === 'percentage') {
      return Math.round((totalCents * promo.discount_value / 100) / 100);
    } else if (promo.discount_type === 'fixed') {
      return Math.round(promo.discount_value / 100);
    }
    return 0;
  }

  /**
   * Helper: Generate customer insight text
   */
  generateCustomerInsight(data) {
    const insights = [];

    if (data.preferred_categories?.length > 0) {
      insights.push(`Typically purchases ${data.preferred_categories.slice(0, 2).join(' and ')}`);
    }

    if (data.avg_price_point > 0) {
      const priceRange = data.avg_price_point > 1000 ? 'premium' : data.avg_price_point > 500 ? 'mid-range' : 'value';
      insights.push(`Prefers ${priceRange} products`);
    }

    return insights.join('. ') || 'New customer - build preferences over time';
  }

  /**
   * Get quick add suggestions based on search context
   */
  async getQuickAddSuggestions(searchTerm, quoteItems = []) {
    if (!searchTerm || searchTerm.length < 2) return [];

    const itemIds = quoteItems.map(i => i.id).filter(Boolean);

    const result = await this.pool.query(`
      SELECT
        p.id,
        p.model,
        p.description,
        p.category,
        p.manufacturer,
        p.sell_price,
        p.quantity_on_hand
      FROM products p
      WHERE p.is_active = true
        AND p.id NOT IN (SELECT UNNEST($1::int[]))
        AND (
          p.model ILIKE $2
          OR p.description ILIKE $2
          OR p.sku ILIKE $2
        )
      ORDER BY
        CASE WHEN p.model ILIKE $3 THEN 1 ELSE 2 END,
        p.sell_price DESC
      LIMIT 8
    `, [
      itemIds.length > 0 ? itemIds : [0],
      `%${searchTerm}%`,
      `${searchTerm}%`
    ]);

    return result.rows.map(row => ({
      id: row.id,
      model: row.model,
      description: row.description,
      category: row.category,
      manufacturer: row.manufacturer,
      price: parseFloat(row.sell_price) || 0,
      inStock: parseInt(row.quantity_on_hand) > 0
    }));
  }
}

module.exports = AIQuoteBuilderService;
