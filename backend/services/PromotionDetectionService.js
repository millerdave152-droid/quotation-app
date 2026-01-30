/**
 * PromotionDetectionService
 *
 * Detects eligible manufacturer promotions based on products in a quote.
 * Handles:
 * - Bundle savings detection (counting qualifying items)
 * - Bonus gift eligibility
 * - Product badges for guarantees
 */

class PromotionDetectionService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Detect all eligible promotions for a list of products
   * @param {Array} products - Array of product objects with model, manufacturer
   * @param {Date} quoteDate - Date to check promotion validity (defaults to today)
   * @returns {object} Categorized eligible promotions
   */
  async detectEligiblePromotions(products, quoteDate = new Date()) {
    const dateStr = quoteDate.toISOString().split('T')[0];

    // Get all active promotions valid for the quote date
    const activePromotions = await this.pool.query(`
      SELECT mp.*,
        (SELECT COUNT(*) FROM promotion_eligible_models WHERE promotion_id = mp.id) as eligible_model_count
      FROM manufacturer_promotions mp
      WHERE mp.is_active = true
        AND mp.start_date <= $1
        AND mp.end_date >= $1
      ORDER BY mp.promo_type, mp.manufacturer
    `, [dateStr]);

    const results = {
      bundlePromotions: [],
      giftPromotions: [],
      badges: [],
      summary: {
        totalEligible: 0,
        maxSavings: 0
      }
    };

    for (const promo of activePromotions.rows) {
      const qualification = await this.checkQualification(promo, products);

      if (qualification.isEligible || qualification.partialMatch) {
        const promoResult = {
          id: promo.id,
          promo_code: promo.promo_code,
          promo_name: promo.promo_name,
          manufacturer: promo.manufacturer,
          promo_type: promo.promo_type,
          start_date: promo.start_date,
          end_date: promo.end_date,
          ...qualification
        };

        switch (promo.promo_type) {
          case 'bundle_savings':
            promoResult.tier_discounts = promo.tier_discounts;
            promoResult.min_qualifying_items = promo.min_qualifying_items;
            results.bundlePromotions.push(promoResult);
            if (qualification.discountCents > 0) {
              results.summary.maxSavings += qualification.discountCents;
            }
            break;

          case 'bonus_gift':
            promoResult.gift_description = promo.gift_description;
            promoResult.gift_value_cents = promo.gift_value_cents;
            promoResult.redemption_type = promo.redemption_type;
            promoResult.redemption_url = promo.redemption_url;
            results.giftPromotions.push(promoResult);
            break;

          case 'guarantee':
            promoResult.badge_text = promo.badge_text;
            promoResult.badge_color = promo.badge_color;
            results.badges.push(promoResult);
            break;
        }

        if (qualification.isEligible) {
          results.summary.totalEligible++;
        }
      }
    }

    return results;
  }

  /**
   * Check if products qualify for a specific promotion
   */
  async checkQualification(promotion, products) {
    // Get eligible models for this promotion
    const eligibleModels = await this.pool.query(`
      SELECT brand, model, category, subcategory
      FROM promotion_eligible_models
      WHERE promotion_id = $1
    `, [promotion.id]);

    const eligibleModelSet = new Set(
      eligibleModels.rows.map(m => `${m.brand.toUpperCase()}:${m.model.toUpperCase()}`)
    );

    // Find matching products
    const qualifyingProducts = [];
    const nonQualifyingProducts = [];

    for (const product of products) {
      const productModel = (product.model || '').toUpperCase();
      const productManufacturer = (product.manufacturer || product.brand || '').toUpperCase();

      // Check direct match or with brand variations
      const matchKeys = [
        `${productManufacturer}:${productModel}`,
        `WHR:${productModel}`,
        `WHIRLPOOL:${productModel}`,
        `${promotion.manufacturer.toUpperCase()}:${productModel}`
      ];

      const isMatch = matchKeys.some(key => eligibleModelSet.has(key));

      // Also check exclusion rules
      let isExcluded = false;
      if (promotion.exclusion_rules) {
        const rules = typeof promotion.exclusion_rules === 'string'
          ? JSON.parse(promotion.exclusion_rules)
          : promotion.exclusion_rules;

        if (rules.exclude_categories) {
          const productCategory = (product.category || '').toLowerCase();
          isExcluded = rules.exclude_categories.some(cat =>
            productCategory.includes(cat.toLowerCase())
          );
        }
      }

      if (isMatch && !isExcluded) {
        qualifyingProducts.push({
          product_id: product.id || product.product_id,
          model: product.model,
          manufacturer: product.manufacturer || product.brand,
          name: product.name || product.description
        });
      } else if (!isExcluded) {
        nonQualifyingProducts.push(product);
      }
    }

    // Calculate qualification status based on promotion type
    const result = {
      qualifyingProducts,
      qualifyingCount: qualifyingProducts.length,
      totalProducts: products.length,
      isEligible: false,
      partialMatch: false,
      discountCents: 0,
      nextTierInfo: null
    };

    if (promotion.promo_type === 'bundle_savings') {
      const minItems = promotion.min_qualifying_items || 2;
      const tiers = promotion.tier_discounts || [];

      result.isEligible = result.qualifyingCount >= minItems;
      result.partialMatch = result.qualifyingCount > 0 && result.qualifyingCount < minItems;

      // Find applicable tier
      if (result.isEligible && tiers.length > 0) {
        const sortedTiers = [...tiers].sort((a, b) => b.min_items - a.min_items);
        for (const tier of sortedTiers) {
          if (result.qualifyingCount >= tier.min_items) {
            result.discountCents = tier.discount_cents;
            result.appliedTier = tier;
            break;
          }
        }
      }

      // Calculate next tier info
      if (tiers.length > 0) {
        const sortedTiers = [...tiers].sort((a, b) => a.min_items - b.min_items);
        for (const tier of sortedTiers) {
          if (result.qualifyingCount < tier.min_items) {
            result.nextTierInfo = {
              itemsNeeded: tier.min_items - result.qualifyingCount,
              discountCents: tier.discount_cents,
              message: `Add ${tier.min_items - result.qualifyingCount} more qualifying item(s) to save $${(tier.discount_cents / 100).toFixed(0)}`
            };
            break;
          }
        }
      }

    } else if (promotion.promo_type === 'bonus_gift') {
      // Gift promotions require at least 1 qualifying product
      result.isEligible = result.qualifyingCount >= 1;
      result.partialMatch = false;

    } else if (promotion.promo_type === 'guarantee') {
      // Guarantees show badge if any qualifying product
      result.isEligible = result.qualifyingCount >= 1;
      result.partialMatch = false;
    }

    return result;
  }

  /**
   * Get all active promotions (for admin display)
   * @param {string} manufacturer - Optional filter by manufacturer
   */
  async getActivePromotions(manufacturer = null) {
    let query = `
      SELECT mp.*,
        (SELECT COUNT(*) FROM promotion_eligible_models WHERE promotion_id = mp.id) as eligible_model_count,
        (SELECT COUNT(*) FROM quote_applied_promotions WHERE promotion_id = mp.id AND status = 'active') as times_applied
      FROM manufacturer_promotions mp
      WHERE mp.is_active = true
    `;
    const params = [];

    if (manufacturer) {
      query += ' AND mp.manufacturer = $1';
      params.push(manufacturer);
    }

    query += ' ORDER BY mp.start_date DESC, mp.manufacturer';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get all promotions with filtering
   */
  async getPromotions(filters = {}) {
    const { manufacturer, promo_type, active_only = true, include_expired = false, limit = 50, offset = 0 } = filters;

    let query = `
      SELECT mp.*,
        (SELECT COUNT(*) FROM promotion_eligible_models WHERE promotion_id = mp.id) as eligible_model_count
      FROM manufacturer_promotions mp
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (active_only) {
      query += ` AND mp.is_active = true`;
    }

    if (!include_expired) {
      query += ` AND mp.end_date >= CURRENT_DATE`;
    }

    if (manufacturer) {
      query += ` AND mp.manufacturer = $${paramIdx++}`;
      params.push(manufacturer);
    }

    if (promo_type) {
      query += ` AND mp.promo_type = $${paramIdx++}`;
      params.push(promo_type);
    }

    query += ` ORDER BY mp.start_date DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get promotion by ID with eligible models
   */
  async getPromotionById(promotionId) {
    const promoResult = await this.pool.query(`
      SELECT * FROM manufacturer_promotions WHERE id = $1
    `, [promotionId]);

    if (promoResult.rows.length === 0) return null;

    const promotion = promoResult.rows[0];

    // Get eligible models
    const modelsResult = await this.pool.query(`
      SELECT pem.*, p.name as product_name, p.msrp_cents
      FROM promotion_eligible_models pem
      LEFT JOIN products p ON pem.product_id = p.id
      WHERE pem.promotion_id = $1
      ORDER BY pem.category, pem.model
    `, [promotionId]);

    promotion.eligible_models = modelsResult.rows;
    promotion.eligible_model_count = modelsResult.rows.length;

    return promotion;
  }

  /**
   * Get promotion badges for a single product
   * @param {number} productId - Product ID (optional)
   * @param {string} model - Model number
   * @param {string} manufacturer - Manufacturer/brand name
   * @returns {Array} Array of badge objects
   */
  async getProductPromotionBadges(productId, model, manufacturer) {
    const dateStr = new Date().toISOString().split('T')[0];

    const result = await this.pool.query(`
      SELECT DISTINCT
        mp.id,
        mp.promo_code,
        mp.promo_name,
        mp.promo_type,
        mp.badge_text,
        mp.badge_color,
        mp.gift_description,
        mp.manufacturer,
        mp.start_date,
        mp.end_date
      FROM manufacturer_promotions mp
      JOIN promotion_eligible_models pem ON mp.id = pem.promotion_id
      WHERE mp.is_active = true
        AND mp.start_date <= $1
        AND mp.end_date >= $1
        AND (mp.show_on_product_card = true OR mp.promo_type = 'guarantee')
        AND (
          (pem.product_id = $2)
          OR (UPPER(pem.model) = UPPER($3))
          OR (UPPER(pem.model) = UPPER($3) AND UPPER(pem.brand) = UPPER($4))
        )
      ORDER BY mp.promo_type
    `, [dateStr, productId, model, manufacturer]);

    return result.rows.map(row => ({
      id: row.id,
      type: row.promo_type,
      text: row.badge_text || row.promo_name,
      color: row.badge_color || '#059669',
      tooltip: row.promo_type === 'bonus_gift' ? row.gift_description : row.promo_name,
      manufacturer: row.manufacturer
    }));
  }

  /**
   * Get all products with active promotion badges
   * @param {string} manufacturer - Optional filter by manufacturer
   */
  async getProductsWithBadges(manufacturer = null) {
    const dateStr = new Date().toISOString().split('T')[0];

    let query = `
      SELECT DISTINCT
        pem.model,
        pem.brand,
        pem.product_id,
        p.name as product_name,
        mp.id as promotion_id,
        mp.promo_type,
        mp.badge_text,
        mp.badge_color,
        mp.promo_name
      FROM promotion_eligible_models pem
      JOIN manufacturer_promotions mp ON pem.promotion_id = mp.id
      LEFT JOIN products p ON pem.product_id = p.id
      WHERE mp.is_active = true
        AND mp.start_date <= $1
        AND mp.end_date >= $1
        AND (mp.show_on_product_card = true OR mp.promo_type = 'guarantee')
    `;
    const params = [dateStr];

    if (manufacturer) {
      query += ' AND mp.manufacturer = $2';
      params.push(manufacturer);
    }

    query += ' ORDER BY pem.brand, pem.model';

    const result = await this.pool.query(query, params);
    return result.rows;
  }
}

module.exports = PromotionDetectionService;
