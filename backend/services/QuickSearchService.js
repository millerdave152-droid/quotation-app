/**
 * Quick Search Service
 *
 * Provides intelligent product search with:
 * - Full-text search with weighted ranking
 * - Role-based pricing visibility
 * - Filter counts for UI
 * - Sellability scoring
 * - Quick filter presets
 */

class QuickSearchService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Universal search with weighted ranking
   * Uses full-text search with ILIKE fallback
   */
  async universalSearch(query, filters = {}, userRole = 'user', options = {}) {
    const {
      page = 1,
      limit = 24,
      sortBy = 'relevance',
      sortOrder = 'DESC'
    } = options;

    const offset = (page - 1) * limit;
    const whereConditions = [];
    const queryParams = [];
    let paramIndex = 1;
    let selectExtra = '';
    let orderClause = '';

    // Full-text search with relevance ranking
    if (query && query.trim()) {
      const searchQuery = query.trim();

      // Use ts_rank for relevance scoring with full-text search
      selectExtra = `,
        ts_rank(p.search_vector, plainto_tsquery('english', $${paramIndex})) as search_rank
      `;

      // Combine full-text and ILIKE for better coverage
      whereConditions.push(`(
        p.search_vector @@ plainto_tsquery('english', $${paramIndex})
        OR p.model ILIKE $${paramIndex + 1}
        OR p.name ILIKE $${paramIndex + 1}
        OR p.manufacturer ILIKE $${paramIndex + 1}
      )`);

      queryParams.push(searchQuery, `%${searchQuery}%`);
      paramIndex += 2;
    }

    // Product status filter (normal, clearance, discontinued, end_of_line)
    if (filters.productStatus && filters.productStatus.length > 0) {
      const statuses = Array.isArray(filters.productStatus)
        ? filters.productStatus
        : [filters.productStatus];
      whereConditions.push(`p.product_status = ANY($${paramIndex}::varchar[])`);
      queryParams.push(statuses);
      paramIndex++;
    } else {
      // By default, exclude discontinued unless explicitly requested
      whereConditions.push(`p.product_status != 'discontinued'`);
    }

    // Brand/Manufacturer filter (case-insensitive)
    if (filters.brands && filters.brands.length > 0) {
      const brands = Array.isArray(filters.brands) ? filters.brands : [filters.brands];
      whereConditions.push(`UPPER(p.manufacturer) = ANY($${paramIndex}::varchar[])`);
      queryParams.push(brands.map(b => b.toUpperCase()));
      paramIndex++;
    }

    // Category filter (with legacy text fallback for products without category_id)
    if (filters.categoryId) {
      whereConditions.push(`(
        p.category_id = $${paramIndex}
        OR p.subcategory_id IN (SELECT id FROM categories WHERE parent_id = $${paramIndex})
        OR (p.category_id IS NULL AND LOWER(p.category) LIKE '%' || LOWER((
          SELECT name FROM categories WHERE id = $${paramIndex}
        )) || '%')
      )`);
      queryParams.push(parseInt(filters.categoryId));
      paramIndex++;
    }

    // Price range filter (using sell price / msrp)
    if (filters.minPrice) {
      const minCents = parseFloat(filters.minPrice) * 100;
      whereConditions.push(`p.msrp_cents >= $${paramIndex}`);
      queryParams.push(minCents);
      paramIndex++;
    }
    if (filters.maxPrice) {
      const maxCents = parseFloat(filters.maxPrice) * 100;
      whereConditions.push(`p.msrp_cents <= $${paramIndex}`);
      queryParams.push(maxCents);
      paramIndex++;
    }

    // Stock status filter
    if (filters.stockStatus) {
      switch (filters.stockStatus) {
        case 'in_stock':
          whereConditions.push(`p.stock_quantity > 5`);
          break;
        case 'low_stock':
          whereConditions.push(`p.stock_quantity > 0 AND p.stock_quantity <= 5`);
          break;
        case 'overstock':
          whereConditions.push(`p.stock_quantity > COALESCE(p.reorder_point, 20) * 2`);
          break;
        case 'out_of_stock':
          whereConditions.push(`(p.stock_quantity IS NULL OR p.stock_quantity <= 0)`);
          break;
        case 'last_pieces':
          whereConditions.push(`p.stock_quantity > 0 AND p.stock_quantity <= 2`);
          break;
      }
    }

    // Color/Finish filter (case-insensitive)
    if (filters.colors && filters.colors.length > 0) {
      const colors = Array.isArray(filters.colors) ? filters.colors : [filters.colors];
      whereConditions.push(`UPPER(p.color) = ANY($${paramIndex}::varchar[])`);
      queryParams.push(colors.map(c => c.toUpperCase()));
      paramIndex++;
    }

    // Energy Star filter (search in name/description since no dedicated column)
    if (filters.energyStar === true || filters.energyStar === 'true') {
      whereConditions.push(`(
        p.name ILIKE '%energy star%'
        OR p.description ILIKE '%energy star%'
      )`);
    }

    // Smart/WiFi filter (search in name/description)
    if (filters.smartEnabled === true || filters.smartEnabled === 'true') {
      whereConditions.push(`(
        p.name ILIKE '%smart%'
        OR p.name ILIKE '%wifi%'
        OR p.description ILIKE '%smart%'
        OR p.description ILIKE '%wifi%'
      )`);
    }

    // Capacity filter - skip for now as no specifications column exists
    // TODO: Add specifications JSONB column to products table for capacity filtering

    // On sale / has promotion filter
    if (filters.onSale === true || filters.onSale === 'true') {
      whereConditions.push(`(
        p.clearance_price_cents IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM manufacturer_promotions mp
          WHERE mp.manufacturer = p.manufacturer
          AND mp.is_active = true
          AND mp.start_date <= CURRENT_DATE
          AND mp.end_date >= CURRENT_DATE
        )
      )`);
    }

    // Build WHERE clause
    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Determine sort order
    switch (sortBy) {
      case 'relevance':
        if (query && query.trim()) {
          orderClause = `ORDER BY search_rank DESC`;
        } else {
          orderClause = `ORDER BY p.updated_at DESC`;
        }
        break;
      case 'price_low':
        orderClause = `ORDER BY COALESCE(p.clearance_price_cents, p.msrp_cents) ASC`;
        break;
      case 'price_high':
        orderClause = `ORDER BY COALESCE(p.clearance_price_cents, p.msrp_cents) DESC`;
        break;
      case 'discount':
        orderClause = `ORDER BY
          CASE WHEN p.clearance_price_cents IS NOT NULL AND p.msrp_cents > 0
          THEN (p.msrp_cents - p.clearance_price_cents)::float / p.msrp_cents
          ELSE 0 END DESC`;
        break;
      case 'stock':
        orderClause = `ORDER BY COALESCE(p.stock_quantity, 0) DESC`;
        break;
      case 'sellability':
        // Composite score: margin + stock + recent sales
        orderClause = `ORDER BY (
          CASE WHEN p.msrp_cents > 0 AND p.cost_cents > 0
          THEN (p.msrp_cents - p.cost_cents)::float / p.msrp_cents * 30
          ELSE 0 END +
          CASE WHEN p.stock_quantity > 10 THEN 25
               WHEN p.stock_quantity > 5 THEN 20
               WHEN p.stock_quantity > 0 THEN 10
               ELSE 0 END +
          CASE WHEN p.product_status = 'clearance' THEN 20 ELSE 0 END +
          CASE WHEN p.clearance_price_cents IS NOT NULL THEN 15 ELSE 0 END
        ) DESC`;
        break;
      case 'newest':
        orderClause = `ORDER BY p.created_at DESC`;
        break;
      case 'margin':
        // Only for admin/manager
        if (userRole === 'admin' || userRole === 'manager') {
          orderClause = `ORDER BY
            CASE WHEN p.msrp_cents > 0 AND p.cost_cents > 0
            THEN (p.msrp_cents - p.cost_cents)::float / p.msrp_cents
            ELSE 0 END DESC`;
        } else {
          orderClause = `ORDER BY p.msrp_cents DESC`;
        }
        break;
      default:
        orderClause = `ORDER BY p.${sortOrder === 'ASC' ? 'model ASC' : 'model DESC'}`;
    }

    // Count query
    const countQuery = `SELECT COUNT(*) FROM products p ${whereClause}`;
    const countResult = await this.pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Main query with pagination
    const dataQuery = `
      SELECT
        p.id,
        p.model,
        p.name,
        p.manufacturer,
        p.category,
        p.category_id,
        p.subcategory_id,
        p.description,
        p.msrp_cents,
        p.cost_cents,
        p.stock_quantity,
        p.product_status,
        p.clearance_price_cents,
        p.clearance_start_date,
        p.clearance_reason,
        p.floor_price_cents,
        p.floor_price_expiry,
        p.color,
        p.image_url,
        p.reorder_point,
        p.created_at,
        p.updated_at,
        cat.name as category_name,
        cat.slug as category_slug,
        subcat.name as subcategory_name
        ${selectExtra}
      FROM products p
      LEFT JOIN categories cat ON p.category_id = cat.id
      LEFT JOIN categories subcat ON p.subcategory_id = subcat.id
      ${whereClause}
      ${orderClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await this.pool.query(dataQuery, [...queryParams, limit, offset]);

    // Apply role-based pricing visibility
    const products = result.rows.map(row => this.applyRolePricing(row, userRole));

    return {
      products,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: offset + products.length < totalCount
      },
      appliedFilters: filters
    };
  }

  /**
   * Apply role-based pricing visibility
   */
  applyRolePricing(product, userRole) {
    const result = { ...product };

    // Calculate sell price (clearance if available, else MSRP)
    const sellPriceCents = product.clearance_price_cents || product.msrp_cents;
    result.sell_price_cents = sellPriceCents;

    // Calculate discount if on clearance
    if (product.clearance_price_cents && product.msrp_cents > 0) {
      result.discount_percent = Math.round(
        ((product.msrp_cents - product.clearance_price_cents) / product.msrp_cents) * 100
      );
    }

    // Add badges based on status
    result.badges = this.calculateBadges(product);

    // Role-based visibility
    switch (userRole) {
      case 'admin':
        // Admin sees everything
        result.pricing = {
          msrp: product.msrp_cents,
          cost: product.cost_cents,
          clearance: product.clearance_price_cents,
          floor: product.floor_price_cents,
          margin: product.msrp_cents && product.cost_cents
            ? Math.round(((product.msrp_cents - product.cost_cents) / product.msrp_cents) * 100)
            : null,
          canEditFloorPrice: true,
          canEditStatus: true
        };
        break;

      case 'manager':
        // Manager sees cost, margin, and floor price range
        result.pricing = {
          msrp: product.msrp_cents,
          cost: product.cost_cents,
          clearance: product.clearance_price_cents,
          floor: product.floor_price_cents,
          margin: product.msrp_cents && product.cost_cents
            ? Math.round(((product.msrp_cents - product.cost_cents) / product.msrp_cents) * 100)
            : null,
          canEditFloorPrice: false,
          canEditStatus: true
        };
        break;

      case 'sales':
        // Sales sees sell price and discount guidance
        result.pricing = {
          msrp: product.msrp_cents,
          clearance: product.clearance_price_cents,
          sellPrice: sellPriceCents
        };
        // Remove sensitive fields
        delete result.cost_cents;
        delete result.floor_price_cents;
        // Add discount guidance
        result.discountGuidance = this.calculateDiscountGuidance(product);
        break;

      default:
        // Regular users see only retail prices
        result.pricing = {
          msrp: product.msrp_cents,
          clearance: product.clearance_price_cents,
          sellPrice: sellPriceCents
        };
        delete result.cost_cents;
        delete result.floor_price_cents;
        delete result.floor_price_expiry;
        break;
    }

    return result;
  }

  /**
   * Calculate discount guidance for sales staff
   */
  calculateDiscountGuidance(product) {
    const guidance = {
      canNegotiate: false,
      maxDiscountPercent: 0,
      reasons: []
    };

    // Clearance items have more flexibility
    if (product.product_status === 'clearance') {
      guidance.canNegotiate = true;
      guidance.maxDiscountPercent = 20;
      guidance.reasons.push('Clearance item - push to move');
    }

    // End of line items
    if (product.product_status === 'end_of_line') {
      guidance.canNegotiate = true;
      guidance.maxDiscountPercent = 15;
      guidance.reasons.push('End of line - limited availability');
    }

    // Overstock
    if (product.stock_quantity > (product.reorder_point || 20) * 2) {
      guidance.canNegotiate = true;
      guidance.maxDiscountPercent = Math.max(guidance.maxDiscountPercent, 10);
      guidance.reasons.push('Overstock - volume discount available');
    }

    // High margin items (based on floor price if set)
    if (product.floor_price_cents && product.msrp_cents) {
      const floorMargin = ((product.msrp_cents - product.floor_price_cents) / product.msrp_cents) * 100;
      if (floorMargin > 10) {
        guidance.canNegotiate = true;
        guidance.maxDiscountPercent = Math.max(guidance.maxDiscountPercent, Math.floor(floorMargin * 0.7));
        guidance.reasons.push('Room for negotiation');
      }
    }

    // Default small discount for normal items
    if (product.product_status === 'normal' && !guidance.canNegotiate) {
      guidance.canNegotiate = true;
      guidance.maxDiscountPercent = 5;
      guidance.reasons.push('Standard item - limited flexibility');
    }

    return guidance;
  }

  /**
   * Calculate product badges
   */
  calculateBadges(product) {
    const badges = [];

    // Status badges
    if (product.product_status === 'clearance') {
      badges.push({ type: 'clearance', label: 'CLEARANCE', color: 'red' });
    }
    if (product.product_status === 'end_of_line') {
      badges.push({ type: 'end_of_line', label: 'END OF LINE', color: 'orange' });
    }

    // Discount badge
    if (product.clearance_price_cents && product.msrp_cents > 0) {
      const discountPercent = Math.round(
        ((product.msrp_cents - product.clearance_price_cents) / product.msrp_cents) * 100
      );
      if (discountPercent >= 10) {
        badges.push({ type: 'discount', label: `${discountPercent}% OFF`, color: 'purple' });
      }
    }

    // Stock badges
    if (product.stock_quantity === null || product.stock_quantity <= 0) {
      badges.push({ type: 'out_of_stock', label: 'OUT OF STOCK', color: 'gray' });
    } else if (product.stock_quantity <= 2) {
      badges.push({ type: 'last_pieces', label: 'LAST PIECES', color: 'amber' });
    } else if (product.stock_quantity <= 5) {
      badges.push({ type: 'low_stock', label: 'LOW STOCK', color: 'orange' });
    } else if (product.stock_quantity > (product.reorder_point || 20) * 2) {
      badges.push({ type: 'overstock', label: 'OVERSTOCK', color: 'blue' });
    }

    // New arrival (within last 30 days)
    if (product.created_at) {
      const createdDate = new Date(product.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (createdDate > thirtyDaysAgo) {
        badges.push({ type: 'new', label: 'NEW', color: 'green' });
      }
    }

    return badges;
  }

  /**
   * Get filter counts based on current filters
   */
  async getFilterCounts(baseFilters = {}) {
    // Build base WHERE clause excluding the specific filter we're counting
    const buildWhereClause = (excludeFilter) => {
      const conditions = [];
      const params = [];
      let idx = 1;

      // Always exclude discontinued by default
      if (!baseFilters.productStatus || !baseFilters.productStatus.includes('discontinued')) {
        conditions.push(`product_status != 'discontinued'`);
      }

      if (excludeFilter !== 'brands' && baseFilters.brands?.length) {
        conditions.push(`UPPER(manufacturer) = ANY($${idx}::varchar[])`);
        params.push(baseFilters.brands.map(b => b.toUpperCase()));
        idx++;
      }

      if (excludeFilter !== 'categoryId' && baseFilters.categoryId) {
        conditions.push(`(category_id = $${idx} OR subcategory_id IN (SELECT id FROM categories WHERE parent_id = $${idx}) OR (category_id IS NULL AND LOWER(category) LIKE '%' || LOWER((SELECT name FROM categories WHERE id = $${idx})) || '%'))`);
        params.push(parseInt(baseFilters.categoryId));
        idx++;
      }

      if (excludeFilter !== 'productStatus' && baseFilters.productStatus?.length) {
        conditions.push(`product_status = ANY($${idx}::varchar[])`);
        params.push(baseFilters.productStatus);
        idx++;
      }

      return {
        where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
        params
      };
    };

    // Get brand counts (case-normalized)
    const brandQuery = buildWhereClause('brands');
    const brandResult = await this.pool.query(`
      SELECT UPPER(manufacturer) as value, COUNT(*) as count
      FROM products
      ${brandQuery.where}
      GROUP BY UPPER(manufacturer)
      HAVING UPPER(manufacturer) IS NOT NULL
      ORDER BY count DESC
      LIMIT 20
    `, brandQuery.params);

    // Get status counts
    const statusQuery = buildWhereClause('productStatus');
    const statusResult = await this.pool.query(`
      SELECT product_status as value, COUNT(*) as count
      FROM products
      ${statusQuery.where ? statusQuery.where.replace("product_status != 'discontinued'", '1=1') : ''}
      GROUP BY product_status
    `, statusQuery.params);

    // Get category counts (level 2 categories with legacy text fallback)
    // Note: We don't apply baseFilters here since category dropdown should show all categories
    const categoryResult = await this.pool.query(`
      SELECT c.id as value, c.name as label, COUNT(DISTINCT p.id) as count
      FROM categories c
      LEFT JOIN products p ON (
        (p.category_id = c.id
         OR EXISTS (SELECT 1 FROM categories sub WHERE sub.parent_id = c.id AND p.subcategory_id = sub.id)
         OR (p.category_id IS NULL AND LOWER(p.category) LIKE '%' || LOWER(c.name) || '%')
        )
        AND p.product_status != 'discontinued'
      )
      WHERE c.level = 2 AND c.is_active = true
      GROUP BY c.id, c.name
      HAVING COUNT(DISTINCT p.id) > 0
      ORDER BY count DESC
    `);

    // Get color counts (normalized, from existing products)
    const colorResult = await this.pool.query(`
      SELECT INITCAP(LOWER(TRIM(color))) as value, COUNT(*) as count
      FROM products
      WHERE color IS NOT NULL AND color != '' AND product_status != 'discontinued'
      GROUP BY INITCAP(LOWER(TRIM(color)))
      ORDER BY count DESC
      LIMIT 10
    `);

    // Get price range
    const priceResult = await this.pool.query(`
      SELECT
        MIN(COALESCE(clearance_price_cents, msrp_cents)) as min_price,
        MAX(COALESCE(clearance_price_cents, msrp_cents)) as max_price
      FROM products
      WHERE product_status != 'discontinued'
        AND (msrp_cents IS NOT NULL OR clearance_price_cents IS NOT NULL)
    `);

    return {
      brands: brandResult.rows,
      statuses: statusResult.rows,
      categories: categoryResult.rows,
      colors: colorResult.rows,
      priceRange: {
        min: priceResult.rows[0]?.min_price ? priceResult.rows[0].min_price / 100 : 0,
        max: priceResult.rows[0]?.max_price ? priceResult.rows[0].max_price / 100 : 10000
      }
    };
  }

  /**
   * Get quick filter presets
   */
  async getFilterPresets() {
    return [
      {
        id: 'best_deals',
        label: 'Best Deals',
        icon: 'tag',
        description: 'Clearance and discounted items',
        filters: {
          productStatus: ['clearance', 'end_of_line'],
          sortBy: 'discount'
        }
      },
      {
        id: 'budget_picks',
        label: 'Budget Picks',
        icon: 'dollar',
        description: 'Items under $1000',
        filters: {
          maxPrice: 1000,
          sortBy: 'price_low'
        }
      },
      {
        id: 'new_arrivals',
        label: 'New Arrivals',
        icon: 'sparkles',
        description: 'Recently added products',
        filters: {
          sortBy: 'newest'
        }
      },
      {
        id: 'aging_stock',
        label: 'Aging Stock',
        icon: 'clock',
        description: 'Overstock items to move',
        filters: {
          stockStatus: 'overstock',
          sortBy: 'sellability'
        }
      },
      {
        id: 'fast_movers',
        label: 'Fast Movers',
        icon: 'trending',
        description: 'Best sellers with good margins',
        filters: {
          stockStatus: 'in_stock',
          sortBy: 'sellability'
        }
      },
      {
        id: 'energy_efficient',
        label: 'Energy Efficient',
        icon: 'leaf',
        description: 'Energy Star certified products',
        filters: {
          energyStar: true
        }
      },
      {
        id: 'smart_appliances',
        label: 'Smart Appliances',
        icon: 'wifi',
        description: 'WiFi-enabled smart products',
        filters: {
          smartEnabled: true
        }
      }
    ];
  }

  /**
   * Update product status (Manager+ only)
   */
  async updateProductStatus(productId, status, reason, userId) {
    const validStatuses = ['normal', 'clearance', 'discontinued', 'end_of_line'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Get current product
    const currentResult = await this.pool.query(
      'SELECT product_status FROM products WHERE id = $1',
      [productId]
    );

    if (currentResult.rows.length === 0) {
      throw new Error('Product not found');
    }

    const currentStatus = currentResult.rows[0].product_status;

    // Update the product
    const updateResult = await this.pool.query(`
      UPDATE products
      SET
        product_status = $1,
        previous_status = $2,
        status_changed_at = CURRENT_TIMESTAMP,
        clearance_reason = CASE WHEN $1 = 'clearance' THEN $3 ELSE clearance_reason END,
        clearance_start_date = CASE WHEN $1 = 'clearance' AND clearance_start_date IS NULL THEN CURRENT_DATE ELSE clearance_start_date END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `, [status, currentStatus, reason, productId]);

    return updateResult.rows[0];
  }

  /**
   * Set floor price (Admin only)
   */
  async setFloorPrice(productId, floorPriceCents, expiryDate, userId) {
    const result = await this.pool.query(`
      UPDATE products
      SET
        floor_price_cents = $1,
        floor_price_expiry = $2,
        floor_price_set_by = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `, [floorPriceCents, expiryDate, userId, productId]);

    if (result.rows.length === 0) {
      throw new Error('Product not found');
    }

    return result.rows[0];
  }

  /**
   * Set clearance price
   */
  async setClearancePrice(productId, clearancePriceCents, reason, userId) {
    const result = await this.pool.query(`
      UPDATE products
      SET
        product_status = 'clearance',
        clearance_price_cents = $1,
        clearance_reason = $2,
        clearance_start_date = COALESCE(clearance_start_date, CURRENT_DATE),
        status_changed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [clearancePriceCents, reason, productId]);

    if (result.rows.length === 0) {
      throw new Error('Product not found');
    }

    return result.rows[0];
  }

  /**
   * Calculate sellability score for a product
   */
  calculateSellabilityScore(product) {
    let score = 0;
    const factors = [];

    // Margin contribution (max 30 points)
    if (product.msrp_cents && product.cost_cents && product.msrp_cents > 0) {
      const marginPercent = ((product.msrp_cents - product.cost_cents) / product.msrp_cents) * 100;
      const marginScore = Math.min(30, marginPercent * 0.75);
      score += marginScore;
      factors.push({ factor: 'margin', score: marginScore, detail: `${marginPercent.toFixed(1)}% margin` });
    }

    // Stock availability (max 25 points)
    if (product.stock_quantity > 10) {
      score += 25;
      factors.push({ factor: 'stock', score: 25, detail: 'Well stocked' });
    } else if (product.stock_quantity > 5) {
      score += 20;
      factors.push({ factor: 'stock', score: 20, detail: 'Good stock' });
    } else if (product.stock_quantity > 0) {
      score += 10;
      factors.push({ factor: 'stock', score: 10, detail: 'Limited stock' });
    }

    // Clearance/promo bonus (max 20 points)
    if (product.product_status === 'clearance') {
      score += 20;
      factors.push({ factor: 'clearance', score: 20, detail: 'Clearance item' });
    } else if (product.clearance_price_cents) {
      score += 15;
      factors.push({ factor: 'discount', score: 15, detail: 'On sale' });
    }

    // Brand premium (max 15 points) - could be data-driven
    const premiumBrands = ['Samsung', 'LG', 'Whirlpool', 'KitchenAid', 'Bosch'];
    if (premiumBrands.includes(product.manufacturer)) {
      score += 15;
      factors.push({ factor: 'brand', score: 15, detail: 'Popular brand' });
    }

    // Energy Star bonus (10 points) - check name/description
    const nameAndDesc = ((product.name || '') + ' ' + (product.description || '')).toLowerCase();
    if (nameAndDesc.includes('energy star')) {
      score += 10;
      factors.push({ factor: 'energy', score: 10, detail: 'Energy Star' });
    }

    return {
      score: Math.round(score),
      maxScore: 100,
      factors
    };
  }
}

module.exports = QuickSearchService;
