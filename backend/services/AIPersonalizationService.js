/**
 * AIPersonalizationService
 *
 * Handles AI-driven personalization features:
 * - Dynamic Pricing Engine
 * - Predictive Upselling
 * - Smart Quote Suggestions
 * - Customer Behavior Tracking
 */

let pool = require('../db');

class AIPersonalizationService {
  // ==================== DYNAMIC PRICING ENGINE ====================

  /**
   * Get all dynamic pricing rules
   */
  async getDynamicPricingRules(filters = {}) {
    const { isActive, ruleType } = filters;

    let query = `
      SELECT dpr.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', dpc.id,
              'condition_type', dpc.condition_type,
              'operator', dpc.operator,
              'threshold_value', dpc.threshold_value,
              'threshold_unit', dpc.threshold_unit,
              'adjustment_value', dpc.adjustment_value
            )
          ) FILTER (WHERE dpc.id IS NOT NULL),
          '[]'
        ) as conditions
      FROM dynamic_pricing_rules dpr
      LEFT JOIN dynamic_pricing_conditions dpc ON dpr.id = dpc.rule_id
      WHERE 1=1
    `;

    const params = [];

    if (isActive !== undefined) {
      params.push(isActive);
      query += ` AND dpr.is_active = $${params.length}`;
    }

    if (ruleType) {
      params.push(ruleType);
      query += ` AND dpr.rule_type = $${params.length}`;
    }

    query += ` GROUP BY dpr.id ORDER BY dpr.priority DESC`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Calculate dynamic price adjustment for a product
   */
  async calculateDynamicPriceAdjustment(productId, context = {}) {
    const { quantity = 1, customerId, quoteItems = [] } = context;

    // Get product details
    const productResult = await pool.query(
      'SELECT id, name, category, manufacturer, sell_price, cost, created_at FROM products WHERE id = $1',
      [productId]
    );

    if (productResult.rows.length === 0) {
      return { adjustmentPercent: 0, adjustments: [] };
    }

    const product = productResult.rows[0];
    const basePriceCents = Math.round(parseFloat(product.sell_price) * 100);
    const costCents = product.cost ? Math.round(parseFloat(product.cost) * 100) : 0;

    // Get applicable rules
    const rules = await this.getDynamicPricingRules({ isActive: true });
    const applicableRules = rules.filter(rule => {
      if (rule.scope_type === 'all') return true;
      if (rule.scope_type === 'product' && rule.scope_product_id === productId) return true;
      if (rule.scope_type === 'category' && rule.scope_category === product.category) return true;
      if (rule.scope_type === 'manufacturer' && rule.scope_manufacturer === product.manufacturer) return true;
      return false;
    });

    const adjustments = [];
    let totalAdjustment = 0;

    for (const rule of applicableRules) {
      const adjustment = await this.evaluateRule(rule, product, context);
      if (adjustment !== 0) {
        // Clamp to min/max
        const clampedAdjustment = Math.max(
          parseFloat(rule.min_adjustment),
          Math.min(parseFloat(rule.max_adjustment), adjustment)
        );

        adjustments.push({
          ruleId: rule.id,
          ruleName: rule.name,
          ruleType: rule.rule_type,
          adjustmentPercent: clampedAdjustment,
          reason: this.getAdjustmentReason(rule, adjustment)
        });

        totalAdjustment += clampedAdjustment;
      }
    }

    // Cap total adjustment
    totalAdjustment = Math.max(-30, Math.min(30, totalAdjustment));

    return {
      productId,
      originalPriceCents: basePriceCents,
      adjustmentPercent: totalAdjustment,
      adjustedPriceCents: Math.round(basePriceCents * (1 + totalAdjustment / 100)),
      adjustments
    };
  }

  /**
   * Evaluate a single pricing rule
   */
  async evaluateRule(rule, product, context) {
    const { quantity = 1, quoteItems = [] } = context;
    const costCents = product.cost ? Math.round(parseFloat(product.cost) * 100) : 0;
    const sellCents = Math.round(parseFloat(product.sell_price) * 100);
    const currentMargin = costCents > 0 ? ((sellCents - costCents) / sellCents) * 100 : 0;

    switch (rule.rule_type) {
      case 'margin_protection':
        // If margin is high, no discount needed
        if (currentMargin > 30) return 0;
        // If margin is low, protect it
        if (currentMargin < 10) return 2; // Small markup suggestion
        return 0;

      case 'inventory_velocity':
        // Check product age (older products get discounts)
        const productAge = Math.floor((Date.now() - new Date(product.created_at).getTime()) / (1000 * 60 * 60 * 24));
        if (productAge > 180) return -5; // 6+ months old
        if (productAge > 90) return -3; // 3+ months old
        return 0;

      case 'brand_tier':
        // Premium brands maintain pricing
        const premiumBrands = ['Sub-Zero', 'Wolf', 'Miele', 'Thermador', 'Viking'];
        if (premiumBrands.some(b => product.manufacturer?.toLowerCase().includes(b.toLowerCase()))) {
          return 3; // Premium markup
        }
        return 0;

      case 'bundle_size':
        // Discount based on bundle size
        const totalItems = quoteItems.length + 1;
        if (totalItems >= 5) return -5;
        if (totalItems >= 3) return -3;
        return 0;

      case 'demand_based':
        // Would integrate with sales velocity data
        // For now, return 0
        return 0;

      case 'time_based':
        // End of month/quarter discounts
        const now = new Date();
        const dayOfMonth = now.getDate();
        const month = now.getMonth();
        // Last 3 days of month
        if (dayOfMonth >= 28) return -2;
        // Last month of quarter
        if ([2, 5, 8, 11].includes(month) && dayOfMonth >= 25) return -3;
        return 0;

      default:
        return 0;
    }
  }

  /**
   * Get human-readable adjustment reason
   */
  getAdjustmentReason(rule, adjustment) {
    const direction = adjustment > 0 ? 'increase' : 'decrease';
    switch (rule.rule_type) {
      case 'margin_protection':
        return `Margin protection: ${Math.abs(adjustment)}% ${direction}`;
      case 'inventory_velocity':
        return `Slow-moving inventory: ${Math.abs(adjustment)}% discount`;
      case 'brand_tier':
        return `Premium brand positioning: ${Math.abs(adjustment)}% premium`;
      case 'bundle_size':
        return `Multi-item bundle: ${Math.abs(adjustment)}% savings`;
      case 'demand_based':
        return `Demand-based pricing: ${Math.abs(adjustment)}% ${direction}`;
      case 'time_based':
        return `End of period pricing: ${Math.abs(adjustment)}% discount`;
      default:
        return `Price adjustment: ${adjustment}%`;
    }
  }

  // ==================== PREDICTIVE UPSELLING ====================

  /**
   * Get upsell recommendations for a product
   */
  async getUpsellRecommendations(productId, context = {}) {
    const { customerId, quoteItems = [], limit = 5 } = context;

    // Get product details
    const productResult = await pool.query(
      'SELECT id, name, category, manufacturer, sell_cents FROM products WHERE id = $1',
      [productId]
    );

    if (productResult.rows.length === 0) {
      return [];
    }

    const product = productResult.rows[0];
    const recommendations = [];

    // 1. Get product affinity recommendations
    const affinityResult = await pool.query(`
      SELECT pa.*, p.id as product_id, p.name, p.model, p.manufacturer,
             p.category, p.sell_cents, p.description
      FROM product_affinity pa
      JOIN products p ON pa.target_product_id = p.id
      WHERE pa.source_product_id = $1 AND pa.is_active = true
      ORDER BY pa.affinity_score DESC
      LIMIT $2
    `, [productId, limit]);

    for (const row of affinityResult.rows) {
      recommendations.push({
        type: 'product_affinity',
        productId: row.product_id,
        productName: row.name,
        model: row.model,
        manufacturer: row.manufacturer,
        category: row.category,
        price: (parseFloat(row.sell_cents) || 0) / 100,
        confidence: parseFloat(row.affinity_score),
        reason: `Frequently bought with ${product.name}`,
        affinityType: row.affinity_type
      });
    }

    // 2. Get category affinity recommendations
    const categoryResult = await pool.query(`
      SELECT ca.*, p.id as product_id, p.name, p.model, p.manufacturer,
             p.category, p.sell_cents, p.description
      FROM category_affinity ca
      JOIN products p ON p.category = ca.target_category
      WHERE ca.source_category = $1 AND ca.is_active = true
      AND p.id != $2
      ORDER BY ca.affinity_score DESC, p.sell_cents DESC
      LIMIT $3
    `, [product.category, productId, limit]);

    for (const row of categoryResult.rows) {
      // Skip if already in recommendations
      if (recommendations.some(r => r.productId === row.product_id)) continue;

      recommendations.push({
        type: 'category_affinity',
        productId: row.product_id,
        productName: row.name,
        model: row.model,
        manufacturer: row.manufacturer,
        category: row.category,
        price: (parseFloat(row.sell_cents) || 0) / 100,
        confidence: parseFloat(row.affinity_score),
        reason: row.recommendation_text || `Recommended with ${product.category}`
      });
    }

    // 3. Get rule-based upsells
    const rulesResult = await pool.query(`
      SELECT ur.*, p.id as product_id, p.name, p.model, p.manufacturer,
             p.category as product_category, p.sell_cents
      FROM upsell_rules ur
      LEFT JOIN products p ON (
        (ur.recommendation_type = 'product' AND ur.recommendation_product_id = p.id) OR
        (ur.recommendation_type = 'category' AND p.category = ur.recommendation_category)
      )
      WHERE ur.is_active = true
        AND (
          (ur.trigger_type = 'category' AND ur.trigger_category = $1) OR
          (ur.trigger_type = 'manufacturer' AND ur.trigger_manufacturer = $2) OR
          (ur.trigger_type = 'price_threshold' AND $3 >= COALESCE(ur.trigger_min_price_cents, 0))
        )
      ORDER BY ur.priority DESC
      LIMIT $4
    `, [product.category, product.manufacturer, parseInt(product.sell_cents) || 0, limit]);

    for (const row of rulesResult.rows) {
      if (!row.product_id) continue;
      // Skip if already in recommendations or same product
      if (recommendations.some(r => r.productId === row.product_id)) continue;
      if (row.product_id === productId) continue;

      recommendations.push({
        type: 'upsell_rule',
        productId: row.product_id,
        productName: row.name,
        model: row.model,
        manufacturer: row.manufacturer,
        category: row.product_category,
        price: (parseFloat(row.sell_cents) || 0) / 100,
        confidence: 0.7,
        reason: row.recommendation_text || row.name,
        discountPercent: row.discount_percent ? parseFloat(row.discount_percent) : null,
        ruleName: row.name
      });
    }

    // 4. If customer has history, add personalized recommendations
    if (customerId) {
      const customerRecs = await this.getCustomerBasedRecommendations(customerId, productId, limit);
      for (const rec of customerRecs) {
        if (!recommendations.some(r => r.productId === rec.productId)) {
          recommendations.push(rec);
        }
      }
    }

    // Sort by confidence and limit
    return recommendations
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  /**
   * Get customer-based recommendations
   */
  async getCustomerBasedRecommendations(customerId, excludeProductId, limit = 3) {
    // Get customer's purchase history preferences
    const prefsResult = await pool.query(`
      SELECT preference_type, preference_value, confidence_score
      FROM customer_preferences
      WHERE customer_id = $1
      ORDER BY confidence_score DESC
      LIMIT 5
    `, [customerId]);

    if (prefsResult.rows.length === 0) {
      return [];
    }

    const recommendations = [];
    const brandPrefs = prefsResult.rows.filter(p => p.preference_type === 'brand');
    const categoryPrefs = prefsResult.rows.filter(p => p.preference_type === 'category');

    // Recommend products matching customer preferences
    if (brandPrefs.length > 0) {
      const brands = brandPrefs.map(p => p.preference_value);
      const brandResult = await pool.query(`
        SELECT id, name, model, manufacturer, category, sell_price
        FROM products
        WHERE manufacturer = ANY($1) AND id != $2
        ORDER BY sell_price DESC
        LIMIT $3
      `, [brands, excludeProductId, limit]);

      for (const row of brandResult.rows) {
        recommendations.push({
          type: 'customer_preference',
          productId: row.id,
          productName: row.name,
          model: row.model,
          manufacturer: row.manufacturer,
          category: row.category,
          price: parseFloat(row.sell_price),
          confidence: 0.8,
          reason: `Based on your preference for ${row.manufacturer}`
        });
      }
    }

    return recommendations;
  }

  /**
   * Get smart suggestions for the entire quote
   */
  async getSmartQuoteSuggestions(quoteItems, customerId = null) {
    const suggestions = [];

    if (quoteItems.length === 0) {
      return suggestions;
    }

    // Calculate quote totals
    const subtotal = quoteItems.reduce((sum, item) => sum + (item.sell * item.quantity), 0);
    const categories = [...new Set(quoteItems.map(item => item.category))];
    const manufacturers = [...new Set(quoteItems.map(item => item.manufacturer))];

    // 1. Bundle completion suggestions
    const bundleChecks = [
      { source: 'Washers', target: 'Dryers', message: 'Complete your laundry pair!' },
      { source: 'Ranges', target: 'Range Hoods', message: 'Add ventilation for your new range' },
      { source: 'Refrigerators', target: 'Water Filters', message: 'Don\'t forget replacement filters' }
    ];

    for (const check of bundleChecks) {
      if (categories.includes(check.source) && !categories.includes(check.target)) {
        suggestions.push({
          type: 'bundle_completion',
          priority: 'high',
          title: check.message,
          description: `You have a ${check.source.slice(0, -1)} in your quote but no ${check.target.slice(0, -1).toLowerCase()}`,
          action: 'browse_category',
          actionData: { category: check.target }
        });
      }
    }

    // 2. Protection plan suggestion
    if (subtotal > 1000 && !quoteItems.some(item => item.category === 'Protection Plans')) {
      suggestions.push({
        type: 'protection_plan',
        priority: 'medium',
        title: 'Protect Your Investment',
        description: `With a $${subtotal.toFixed(2)} purchase, consider adding extended protection`,
        potentialSavings: Math.round(subtotal * 0.15), // Potential repair savings
        action: 'add_protection'
      });
    }

    // 3. Delivery bundling suggestion
    if (quoteItems.length >= 2 && !quoteItems.some(item => item.is_service)) {
      suggestions.push({
        type: 'delivery_bundle',
        priority: 'low',
        title: 'Bundle Delivery & Save',
        description: 'Combine delivery for multiple items to save on shipping',
        potentialSavings: 50,
        action: 'add_delivery'
      });
    }

    // 4. Volume discount reminder
    if (quoteItems.length >= 2 && quoteItems.length < 3) {
      suggestions.push({
        type: 'volume_discount',
        priority: 'medium',
        title: 'Add One More for Volume Discount',
        description: 'Add 1 more item to qualify for 5% volume discount',
        potentialSavings: Math.round(subtotal * 0.05),
        action: 'browse_products'
      });
    }

    // 5. Brand matching suggestion
    if (manufacturers.length > 1 && categories.length > 1) {
      const dominantBrand = this.getMostFrequent(manufacturers);
      const mismatched = quoteItems.filter(item => item.manufacturer !== dominantBrand);
      if (mismatched.length > 0 && mismatched.length < quoteItems.length) {
        suggestions.push({
          type: 'brand_matching',
          priority: 'low',
          title: 'Consider Brand Matching',
          description: `Most of your items are ${dominantBrand}. Matching brands often means better integration.`,
          action: 'view_brand',
          actionData: { manufacturer: dominantBrand }
        });
      }
    }

    // 6. Financing suggestion for high-value quotes
    if (subtotal > 2000) {
      const monthlyPayment = Math.round((subtotal * 1.05) / 24); // Rough estimate
      suggestions.push({
        type: 'financing',
        priority: 'medium',
        title: 'Financing Available',
        description: `As low as $${monthlyPayment}/month with 0% financing`,
        action: 'view_financing'
      });
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  /**
   * Get most frequent item in array
   */
  getMostFrequent(arr) {
    const counts = {};
    let maxCount = 0;
    let maxItem = null;
    for (const item of arr) {
      counts[item] = (counts[item] || 0) + 1;
      if (counts[item] > maxCount) {
        maxCount = counts[item];
        maxItem = item;
      }
    }
    return maxItem;
  }

  // ==================== CUSTOMER BEHAVIOR TRACKING ====================

  /**
   * Track customer behavior event
   */
  async trackBehavior(customerId, eventType, data = {}) {
    const { productId, category, manufacturer, sessionId, eventData } = data;

    await pool.query(`
      INSERT INTO customer_behavior (customer_id, event_type, product_id, category, manufacturer, session_id, event_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [customerId, eventType, productId, category, manufacturer, sessionId, JSON.stringify(eventData || {})]);

    // Update customer preferences based on behavior
    if (eventType === 'product_view' || eventType === 'add_to_quote') {
      await this.updateCustomerPreferences(customerId, data);
    }
  }

  /**
   * Update customer preferences based on behavior
   */
  async updateCustomerPreferences(customerId, data) {
    const { manufacturer, category } = data;

    if (manufacturer) {
      await pool.query(`
        INSERT INTO customer_preferences (customer_id, preference_type, preference_value, confidence_score, occurrence_count)
        VALUES ($1, 'brand', $2, 0.5, 1)
        ON CONFLICT (customer_id, preference_type, preference_value)
        DO UPDATE SET
          occurrence_count = customer_preferences.occurrence_count + 1,
          confidence_score = LEAST(1.0, customer_preferences.confidence_score + 0.1),
          last_seen = NOW()
      `, [customerId, manufacturer]);
    }

    if (category) {
      await pool.query(`
        INSERT INTO customer_preferences (customer_id, preference_type, preference_value, confidence_score, occurrence_count)
        VALUES ($1, 'category', $2, 0.5, 1)
        ON CONFLICT (customer_id, preference_type, preference_value)
        DO UPDATE SET
          occurrence_count = customer_preferences.occurrence_count + 1,
          confidence_score = LEAST(1.0, customer_preferences.confidence_score + 0.1),
          last_seen = NOW()
      `, [customerId, category]);
    }
  }

  /**
   * Record recommendation interaction
   */
  async recordRecommendationInteraction(recommendationId, accepted) {
    await pool.query(`
      UPDATE recommendation_history
      SET was_viewed = true, was_accepted = $2
      WHERE id = $1
    `, [recommendationId, accepted]);
  }

  // ==================== ADMIN FUNCTIONS ====================

  /**
   * Create/update product affinity
   */
  async setProductAffinity(sourceProductId, targetProductId, affinityType, score, isManual = true) {
    const result = await pool.query(`
      INSERT INTO product_affinity (source_product_id, target_product_id, affinity_type, affinity_score, is_manual)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (source_product_id, target_product_id, affinity_type)
      DO UPDATE SET affinity_score = $4, is_manual = $5, updated_at = NOW()
      RETURNING *
    `, [sourceProductId, targetProductId, affinityType, score, isManual]);

    return result.rows[0];
  }

  /**
   * Get product affinities
   */
  async getProductAffinities(productId) {
    const result = await pool.query(`
      SELECT pa.*, p.name as target_name, p.model as target_model, p.manufacturer as target_manufacturer
      FROM product_affinity pa
      JOIN products p ON pa.target_product_id = p.id
      WHERE pa.source_product_id = $1 AND pa.is_active = true
      ORDER BY pa.affinity_score DESC
    `, [productId]);

    return result.rows;
  }

  /**
   * Get upsell rules
   */
  async getUpsellRules() {
    const result = await pool.query(`
      SELECT * FROM upsell_rules ORDER BY priority DESC
    `);
    return result.rows;
  }

  /**
   * Create upsell rule
   */
  async createUpsellRule(ruleData) {
    const {
      name,
      description,
      trigger_type,
      trigger_category,
      trigger_manufacturer,
      trigger_min_price_cents,
      trigger_min_quantity,
      recommendation_type,
      recommendation_category,
      recommendation_product_id,
      recommendation_text,
      discount_percent,
      priority = 0
    } = ruleData;

    const result = await pool.query(`
      INSERT INTO upsell_rules (
        name, description, trigger_type, trigger_category, trigger_manufacturer,
        trigger_min_price_cents, trigger_min_quantity, recommendation_type,
        recommendation_category, recommendation_product_id, recommendation_text,
        discount_percent, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      name, description, trigger_type, trigger_category, trigger_manufacturer,
      trigger_min_price_cents, trigger_min_quantity, recommendation_type,
      recommendation_category, recommendation_product_id, recommendation_text,
      discount_percent, priority
    ]);

    return result.rows[0];
  }

  /**
   * Update upsell rule
   * SECURITY: Uses whitelist of allowed fields to prevent SQL injection
   */
  async updateUpsellRule(ruleId, updates) {
    // Whitelist of allowed field names for upsell_rules table
    const ALLOWED_FIELDS = [
      'name', 'description', 'trigger_type', 'trigger_category',
      'trigger_manufacturer', 'trigger_min_price_cents', 'trigger_min_quantity',
      'recommendation_type', 'recommendation_category', 'recommendation_product_id',
      'recommendation_text', 'discount_percent', 'priority', 'is_active'
    ];

    const fields = [];
    const values = [];
    let paramCount = 0;

    for (const [key, value] of Object.entries(updates)) {
      // Only allow whitelisted field names
      if (value !== undefined && ALLOWED_FIELDS.includes(key)) {
        paramCount++;
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
      }
    }

    if (fields.length === 0) return null;

    values.push(ruleId);
    const result = await pool.query(`
      UPDATE upsell_rules SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *
    `, values);

    return result.rows[0];
  }

  /**
   * Delete upsell rule
   */
  async deleteUpsellRule(ruleId) {
    const result = await pool.query('DELETE FROM upsell_rules WHERE id = $1 RETURNING id', [ruleId]);
    return result.rows.length > 0;
  }
}

AIPersonalizationService.prototype._setPool = function(p) { pool = p; };

module.exports = new AIPersonalizationService();
