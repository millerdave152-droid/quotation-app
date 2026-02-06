/**
 * TeleTime POS - Shift Report Service
 * Generates comprehensive end-of-day/shift reports
 */

class ShiftReportService {
  constructor(pool) {
    this.pool = pool;
  }

  // ============================================================================
  // MAIN REPORT METHODS
  // ============================================================================

  /**
   * Generate full shift report
   * @param {object} params
   * @param {number} params.shiftId - Specific shift ID (optional)
   * @param {string} params.startTime - Start of period (ISO string)
   * @param {string} params.endTime - End of period (ISO string)
   * @param {number} params.storeId - Store/location ID (optional, for multi-store)
   * @param {number} params.registerId - Specific register (optional)
   * @returns {Promise<object>} Full report object
   */
  async generateShiftReport(params) {
    const { shiftId, startTime, endTime, storeId, registerId } = params;

    // Build base filter conditions
    const { whereClause, queryParams } = this.buildFilterConditions(params);

    // Execute all report sections in parallel for performance
    const [
      shiftInfo,
      salesSummary,
      paymentBreakdown,
      productSummary,
      salesRepPerformance,
      operationalMetrics,
      hourlyBreakdown,
    ] = await Promise.all([
      this.getShiftInfo(params),
      this.getSalesSummary(whereClause, queryParams),
      this.getPaymentBreakdown(whereClause, queryParams, params),
      this.getProductSummary(whereClause, queryParams),
      this.getSalesRepPerformance(whereClause, queryParams),
      this.getOperationalMetrics(whereClause, queryParams),
      this.getHourlyBreakdown(whereClause, queryParams),
    ]);

    return {
      reportType: shiftId ? 'shift' : 'period',
      generatedAt: new Date().toISOString(),
      parameters: {
        shiftId,
        startTime,
        endTime,
        storeId,
        registerId,
      },
      shift: shiftInfo,
      salesSummary,
      paymentBreakdown,
      productSummary,
      salesRepPerformance,
      operationalMetrics,
      hourlyBreakdown,
    };
  }

  /**
   * Get shift summary only (for dashboard/quick view)
   * @param {object} params - Same as generateShiftReport
   * @returns {Promise<object>} Summary data
   */
  async getShiftSummary(params) {
    const { whereClause, queryParams } = this.buildFilterConditions(params);

    const [shiftInfo, salesSummary, paymentBreakdown] = await Promise.all([
      this.getShiftInfo(params),
      this.getSalesSummary(whereClause, queryParams),
      this.getPaymentBreakdown(whereClause, queryParams, params),
    ]);

    return {
      reportType: 'summary',
      generatedAt: new Date().toISOString(),
      shift: shiftInfo,
      salesSummary,
      paymentBreakdown,
    };
  }

  // ============================================================================
  // FILTER BUILDING
  // ============================================================================

  /**
   * Build WHERE clause and params based on filter parameters
   * @private
   */
  buildFilterConditions(params) {
    const { shiftId, startTime, endTime, storeId, registerId } = params;
    const conditions = [];
    const queryParams = [];
    let paramIndex = 1;

    if (shiftId) {
      conditions.push(`t.shift_id = $${paramIndex}`);
      queryParams.push(shiftId);
      paramIndex++;
    } else {
      if (startTime) {
        conditions.push(`t.created_at >= $${paramIndex}`);
        queryParams.push(startTime);
        paramIndex++;
      }
      if (endTime) {
        conditions.push(`t.created_at <= $${paramIndex}`);
        queryParams.push(endTime);
        paramIndex++;
      }
    }

    if (registerId) {
      conditions.push(`rs.register_id = $${paramIndex}`);
      queryParams.push(registerId);
      paramIndex++;
    }

    // Store filtering would require a store_id column on registers
    // Placeholder for multi-store support
    if (storeId) {
      conditions.push(`r.store_id = $${paramIndex}`);
      queryParams.push(storeId);
      paramIndex++;
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    return { whereClause, queryParams, paramIndex };
  }

  // ============================================================================
  // SHIFT INFO
  // ============================================================================

  /**
   * Get shift metadata
   * @private
   */
  async getShiftInfo(params) {
    const { shiftId, startTime, endTime, registerId } = params;

    if (shiftId) {
      const result = await this.pool.query(`
        SELECT
          rs.shift_id,
          rs.register_id,
          r.register_name,
          r.location,
          rs.user_id,
          u.first_name || ' ' || u.last_name as cashier_name,
          u.email as cashier_email,
          rs.opened_at,
          rs.closed_at,
          rs.opening_cash,
          rs.closing_cash,
          rs.expected_cash,
          rs.cash_variance,
          rs.status,
          rs.notes
        FROM register_shifts rs
        JOIN registers r ON rs.register_id = r.register_id
        JOIN users u ON rs.user_id = u.id
        WHERE rs.shift_id = $1
      `, [shiftId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        shiftId: row.shift_id,
        registerId: row.register_id,
        registerName: row.register_name,
        location: row.location,
        cashierId: row.user_id,
        cashierName: row.cashier_name,
        cashierEmail: row.cashier_email,
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        openingCash: parseFloat(row.opening_cash) || 0,
        closingCash: row.closing_cash ? parseFloat(row.closing_cash) : null,
        expectedCash: row.expected_cash ? parseFloat(row.expected_cash) : null,
        cashVariance: row.cash_variance ? parseFloat(row.cash_variance) : null,
        status: row.status,
        notes: row.notes,
        duration: row.closed_at
          ? this.calculateDuration(row.opened_at, row.closed_at)
          : this.calculateDuration(row.opened_at, new Date()),
      };
    }

    // For date range reports
    return {
      periodStart: startTime,
      periodEnd: endTime,
      registerId: registerId || 'all',
    };
  }

  // ============================================================================
  // SALES SUMMARY
  // ============================================================================

  /**
   * Get sales summary statistics
   * @private
   */
  async getSalesSummary(whereClause, queryParams) {
    const query = `
      SELECT
        -- Transaction counts
        COUNT(*) FILTER (WHERE t.status = 'completed') as total_transactions,
        COUNT(*) FILTER (WHERE t.status = 'voided') as voided_transactions,
        COUNT(*) FILTER (WHERE t.status = 'refunded') as refunded_transactions,

        -- Revenue metrics (completed only)
        COALESCE(SUM(t.subtotal) FILTER (WHERE t.status = 'completed'), 0) as gross_subtotal,
        COALESCE(SUM(t.discount_amount) FILTER (WHERE t.status = 'completed'), 0) as total_discounts,
        COALESCE(SUM(t.hst_amount) FILTER (WHERE t.status = 'completed'), 0) as total_hst,
        COALESCE(SUM(t.gst_amount) FILTER (WHERE t.status = 'completed'), 0) as total_gst,
        COALESCE(SUM(t.pst_amount) FILTER (WHERE t.status = 'completed'), 0) as total_pst,
        COALESCE(SUM(t.hst_amount + t.gst_amount + t.pst_amount) FILTER (WHERE t.status = 'completed'), 0) as total_tax,
        COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) as gross_revenue,

        -- Refund amounts
        COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'refunded'), 0) as refund_amount,

        -- Net revenue
        COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) -
        COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'refunded'), 0) as net_revenue,

        -- Averages
        COALESCE(AVG(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) as avg_transaction_value,
        COALESCE(AVG(t.discount_amount) FILTER (WHERE t.status = 'completed' AND t.discount_amount > 0), 0) as avg_discount,

        -- Item counts
        COALESCE(SUM(item_counts.item_count) FILTER (WHERE t.status = 'completed'), 0) as total_items_sold

      FROM transactions t
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as item_count, SUM(quantity) as unit_count
        FROM transaction_items ti
        WHERE ti.transaction_id = t.transaction_id
      ) item_counts ON true
      ${whereClause}
    `;

    const result = await this.pool.query(query, queryParams);
    const row = result.rows[0];

    const totalTransactions = parseInt(row.total_transactions, 10) || 0;
    const grossRevenue = parseFloat(row.gross_revenue) || 0;

    return {
      transactions: {
        total: totalTransactions,
        completed: totalTransactions,
        voided: parseInt(row.voided_transactions, 10) || 0,
        refunded: parseInt(row.refunded_transactions, 10) || 0,
      },
      revenue: {
        grossSubtotal: parseFloat(row.gross_subtotal) || 0,
        totalDiscounts: parseFloat(row.total_discounts) || 0,
        tax: {
          hst: parseFloat(row.total_hst) || 0,
          gst: parseFloat(row.total_gst) || 0,
          pst: parseFloat(row.total_pst) || 0,
          total: parseFloat(row.total_tax) || 0,
        },
        grossRevenue,
        refundAmount: parseFloat(row.refund_amount) || 0,
        netRevenue: parseFloat(row.net_revenue) || 0,
      },
      averages: {
        transactionValue: parseFloat(row.avg_transaction_value) || 0,
        discount: parseFloat(row.avg_discount) || 0,
        itemsPerTransaction: totalTransactions > 0
          ? (parseInt(row.total_items_sold, 10) || 0) / totalTransactions
          : 0,
      },
      itemsSold: parseInt(row.total_items_sold, 10) || 0,
    };
  }

  // ============================================================================
  // PAYMENT BREAKDOWN
  // ============================================================================

  /**
   * Get payment method breakdown
   * @private
   */
  async getPaymentBreakdown(whereClause, queryParams, params) {
    // Get payments grouped by method
    const paymentsQuery = `
      SELECT
        p.payment_method,
        COUNT(*) as payment_count,
        COALESCE(SUM(p.amount), 0) as total_amount,
        COALESCE(SUM(p.cash_tendered), 0) as cash_tendered,
        COALESCE(SUM(p.change_given), 0) as change_given
      FROM payments p
      JOIN transactions t ON p.transaction_id = t.transaction_id
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} t.status = 'completed'
        AND p.status = 'completed'
      GROUP BY p.payment_method
      ORDER BY total_amount DESC
    `;

    const result = await this.pool.query(paymentsQuery, queryParams);

    const breakdown = {};
    let totalCash = 0;
    let totalCard = 0;
    let totalOther = 0;
    let cashTendered = 0;
    let changeGiven = 0;

    result.rows.forEach(row => {
      const method = row.payment_method;
      const amount = parseFloat(row.total_amount) || 0;

      breakdown[method] = {
        count: parseInt(row.payment_count, 10) || 0,
        amount,
      };

      if (method === 'cash') {
        totalCash = amount;
        cashTendered = parseFloat(row.cash_tendered) || 0;
        changeGiven = parseFloat(row.change_given) || 0;
      } else if (['credit', 'debit'].includes(method)) {
        totalCard += amount;
      } else {
        totalOther += amount;
      }
    });

    // Calculate expected cash in drawer
    let expectedCash = 0;
    if (params.shiftId) {
      const shiftResult = await this.pool.query(`
        SELECT opening_cash FROM register_shifts WHERE shift_id = $1
      `, [params.shiftId]);
      if (shiftResult.rows.length > 0) {
        const openingCash = parseFloat(shiftResult.rows[0].opening_cash) || 0;
        expectedCash = openingCash + totalCash - changeGiven;
      }
    }

    return {
      byMethod: breakdown,
      totals: {
        cash: totalCash,
        card: totalCard,
        other: totalOther,
        all: totalCash + totalCard + totalOther,
      },
      cashDrawer: {
        cashTendered,
        changeGiven,
        netCash: totalCash - changeGiven,
        expectedInDrawer: expectedCash,
      },
    };
  }

  // ============================================================================
  // PRODUCT SUMMARY
  // ============================================================================

  /**
   * Get product sales summary
   * @private
   */
  async getProductSummary(whereClause, queryParams) {
    // Units sold by category
    const categoryQuery = `
      SELECT
        COALESCE(c.name, 'Uncategorized') as category_name,
        c.id as category_id,
        COUNT(DISTINCT ti.item_id) as line_items,
        COALESCE(SUM(ti.quantity), 0) as units_sold,
        COALESCE(SUM(ti.line_total), 0) as revenue
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.transaction_id
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      LEFT JOIN products p ON ti.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} t.status = 'completed'
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
    `;

    // Top 10 products
    const topProductsQuery = `
      SELECT
        ti.product_id,
        ti.product_name,
        ti.product_sku,
        COALESCE(SUM(ti.quantity), 0) as units_sold,
        COALESCE(SUM(ti.line_total), 0) as revenue,
        COALESCE(AVG(ti.discount_percent), 0) as avg_discount_percent
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.transaction_id
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} t.status = 'completed'
      GROUP BY ti.product_id, ti.product_name, ti.product_sku
      ORDER BY units_sold DESC
      LIMIT 10
    `;

    // Warranties sold
    const warrantiesQuery = `
      SELECT
        COUNT(*) as warranty_count,
        COALESCE(SUM(wi.warranty_price), 0) as warranty_revenue,
        COALESCE(AVG(wi.warranty_price), 0) as avg_warranty_price
      FROM warranty_items wi
      JOIN transactions t ON wi.transaction_id = t.transaction_id
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} t.status = 'completed'
    `;

    const [categoryResult, topProductsResult, warrantiesResult] = await Promise.all([
      this.pool.query(categoryQuery, queryParams),
      this.pool.query(topProductsQuery, queryParams),
      this.pool.query(warrantiesQuery, queryParams).catch(() => ({ rows: [{}] })), // Handle if warranty_items doesn't exist
    ]);

    return {
      byCategory: categoryResult.rows.map(row => ({
        categoryId: row.category_id,
        categoryName: row.category_name,
        lineItems: parseInt(row.line_items, 10) || 0,
        unitsSold: parseInt(row.units_sold, 10) || 0,
        revenue: parseFloat(row.revenue) || 0,
      })),
      topProducts: topProductsResult.rows.map(row => ({
        productId: row.product_id,
        productName: row.product_name,
        sku: row.product_sku,
        unitsSold: parseInt(row.units_sold, 10) || 0,
        revenue: parseFloat(row.revenue) || 0,
        avgDiscountPercent: parseFloat(row.avg_discount_percent) || 0,
      })),
      warranties: {
        count: parseInt(warrantiesResult.rows[0]?.warranty_count, 10) || 0,
        revenue: parseFloat(warrantiesResult.rows[0]?.warranty_revenue) || 0,
        avgPrice: parseFloat(warrantiesResult.rows[0]?.avg_warranty_price) || 0,
      },
    };
  }

  // ============================================================================
  // SALES REP PERFORMANCE
  // ============================================================================

  /**
   * Get sales rep performance metrics
   * @private
   */
  async getSalesRepPerformance(whereClause, queryParams) {
    const query = `
      SELECT
        t.salesperson_id,
        u.first_name,
        u.last_name,
        u.email,
        COUNT(DISTINCT t.transaction_id) FILTER (WHERE t.status = 'completed') as transaction_count,
        COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) as total_revenue,
        COALESCE(SUM(t.discount_amount) FILTER (WHERE t.status = 'completed'), 0) as total_discounts,
        COALESCE(AVG(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) as avg_transaction,
        COALESCE(
          SUM(t.discount_amount) FILTER (WHERE t.status = 'completed') /
          NULLIF(SUM(t.subtotal) FILTER (WHERE t.status = 'completed'), 0) * 100,
          0
        ) as avg_discount_percent,
        COALESCE(SUM(item_counts.item_count) FILTER (WHERE t.status = 'completed'), 0) as items_sold,
        COUNT(DISTINCT t.transaction_id) FILTER (WHERE t.status = 'voided') as voided_count
      FROM transactions t
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      LEFT JOIN users u ON t.salesperson_id = u.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as item_count
        FROM transaction_items ti
        WHERE ti.transaction_id = t.transaction_id
      ) item_counts ON true
      ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} t.salesperson_id IS NOT NULL
      GROUP BY t.salesperson_id, u.first_name, u.last_name, u.email
      ORDER BY total_revenue DESC
    `;

    const result = await this.pool.query(query, queryParams);

    return result.rows.map(row => ({
      repId: row.salesperson_id,
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown',
      email: row.email,
      metrics: {
        transactionCount: parseInt(row.transaction_count, 10) || 0,
        totalRevenue: parseFloat(row.total_revenue) || 0,
        totalDiscounts: parseFloat(row.total_discounts) || 0,
        avgTransaction: parseFloat(row.avg_transaction) || 0,
        avgDiscountPercent: parseFloat(row.avg_discount_percent) || 0,
        itemsSold: parseInt(row.items_sold, 10) || 0,
        voidedTransactions: parseInt(row.voided_count, 10) || 0,
      },
    }));
  }

  // ============================================================================
  // OPERATIONAL METRICS
  // ============================================================================

  /**
   * Get operational metrics (voids, refunds, overrides, quote conversions)
   * @private
   */
  async getOperationalMetrics(whereClause, queryParams) {
    // Voided transactions
    const voidsQuery = `
      SELECT
        COUNT(*) as void_count,
        COALESCE(SUM(t.total_amount), 0) as void_value,
        array_agg(DISTINCT t.void_reason) FILTER (WHERE t.void_reason IS NOT NULL) as void_reasons
      FROM transactions t
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} t.status = 'voided'
    `;

    // Refunds
    const refundsQuery = `
      SELECT
        COUNT(*) as refund_count,
        COALESCE(SUM(t.total_amount), 0) as refund_value
      FROM transactions t
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} t.status = 'refunded'
    `;

    // Manager overrides
    const overridesQuery = `
      SELECT
        COUNT(*) as override_count,
        COUNT(DISTINCT mo.approver_id) as unique_approvers,
        array_agg(DISTINCT mo.override_type) as override_types
      FROM manager_overrides mo
      JOIN transactions t ON mo.transaction_id = t.transaction_id
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      ${whereClause}
    `;

    // Quote conversions
    const quotesQuery = `
      SELECT
        COUNT(*) as converted_quotes,
        COALESCE(SUM(t.total_amount), 0) as quote_revenue
      FROM transactions t
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} t.quote_id IS NOT NULL
        AND t.status = 'completed'
    `;

    const [voidsResult, refundsResult, overridesResult, quotesResult] = await Promise.all([
      this.pool.query(voidsQuery, queryParams),
      this.pool.query(refundsQuery, queryParams),
      this.pool.query(overridesQuery, queryParams).catch(() => ({ rows: [{}] })),
      this.pool.query(quotesQuery, queryParams),
    ]);

    return {
      voids: {
        count: parseInt(voidsResult.rows[0]?.void_count, 10) || 0,
        value: parseFloat(voidsResult.rows[0]?.void_value) || 0,
        reasons: voidsResult.rows[0]?.void_reasons || [],
      },
      refunds: {
        count: parseInt(refundsResult.rows[0]?.refund_count, 10) || 0,
        value: parseFloat(refundsResult.rows[0]?.refund_value) || 0,
      },
      managerOverrides: {
        count: parseInt(overridesResult.rows[0]?.override_count, 10) || 0,
        uniqueApprovers: parseInt(overridesResult.rows[0]?.unique_approvers, 10) || 0,
        types: overridesResult.rows[0]?.override_types || [],
      },
      quoteConversions: {
        count: parseInt(quotesResult.rows[0]?.converted_quotes, 10) || 0,
        revenue: parseFloat(quotesResult.rows[0]?.quote_revenue) || 0,
      },
    };
  }

  // ============================================================================
  // HOURLY BREAKDOWN
  // ============================================================================

  /**
   * Get hourly sales breakdown
   * @private
   */
  async getHourlyBreakdown(whereClause, queryParams) {
    const query = `
      SELECT
        EXTRACT(HOUR FROM t.created_at) as hour,
        COUNT(*) FILTER (WHERE t.status = 'completed') as transaction_count,
        COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) as revenue
      FROM transactions t
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      ${whereClause}
      GROUP BY EXTRACT(HOUR FROM t.created_at)
      ORDER BY hour
    `;

    const result = await this.pool.query(query, queryParams);

    // Fill in all 24 hours with zeros for missing hours
    const hourlyData = {};
    for (let h = 0; h < 24; h++) {
      hourlyData[h] = { transactions: 0, revenue: 0 };
    }

    result.rows.forEach(row => {
      const hour = parseInt(row.hour, 10);
      hourlyData[hour] = {
        transactions: parseInt(row.transaction_count, 10) || 0,
        revenue: parseFloat(row.revenue) || 0,
      };
    });

    // Find peak hour
    let peakHour = 0;
    let peakRevenue = 0;
    Object.entries(hourlyData).forEach(([hour, data]) => {
      if (data.revenue > peakRevenue) {
        peakRevenue = data.revenue;
        peakHour = parseInt(hour, 10);
      }
    });

    return {
      byHour: hourlyData,
      peakHour: {
        hour: peakHour,
        label: this.formatHour(peakHour),
        transactions: hourlyData[peakHour].transactions,
        revenue: hourlyData[peakHour].revenue,
      },
    };
  }

  // ============================================================================
  // COMPARISON REPORTS
  // ============================================================================

  /**
   * Compare two periods (e.g., today vs yesterday, this week vs last week)
   * @param {object} currentParams - Parameters for current period
   * @param {object} previousParams - Parameters for comparison period
   * @returns {Promise<object>} Comparison report
   */
  async comparePeriodsReport(currentParams, previousParams) {
    const [currentReport, previousReport] = await Promise.all([
      this.getShiftSummary(currentParams),
      this.getShiftSummary(previousParams),
    ]);

    const calculateChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      current: currentReport,
      previous: previousReport,
      comparison: {
        transactions: {
          change: currentReport.salesSummary.transactions.total - previousReport.salesSummary.transactions.total,
          changePercent: calculateChange(
            currentReport.salesSummary.transactions.total,
            previousReport.salesSummary.transactions.total
          ),
        },
        revenue: {
          change: currentReport.salesSummary.revenue.netRevenue - previousReport.salesSummary.revenue.netRevenue,
          changePercent: calculateChange(
            currentReport.salesSummary.revenue.netRevenue,
            previousReport.salesSummary.revenue.netRevenue
          ),
        },
        avgTransaction: {
          change: currentReport.salesSummary.averages.transactionValue - previousReport.salesSummary.averages.transactionValue,
          changePercent: calculateChange(
            currentReport.salesSummary.averages.transactionValue,
            previousReport.salesSummary.averages.transactionValue
          ),
        },
      },
    };
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Calculate duration between two dates
   * @private
   */
  calculateDuration(start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffMs = endDate - startDate;

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return {
      hours,
      minutes,
      formatted: `${hours}h ${minutes}m`,
      totalMinutes: hours * 60 + minutes,
    };
  }

  /**
   * Format hour number to readable string
   * @private
   */
  formatHour(hour) {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:00 ${ampm}`;
  }

  // ============================================================================
  // CSV EXPORT METHODS
  // ============================================================================

  /**
   * UTF-8 BOM for Excel compatibility
   * @private
   */
  get UTF8_BOM() {
    return '\uFEFF';
  }

  /**
   * Escape and quote a CSV value
   * @private
   */
  escapeCSV(value) {
    if (value === null || value === undefined) {
      return '';
    }
    const str = String(value);
    // Quote if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Format date for CSV (ISO format)
   * @private
   */
  formatDateCSV(date) {
    if (!date) return '';
    return new Date(date).toISOString();
  }

  /**
   * Format currency for CSV (number only, no symbol)
   * @private
   */
  formatCurrencyCSV(value) {
    if (value === null || value === undefined) return '0.00';
    return parseFloat(value).toFixed(2);
  }

  /**
   * Build CSV string from headers and rows
   * @private
   */
  buildCSV(headers, rows) {
    const headerLine = headers.map(h => this.escapeCSV(h)).join(',');
    const dataLines = rows.map(row =>
      row.map(cell => this.escapeCSV(cell)).join(',')
    );
    return this.UTF8_BOM + [headerLine, ...dataLines].join('\r\n');
  }

  /**
   * Export shift report as CSV
   * @param {object} params - Report parameters
   * @param {string} reportType - Type: 'summary', 'transactions', 'products', 'payments', 'reps'
   * @returns {Promise<string>} CSV string
   */
  async exportShiftReportCSV(params, reportType) {
    switch (reportType) {
      case 'summary':
        return this.exportSummaryCSV(params);
      case 'transactions':
        return this.exportTransactionsCSV(params);
      case 'products':
        return this.exportProductsCSV(params);
      case 'payments':
        return this.exportPaymentsCSV(params);
      case 'reps':
        return this.exportRepsCSV(params);
      case 'hourly':
        return this.exportHourlyCSV(params);
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }
  }

  /**
   * Export all reports as ZIP buffer
   * @param {object} params - Report parameters
   * @returns {Promise<Buffer>} ZIP buffer
   */
  async exportShiftReportZip(params) {
    const archiver = require('archiver');
    const { PassThrough } = require('stream');

    // Generate all CSVs in parallel
    const [summary, transactions, products, payments, reps, hourly] = await Promise.all([
      this.exportSummaryCSV(params),
      this.exportTransactionsCSV(params),
      this.exportProductsCSV(params),
      this.exportPaymentsCSV(params),
      this.exportRepsCSV(params),
      this.exportHourlyCSV(params),
    ]);

    // Get date for filename
    const dateStr = this.getReportDateString(params);

    return new Promise((resolve, reject) => {
      const chunks = [];
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('data', chunk => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      // Add CSV files to archive
      archive.append(summary, { name: `summary-${dateStr}.csv` });
      archive.append(transactions, { name: `transactions-${dateStr}.csv` });
      archive.append(products, { name: `products-${dateStr}.csv` });
      archive.append(payments, { name: `payments-${dateStr}.csv` });
      archive.append(reps, { name: `sales-reps-${dateStr}.csv` });
      archive.append(hourly, { name: `hourly-breakdown-${dateStr}.csv` });

      archive.finalize();
    });
  }

  /**
   * Get date string for report filename
   * @private
   */
  getReportDateString(params) {
    if (params.shiftId) {
      return `shift-${params.shiftId}`;
    }
    const date = params.startTime ? new Date(params.startTime) : new Date();
    return date.toISOString().split('T')[0];
  }

  /**
   * Export summary CSV
   * @private
   */
  async exportSummaryCSV(params) {
    const report = await this.generateShiftReport(params);
    const s = report.salesSummary;
    const p = report.paymentBreakdown;
    const o = report.operationalMetrics;

    const headers = [
      'Report Date',
      'Report Type',
      'Total Transactions',
      'Completed Transactions',
      'Voided Transactions',
      'Refunded Transactions',
      'Gross Subtotal',
      'Total Discounts',
      'HST',
      'GST',
      'PST',
      'Total Tax',
      'Gross Revenue',
      'Refund Amount',
      'Net Revenue',
      'Avg Transaction Value',
      'Avg Discount',
      'Items Sold',
      'Cash Total',
      'Card Total',
      'Other Payments',
      'Expected Cash in Drawer',
      'Void Count',
      'Void Value',
      'Manager Overrides',
      'Quotes Converted',
      'Quote Revenue',
    ];

    const row = [
      this.formatDateCSV(report.generatedAt),
      report.reportType,
      s.transactions.total,
      s.transactions.completed,
      s.transactions.voided,
      s.transactions.refunded,
      this.formatCurrencyCSV(s.revenue.grossSubtotal),
      this.formatCurrencyCSV(s.revenue.totalDiscounts),
      this.formatCurrencyCSV(s.revenue.tax.hst),
      this.formatCurrencyCSV(s.revenue.tax.gst),
      this.formatCurrencyCSV(s.revenue.tax.pst),
      this.formatCurrencyCSV(s.revenue.tax.total),
      this.formatCurrencyCSV(s.revenue.grossRevenue),
      this.formatCurrencyCSV(s.revenue.refundAmount),
      this.formatCurrencyCSV(s.revenue.netRevenue),
      this.formatCurrencyCSV(s.averages.transactionValue),
      this.formatCurrencyCSV(s.averages.discount),
      s.itemsSold,
      this.formatCurrencyCSV(p.totals.cash),
      this.formatCurrencyCSV(p.totals.card),
      this.formatCurrencyCSV(p.totals.other),
      this.formatCurrencyCSV(p.cashDrawer.expectedInDrawer),
      o.voids.count,
      this.formatCurrencyCSV(o.voids.value),
      o.managerOverrides.count,
      o.quoteConversions.count,
      this.formatCurrencyCSV(o.quoteConversions.revenue),
    ];

    return this.buildCSV(headers, [row]);
  }

  /**
   * Export transactions CSV
   * @private
   */
  async exportTransactionsCSV(params) {
    const { whereClause, queryParams } = this.buildFilterConditions(params);

    const query = `
      SELECT
        t.transaction_id,
        t.transaction_number,
        t.created_at,
        t.completed_at,
        t.status,
        c.name as customer_name,
        c.email as customer_email,
        u.first_name || ' ' || u.last_name as salesperson_name,
        t.subtotal,
        t.discount_amount,
        t.hst_amount,
        t.gst_amount,
        t.pst_amount,
        t.total_amount,
        t.quote_id,
        t.void_reason,
        (
          SELECT string_agg(p.payment_method || ':' || p.amount::text, '; ')
          FROM payments p
          WHERE p.transaction_id = t.transaction_id AND p.status = 'completed'
        ) as payments,
        (
          SELECT COUNT(*) FROM transaction_items ti WHERE ti.transaction_id = t.transaction_id
        ) as item_count
      FROM transactions t
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u ON t.salesperson_id = u.id
      ${whereClause}
      ORDER BY t.created_at DESC
    `;

    const result = await this.pool.query(query, queryParams);

    const headers = [
      'Transaction ID',
      'Transaction Number',
      'Created At',
      'Completed At',
      'Status',
      'Customer Name',
      'Customer Email',
      'Salesperson',
      'Subtotal',
      'Discount',
      'HST',
      'GST',
      'PST',
      'Total',
      'Item Count',
      'Payment Methods',
      'Quote ID',
      'Void Reason',
    ];

    const rows = result.rows.map(row => [
      row.transaction_id,
      row.transaction_number,
      this.formatDateCSV(row.created_at),
      this.formatDateCSV(row.completed_at),
      row.status,
      row.customer_name || '',
      row.customer_email || '',
      row.salesperson_name || '',
      this.formatCurrencyCSV(row.subtotal),
      this.formatCurrencyCSV(row.discount_amount),
      this.formatCurrencyCSV(row.hst_amount),
      this.formatCurrencyCSV(row.gst_amount),
      this.formatCurrencyCSV(row.pst_amount),
      this.formatCurrencyCSV(row.total_amount),
      row.item_count,
      row.payments || '',
      row.quote_id || '',
      row.void_reason || '',
    ]);

    return this.buildCSV(headers, rows);
  }

  /**
   * Export products CSV
   * @private
   */
  async exportProductsCSV(params) {
    const { whereClause, queryParams } = this.buildFilterConditions(params);

    const query = `
      SELECT
        ti.product_id,
        ti.product_sku,
        ti.product_name,
        COALESCE(c.name, 'Uncategorized') as category_name,
        SUM(ti.quantity) as units_sold,
        COUNT(DISTINCT ti.transaction_id) as transaction_count,
        SUM(ti.unit_price * ti.quantity) as gross_amount,
        SUM(ti.line_total) as net_amount,
        SUM((ti.unit_price * ti.quantity) - ti.line_total) as discount_amount,
        AVG(ti.discount_percent) as avg_discount_percent
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.transaction_id
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      LEFT JOIN products p ON ti.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} t.status = 'completed'
      GROUP BY ti.product_id, ti.product_sku, ti.product_name, c.name
      ORDER BY units_sold DESC
    `;

    const result = await this.pool.query(query, queryParams);

    const headers = [
      'Product ID',
      'SKU',
      'Product Name',
      'Category',
      'Units Sold',
      'Transaction Count',
      'Gross Amount',
      'Net Amount',
      'Discount Amount',
      'Avg Discount %',
    ];

    const rows = result.rows.map(row => [
      row.product_id,
      row.product_sku,
      row.product_name,
      row.category_name,
      row.units_sold,
      row.transaction_count,
      this.formatCurrencyCSV(row.gross_amount),
      this.formatCurrencyCSV(row.net_amount),
      this.formatCurrencyCSV(row.discount_amount),
      parseFloat(row.avg_discount_percent || 0).toFixed(2),
    ]);

    return this.buildCSV(headers, rows);
  }

  /**
   * Export payments CSV
   * @private
   */
  async exportPaymentsCSV(params) {
    const { whereClause, queryParams } = this.buildFilterConditions(params);

    const query = `
      SELECT
        p.payment_id,
        p.transaction_id,
        t.transaction_number,
        p.payment_method,
        p.amount,
        p.cash_tendered,
        p.change_given,
        p.card_last_four,
        p.card_brand,
        p.authorization_code,
        p.status,
        p.created_at
      FROM payments p
      JOIN transactions t ON p.transaction_id = t.transaction_id
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} p.status = 'completed'
      ORDER BY p.created_at DESC
    `;

    const result = await this.pool.query(query, queryParams);

    const headers = [
      'Payment ID',
      'Transaction ID',
      'Transaction Number',
      'Payment Method',
      'Amount',
      'Cash Tendered',
      'Change Given',
      'Card Last 4',
      'Card Brand',
      'Auth Code',
      'Status',
      'Created At',
    ];

    const rows = result.rows.map(row => [
      row.payment_id,
      row.transaction_id,
      row.transaction_number,
      row.payment_method,
      this.formatCurrencyCSV(row.amount),
      this.formatCurrencyCSV(row.cash_tendered),
      this.formatCurrencyCSV(row.change_given),
      row.card_last_four || '',
      row.card_brand || '',
      row.authorization_code || '',
      row.status,
      this.formatDateCSV(row.created_at),
    ]);

    return this.buildCSV(headers, rows);
  }

  /**
   * Export sales reps CSV
   * @private
   */
  async exportRepsCSV(params) {
    const { whereClause, queryParams } = this.buildFilterConditions(params);
    const reps = await this.getSalesRepPerformance(whereClause, queryParams);

    const headers = [
      'Rep ID',
      'Name',
      'Email',
      'Transaction Count',
      'Total Revenue',
      'Total Discounts',
      'Avg Transaction',
      'Avg Discount %',
      'Items Sold',
      'Voided Transactions',
    ];

    const rows = reps.map(rep => [
      rep.repId,
      rep.name,
      rep.email || '',
      rep.metrics.transactionCount,
      this.formatCurrencyCSV(rep.metrics.totalRevenue),
      this.formatCurrencyCSV(rep.metrics.totalDiscounts),
      this.formatCurrencyCSV(rep.metrics.avgTransaction),
      parseFloat(rep.metrics.avgDiscountPercent || 0).toFixed(2),
      rep.metrics.itemsSold,
      rep.metrics.voidedTransactions,
    ]);

    return this.buildCSV(headers, rows);
  }

  /**
   * Export hourly breakdown CSV
   * @private
   */
  async exportHourlyCSV(params) {
    const { whereClause, queryParams } = this.buildFilterConditions(params);
    const hourly = await this.getHourlyBreakdown(whereClause, queryParams);

    const headers = [
      'Hour',
      'Time',
      'Transactions',
      'Revenue',
    ];

    const rows = Object.entries(hourly.byHour).map(([hour, data]) => [
      hour,
      this.formatHour(parseInt(hour, 10)),
      data.transactions,
      this.formatCurrencyCSV(data.revenue),
    ]);

    return this.buildCSV(headers, rows);
  }

  /**
   * Get all transaction items for a shift/period (for detailed export)
   * @param {object} params - Report parameters
   * @returns {Promise<string>} CSV string
   */
  async exportTransactionItemsCSV(params) {
    const { whereClause, queryParams } = this.buildFilterConditions(params);

    const query = `
      SELECT
        t.transaction_id,
        t.transaction_number,
        t.created_at as transaction_date,
        ti.item_id,
        ti.product_id,
        ti.product_sku,
        ti.product_name,
        ti.quantity,
        ti.unit_price,
        ti.discount_percent,
        ti.line_total,
        ti.serial_number,
        c.name as customer_name,
        u.first_name || ' ' || u.last_name as salesperson_name
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.transaction_id
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u ON t.salesperson_id = u.id
      ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} t.status = 'completed'
      ORDER BY t.created_at DESC, ti.item_id
    `;

    const result = await this.pool.query(query, queryParams);

    const headers = [
      'Transaction ID',
      'Transaction Number',
      'Transaction Date',
      'Item ID',
      'Product ID',
      'SKU',
      'Product Name',
      'Quantity',
      'Unit Price',
      'Discount %',
      'Line Total',
      'Serial Number',
      'Customer',
      'Salesperson',
    ];

    const rows = result.rows.map(row => [
      row.transaction_id,
      row.transaction_number,
      this.formatDateCSV(row.transaction_date),
      row.item_id,
      row.product_id,
      row.product_sku,
      row.product_name,
      row.quantity,
      this.formatCurrencyCSV(row.unit_price),
      parseFloat(row.discount_percent || 0).toFixed(2),
      this.formatCurrencyCSV(row.line_total),
      row.serial_number || '',
      row.customer_name || '',
      row.salesperson_name || '',
    ]);

    return this.buildCSV(headers, rows);
  }
}

module.exports = ShiftReportService;
