/**
 * TeleTime - Hub Commission Service
 * Calculates, tracks, and manages commissions on unified orders.
 */

const { ApiError } = require('../middleware/errorHandler');

class HubCommissionService {
  constructor(pool) {
    this.pool = pool;
  }

  // ==========================================================================
  // COMMISSION CALCULATION
  // ==========================================================================

  /**
   * Calculate and record commission for an order.
   * @param {number} orderId
   * @param {number} userId - Sales rep
   * @param {number} splitPercentage - 0-100
   * @returns {Object} created order_commission record
   */
  async calculateAndCreate(orderId, userId, splitPercentage = 100) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check for existing commission on this order+user
      const existing = await client.query(
        `SELECT id FROM order_commissions WHERE order_id = $1 AND user_id = $2`,
        [orderId, userId]
      );
      if (existing.rows.length > 0) {
        throw ApiError.badRequest('Commission already exists for this user on this order');
      }

      // Load order
      const orderResult = await client.query(
        `SELECT id, order_number, total_cents, subtotal_cents, tax_cents, status
         FROM unified_orders WHERE id = $1`,
        [orderId]
      );
      if (orderResult.rows.length === 0) {
        throw ApiError.notFound('Order');
      }
      const order = orderResult.rows[0];

      // Load order items with product details
      const itemsResult = await client.query(
        `SELECT uoi.id, uoi.product_id, uoi.product_name, uoi.manufacturer,
                uoi.quantity, uoi.unit_price_cents, uoi.unit_cost_cents,
                uoi.line_total_cents,
                p.category_id
         FROM unified_order_items uoi
         LEFT JOIN products p ON p.id = uoi.product_id
         WHERE uoi.order_id = $1`,
        [orderId]
      );

      let totalCommission = 0;
      const itemBreakdowns = [];

      for (const item of itemsResult.rows) {
        const rule = await this._findCommissionRule(
          client, item.product_id, item.category_id, item.manufacturer
        );

        if (!rule) continue;

        const itemAmount = item.line_total_cents;
        const marginPercent = this._calculateMarginPercent(item);

        // Check minimum sale amount
        if (rule.min_sale_amount && itemAmount < rule.min_sale_amount) continue;

        // Check minimum margin
        if (rule.min_margin_percent && marginPercent < parseFloat(rule.min_margin_percent)) continue;

        let itemCommission = 0;
        let appliedRate = 0;

        if (rule.commission_type === 'percentage') {
          appliedRate = parseFloat(rule.commission_value);
          itemCommission = Math.round(itemAmount * (appliedRate / 100));
        } else if (rule.commission_type === 'flat') {
          appliedRate = 0;
          itemCommission = Math.round(parseFloat(rule.commission_value) * 100) * item.quantity;
        } else if (rule.commission_type === 'tiered' && rule.tier_rules) {
          const tiers = Array.isArray(rule.tier_rules) ? rule.tier_rules : [];
          const tier = tiers.find(
            t => marginPercent >= t.min_margin && (t.max_margin == null || marginPercent < t.max_margin)
          );
          if (tier) {
            appliedRate = tier.commission;
            itemCommission = Math.round(itemAmount * (tier.commission / 100));
          }
        }

        if (itemCommission > 0) {
          totalCommission += itemCommission;
          itemBreakdowns.push({
            orderItemId: item.id,
            ruleId: rule.id,
            productName: item.product_name,
            quantity: item.quantity,
            itemAmountCents: itemAmount,
            marginPercent,
            commissionRate: appliedRate,
            commissionAmountCents: itemCommission,
          });
        }
      }

      // Apply split
      const finalCommission = Math.round(totalCommission * (splitPercentage / 100));
      const saleAmount = Math.round(order.subtotal_cents * (splitPercentage / 100));
      const avgRate = itemBreakdowns.length > 0
        ? itemBreakdowns.reduce((sum, i) => sum + i.commissionRate, 0) / itemBreakdowns.length
        : 0;

      // Insert order_commission
      const commResult = await client.query(
        `INSERT INTO order_commissions (
          order_id, user_id, split_percentage,
          sale_amount, commission_base, commission_rate, commission_amount
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [orderId, userId, splitPercentage, saleAmount, order.subtotal_cents, avgRate, finalCommission]
      );
      const commission = commResult.rows[0];

      // Insert line-item breakdowns
      for (const breakdown of itemBreakdowns) {
        await client.query(
          `INSERT INTO order_commission_items (
            commission_id, order_item_id, rule_id,
            product_name, quantity,
            item_amount_cents, margin_percent, commission_rate, commission_amount_cents
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            commission.id, breakdown.orderItemId, breakdown.ruleId,
            breakdown.productName, breakdown.quantity,
            breakdown.itemAmountCents, breakdown.marginPercent,
            breakdown.commissionRate,
            Math.round(breakdown.commissionAmountCents * (splitPercentage / 100)),
          ]
        );
      }

      await client.query('COMMIT');

      return this.getById(commission.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate and create commissions for multiple users with split percentages.
   * Validates that splits sum to 100%.
   * @param {number} orderId
   * @param {Array<{userId: number, splitPercentage: number}>} splits
   * @returns {Array} created order_commission records
   */
  async calculateSplitCommissions(orderId, splits) {
    // Validate splits sum to 100
    const totalSplit = splits.reduce((sum, s) => sum + s.splitPercentage, 0);
    if (Math.abs(totalSplit - 100) > 0.01) {
      throw ApiError.badRequest(
        `Split percentages must sum to 100%. Current total: ${totalSplit}%`
      );
    }

    // Check for duplicate users
    const userIds = splits.map(s => s.userId);
    if (new Set(userIds).size !== userIds.length) {
      throw ApiError.badRequest('Duplicate user IDs in splits');
    }

    // Check no existing commissions on this order
    const existing = await this.pool.query(
      'SELECT id FROM order_commissions WHERE order_id = $1',
      [orderId]
    );
    if (existing.rows.length > 0) {
      throw ApiError.badRequest(
        'Commissions already exist for this order. Delete existing commissions first or use recalculate.'
      );
    }

    const results = [];
    for (const split of splits) {
      const commission = await this.calculateAndCreate(orderId, split.userId, split.splitPercentage);
      results.push(commission);
    }

    return results;
  }

  /**
   * Recalculate commission for an existing record (e.g., after order modification).
   */
  async recalculate(commissionId, userId) {
    const existing = await this.getById(commissionId);
    if (!existing) throw ApiError.notFound('Commission');

    if (existing.status === 'paid') {
      throw ApiError.badRequest('Cannot recalculate a paid commission');
    }

    // Delete old record and recreate
    await this.pool.query('DELETE FROM order_commissions WHERE id = $1', [commissionId]);

    return this.calculateAndCreate(existing.orderId, existing.userId, existing.splitPercentage);
  }

  // ==========================================================================
  // RULE LOOKUP
  // ==========================================================================

  /**
   * Find the most specific active commission rule for an item.
   * Priority: product > category > manufacturer > all (then by priority DESC)
   */
  async _findCommissionRule(client, productId, categoryId, manufacturer) {
    const now = new Date().toISOString().split('T')[0];

    const result = await client.query(
      `SELECT * FROM hub_commission_rules
       WHERE is_active = true
         AND (effective_from IS NULL OR effective_from <= $1)
         AND (effective_to IS NULL OR effective_to >= $1)
         AND (
           (applies_to = 'product' AND product_id = $2)
           OR (applies_to = 'category' AND category_id = $3)
           OR (applies_to = 'manufacturer' AND manufacturer = $4)
           OR (applies_to = 'all')
         )
       ORDER BY
         CASE applies_to
           WHEN 'product' THEN 4
           WHEN 'category' THEN 3
           WHEN 'manufacturer' THEN 2
           WHEN 'all' THEN 1
         END DESC,
         priority DESC
       LIMIT 1`,
      [now, productId, categoryId, manufacturer]
    );

    return result.rows[0] || null;
  }

  /**
   * Calculate margin percentage for an order item.
   */
  _calculateMarginPercent(item) {
    if (!item.unit_cost_cents || item.unit_cost_cents === 0) return 0;
    if (!item.unit_price_cents || item.unit_price_cents === 0) return 0;
    return ((item.unit_price_cents - item.unit_cost_cents) / item.unit_price_cents) * 100;
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  async getById(id) {
    const result = await this.pool.query(
      `SELECT oc.*,
              u.name AS rep_name,
              uo.order_number,
              au.name AS approved_by_name,
              aju.name AS adjusted_by_name
       FROM order_commissions oc
       JOIN users u ON u.id = oc.user_id
       JOIN unified_orders uo ON uo.id = oc.order_id
       LEFT JOIN users au ON au.id = oc.approved_by
       LEFT JOIN users aju ON aju.id = oc.adjusted_by
       WHERE oc.id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    // Fetch item breakdowns
    const itemsResult = await this.pool.query(
      `SELECT oci.*, hcr.name AS rule_name
       FROM order_commission_items oci
       LEFT JOIN hub_commission_rules hcr ON hcr.id = oci.rule_id
       WHERE oci.commission_id = $1
       ORDER BY oci.id`,
      [id]
    );

    return {
      ...this._mapRow(row),
      items: itemsResult.rows.map(i => ({
        id: i.id,
        orderItemId: i.order_item_id,
        ruleId: i.rule_id,
        ruleName: i.rule_name,
        productName: i.product_name,
        quantity: i.quantity,
        itemAmountCents: i.item_amount_cents,
        itemAmount: i.item_amount_cents / 100,
        marginPercent: parseFloat(i.margin_percent || 0),
        commissionRate: parseFloat(i.commission_rate || 0),
        commissionAmountCents: i.commission_amount_cents,
        commissionAmount: i.commission_amount_cents / 100,
      })),
    };
  }

  async getByOrderId(orderId) {
    const result = await this.pool.query(
      `SELECT oc.*, u.name AS rep_name
       FROM order_commissions oc
       JOIN users u ON u.id = oc.user_id
       WHERE oc.order_id = $1
       ORDER BY oc.split_percentage DESC`,
      [orderId]
    );
    return result.rows.map(row => this._mapRow(row));
  }

  async getByUserId(userId, filters = {}) {
    const conditions = ['oc.user_id = $1'];
    const values = [userId];
    let paramIndex = 2;

    if (filters.status) {
      conditions.push(`oc.status = $${paramIndex++}`);
      values.push(filters.status);
    }
    if (filters.period) {
      conditions.push(`TO_CHAR(oc.created_at, 'YYYY-MM') = $${paramIndex++}`);
      values.push(filters.period);
    }
    if (filters.dateFrom) {
      conditions.push(`oc.created_at >= $${paramIndex++}`);
      values.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push(`oc.created_at <= $${paramIndex++}::date + INTERVAL '1 day'`);
      values.push(filters.dateTo);
    }

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 100);
    const offset = (page - 1) * limit;

    const countResult = await this.pool.query(
      `SELECT COUNT(*)::INTEGER AS total FROM order_commissions oc WHERE ${conditions.join(' AND ')}`,
      values
    );
    const total = countResult.rows[0].total;

    values.push(limit, offset);
    const result = await this.pool.query(
      `SELECT oc.*, u.name AS rep_name, uo.order_number
       FROM order_commissions oc
       JOIN users u ON u.id = oc.user_id
       JOIN unified_orders uo ON uo.id = oc.order_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY oc.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      values
    );

    return {
      data: result.rows.map(row => this._mapRow(row)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get summary for a user in a given period.
   */
  async getUserSummary(userId, period) {
    const result = await this.pool.query(
      `SELECT
         COUNT(*)::INTEGER AS order_count,
         SUM(sale_amount) AS total_sales_cents,
         SUM(COALESCE(adjusted_amount, commission_amount)) AS total_commission_cents,
         AVG(commission_rate) AS avg_rate,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
         COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
         COUNT(*) FILTER (WHERE status = 'paid') AS paid_count
       FROM order_commissions
       WHERE user_id = $1
         AND TO_CHAR(created_at, 'YYYY-MM') = $2
         AND status != 'cancelled'`,
      [userId, period]
    );

    const row = result.rows[0];
    return {
      period,
      orderCount: row.order_count,
      totalSalesCents: parseInt(row.total_sales_cents || 0),
      totalSales: parseInt(row.total_sales_cents || 0) / 100,
      totalCommissionCents: parseInt(row.total_commission_cents || 0),
      totalCommission: parseInt(row.total_commission_cents || 0) / 100,
      avgRate: parseFloat(row.avg_rate || 0),
      pendingCount: row.pending_count,
      approvedCount: row.approved_count,
      paidCount: row.paid_count,
    };
  }

  /**
   * Get commission summary for a user using named periods.
   * @param {number} userId
   * @param {string} period - 'today', 'week', 'month', 'pay_period', 'custom', or 'YYYY-MM'
   * @param {Object} opts - { dateFrom, dateTo } for custom period
   */
  async getUserPeriodSummary(userId, period, opts = {}) {
    let dateCondition;
    let dateParams = [userId];
    let paramIndex = 2;

    switch (period) {
      case 'today':
        dateCondition = `oc.created_at >= CURRENT_DATE AND oc.created_at < CURRENT_DATE + INTERVAL '1 day'`;
        break;
      case 'week':
        dateCondition = `oc.created_at >= DATE_TRUNC('week', CURRENT_DATE) AND oc.created_at < DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days'`;
        break;
      case 'month':
        dateCondition = `oc.created_at >= DATE_TRUNC('month', CURRENT_DATE) AND oc.created_at < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'`;
        break;
      case 'pay_period': {
        // Bi-weekly pay period: 1st-15th and 16th-end of month
        const today = new Date();
        const day = today.getDate();
        if (day <= 15) {
          dateCondition = `oc.created_at >= DATE_TRUNC('month', CURRENT_DATE) AND oc.created_at < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '15 days'`;
        } else {
          dateCondition = `oc.created_at >= DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '15 days' AND oc.created_at < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'`;
        }
        break;
      }
      case 'custom':
        if (!opts.dateFrom || !opts.dateTo) {
          throw ApiError.badRequest('date_from and date_to required for custom period');
        }
        dateCondition = `oc.created_at >= $${paramIndex}::date AND oc.created_at < $${paramIndex + 1}::date + INTERVAL '1 day'`;
        dateParams.push(opts.dateFrom, opts.dateTo);
        paramIndex += 2;
        break;
      default:
        // Treat as YYYY-MM
        dateCondition = `TO_CHAR(oc.created_at, 'YYYY-MM') = $${paramIndex}`;
        dateParams.push(period);
        paramIndex++;
        break;
    }

    const result = await this.pool.query(
      `SELECT
         COUNT(*)::INTEGER AS sales_count,
         COALESCE(SUM(oc.sale_amount), 0)::BIGINT AS total_sales_amount_cents,
         COALESCE(SUM(COALESCE(oc.adjusted_amount, oc.commission_amount)), 0)::BIGINT AS total_commission_cents,
         COALESCE(SUM(CASE WHEN oc.status = 'pending' THEN COALESCE(oc.adjusted_amount, oc.commission_amount) ELSE 0 END), 0)::BIGINT AS pending_commission_cents,
         COALESCE(SUM(CASE WHEN oc.status = 'approved' THEN COALESCE(oc.adjusted_amount, oc.commission_amount) ELSE 0 END), 0)::BIGINT AS approved_commission_cents,
         COALESCE(SUM(CASE WHEN oc.status = 'paid' THEN COALESCE(oc.adjusted_amount, oc.commission_amount) ELSE 0 END), 0)::BIGINT AS paid_commission_cents
       FROM order_commissions oc
       WHERE oc.user_id = $1
         AND oc.status != 'cancelled'
         AND ${dateCondition}`,
      dateParams
    );

    const row = result.rows[0];
    return {
      period,
      salesCount: row.sales_count,
      totalSalesAmount: parseInt(row.total_sales_amount_cents) / 100,
      totalSalesAmountCents: parseInt(row.total_sales_amount_cents),
      totalCommission: parseInt(row.total_commission_cents) / 100,
      totalCommissionCents: parseInt(row.total_commission_cents),
      pendingCommission: parseInt(row.pending_commission_cents) / 100,
      pendingCommissionCents: parseInt(row.pending_commission_cents),
      approvedCommission: parseInt(row.approved_commission_cents) / 100,
      approvedCommissionCents: parseInt(row.approved_commission_cents),
      paidCommission: parseInt(row.paid_commission_cents) / 100,
      paidCommissionCents: parseInt(row.paid_commission_cents),
    };
  }

  /**
   * Get commissions pending approval with filters and pagination.
   */
  async getPendingApproval(filters = {}) {
    const conditions = ["oc.status = 'pending'"];
    const values = [];
    let paramIndex = 1;

    if (filters.userId) {
      conditions.push(`oc.user_id = $${paramIndex++}`);
      values.push(filters.userId);
    }
    if (filters.dateFrom) {
      conditions.push(`oc.created_at >= $${paramIndex++}`);
      values.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push(`oc.created_at <= $${paramIndex++}::date + INTERVAL '1 day'`);
      values.push(filters.dateTo);
    }
    if (filters.minAmount) {
      conditions.push(`oc.commission_amount >= $${paramIndex++}`);
      values.push(filters.minAmount);
    }

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 100);
    const offset = (page - 1) * limit;

    const countResult = await this.pool.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM order_commissions oc
       WHERE ${conditions.join(' AND ')}`,
      values
    );
    const total = countResult.rows[0].total;

    values.push(limit, offset);
    const result = await this.pool.query(
      `SELECT oc.*,
              u.name AS rep_name,
              uo.order_number,
              uo.total_cents AS order_total_cents,
              uo.created_at AS order_date,
              c.name AS customer_name
       FROM order_commissions oc
       JOIN users u ON u.id = oc.user_id
       JOIN unified_orders uo ON uo.id = oc.order_id
       LEFT JOIN customers c ON c.id = uo.customer_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY oc.created_at ASC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      values
    );

    return {
      data: result.rows.map(row => ({
        ...this._mapRow(row),
        orderTotalCents: row.order_total_cents,
        orderTotal: row.order_total_cents / 100,
        orderDate: row.order_date,
        customerName: row.customer_name,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ==========================================================================
  // STATUS TRANSITIONS
  // ==========================================================================

  async approve(commissionId, approvedByUserId) {
    const result = await this.pool.query(
      `UPDATE order_commissions
       SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [approvedByUserId, commissionId]
    );
    if (result.rows.length === 0) {
      throw ApiError.badRequest('Commission not found or not in pending status');
    }
    return this.getById(commissionId);
  }

  async bulkApprove(commissionIds, approvedByUserId) {
    const result = await this.pool.query(
      `UPDATE order_commissions
       SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
       WHERE id = ANY($2) AND status = 'pending'
       RETURNING id`,
      [approvedByUserId, commissionIds]
    );
    return { approvedCount: result.rows.length, approvedIds: result.rows.map(r => r.id) };
  }

  async adjust(commissionId, adjustedAmount, reason, adjustedByUserId) {
    const result = await this.pool.query(
      `UPDATE order_commissions
       SET status = 'adjusted',
           adjusted_amount = $1,
           adjustment_reason = $2,
           adjusted_by = $3,
           adjusted_at = NOW(),
           updated_at = NOW()
       WHERE id = $4 AND status IN ('pending', 'approved')
       RETURNING *`,
      [adjustedAmount, reason, adjustedByUserId, commissionId]
    );
    if (result.rows.length === 0) {
      throw ApiError.badRequest('Commission not found or already paid/cancelled');
    }
    return this.getById(commissionId);
  }

  async markPaid(commissionIds, period) {
    const result = await this.pool.query(
      `UPDATE order_commissions
       SET status = 'paid', paid_in_period = $1, paid_at = NOW(), updated_at = NOW()
       WHERE id = ANY($2) AND status IN ('approved', 'adjusted')
       RETURNING id`,
      [period, commissionIds]
    );
    return { paidCount: result.rows.length, paidIds: result.rows.map(r => r.id) };
  }

  async cancel(commissionId, reason) {
    const result = await this.pool.query(
      `UPDATE order_commissions
       SET status = 'cancelled', adjustment_reason = COALESCE($1, adjustment_reason), updated_at = NOW()
       WHERE id = $2 AND status IN ('pending', 'approved', 'adjusted')
       RETURNING *`,
      [reason, commissionId]
    );
    if (result.rows.length === 0) {
      throw ApiError.badRequest('Commission not found or already paid/cancelled');
    }
    return this.getById(commissionId);
  }

  // ==========================================================================
  // RULES CRUD
  // ==========================================================================

  async getRules(activeOnly = true) {
    const where = activeOnly ? 'WHERE is_active = true' : '';
    const result = await this.pool.query(
      `SELECT * FROM hub_commission_rules ${where} ORDER BY priority DESC, name`
    );
    return result.rows.map(r => this._mapRuleRow(r));
  }

  async getRuleById(id) {
    const result = await this.pool.query('SELECT * FROM hub_commission_rules WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return this._mapRuleRow(result.rows[0]);
  }

  async createRule(data, userId) {
    const result = await this.pool.query(
      `INSERT INTO hub_commission_rules (
        name, applies_to, category_id, manufacturer, product_id,
        commission_type, commission_value, tier_rules,
        min_sale_amount, min_margin_percent,
        priority, is_active, effective_from, effective_to, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        data.name, data.appliesTo,
        data.categoryId || null, data.manufacturer || null, data.productId || null,
        data.commissionType, data.commissionValue || null,
        data.tierRules ? JSON.stringify(data.tierRules) : null,
        data.minSaleAmount || null, data.minMarginPercent || null,
        data.priority || 0, data.isActive !== false,
        data.effectiveFrom || null, data.effectiveTo || null, userId,
      ]
    );
    return this._mapRuleRow(result.rows[0]);
  }

  async updateRule(id, data) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    const fieldMap = {
      name: 'name', appliesTo: 'applies_to', categoryId: 'category_id',
      manufacturer: 'manufacturer', productId: 'product_id',
      commissionType: 'commission_type', commissionValue: 'commission_value',
      tierRules: 'tier_rules', minSaleAmount: 'min_sale_amount',
      minMarginPercent: 'min_margin_percent', priority: 'priority',
      isActive: 'is_active', effectiveFrom: 'effective_from', effectiveTo: 'effective_to',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (data[key] !== undefined) {
        fields.push(`${col} = $${paramIndex++}`);
        values.push(key === 'tierRules' ? JSON.stringify(data[key]) : data[key]);
      }
    }

    if (fields.length === 0) throw ApiError.badRequest('No fields to update');

    fields.push('updated_at = NOW()');
    values.push(id);

    const result = await this.pool.query(
      `UPDATE hub_commission_rules SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    if (result.rows.length === 0) throw ApiError.notFound('Commission rule');
    return this._mapRuleRow(result.rows[0]);
  }

  async deleteRule(id) {
    const result = await this.pool.query(
      'UPDATE hub_commission_rules SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) throw ApiError.notFound('Commission rule');
    return { success: true };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  _mapRow(row) {
    return {
      id: row.id,
      orderId: row.order_id,
      orderNumber: row.order_number || null,
      userId: row.user_id,
      repName: row.rep_name || null,
      splitPercentage: parseFloat(row.split_percentage),
      saleAmountCents: row.sale_amount,
      saleAmount: row.sale_amount / 100,
      commissionBaseCents: row.commission_base,
      commissionBase: row.commission_base / 100,
      commissionRate: parseFloat(row.commission_rate || 0),
      commissionAmountCents: row.commission_amount,
      commissionAmount: row.commission_amount / 100,
      status: row.status,
      adjustedAmountCents: row.adjusted_amount,
      adjustedAmount: row.adjusted_amount != null ? row.adjusted_amount / 100 : null,
      adjustmentReason: row.adjustment_reason,
      adjustedByName: row.adjusted_by_name || null,
      adjustedAt: row.adjusted_at,
      approvedByName: row.approved_by_name || null,
      approvedAt: row.approved_at,
      paidInPeriod: row.paid_in_period,
      paidAt: row.paid_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  _mapRuleRow(row) {
    return {
      id: row.id,
      name: row.name,
      appliesTo: row.applies_to,
      categoryId: row.category_id,
      manufacturer: row.manufacturer,
      productId: row.product_id,
      commissionType: row.commission_type,
      commissionValue: row.commission_value != null ? parseFloat(row.commission_value) : null,
      tierRules: row.tier_rules,
      minSaleAmount: row.min_sale_amount,
      minMarginPercent: row.min_margin_percent != null ? parseFloat(row.min_margin_percent) : null,
      priority: row.priority,
      isActive: row.is_active,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = HubCommissionService;
