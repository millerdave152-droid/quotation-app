/**
 * Product Service
 * Handles all product-related business logic
 *
 * Supports dual-mode category filtering:
 * - Legacy: Filter by raw category text (p.category)
 * - New: Filter by normalized category_id (p.category_id)
 */

const { ApiError } = require('../middleware/errorHandler');

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
      category = '',           // Legacy: raw category text
      categoryId = '',         // New: normalized category ID
      subcategoryId = '',      // New: subcategory ID
      categorySlug = '',       // New: category slug (e.g., 'refrigerators')
      manufacturer = '',
      status = '',
      tags = '',               // Comma-separated tag IDs
      minPrice = '',           // Min price in dollars
      maxPrice = '',           // Max price in dollars
      priceField = 'cost',     // 'cost' or 'msrp'
      recent = '',             // 'true' for last 7 days
      favorites = '',          // 'true' for favorites only
      includeSubcategories = 'true', // Include subcategories when filtering by categoryId
      userId = 1,
      page = 1,
      limit = 50,
      sortBy = 'model',
      sortOrder = 'ASC'
    } = options;

    const cacheKey = `products:${search}:${category}:${categoryId}:${subcategoryId}:${categorySlug}:${manufacturer}:${status}:${tags}:${minPrice}:${maxPrice}:${priceField}:${recent}:${favorites}:${page}:${limit}:${sortBy}:${sortOrder}`;

    return await this.cache.cacheQuery(cacheKey, 'medium', async () => {
      const offset = (page - 1) * limit;
      const validSortColumns = ['model', 'manufacturer', 'category', 'msrp_cents', 'cost_cents', 'created_at', 'updated_at', 'name'];
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'model';
      const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

      // Build WHERE clause
      let whereConditions = [];
      let queryParams = [];
      let paramIndex = 1;
      let joinClauses = [];

      if (search) {
        whereConditions.push(`(
          p.model ILIKE $${paramIndex} OR
          p.manufacturer ILIKE $${paramIndex} OR
          p.name ILIKE $${paramIndex} OR
          p.description ILIKE $${paramIndex}
        )`);
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      // DUAL-MODE CATEGORY FILTERING
      // Priority: subcategoryId > categoryId > categorySlug > category (legacy)
      if (subcategoryId) {
        // Filter by specific subcategory
        whereConditions.push(`p.subcategory_id = $${paramIndex}`);
        queryParams.push(parseInt(subcategoryId));
        paramIndex++;
      } else if (categoryId) {
        // Filter by category (optionally including subcategories)
        if (includeSubcategories === 'true') {
          // Include products in this category OR any subcategory of it
          whereConditions.push(`(p.category_id = $${paramIndex} OR p.subcategory_id IN (
            SELECT id FROM categories WHERE parent_id = $${paramIndex}
          ))`);
        } else {
          whereConditions.push(`p.category_id = $${paramIndex}`);
        }
        queryParams.push(parseInt(categoryId));
        paramIndex++;
      } else if (categorySlug) {
        // Filter by category slug - lookup category ID first
        whereConditions.push(`(p.category_id IN (
          SELECT id FROM categories WHERE slug = $${paramIndex}
        ) OR p.subcategory_id IN (
          SELECT c.id FROM categories c
          JOIN categories parent ON c.parent_id = parent.id
          WHERE parent.slug = $${paramIndex}
        ))`);
        queryParams.push(categorySlug);
        paramIndex++;
      } else if (category) {
        // Legacy: filter by raw category text
        whereConditions.push(`p.category = $${paramIndex}`);
        queryParams.push(category);
        paramIndex++;
      }

      if (manufacturer) {
        whereConditions.push(`p.manufacturer = $${paramIndex}`);
        queryParams.push(manufacturer);
        paramIndex++;
      }

      if (status) {
        if (status === 'active') {
          whereConditions.push(`p.active = true`);
        } else if (status === 'discontinued') {
          whereConditions.push(`p.discontinued = true`);
        } else if (status === 'inactive') {
          whereConditions.push(`p.active = false`);
        }
      }

      // Tag filter - filter by tag IDs
      if (tags) {
        const tagIds = tags.split(',').map(t => parseInt(t.trim())).filter(t => !isNaN(t));
        if (tagIds.length > 0) {
          joinClauses.push(`INNER JOIN product_tag_mappings ptm ON p.id = ptm.product_id`);
          whereConditions.push(`ptm.tag_id = ANY($${paramIndex}::int[])`);
          queryParams.push(tagIds);
          paramIndex++;
        }
      }

      // Price range filter
      const priceColumn = priceField === 'msrp' ? 'msrp_cents' : 'cost_cents';
      if (minPrice) {
        const minCents = parseFloat(minPrice) * 100;
        whereConditions.push(`p.${priceColumn} >= $${paramIndex}`);
        queryParams.push(minCents);
        paramIndex++;
      }
      if (maxPrice) {
        const maxCents = parseFloat(maxPrice) * 100;
        whereConditions.push(`p.${priceColumn} <= $${paramIndex}`);
        queryParams.push(maxCents);
        paramIndex++;
      }

      // Recent filter - products added/updated in last 7 days
      if (recent === 'true') {
        whereConditions.push(`(p.created_at >= NOW() - INTERVAL '7 days' OR p.updated_at >= NOW() - INTERVAL '7 days')`);
      }

      // Favorites filter
      if (favorites === 'true') {
        joinClauses.push(`INNER JOIN product_favorites pf ON p.id = pf.product_id AND pf.user_id = $${paramIndex}`);
        queryParams.push(userId);
        paramIndex++;
      }

      const joinClause = joinClauses.join(' ');
      const whereClause = whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      // Get total count
      const countQuery = `SELECT COUNT(DISTINCT p.id) FROM products p ${joinClause} ${whereClause}`;
      const countResult = await this.pool.query(countQuery, queryParams);
      const totalCount = parseInt(countResult.rows[0].count);

      // Get paginated results with category info
      const dataQuery = `
        SELECT DISTINCT
          p.*,
          cat.name as category_name,
          cat.slug as category_slug,
          cat.display_name as category_display_name,
          subcat.name as subcategory_name,
          subcat.slug as subcategory_slug
        FROM products p
        LEFT JOIN categories cat ON p.category_id = cat.id
        LEFT JOIN categories subcat ON p.subcategory_id = subcat.id
        ${joinClause}
        ${whereClause}
        ORDER BY p.${sortColumn} ${order}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      const result = await this.pool.query(dataQuery, [...queryParams, limit, offset]);

      // Transform results to include category_info object
      const products = result.rows.map(row => {
        const { category_name, category_slug, category_display_name, subcategory_name, subcategory_slug, ...product } = row;
        return {
          ...product,
          category_info: row.category_id ? {
            id: row.category_id,
            name: category_name,
            slug: category_slug,
            display_name: category_display_name
          } : null,
          subcategory_info: row.subcategory_id ? {
            id: row.subcategory_id,
            name: subcategory_name,
            slug: subcategory_slug
          } : null
        };
      });

      return {
        products,
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
        COUNT(CASE WHEN active = true THEN 1 END) as active_count,
        COUNT(CASE WHEN discontinued = true THEN 1 END) as discontinued_count,
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
      'SELECT * FROM products WHERE model = $1',
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
      model,
      manufacturer,
      category,
      name,
      description,
      cost_cents,
      msrp_cents,
      active = true
    } = productData;

    const result = await this.pool.query(
      `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [model, manufacturer, category, name || description, description, cost_cents, msrp_cents, active]
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
      model,
      manufacturer,
      category,
      name,
      description,
      cost_cents,
      msrp_cents,
      active
    } = productData;

    const result = await this.pool.query(
      `UPDATE products SET
        model = COALESCE($1, model),
        manufacturer = COALESCE($2, manufacturer),
        category = COALESCE($3, category),
        name = COALESCE($4, name),
        description = COALESCE($5, description),
        cost_cents = COALESCE($6, cost_cents),
        msrp_cents = COALESCE($7, msrp_cents),
        active = COALESCE($8, active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9 RETURNING *`,
      [model, manufacturer, category, name, description, cost_cents, msrp_cents, active, id]
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
   * Get all unique categories (legacy - returns raw category strings)
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
   * Get normalized category hierarchy with product counts
   * @returns {Promise<Array>} Hierarchical category tree
   */
  async getCategoryHierarchy() {
    const cacheKey = 'category:hierarchy';

    return await this.cache.cacheQuery(cacheKey, 'long', async () => {
      // Get all categories with product counts
      // Fixed: Count products by both category_id AND subcategory_id
      const result = await this.pool.query(`
        SELECT
          c.id,
          c.parent_id,
          c.name,
          c.slug,
          c.display_name,
          c.level,
          c.display_order,
          c.icon,
          c.color,
          c.is_active,
          COALESCE(pc.product_count, 0) as product_count,
          COALESCE(pc.subcategory_count, 0) as subcategory_product_count
        FROM categories c
        LEFT JOIN (
          -- Count products by category_id (main categories)
          SELECT
            category_id as cat_id,
            COUNT(*) as product_count,
            0 as subcategory_count
          FROM products
          WHERE category_id IS NOT NULL
          GROUP BY category_id
          UNION ALL
          -- Count products by subcategory_id (for subcategory rows)
          SELECT
            subcategory_id as cat_id,
            COUNT(*) as product_count,
            0 as subcategory_count
          FROM products
          WHERE subcategory_id IS NOT NULL
          GROUP BY subcategory_id
          UNION ALL
          -- Sum subcategory products to parent category
          SELECT
            c2.parent_id as cat_id,
            0 as product_count,
            COUNT(*) as subcategory_count
          FROM products p
          JOIN categories c2 ON p.subcategory_id = c2.id
          WHERE p.subcategory_id IS NOT NULL
          GROUP BY c2.parent_id
        ) pc ON c.id = pc.cat_id
        WHERE c.is_active = true
        ORDER BY c.level, c.display_order, c.name
      `);

      // Build tree structure
      const categories = result.rows;
      const lookup = {};
      const tree = [];

      // First pass: create lookup and aggregate counts
      for (const cat of categories) {
        if (!lookup[cat.id]) {
          lookup[cat.id] = {
            ...cat,
            product_count: parseInt(cat.product_count) || 0,
            total_products: parseInt(cat.product_count) + parseInt(cat.subcategory_product_count) || 0,
            children: []
          };
        } else {
          // Aggregate counts for duplicate entries (from UNION)
          lookup[cat.id].product_count += parseInt(cat.product_count) || 0;
          lookup[cat.id].total_products += parseInt(cat.subcategory_product_count) || 0;
        }
      }

      // Second pass: build parent-child relationships
      for (const id of Object.keys(lookup)) {
        const cat = lookup[id];
        if (cat.parent_id && lookup[cat.parent_id]) {
          lookup[cat.parent_id].children.push(cat);
        } else if (!cat.parent_id || cat.level === 1) {
          tree.push(cat);
        }
      }

      // Sort children by display_order
      const sortChildren = (node) => {
        if (node.children && node.children.length > 0) {
          node.children.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
          node.children.forEach(sortChildren);
        }
      };
      tree.forEach(sortChildren);

      // Calculate total products for parent categories (including children)
      const calculateTotals = (node) => {
        let total = node.product_count || 0;
        if (node.children) {
          for (const child of node.children) {
            total += calculateTotals(child);
          }
        }
        node.total_products = total;
        return total;
      };
      tree.forEach(calculateTotals);

      return tree;
    });
  }

  /**
   * Get flat list of level-2 categories (main categories like Refrigerators, Washers)
   * @returns {Promise<Array>}
   */
  async getMainCategories() {
    const result = await this.pool.query(`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.display_name,
        c.icon,
        c.color,
        c.display_order,
        parent.name as parent_name,
        parent.slug as parent_slug,
        COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN categories parent ON c.parent_id = parent.id
      LEFT JOIN products p ON p.category_id = c.id
      WHERE c.level = 2 AND c.is_active = true
      GROUP BY c.id, parent.name, parent.slug
      ORDER BY c.display_order, c.name
    `);

    return result.rows.map(row => ({
      ...row,
      product_count: parseInt(row.product_count) || 0
    }));
  }

  /**
   * Get subcategories for a given category
   * @param {number} categoryId - Parent category ID
   * @returns {Promise<Array>}
   */
  async getSubcategories(categoryId) {
    const result = await this.pool.query(`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.display_name,
        c.display_order,
        COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON p.subcategory_id = c.id
      WHERE c.parent_id = $1 AND c.level = 3 AND c.is_active = true
      GROUP BY c.id
      ORDER BY c.display_order, c.name
    `, [categoryId]);

    return result.rows.map(row => ({
      ...row,
      product_count: parseInt(row.product_count) || 0
    }));
  }

  /**
   * Get category by slug with parent and children
   * @param {string} slug - Category slug
   * @returns {Promise<object|null>}
   */
  async getCategoryBySlug(slug) {
    const result = await this.pool.query(`
      SELECT
        c.*,
        parent.name as parent_name,
        parent.slug as parent_slug,
        COUNT(DISTINCT p.id) as product_count
      FROM categories c
      LEFT JOIN categories parent ON c.parent_id = parent.id
      LEFT JOIN products p ON (p.category_id = c.id OR p.subcategory_id = c.id)
      WHERE c.slug = $1 AND c.is_active = true
      GROUP BY c.id, parent.name, parent.slug
    `, [slug]);

    if (result.rows.length === 0) return null;

    const category = {
      ...result.rows[0],
      product_count: parseInt(result.rows[0].product_count) || 0
    };

    // Get children if this is a level-2 category
    if (category.level === 2) {
      category.subcategories = await this.getSubcategories(category.id);
    }

    return category;
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
        const existing = await this.getProductByModelNumber(product.model || product.model_number);

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
          model: product.model || product.model_number,
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
      SELECT id, model, manufacturer, name, description, msrp_cents, cost_cents
      FROM products
      WHERE (active = true OR active IS NULL)
        AND (
          model ILIKE $1 OR
          manufacturer ILIKE $1 OR
          name ILIKE $1 OR
          description ILIKE $1
        )
      ORDER BY
        CASE WHEN model ILIKE $2 THEN 0 ELSE 1 END,
        model
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
