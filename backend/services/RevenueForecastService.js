/**
 * Revenue Forecast Service
 * Provides time-series analysis and forecasting for revenue predictions
 * - 30/60/90 day revenue forecasts with confidence intervals
 * - Seasonality pattern detection
 * - Pipeline value projections
 * - Sales velocity metrics
 */

class RevenueForecastService {
  constructor(pool) {
    this.pool = pool;

    // Stage win probabilities for pipeline forecasting
    this.stageProbabilities = {
      'DRAFT': 0.10,
      'SENT': 0.30,
      'PENDING_APPROVAL': 0.50,
      'APPROVED': 0.70,
      'WON': 1.0,
      'LOST': 0,
      'EXPIRED': 0,
      'REJECTED': 0
    };
  }

  /**
   * Get revenue forecast for specified period
   * @param {number} days - Forecast horizon (30, 60, or 90)
   */
  async getRevenueForecast(days = 30) {
    // Get historical daily revenue
    const historicalData = await this.getHistoricalRevenue(days * 3); // 3x lookback

    if (historicalData.length < 14) {
      return {
        forecast: null,
        confidence: 'insufficient_data',
        message: 'Need at least 14 days of historical data for forecasting',
        historicalDays: historicalData.length
      };
    }

    // Calculate moving averages and trend
    const { trend, avgDailyRevenue, stdDev, seasonality } = this.analyzeTimeSeries(historicalData);

    // Generate forecast
    const forecast = [];
    const today = new Date();

    for (let i = 1; i <= days; i++) {
      const forecastDate = new Date(today);
      forecastDate.setDate(forecastDate.getDate() + i);

      const dayOfWeek = forecastDate.getDay();
      const seasonalFactor = seasonality[dayOfWeek] || 1;

      const baseValue = avgDailyRevenue + (trend * i);
      const adjustedValue = baseValue * seasonalFactor;

      forecast.push({
        date: forecastDate.toISOString().split('T')[0],
        dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
        predictedRevenue: Math.max(0, Math.round(adjustedValue)),
        lowerBound: Math.max(0, Math.round(adjustedValue - stdDev * 1.96)),
        upperBound: Math.round(adjustedValue + stdDev * 1.96)
      });
    }

    // Calculate summary metrics
    const totalForecast = forecast.reduce((sum, d) => sum + d.predictedRevenue, 0);
    const totalLower = forecast.reduce((sum, d) => sum + d.lowerBound, 0);
    const totalUpper = forecast.reduce((sum, d) => sum + d.upperBound, 0);

    // Determine confidence level based on data quality
    const confidenceLevel = this.calculateConfidenceLevel(historicalData, stdDev, avgDailyRevenue);

    return {
      period: `${days}_days`,
      forecast: {
        total: totalForecast,
        lowerBound: totalLower,
        upperBound: totalUpper,
        dailyAverage: Math.round(totalForecast / days)
      },
      trend: {
        direction: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
        dailyChange: Math.round(trend),
        percentChange: avgDailyRevenue > 0
          ? Math.round((trend / avgDailyRevenue) * 100 * 10) / 10
          : 0
      },
      confidence: confidenceLevel,
      dailyForecast: forecast,
      metadata: {
        historicalDaysAnalyzed: historicalData.length,
        avgDailyRevenue: Math.round(avgDailyRevenue),
        stdDeviation: Math.round(stdDev),
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Get historical daily revenue data
   */
  async getHistoricalRevenue(days) {
    const result = await this.pool.query(`
      SELECT
        DATE(won_at) as revenue_date,
        SUM(total_cents) as daily_revenue,
        COUNT(*) as order_count
      FROM quotations
      WHERE status = 'WON'
        AND won_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(won_at)
      ORDER BY revenue_date ASC
    `);

    return result.rows.map(row => ({
      date: row.revenue_date,
      revenue: parseInt(row.daily_revenue) || 0,
      orderCount: parseInt(row.order_count) || 0
    }));
  }

  /**
   * Analyze time series data for trend and seasonality
   */
  analyzeTimeSeries(data) {
    const revenues = data.map(d => d.revenue);
    const n = revenues.length;

    // Calculate mean
    const sum = revenues.reduce((a, b) => a + b, 0);
    const avgDailyRevenue = sum / n;

    // Calculate standard deviation
    const squaredDiffs = revenues.map(r => Math.pow(r - avgDailyRevenue, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / n;
    const stdDev = Math.sqrt(avgSquaredDiff);

    // Calculate linear trend (simple linear regression)
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += revenues[i];
      sumXY += i * revenues[i];
      sumX2 += i * i;
    }
    const trend = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Calculate day-of-week seasonality
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];

    data.forEach(d => {
      const dayOfWeek = new Date(d.date).getDay();
      dayTotals[dayOfWeek] += d.revenue;
      dayCounts[dayOfWeek]++;
    });

    const seasonality = {};
    for (let i = 0; i < 7; i++) {
      const dayAvg = dayCounts[i] > 0 ? dayTotals[i] / dayCounts[i] : avgDailyRevenue;
      seasonality[i] = avgDailyRevenue > 0 ? dayAvg / avgDailyRevenue : 1;
    }

    return { trend, avgDailyRevenue, stdDev, seasonality };
  }

  /**
   * Calculate confidence level
   */
  calculateConfidenceLevel(data, stdDev, avgRevenue) {
    const dataPoints = data.length;
    const cv = avgRevenue > 0 ? (stdDev / avgRevenue) * 100 : 100;

    if (dataPoints >= 90 && cv < 30) return 'high';
    if (dataPoints >= 30 && cv < 50) return 'medium';
    return 'low';
  }

  /**
   * Get seasonality analysis
   */
  async getSeasonalityAnalysis() {
    // Day of week analysis
    const dayOfWeekResult = await this.pool.query(`
      SELECT
        EXTRACT(DOW FROM won_at) as day_of_week,
        COUNT(*) as order_count,
        SUM(total_cents) as total_revenue,
        AVG(total_cents) as avg_order_value
      FROM quotations
      WHERE status = 'WON'
        AND won_at >= NOW() - INTERVAL '365 days'
      GROUP BY EXTRACT(DOW FROM won_at)
      ORDER BY day_of_week
    `);

    // Month analysis
    const monthResult = await this.pool.query(`
      SELECT
        EXTRACT(MONTH FROM won_at) as month,
        COUNT(*) as order_count,
        SUM(total_cents) as total_revenue,
        AVG(total_cents) as avg_order_value
      FROM quotations
      WHERE status = 'WON'
        AND won_at >= NOW() - INTERVAL '365 days'
      GROUP BY EXTRACT(MONTH FROM won_at)
      ORDER BY month
    `);

    // Hour of day analysis
    const hourResult = await this.pool.query(`
      SELECT
        EXTRACT(HOUR FROM won_at) as hour,
        COUNT(*) as order_count,
        SUM(total_cents) as total_revenue
      FROM quotations
      WHERE status = 'WON'
        AND won_at >= NOW() - INTERVAL '90 days'
      GROUP BY EXTRACT(HOUR FROM won_at)
      ORDER BY hour
    `);

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return {
      byDayOfWeek: dayOfWeekResult.rows.map(row => ({
        day: dayNames[row.day_of_week],
        dayIndex: parseInt(row.day_of_week),
        orderCount: parseInt(row.order_count),
        totalRevenue: parseInt(row.total_revenue),
        avgOrderValue: parseInt(row.avg_order_value)
      })),
      byMonth: monthResult.rows.map(row => ({
        month: monthNames[parseInt(row.month) - 1],
        monthIndex: parseInt(row.month),
        orderCount: parseInt(row.order_count),
        totalRevenue: parseInt(row.total_revenue),
        avgOrderValue: parseInt(row.avg_order_value)
      })),
      byHour: hourResult.rows.map(row => ({
        hour: parseInt(row.hour),
        orderCount: parseInt(row.order_count),
        totalRevenue: parseInt(row.total_revenue)
      })),
      insights: this.generateSeasonalityInsights(dayOfWeekResult.rows, monthResult.rows)
    };
  }

  /**
   * Generate insights from seasonality data
   */
  generateSeasonalityInsights(dayData, monthData) {
    const insights = [];

    // Find best/worst days
    if (dayData.length > 0) {
      const sortedDays = [...dayData].sort((a, b) =>
        parseInt(b.total_revenue) - parseInt(a.total_revenue));
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      insights.push({
        type: 'best_day',
        message: `${dayNames[sortedDays[0].day_of_week]} is your highest revenue day`,
        value: parseInt(sortedDays[0].total_revenue)
      });

      if (sortedDays.length > 1) {
        const worstDay = sortedDays[sortedDays.length - 1];
        insights.push({
          type: 'opportunity',
          message: `${dayNames[worstDay.day_of_week]} has lowest activity - consider promotions`,
          value: parseInt(worstDay.total_revenue)
        });
      }
    }

    // Find best/worst months
    if (monthData.length > 0) {
      const sortedMonths = [...monthData].sort((a, b) =>
        parseInt(b.total_revenue) - parseInt(a.total_revenue));
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      insights.push({
        type: 'peak_season',
        message: `${monthNames[parseInt(sortedMonths[0].month) - 1]} is your peak revenue month`,
        value: parseInt(sortedMonths[0].total_revenue)
      });
    }

    return insights;
  }

  /**
   * Get pipeline forecast based on stage probabilities
   */
  async getPipelineForecast() {
    const result = await this.pool.query(`
      SELECT
        status,
        COUNT(*) as quote_count,
        SUM(total_cents) as total_value,
        AVG(total_cents) as avg_value,
        AVG(EXTRACT(days FROM (CURRENT_TIMESTAMP - created_at))) as avg_age_days
      FROM quotations
      WHERE status NOT IN ('WON', 'LOST', 'EXPIRED', 'REJECTED')
      GROUP BY status
      ORDER BY
        CASE status
          WHEN 'APPROVED' THEN 1
          WHEN 'PENDING_APPROVAL' THEN 2
          WHEN 'SENT' THEN 3
          WHEN 'DRAFT' THEN 4
        END
    `);

    let totalPipelineValue = 0;
    let weightedPipelineValue = 0;

    const stages = result.rows.map(row => {
      const probability = this.stageProbabilities[row.status] || 0;
      const value = parseInt(row.total_value) || 0;
      const weightedValue = Math.round(value * probability);

      totalPipelineValue += value;
      weightedPipelineValue += weightedValue;

      return {
        stage: row.status,
        quoteCount: parseInt(row.quote_count),
        totalValue: value,
        avgValue: parseInt(row.avg_value) || 0,
        winProbability: probability,
        weightedValue,
        avgAgeDays: Math.round(parseFloat(row.avg_age_days) || 0)
      };
    });

    // Get historical conversion rates
    const conversionResult = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'WON') as won_count,
        COUNT(*) FILTER (WHERE status IN ('WON', 'LOST', 'EXPIRED')) as closed_count,
        AVG(total_cents) FILTER (WHERE status = 'WON') as avg_won_value,
        AVG(EXTRACT(days FROM (won_at - created_at))) FILTER (WHERE status = 'WON') as avg_sales_cycle
      FROM quotations
      WHERE created_at >= NOW() - INTERVAL '90 days'
    `);

    const conv = conversionResult.rows[0];
    const winRate = conv.closed_count > 0
      ? Math.round((conv.won_count / conv.closed_count) * 100)
      : 0;

    return {
      pipeline: {
        totalValue: totalPipelineValue,
        weightedValue: weightedPipelineValue,
        quoteCount: stages.reduce((sum, s) => sum + s.quoteCount, 0)
      },
      stages,
      metrics: {
        winRate,
        avgWonValue: parseInt(conv.avg_won_value) || 0,
        avgSalesCycleDays: Math.round(parseFloat(conv.avg_sales_cycle) || 0),
        forecastAccuracy: this.calculateForecastAccuracy()
      },
      projections: {
        expected30Day: Math.round(weightedPipelineValue * 0.4), // 40% expected to close in 30 days
        expected60Day: Math.round(weightedPipelineValue * 0.7), // 70% in 60 days
        expected90Day: Math.round(weightedPipelineValue * 0.9)  // 90% in 90 days
      }
    };
  }

  /**
   * Calculate historical forecast accuracy
   */
  calculateForecastAccuracy() {
    // Placeholder - would compare past forecasts to actuals
    return 75; // Default 75% accuracy
  }

  /**
   * Get sales velocity metrics by salesperson
   */
  async getSalesVelocity(days = 30) {
    const result = await this.pool.query(`
      WITH salesperson_metrics AS (
        SELECT
          created_by as salesperson,
          COUNT(*) as total_quotes,
          COUNT(*) FILTER (WHERE status = 'WON') as won_quotes,
          COUNT(*) FILTER (WHERE status = 'LOST') as lost_quotes,
          SUM(total_cents) FILTER (WHERE status = 'WON') as won_revenue,
          AVG(total_cents) FILTER (WHERE status = 'WON') as avg_deal_size,
          AVG(EXTRACT(days FROM (won_at - created_at))) FILTER (WHERE status = 'WON') as avg_cycle_days
        FROM quotations
        WHERE created_at >= NOW() - INTERVAL '${days} days'
          AND created_by IS NOT NULL
        GROUP BY created_by
      )
      SELECT
        sm.*,
        CASE
          WHEN (sm.won_quotes + sm.lost_quotes) > 0
          THEN ROUND(sm.won_quotes::numeric / (sm.won_quotes + sm.lost_quotes) * 100, 1)
          ELSE 0
        END as win_rate,
        u.name as salesperson_name
      FROM salesperson_metrics sm
      LEFT JOIN users u ON sm.salesperson = u.name OR sm.salesperson = u.email
      ORDER BY won_revenue DESC NULLS LAST
    `);

    const salespeople = result.rows.map(row => ({
      salesperson: row.salesperson_name || row.salesperson,
      totalQuotes: parseInt(row.total_quotes),
      wonQuotes: parseInt(row.won_quotes) || 0,
      lostQuotes: parseInt(row.lost_quotes) || 0,
      wonRevenue: parseInt(row.won_revenue) || 0,
      avgDealSize: parseInt(row.avg_deal_size) || 0,
      avgSalesCycleDays: Math.round(parseFloat(row.avg_cycle_days) || 0),
      winRate: parseFloat(row.win_rate) || 0,
      velocity: this.calculateVelocityScore(row)
    }));

    // Calculate team averages
    const teamTotals = salespeople.reduce((acc, sp) => ({
      quotes: acc.quotes + sp.totalQuotes,
      won: acc.won + sp.wonQuotes,
      revenue: acc.revenue + sp.wonRevenue
    }), { quotes: 0, won: 0, revenue: 0 });

    return {
      period: `${days}_days`,
      salespeople,
      teamMetrics: {
        totalQuotes: teamTotals.quotes,
        totalWon: teamTotals.won,
        totalRevenue: teamTotals.revenue,
        avgWinRate: salespeople.length > 0
          ? Math.round(salespeople.reduce((sum, sp) => sum + sp.winRate, 0) / salespeople.length)
          : 0
      },
      topPerformer: salespeople.length > 0 ? salespeople[0] : null
    };
  }

  /**
   * Calculate velocity score (higher is better)
   * Factors: win rate, deal size, cycle time
   */
  calculateVelocityScore(data) {
    const winRate = parseFloat(data.win_rate) || 0;
    const avgDealSize = parseInt(data.avg_deal_size) || 0;
    const cycleDays = parseFloat(data.avg_cycle_days) || 30;

    // Velocity = (Win Rate * Avg Deal Size) / Cycle Time
    // Normalized to 0-100 scale
    const rawVelocity = cycleDays > 0
      ? (winRate * avgDealSize) / (cycleDays * 100)
      : 0;

    return Math.min(100, Math.round(rawVelocity));
  }

  /**
   * Get combined forecast summary
   */
  async getForecastSummary() {
    const [forecast30, forecast60, forecast90, pipeline, seasonality] = await Promise.all([
      this.getRevenueForecast(30),
      this.getRevenueForecast(60),
      this.getRevenueForecast(90),
      this.getPipelineForecast(),
      this.getSeasonalityAnalysis()
    ]);

    return {
      forecasts: {
        '30_day': forecast30.forecast,
        '60_day': forecast60.forecast,
        '90_day': forecast90.forecast
      },
      pipeline: pipeline.pipeline,
      pipelineProjections: pipeline.projections,
      trend: forecast30.trend,
      seasonalityInsights: seasonality.insights,
      confidence: forecast30.confidence,
      generatedAt: new Date().toISOString()
    };
  }
}

module.exports = RevenueForecastService;
