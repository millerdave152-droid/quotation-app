/**
 * TeleTime POS - Warranty Service
 * Manages warranty products, eligibility, sales, and analytics
 */

class WarrantyService {
  /**
   * @param {Pool} pool - PostgreSQL connection pool
   * @param {object} cache - Optional cache instance
   */
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
    this.CACHE_TTL = 300; // 5 minutes

    // Categories eligible for warranty (can be configured)
    this.eligibleCategories = new Set([
      'electronics',
      'appliances',
      'computers',
      'phones',
      'tablets',
      'tvs',
      'audio',
      'cameras',
      'gaming',
      'smart_home',
    ]);

    // Minimum manufacturer warranty (months) to skip upsell
    this.MIN_MANUFACTURER_WARRANTY_MONTHS = 12;
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Get eligible warranties for a product
   * @param {number} productId - Product ID
   * @param {number} productPrice - Product price (optional, fetched if not provided)
   * @returns {Promise<object>} Eligible warranties with sales script
   */
  async getEligibleWarranties(productId, productPrice = null, saleContext = 'at_sale') {
    try {
      // Get product details
      const product = await this._getProductDetails(productId);
      if (!product) {
        return {
          success: false,
          error: 'Product not found',
        };
      }

      // Use provided price, fall back to product price, then cost
      const price = (productPrice && productPrice > 0)
        ? productPrice
        : (parseFloat(product.price) || parseFloat(product.cost) || 0);

      // Check if product is eligible for warranty
      const eligibilityCheck = this._checkProductEligibility(product);
      if (!eligibilityCheck.eligible) {
        return {
          success: true,
          productId,
          productName: product.name,
          eligible: false,
          reason: eligibilityCheck.reason,
          warranties: [],
          suggestedScript: null,
        };
      }

      // Fetch eligible warranties from database
      const warranties = await this._fetchEligibleWarranties(productId, product.category_id, price, saleContext);

      // Sort by margin (highest first) for best value to business
      warranties.sort((a, b) => b.margin - a.margin);

      // Generate sales script
      const suggestedScript = this._generateSalesScript(product, warranties);

      return {
        success: true,
        productId,
        productName: product.name,
        productPrice: price,
        eligible: true,
        warranties: warranties.map((w) => ({
          warrantyId: w.id,
          warrantyProductId: w.product_id,
          name: w.warranty_name,
          type: w.warranty_type,
          durationMonths: w.duration_months,
          coverage: this._formatCoverageDescription(w.coverage_details),
          coverageDetails: w.coverage_details,
          exclusions: w.exclusions,
          price: w.calculated_price,
          pricePerMonth: Math.round((w.calculated_price / w.duration_months) * 100) / 100,
          deductible: w.deductible_amount || 0,
          badge: w.badge_text,
          isFeatured: w.is_featured,
          providerCode: w.provider_code,
          providerSku: w.provider_sku,
          // Internal metrics (filter out in API response if needed)
          margin: w.margin,
          marginPercent: w.margin_percent,
        })),
        suggestedScript,
        declineTrackingId: this._generateDeclineTrackingId(productId),
      };
    } catch (error) {
      console.error('[WarrantyService] getEligibleWarranties error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Calculate warranty price for a specific product
   * @param {number} warrantyId - Warranty product ID
   * @param {number} productPrice - Price of product being covered
   * @returns {Promise<object>} Calculated price details
   */
  async calculateWarrantyPrice(warrantyId, productPrice) {
    try {
      const query = `
        SELECT
          wp.id,
          wp.product_id,
          wp.warranty_name,
          wp.warranty_type,
          wp.duration_months,
          wp.price_type,
          wp.price_value,
          wp.min_product_price,
          wp.max_product_price,
          wp.deductible_amount,
          p.cost as warranty_cost
        FROM warranty_products wp
        JOIN products p ON p.id = wp.product_id
        WHERE wp.id = $1 AND wp.is_active = true
      `;

      const result = await this.pool.query(query, [warrantyId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Warranty not found or inactive',
        };
      }

      const warranty = result.rows[0];

      // Check price eligibility
      if (productPrice < warranty.min_product_price || productPrice > warranty.max_product_price) {
        return {
          success: false,
          error: `Product price must be between $${warranty.min_product_price} and $${warranty.max_product_price} for this warranty`,
        };
      }

      // Calculate price
      let calculatedPrice;
      if (warranty.price_type === 'fixed') {
        calculatedPrice = parseFloat(warranty.price_value);
      } else {
        // Percentage of product price
        calculatedPrice = Math.round(productPrice * (warranty.price_value / 100) * 100) / 100;
      }

      // Calculate margin
      const warrantyCost = parseFloat(warranty.warranty_cost) || 0;
      const margin = calculatedPrice - warrantyCost;
      const marginPercent = calculatedPrice > 0 ? Math.round((margin / calculatedPrice) * 100) : 0;

      return {
        success: true,
        warrantyId: warranty.id,
        warrantyName: warranty.warranty_name,
        warrantyType: warranty.warranty_type,
        durationMonths: warranty.duration_months,
        productPrice,
        calculatedPrice,
        pricePerMonth: Math.round((calculatedPrice / warranty.duration_months) * 100) / 100,
        deductible: warranty.deductible_amount || 0,
        priceType: warranty.price_type,
        // Internal
        cost: warrantyCost,
        margin,
        marginPercent,
      };
    } catch (error) {
      console.error('[WarrantyService] calculateWarrantyPrice error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Add warranty to an order/transaction
   * @param {object} params - Parameters
   * @param {number} params.transactionId - Transaction ID (POS)
   * @param {number} params.orderId - Order ID (quotes/online)
   * @param {number} params.coveredItemId - Transaction item ID being covered
   * @param {number} params.warrantyProductId - Warranty product ID
   * @param {number} params.customerId - Customer ID (optional)
   * @returns {Promise<object>} Created warranty purchase
   */
  async addWarrantyToOrder({
    transactionId,
    orderId,
    coveredItemId,
    warrantyProductId,
    customerId = null,
  }) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get covered item details
      const itemQuery = `
        SELECT
          ti.item_id,
          ti.product_id,
          ti.product_name,
          ti.product_sku,
          ti.unit_price,
          ti.serial_number,
          t.customer_id,
          c.company_name as customer_name,
          c.email as customer_email,
          c.phone as customer_phone
        FROM transaction_items ti
        JOIN transactions t ON t.transaction_id = ti.transaction_id
        LEFT JOIN customers c ON c.id = t.customer_id
        WHERE ti.item_id = $1
      `;
      const itemResult = await client.query(itemQuery, [coveredItemId]);

      if (itemResult.rows.length === 0) {
        throw new Error('Covered item not found');
      }

      const coveredItem = itemResult.rows[0];

      // Get warranty details
      const warrantyQuery = `
        SELECT
          wp.*,
          p.name as product_name,
          p.sku,
          p.cost as warranty_cost
        FROM warranty_products wp
        JOIN products p ON p.id = wp.product_id
        WHERE wp.id = $1 AND wp.is_active = true
      `;
      const warrantyResult = await client.query(warrantyQuery, [warrantyProductId]);

      if (warrantyResult.rows.length === 0) {
        throw new Error('Warranty product not found or inactive');
      }

      const warranty = warrantyResult.rows[0];

      // Calculate warranty price
      const priceCalc = await this.calculateWarrantyPrice(warrantyProductId, coveredItem.unit_price);
      if (!priceCalc.success) {
        throw new Error(priceCalc.error);
      }

      // Calculate coverage dates
      const coverageStartDate = new Date();
      const coverageEndDate = new Date();
      coverageEndDate.setMonth(coverageEndDate.getMonth() + warranty.duration_months);

      // Insert warranty purchase
      const insertQuery = `
        INSERT INTO warranty_purchases (
          transaction_id,
          order_id,
          covered_item_id,
          warranty_product_id,
          warranty_name,
          warranty_type,
          duration_months,
          covered_product_id,
          covered_product_name,
          covered_product_sku,
          covered_product_serial,
          covered_product_price,
          warranty_price,
          coverage_start_date,
          coverage_end_date,
          customer_id,
          customer_name,
          customer_email,
          customer_phone,
          status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'active'
        )
        RETURNING *
      `;

      const insertResult = await client.query(insertQuery, [
        transactionId || null,
        orderId || null,
        coveredItemId,
        warrantyProductId,
        warranty.warranty_name,
        warranty.warranty_type,
        warranty.duration_months,
        coveredItem.product_id,
        coveredItem.product_name,
        coveredItem.product_sku,
        coveredItem.serial_number,
        coveredItem.unit_price,
        priceCalc.calculatedPrice,
        coverageStartDate,
        coverageEndDate,
        customerId || coveredItem.customer_id,
        coveredItem.customer_name,
        coveredItem.customer_email,
        coveredItem.customer_phone,
      ]);

      const warrantyPurchase = insertResult.rows[0];

      // Add warranty as line item to transaction if transaction exists
      if (transactionId) {
        const lineItemQuery = `
          INSERT INTO transaction_items (
            transaction_id,
            product_id,
            product_name,
            product_sku,
            quantity,
            unit_price,
            unit_cost,
            discount_percent,
            discount_amount,
            tax_amount,
            line_total,
            taxable
          ) VALUES (
            $1, $2, $3, $4, 1, $5, $6, 0, 0, 0, $5, true
          )
          RETURNING item_id
        `;

        const lineItemResult = await client.query(lineItemQuery, [
          transactionId,
          warranty.product_id,
          `${warranty.warranty_name} - ${coveredItem.product_name}`,
          warranty.sku,
          priceCalc.calculatedPrice,
          warranty.warranty_cost || 0,
        ]);

        // Update warranty purchase with line item ID
        await client.query(
          'UPDATE warranty_purchases SET transaction_item_id = $1 WHERE id = $2',
          [lineItemResult.rows[0].item_id, warrantyPurchase.id]
        );
      }

      await client.query('COMMIT');

      return {
        success: true,
        warrantyPurchase: {
          id: warrantyPurchase.id,
          registrationCode: warrantyPurchase.registration_code,
          warrantyName: warrantyPurchase.warranty_name,
          warrantyType: warrantyPurchase.warranty_type,
          coveredProduct: warrantyPurchase.covered_product_name,
          warrantyPrice: priceCalc.calculatedPrice,
          coverageStartDate: warrantyPurchase.coverage_start_date,
          coverageEndDate: warrantyPurchase.coverage_end_date,
          durationMonths: warrantyPurchase.duration_months,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[WarrantyService] addWarrantyToOrder error:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get warranty upsell script for a product
   * @param {object} product - Product object with id, name, price, category
   * @returns {Promise<object>} Upsell script and talking points
   */
  async getWarrantyUpsellScript(product) {
    try {
      const eligibility = await this.getEligibleWarranties(product.id || product.productId, product.price);

      if (!eligibility.success || !eligibility.eligible || eligibility.warranties.length === 0) {
        return {
          success: true,
          showUpsell: false,
          reason: eligibility.reason || 'No warranties available',
        };
      }

      // Get the best warranty to suggest (highest margin that's also featured or popular)
      const featuredWarranties = eligibility.warranties.filter((w) => w.isFeatured || w.badge);
      const suggestedWarranty = featuredWarranties.length > 0
        ? featuredWarranties[0]
        : eligibility.warranties[0];

      // Generate personalized script
      const script = this._generateDetailedSalesScript(product, suggestedWarranty, eligibility.warranties);

      return {
        success: true,
        showUpsell: true,
        productId: product.id || product.productId,
        productName: product.name,
        suggestedWarranty: {
          warrantyId: suggestedWarranty.warrantyId,
          name: suggestedWarranty.name,
          price: suggestedWarranty.price,
          pricePerMonth: suggestedWarranty.pricePerMonth,
          durationMonths: suggestedWarranty.durationMonths,
          badge: suggestedWarranty.badge,
        },
        allWarranties: eligibility.warranties.length,
        script: script.mainScript,
        talkingPoints: script.talkingPoints,
        objectionHandlers: script.objectionHandlers,
        closeStatements: script.closeStatements,
      };
    } catch (error) {
      console.error('[WarrantyService] getWarrantyUpsellScript error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Track warranty decline for analytics
   * @param {object} params - Decline data
   * @returns {Promise<object>} Tracking result
   */
  async trackWarrantyDecline({
    productId,
    transactionId,
    warrantyOffered,
    declineReason = null,
    cashierId = null,
  }) {
    try {
      const query = `
        INSERT INTO warranty_decline_tracking (
          product_id,
          transaction_id,
          warranty_product_ids,
          decline_reason,
          cashier_id,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT DO NOTHING
        RETURNING id
      `;

      // Ensure warranty_decline_tracking table exists
      await this._ensureDeclineTrackingTable();

      const result = await this.pool.query(query, [
        productId,
        transactionId,
        warrantyOffered || [],
        declineReason,
        cashierId,
      ]);

      return {
        success: true,
        tracked: result.rows.length > 0,
      };
    } catch (error) {
      console.error('[WarrantyService] trackWarrantyDecline error:', error);
      // Don't fail the transaction for analytics
      return {
        success: true,
        tracked: false,
        error: error.message,
      };
    }
  }

  /**
   * Get warranty by registration code
   * @param {string} registrationCode - Warranty registration code
   * @returns {Promise<object>} Warranty details
   */
  async getWarrantyByCode(registrationCode) {
    try {
      const query = `
        SELECT
          wp.*,
          CASE
            WHEN wp.status = 'cancelled' THEN 'Cancelled'
            WHEN wp.status = 'refunded' THEN 'Refunded'
            WHEN CURRENT_DATE > wp.coverage_end_date THEN 'Expired'
            WHEN CURRENT_DATE < wp.coverage_start_date THEN 'Pending'
            ELSE 'Active'
          END AS coverage_status,
          (wp.coverage_end_date - CURRENT_DATE) AS days_remaining,
          (SELECT COUNT(*) FROM warranty_claims wc WHERE wc.warranty_purchase_id = wp.id) AS claims_count
        FROM warranty_purchases wp
        WHERE wp.registration_code = $1
      `;

      const result = await this.pool.query(query, [registrationCode]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Warranty not found',
        };
      }

      const warranty = result.rows[0];

      return {
        success: true,
        warranty: {
          id: warranty.id,
          registrationCode: warranty.registration_code,
          warrantyName: warranty.warranty_name,
          warrantyType: warranty.warranty_type,
          coveredProduct: warranty.covered_product_name,
          coveredProductSerial: warranty.covered_product_serial,
          warrantyPrice: parseFloat(warranty.warranty_price),
          coverageStartDate: warranty.coverage_start_date,
          coverageEndDate: warranty.coverage_end_date,
          durationMonths: warranty.duration_months,
          status: warranty.status,
          coverageStatus: warranty.coverage_status,
          daysRemaining: warranty.days_remaining,
          claimsCount: parseInt(warranty.claims_count),
          customer: {
            name: warranty.customer_name,
            email: warranty.customer_email,
            phone: warranty.customer_phone,
          },
        },
      };
    } catch (error) {
      console.error('[WarrantyService] getWarrantyByCode error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get warranty analytics/statistics
   * @param {object} params - Filter parameters
   * @returns {Promise<object>} Analytics data
   */
  async getWarrantyAnalytics({ startDate, endDate, warrantyType = null }) {
    try {
      const params = [startDate, endDate];
      let typeFilter = '';

      if (warrantyType) {
        typeFilter = 'AND wp.warranty_type = $3';
        params.push(warrantyType);
      }

      const query = `
        SELECT
          COUNT(*) AS total_sold,
          SUM(wp.warranty_price) AS total_revenue,
          AVG(wp.warranty_price) AS avg_price,
          COUNT(DISTINCT wp.customer_id) AS unique_customers,
          wp.warranty_type,
          wpr.warranty_name,
          wpr.duration_months
        FROM warranty_purchases wp
        JOIN warranty_products wpr ON wpr.id = wp.warranty_product_id
        WHERE wp.created_at BETWEEN $1 AND $2
          ${typeFilter}
        GROUP BY wp.warranty_type, wpr.warranty_name, wpr.duration_months
        ORDER BY total_sold DESC
      `;

      const result = await this.pool.query(query, params);

      // Get decline stats
      const declineQuery = `
        SELECT COUNT(*) AS total_declines
        FROM warranty_decline_tracking
        WHERE created_at BETWEEN $1 AND $2
      `;
      const declineResult = await this.pool.query(declineQuery, [startDate, endDate]);

      // Calculate attach rate
      const totalTransactionsQuery = `
        SELECT COUNT(DISTINCT transaction_id) AS total
        FROM transaction_items ti
        JOIN products p ON p.id = ti.product_id
        WHERE ti.created_at BETWEEN $1 AND $2
      `;
      const transResult = await this.pool.query(totalTransactionsQuery, [startDate, endDate]);

      const totalSold = result.rows.reduce((sum, r) => sum + parseInt(r.total_sold), 0);
      const totalDeclines = parseInt(declineResult.rows[0]?.total_declines || 0);
      const totalTransactions = parseInt(transResult.rows[0]?.total || 1);

      return {
        success: true,
        period: { startDate, endDate },
        summary: {
          totalWarrantiesSold: totalSold,
          totalRevenue: result.rows.reduce((sum, r) => sum + parseFloat(r.total_revenue || 0), 0),
          averagePrice: totalSold > 0
            ? result.rows.reduce((sum, r) => sum + parseFloat(r.avg_price || 0), 0) / result.rows.length
            : 0,
          uniqueCustomers: result.rows.reduce((sum, r) => sum + parseInt(r.unique_customers || 0), 0),
          totalDeclines,
          attachRate: Math.round((totalSold / (totalSold + totalDeclines)) * 100) || 0,
          conversionRate: Math.round((totalSold / totalTransactions) * 100) || 0,
        },
        byType: result.rows.map((r) => ({
          warrantyType: r.warranty_type,
          warrantyName: r.warranty_name,
          durationMonths: r.duration_months,
          totalSold: parseInt(r.total_sold),
          totalRevenue: parseFloat(r.total_revenue),
          avgPrice: parseFloat(r.avg_price),
        })),
      };
    } catch (error) {
      console.error('[WarrantyService] getWarrantyAnalytics error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Get product details
   */
  async _getProductDetails(productId) {
    const cacheKey = `product:${productId}`;

    if (this.cache) {
      const cached = this.cache.get('short', cacheKey);
      if (cached) return cached;
    }

    const query = `
      SELECT
        p.id,
        CONCAT(p.manufacturer, ' ', p.model) as name,
        p.sku,
        p.price,
        p.cost,
        p.category_id,
        c.name as category_name,
        c.slug as category_slug,
        0 AS manufacturer_warranty_months
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = $1
    `;

    const result = await this.pool.query(query, [productId]);

    if (result.rows.length === 0) return null;

    const product = result.rows[0];

    if (this.cache) {
      this.cache.set('short', cacheKey, product, this.CACHE_TTL);
    }

    return product;
  }

  /**
   * Check if product is eligible for warranty
   */
  _checkProductEligibility(product) {
    // Skip warranty-type products (don't offer warranty on warranty)
    if (product.sku && product.sku.startsWith('WRN-')) {
      return { eligible: false, reason: 'Warranty products are not eligible' };
    }

    // Check manufacturer warranty
    const mfrWarrantyMonths = product.manufacturer_warranty_months || 0;
    if (mfrWarrantyMonths > this.MIN_MANUFACTURER_WARRANTY_MONTHS) {
      return {
        eligible: false,
        reason: `Product already has ${mfrWarrantyMonths}-month manufacturer warranty`,
      };
    }

    // Category eligibility is checked via DB in _fetchEligibleWarranties
    return { eligible: true };
  }

  /**
   * Fetch eligible warranties from database
   */
  async _fetchEligibleWarranties(productId, categoryId, productPrice, saleContext = 'at_sale') {
    const query = `
      SELECT DISTINCT
        wp.id,
        wp.product_id,
        wp.warranty_name,
        wp.warranty_type,
        wp.warranty_description,
        wp.duration_months,
        wp.price_type,
        wp.price_value,
        wp.coverage_details,
        wp.exclusions,
        wp.deductible_amount,
        wp.badge_text,
        wp.is_featured,
        wp.display_order,
        wp.provider_code,
        wp.provider_sku,
        wp.sale_context,
        p.cost as warranty_cost,
        CASE
          WHEN we.custom_price_value IS NOT NULL THEN we.custom_price_value
          WHEN wp.price_type = 'fixed' THEN wp.price_value
          ELSE ROUND($3 * (wp.price_value / 100), 2)
        END AS calculated_price
      FROM warranty_products wp
      JOIN products p ON p.id = wp.product_id
      JOIN warranty_eligibility we ON we.warranty_product_id = wp.id AND we.is_active = true
      WHERE wp.is_active = true
        AND wp.sale_context = $4
        AND (
          we.product_id = $1
          OR we.category_id = $2
          OR we.category_id = (SELECT parent_id FROM categories WHERE id = $2)
        )
        AND $3 >= COALESCE(we.custom_min_price, wp.min_product_price)
        AND $3 <= COALESCE(we.custom_max_price, wp.max_product_price)
      ORDER BY wp.display_order, wp.duration_months
    `;

    const result = await this.pool.query(query, [productId, categoryId, productPrice, saleContext]);

    // Calculate margin for each warranty
    return result.rows.map((w) => {
      const cost = parseFloat(w.warranty_cost) || 0;
      const price = parseFloat(w.calculated_price);
      const margin = price - cost;
      const marginPercent = price > 0 ? Math.round((margin / price) * 100) : 0;

      return {
        ...w,
        calculated_price: price,
        margin,
        margin_percent: marginPercent,
      };
    });
  }

  /**
   * Format coverage details into readable description
   */
  _formatCoverageDescription(coverageDetails) {
    if (!coverageDetails || typeof coverageDetails !== 'object') {
      return 'Standard coverage';
    }

    const coverageItems = [];

    if (coverageDetails.parts) coverageItems.push('parts');
    if (coverageDetails.labor) coverageItems.push('labor');
    if (coverageDetails.accidental_drops) coverageItems.push('accidental drops');
    if (coverageDetails.liquid_spills) coverageItems.push('liquid damage');
    if (coverageDetails.cracked_screens) coverageItems.push('cracked screens');
    if (coverageDetails.electrical_surge || coverageDetails.power_surge) coverageItems.push('power surges');
    if (coverageDetails.mechanical_failure) coverageItems.push('mechanical failure');
    if (coverageDetails.in_home_service) coverageItems.push('in-home service');
    if (coverageDetails.remote_replacement) coverageItems.push('remote replacement');
    if (coverageDetails.food_spoilage) coverageItems.push('food spoilage');

    if (coverageItems.length === 0) {
      return 'Standard warranty coverage';
    }

    return `Covers ${coverageItems.join(', ')}`;
  }

  /**
   * Generate basic sales script
   */
  _generateSalesScript(product, warranties) {
    if (warranties.length === 0) return null;

    const bestWarranty = warranties.find((w) => w.is_featured || w.badge_text) || warranties[0];
    const pricePerMonth = bestWarranty.calculated_price / bestWarranty.duration_months;

    const productType = this._getProductTypePhrase(product.category_name);

    return `For just $${pricePerMonth.toFixed(2)} a month, you can protect your ${productType} with our ${bestWarranty.warranty_name}. ` +
      `This covers ${this._formatCoverageDescription(bestWarranty.coverage_details).toLowerCase()} for ${bestWarranty.duration_months} months. ` +
      `Would you like to add this protection today?`;
  }

  /**
   * Generate detailed sales script with objection handlers
   */
  _generateDetailedSalesScript(product, warranty, allWarranties) {
    const pricePerMonth = warranty.pricePerMonth;
    const productType = this._getProductTypePhrase(product.category_name || product.category);
    const productName = product.name || product.productName;
    const providerCode = warranty.providerCode || warranty.coverageDetails?.provider_code || '';

    // Provider-specific talking points
    let talkingPoints;
    let mainScript;
    let objectionHandlers;

    if (providerCode === 'excelsior_appliance') {
      mainScript = `I see you're getting the ${productName}. For just $${pricePerMonth.toFixed(2)} a month, ` +
        `you can add our Excelsior service plan - ${warranty.durationMonths} months of complete coverage. ` +
        `That includes in-home service, no deductible, power surge protection, and even food spoilage coverage. Would you like to add this protection?`;
      talkingPoints = [
        `Only $${pricePerMonth.toFixed(2)}/month for total peace of mind`,
        'No deductible - zero out-of-pocket for service calls',
        'In-home service - technician comes to you',
        'Power surge protection included',
        'Food spoilage coverage up to $500',
        '4th failure = full replacement guarantee',
        'Fully transferable if you sell or gift the appliance',
      ];
      objectionHandlers = {
        'too expensive': `I understand. But consider that an appliance repair averages $200-$400. ` +
          `For $${warranty.price.toFixed(2)} total, you get ${warranty.durationMonths} months of complete coverage with zero deductible.`,
        'already have warranty': 'The manufacturer warranty typically only covers 1 year. ' +
          'Our Excelsior plan extends that to ' + (warranty.durationMonths / 12) + ' years AND adds power surge and food spoilage coverage.',
        'never needed one before': 'That\'s great! But appliance repair costs have gone up significantly. ' +
          `This plan protects your $${product.price.toFixed(2)} investment with in-home service and no deductible.`,
        'need to think about it': 'Of course! Just know that the at-sale price is the best rate available. ' +
          `For only $${pricePerMonth.toFixed(2)}/month, it's a small price for total peace of mind.`,
      };
    } else if (providerCode === 'guardian_angel_tv') {
      mainScript = `I see you're getting the ${productName}. For just $${pricePerMonth.toFixed(2)} a month, ` +
        `you can add Guardian Angel protection - ${warranty.durationMonths} months beyond the manufacturer warranty. ` +
        `Full parts & labor coverage plus a one-time remote replacement if needed. Would you like to add this?`;
      talkingPoints = [
        `Only $${pricePerMonth.toFixed(2)}/month - less than a streaming subscription`,
        'Full parts & labor coverage',
        'One-time remote replacement included',
        'No deductible on claims',
        'Fully transferable to new owner',
      ];
      objectionHandlers = {
        'too expensive': `TV repairs can easily cost $${Math.round(product.price * 0.5)} or more for panel issues. ` +
          `For $${warranty.price.toFixed(2)} total, you get ${warranty.durationMonths} months of coverage plus a replacement option.`,
        'already have warranty': 'The manufacturer warranty only covers defects for 1 year. ' +
          'Guardian Angel extends that and includes a one-time remote replacement if your TV can\'t be fixed.',
        'never needed one before': 'Modern TVs have more technology packed in than ever. ' +
          `This protects your $${product.price.toFixed(2)} investment with parts, labor, and replacement coverage.`,
        'need to think about it': 'Of course! Just know that this plan must be purchased at the time of sale. ' +
          `For only $${pricePerMonth.toFixed(2)}/month, many customers find the peace of mind worth it.`,
      };
    } else {
      // Guardian Angel Electronics or generic
      mainScript = `I see you're getting the ${productName}. For just $${pricePerMonth.toFixed(2)} a month, ` +
        `you can protect it with Guardian Angel coverage - ${warranty.durationMonths} months beyond the manufacturer warranty. ` +
        `${this._formatCoverageDescription(warranty.coverageDetails)} Would you like to add this protection?`;
      talkingPoints = [
        `Only $${pricePerMonth.toFixed(2)}/month - less than a coffee`,
        `${warranty.durationMonths} months of complete peace of mind`,
        warranty.deductible === 0 ? 'No deductible on claims' : `Just $${warranty.deductible} deductible`,
        'Covers what manufacturer warranty doesn\'t',
        'Fully transferable to new owner',
      ];
      objectionHandlers = {
        'too expensive': `I understand. But consider that a repair could cost $${Math.round(product.price * 0.4)} or more. ` +
          `For $${warranty.price.toFixed(2)} total, you get ${warranty.durationMonths} months of coverage.`,
        'already have warranty': 'The manufacturer warranty only covers defects for a limited time. ' +
          'Our Guardian Angel plan extends that coverage significantly.',
        'never needed one before': 'That\'s great! But with today\'s electronics being more complex, ' +
          `repair costs have increased significantly. This protects your $${product.price.toFixed(2)} investment.`,
        'need to think about it': 'Of course! Just know that warranty must be purchased with the product. ' +
          `For only $${pricePerMonth.toFixed(2)}/month, many customers find the peace of mind worth it.`,
      };
    }

    return {
      mainScript,
      talkingPoints,
      objectionHandlers,
      closeStatements: [
        `Should I add the ${warranty.name} to your order?`,
        `Can I include the protection plan for you today?`,
        allWarranties.length > 1
          ? `Would you prefer the ${allWarranties[0].durationMonths}-month or ${allWarranties[allWarranties.length - 1].durationMonths}-month plan?`
          : `Would you like to add this protection?`,
      ],
    };
  }

  /**
   * Get product type phrase for scripts
   */
  _getProductTypePhrase(category) {
    const phrases = {
      phones: 'new phone',
      tablets: 'new tablet',
      computers: 'new computer',
      laptops: 'new laptop',
      tvs: 'new TV',
      audio: 'new audio equipment',
      cameras: 'new camera',
      gaming: 'gaming equipment',
      appliances: 'new appliance',
      electronics: 'new device',
    };

    const cat = (category || '').toLowerCase();
    return phrases[cat] || 'new purchase';
  }

  /**
   * Generate decline tracking ID
   */
  _generateDeclineTrackingId(productId) {
    return `DCL-${productId}-${Date.now()}`;
  }

  /**
   * Ensure decline tracking table exists
   */
  async _ensureDeclineTrackingTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS warranty_decline_tracking (
        id SERIAL PRIMARY KEY,
        product_id INTEGER,
        transaction_id INTEGER,
        warranty_product_ids INTEGER[],
        decline_reason TEXT,
        cashier_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await this.pool.query(query);
  }

  // ============================================================================
  // CUSTOMER WARRANTY LOOKUP
  // ============================================================================

  /**
   * Get all warranties for a customer
   * @param {number} customerId - Customer ID
   * @param {object} options - Filter options
   * @returns {Promise<object>} Customer warranties
   */
  async getCustomerWarranties(customerId, options = {}) {
    try {
      const { status = null, includeExpired = false } = options;

      let whereClause = 'WHERE wp.customer_id = $1';
      const params = [customerId];

      // Filter by status
      if (status) {
        params.push(status);
        whereClause += ` AND wp.status = $${params.length}`;
      } else if (!includeExpired) {
        // By default, exclude expired warranties unless specifically requested
        whereClause += ` AND (wp.status = 'active' OR wp.coverage_end_date >= CURRENT_DATE)`;
      }

      const query = `
        SELECT
          wp.id,
          wp.warranty_name,
          wp.warranty_type,
          wp.duration_months,
          wp.warranty_price,
          wp.coverage_start_date,
          wp.coverage_end_date,
          wp.registration_code,
          wp.status,
          wp.covered_product_id,
          wp.covered_product_name,
          wp.covered_product_sku,
          wp.covered_product_serial,
          wp.covered_product_price,
          wp.transaction_id,
          wp.created_at,
          wp.customer_name,
          wp.customer_email,
          wp.customer_phone,
          t.transaction_number,
          t.created_at as purchase_date,
          wpr.terms_url,
          wpr.provider_name,
          wpr.deductible_amount,
          wpr.coverage_details,
          -- Calculate days remaining
          CASE
            WHEN wp.coverage_end_date >= CURRENT_DATE THEN
              wp.coverage_end_date - CURRENT_DATE
            ELSE 0
          END as days_remaining,
          -- Calculate warranty status
          CASE
            WHEN wp.status = 'cancelled' THEN 'cancelled'
            WHEN wp.status = 'claimed' THEN 'claimed'
            WHEN wp.coverage_end_date < CURRENT_DATE THEN 'expired'
            WHEN wp.coverage_start_date > CURRENT_DATE THEN 'pending'
            ELSE 'active'
          END as computed_status
        FROM warranty_purchases wp
        LEFT JOIN transactions t ON t.transaction_id = wp.transaction_id
        LEFT JOIN warranty_products wpr ON wpr.id = wp.warranty_product_id
        ${whereClause}
        ORDER BY
          CASE
            WHEN wp.status = 'active' AND wp.coverage_end_date >= CURRENT_DATE THEN 0
            ELSE 1
          END,
          wp.coverage_end_date DESC
      `;

      const result = await this.pool.query(query, params);

      // Group warranties by status
      const warranties = result.rows.map((row) => ({
        id: row.id,
        warrantyName: row.warranty_name,
        warrantyType: row.warranty_type,
        durationMonths: row.duration_months,
        price: parseFloat(row.warranty_price),
        coverageStartDate: row.coverage_start_date,
        coverageEndDate: row.coverage_end_date,
        registrationCode: row.registration_code,
        status: row.computed_status,
        daysRemaining: row.days_remaining,
        coveredProduct: {
          id: row.covered_product_id,
          name: row.covered_product_name,
          sku: row.covered_product_sku,
          serialNumber: row.covered_product_serial,
          price: parseFloat(row.covered_product_price),
        },
        purchase: {
          transactionId: row.transaction_id,
          transactionNumber: row.transaction_number,
          date: row.purchase_date,
        },
        terms: {
          url: row.terms_url,
          provider: row.provider_name,
          deductible: row.deductible_amount ? parseFloat(row.deductible_amount) : 0,
          coverage: row.coverage_details,
        },
        customer: {
          name: row.customer_name,
          email: row.customer_email,
          phone: row.customer_phone,
        },
      }));

      // Summary stats
      const activeWarranties = warranties.filter((w) => w.status === 'active');
      const expiringSoon = activeWarranties.filter((w) => w.daysRemaining <= 30);

      return {
        success: true,
        customerId,
        warranties,
        summary: {
          total: warranties.length,
          active: activeWarranties.length,
          expired: warranties.filter((w) => w.status === 'expired').length,
          expiringSoon: expiringSoon.length,
          totalValue: warranties.reduce((sum, w) => sum + w.price, 0),
        },
      };
    } catch (error) {
      console.error('[WarrantyService] getCustomerWarranties error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get warranty by registration code (for claims/lookup)
   * @param {string} code - Registration code
   * @returns {Promise<object>} Warranty details
   */
  async getWarrantyByCode(code) {
    try {
      const query = `
        SELECT
          wp.*,
          t.transaction_number,
          t.created_at as purchase_date,
          wpr.terms_url,
          wpr.provider_name,
          wpr.provider_contact,
          wpr.deductible_amount,
          wpr.coverage_details,
          wpr.exclusions,
          c.name as customer_name_from_customer,
          c.email as customer_email_from_customer,
          c.phone as customer_phone_from_customer,
          -- Calculate warranty status
          CASE
            WHEN wp.status = 'cancelled' THEN 'cancelled'
            WHEN wp.status = 'claimed' THEN 'claimed'
            WHEN wp.coverage_end_date < CURRENT_DATE THEN 'expired'
            WHEN wp.coverage_start_date > CURRENT_DATE THEN 'pending'
            ELSE 'active'
          END as computed_status,
          CASE
            WHEN wp.coverage_end_date >= CURRENT_DATE THEN
              wp.coverage_end_date - CURRENT_DATE
            ELSE 0
          END as days_remaining
        FROM warranty_purchases wp
        LEFT JOIN transactions t ON t.transaction_id = wp.transaction_id
        LEFT JOIN warranty_products wpr ON wpr.id = wp.warranty_product_id
        LEFT JOIN customers c ON c.id = wp.customer_id
        WHERE wp.registration_code = $1
      `;

      const result = await this.pool.query(query, [code]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Warranty not found',
        };
      }

      const row = result.rows[0];

      return {
        success: true,
        warranty: {
          id: row.id,
          registrationCode: row.registration_code,
          warrantyName: row.warranty_name,
          warrantyType: row.warranty_type,
          durationMonths: row.duration_months,
          price: parseFloat(row.warranty_price),
          coverageStartDate: row.coverage_start_date,
          coverageEndDate: row.coverage_end_date,
          status: row.computed_status,
          daysRemaining: row.days_remaining,
          coveredProduct: {
            id: row.covered_product_id,
            name: row.covered_product_name,
            sku: row.covered_product_sku,
            serialNumber: row.covered_product_serial,
            price: parseFloat(row.covered_product_price),
          },
          purchase: {
            transactionId: row.transaction_id,
            transactionNumber: row.transaction_number,
            date: row.purchase_date,
          },
          terms: {
            url: row.terms_url,
            provider: row.provider_name,
            providerContact: row.provider_contact,
            deductible: row.deductible_amount ? parseFloat(row.deductible_amount) : 0,
            coverage: row.coverage_details,
            exclusions: row.exclusions,
          },
          customer: {
            id: row.customer_id,
            name: row.customer_name || row.customer_name_from_customer,
            email: row.customer_email || row.customer_email_from_customer,
            phone: row.customer_phone || row.customer_phone_from_customer,
          },
        },
      };
    } catch (error) {
      console.error('[WarrantyService] getWarrantyByCode error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get warranties expiring soon (for proactive renewal offers)
   * @param {number} daysThreshold - Days until expiry (default 30)
   * @returns {Promise<object>} Expiring warranties
   */
  async getExpiringWarranties(daysThreshold = 30) {
    try {
      const query = `
        SELECT
          wp.id,
          wp.warranty_name,
          wp.warranty_type,
          wp.coverage_end_date,
          wp.registration_code,
          wp.covered_product_name,
          wp.covered_product_serial,
          wp.customer_id,
          wp.customer_name,
          wp.customer_email,
          wp.customer_phone,
          wp.coverage_end_date - CURRENT_DATE as days_remaining,
          c.name as customer_name_alt,
          c.email as customer_email_alt
        FROM warranty_purchases wp
        LEFT JOIN customers c ON c.id = wp.customer_id
        WHERE wp.status = 'active'
          AND wp.coverage_end_date >= CURRENT_DATE
          AND wp.coverage_end_date <= CURRENT_DATE + $1
        ORDER BY wp.coverage_end_date ASC
      `;

      const result = await this.pool.query(query, [daysThreshold]);

      return {
        success: true,
        daysThreshold,
        count: result.rows.length,
        warranties: result.rows.map((row) => ({
          id: row.id,
          warrantyName: row.warranty_name,
          warrantyType: row.warranty_type,
          coverageEndDate: row.coverage_end_date,
          daysRemaining: row.days_remaining,
          registrationCode: row.registration_code,
          coveredProduct: {
            name: row.covered_product_name,
            serialNumber: row.covered_product_serial,
          },
          customer: {
            id: row.customer_id,
            name: row.customer_name || row.customer_name_alt,
            email: row.customer_email || row.customer_email_alt,
            phone: row.customer_phone,
          },
        })),
      };
    } catch (error) {
      console.error('[WarrantyService] getExpiringWarranties error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = WarrantyService;
