/**
 * PurchasingIntelligenceService
 *
 * AI-powered purchasing intelligence system that:
 * - Analyzes product sales trends (7/30/90 day moving averages)
 * - Forecasts future demand using trend extrapolation
 * - Detects seasonality patterns
 * - Generates purchasing recommendations
 * - Provides LLM-powered executive summaries
 */

let pool = require('../db');

class PurchasingIntelligenceService {
  constructor() {
    this.aiClient = null;
    this.initAIClient();
  }

  /**
   * Initialize AI client for generating summaries
   */
  initAIClient() {
    if (process.env.OPENAI_API_KEY) {
      try {
        const OpenAI = require('openai');
        this.aiClient = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });
        this.aiModel = process.env.AI_MODEL || 'gpt-4o-mini';
      } catch (err) {
        console.log('OpenAI client not available, AI summaries will be disabled');
      }
    }
  }

  // ==================== TREND ANALYSIS ====================

  /**
   * Calculate moving averages for a product
   * @param {number} productId - Product ID
   * @param {number[]} periods - Array of period lengths in days
   * @returns {Object} Moving averages for each period
   */
  async calculateMovingAverages(productId, periods = [7, 30, 90]) {
    const results = {};

    for (const days of periods) {
      const query = `
        SELECT
          COALESCE(SUM(oi.quantity), 0)::float / $2 as avg_daily_sales,
          COALESCE(SUM(oi.quantity * oi.unit_price), 0)::float / $2 as avg_daily_revenue,
          COUNT(DISTINCT o.id) as order_count
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE oi.product_id = $1
          AND o.created_at >= NOW() - INTERVAL '${days} days'
          AND o.status NOT IN ('cancelled', 'refunded')
      `;

      const result = await pool.query(query, [productId, days]);
      const row = result.rows[0];

      results[`ma_${days}d`] = parseFloat(row.avg_daily_sales) || 0;
      results[`revenue_${days}d`] = parseFloat(row.avg_daily_revenue) || 0;
      results[`orders_${days}d`] = parseInt(row.order_count) || 0;
    }

    return results;
  }

  /**
   * Calculate growth rates between periods
   * @param {number} productId - Product ID
   * @returns {Object} Growth rates
   */
  async calculateGrowthRates(productId) {
    const ma = await this.calculateMovingAverages(productId, [7, 30, 90]);

    // Avoid division by zero
    const growth7d = ma.ma_30d > 0 ? (ma.ma_7d - ma.ma_30d) / ma.ma_30d : 0;
    const growth30d = ma.ma_90d > 0 ? (ma.ma_30d - ma.ma_90d) / ma.ma_90d : 0;

    return {
      growth_7d: growth7d,
      growth_30d: growth30d,
      ma_7d: ma.ma_7d,
      ma_30d: ma.ma_30d,
      ma_90d: ma.ma_90d,
      trend_direction: growth30d > 0.05 ? 'increasing' :
                       growth30d < -0.05 ? 'decreasing' : 'stable'
    };
  }

  /**
   * Detect seasonality patterns for a product
   * @param {number} productId - Product ID
   * @returns {Object} Seasonality data
   */
  async detectSeasonality(productId) {
    // Get monthly sales for the past year
    const query = `
      SELECT
        EXTRACT(MONTH FROM o.created_at)::int as month,
        SUM(oi.quantity) as total_units,
        COUNT(DISTINCT o.id) as order_count
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.product_id = $1
        AND o.created_at >= NOW() - INTERVAL '12 months'
        AND o.status NOT IN ('cancelled', 'refunded')
      GROUP BY EXTRACT(MONTH FROM o.created_at)
      ORDER BY month
    `;

    const result = await pool.query(query, [productId]);

    if (result.rows.length === 0) {
      return {
        has_seasonality: false,
        patterns: [],
        current_month_index: 1.0
      };
    }

    // Calculate average monthly sales
    const totalUnits = result.rows.reduce((sum, r) => sum + parseFloat(r.total_units), 0);
    const avgMonthly = totalUnits / 12;

    // Calculate seasonality index for each month
    const patterns = result.rows.map(row => ({
      month: row.month,
      seasonality_index: avgMonthly > 0 ? parseFloat(row.total_units) / avgMonthly : 1.0,
      sample_size: parseInt(row.order_count)
    }));

    // Get current month's seasonality index
    const currentMonth = new Date().getMonth() + 1;
    const currentPattern = patterns.find(p => p.month === currentMonth);

    // Store patterns in database
    for (const pattern of patterns) {
      await pool.query(`
        INSERT INTO purchasing_seasonality_patterns
          (product_id, month, seasonality_index, sample_size, last_updated)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (product_id, month, day_of_week) DO UPDATE
        SET seasonality_index = EXCLUDED.seasonality_index,
            sample_size = EXCLUDED.sample_size,
            last_updated = NOW()
      `, [productId, pattern.month, pattern.seasonality_index, pattern.sample_size]);
    }

    return {
      has_seasonality: patterns.some(p => p.seasonality_index > 1.3 || p.seasonality_index < 0.7),
      patterns,
      current_month_index: currentPattern?.seasonality_index || 1.0
    };
  }

  // ==================== FORECASTING ====================

  /**
   * Forecast demand for a product
   * @param {number} productId - Product ID
   * @param {number} daysAhead - Days to forecast
   * @returns {Object} Forecast data
   */
  async forecastDemand(productId, daysAhead = 30) {
    const growth = await this.calculateGrowthRates(productId);
    const seasonality = await this.detectSeasonality(productId);

    // Base forecast on 30-day average
    const baselineDemand = growth.ma_30d * daysAhead;

    // Apply trend adjustment
    const trendMultiplier = 1 + (growth.growth_30d * (daysAhead / 30));

    // Apply seasonality adjustment
    const seasonalityMultiplier = seasonality.current_month_index;

    // Calculate final forecast
    const predictedDemand = Math.round(baselineDemand * trendMultiplier * seasonalityMultiplier);

    // Calculate confidence score based on data quality
    const confidence = this.calculateConfidence(growth);

    const forecast = {
      product_id: productId,
      predicted_demand: Math.max(0, predictedDemand),
      confidence_score: confidence,
      trend_direction: growth.trend_direction,
      seasonality_factor: seasonalityMultiplier,
      base_daily_rate: growth.ma_30d,
      growth_rate: growth.growth_30d
    };

    // Store forecast
    await pool.query(`
      INSERT INTO purchasing_forecasts
        (product_id, forecast_date, predicted_demand, confidence_score, trend_direction, seasonality_factor)
      VALUES ($1, NOW() + INTERVAL '${daysAhead} days', $2, $3, $4, $5)
    `, [productId, forecast.predicted_demand, confidence, growth.trend_direction, seasonalityMultiplier]);

    return forecast;
  }

  /**
   * Calculate confidence score for predictions
   * @param {Object} growth - Growth data
   * @returns {number} Confidence score 0-1
   */
  calculateConfidence(growth) {
    let score = 0.5; // Base score

    // Higher confidence if we have consistent data
    if (growth.orders_30d >= 10) score += 0.2;
    if (growth.orders_90d >= 30) score += 0.1;

    // Lower confidence if growth rate is erratic
    if (Math.abs(growth.growth_7d - growth.growth_30d) > 0.5) {
      score -= 0.2;
    }

    // Higher confidence for stable products
    if (growth.trend_direction === 'stable') score += 0.1;

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Calculate days until stock runs out
   * @param {number} productId - Product ID
   * @returns {Object} Stock runout data
   */
  async calculateStockRunout(productId) {
    // Get current stock
    const stockQuery = await pool.query(`
      SELECT
        p.id,
        p.name,
        COALESCE(p.qty_on_hand, 0) as current_stock,
        COALESCE(p.reorder_point, 0) as min_stock
      FROM products p
      WHERE p.id = $1
    `, [productId]);

    if (stockQuery.rows.length === 0) {
      return { product_id: productId, days_remaining: null, error: 'Product not found' };
    }

    const product = stockQuery.rows[0];
    const growth = await this.calculateGrowthRates(productId);

    const currentStock = parseInt(product.current_stock) || 0;
    const avgDailySales = growth.ma_30d;

    const daysRemaining = avgDailySales > 0
      ? Math.floor(currentStock / avgDailySales)
      : 999; // No sales, stock won't run out

    return {
      product_id: productId,
      product_name: product.name,
      current_stock: currentStock,
      min_stock: parseInt(product.min_stock) || 0,
      avg_daily_sales: avgDailySales,
      days_remaining: daysRemaining,
      needs_restock: daysRemaining <= 14
    };
  }

  // ==================== RECOMMENDATIONS ====================

  /**
   * Generate purchasing recommendations for all products
   * @returns {Array} Recommendations
   */
  async generateRecommendations() {
    // Get active products with sales history
    const productsQuery = await pool.query(`
      SELECT DISTINCT p.id, p.name, p.model as sku, p.category, p.manufacturer,
        COALESCE(p.qty_on_hand, 0) as current_stock,
        COALESCE(p.reorder_point, 0) as min_stock,
        p.sell_price
      FROM products p
      JOIN order_items oi ON p.id = oi.product_id
      JOIN orders o ON oi.order_id = o.id
      WHERE p.active = true
        AND o.created_at >= NOW() - INTERVAL '90 days'
        AND o.status NOT IN ('cancelled', 'refunded')
    `);

    const recommendations = [];

    for (const product of productsQuery.rows) {
      try {
        const stockRunout = await this.calculateStockRunout(product.id);
        const forecast = await this.forecastDemand(product.id, 30);

        // Critical: Out of stock or running out soon
        if (stockRunout.days_remaining <= 3) {
          recommendations.push({
            product_id: product.id,
            product_name: product.name,
            sku: product.sku,
            recommendation_type: 'restock',
            priority: 'critical',
            suggested_quantity: Math.max(forecast.predicted_demand, stockRunout.min_stock * 2),
            reasoning: `CRITICAL: Only ${stockRunout.days_remaining} days of stock remaining (${stockRunout.current_stock} units)`,
            current_stock: stockRunout.current_stock,
            avg_daily_sales: stockRunout.avg_daily_sales,
            days_of_stock_remaining: stockRunout.days_remaining
          });
        }
        // High: Running low
        else if (stockRunout.days_remaining <= 7) {
          recommendations.push({
            product_id: product.id,
            product_name: product.name,
            sku: product.sku,
            recommendation_type: 'restock',
            priority: 'high',
            suggested_quantity: forecast.predicted_demand,
            reasoning: `Running low: ${stockRunout.days_remaining} days of stock remaining`,
            current_stock: stockRunout.current_stock,
            avg_daily_sales: stockRunout.avg_daily_sales,
            days_of_stock_remaining: stockRunout.days_remaining
          });
        }
        // Medium: Approaching minimum
        else if (stockRunout.days_remaining <= 14) {
          recommendations.push({
            product_id: product.id,
            product_name: product.name,
            sku: product.sku,
            recommendation_type: 'restock',
            priority: 'medium',
            suggested_quantity: Math.round(forecast.predicted_demand * 0.8),
            reasoning: `Approaching minimum stock: ${stockRunout.days_remaining} days remaining`,
            current_stock: stockRunout.current_stock,
            avg_daily_sales: stockRunout.avg_daily_sales,
            days_of_stock_remaining: stockRunout.days_remaining
          });
        }
        // Trending up - increase order
        else if (forecast.trend_direction === 'increasing' && forecast.confidence_score > 0.6) {
          recommendations.push({
            product_id: product.id,
            product_name: product.name,
            sku: product.sku,
            recommendation_type: 'increase_order',
            priority: 'medium',
            suggested_quantity: Math.round(forecast.predicted_demand * 1.2),
            reasoning: `Demand trending up ${(forecast.growth_rate * 100).toFixed(1)}% - consider increasing next order`,
            current_stock: stockRunout.current_stock,
            avg_daily_sales: stockRunout.avg_daily_sales,
            days_of_stock_remaining: stockRunout.days_remaining
          });
        }
        // Trending down - reduce order
        else if (forecast.trend_direction === 'decreasing' && forecast.confidence_score > 0.6) {
          recommendations.push({
            product_id: product.id,
            product_name: product.name,
            sku: product.sku,
            recommendation_type: 'reduce_order',
            priority: 'low',
            suggested_quantity: Math.round(forecast.predicted_demand * 0.7),
            reasoning: `Demand declining ${(Math.abs(forecast.growth_rate) * 100).toFixed(1)}% - consider reducing next order`,
            current_stock: stockRunout.current_stock,
            avg_daily_sales: stockRunout.avg_daily_sales,
            days_of_stock_remaining: stockRunout.days_remaining
          });
        }
      } catch (err) {
        console.error(`Error generating recommendation for product ${product.id}:`, err.message);
      }
    }

    // Store recommendations
    await this.storeRecommendations(recommendations);

    return this.prioritizeRecommendations(recommendations);
  }

  /**
   * Store recommendations in database
   * @param {Array} recommendations
   */
  async storeRecommendations(recommendations) {
    // Clear old unacknowledged recommendations
    await pool.query(`
      DELETE FROM purchasing_recommendations
      WHERE acknowledged_at IS NULL
        AND created_at < NOW() - INTERVAL '7 days'
    `);

    for (const rec of recommendations) {
      await pool.query(`
        INSERT INTO purchasing_recommendations
          (product_id, recommendation_type, priority, suggested_quantity, reasoning,
           current_stock, avg_daily_sales, days_of_stock_remaining)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        rec.product_id,
        rec.recommendation_type,
        rec.priority,
        rec.suggested_quantity,
        rec.reasoning,
        rec.current_stock,
        rec.avg_daily_sales,
        rec.days_of_stock_remaining
      ]);
    }
  }

  /**
   * Prioritize and sort recommendations
   * @param {Array} recommendations
   * @returns {Array} Sorted recommendations
   */
  prioritizeRecommendations(recommendations) {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

    return recommendations.sort((a, b) => {
      // First by priority
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Then by days remaining (lower first)
      return (a.days_of_stock_remaining || 999) - (b.days_of_stock_remaining || 999);
    });
  }

  /**
   * Acknowledge a recommendation
   * @param {number} recommendationId
   * @param {number} userId
   */
  async acknowledgeRecommendation(recommendationId, userId) {
    await pool.query(`
      UPDATE purchasing_recommendations
      SET acknowledged_at = NOW(), acknowledged_by = $2
      WHERE id = $1
    `, [recommendationId, userId]);
  }

  // ==================== AI INTEGRATION ====================

  /**
   * Generate AI-powered executive summary
   * @param {Object} analysisData - Data to summarize
   * @returns {string} AI-generated summary
   */
  async generateAISummary(analysisData) {
    if (!this.aiClient) {
      return this.generateStatisticalSummary(analysisData);
    }

    try {
      const prompt = `You are a purchasing intelligence analyst for a retail business.
Analyze the following data and provide a brief executive summary with actionable insights.

Top Selling Products (Last 30 Days):
${JSON.stringify(analysisData.topProducts?.slice(0, 10) || [], null, 2)}

Products Trending Up:
${JSON.stringify(analysisData.trendingUp?.slice(0, 5) || [], null, 2)}

Products Trending Down:
${JSON.stringify(analysisData.trendingDown?.slice(0, 5) || [], null, 2)}

Critical Stock Alerts (need immediate action):
${JSON.stringify(analysisData.criticalAlerts?.slice(0, 5) || [], null, 2)}

Total products analyzed: ${analysisData.productsAnalyzed || 0}
Total recommendations: ${analysisData.totalRecommendations || 0}

Provide:
1. A 2-3 sentence executive summary highlighting the most important points
2. Top 3 recommended actions with specific product mentions
3. Any concerning trends to monitor

Keep the response concise and action-oriented.`;

      const response = await this.aiClient.chat.completions.create({
        model: this.aiModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3
      });

      return response.choices[0]?.message?.content || this.generateStatisticalSummary(analysisData);
    } catch (err) {
      console.error('AI summary generation failed:', err.message);
      return this.generateStatisticalSummary(analysisData);
    }
  }

  /**
   * Generate statistical summary when AI is not available
   * @param {Object} data - Analysis data
   * @returns {string} Summary text
   */
  generateStatisticalSummary(data) {
    const lines = [];

    lines.push(`## Purchasing Intelligence Summary\n`);
    lines.push(`Analyzed ${data.productsAnalyzed || 0} products with sales activity.\n`);

    if (data.criticalAlerts?.length > 0) {
      lines.push(`\n### Critical Actions Required`);
      lines.push(`${data.criticalAlerts.length} products need immediate restocking:\n`);
      data.criticalAlerts.slice(0, 3).forEach(p => {
        lines.push(`- **${p.product_name}**: ${p.days_of_stock_remaining} days of stock remaining`);
      });
    }

    if (data.trendingUp?.length > 0) {
      lines.push(`\n### Trending Up`);
      lines.push(`${data.trendingUp.length} products showing increasing demand.`);
    }

    if (data.trendingDown?.length > 0) {
      lines.push(`\n### Declining Products`);
      lines.push(`${data.trendingDown.length} products showing decreasing demand - consider reducing orders.`);
    }

    return lines.join('\n');
  }

  // ==================== MAIN ANALYSIS ====================

  /**
   * Run full analysis and generate recommendations
   * @param {string} runType - 'daily', 'weekly', or 'manual'
   * @returns {Object} Analysis results
   */
  async runFullAnalysis(runType = 'daily') {
    // Create run record
    const runResult = await pool.query(`
      INSERT INTO purchasing_agent_runs (run_type, status)
      VALUES ($1, 'running')
      RETURNING id
    `, [runType]);

    const runId = runResult.rows[0].id;

    try {
      // Generate recommendations
      const recommendations = await this.generateRecommendations();

      // Get trending products
      const trendingUp = recommendations
        .filter(r => r.recommendation_type === 'increase_order')
        .slice(0, 10);

      const trendingDown = recommendations
        .filter(r => r.recommendation_type === 'reduce_order')
        .slice(0, 10);

      const criticalAlerts = recommendations
        .filter(r => r.priority === 'critical')
        .slice(0, 10);

      // Get top selling products
      const topProductsQuery = await pool.query(`
        SELECT p.id, p.name, p.model as sku,
          SUM(oi.quantity) as total_units,
          SUM(oi.quantity * oi.unit_price) as total_revenue
        FROM products p
        JOIN order_items oi ON p.id = oi.product_id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.created_at >= NOW() - INTERVAL '30 days'
          AND o.status NOT IN ('cancelled', 'refunded')
        GROUP BY p.id, p.name, p.model as sku
        ORDER BY total_units DESC
        LIMIT 20
      `);

      const analysisData = {
        productsAnalyzed: recommendations.length,
        totalRecommendations: recommendations.length,
        topProducts: topProductsQuery.rows,
        trendingUp,
        trendingDown,
        criticalAlerts,
        recommendations
      };

      // Generate AI summary
      const aiSummary = await this.generateAISummary(analysisData);

      // Update run record
      await pool.query(`
        UPDATE purchasing_agent_runs
        SET status = 'completed',
            completed_at = NOW(),
            products_analyzed = $2,
            recommendations_generated = $3,
            ai_summary = $4
        WHERE id = $1
      `, [runId, analysisData.productsAnalyzed, recommendations.length, aiSummary]);

      return {
        runId,
        ...analysisData,
        aiSummary
      };

    } catch (error) {
      // Update run record with error
      await pool.query(`
        UPDATE purchasing_agent_runs
        SET status = 'failed',
            completed_at = NOW(),
            error_message = $2
        WHERE id = $1
      `, [runId, error.message]);

      throw error;
    }
  }

  /**
   * Get dashboard data for frontend
   * @returns {Object} Dashboard data
   */
  async getAnalyticsDashboard() {
    // Get latest recommendations
    const recommendations = await pool.query(`
      SELECT r.*, p.name as product_name, p.model as sku
      FROM purchasing_recommendations r
      JOIN products p ON r.product_id = p.id
      WHERE r.acknowledged_at IS NULL
      ORDER BY
        CASE r.priority
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        r.created_at DESC
      LIMIT 50
    `);

    // Get recent run stats
    const runsQuery = await pool.query(`
      SELECT *
      FROM purchasing_agent_runs
      ORDER BY started_at DESC
      LIMIT 10
    `);

    // Get summary stats
    const statsQuery = await pool.query(`
      SELECT
        COUNT(*) as total_recommendations,
        COUNT(*) FILTER (WHERE priority = 'critical') as critical_count,
        COUNT(*) FILTER (WHERE priority = 'high') as high_count,
        COUNT(*) FILTER (WHERE recommendation_type = 'restock') as restock_count,
        COUNT(*) FILTER (WHERE recommendation_type = 'increase_order') as trending_up_count,
        COUNT(*) FILTER (WHERE recommendation_type = 'reduce_order') as trending_down_count
      FROM purchasing_recommendations
      WHERE acknowledged_at IS NULL
    `);

    // Get latest AI summary
    const latestSummary = await pool.query(`
      SELECT ai_summary, completed_at
      FROM purchasing_agent_runs
      WHERE status = 'completed' AND ai_summary IS NOT NULL
      ORDER BY completed_at DESC
      LIMIT 1
    `);

    return {
      recommendations: recommendations.rows,
      recentRuns: runsQuery.rows,
      stats: statsQuery.rows[0],
      aiSummary: latestSummary.rows[0]?.ai_summary || null,
      lastAnalysisAt: latestSummary.rows[0]?.completed_at || null
    };
  }

  /**
   * Get trend data for a specific product
   * @param {number} productId
   * @returns {Object} Trend data
   */
  async getProductTrends(productId) {
    const growth = await this.calculateGrowthRates(productId);
    const seasonality = await this.detectSeasonality(productId);
    const stockRunout = await this.calculateStockRunout(productId);
    const forecast = await this.forecastDemand(productId, 30);

    // Get historical data
    const historicalQuery = await pool.query(`
      SELECT
        DATE_TRUNC('week', o.created_at) as week,
        SUM(oi.quantity) as units_sold,
        SUM(oi.quantity * oi.unit_price) as revenue,
        COUNT(DISTINCT o.id) as order_count
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.product_id = $1
        AND o.created_at >= NOW() - INTERVAL '90 days'
        AND o.status NOT IN ('cancelled', 'refunded')
      GROUP BY DATE_TRUNC('week', o.created_at)
      ORDER BY week
    `, [productId]);

    return {
      product_id: productId,
      growth,
      seasonality,
      stockRunout,
      forecast,
      historicalData: historicalQuery.rows
    };
  }

  /**
   * Get forecasts for dashboard
   * @returns {Array} Forecasts
   */
  async getForecasts() {
    const result = await pool.query(`
      SELECT f.*, p.name as product_name, p.model as sku
      FROM purchasing_forecasts f
      JOIN products p ON f.product_id = p.id
      WHERE f.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY f.predicted_demand DESC
      LIMIT 50
    `);

    return result.rows;
  }

  /**
   * Get analysis run history
   * @param {number} limit
   * @returns {Array} Run history
   */
  async getRunHistory(limit = 20) {
    const result = await pool.query(`
      SELECT *
      FROM purchasing_agent_runs
      ORDER BY started_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }
}

PurchasingIntelligenceService.prototype._setPool = function(p) { pool = p; };

module.exports = new PurchasingIntelligenceService();
