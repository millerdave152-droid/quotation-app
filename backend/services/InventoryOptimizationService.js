/**
 * Inventory Optimization Service
 * Provides intelligent inventory management through:
 * - Demand forecasting per SKU
 * - Automatic reorder point optimization
 * - Safety stock calculations
 * - Dead stock identification
 * - Transfer suggestions between locations
 */

class InventoryOptimizationService {
  constructor(pool) {
    this.pool = pool;

    // Configuration defaults
    this.config = {
      // Service level target (95% = 1.65 safety factor)
      serviceLevelFactor: 1.65,
      // Lead time in days
      defaultLeadTimeDays: 7,
      // Days to analyze for demand calculation
      demandPeriodDays: 90,
      // Days without movement to be considered dead stock
      deadStockThresholdDays: 180,
      // Minimum demand for forecasting
      minDemandThreshold: 2
    };
  }

  /**
   * Get inventory optimization summary
   */
  async getOptimizationSummary() {
    const [stockHealth, reorderNeeded, deadStock, demandForecast] = await Promise.all([
      this.getStockHealthMetrics(),
      this.getProductsNeedingReorder(),
      this.getDeadStock(),
      this.getTopDemandProducts(10)
    ]);

    return {
      stockHealth,
      reorderNeeded: {
        count: reorderNeeded.length,
        totalValue: reorderNeeded.reduce((sum, p) => sum + (p.reorder_cost_cents || 0), 0),
        items: reorderNeeded.slice(0, 10)
      },
      deadStock: {
        count: deadStock.length,
        totalValue: deadStock.reduce((sum, p) => sum + (p.inventory_value_cents || 0), 0),
        items: deadStock.slice(0, 10)
      },
      topDemand: demandForecast
    };
  }

  /**
   * Get stock health metrics
   */
  async getStockHealthMetrics() {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE stock_quantity > reorder_level * 2) as overstock_count,
        COUNT(*) FILTER (WHERE stock_quantity > reorder_level AND stock_quantity <= reorder_level * 2) as healthy_count,
        COUNT(*) FILTER (WHERE stock_quantity <= reorder_level AND stock_quantity > 0) as low_count,
        COUNT(*) FILTER (WHERE stock_quantity <= 0) as out_of_stock_count,
        COUNT(*) as total_products,
        COALESCE(SUM(stock_quantity * base_price_cents), 0) as total_inventory_value_cents,
        COALESCE(SUM(CASE WHEN stock_quantity <= reorder_level THEN stock_quantity * base_price_cents ELSE 0 END), 0) as at_risk_value_cents
      FROM products
      WHERE active = true
    `);

    const metrics = result.rows[0];
    const total = parseInt(metrics.total_products) || 1;

    return {
      overstock: {
        count: parseInt(metrics.overstock_count) || 0,
        percentage: Math.round((metrics.overstock_count / total) * 100)
      },
      healthy: {
        count: parseInt(metrics.healthy_count) || 0,
        percentage: Math.round((metrics.healthy_count / total) * 100)
      },
      low: {
        count: parseInt(metrics.low_count) || 0,
        percentage: Math.round((metrics.low_count / total) * 100)
      },
      outOfStock: {
        count: parseInt(metrics.out_of_stock_count) || 0,
        percentage: Math.round((metrics.out_of_stock_count / total) * 100)
      },
      totalProducts: total,
      totalInventoryValue: parseInt(metrics.total_inventory_value_cents) || 0,
      atRiskValue: parseInt(metrics.at_risk_value_cents) || 0
    };
  }

  /**
   * Calculate demand forecast for a product
   * Uses weighted moving average with recent sales having more weight
   */
  async calculateDemandForecast(productId) {
    // Get historical sales data
    const result = await this.pool.query(`
      WITH weekly_sales AS (
        SELECT
          date_trunc('week', q.won_at) as week_start,
          SUM(qi.quantity) as units_sold
        FROM quote_items qi
        JOIN quotations q ON qi.quotation_id = q.id
        WHERE qi.product_id = $1
          AND q.status = 'WON'
          AND q.won_at > NOW() - INTERVAL '${this.config.demandPeriodDays} days'
        GROUP BY date_trunc('week', q.won_at)
        ORDER BY week_start
      )
      SELECT
        array_agg(units_sold ORDER BY week_start) as weekly_units,
        COUNT(*) as weeks_with_sales,
        SUM(units_sold) as total_units,
        AVG(units_sold) as avg_weekly_units,
        STDDEV(units_sold) as stddev_weekly_units
      FROM weekly_sales
    `, [productId]);

    const data = result.rows[0];

    if (!data.weekly_units || data.weekly_units.length === 0) {
      return {
        productId,
        hasData: false,
        averageDailyDemand: 0,
        averageWeeklyDemand: 0,
        demandVariability: 0,
        forecastNextWeek: 0,
        forecastNextMonth: 0,
        confidence: 'low'
      };
    }

    const weeklyUnits = data.weekly_units;
    const avgWeekly = parseFloat(data.avg_weekly_units) || 0;
    const stddev = parseFloat(data.stddev_weekly_units) || 0;

    // Calculate weighted moving average (more weight to recent weeks)
    let weightedSum = 0;
    let weightTotal = 0;
    weeklyUnits.forEach((units, index) => {
      const weight = index + 1; // More recent = higher weight
      weightedSum += units * weight;
      weightTotal += weight;
    });
    const weightedAvg = weightTotal > 0 ? weightedSum / weightTotal : 0;

    // Calculate demand variability (coefficient of variation)
    const cv = avgWeekly > 0 ? (stddev / avgWeekly) * 100 : 0;

    // Determine forecast confidence
    let confidence = 'high';
    if (weeklyUnits.length < 4) confidence = 'low';
    else if (cv > 50) confidence = 'medium';

    return {
      productId,
      hasData: true,
      weeksAnalyzed: weeklyUnits.length,
      totalUnitsSold: parseInt(data.total_units) || 0,
      averageWeeklyDemand: Math.round(avgWeekly * 10) / 10,
      averageDailyDemand: Math.round((avgWeekly / 7) * 10) / 10,
      weightedWeeklyDemand: Math.round(weightedAvg * 10) / 10,
      demandVariability: Math.round(cv),
      forecastNextWeek: Math.round(weightedAvg),
      forecastNextMonth: Math.round(weightedAvg * 4),
      confidence,
      trend: this.calculateTrend(weeklyUnits)
    };
  }

  /**
   * Calculate trend from historical data
   */
  calculateTrend(weeklyUnits) {
    if (weeklyUnits.length < 3) return 'stable';

    const recentHalf = weeklyUnits.slice(-Math.ceil(weeklyUnits.length / 2));
    const olderHalf = weeklyUnits.slice(0, Math.floor(weeklyUnits.length / 2));

    const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length;

    const change = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

    if (change > 20) return 'increasing';
    if (change < -20) return 'decreasing';
    return 'stable';
  }

  /**
   * Calculate optimal reorder point and safety stock
   */
  async calculateReorderOptimization(productId) {
    const forecast = await this.calculateDemandForecast(productId);

    // Get product info
    const product = await this.pool.query(`
      SELECT
        id, name, sku, stock_quantity, reorder_level, cost_price_cents,
        base_price_cents
      FROM products
      WHERE id = $1
    `, [productId]);

    if (product.rows.length === 0) {
      return null;
    }

    const p = product.rows[0];
    const leadTimeDays = this.config.defaultLeadTimeDays;
    const serviceFactor = this.config.serviceLevelFactor;

    // Calculate safety stock: SS = Z * σ * √L
    // Where Z = service level factor, σ = demand std dev, L = lead time
    const dailyDemand = forecast.averageDailyDemand;
    const demandStdDev = (forecast.demandVariability / 100) * dailyDemand;
    const safetyStock = Math.ceil(serviceFactor * demandStdDev * Math.sqrt(leadTimeDays));

    // Calculate reorder point: ROP = (Daily Demand × Lead Time) + Safety Stock
    const optimalReorderPoint = Math.ceil((dailyDemand * leadTimeDays) + safetyStock);

    // Calculate economic order quantity (simplified)
    // EOQ = √(2DS/H) where D=annual demand, S=order cost, H=holding cost
    const annualDemand = dailyDemand * 365;
    const orderCost = 5000; // Assumed $50 per order
    const holdingCostRate = 0.25; // 25% of item cost
    const holdingCost = (p.cost_price_cents || p.base_price_cents * 0.6) * holdingCostRate;
    const eoq = holdingCost > 0
      ? Math.ceil(Math.sqrt((2 * annualDemand * orderCost) / holdingCost))
      : Math.ceil(dailyDemand * 30);

    // Determine stock status
    const currentStock = p.stock_quantity || 0;
    let stockStatus = 'healthy';
    if (currentStock <= 0) stockStatus = 'out_of_stock';
    else if (currentStock <= optimalReorderPoint) stockStatus = 'reorder_now';
    else if (currentStock <= optimalReorderPoint * 1.5) stockStatus = 'watch';
    else if (currentStock > eoq * 2) stockStatus = 'overstock';

    return {
      productId,
      productName: p.name,
      sku: p.sku,
      currentStock,
      currentReorderLevel: p.reorder_level,
      forecast: {
        dailyDemand: forecast.averageDailyDemand,
        weeklyDemand: forecast.averageWeeklyDemand,
        monthlyDemand: forecast.forecastNextMonth,
        trend: forecast.trend,
        confidence: forecast.confidence
      },
      optimization: {
        optimalReorderPoint,
        safetyStock,
        economicOrderQty: eoq,
        leadTimeDays,
        reorderPointChange: optimalReorderPoint - (p.reorder_level || 0)
      },
      stockStatus,
      recommendation: this.getReorderRecommendation(stockStatus, currentStock, optimalReorderPoint, eoq),
      daysOfStock: dailyDemand > 0 ? Math.round(currentStock / dailyDemand) : null
    };
  }

  /**
   * Get reorder recommendation text
   */
  getReorderRecommendation(status, currentStock, reorderPoint, eoq) {
    switch (status) {
      case 'out_of_stock':
        return `URGENT: Order ${eoq} units immediately. Product is out of stock.`;
      case 'reorder_now':
        return `Reorder ${eoq} units soon. Stock is below reorder point.`;
      case 'watch':
        return `Monitor stock levels. Will need reorder within 1-2 weeks.`;
      case 'overstock':
        return `Consider promotions or reduced ordering. Stock is 2x+ the optimal level.`;
      default:
        return `Stock levels are healthy. Review in ${Math.round(currentStock / (reorderPoint / 7))} weeks.`;
    }
  }

  /**
   * Get products that need reordering
   */
  async getProductsNeedingReorder(limit = 50) {
    const result = await this.pool.query(`
      SELECT
        p.id,
        p.name,
        p.sku,
        p.stock_quantity,
        p.reorder_level,
        p.cost_price_cents,
        p.base_price_cents,
        p.category,
        (p.reorder_level - p.stock_quantity) as units_needed,
        ((p.reorder_level - p.stock_quantity) * COALESCE(p.cost_price_cents, p.base_price_cents * 0.6)) as reorder_cost_cents
      FROM products p
      WHERE p.active = true
        AND p.stock_quantity <= p.reorder_level
        AND p.reorder_level > 0
      ORDER BY
        CASE WHEN p.stock_quantity <= 0 THEN 0 ELSE 1 END,
        (p.reorder_level - p.stock_quantity) DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  /**
   * Get dead stock (items with no movement)
   */
  async getDeadStock(limit = 50) {
    const result = await this.pool.query(`
      WITH last_sale AS (
        SELECT
          qi.product_id,
          MAX(q.won_at) as last_sold_at,
          SUM(qi.quantity) as total_sold
        FROM quote_items qi
        JOIN quotations q ON qi.quotation_id = q.id
        WHERE q.status = 'WON'
        GROUP BY qi.product_id
      )
      SELECT
        p.id,
        p.name,
        p.sku,
        p.stock_quantity,
        p.base_price_cents,
        p.cost_price_cents,
        p.category,
        (p.stock_quantity * COALESCE(p.cost_price_cents, p.base_price_cents * 0.6)) as inventory_value_cents,
        ls.last_sold_at,
        ls.total_sold,
        EXTRACT(days FROM NOW() - ls.last_sold_at) as days_since_last_sale
      FROM products p
      LEFT JOIN last_sale ls ON p.id = ls.product_id
      WHERE p.active = true
        AND p.stock_quantity > 0
        AND (
          ls.last_sold_at IS NULL
          OR ls.last_sold_at < NOW() - INTERVAL '${this.config.deadStockThresholdDays} days'
        )
      ORDER BY inventory_value_cents DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
      ...row,
      recommendation: row.last_sold_at
        ? 'Consider clearance pricing or bundling with popular items'
        : 'Never sold - evaluate for discontinuation or marketing push'
    }));
  }

  /**
   * Get top demand products
   */
  async getTopDemandProducts(limit = 10) {
    const result = await this.pool.query(`
      SELECT
        p.id,
        p.name,
        p.sku,
        p.stock_quantity,
        p.reorder_level,
        p.category,
        COUNT(qi.id) as order_count,
        SUM(qi.quantity) as total_units_sold,
        SUM(qi.line_total_cents) as total_revenue_cents,
        AVG(qi.quantity) as avg_order_qty
      FROM products p
      JOIN quote_items qi ON p.id = qi.product_id
      JOIN quotations q ON qi.quotation_id = q.id
      WHERE q.status = 'WON'
        AND q.won_at > NOW() - INTERVAL '30 days'
        AND p.active = true
      GROUP BY p.id, p.name, p.sku, p.stock_quantity, p.reorder_level, p.category
      ORDER BY total_units_sold DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
      ...row,
      velocityScore: Math.round((parseInt(row.total_units_sold) / 30) * 10) / 10,
      stockDaysRemaining: row.stock_quantity && row.total_units_sold
        ? Math.round(row.stock_quantity / (row.total_units_sold / 30))
        : null
    }));
  }

  /**
   * Get inventory turnover analysis
   */
  async getInventoryTurnover(days = 365) {
    const result = await this.pool.query(`
      WITH sales_data AS (
        SELECT
          p.category,
          SUM(qi.quantity * COALESCE(p.cost_price_cents, p.base_price_cents * 0.6)) as cogs_cents,
          AVG(p.stock_quantity * COALESCE(p.cost_price_cents, p.base_price_cents * 0.6)) as avg_inventory_cents
        FROM products p
        LEFT JOIN quote_items qi ON p.id = qi.product_id
        LEFT JOIN quotations q ON qi.quotation_id = q.id
          AND q.status = 'WON'
          AND q.won_at > NOW() - INTERVAL '${days} days'
        WHERE p.active = true
        GROUP BY p.category
      )
      SELECT
        category,
        cogs_cents,
        avg_inventory_cents,
        CASE
          WHEN avg_inventory_cents > 0 THEN ROUND((cogs_cents / avg_inventory_cents)::numeric, 2)
          ELSE 0
        END as turnover_ratio,
        CASE
          WHEN cogs_cents > 0 THEN ROUND((avg_inventory_cents / (cogs_cents / ${days}))::numeric, 0)
          ELSE 0
        END as days_inventory
      FROM sales_data
      WHERE category IS NOT NULL
      ORDER BY turnover_ratio DESC
    `);

    return result.rows;
  }

  /**
   * Get ABC analysis (Pareto classification)
   */
  async getABCAnalysis() {
    const result = await this.pool.query(`
      WITH product_revenue AS (
        SELECT
          p.id,
          p.name,
          p.sku,
          p.category,
          p.stock_quantity,
          COALESCE(SUM(qi.line_total_cents), 0) as total_revenue_cents
        FROM products p
        LEFT JOIN quote_items qi ON p.id = qi.product_id
        LEFT JOIN quotations q ON qi.quotation_id = q.id
          AND q.status = 'WON'
          AND q.won_at > NOW() - INTERVAL '365 days'
        WHERE p.active = true
        GROUP BY p.id, p.name, p.sku, p.category, p.stock_quantity
      ),
      ranked AS (
        SELECT
          *,
          SUM(total_revenue_cents) OVER (ORDER BY total_revenue_cents DESC) as cumulative_revenue,
          SUM(total_revenue_cents) OVER () as grand_total
        FROM product_revenue
      )
      SELECT
        id,
        name,
        sku,
        category,
        stock_quantity,
        total_revenue_cents,
        ROUND((cumulative_revenue::float / NULLIF(grand_total, 0) * 100)::numeric, 1) as cumulative_percent,
        CASE
          WHEN cumulative_revenue <= grand_total * 0.8 THEN 'A'
          WHEN cumulative_revenue <= grand_total * 0.95 THEN 'B'
          ELSE 'C'
        END as abc_class
      FROM ranked
      ORDER BY total_revenue_cents DESC
    `);

    // Count by class
    const classes = { A: 0, B: 0, C: 0 };
    result.rows.forEach(row => {
      classes[row.abc_class]++;
    });

    return {
      products: result.rows,
      summary: {
        classA: { count: classes.A, description: 'Top 80% revenue - Critical items' },
        classB: { count: classes.B, description: 'Next 15% revenue - Important items' },
        classC: { count: classes.C, description: 'Bottom 5% revenue - Low-priority items' }
      }
    };
  }

  /**
   * Generate purchase order suggestions
   */
  async generatePOSuggestions() {
    const needsReorder = await this.getProductsNeedingReorder(100);

    // Group by vendor/supplier if available
    const suggestions = [];

    for (const product of needsReorder) {
      const optimization = await this.calculateReorderOptimization(product.id);

      if (optimization) {
        suggestions.push({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          category: product.category,
          currentStock: product.stock_quantity,
          reorderLevel: product.reorder_level,
          suggestedQty: optimization.optimization.economicOrderQty,
          estimatedCost: optimization.optimization.economicOrderQty *
            (product.cost_price_cents || Math.round(product.base_price_cents * 0.6)),
          urgency: product.stock_quantity <= 0 ? 'critical' :
                   product.stock_quantity <= product.reorder_level * 0.5 ? 'high' : 'normal',
          daysOfStock: optimization.daysOfStock
        });
      }
    }

    // Sort by urgency
    suggestions.sort((a, b) => {
      const urgencyOrder = { critical: 0, high: 1, normal: 2 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });

    return {
      suggestions,
      totalItems: suggestions.length,
      totalEstimatedCost: suggestions.reduce((sum, s) => sum + s.estimatedCost, 0),
      criticalCount: suggestions.filter(s => s.urgency === 'critical').length,
      highCount: suggestions.filter(s => s.urgency === 'high').length
    };
  }
}

module.exports = InventoryOptimizationService;
