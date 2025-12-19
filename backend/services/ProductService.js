/**
 * Product Service
 * Handles all product-related business logic
 */

class ProductService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Get products with search, filtering, sorting, and pagination
   * @param {object} options - Query options
   * @returns {Promise<{products: Array, pagination: object}>}
   */
  async getProducts(options = {}) {
    const {
      search = '',
      category = '',
      manufacturer = '',
      status = '',
      page = 1,
      limit = 50,
      sortBy = 'model_number',
      sortOrder = 'ASC'
    } = options;

    const cacheKey = `products:${search}:${category}:${manufacturer}:${status}:${page}:${limit}:${sortBy}:${sortOrder}`;

    return await this.cache.cacheQuery(cacheKey, 'medium', async () => {
      const offset = (page - 1) * limit;
      const validSortColumns = ['model_number', 'manufacturer', 'category', 'msrp_cents', 'cost_cents', 'created_at'];
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'model_number';
      const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

      // Build WHERE clause
      let whereConditions = [];
      let queryParams = [];
      let paramIndex = 1;

      if (search) {
        whereConditions.push(`(
          model_number ILIKE $${paramIndex} OR
          manufacturer ILIKE $${paramIndex} OR
          description ILIKE $${paramIndex} OR
          sku ILIKE $${paramIndex}
        )`);
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      if (category) {
        whereConditions.push(`category = $${paramIndex}`);
        queryParams.push(category);
        paramIndex++;
      }

      if (manufacturer) {
        whereConditions.push(`manufacturer = $${paramIndex}`);
        queryParams.push(manufacturer);
        paramIndex++;
      }

      if (status) {
        whereConditions.push(`status = $${paramIndex}`);
        queryParams.push(status);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM products ${whereClause}`;
      const countResult = await this.pool.query(countQuery, queryParams);
      const totalCount = parseInt(countResult.rows[0].count);

      // Get paginated results
      const dataQuery = `
        SELECT * FROM products
        ${whereClause}
        ORDER BY ${sortColumn} ${order}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      const result = await this.pool.query(dataQuery, [...queryParams, limit, offset]);

      return {
        products: result.rows,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalCount / limit)
        }
      };
    });
  }

  /**
   * Get product statistics overview
   * @returns {Promise<object>}
   */
  async getStatsOverview() {
    const stats = await this.pool.query(`
      SELECT
        COUNT(*) as total_products,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
        COUNT(CASE WHEN status = 'discontinued' THEN 1 END) as discontinued_count,
        COUNT(DISTINCT category) as category_count,
        COUNT(DISTINCT manufacturer) as manufacturer_count,
        COALESCE(AVG(msrp_cents), 0) as avg_msrp_cents,
        COALESCE(AVG(cost_cents), 0) as avg_cost_cents,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_this_month
      FROM products
    `);

    // Get top categories
    const topCategories = await this.pool.query(`
      SELECT category, COUNT(*) as count
      FROM products
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY count DESC
      LIMIT 10
    `);

    // Get top manufacturers
    const topManufacturers = await this.pool.query(`
      SELECT manufacturer, COUNT(*) as count
      FROM products
      WHERE manufacturer IS NOT NULL AND manufacturer != ''
      GROUP BY manufacturer
      ORDER BY count DESC
      LIMIT 10
    `);

    return {
      overview: stats.rows[0],
      topCategories: topCategories.rows,
      topManufacturers: topManufacturers.rows
    };
  }

  /**
   * Get product by ID
   * @param {number} id - Product ID
   * @returns {Promise<object|null>}
   */
  async getProductById(id) {
    const result = await this.pool.query(
      'SELECT * FROM products WHERE id = $1',
      [id]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get product by model number
   * @param {string} modelNumber - Model number
   * @returns {Promise<object|null>}
   */
  async getProductByModelNumber(modelNumber) {
    const result = await this.pool.query(
      'SELECT * FROM products WHERE model_number = $1',
      [modelNumber]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Create a new product
   * @param {object} productData - Product data
   * @returns {Promise<object>}
   */
  async createProduct(productData) {
    const {
      model_number,
      manufacturer,
      category,
      description,
      cost_cents,
      msrp_cents,
      sku,
      status = 'active',
      notes
    } = productData;

    const result = await this.pool.query(
      `INSERT INTO products (model_number, manufacturer, category, description, cost_cents, msrp_cents, sku, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [model_number, manufacturer, category, description, cost_cents, msrp_cents, sku, status, notes]
    );

    this.invalidateCache();
    return result.rows[0];
  }

  /**
   * Update an existing product
   * @param {number} id - Product ID
   * @param {object} productData - Updated product data
   * @returns {Promise<object|null>}
   */
  async updateProduct(id, productData) {
    const {
      model_number,
      manufacturer,
      category,
      description,
      cost_cents,
      msrp_cents,
      sku,
      status,
      notes
    } = productData;

    const result = await this.pool.query(
      `UPDATE products SET
        model_number = COALESCE($1, model_number),
        manufacturer = COALESCE($2, manufacturer),
        category = COALESCE($3, category),
        description = COALESCE($4, description),
        cost_cents = COALESCE($5, cost_cents),
        msrp_cents = COALESCE($6, msrp_cents),
        sku = COALESCE($7, sku),
        status = COALESCE($8, status),
        notes = COALESCE($9, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10 RETURNING *`,
      [model_number, manufacturer, category, description, cost_cents, msrp_cents, sku, status, notes, id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    this.invalidateCache();
    return result.rows[0];
  }

  /**
   * Delete a product
   * @param {number} id - Product ID
   * @returns {Promise<object|null>}
   */
  async deleteProduct(id) {
    const result = await this.pool.query(
      'DELETE FROM products WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    this.invalidateCache();
    return result.rows[0];
  }

  /**
   * Get all unique categories
   * @returns {Promise<Array<string>>}
   */
  async getCategories() {
    const result = await this.pool.query(`
      SELECT DISTINCT category
      FROM products
      WHERE category IS NOT NULL AND category != ''
      ORDER BY category
    `);

    return result.rows.map(r => r.category);
  }

  /**
   * Get all unique manufacturers
   * @returns {Promise<Array<string>>}
   */
  async getManufacturers() {
    const result = await this.pool.query(`
      SELECT DISTINCT manufacturer
      FROM products
      WHERE manufacturer IS NOT NULL AND manufacturer != ''
      ORDER BY manufacturer
    `);

    return result.rows.map(r => r.manufacturer);
  }

  /**
   * Calculate product margin
   * @param {number} costCents - Cost in cents
   * @param {number} sellCents - Sell price in cents
   * @returns {object} Margin calculations
   */
  calculateMargin(costCents, sellCents) {
    const profit_cents = sellCents - costCents;
    const margin_percent = sellCents > 0
      ? Math.round((profit_cents / sellCents) * 10000) / 100
      : 0;
    const markup_percent = costCents > 0
      ? Math.round((profit_cents / costCents) * 10000) / 100
      : 0;

    return {
      cost_cents: costCents,
      sell_cents: sellCents,
      profit_cents,
      margin_percent,
      markup_percent
    };
  }

  /**
   * Bulk import products from parsed data
   * @param {Array} products - Array of product data
   * @returns {Promise<{imported: number, skipped: number, errors: Array}>}
   */
  async bulkImport(products) {
    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const product of products) {
      try {
        // Check if product already exists
        const existing = await this.getProductByModelNumber(product.model_number);

        if (existing) {
          // Update existing product
          await this.updateProduct(existing.id, product);
          skipped++;
        } else {
          // Create new product
          await this.createProduct(product);
          imported++;
        }
      } catch (err) {
        errors.push({
          model_number: product.model_number,
          error: err.message
        });
      }
    }

    this.invalidateCache();

    return { imported, skipped, errors };
  }

  /**
   * Search products for autocomplete
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @returns {Promise<Array>}
   */
  async searchForAutocomplete(query, limit = 10) {
    const result = await this.pool.query(`
      SELECT id, model_number, manufacturer, description, msrp_cents, cost_cents
      FROM products
      WHERE status = 'active'
        AND (
          model_number ILIKE $1 OR
          manufacturer ILIKE $1 OR
          description ILIKE $1
        )
      ORDER BY
        CASE WHEN model_number ILIKE $2 THEN 0 ELSE 1 END,
        model_number
      LIMIT $3
    `, [`%${query}%`, `${query}%`, limit]);

    return result.rows;
  }

  /**
   * Get favorite products for a user
   * @param {number} userId - User ID (optional, defaults to 1)
   * @returns {Promise<Array>}
   */
  async getFavorites(userId = 1) {
    const result = await this.pool.query(`
      SELECT p.*
      FROM products p
      JOIN product_favorites pf ON p.id = pf.product_id
      WHERE pf.user_id = $1
      ORDER BY pf.created_at DESC
    `, [userId]);

    return result.rows;
  }

  /**
   * Add product to favorites
   * @param {number} productId - Product ID
   * @param {number} userId - User ID
   * @returns {Promise<boolean>}
   */
  async addToFavorites(productId, userId = 1) {
    try {
      await this.pool.query(
        `INSERT INTO product_favorites (product_id, user_id) VALUES ($1, $2)
         ON CONFLICT (product_id, user_id) DO NOTHING`,
        [productId, userId]
      );
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Remove product from favorites
   * @param {number} productId - Product ID
   * @param {number} userId - User ID
   * @returns {Promise<boolean>}
   */
  async removeFromFavorites(productId, userId = 1) {
    const result = await this.pool.query(
      'DELETE FROM product_favorites WHERE product_id = $1 AND user_id = $2 RETURNING *',
      [productId, userId]
    );
    return result.rows.length > 0;
  }

  /**
   * Invalidate product cache
   */
  invalidateCache() {
    if (this.cache && this.cache.invalidatePattern) {
      this.cache.invalidatePattern('products:');
    }
  }
}

module.exports = ProductService;
