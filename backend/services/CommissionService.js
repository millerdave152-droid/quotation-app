/**
 * Commission Service
 * Calculates and tracks sales rep commissions
 *
 * Supports:
 * - Flat percentage of sale
 * - Tiered percentages based on thresholds
 * - Per-category/product-type rates
 * - Bonus for warranties/services
 * - Reduced commission on heavily discounted items
 */

class CommissionService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
    this.CACHE_TTL = 5 * 60; // 5 minutes
  }

  // ============================================
  // RULE MANAGEMENT
  // ============================================

  /**
   * Get all active commission rules
   */
  async getActiveRules() {
    const cacheKey = 'commission:rules:active';

    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    const { rows } = await this.pool.query(`
      SELECT
        cr.*,
        pc.name AS category_name
      FROM commission_rules cr
      LEFT JOIN product_categories pc ON pc.id = cr.category_id
      WHERE cr.is_active = true
      ORDER BY cr.priority ASC, cr.id ASC
    `);

    const rules = rows.map(this.formatRule);

    if (this.cache) {
      this.cache.set(cacheKey, rules, this.CACHE_TTL);
    }

    return rules;
  }

  /**
   * Get commission tiers for tiered rules
   */
  async getCommissionTiers(ruleId) {
    const { rows } = await this.pool.query(`
      SELECT * FROM commission_tiers
      WHERE rule_id = $1
      ORDER BY min_amount_cents ASC
    `, [ruleId]);

    return rows.map(tier => ({
      id: tier.id,
      tierName: tier.tier_name,
      minAmount: tier.min_amount_cents / 100,
      maxAmount: tier.max_amount_cents ? tier.max_amount_cents / 100 : null,
      rate: parseFloat(tier.rate),
    }));
  }

  /**
   * Get sales rep specific commission settings
   */
  async getRepSettings(repId) {
    const { rows } = await this.pool.query(`
      SELECT * FROM sales_rep_commission_settings
      WHERE user_id = $1 AND is_active = true
    `, [repId]);

    if (rows.length === 0) return null;

    const settings = rows[0];
    return {
      baseRateOverride: settings.base_rate_override ? parseFloat(settings.base_rate_override) : null,
      warrantyBonusOverride: settings.warranty_bonus_override ? parseFloat(settings.warranty_bonus_override) : null,
      monthlyTarget: settings.monthly_target_cents ? settings.monthly_target_cents / 100 : null,
      quarterlyTarget: settings.quarterly_target_cents ? settings.quarterly_target_cents / 100 : null,
      acceleratorRate: settings.accelerator_rate ? parseFloat(settings.accelerator_rate) : null,
      acceleratorThreshold: settings.accelerator_threshold ? parseFloat(settings.accelerator_threshold) : 1.0,
    };
  }

  // ============================================
  // COMMISSION CALCULATION
  // ============================================

  /**
   * Calculate commission for a completed order
   * @param {number} orderId - The order ID
   * @param {number} salesRepId - The sales rep ID
   * @returns {object} Commission breakdown
   */
  async calculateOrderCommission(orderId, salesRepId) {
    // Get order with items
    const orderResult = await this.pool.query(`
      SELECT
        uo.id,
        uo.order_number,
        uo.subtotal_cents,
        uo.discount_cents,
        uo.total_cents,
        uo.source,
        uo.created_at
      FROM unified_orders uo
      WHERE uo.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      throw new Error('Order not found');
    }

    const order = orderResult.rows[0];

    // Get order items with product details
    const itemsResult = await this.pool.query(`
      SELECT
        uoi.id AS item_id,
        uoi.product_id,
        uoi.product_name,
        uoi.sku,
        uoi.quantity,
        uoi.unit_price_cents,
        uoi.line_total_cents,
        uoi.discount_cents AS item_discount_cents,
        uoi.discount_percent,
        uoi.item_type,
        p.category_id,
        pc.name AS category_name,
        p.product_type
      FROM unified_order_items uoi
      LEFT JOIN products p ON p.id = uoi.product_id
      LEFT JOIN product_categories pc ON pc.id = p.category_id
      WHERE uoi.order_id = $1
    `, [orderId]);

    const items = itemsResult.rows;

    // Build cart structure for calculation
    // FIX: Use fallback values to prevent NaN from null/undefined cents values
    const cart = {
      orderId,
      orderNumber: order.order_number,
      subtotal: (order.subtotal_cents || 0) / 100,
      discount: (order.discount_cents || 0) / 100,
      total: (order.total_cents || 0) / 100,
      items: items.map(item => ({
        itemId: item.item_id,
        productId: item.product_id,
        name: item.product_name,
        sku: item.sku,
        quantity: item.quantity || 1,
        unitPrice: (item.unit_price_cents || 0) / 100,
        lineTotal: (item.line_total_cents || 0) / 100,
        discountCents: item.item_discount_cents || 0,
        discountPercent: item.discount_percent ? parseFloat(item.discount_percent) : 0,
        itemType: item.item_type || 'product',
        categoryId: item.category_id,
        categoryName: item.category_name,
        productType: item.product_type || this.inferProductType(item),
      })),
    };

    return this.calculateCartCommission(cart, salesRepId);
  }

  /**
   * Calculate commission preview for a cart (before sale completes)
   * @param {object} cart - Cart object with items
   * @param {number} salesRepId - The sales rep ID
   * @returns {object} Commission breakdown
   */
  async calculateCartCommission(cart, salesRepId) {
    const rules = await this.getActiveRules();
    const repSettings = await this.getRepSettings(salesRepId);

    const breakdown = [];
    const notes = [];
    let totalCommission = 0;

    for (const item of cart.items) {
      const itemCommission = await this.calculateItemCommission(
        item,
        rules,
        repSettings,
        cart,
        notes
      );

      breakdown.push(itemCommission);
      totalCommission += itemCommission.commission;
    }

    // Check for accelerator bonus if rep has exceeded target
    if (repSettings?.acceleratorRate && repSettings?.monthlyTarget) {
      const mtdSales = await this.getRepMTDSales(salesRepId);
      const targetPercent = mtdSales / (repSettings.monthlyTarget * 100);

      if (targetPercent >= repSettings.acceleratorThreshold) {
        const acceleratorBonus = totalCommission * repSettings.acceleratorRate;
        totalCommission += acceleratorBonus;
        notes.push(`Accelerator bonus applied (+${(repSettings.acceleratorRate * 100).toFixed(1)}% for exceeding ${(repSettings.acceleratorThreshold * 100).toFixed(0)}% of target)`);
      }
    }

    return {
      totalCommission: Math.round(totalCommission * 100) / 100,
      breakdown,
      notes,
      summary: {
        itemCount: breakdown.length,
        baseCommission: breakdown.reduce((sum, b) => sum + (b.isBonus ? 0 : b.commission), 0),
        bonusCommission: breakdown.reduce((sum, b) => sum + (b.isBonus ? b.commission : 0), 0),
        reducedItems: breakdown.filter(b => b.isReduced).length,
      },
    };
  }

  /**
   * Calculate commission for a single item
   */
  async calculateItemCommission(item, rules, repSettings, cart, notes) {
    const saleAmount = item.lineTotal;
    let commission = 0;
    let appliedRate = 0;
    let appliedRule = null;
    let isBonus = false;
    let isReduced = false;

    // Check if item is heavily discounted
    const discountPercent = item.discountPercent || (item.discountCents > 0
      ? item.discountCents / (item.lineTotal * 100 + item.discountCents)
      : 0);

    // Find applicable rules in priority order
    for (const rule of rules) {
      if (this.ruleApplies(rule, item, cart)) {
        // Check discount threshold
        if (!rule.appliesToDiscounted && discountPercent > rule.discountThreshold) {
          // Use reduced rate for heavily discounted items
          if (rule.discountedRate) {
            appliedRate = rule.discountedRate;
            isReduced = true;
            notes.push(`Reduced commission on ${item.name} (${(discountPercent * 100).toFixed(0)}% discount)`);
          } else {
            continue; // Skip this rule entirely
          }
        } else {
          appliedRate = rule.rate;
        }

        // Apply rep-specific overrides
        if (repSettings) {
          if (rule.ruleType === 'warranty' && repSettings.warrantyBonusOverride) {
            appliedRate = repSettings.warrantyBonusOverride;
          } else if (rule.ruleType === 'flat' && repSettings.baseRateOverride) {
            appliedRate = repSettings.baseRateOverride;
          }
        }

        // Calculate commission
        if (rule.bonusFlatCents) {
          commission = rule.bonusFlatCents / 100;
        } else {
          commission = saleAmount * appliedRate;
        }

        appliedRule = rule;
        isBonus = rule.isBonus;

        // Stop at first matching rule (priority order)
        break;
      }
    }

    // If no specific rule matched, use default flat rate
    if (!appliedRule) {
      const flatRule = rules.find(r => r.ruleType === 'flat');
      if (flatRule) {
        appliedRate = repSettings?.baseRateOverride || flatRule.rate;
        commission = saleAmount * appliedRate;
        appliedRule = flatRule;
      }
    }

    // Add bonus note
    if (isBonus && commission > 0) {
      if (item.productType === 'warranty') {
        notes.push('Warranty bonus applied');
      } else if (item.productType === 'service') {
        notes.push('Service bonus applied');
      }
    }

    // Add full commission note if discount was under threshold
    if (discountPercent > 0 && !isReduced && appliedRule?.discountThreshold) {
      const thresholdPercent = (appliedRule.discountThreshold * 100).toFixed(0);
      if (discountPercent < appliedRule.discountThreshold && !notes.includes('Full commission - discount under threshold')) {
        notes.push('Full commission - discount under threshold');
      }
    }

    return {
      itemId: item.itemId,
      itemName: item.name,
      sku: item.sku,
      saleAmount: Math.round(saleAmount * 100) / 100,
      rate: appliedRate,
      ratePercent: `${(appliedRate * 100).toFixed(2)}%`,
      commission: Math.round(commission * 100) / 100,
      ruleId: appliedRule?.id,
      ruleName: appliedRule?.ruleName,
      ruleType: appliedRule?.ruleType,
      isBonus,
      isReduced,
      discountPercent: Math.round(discountPercent * 10000) / 100,
      categoryName: item.categoryName,
      productType: item.productType,
    };
  }

  /**
   * Check if a rule applies to an item
   */
  ruleApplies(rule, item, cart) {
    switch (rule.ruleType) {
      case 'category':
        return item.categoryId === rule.categoryId;

      case 'product_type':
        return item.productType === rule.productType ||
               item.itemType === rule.productType;

      case 'warranty':
        return item.productType === 'warranty' ||
               item.itemType === 'warranty' ||
               item.name?.toLowerCase().includes('warranty');

      case 'service':
        return item.productType === 'service' ||
               item.itemType === 'service' ||
               item.name?.toLowerCase().includes('installation') ||
               item.name?.toLowerCase().includes('setup');

      case 'tiered':
        // Tiered rules apply to the total, checked at order level
        const orderTotal = cart.total * 100;
        return orderTotal >= rule.minThresholdCents &&
               (rule.maxThresholdCents === null || orderTotal < rule.maxThresholdCents);

      case 'flat':
        return true; // Flat rate is fallback

      default:
        return false;
    }
  }

  /**
   * Infer product type from item data
   */
  inferProductType(item) {
    const name = (item.name || item.product_name || '').toLowerCase();
    const category = (item.categoryName || item.category_name || '').toLowerCase();

    if (name.includes('warranty') || category.includes('warranty')) return 'warranty';
    if (name.includes('installation') || name.includes('setup') || name.includes('service')) return 'service';
    if (category.includes('accessory') || category.includes('accessories') ||
        name.includes('cable') || name.includes('mount') || name.includes('case')) return 'accessory';
    if (category.includes('tv') || name.includes('television') || name.includes(' tv')) return 'tv';
    if (category.includes('phone') || name.includes('iphone') || name.includes('galaxy') ||
        name.includes('pixel')) return 'phone';
    if (category.includes('audio') || name.includes('speaker') || name.includes('headphone') ||
        name.includes('soundbar')) return 'audio';

    return 'product';
  }

  // ============================================
  // COMMISSION RECORDING
  // ============================================

  /**
   * Record commission for a completed order
   * @param {number} orderId - The order ID
   * @param {number} salesRepId - The sales rep ID
   * @returns {object} Recorded commission data
   */
  async recordCommission(orderId, salesRepId) {
    // Check if commission already recorded
    const existingCheck = await this.pool.query(`
      SELECT COUNT(*) as count FROM commission_earnings
      WHERE order_id = $1 AND sales_rep_id = $2
    `, [orderId, salesRepId]);

    if (parseInt(existingCheck.rows[0].count) > 0) {
      console.log(`[CommissionService] Commission already recorded for order ${orderId}`);
      return this.getOrderCommissions(orderId);
    }

    // Calculate commission
    const commission = await this.calculateOrderCommission(orderId, salesRepId);

    // Get order date
    const orderResult = await this.pool.query(
      'SELECT created_at FROM unified_orders WHERE id = $1',
      [orderId]
    );
    const orderDate = orderResult.rows[0]?.created_at || new Date();

    // Record each line item commission
    const earnings = [];
    for (const item of commission.breakdown) {
      if (item.commission > 0) {
        const result = await this.pool.query(`
          INSERT INTO commission_earnings (
            sales_rep_id, order_id, line_item_id,
            commission_amount_cents, commission_rate, base_amount_cents,
            rule_id, rule_name, rule_type,
            item_name, item_sku, category_name,
            is_bonus, is_reduced, discount_percent,
            notes, order_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          RETURNING *
        `, [
          salesRepId,
          orderId,
          item.itemId,
          Math.round(item.commission * 100),
          item.rate,
          Math.round(item.saleAmount * 100),
          item.ruleId,
          item.ruleName,
          item.ruleType,
          item.itemName,
          item.sku,
          item.categoryName,
          item.isBonus,
          item.isReduced,
          item.discountPercent,
          commission.notes.join('; '),
          orderDate,
        ]);

        earnings.push(result.rows[0]);
      }
    }

    console.log(`[CommissionService] Recorded ${earnings.length} commission entries for order ${orderId}`);

    return {
      orderId,
      salesRepId,
      totalCommission: commission.totalCommission,
      breakdown: commission.breakdown,
      notes: commission.notes,
      earningsRecorded: earnings.length,
    };
  }

  /**
   * Get commissions recorded for an order
   */
  async getOrderCommissions(orderId) {
    const { rows } = await this.pool.query(`
      SELECT * FROM commission_earnings
      WHERE order_id = $1
      ORDER BY created_at ASC
    `, [orderId]);

    return {
      orderId,
      earnings: rows.map(this.formatEarning),
      totalCommission: rows.reduce((sum, r) => sum + r.commission_amount_cents, 0) / 100,
    };
  }

  // ============================================
  // COMMISSION REPORTS
  // ============================================

  /**
   * Get commission earnings for a sales rep
   * @param {number} repId - Sales rep user ID
   * @param {object} dateRange - { startDate, endDate }
   * @returns {object} Earnings report
   */
  async getRepCommissions(repId, dateRange = {}) {
    const {
      startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      endDate = new Date().toISOString().split('T')[0],
    } = dateRange;

    // Get detailed earnings
    const earningsResult = await this.pool.query(`
      SELECT
        ce.*,
        uo.order_number
      FROM commission_earnings ce
      LEFT JOIN unified_orders uo ON uo.id = ce.order_id
      WHERE ce.sales_rep_id = $1
        AND ce.order_date >= $2
        AND ce.order_date <= $3
      ORDER BY ce.order_date DESC, ce.created_at DESC
    `, [repId, startDate, endDate]);

    // Get summary stats
    const summaryResult = await this.pool.query(`
      SELECT
        COUNT(DISTINCT order_id) AS order_count,
        SUM(base_amount_cents) AS total_sales_cents,
        SUM(commission_amount_cents) AS total_commission_cents,
        SUM(CASE WHEN is_bonus THEN commission_amount_cents ELSE 0 END) AS bonus_commission_cents,
        AVG(commission_rate) AS avg_rate,
        COUNT(CASE WHEN is_bonus THEN 1 END) AS bonus_items,
        COUNT(CASE WHEN is_reduced THEN 1 END) AS reduced_items
      FROM commission_earnings
      WHERE sales_rep_id = $1
        AND order_date >= $2
        AND order_date <= $3
    `, [repId, startDate, endDate]);

    const summary = summaryResult.rows[0];

    // Get daily breakdown
    const dailyResult = await this.pool.query(`
      SELECT
        order_date,
        COUNT(DISTINCT order_id) AS orders,
        SUM(base_amount_cents) AS sales_cents,
        SUM(commission_amount_cents) AS commission_cents
      FROM commission_earnings
      WHERE sales_rep_id = $1
        AND order_date >= $2
        AND order_date <= $3
      GROUP BY order_date
      ORDER BY order_date DESC
    `, [repId, startDate, endDate]);

    // Get rep settings and target progress
    const repSettings = await this.getRepSettings(repId);
    let targetProgress = null;

    if (repSettings?.monthlyTarget) {
      const mtdCommission = parseInt(summary.total_commission_cents) || 0;
      targetProgress = {
        target: repSettings.monthlyTarget,
        earned: mtdCommission / 100,
        percent: (mtdCommission / 100) / repSettings.monthlyTarget * 100,
        remaining: Math.max(0, repSettings.monthlyTarget - mtdCommission / 100),
      };
    }

    return {
      repId,
      dateRange: { startDate, endDate },
      summary: {
        orderCount: parseInt(summary.order_count) || 0,
        totalSales: (parseInt(summary.total_sales_cents) || 0) / 100,
        totalCommission: (parseInt(summary.total_commission_cents) || 0) / 100,
        bonusCommission: (parseInt(summary.bonus_commission_cents) || 0) / 100,
        averageRate: summary.avg_rate ? parseFloat(summary.avg_rate) : 0,
        bonusItems: parseInt(summary.bonus_items) || 0,
        reducedItems: parseInt(summary.reduced_items) || 0,
      },
      targetProgress,
      dailyBreakdown: dailyResult.rows.map(day => ({
        date: day.order_date,
        orders: parseInt(day.orders),
        sales: day.sales_cents / 100,
        commission: day.commission_cents / 100,
      })),
      earnings: earningsResult.rows.map(this.formatEarning),
    };
  }

  /**
   * Get commission summary for logout/shift-close display
   * Returns today + current pay period data in one call
   */
  async getCommissionSummary(repId) {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    // Bi-weekly pay period: 1st-15th and 16th-end
    const dayOfMonth = new Date().getDate();
    const payPeriodStart = dayOfMonth <= 15
      ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
      : new Date(new Date().getFullYear(), new Date().getMonth(), 16).toISOString().split('T')[0];

    // Query both commission_earnings and order_commission_splits
    // commission_earnings tracks per-item commissions from the rules engine
    // order_commission_splits tracks split commissions from POS checkout
    const [todayEarnings, periodEarnings, todaySplits, periodSplits] = await Promise.all([
      // Today from commission_earnings
      this.pool.query(`
        SELECT
          COUNT(DISTINCT order_id) AS order_count,
          COALESCE(SUM(base_amount_cents), 0) AS total_sales_cents,
          COALESCE(SUM(commission_amount_cents), 0) AS total_commission_cents
        FROM commission_earnings
        WHERE sales_rep_id = $1 AND order_date = $2
      `, [repId, today]),

      // Pay period from commission_earnings
      this.pool.query(`
        SELECT
          COUNT(DISTINCT order_id) AS order_count,
          COALESCE(SUM(base_amount_cents), 0) AS total_sales_cents,
          COALESCE(SUM(commission_amount_cents), 0) AS total_commission_cents
        FROM commission_earnings
        WHERE sales_rep_id = $1 AND order_date >= $2 AND order_date <= $3
      `, [repId, payPeriodStart, today]),

      // Today from order_commission_splits
      this.pool.query(`
        SELECT
          COUNT(DISTINCT ocs.transaction_id) AS order_count,
          COALESCE(SUM(t.total_amount * 100), 0) AS total_sales_cents,
          COALESCE(SUM(ocs.commission_amount_cents), 0) AS total_commission_cents
        FROM order_commission_splits ocs
        JOIN transactions t ON t.transaction_id = ocs.transaction_id
        WHERE ocs.user_id = $1 AND ocs.created_at::date = $2::date
      `, [repId, today]),

      // Pay period from order_commission_splits
      this.pool.query(`
        SELECT
          COUNT(DISTINCT ocs.transaction_id) AS order_count,
          COALESCE(SUM(t.total_amount * 100), 0) AS total_sales_cents,
          COALESCE(SUM(ocs.commission_amount_cents), 0) AS total_commission_cents
        FROM order_commission_splits ocs
        JOIN transactions t ON t.transaction_id = ocs.transaction_id
        WHERE ocs.user_id = $1 AND ocs.created_at::date >= $2::date AND ocs.created_at::date <= $3::date
      `, [repId, payPeriodStart, today]),
    ]);

    const te = todayEarnings.rows[0];
    const pe = periodEarnings.rows[0];
    const ts = todaySplits.rows[0];
    const ps = periodSplits.rows[0];

    // Merge: use max order_count to avoid double-counting, sum commissions
    const todayOrderCount = Math.max(parseInt(te.order_count) || 0, parseInt(ts.order_count) || 0);
    const todaySalesCents = Math.max(parseInt(te.total_sales_cents) || 0, parseInt(ts.total_sales_cents) || 0);
    const todayCommCents = (parseInt(te.total_commission_cents) || 0) + (parseInt(ts.total_commission_cents) || 0);

    const periodOrderCount = Math.max(parseInt(pe.order_count) || 0, parseInt(ps.order_count) || 0);
    const periodSalesCents = Math.max(parseInt(pe.total_sales_cents) || 0, parseInt(ps.total_sales_cents) || 0);
    const periodCommCents = (parseInt(pe.total_commission_cents) || 0) + (parseInt(ps.total_commission_cents) || 0);

    // Target progress
    const repSettings = await this.getRepSettings(repId);
    let targetProgress = null;
    if (repSettings?.monthlyTarget) {
      const mtdResult = await this.pool.query(`
        SELECT COALESCE(SUM(commission_amount_cents), 0) AS total
        FROM commission_earnings
        WHERE sales_rep_id = $1 AND order_date >= $2
      `, [repId, monthStart]);
      const mtdCents = parseInt(mtdResult.rows[0].total) || 0;
      targetProgress = {
        targetDollars: repSettings.monthlyTarget,
        earnedDollars: mtdCents / 100,
        percent: Math.round((mtdCents / 100) / repSettings.monthlyTarget * 1000) / 10,
      };
    }

    return {
      today: {
        salesCount: todayOrderCount,
        totalSalesCents: todaySalesCents,
        commissionCents: todayCommCents,
      },
      payPeriod: {
        startDate: payPeriodStart,
        endDate: today,
        salesCount: periodOrderCount,
        totalSalesCents: periodSalesCents,
        commissionCents: periodCommCents,
      },
      targetProgress,
    };
  }

  /**
   * Get MTD sales for a rep (for target calculation)
   */
  async getRepMTDSales(repId) {
    const { rows } = await this.pool.query(`
      SELECT COALESCE(SUM(base_amount_cents), 0) AS total
      FROM commission_earnings
      WHERE sales_rep_id = $1
        AND order_date >= DATE_TRUNC('month', CURRENT_DATE)
    `, [repId]);

    return parseInt(rows[0].total) || 0;
  }

  /**
   * Get commission leaderboard
   */
  async getLeaderboard(period = 'month') {
    let dateFilter;
    switch (period) {
      case 'today':
        dateFilter = 'order_date = CURRENT_DATE';
        break;
      case 'week':
        dateFilter = 'order_date >= DATE_TRUNC(\'week\', CURRENT_DATE)';
        break;
      case 'month':
        dateFilter = 'order_date >= DATE_TRUNC(\'month\', CURRENT_DATE)';
        break;
      case 'quarter':
        dateFilter = 'order_date >= DATE_TRUNC(\'quarter\', CURRENT_DATE)';
        break;
      case 'year':
        dateFilter = 'order_date >= DATE_TRUNC(\'year\', CURRENT_DATE)';
        break;
      default:
        dateFilter = 'order_date >= DATE_TRUNC(\'month\', CURRENT_DATE)';
    }

    const { rows } = await this.pool.query(`
      SELECT
        ce.sales_rep_id,
        u.name AS rep_name,
        COUNT(DISTINCT ce.order_id) AS orders,
        SUM(ce.base_amount_cents) AS sales_cents,
        SUM(ce.commission_amount_cents) AS commission_cents,
        SUM(CASE WHEN ce.is_bonus THEN ce.commission_amount_cents ELSE 0 END) AS bonus_cents,
        AVG(ce.commission_rate) AS avg_rate,
        RANK() OVER (ORDER BY SUM(ce.commission_amount_cents) DESC) AS rank
      FROM commission_earnings ce
      JOIN users u ON u.id = ce.sales_rep_id
      WHERE ${dateFilter}
      GROUP BY ce.sales_rep_id, u.name
      ORDER BY commission_cents DESC
      LIMIT 20
    `);

    return rows.map(row => ({
      rank: parseInt(row.rank),
      repId: row.sales_rep_id,
      repName: row.rep_name,
      orders: parseInt(row.orders),
      sales: row.sales_cents / 100,
      commission: row.commission_cents / 100,
      bonus: row.bonus_cents / 100,
      avgRate: parseFloat(row.avg_rate),
    }));
  }

  /**
   * Get commission stats for admin dashboard
   */
  async getCommissionStats(dateRange = {}) {
    const {
      startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      endDate = new Date().toISOString().split('T')[0],
    } = dateRange;

    // Overall stats
    const statsResult = await this.pool.query(`
      SELECT
        COUNT(DISTINCT sales_rep_id) AS active_reps,
        COUNT(DISTINCT order_id) AS orders,
        SUM(base_amount_cents) AS total_sales_cents,
        SUM(commission_amount_cents) AS total_commission_cents,
        AVG(commission_rate) AS avg_rate
      FROM commission_earnings
      WHERE order_date >= $1 AND order_date <= $2
    `, [startDate, endDate]);

    const stats = statsResult.rows[0];

    // By rule type
    const byTypeResult = await this.pool.query(`
      SELECT
        rule_type,
        COUNT(*) AS count,
        SUM(commission_amount_cents) AS commission_cents
      FROM commission_earnings
      WHERE order_date >= $1 AND order_date <= $2
      GROUP BY rule_type
      ORDER BY commission_cents DESC
    `, [startDate, endDate]);

    return {
      dateRange: { startDate, endDate },
      summary: {
        activeReps: parseInt(stats.active_reps) || 0,
        orders: parseInt(stats.orders) || 0,
        totalSales: (parseInt(stats.total_sales_cents) || 0) / 100,
        totalCommission: (parseInt(stats.total_commission_cents) || 0) / 100,
        avgRate: stats.avg_rate ? parseFloat(stats.avg_rate) : 0,
        effectiveRate: stats.total_sales_cents > 0
          ? (parseInt(stats.total_commission_cents) / parseInt(stats.total_sales_cents))
          : 0,
      },
      byRuleType: byTypeResult.rows.map(row => ({
        ruleType: row.rule_type || 'flat',
        count: parseInt(row.count),
        commission: row.commission_cents / 100,
      })),
    };
  }

  // ============================================
  // RULE MANAGEMENT
  // ============================================

  /**
   * Create a new commission rule
   */
  async createRule(ruleData) {
    const {
      ruleName,
      ruleType,
      description,
      rate,
      minThreshold,
      maxThreshold,
      categoryId,
      productType,
      appliesToDiscounted = true,
      discountThreshold = 0.2,
      discountedRate,
      isBonus = false,
      bonusFlatCents,
      priority = 100,
      isActive = true,
      createdBy,
    } = ruleData;

    const { rows } = await this.pool.query(`
      INSERT INTO commission_rules (
        rule_name, rule_type, description, rate,
        min_threshold_cents, max_threshold_cents,
        category_id, product_type,
        applies_to_discounted, discount_threshold, discounted_rate,
        is_bonus, bonus_flat_cents,
        priority, is_active, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      ruleName,
      ruleType,
      description,
      rate,
      minThreshold ? Math.round(minThreshold * 100) : 0,
      maxThreshold ? Math.round(maxThreshold * 100) : null,
      categoryId,
      productType,
      appliesToDiscounted,
      discountThreshold,
      discountedRate,
      isBonus,
      bonusFlatCents,
      priority,
      isActive,
      createdBy,
    ]);

    // Invalidate cache
    if (this.cache) {
      this.cache.del('commission:rules:active');
    }

    return this.formatRule(rows[0]);
  }

  /**
   * Update a commission rule
   */
  async updateRule(ruleId, updates) {
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    const fieldMapping = {
      ruleName: 'rule_name',
      description: 'description',
      rate: 'rate',
      appliesToDiscounted: 'applies_to_discounted',
      discountThreshold: 'discount_threshold',
      discountedRate: 'discounted_rate',
      priority: 'priority',
      isActive: 'is_active',
    };

    for (const [key, value] of Object.entries(updates)) {
      if (fieldMapping[key] && value !== undefined) {
        setClauses.push(`${fieldMapping[key]} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updates.minThreshold !== undefined) {
      setClauses.push(`min_threshold_cents = $${paramIndex}`);
      values.push(updates.minThreshold ? Math.round(updates.minThreshold * 100) : 0);
      paramIndex++;
    }

    if (updates.maxThreshold !== undefined) {
      setClauses.push(`max_threshold_cents = $${paramIndex}`);
      values.push(updates.maxThreshold ? Math.round(updates.maxThreshold * 100) : null);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(ruleId);

    const { rows } = await this.pool.query(`
      UPDATE commission_rules
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    // Invalidate cache
    if (this.cache) {
      this.cache.del('commission:rules:active');
    }

    return rows[0] ? this.formatRule(rows[0]) : null;
  }

  /**
   * Delete (deactivate) a commission rule
   */
  async deleteRule(ruleId) {
    await this.pool.query(`
      UPDATE commission_rules SET is_active = false, updated_at = NOW()
      WHERE id = $1
    `, [ruleId]);

    // Invalidate cache
    if (this.cache) {
      this.cache.del('commission:rules:active');
    }

    return { success: true };
  }

  // ============================================
  // TEAM REPORTING (Manager View)
  // ============================================

  /**
   * Get commission summary for all reps (manager view)
   * @param {object} dateRange - { startDate, endDate }
   * @returns {object} Team commission summary
   */
  async getTeamCommissions(dateRange = {}) {
    const {
      startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      endDate = new Date().toISOString().split('T')[0],
    } = dateRange;

    // Get all reps with their commission totals
    const repsResult = await this.pool.query(`
      SELECT
        u.id AS rep_id,
        u.name AS rep_name,
        u.email,
        u.role,
        COUNT(DISTINCT ce.order_id) AS order_count,
        SUM(ce.base_amount_cents) AS total_sales_cents,
        SUM(ce.commission_amount_cents) AS total_commission_cents,
        SUM(CASE WHEN ce.is_bonus THEN ce.commission_amount_cents ELSE 0 END) AS bonus_cents,
        AVG(ce.commission_rate) AS avg_rate,
        COUNT(CASE WHEN ce.is_bonus THEN 1 END) AS bonus_items
      FROM users u
      LEFT JOIN commission_earnings ce ON ce.sales_rep_id = u.id
        AND ce.order_date >= $1
        AND ce.order_date <= $2
      WHERE u.role IN ('sales', 'cashier', 'manager', 'admin')
      GROUP BY u.id, u.name, u.email, u.role
      HAVING COUNT(ce.id) > 0 OR u.role IN ('sales', 'cashier')
      ORDER BY SUM(ce.commission_amount_cents) DESC NULLS LAST
    `, [startDate, endDate]);

    // Calculate team totals
    const teamTotals = {
      totalReps: 0,
      activeReps: 0,
      totalOrders: 0,
      totalSales: 0,
      totalCommission: 0,
      totalBonus: 0,
      avgCommissionPerRep: 0,
      avgCommissionPerOrder: 0,
    };

    const reps = repsResult.rows.map(row => {
      const rep = {
        repId: row.rep_id,
        repName: row.rep_name,
        email: row.email,
        role: row.role,
        orderCount: parseInt(row.order_count) || 0,
        totalSales: (parseInt(row.total_sales_cents) || 0) / 100,
        totalCommission: (parseInt(row.total_commission_cents) || 0) / 100,
        bonusCommission: (parseInt(row.bonus_cents) || 0) / 100,
        avgRate: row.avg_rate ? parseFloat(row.avg_rate) : 0,
        bonusItems: parseInt(row.bonus_items) || 0,
        avgPerOrder: 0,
      };

      if (rep.orderCount > 0) {
        rep.avgPerOrder = rep.totalCommission / rep.orderCount;
        teamTotals.activeReps++;
      }

      teamTotals.totalReps++;
      teamTotals.totalOrders += rep.orderCount;
      teamTotals.totalSales += rep.totalSales;
      teamTotals.totalCommission += rep.totalCommission;
      teamTotals.totalBonus += rep.bonusCommission;

      return rep;
    });

    if (teamTotals.activeReps > 0) {
      teamTotals.avgCommissionPerRep = teamTotals.totalCommission / teamTotals.activeReps;
    }
    if (teamTotals.totalOrders > 0) {
      teamTotals.avgCommissionPerOrder = teamTotals.totalCommission / teamTotals.totalOrders;
    }

    return {
      dateRange: { startDate, endDate },
      teamTotals,
      reps,
    };
  }

  /**
   * Get detailed commission data for a specific rep (manager view)
   */
  async getRepDetailedCommissions(repId, dateRange = {}) {
    const report = await this.getRepCommissions(repId, dateRange);

    // Get rep info
    const repResult = await this.pool.query(
      'SELECT id, name, email, role FROM users WHERE id = $1',
      [repId]
    );

    const repInfo = repResult.rows[0] || {};

    // Get comparison data (previous period)
    const { startDate, endDate } = report.dateRange || dateRange;
    const daysDiff = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));

    const prevEndDate = new Date(startDate);
    prevEndDate.setDate(prevEndDate.getDate() - 1);
    const prevStartDate = new Date(prevEndDate);
    prevStartDate.setDate(prevStartDate.getDate() - daysDiff);

    const prevReport = await this.getRepCommissions(repId, {
      startDate: prevStartDate.toISOString().split('T')[0],
      endDate: prevEndDate.toISOString().split('T')[0],
    });

    return {
      ...report,
      repInfo: {
        id: repInfo.id,
        name: repInfo.name,
        email: repInfo.email,
        role: repInfo.role,
      },
      comparison: {
        previousPeriod: {
          startDate: prevStartDate.toISOString().split('T')[0],
          endDate: prevEndDate.toISOString().split('T')[0],
          summary: prevReport.summary,
        },
        changes: {
          commission: report.summary.totalCommission - (prevReport.summary?.totalCommission || 0),
          orders: report.summary.orderCount - (prevReport.summary?.orderCount || 0),
          sales: report.summary.totalSales - (prevReport.summary?.totalSales || 0),
        },
      },
    };
  }

  // ============================================
  // PAYROLL / PAYOUT MANAGEMENT
  // ============================================

  /**
   * Get commission period summary for payroll
   */
  async getPayrollSummary(periodStart, periodEnd) {
    const { rows } = await this.pool.query(`
      SELECT
        ce.sales_rep_id,
        u.name AS rep_name,
        u.email,
        SUM(ce.commission_amount_cents) AS gross_commission_cents,
        COUNT(DISTINCT ce.order_id) AS order_count,
        SUM(ce.base_amount_cents) AS total_sales_cents
      FROM commission_earnings ce
      JOIN users u ON u.id = ce.sales_rep_id
      WHERE ce.order_date >= $1 AND ce.order_date <= $2
      GROUP BY ce.sales_rep_id, u.name, u.email
      ORDER BY SUM(ce.commission_amount_cents) DESC
    `, [periodStart, periodEnd]);

    return rows.map(row => ({
      repId: row.sales_rep_id,
      repName: row.rep_name,
      email: row.email,
      grossCommission: row.gross_commission_cents / 100,
      orderCount: parseInt(row.order_count),
      totalSales: row.total_sales_cents / 100,
    }));
  }

  /**
   * Create a payout record for a rep
   */
  async createPayout(repId, periodStart, periodEnd, adjustmentsCents = 0, notes = '') {
    // Calculate gross commission
    const summaryResult = await this.pool.query(`
      SELECT
        COALESCE(SUM(commission_amount_cents), 0) AS gross_cents
      FROM commission_earnings
      WHERE sales_rep_id = $1
        AND order_date >= $2
        AND order_date <= $3
    `, [repId, periodStart, periodEnd]);

    const grossCents = parseInt(summaryResult.rows[0].gross_cents) || 0;
    const netCents = grossCents + adjustmentsCents;

    const { rows } = await this.pool.query(`
      INSERT INTO commission_payouts (
        sales_rep_id, payout_period_start, payout_period_end,
        gross_commission_cents, adjustments_cents, net_commission_cents,
        status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
      RETURNING *
    `, [repId, periodStart, periodEnd, grossCents, adjustmentsCents, netCents, notes]);

    // Link earnings to payout
    const payout = rows[0];
    await this.pool.query(`
      INSERT INTO commission_payout_items (payout_id, earning_id)
      SELECT $1, id FROM commission_earnings
      WHERE sales_rep_id = $2
        AND order_date >= $3
        AND order_date <= $4
    `, [payout.id, repId, periodStart, periodEnd]);

    return {
      id: payout.id,
      repId: payout.sales_rep_id,
      periodStart: payout.payout_period_start,
      periodEnd: payout.payout_period_end,
      grossCommission: payout.gross_commission_cents / 100,
      adjustments: payout.adjustments_cents / 100,
      netCommission: payout.net_commission_cents / 100,
      status: payout.status,
      notes: payout.notes,
    };
  }

  /**
   * Approve a payout (manager action)
   */
  async approvePayout(payoutId, approverId) {
    const { rows } = await this.pool.query(`
      UPDATE commission_payouts
      SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 'pending'
      RETURNING *
    `, [payoutId, approverId]);

    return rows[0] ? this.formatPayout(rows[0]) : null;
  }

  /**
   * Mark payout as paid
   */
  async markPayoutPaid(payoutId, paymentReference = '') {
    const { rows } = await this.pool.query(`
      UPDATE commission_payouts
      SET status = 'paid', paid_at = NOW(), payment_reference = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'approved'
      RETURNING *
    `, [payoutId, paymentReference]);

    return rows[0] ? this.formatPayout(rows[0]) : null;
  }

  /**
   * Get pending payouts
   */
  async getPendingPayouts() {
    const { rows } = await this.pool.query(`
      SELECT cp.*, u.name AS rep_name, u.email
      FROM commission_payouts cp
      JOIN users u ON u.id = cp.sales_rep_id
      WHERE cp.status IN ('pending', 'approved')
      ORDER BY cp.created_at DESC
    `);

    return rows.map(this.formatPayout);
  }

  /**
   * Add adjustment to earnings (e.g., chargeback for return)
   */
  async addAdjustment(orderId, repId, adjustmentCents, reason) {
    // Record negative commission as adjustment
    const { rows } = await this.pool.query(`
      INSERT INTO commission_earnings (
        sales_rep_id, order_id,
        commission_amount_cents, commission_rate, base_amount_cents,
        rule_name, rule_type,
        item_name, notes, order_date
      ) VALUES ($1, $2, $3, 0, 0, 'Adjustment', 'adjustment', $4, $5, CURRENT_DATE)
      RETURNING *
    `, [repId, orderId, adjustmentCents, reason, `Adjustment: ${reason}`]);

    return this.formatEarning(rows[0]);
  }

  // ============================================
  // CSV EXPORT
  // ============================================

  /**
   * Generate CSV data for commission export
   */
  async generateCSVExport(options = {}) {
    const {
      repId,
      startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      endDate = new Date().toISOString().split('T')[0],
      includeDetails = true,
    } = options;

    let query = `
      SELECT
        ce.order_date,
        uo.order_number,
        u.name AS rep_name,
        ce.item_name,
        ce.item_sku,
        ce.category_name,
        ce.base_amount_cents,
        ce.commission_rate,
        ce.commission_amount_cents,
        ce.rule_name,
        ce.is_bonus,
        ce.is_reduced,
        ce.notes
      FROM commission_earnings ce
      JOIN users u ON u.id = ce.sales_rep_id
      LEFT JOIN unified_orders uo ON uo.id = ce.order_id
      WHERE ce.order_date >= $1 AND ce.order_date <= $2
    `;

    const params = [startDate, endDate];

    if (repId) {
      query += ` AND ce.sales_rep_id = $3`;
      params.push(repId);
    }

    query += ` ORDER BY ce.order_date DESC, ce.created_at DESC`;

    const { rows } = await this.pool.query(query, params);

    // Generate CSV header
    const headers = [
      'Date',
      'Order #',
      'Sales Rep',
      'Item',
      'SKU',
      'Category',
      'Sale Amount',
      'Rate',
      'Commission',
      'Rule',
      'Bonus',
      'Reduced',
      'Notes',
    ];

    // Generate CSV rows
    const csvRows = rows.map(row => [
      row.order_date ? new Date(row.order_date).toISOString().split('T')[0] : '',
      row.order_number || '',
      row.rep_name || '',
      row.item_name || '',
      row.item_sku || '',
      row.category_name || '',
      (row.base_amount_cents / 100).toFixed(2),
      (parseFloat(row.commission_rate) * 100).toFixed(2) + '%',
      (row.commission_amount_cents / 100).toFixed(2),
      row.rule_name || '',
      row.is_bonus ? 'Yes' : 'No',
      row.is_reduced ? 'Yes' : 'No',
      row.notes || '',
    ]);

    // Build CSV string
    const csvContent = [
      headers.join(','),
      ...csvRows.map(row =>
        row.map(cell => {
          // Escape quotes and wrap in quotes if contains comma
          const str = String(cell).replace(/"/g, '""');
          return str.includes(',') || str.includes('"') ? `"${str}"` : str;
        }).join(',')
      ),
    ].join('\n');

    return {
      filename: `commissions_${startDate}_to_${endDate}${repId ? `_rep${repId}` : ''}.csv`,
      content: csvContent,
      rowCount: rows.length,
    };
  }

  formatPayout(row) {
    return {
      id: row.id,
      repId: row.sales_rep_id,
      repName: row.rep_name,
      email: row.email,
      periodStart: row.payout_period_start,
      periodEnd: row.payout_period_end,
      grossCommission: row.gross_commission_cents / 100,
      adjustments: row.adjustments_cents / 100,
      netCommission: row.net_commission_cents / 100,
      status: row.status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      paidAt: row.paid_at,
      paymentReference: row.payment_reference,
      notes: row.notes,
      createdAt: row.created_at,
    };
  }

  // ============================================
  // FORMATTERS
  // ============================================

  formatRule(row) {
    return {
      id: row.id,
      ruleName: row.rule_name,
      ruleType: row.rule_type,
      description: row.description,
      rate: parseFloat(row.rate),
      ratePercent: `${(parseFloat(row.rate) * 100).toFixed(2)}%`,
      minThresholdCents: row.min_threshold_cents,
      maxThresholdCents: row.max_threshold_cents,
      minThreshold: row.min_threshold_cents ? row.min_threshold_cents / 100 : 0,
      maxThreshold: row.max_threshold_cents ? row.max_threshold_cents / 100 : null,
      categoryId: row.category_id,
      categoryName: row.category_name,
      productType: row.product_type,
      appliesToDiscounted: row.applies_to_discounted,
      discountThreshold: row.discount_threshold ? parseFloat(row.discount_threshold) : 0.2,
      discountedRate: row.discounted_rate ? parseFloat(row.discounted_rate) : null,
      isBonus: row.is_bonus,
      bonusFlatCents: row.bonus_flat_cents,
      priority: row.priority,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  formatEarning(row) {
    return {
      id: row.id,
      salesRepId: row.sales_rep_id,
      orderId: row.order_id,
      orderNumber: row.order_number,
      lineItemId: row.line_item_id,
      commission: row.commission_amount_cents / 100,
      commissionCents: row.commission_amount_cents,
      rate: parseFloat(row.commission_rate),
      ratePercent: `${(parseFloat(row.commission_rate) * 100).toFixed(2)}%`,
      baseAmount: row.base_amount_cents / 100,
      baseAmountCents: row.base_amount_cents,
      ruleId: row.rule_id,
      ruleName: row.rule_name,
      ruleType: row.rule_type,
      itemName: row.item_name,
      itemSku: row.item_sku,
      categoryName: row.category_name,
      isBonus: row.is_bonus,
      isReduced: row.is_reduced,
      discountPercent: row.discount_percent ? parseFloat(row.discount_percent) : 0,
      notes: row.notes,
      orderDate: row.order_date,
      createdAt: row.created_at,
    };
  }
}

module.exports = CommissionService;
