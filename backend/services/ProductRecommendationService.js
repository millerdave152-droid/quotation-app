/**
 * Product Recommendation Service
 * Provides AI-powered product recommendations based on purchase patterns
 * - Frequently bought together
 * - Customers who bought X also bought Y
 * - Complementary products
 * - Bundle suggestions
 */

class ProductRecommendationService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Get frequently bought together products
   * Analyzes quote line items to find products commonly purchased together
   * @param {number} productId - Base product ID
   * @param {number} limit - Max recommendations to return
   */
  async getFrequentlyBoughtTogether(productId, limit = 5) {
    const result = await this.pool.query(`
      WITH product_quotes AS (
        -- Find all quotes containing the target product
        SELECT DISTINCT qi.quotation_id
        FROM quote_items qi
        WHERE qi.product_id = $1
      ),
      co_purchased AS (
        -- Find other products in those same quotes
        SELECT
          qi.product_id,
          p.name as product_name,
          p.sku,
          p.base_price_cents,
          p.category,
          p.image_url,
          COUNT(DISTINCT qi.quotation_id) as purchase_count,
          COUNT(DISTINCT qi.quotation_id)::float / (
            SELECT COUNT(*) FROM product_quotes
          ) as co_purchase_rate
        FROM quote_items qi
        JOIN products p ON qi.product_id = p.id
        WHERE qi.quotation_id IN (SELECT quotation_id FROM product_quotes)
          AND qi.product_id != $1
          AND p.active = true
        GROUP BY qi.product_id, p.name, p.sku, p.base_price_cents, p.category, p.image_url
        HAVING COUNT(DISTINCT qi.quotation_id) >= 2
      )
      SELECT
        product_id,
        product_name,
        sku,
        base_price_cents,
        category,
        image_url,
        purchase_count,
        ROUND(co_purchase_rate * 100, 1) as co_purchase_percentage
      FROM co_purchased
      ORDER BY purchase_count DESC, co_purchase_rate DESC
      LIMIT $2
    `, [productId, limit]);

    return result.rows;
  }

  /**
   * Get "customers who bought X also bought Y" recommendations
   * Based on customer purchase history across all their quotes/orders
   * @param {number} productId - Base product ID
   * @param {number} limit - Max recommendations
   */
  async getCustomersAlsoBought(productId, limit = 5) {
    const result = await this.pool.query(`
      WITH customers_who_bought AS (
        -- Find all customers who bought the target product
        SELECT DISTINCT q.customer_id
        FROM quotations q
        JOIN quote_items qi ON q.id = qi.quotation_id
        WHERE qi.product_id = $1
          AND q.status = 'WON'
          AND q.customer_id IS NOT NULL
      ),
      other_purchases AS (
        -- Find all other products these customers bought
        SELECT
          qi.product_id,
          p.name as product_name,
          p.sku,
          p.base_price_cents,
          p.category,
          p.image_url,
          COUNT(DISTINCT q.customer_id) as customer_count,
          COUNT(*) as purchase_count
        FROM quotations q
        JOIN quote_items qi ON q.id = qi.quotation_id
        JOIN products p ON qi.product_id = p.id
        WHERE q.customer_id IN (SELECT customer_id FROM customers_who_bought)
          AND q.status = 'WON'
          AND qi.product_id != $1
          AND p.active = true
        GROUP BY qi.product_id, p.name, p.sku, p.base_price_cents, p.category, p.image_url
      )
      SELECT
        product_id,
        product_name,
        sku,
        base_price_cents,
        category,
        image_url,
        customer_count,
        purchase_count,
        ROUND(
          customer_count::float / (SELECT COUNT(*) FROM customers_who_bought) * 100,
          1
        ) as recommendation_strength
      FROM other_purchases
      WHERE customer_count >= 2
      ORDER BY customer_count DESC, purchase_count DESC
      LIMIT $2
    `, [productId, limit]);

    return result.rows;
  }

  /**
   * Get complementary products based on category relationships
   * @param {number} productId - Base product ID
   * @param {number} limit - Max recommendations
   */
  async getComplementaryProducts(productId, limit = 5) {
    // First get the product's category
    const productResult = await this.pool.query(`
      SELECT category, brand FROM products WHERE id = $1
    `, [productId]);

    if (productResult.rows.length === 0) {
      return [];
    }

    const { category, brand } = productResult.rows[0];

    // Define complementary category relationships
    const categoryComplements = {
      'Appliances': ['Accessories', 'Parts', 'Extended Warranty'],
      'Washer': ['Dryer', 'Laundry Accessories', 'Stacking Kit'],
      'Dryer': ['Washer', 'Laundry Accessories', 'Vent Kit'],
      'Refrigerator': ['Refrigerator Accessories', 'Water Filter', 'Ice Maker'],
      'Range': ['Range Hood', 'Range Accessories', 'Cookware'],
      'Dishwasher': ['Dishwasher Accessories', 'Dish Rack', 'Detergent'],
      'Air Conditioner': ['AC Accessories', 'Window Kit', 'Filter'],
      'Television': ['TV Mount', 'Sound Bar', 'HDMI Cable'],
      'Computer': ['Monitor', 'Keyboard', 'Mouse', 'Accessories']
    };

    const complements = categoryComplements[category] || [];

    // Find products in complementary categories, same brand preferred
    const result = await this.pool.query(`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.sku,
        p.base_price_cents,
        p.category,
        p.brand,
        p.image_url,
        CASE WHEN p.brand = $2 THEN 1 ELSE 0 END as same_brand,
        CASE WHEN p.category = ANY($3) THEN 2 ELSE 1 END as category_match
      FROM products p
      WHERE p.id != $1
        AND p.active = true
        AND (
          p.category = ANY($3)
          OR (p.brand = $2 AND p.category != $4)
        )
      ORDER BY
        category_match DESC,
        same_brand DESC,
        p.base_price_cents DESC
      LIMIT $5
    `, [productId, brand, complements, category, limit]);

    return result.rows.map(row => ({
      ...row,
      recommendation_type: row.category_match === 2 ? 'complementary_category' : 'same_brand'
    }));
  }

  /**
   * Get bundle suggestions based on common purchase patterns
   * @param {number} productId - Base product ID
   * @param {number} maxBundleSize - Maximum products in bundle
   */
  async getBundleSuggestions(productId, maxBundleSize = 3) {
    // Get frequently bought together products
    const fbt = await this.getFrequentlyBoughtTogether(productId, maxBundleSize - 1);

    if (fbt.length === 0) {
      return null;
    }

    // Get base product
    const baseProduct = await this.pool.query(`
      SELECT id, name, sku, base_price_cents, category, image_url
      FROM products WHERE id = $1
    `, [productId]);

    if (baseProduct.rows.length === 0) {
      return null;
    }

    const base = baseProduct.rows[0];
    const bundleProducts = [base, ...fbt];

    // Calculate bundle pricing (10% discount for bundles)
    const totalPrice = bundleProducts.reduce((sum, p) => sum + (p.base_price_cents || 0), 0);
    const bundleDiscount = Math.round(totalPrice * 0.10);
    const bundlePrice = totalPrice - bundleDiscount;

    return {
      products: bundleProducts,
      totalPrice,
      bundlePrice,
      discount: bundleDiscount,
      discountPercentage: 10,
      savingsMessage: `Save ${this.formatCurrency(bundleDiscount)} when bought together!`
    };
  }

  /**
   * Get personalized recommendations for a customer
   * Based on their purchase history and browsing patterns
   * @param {number} customerId - Customer ID
   * @param {number} limit - Max recommendations
   */
  async getPersonalizedRecommendations(customerId, limit = 10) {
    // Get customer's purchase history categories
    const historyResult = await this.pool.query(`
      SELECT DISTINCT p.category, p.brand
      FROM quotations q
      JOIN quote_items qi ON q.id = qi.quotation_id
      JOIN products p ON qi.product_id = p.id
      WHERE q.customer_id = $1
        AND q.status = 'WON'
    `, [customerId]);

    const purchasedCategories = historyResult.rows.map(r => r.category);
    const purchasedBrands = historyResult.rows.map(r => r.brand);

    // Get products the customer hasn't bought but are in their preferred categories/brands
    const result = await this.pool.query(`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.sku,
        p.base_price_cents,
        p.category,
        p.brand,
        p.image_url,
        CASE WHEN p.brand = ANY($3) THEN 2 ELSE 0 END +
        CASE WHEN p.category = ANY($2) THEN 1 ELSE 0 END as relevance_score
      FROM products p
      WHERE p.active = true
        AND p.id NOT IN (
          SELECT DISTINCT qi.product_id
          FROM quotations q
          JOIN quote_items qi ON q.id = qi.quotation_id
          WHERE q.customer_id = $1 AND q.status = 'WON'
        )
        AND (p.category = ANY($2) OR p.brand = ANY($3))
      ORDER BY relevance_score DESC, p.base_price_cents DESC
      LIMIT $4
    `, [customerId, purchasedCategories, purchasedBrands, limit]);

    return result.rows;
  }

  /**
   * Get trending products based on recent sales velocity
   * @param {number} days - Lookback period in days
   * @param {number} limit - Max products to return
   */
  async getTrendingProducts(days = 30, limit = 10) {
    const result = await this.pool.query(`
      WITH recent_sales AS (
        SELECT
          qi.product_id,
          COUNT(*) as sale_count,
          SUM(qi.quantity) as units_sold,
          SUM(qi.line_total_cents) as revenue_cents
        FROM quotations q
        JOIN quote_items qi ON q.id = qi.quotation_id
        WHERE q.status = 'WON'
          AND q.won_at > NOW() - INTERVAL '${days} days'
        GROUP BY qi.product_id
      ),
      previous_period AS (
        SELECT
          qi.product_id,
          COUNT(*) as prev_sale_count
        FROM quotations q
        JOIN quote_items qi ON q.id = qi.quotation_id
        WHERE q.status = 'WON'
          AND q.won_at > NOW() - INTERVAL '${days * 2} days'
          AND q.won_at <= NOW() - INTERVAL '${days} days'
        GROUP BY qi.product_id
      )
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.sku,
        p.base_price_cents,
        p.category,
        p.brand,
        p.image_url,
        rs.sale_count,
        rs.units_sold,
        rs.revenue_cents,
        COALESCE(pp.prev_sale_count, 0) as prev_sale_count,
        CASE
          WHEN COALESCE(pp.prev_sale_count, 0) = 0 THEN 100
          ELSE ROUND((rs.sale_count - pp.prev_sale_count)::float / pp.prev_sale_count * 100, 1)
        END as growth_percentage
      FROM recent_sales rs
      JOIN products p ON rs.product_id = p.id
      LEFT JOIN previous_period pp ON rs.product_id = pp.product_id
      WHERE p.active = true
      ORDER BY rs.sale_count DESC, growth_percentage DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
      ...row,
      trending: row.growth_percentage > 20
    }));
  }

  /**
   * Get alternative products (similar specs, different brand/price)
   * @param {number} productId - Base product ID
   * @param {number} limit - Max alternatives
   */
  async getAlternativeProducts(productId, limit = 5) {
    // Get base product details
    const baseResult = await this.pool.query(`
      SELECT category, brand, base_price_cents
      FROM products WHERE id = $1
    `, [productId]);

    if (baseResult.rows.length === 0) {
      return [];
    }

    const { category, brand, base_price_cents } = baseResult.rows[0];
    const priceRange = base_price_cents * 0.30; // 30% price variance

    const result = await this.pool.query(`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.sku,
        p.base_price_cents,
        p.category,
        p.brand,
        p.image_url,
        ABS(p.base_price_cents - $3) as price_diff,
        CASE
          WHEN p.base_price_cents < $3 THEN 'lower_price'
          WHEN p.base_price_cents > $3 THEN 'higher_price'
          ELSE 'same_price'
        END as price_comparison
      FROM products p
      WHERE p.id != $1
        AND p.category = $2
        AND p.brand != $4
        AND p.active = true
        AND p.base_price_cents BETWEEN ($3 - $5) AND ($3 + $5)
      ORDER BY price_diff ASC
      LIMIT $6
    `, [productId, category, base_price_cents, brand, priceRange, limit]);

    return result.rows;
  }

  /**
   * Get all recommendations for a product (combined)
   * @param {number} productId - Product ID
   */
  async getAllRecommendations(productId) {
    const [fbt, alsoBought, complementary, alternatives, bundle] = await Promise.all([
      this.getFrequentlyBoughtTogether(productId, 4),
      this.getCustomersAlsoBought(productId, 4),
      this.getComplementaryProducts(productId, 4),
      this.getAlternativeProducts(productId, 4),
      this.getBundleSuggestions(productId, 3)
    ]);

    return {
      frequentlyBoughtTogether: fbt,
      customersAlsoBought: alsoBought,
      complementaryProducts: complementary,
      alternatives: alternatives,
      bundleSuggestion: bundle
    };
  }

  /**
   * Format currency helper
   */
  formatCurrency(cents) {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

module.exports = ProductRecommendationService;
