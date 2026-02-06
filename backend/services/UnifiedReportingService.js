/**
 * Unified Reporting Service
 *
 * Combines Quote and POS data for comprehensive analytics:
 * - Daily/weekly/monthly sales reports
 * - Quote conversion tracking
 * - Product performance across channels
 * - Customer purchase history
 * - Sales rep performance
 */

class UnifiedReportingService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Format currency
   */
  formatCurrency(amount) {
    return parseFloat(amount || 0).toFixed(2);
  }

  /**
   * Get date range SQL conditions
   */
  getDateCondition(startDate, endDate, dateColumn = 'created_at') {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`${dateColumn} >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`${dateColumn} <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    return { conditions, params, paramIndex };
  }

  // ============================================
  // SALES OVERVIEW REPORTS
  // ============================================

  /**
   * Get sales summary for a period
   * Combines quote and POS revenue
   */
  async getSalesSummary(options = {}) {
    const { startDate, endDate, groupBy = 'day' } = options;

    const dateFormat = {
      day: "DATE(completed_date)",
      week: "DATE_TRUNC('week', completed_date)",
      month: "DATE_TRUNC('month', completed_date)"
    }[groupBy] || "DATE(completed_date)";

    let query = `
      SELECT
        ${dateFormat} as period,
        source,
        COUNT(*) as transaction_count,
        SUM(subtotal) as gross_sales,
        SUM(discount_amount) as total_discounts,
        SUM(tax_amount) as total_tax,
        SUM(total_amount) as net_sales,
        AVG(total_amount) as avg_order_value,
        COUNT(DISTINCT customer_id) FILTER (WHERE customer_id IS NOT NULL) as unique_customers
      FROM v_unified_sales
      WHERE is_completed = true
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND completed_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND completed_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ` GROUP BY ${dateFormat}, source ORDER BY period DESC, source`;

    const result = await this.pool.query(query, params);

    // Also get totals
    let totalsQuery = `
      SELECT
        source,
        COUNT(*) as transaction_count,
        SUM(total_amount) as total_sales,
        AVG(total_amount) as avg_order_value,
        COUNT(DISTINCT customer_id) FILTER (WHERE customer_id IS NOT NULL) as unique_customers
      FROM v_unified_sales
      WHERE is_completed = true
    `;

    const totalsParams = [];
    paramIndex = 1;

    if (startDate) {
      totalsQuery += ` AND completed_date >= $${paramIndex}`;
      totalsParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      totalsQuery += ` AND completed_date <= $${paramIndex}`;
      totalsParams.push(endDate);
    }

    totalsQuery += ` GROUP BY source`;

    const totalsResult = await this.pool.query(totalsQuery, totalsParams);

    return {
      periods: result.rows,
      totals: totalsResult.rows,
      summary: {
        totalSales: totalsResult.rows.reduce((sum, r) => sum + parseFloat(r.total_sales || 0), 0),
        totalTransactions: totalsResult.rows.reduce((sum, r) => sum + parseInt(r.transaction_count || 0), 0),
        quoteRevenue: totalsResult.rows.find(r => r.source === 'quote')?.total_sales || 0,
        posRevenue: totalsResult.rows.find(r => r.source === 'pos')?.total_sales || 0
      }
    };
  }

  /**
   * Get daily sales report
   */
  async getDailySalesReport(date = new Date()) {
    const targetDate = new Date(date).toISOString().split('T')[0];

    const result = await this.pool.query(`
      SELECT
        source,
        transaction_count,
        gross_sales,
        total_discounts,
        total_tax,
        net_sales,
        avg_order_value,
        unique_customers,
        walk_in_count,
        account_count
      FROM v_daily_sales_summary
      WHERE sale_date = $1
    `, [targetDate]);

    // Get hourly breakdown
    const hourlyResult = await this.pool.query(`
      SELECT
        EXTRACT(HOUR FROM completed_date) as hour,
        source,
        COUNT(*) as transactions,
        SUM(total_amount) as sales
      FROM v_unified_sales
      WHERE DATE(completed_date) = $1 AND is_completed = true
      GROUP BY EXTRACT(HOUR FROM completed_date), source
      ORDER BY hour
    `, [targetDate]);

    // Get top products for the day
    const topProductsResult = await this.pool.query(`
      SELECT
        product_name,
        sku,
        SUM(quantity) as units_sold,
        SUM(line_total) as revenue
      FROM v_product_performance
      WHERE sale_date = $1
      GROUP BY product_name, sku
      ORDER BY revenue DESC
      LIMIT 10
    `, [targetDate]);

    return {
      date: targetDate,
      summary: result.rows,
      hourlyBreakdown: hourlyResult.rows,
      topProducts: topProductsResult.rows,
      totals: {
        totalSales: result.rows.reduce((sum, r) => sum + parseFloat(r.net_sales || 0), 0),
        totalTransactions: result.rows.reduce((sum, r) => sum + parseInt(r.transaction_count || 0), 0),
        avgOrderValue: result.rows.length > 0 ?
          result.rows.reduce((sum, r) => sum + parseFloat(r.net_sales || 0), 0) /
          result.rows.reduce((sum, r) => sum + parseInt(r.transaction_count || 0), 0) : 0
      }
    };
  }

  // ============================================
  // QUOTE CONVERSION REPORTS
  // ============================================

  /**
   * Get quote conversion metrics
   */
  async getQuoteConversionMetrics(options = {}) {
    const { startDate, endDate, salesRep } = options;

    let query = `
      SELECT
        conversion_status,
        COUNT(*) as count,
        SUM(quote_value) as total_value,
        AVG(quote_value) as avg_value,
        AVG(days_to_conversion) FILTER (WHERE conversion_status = 'converted') as avg_days_to_convert
      FROM v_quote_conversion
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND quote_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND quote_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (salesRep) {
      query += ` AND sales_rep_name = $${paramIndex}`;
      params.push(salesRep);
      paramIndex++;
    }

    query += ` GROUP BY conversion_status`;

    const result = await this.pool.query(query, params);

    // Calculate conversion rate
    const total = result.rows.reduce((sum, r) => sum + parseInt(r.count), 0);
    const converted = result.rows.find(r => r.conversion_status === 'converted')?.count || 0;
    const conversionRate = total > 0 ? (converted / total * 100).toFixed(2) : 0;

    // Time to conversion distribution
    let timeDistQuery = `
      SELECT
        CASE
          WHEN days_to_conversion < 1 THEN 'Same Day'
          WHEN days_to_conversion < 3 THEN '1-2 Days'
          WHEN days_to_conversion < 7 THEN '3-6 Days'
          WHEN days_to_conversion < 14 THEN '1-2 Weeks'
          WHEN days_to_conversion < 30 THEN '2-4 Weeks'
          ELSE '30+ Days'
        END as time_bucket,
        COUNT(*) as count
      FROM v_quote_conversion
      WHERE conversion_status = 'converted'
    `;

    const timeDistParams = [];
    if (startDate) {
      timeDistParams.push(startDate);
      timeDistQuery += ` AND quote_date >= $${timeDistParams.length}`;
    }
    if (endDate) {
      timeDistParams.push(endDate);
      timeDistQuery += ` AND quote_date <= $${timeDistParams.length}`;
    }

    timeDistQuery += ` GROUP BY time_bucket ORDER BY MIN(days_to_conversion)`;

    const timeDistResult = await this.pool.query(timeDistQuery, timeDistParams);

    return {
      byStatus: result.rows,
      conversionRate: parseFloat(conversionRate),
      totalQuotes: total,
      convertedQuotes: converted,
      avgDaysToConvert: result.rows.find(r => r.conversion_status === 'converted')?.avg_days_to_convert || null,
      timeToConversionDistribution: timeDistResult.rows
    };
  }

  /**
   * Get quote conversion trend over time
   */
  async getQuoteConversionTrend(options = {}) {
    const { startDate, endDate, groupBy = 'week' } = options;

    const dateFormat = {
      day: "DATE(quote_date)",
      week: "DATE_TRUNC('week', quote_date)",
      month: "DATE_TRUNC('month', quote_date)"
    }[groupBy] || "DATE_TRUNC('week', quote_date)";

    let query = `
      SELECT
        ${dateFormat} as period,
        COUNT(*) as total_quotes,
        COUNT(*) FILTER (WHERE conversion_status = 'converted') as converted,
        COUNT(*) FILTER (WHERE conversion_status = 'lost') as lost,
        COUNT(*) FILTER (WHERE conversion_status = 'expired') as expired,
        COUNT(*) FILTER (WHERE conversion_status = 'pending') as pending,
        SUM(quote_value) FILTER (WHERE conversion_status = 'converted') as converted_value,
        ROUND(COUNT(*) FILTER (WHERE conversion_status = 'converted')::numeric /
              NULLIF(COUNT(*), 0)::numeric * 100, 2) as conversion_rate
      FROM v_quote_conversion
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND quote_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND quote_date <= $${paramIndex}`;
      params.push(endDate);
    }

    query += ` GROUP BY ${dateFormat} ORDER BY period DESC`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // ============================================
  // AVERAGE ORDER VALUE COMPARISON
  // ============================================

  /**
   * Compare AOV between quotes and walk-in POS
   */
  async getAOVComparison(options = {}) {
    const { startDate, endDate } = options;

    let query = `
      SELECT
        source,
        customer_type,
        COUNT(*) as transaction_count,
        SUM(total_amount) as total_revenue,
        AVG(total_amount) as avg_order_value,
        MIN(total_amount) as min_order,
        MAX(total_amount) as max_order,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_amount) as median_order
      FROM v_unified_sales
      WHERE is_completed = true
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND completed_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND completed_date <= $${paramIndex}`;
      params.push(endDate);
    }

    query += ` GROUP BY source, customer_type`;

    const result = await this.pool.query(query, params);

    // AOV distribution by value ranges
    let distQuery = `
      SELECT
        source,
        customer_type,
        CASE
          WHEN total_amount < 50 THEN '$0-50'
          WHEN total_amount < 100 THEN '$50-100'
          WHEN total_amount < 250 THEN '$100-250'
          WHEN total_amount < 500 THEN '$250-500'
          WHEN total_amount < 1000 THEN '$500-1000'
          ELSE '$1000+'
        END as value_range,
        COUNT(*) as count
      FROM v_unified_sales
      WHERE is_completed = true
    `;

    const distParams = [];
    if (startDate) {
      distParams.push(startDate);
      distQuery += ` AND completed_date >= $${distParams.length}`;
    }
    if (endDate) {
      distParams.push(endDate);
      distQuery += ` AND completed_date <= $${distParams.length}`;
    }

    distQuery += ` GROUP BY source, customer_type, value_range ORDER BY source, customer_type, MIN(total_amount)`;

    const distResult = await this.pool.query(distQuery, distParams);

    return {
      comparison: result.rows,
      distribution: distResult.rows
    };
  }

  // ============================================
  // PRODUCT PERFORMANCE REPORTS
  // ============================================

  /**
   * Get product performance across channels
   */
  async getProductPerformance(options = {}) {
    const { startDate, endDate, category, limit = 50 } = options;

    let query = `
      SELECT
        product_name,
        sku,
        manufacturer,
        category,
        SUM(CASE WHEN source = 'quote' THEN quantity ELSE 0 END) as quote_units,
        SUM(CASE WHEN source = 'pos' THEN quantity ELSE 0 END) as pos_units,
        SUM(quantity) as total_units,
        SUM(CASE WHEN source = 'quote' THEN line_total ELSE 0 END) as quote_revenue,
        SUM(CASE WHEN source = 'pos' THEN line_total ELSE 0 END) as pos_revenue,
        SUM(line_total) as total_revenue,
        COUNT(DISTINCT customer_id) as unique_customers,
        AVG(unit_price) as avg_selling_price
      FROM v_product_performance
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND sale_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND sale_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    query += `
      GROUP BY product_name, sku, manufacturer, category
      ORDER BY total_revenue DESC
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get category performance summary
   */
  async getCategoryPerformance(options = {}) {
    const { startDate, endDate } = options;

    let query = `
      SELECT
        COALESCE(category, 'Uncategorized') as category,
        SUM(CASE WHEN source = 'quote' THEN quantity ELSE 0 END) as quote_units,
        SUM(CASE WHEN source = 'pos' THEN quantity ELSE 0 END) as pos_units,
        SUM(quantity) as total_units,
        SUM(CASE WHEN source = 'quote' THEN line_total ELSE 0 END) as quote_revenue,
        SUM(CASE WHEN source = 'pos' THEN line_total ELSE 0 END) as pos_revenue,
        SUM(line_total) as total_revenue,
        COUNT(DISTINCT product_name) as unique_products
      FROM v_product_performance
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND sale_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND sale_date <= $${paramIndex}`;
      params.push(endDate);
    }

    query += `
      GROUP BY COALESCE(category, 'Uncategorized')
      ORDER BY total_revenue DESC
    `;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // ============================================
  // CUSTOMER REPORTS
  // ============================================

  /**
   * Get customer purchase history summary
   */
  async getCustomerPurchaseHistory(options = {}) {
    const { customerId, limit = 50, sortBy = 'total_revenue', sortOrder = 'DESC' } = options;

    const validSortColumns = ['total_revenue', 'total_transactions', 'last_purchase_date', 'customer_since'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'total_revenue';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let query = `
      SELECT *
      FROM v_customer_purchase_history
      WHERE total_transactions > 0
    `;

    const params = [];
    let paramIndex = 1;

    if (customerId) {
      query += ` AND customer_id = $${paramIndex}`;
      params.push(customerId);
      paramIndex++;
    }

    query += ` ORDER BY ${sortColumn} ${order} LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get detailed purchase history for a customer
   */
  async getCustomerTransactionHistory(customerId, options = {}) {
    const { startDate, endDate, limit = 100 } = options;

    let query = `
      SELECT
        source,
        source_id,
        reference_number,
        completed_date,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        sales_rep_name,
        register_name
      FROM v_unified_sales
      WHERE customer_id = $1 AND is_completed = true
    `;

    const params = [customerId];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND completed_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND completed_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY completed_date DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // ============================================
  // SALES REP REPORTS
  // ============================================

  /**
   * Get sales rep performance
   */
  async getSalesRepPerformance(options = {}) {
    const { startDate, endDate } = options;

    // The view handles the complex joins, but we need date filtering
    // So we'll query directly
    let query = `
      SELECT
        COALESCE(q.sales_rep_name, u.first_name || ' ' || u.last_name) as sales_rep,
        COUNT(DISTINCT q.id) as total_quotes,
        COUNT(DISTINCT q.id) FILTER (WHERE q.status IN ('accepted', 'converted')) as quotes_converted,
        COUNT(DISTINCT q.id) FILTER (WHERE q.status = 'rejected') as quotes_lost,
        COALESCE(SUM(q.total_cents) FILTER (WHERE q.status IN ('accepted', 'converted')), 0) / 100.0 as quote_revenue,
        COUNT(DISTINCT t.transaction_id) FILTER (WHERE t.status = 'completed') as pos_transactions,
        COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) as pos_revenue,
        COALESCE(SUM(q.total_cents) FILTER (WHERE q.status IN ('accepted', 'converted')), 0) / 100.0 +
          COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) as total_revenue
      FROM users u
      LEFT JOIN quotations q ON q.sales_rep_name = u.first_name || ' ' || u.last_name
    `;

    const repParams = [];
    if (startDate || endDate) {
      query += ` AND (`;
      if (startDate) {
        repParams.push(startDate);
        query += `q.created_at >= $${repParams.length}`;
      }
      if (startDate && endDate) query += ` AND `;
      if (endDate) {
        repParams.push(endDate);
        query += `q.created_at <= $${repParams.length}`;
      }
      query += `)`;
    }

    query += `
      LEFT JOIN transactions t ON t.user_id = u.id
    `;

    if (startDate || endDate) {
      query += ` AND (`;
      if (startDate) {
        repParams.push(startDate);
        query += `t.created_at >= $${repParams.length}`;
      }
      if (startDate && endDate) query += ` AND `;
      if (endDate) {
        repParams.push(endDate);
        query += `t.created_at <= $${repParams.length}`;
      }
      query += `)`;
    }

    query += `
      WHERE u.role IN ('admin', 'sales', 'manager')
      GROUP BY COALESCE(q.sales_rep_name, u.first_name || ' ' || u.last_name)
      HAVING COUNT(DISTINCT q.id) > 0 OR COUNT(DISTINCT t.transaction_id) > 0
      ORDER BY total_revenue DESC
    `;

    const result = await this.pool.query(query, repParams);

    // Calculate conversion rates
    const withRates = result.rows.map(row => ({
      ...row,
      quote_conversion_rate: row.total_quotes > 0 ?
        ((row.quotes_converted / row.total_quotes) * 100).toFixed(2) : 0,
      avg_quote_value: row.quotes_converted > 0 ?
        (row.quote_revenue / row.quotes_converted).toFixed(2) : 0,
      avg_pos_value: row.pos_transactions > 0 ?
        (row.pos_revenue / row.pos_transactions).toFixed(2) : 0
    }));

    return withRates;
  }

  // ============================================
  // TREND & PATTERN REPORTS
  // ============================================

  /**
   * Get hourly sales patterns
   */
  async getHourlySalesPatterns(options = {}) {
    const { dayOfWeek } = options;

    let query = `
      SELECT
        hour_of_day,
        day_of_week,
        source,
        SUM(transaction_count) as transactions,
        SUM(total_sales) as sales,
        AVG(avg_sale) as avg_sale
      FROM v_hourly_sales_pattern
      WHERE 1=1
    `;

    if (dayOfWeek !== undefined) {
      query += ` AND day_of_week = ${parseInt(dayOfWeek)}`;
    }

    query += `
      GROUP BY hour_of_day, day_of_week, source
      ORDER BY day_of_week, hour_of_day
    `;

    const result = await this.pool.query(query);

    // Format for heatmap
    const heatmapData = {};
    result.rows.forEach(row => {
      const key = `${row.day_of_week}-${row.hour_of_day}`;
      if (!heatmapData[key]) {
        heatmapData[key] = { day: row.day_of_week, hour: row.hour_of_day, quote: 0, pos: 0 };
      }
      heatmapData[key][row.source] = parseFloat(row.sales);
    });

    return {
      raw: result.rows,
      heatmap: Object.values(heatmapData)
    };
  }

  /**
   * Get monthly sales trend
   */
  async getMonthlySalesTrend(options = {}) {
    const { months = 12 } = options;

    const result = await this.pool.query(`
      SELECT *
      FROM v_monthly_sales_trend
      WHERE month >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '${months} months')
      ORDER BY month DESC, source
    `);

    return result.rows;
  }

  // ============================================
  // DASHBOARD SUMMARY
  // ============================================

  /**
   * Get dashboard summary with key metrics
   */
  async getDashboardSummary(options = {}) {
    const today = new Date().toISOString().split('T')[0];
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date();
    startOfMonth.setDate(1);

    // Today's sales
    const todayResult = await this.pool.query(`
      SELECT
        COUNT(*) as transactions,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM v_unified_sales
      WHERE DATE(completed_date) = $1 AND is_completed = true
    `, [today]);

    // This week
    const weekResult = await this.pool.query(`
      SELECT
        COUNT(*) as transactions,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM v_unified_sales
      WHERE completed_date >= $1 AND is_completed = true
    `, [startOfWeek.toISOString().split('T')[0]]);

    // This month
    const monthResult = await this.pool.query(`
      SELECT
        COUNT(*) as transactions,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM v_unified_sales
      WHERE completed_date >= $1 AND is_completed = true
    `, [startOfMonth.toISOString().split('T')[0]]);

    // Quote conversion (this month)
    const conversionResult = await this.pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE conversion_status = 'converted') as converted
      FROM v_quote_conversion
      WHERE quote_date >= $1
    `, [startOfMonth.toISOString().split('T')[0]]);

    const conversionRate = conversionResult.rows[0].total > 0 ?
      ((conversionResult.rows[0].converted / conversionResult.rows[0].total) * 100).toFixed(1) : 0;

    // AOV comparison
    const aovResult = await this.pool.query(`
      SELECT
        source,
        AVG(total_amount) as aov
      FROM v_unified_sales
      WHERE completed_date >= $1 AND is_completed = true
      GROUP BY source
    `, [startOfMonth.toISOString().split('T')[0]]);

    // Top products today
    const topProductsResult = await this.pool.query(`
      SELECT
        product_name,
        SUM(quantity) as units,
        SUM(line_total) as revenue
      FROM v_product_performance
      WHERE sale_date = $1
      GROUP BY product_name
      ORDER BY revenue DESC
      LIMIT 5
    `, [today]);

    return {
      today: {
        transactions: parseInt(todayResult.rows[0].transactions),
        revenue: parseFloat(todayResult.rows[0].revenue)
      },
      thisWeek: {
        transactions: parseInt(weekResult.rows[0].transactions),
        revenue: parseFloat(weekResult.rows[0].revenue)
      },
      thisMonth: {
        transactions: parseInt(monthResult.rows[0].transactions),
        revenue: parseFloat(monthResult.rows[0].revenue)
      },
      quoteConversion: {
        total: parseInt(conversionResult.rows[0].total),
        converted: parseInt(conversionResult.rows[0].converted),
        rate: parseFloat(conversionRate)
      },
      aov: {
        quote: parseFloat(aovResult.rows.find(r => r.source === 'quote')?.aov || 0),
        pos: parseFloat(aovResult.rows.find(r => r.source === 'pos')?.aov || 0)
      },
      topProducts: topProductsResult.rows
    };
  }
}

module.exports = UnifiedReportingService;
