/**
 * RecommendationService - Smart Product Recommendations
 *
 * Generates intelligent product recommendations based on:
 * - Curated relationships (accessories, upgrades, alternatives)
 * - Purchase patterns (frequently bought together)
 * - Category rules
 * - Customer purchase history
 *
 * Features:
 * - Multi-level caching (Redis or in-memory)
 * - Margin-aware suggestions for business optimization
 * - Recency-weighted purchase patterns
 * - Price-appropriate recommendations
 */

// In-memory cache fallback
const memoryCache = new Map();
const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Relationship type priorities (higher = more important)
 */
const RELATIONSHIP_PRIORITIES = {
  accessory: 100,
  bought_together: 80,
  upgrade: 60,
  alternative: 40,
};

/**
 * Reason templates for different relationship types
 */
const REASON_TEMPLATES = {
  accessory: {
    default: 'Essential accessory',
    tv: 'Essential accessory for your TV',
    phone: 'Perfect companion for your phone',
    laptop: 'Must-have for your laptop',
    camera: 'Recommended for your camera',
  },
  bought_together: {
    default: 'Frequently bought together',
    high_confidence: 'Customers who bought this also bought',
  },
  upgrade: {
    default: 'Upgrade option',
    better_value: 'Better value upgrade',
  },
  alternative: {
    default: 'Similar product',
    different_brand: 'Alternative from another brand',
    budget: 'Budget-friendly alternative',
    premium: 'Premium alternative',
  },
  rule: {
    default: 'Recommended for you',
    category: 'Popular with this purchase',
  },
  history: {
    default: 'Based on your purchase history',
    repeat: 'You might need this again',
  },
};

class RecommendationService {
  /**
   * @param {Pool} pool - PostgreSQL connection pool
   * @param {object} options - Configuration options
   * @param {object} options.redis - Redis client (optional)
   * @param {object} options.cache - Cache module (optional)
   */
  constructor(pool, options = {}) {
    this.pool = pool;
    this.redis = options.redis || null;
    this.cache = options.cache || null;

    // Configuration
    this.config = {
      // Cache TTLs (seconds)
      cacheTTL: {
        productRecommendations: 300, // 5 minutes
        cartRecommendations: 60, // 1 minute (more dynamic)
        crossSell: 300,
        customerHistory: 600, // 10 minutes
      },

      // Recommendation tuning
      recencyWeight: 0.7, // How much to weight recent purchases (0-1)
      marginBoost: 0.1, // Boost for high-margin items (0-1)
      marginThreshold: 0.3, // Margin % threshold to apply boost

      // Limits
      maxHistoryDays: 365, // Look back 1 year for patterns
      minConfidence: 0.05, // Minimum confidence for bought_together
      minCoPurchases: 2, // Minimum co-purchase count

      // Price filtering
      priceRangeMultiplier: {
        min: 0.1, // Suggest items at least 10% of cart value
        max: 2.0, // Don't suggest items more than 2x the source item
      },

      // Cross-sell specific
      crossSellMaxPrice: 0.5, // Max 50% of main item price for cross-sell
    };
  }

  // ===========================================================================
  // CACHING HELPERS
  // ===========================================================================

  /**
   * Get from cache (Redis or memory)
   */
  async cacheGet(key) {
    try {
      // Try Redis first
      if (this.redis) {
        const value = await this.redis.get(key);
        if (value) {
          return JSON.parse(value);
        }
      }

      // Fall back to memory cache
      const cached = memoryCache.get(key);
      if (cached && cached.expiry > Date.now()) {
        return cached.value;
      }

      // Clean up expired
      if (cached) {
        memoryCache.delete(key);
      }

      return null;
    } catch (error) {
      console.error('[RecommendationService] Cache get error:', error);
      return null;
    }
  }

  /**
   * Set cache (Redis or memory)
   */
  async cacheSet(key, value, ttlSeconds) {
    try {
      // Try Redis first
      if (this.redis) {
        await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
        return;
      }

      // Fall back to memory cache
      memoryCache.set(key, {
        value,
        expiry: Date.now() + ttlSeconds * 1000,
      });
    } catch (error) {
      console.error('[RecommendationService] Cache set error:', error);
    }
  }

  /**
   * Invalidate cache keys matching pattern
   */
  async cacheInvalidate(pattern) {
    try {
      if (this.redis) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }

      // Clear memory cache entries matching pattern
      const regex = new RegExp(pattern.replace('*', '.*'));
      for (const key of memoryCache.keys()) {
        if (regex.test(key)) {
          memoryCache.delete(key);
        }
      }
    } catch (error) {
      console.error('[RecommendationService] Cache invalidate error:', error);
    }
  }

  // ===========================================================================
  // MAIN RECOMMENDATION METHODS
  // ===========================================================================

  /**
   * Get recommendations for a single product
   * @param {number} productId - Product ID
   * @param {object} options - Options
   * @param {number} options.limit - Max recommendations (default 5)
   * @param {string[]} options.types - Relationship types to include
   * @param {boolean} options.includeOutOfStock - Include out of stock items
   * @returns {Promise<object>} Recommendations response
   */
  async getProductRecommendations(productId, options = {}) {
    const {
      limit = 5,
      types = ['accessory', 'bought_together', 'upgrade', 'alternative'],
      includeOutOfStock = false,
    } = options;

    const cacheKey = `rec:product:${productId}:${limit}:${types.join(',')}`;

    // Check cache
    const cached = await this.cacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Get source product details for context
      const sourceProduct = await this.getProductDetails(productId);
      if (!sourceProduct) {
        return { recommendations: [], source: null };
      }

      // Get curated and pattern-based relationships
      const relationships = await this.pool.query(
        `
        SELECT
          pr.related_product_id,
          pr.relationship_type,
          pr.strength,
          pr.is_curated,
          p.name,
          p.sku,
          p.price,
          p.cost,
          p.quantity,
          p.image_url,
          c.name as category_name
        FROM product_relationships pr
        JOIN products p ON pr.related_product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE pr.product_id = $1
          AND pr.relationship_type = ANY($2)
          AND pr.is_active = true
          AND p.is_active = true
          ${includeOutOfStock ? '' : 'AND p.quantity > 0'}
        ORDER BY
          pr.is_curated DESC,
          CASE pr.relationship_type
            WHEN 'accessory' THEN 1
            WHEN 'bought_together' THEN 2
            WHEN 'upgrade' THEN 3
            WHEN 'alternative' THEN 4
          END,
          pr.strength DESC
        LIMIT $3
        `,
        [productId, types, limit * 2] // Get extra to allow filtering
      );

      // Process and score recommendations
      const recommendations = this.processRecommendations(
        relationships.rows,
        sourceProduct,
        limit
      );

      const result = {
        recommendations,
        source: {
          productId: sourceProduct.id,
          name: sourceProduct.name,
          category: sourceProduct.category_name,
        },
        generatedAt: new Date().toISOString(),
      };

      // Cache result
      await this.cacheSet(cacheKey, result, this.config.cacheTTL.productRecommendations);

      return result;
    } catch (error) {
      console.error('[RecommendationService] getProductRecommendations error:', error);
      throw error;
    }
  }

  /**
   * Get recommendations based on entire cart contents
   * @param {Array} cartItems - Array of { productId, quantity, price }
   * @param {object} options - Options
   * @param {number} options.customerId - Customer ID for history-based recommendations
   * @param {number} options.limit - Max recommendations (default 5)
   * @returns {Promise<object>} Recommendations response
   */
  async getCartRecommendations(cartItems, options = {}) {
    const { customerId = null, limit = 5 } = options;

    if (!cartItems || cartItems.length === 0) {
      return { recommendations: [], cartAnalysis: null };
    }

    const productIds = cartItems.map((item) => item.productId);
    const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const cacheKey = `rec:cart:${productIds.sort().join(',')}:${customerId || 'anon'}:${limit}`;

    // Check cache
    const cached = await this.cacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Get recommendations from multiple sources
      const [relationshipRecs, ruleRecs, historyRecs] = await Promise.all([
        this.getRelationshipBasedRecs(productIds, limit * 2),
        this.getRuleBasedRecs(productIds, limit),
        customerId ? this.getHistoryBasedRecs(customerId, productIds, limit) : [],
      ]);

      // Combine and deduplicate
      const allRecs = [...relationshipRecs, ...ruleRecs, ...historyRecs];
      const seenIds = new Set(productIds); // Exclude items already in cart
      const uniqueRecs = [];
      const categoryCount = {};

      for (const rec of allRecs) {
        if (seenIds.has(rec.productId)) continue;

        // Ensure diversity - don't show too many from same category
        const category = rec.categoryName || 'unknown';
        categoryCount[category] = (categoryCount[category] || 0) + 1;
        if (categoryCount[category] > 2) continue;

        // Price appropriateness check
        if (rec.price > cartTotal * this.config.priceRangeMultiplier.max) {
          continue;
        }

        seenIds.add(rec.productId);
        uniqueRecs.push(rec);
      }

      // Sort by composite score and limit
      uniqueRecs.sort((a, b) => b.score - a.score);
      const finalRecs = uniqueRecs.slice(0, limit);

      // Format response
      const recommendations = finalRecs.map((rec) => ({
        productId: rec.productId,
        name: rec.name,
        sku: rec.sku,
        price: parseFloat(rec.price),
        reason: rec.reason,
        relevanceScore: Math.round(rec.score * 100) / 100,
        imageUrl: rec.imageUrl,
        category: rec.categoryName,
        source: rec.source,
      }));

      const result = {
        recommendations,
        cartAnalysis: {
          itemCount: cartItems.length,
          cartTotal: Math.round(cartTotal * 100) / 100,
          productIds,
        },
        generatedAt: new Date().toISOString(),
      };

      // Cache result
      await this.cacheSet(cacheKey, result, this.config.cacheTTL.cartRecommendations);

      return result;
    } catch (error) {
      console.error('[RecommendationService] getCartRecommendations error:', error);
      throw error;
    }
  }

  /**
   * Get cross-sell suggestions for checkout upsell
   * Focuses on lower-priced accessories and add-ons with good margins
   * @param {number} productId - Main product ID
   * @param {object} options - Options
   * @param {number} options.limit - Max suggestions (default 3)
   * @param {boolean} options.includeMarginData - Include margin info (admin only)
   * @returns {Promise<object>} Cross-sell suggestions
   */
  async getCrossSellSuggestions(productId, options = {}) {
    const { limit = 3, includeMarginData = false } = options;

    const cacheKey = `rec:crosssell:${productId}:${limit}`;

    // Check cache
    const cached = await this.cacheGet(cacheKey);
    if (cached && !includeMarginData) {
      return cached;
    }

    try {
      // Get source product
      const sourceProduct = await this.getProductDetails(productId);
      if (!sourceProduct) {
        return { suggestions: [], source: null };
      }

      const maxPrice = sourceProduct.price * this.config.crossSellMaxPrice;

      // Get low-cost accessories and add-ons
      const result = await this.pool.query(
        `
        SELECT
          pr.related_product_id as product_id,
          pr.relationship_type,
          pr.strength,
          p.name,
          p.sku,
          p.price,
          p.cost,
          p.quantity,
          p.image_url,
          c.name as category_name,
          CASE
            WHEN p.cost > 0 THEN ((p.price - p.cost) / p.price)
            ELSE 0.3
          END as margin_percent
        FROM product_relationships pr
        JOIN products p ON pr.related_product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE pr.product_id = $1
          AND pr.relationship_type IN ('accessory', 'bought_together')
          AND pr.is_active = true
          AND p.is_active = true
          AND p.quantity > 0
          AND p.price <= $2
          AND p.price > 0
        ORDER BY
          -- Prioritize: high margin + accessory + high strength
          (CASE WHEN pr.relationship_type = 'accessory' THEN 0.3 ELSE 0 END) +
          (CASE WHEN p.cost > 0 THEN ((p.price - p.cost) / p.price) * 0.3 ELSE 0.1 END) +
          (pr.strength * 0.4) DESC
        LIMIT $3
        `,
        [productId, maxPrice, limit * 2]
      );

      // Process suggestions
      const suggestions = result.rows.slice(0, limit).map((row) => {
        const suggestion = {
          productId: row.product_id,
          name: row.name,
          sku: row.sku,
          price: parseFloat(row.price),
          reason: this.getReasonText(row.relationship_type, sourceProduct),
          relevanceScore: parseFloat(row.strength),
          imageUrl: row.image_url,
          category: row.category_name,
          priceAsPercentOfMain: Math.round((row.price / sourceProduct.price) * 100),
        };

        if (includeMarginData) {
          suggestion.marginPercent = Math.round(row.margin_percent * 100);
          suggestion.marginAmount = row.cost
            ? parseFloat((row.price - row.cost).toFixed(2))
            : null;
        }

        return suggestion;
      });

      const response = {
        suggestions,
        source: {
          productId: sourceProduct.id,
          name: sourceProduct.name,
          price: parseFloat(sourceProduct.price),
        },
        maxSuggestionPrice: Math.round(maxPrice * 100) / 100,
        generatedAt: new Date().toISOString(),
      };

      // Cache without margin data
      if (!includeMarginData) {
        await this.cacheSet(cacheKey, response, this.config.cacheTTL.crossSell);
      }

      return response;
    } catch (error) {
      console.error('[RecommendationService] getCrossSellSuggestions error:', error);
      throw error;
    }
  }

  /**
   * Record purchase patterns after order completion
   * Should be called asynchronously to not block checkout
   * @param {number} orderId - Order/Transaction ID
   * @returns {Promise<object>} Result summary
   */
  async recordPurchasePattern(orderId) {
    try {
      // Get products from the order
      const itemsResult = await this.pool.query(
        `
        SELECT DISTINCT product_id
        FROM transaction_items
        WHERE transaction_id = $1
        ORDER BY product_id
        `,
        [orderId]
      );

      const productIds = itemsResult.rows.map((r) => r.product_id);

      if (productIds.length < 2) {
        return { updated: 0, message: 'Less than 2 products, no patterns to record' };
      }

      let patternsUpdated = 0;

      // Update co-purchase patterns for each pair
      for (let i = 0; i < productIds.length - 1; i++) {
        for (let j = i + 1; j < productIds.length; j++) {
          const productA = productIds[i];
          const productB = productIds[j];

          await this.pool.query(
            `
            INSERT INTO purchase_patterns (
              product_a_id, product_b_id, co_purchase_count,
              first_co_purchase_at, last_co_purchase_at
            )
            VALUES ($1, $2, 1, NOW(), NOW())
            ON CONFLICT (product_a_id, product_b_id)
            DO UPDATE SET
              co_purchase_count = purchase_patterns.co_purchase_count + 1,
              last_co_purchase_at = NOW(),
              last_updated = NOW()
            `,
            [productA, productB]
          );

          patternsUpdated++;
        }
      }

      // Invalidate relevant caches
      for (const productId of productIds) {
        await this.cacheInvalidate(`rec:product:${productId}:*`);
      }

      return {
        orderId,
        productCount: productIds.length,
        patternsUpdated,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[RecommendationService] recordPurchasePattern error:', error);
      throw error;
    }
  }

  /**
   * Refresh recommendation data - nightly job
   * Recalculates relationship strengths based on purchase patterns
   * @param {object} options - Options
   * @param {number} options.minCoPurchases - Minimum co-purchases to create relationship
   * @param {number} options.minConfidence - Minimum confidence score
   * @returns {Promise<object>} Refresh summary
   */
  async refreshRecommendations(options = {}) {
    const {
      minCoPurchases = this.config.minCoPurchases,
      minConfidence = this.config.minConfidence,
    } = options;

    const startTime = Date.now();

    try {
      // Step 1: Update individual product purchase counts
      console.log('[RecommendationService] Updating product purchase counts...');

      await this.pool.query(`
        UPDATE purchase_patterns pp
        SET
          product_a_purchase_count = COALESCE((
            SELECT COUNT(DISTINCT transaction_id)
            FROM transaction_items ti
            JOIN transactions t ON ti.transaction_id = t.transaction_id
            WHERE ti.product_id = pp.product_a_id
              AND t.status = 'completed'
              AND t.created_at >= NOW() - INTERVAL '${this.config.maxHistoryDays} days'
          ), 0),
          product_b_purchase_count = COALESCE((
            SELECT COUNT(DISTINCT transaction_id)
            FROM transaction_items ti
            JOIN transactions t ON ti.transaction_id = t.transaction_id
            WHERE ti.product_id = pp.product_b_id
              AND t.status = 'completed'
              AND t.created_at >= NOW() - INTERVAL '${this.config.maxHistoryDays} days'
          ), 0),
          last_updated = NOW()
      `);

      // Step 2: Calculate confidence scores with recency weighting
      console.log('[RecommendationService] Calculating confidence scores...');

      await this.pool.query(`
        UPDATE purchase_patterns
        SET
          confidence_a_to_b = CASE
            WHEN product_a_purchase_count > 0
            THEN LEAST(1.0, co_purchase_count::DECIMAL / product_a_purchase_count)
            ELSE 0
          END,
          confidence_b_to_a = CASE
            WHEN product_b_purchase_count > 0
            THEN LEAST(1.0, co_purchase_count::DECIMAL / product_b_purchase_count)
            ELSE 0
          END,
          -- Calculate lift (association strength)
          lift = CASE
            WHEN product_a_purchase_count > 0 AND product_b_purchase_count > 0
            THEN (co_purchase_count::DECIMAL * (
              SELECT COUNT(DISTINCT transaction_id) FROM transactions
              WHERE status = 'completed'
              AND created_at >= NOW() - INTERVAL '${this.config.maxHistoryDays} days'
            )) / (product_a_purchase_count::DECIMAL * product_b_purchase_count)
            ELSE 1.0
          END
      `);

      // Step 3: Generate/update bought_together relationships
      console.log('[RecommendationService] Generating bought_together relationships...');

      // A -> B direction
      const resultAB = await this.pool.query(
        `
        INSERT INTO product_relationships (
          product_id, related_product_id, relationship_type, strength, is_curated, source
        )
        SELECT
          pp.product_a_id,
          pp.product_b_id,
          'bought_together',
          LEAST(1.0, (
            pp.confidence_a_to_b * $3 +  -- Base confidence
            (CASE WHEN pp.last_co_purchase_at > NOW() - INTERVAL '30 days'
              THEN 0.2 ELSE 0 END) +  -- Recency boost
            (CASE WHEN pp.lift > 2 THEN 0.1 ELSE 0 END)  -- High lift boost
          )),
          false,
          'purchase_analysis'
        FROM purchase_patterns pp
        WHERE pp.co_purchase_count >= $1
          AND pp.confidence_a_to_b >= $2
          AND EXISTS (SELECT 1 FROM products WHERE id = pp.product_a_id AND is_active = true)
          AND EXISTS (SELECT 1 FROM products WHERE id = pp.product_b_id AND is_active = true)
        ON CONFLICT (product_id, related_product_id, relationship_type)
        DO UPDATE SET
          strength = EXCLUDED.strength,
          updated_at = NOW()
        `,
        [minCoPurchases, minConfidence, this.config.recencyWeight]
      );

      // B -> A direction
      const resultBA = await this.pool.query(
        `
        INSERT INTO product_relationships (
          product_id, related_product_id, relationship_type, strength, is_curated, source
        )
        SELECT
          pp.product_b_id,
          pp.product_a_id,
          'bought_together',
          LEAST(1.0, (
            pp.confidence_b_to_a * $3 +
            (CASE WHEN pp.last_co_purchase_at > NOW() - INTERVAL '30 days'
              THEN 0.2 ELSE 0 END) +
            (CASE WHEN pp.lift > 2 THEN 0.1 ELSE 0 END)
          )),
          false,
          'purchase_analysis'
        FROM purchase_patterns pp
        WHERE pp.co_purchase_count >= $1
          AND pp.confidence_b_to_a >= $2
          AND EXISTS (SELECT 1 FROM products WHERE id = pp.product_a_id AND is_active = true)
          AND EXISTS (SELECT 1 FROM products WHERE id = pp.product_b_id AND is_active = true)
        ON CONFLICT (product_id, related_product_id, relationship_type)
        DO UPDATE SET
          strength = EXCLUDED.strength,
          updated_at = NOW()
        `,
        [minCoPurchases, minConfidence, this.config.recencyWeight]
      );

      // Step 4: Deactivate stale auto-generated relationships
      console.log('[RecommendationService] Cleaning up stale relationships...');

      const staleResult = await this.pool.query(`
        UPDATE product_relationships
        SET is_active = false, updated_at = NOW()
        WHERE is_curated = false
          AND source = 'purchase_analysis'
          AND updated_at < NOW() - INTERVAL '90 days'
      `);

      // Step 5: Clear all recommendation caches
      console.log('[RecommendationService] Clearing caches...');
      await this.cacheInvalidate('rec:*');

      const duration = Date.now() - startTime;

      const summary = {
        success: true,
        duration: `${duration}ms`,
        relationshipsUpdated: resultAB.rowCount + resultBA.rowCount,
        relationshipsDeactivated: staleResult.rowCount,
        parameters: {
          minCoPurchases,
          minConfidence,
          maxHistoryDays: this.config.maxHistoryDays,
        },
        completedAt: new Date().toISOString(),
      };

      console.log('[RecommendationService] Refresh complete:', summary);
      return summary;
    } catch (error) {
      console.error('[RecommendationService] refreshRecommendations error:', error);
      throw error;
    }
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Get product details
   */
  async getProductDetails(productId) {
    const result = await this.pool.query(
      `
      SELECT
        p.id, p.name, p.sku, p.price, p.cost, p.quantity, p.image_url,
        p.category_id, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = $1
      `,
      [productId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get relationship-based recommendations for multiple products
   */
  async getRelationshipBasedRecs(productIds, limit) {
    const result = await this.pool.query(
      `
      SELECT DISTINCT ON (p.id)
        p.id as product_id,
        p.name,
        p.sku,
        p.price,
        p.cost,
        p.quantity,
        p.image_url,
        c.name as category_name,
        pr.relationship_type,
        pr.strength,
        pr.is_curated
      FROM product_relationships pr
      JOIN products p ON pr.related_product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE pr.product_id = ANY($1)
        AND pr.related_product_id != ALL($1)  -- Exclude cart items
        AND pr.is_active = true
        AND p.is_active = true
        AND p.quantity > 0
      ORDER BY p.id, pr.is_curated DESC, pr.strength DESC
      LIMIT $2
      `,
      [productIds, limit]
    );

    return result.rows.map((row) => ({
      productId: row.product_id,
      name: row.name,
      sku: row.sku,
      price: parseFloat(row.price),
      imageUrl: row.image_url,
      categoryName: row.category_name,
      reason: this.getReasonText(row.relationship_type),
      score: this.calculateScore(row),
      source: 'relationship',
    }));
  }

  /**
   * Get rule-based recommendations
   */
  async getRuleBasedRecs(productIds, limit) {
    // Get categories of cart items
    const categoriesResult = await this.pool.query(
      `SELECT DISTINCT category_id FROM products WHERE id = ANY($1) AND category_id IS NOT NULL`,
      [productIds]
    );
    const categoryIds = categoriesResult.rows.map((r) => r.category_id);

    if (categoryIds.length === 0) {
      return [];
    }

    const result = await this.pool.query(
      `
      SELECT DISTINCT ON (p.id)
        p.id as product_id,
        p.name,
        p.sku,
        p.price,
        p.cost,
        p.image_url,
        c.name as category_name,
        rr.priority,
        rr.name as rule_name
      FROM recommendation_rules rr
      JOIN products p ON (
        (rr.target_product_id = p.id) OR
        (rr.target_category_id = p.category_id AND rr.target_product_id IS NULL)
      )
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE rr.is_active = true
        AND (rr.source_category_id = ANY($1) OR rr.source_product_id = ANY($2))
        AND p.id != ALL($2)
        AND p.is_active = true
        AND p.quantity > 0
        AND (rr.valid_from IS NULL OR rr.valid_from <= NOW())
        AND (rr.valid_until IS NULL OR rr.valid_until >= NOW())
        AND (rr.require_stock = false OR p.quantity > 0)
        AND (rr.min_price IS NULL OR p.price >= rr.min_price)
        AND (rr.max_price IS NULL OR p.price <= rr.max_price)
      ORDER BY p.id, rr.priority DESC
      LIMIT $3
      `,
      [categoryIds, productIds, limit]
    );

    return result.rows.map((row) => ({
      productId: row.product_id,
      name: row.name,
      sku: row.sku,
      price: parseFloat(row.price),
      imageUrl: row.image_url,
      categoryName: row.category_name,
      reason: REASON_TEMPLATES.rule.category,
      score: 0.5 + (row.priority / 200), // Normalize priority to 0.5-1.0
      source: 'rule',
    }));
  }

  /**
   * Get history-based recommendations for a customer
   */
  async getHistoryBasedRecs(customerId, excludeProductIds, limit) {
    const result = await this.pool.query(
      `
      WITH customer_purchases AS (
        SELECT DISTINCT ti.product_id
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.transaction_id
        WHERE t.customer_id = $1
          AND t.status = 'completed'
          AND t.created_at >= NOW() - INTERVAL '180 days'
      )
      SELECT DISTINCT ON (p.id)
        p.id as product_id,
        p.name,
        p.sku,
        p.price,
        p.image_url,
        c.name as category_name,
        pr.strength
      FROM customer_purchases cp
      JOIN product_relationships pr ON cp.product_id = pr.product_id
      JOIN products p ON pr.related_product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE pr.related_product_id != ALL($2)
        AND pr.relationship_type IN ('accessory', 'bought_together')
        AND pr.is_active = true
        AND p.is_active = true
        AND p.quantity > 0
      ORDER BY p.id, pr.strength DESC
      LIMIT $3
      `,
      [customerId, excludeProductIds, limit]
    );

    return result.rows.map((row) => ({
      productId: row.product_id,
      name: row.name,
      sku: row.sku,
      price: parseFloat(row.price),
      imageUrl: row.image_url,
      categoryName: row.category_name,
      reason: REASON_TEMPLATES.history.default,
      score: 0.6 + parseFloat(row.strength) * 0.3,
      source: 'history',
    }));
  }

  /**
   * Process and score recommendations
   */
  processRecommendations(rows, sourceProduct, limit) {
    return rows.slice(0, limit).map((row) => {
      const score = this.calculateScore(row, sourceProduct);

      return {
        productId: row.related_product_id,
        name: row.name,
        sku: row.sku,
        price: parseFloat(row.price),
        reason: this.getReasonText(row.relationship_type, sourceProduct),
        relevanceScore: Math.round(score * 100) / 100,
        imageUrl: row.image_url,
        category: row.category_name,
        relationshipType: row.relationship_type,
        isCurated: row.is_curated,
      };
    });
  }

  /**
   * Calculate composite score for a recommendation
   */
  calculateScore(row, sourceProduct = null) {
    let score = parseFloat(row.strength) || 0.5;

    // Boost curated items
    if (row.is_curated) {
      score += 0.15;
    }

    // Relationship type priority
    const typePriority = RELATIONSHIP_PRIORITIES[row.relationship_type] || 50;
    score += typePriority / 500; // Add 0.08-0.2 based on type

    // Margin boost
    if (row.cost && row.price) {
      const margin = (row.price - row.cost) / row.price;
      if (margin >= this.config.marginThreshold) {
        score += this.config.marginBoost;
      }
    }

    // Price appropriateness (if source product available)
    if (sourceProduct && row.price) {
      const priceRatio = row.price / sourceProduct.price;
      if (priceRatio > 0.1 && priceRatio < 1.5) {
        score += 0.05; // Reasonable price range bonus
      }
    }

    return Math.min(1.0, score);
  }

  /**
   * Get human-readable reason text
   */
  getReasonText(relationshipType, sourceProduct = null) {
    const templates = REASON_TEMPLATES[relationshipType] || REASON_TEMPLATES.bought_together;

    // Try to get category-specific template
    if (sourceProduct && sourceProduct.category_name) {
      const categoryKey = sourceProduct.category_name.toLowerCase();
      for (const key of Object.keys(templates)) {
        if (categoryKey.includes(key)) {
          return templates[key];
        }
      }
    }

    return templates.default;
  }

  // ===========================================================================
  // ANALYTICS & TRACKING
  // ===========================================================================

  /**
   * Record a recommendation event (impression, click, add-to-cart, purchase)
   */
  async recordRecommendationEvent(event) {
    const {
      sessionId,
      userId,
      customerId,
      sourceProductId,
      recommendedProductId,
      relationshipId,
      ruleId,
      recommendationType,
      eventType,
      position,
      pageType,
      deviceType,
    } = event;

    try {
      await this.pool.query(
        `
        INSERT INTO recommendation_events (
          session_id, user_id, customer_id, source_product_id,
          recommended_product_id, relationship_id, rule_id,
          recommendation_type, event_type, position, page_type, device_type,
          clicked, added_to_cart, purchased
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `,
        [
          sessionId,
          userId,
          customerId,
          sourceProductId,
          recommendedProductId,
          relationshipId,
          ruleId,
          recommendationType,
          eventType,
          position,
          pageType,
          deviceType,
          eventType === 'click',
          eventType === 'add_to_cart',
          eventType === 'purchase',
        ]
      );
    } catch (error) {
      // Don't throw - analytics shouldn't break the app
      console.error('[RecommendationService] recordRecommendationEvent error:', error);
    }
  }

  /**
   * Get recommendation performance metrics
   */
  async getPerformanceMetrics(options = {}) {
    const { startDate, endDate, groupBy = 'type' } = options;

    let dateFilter = '';
    const params = [];

    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND event_at >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND event_at <= $${params.length}`;
    }

    const groupColumn =
      groupBy === 'rule' ? 'rule_id' : groupBy === 'product' ? 'recommended_product_id' : 'recommendation_type';

    const result = await this.pool.query(
      `
      SELECT
        ${groupColumn} as group_key,
        COUNT(*) FILTER (WHERE event_type = 'impression') as impressions,
        COUNT(*) FILTER (WHERE event_type = 'click') as clicks,
        COUNT(*) FILTER (WHERE event_type = 'add_to_cart') as add_to_carts,
        COUNT(*) FILTER (WHERE event_type = 'purchase') as purchases,
        ROUND(
          COUNT(*) FILTER (WHERE event_type = 'click')::DECIMAL /
          NULLIF(COUNT(*) FILTER (WHERE event_type = 'impression'), 0) * 100, 2
        ) as ctr,
        ROUND(
          COUNT(*) FILTER (WHERE event_type = 'purchase')::DECIMAL /
          NULLIF(COUNT(*) FILTER (WHERE event_type = 'impression'), 0) * 100, 2
        ) as conversion_rate
      FROM recommendation_events
      WHERE 1=1 ${dateFilter}
      GROUP BY ${groupColumn}
      ORDER BY impressions DESC
      `,
      params
    );

    return {
      metrics: result.rows,
      groupBy,
      dateRange: { startDate, endDate },
    };
  }
}

module.exports = RecommendationService;
