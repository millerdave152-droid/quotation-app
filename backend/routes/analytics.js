/**
 * Analytics Routes Module
 * Handles revenue analytics and feature adoption metrics
 *
 * OPTIMIZED: Added caching for expensive analytics queries
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const cache = require('../cache');
const { authenticate } = require('../middleware/auth');
const RevenueForecastService = require('../services/RevenueForecastService');
const ConversionAnalyticsService = require('../services/ConversionAnalyticsService');
const LeadSourceAnalyticsService = require('../services/LeadSourceAnalyticsService');

// Module-level dependencies (injected via init)
let pool = null;
let forecastService = null;
let conversionService = null;
let leadSourceService = null;

/**
 * Initialize the router with dependencies
 * @param {object} deps - Dependencies
 * @param {Pool} deps.pool - PostgreSQL connection pool
 */
const init = (deps) => {
  pool = deps.pool;
  forecastService = new RevenueForecastService(pool);
  conversionService = new ConversionAnalyticsService(pool, cache);
  leadSourceService = new LeadSourceAnalyticsService(pool, cache);
  return router;
};

// ============================================
// ANALYTICS ROUTES
// ============================================

/**
 * GET /api/analytics/revenue-features
 * Get revenue features analytics
 *
 * OPTIMIZED: Cached for 5 minutes to reduce database load
 */
router.get('/revenue-features', authenticate, asyncHandler(async (req, res) => {
  const { startDate, endDate, period = '30' } = req.query;

  // Calculate date range (default to last 30 days)
  const days = parseInt(period) || 30;
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - (days * 24 * 60 * 60 * 1000));

  // Try to get from cache
  const cacheKey = `analytics:revenue-features:${start.toISOString().slice(0,10)}:${end.toISOString().slice(0,10)}:${days}`;
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.success(cached);
  }

  // PERF: Combined CTE query - 6 queries reduced to 1
  const result = await pool.query(`
    WITH date_range AS (
      SELECT $1::timestamp AS start_date, $2::timestamp AS end_date
    ),
    total_quotes AS (
      SELECT COUNT(*) as count
      FROM quotations, date_range
      WHERE created_at >= start_date AND created_at <= end_date
    ),
    financing_agg AS (
      SELECT
        COUNT(DISTINCT qf.quote_id) as count,
        COALESCE(SUM(qf.financed_amount_cents), 0) as total_financed,
        COALESCE(SUM(qf.total_interest_cents), 0) as total_interest
      FROM quote_financing qf
      JOIN quotations q ON qf.quote_id = q.id, date_range
      WHERE q.created_at >= start_date AND q.created_at <= end_date
    ),
    warranties_agg AS (
      SELECT
        COUNT(DISTINCT qw.quote_id) as count,
        COALESCE(SUM(qw.warranty_cost_cents), 0) as total_revenue
      FROM quote_warranties qw
      JOIN quotations q ON qw.quote_id = q.id, date_range
      WHERE q.created_at >= start_date AND q.created_at <= end_date
    ),
    delivery_agg AS (
      SELECT
        COUNT(DISTINCT qd.quote_id) as count,
        COALESCE(SUM(qd.total_delivery_cost_cents), 0) as total_revenue
      FROM quote_delivery qd
      JOIN quotations q ON qd.quote_id = q.id, date_range
      WHERE q.created_at >= start_date AND q.created_at <= end_date
    ),
    rebates_agg AS (
      SELECT
        COUNT(DISTINCT qr.quote_id) as count,
        COALESCE(SUM(qr.rebate_amount_cents), 0) as total_rebates
      FROM quote_rebates qr
      JOIN quotations q ON qr.quote_id = q.id, date_range
      WHERE q.created_at >= start_date AND q.created_at <= end_date
    ),
    trade_ins_agg AS (
      SELECT
        COUNT(DISTINCT qt.quote_id) as count,
        COALESCE(SUM(qt.trade_in_value_cents), 0) as total_value
      FROM quote_trade_ins qt
      JOIN quotations q ON qt.quote_id = q.id, date_range
      WHERE q.created_at >= start_date AND q.created_at <= end_date
    )
    SELECT
      (SELECT count FROM total_quotes) as total_quotes,
      (SELECT count FROM financing_agg) as financing_count,
      (SELECT total_financed FROM financing_agg) as financing_total_financed,
      (SELECT total_interest FROM financing_agg) as financing_interest,
      (SELECT count FROM warranties_agg) as warranties_count,
      (SELECT total_revenue FROM warranties_agg) as warranties_revenue,
      (SELECT count FROM delivery_agg) as delivery_count,
      (SELECT total_revenue FROM delivery_agg) as delivery_revenue,
      (SELECT count FROM rebates_agg) as rebates_count,
      (SELECT total_rebates FROM rebates_agg) as rebates_value,
      (SELECT count FROM trade_ins_agg) as trade_ins_count,
      (SELECT total_value FROM trade_ins_agg) as trade_ins_value
  `, [start, end]);

  const row = result.rows[0];

  // Calculate analytics from combined result
  const totalQuotes = parseInt(row.total_quotes) || 0;
  const financingCount = parseInt(row.financing_count) || 0;
  const warrantiesCount = parseInt(row.warranties_count) || 0;
  const deliveryCount = parseInt(row.delivery_count) || 0;
  const rebatesCount = parseInt(row.rebates_count) || 0;
  const tradeInsCount = parseInt(row.trade_ins_count) || 0;

  const financingInterest = parseInt(row.financing_interest) || 0;
  const warrantiesRevenue = parseInt(row.warranties_revenue) || 0;
  const deliveryRevenue = parseInt(row.delivery_revenue) || 0;
  const rebatesValue = parseInt(row.rebates_value) || 0;
  const tradeInsValue = parseInt(row.trade_ins_value) || 0;

  const totalRevenue = warrantiesRevenue + deliveryRevenue;
  const totalFeaturesCount = financingCount + warrantiesCount + deliveryCount + rebatesCount + tradeInsCount;

  // Estimate unique quotes with features (simplified calculation)
  const quotesWithFeatures = Math.min(
    totalQuotes,
    Math.max(financingCount, warrantiesCount, deliveryCount, rebatesCount, tradeInsCount)
  );

  const analytics = {
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
      days: days
    },
    totalQuotes: totalQuotes,
    featureAdoption: {
      financing: financingCount,
      warranties: warrantiesCount,
      delivery: deliveryCount,
      rebates: rebatesCount,
      tradeIns: tradeInsCount
    },
    revenue: {
      financing: financingInterest,
      warranties: warrantiesRevenue,
      delivery: deliveryRevenue,
      rebates: rebatesValue,
      tradeIns: tradeInsValue,
      total: totalRevenue
    },
    averages: {
      quotesWithFeatures: quotesWithFeatures,
      revenuePerQuote: totalQuotes > 0 ? totalRevenue / totalQuotes : 0,
      featuresPerQuote: totalQuotes > 0 ? totalFeaturesCount / totalQuotes : 0
    },
    adoptionRate: totalQuotes > 0 ? (quotesWithFeatures / totalQuotes) * 100 : 0,
    trends: []
  };

  // Cache the result for 5 minutes
  cache.set('short', cacheKey, analytics);

  res.success(analytics);
}));

/**
 * GET /api/analytics/top-features
 * Get top performing revenue features
 *
 * OPTIMIZED: Uses single query with aggregations instead of N+1 pattern
 * OPTIMIZED: Cached for 5 minutes
 */
router.get('/top-features', authenticate, asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;

  // Try to get from cache
  const cacheKey = `analytics:top-features:${limit}`;
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.success(cached);
  }

  // Single optimized query that fetches all feature counts in one go
  // Eliminates N+1 pattern (was making 5 queries per quote)
  const result = await pool.query(
    `SELECT
       q.id as quote_id,
       q.quotation_number as quote_number,
       q.customer_name,
       q.created_at as date,
       q.total_cents as total,
       COALESCE(qf.financing_count, 0) > 0 as has_financing,
       COALESCE(qw.warranties_count, 0)::int as warranties_count,
       COALESCE(qd.delivery_count, 0) > 0 as has_delivery,
       COALESCE(qr.rebates_count, 0)::int as rebates_count,
       COALESCE(qt.trade_ins_count, 0)::int as trade_ins_count
     FROM quotations q
     LEFT JOIN (
       SELECT quote_id, COUNT(*) as financing_count FROM quote_financing GROUP BY quote_id
     ) qf ON q.id = qf.quote_id
     LEFT JOIN (
       SELECT quote_id, COUNT(*) as warranties_count FROM quote_warranties GROUP BY quote_id
     ) qw ON q.id = qw.quote_id
     LEFT JOIN (
       SELECT quote_id, COUNT(*) as delivery_count FROM quote_delivery GROUP BY quote_id
     ) qd ON q.id = qd.quote_id
     LEFT JOIN (
       SELECT quote_id, COUNT(*) as rebates_count FROM quote_rebates GROUP BY quote_id
     ) qr ON q.id = qr.quote_id
     LEFT JOIN (
       SELECT quote_id, COUNT(*) as trade_ins_count FROM quote_trade_ins GROUP BY quote_id
     ) qt ON q.id = qt.quote_id
     WHERE qf.quote_id IS NOT NULL OR qw.quote_id IS NOT NULL OR qd.quote_id IS NOT NULL
           OR qr.quote_id IS NOT NULL OR qt.quote_id IS NOT NULL
     ORDER BY q.created_at DESC
     LIMIT $1`,
    [limit]
  );

  // Format response
  const features = result.rows.map(row => ({
    quoteId: row.quote_id,
    quoteNumber: row.quote_number,
    customerName: row.customer_name,
    date: row.date,
    total: row.total,
    features: {
      financing: row.has_financing,
      warranties: row.warranties_count,
      delivery: row.has_delivery,
      rebates: row.rebates_count,
      tradeIns: row.trade_ins_count
    }
  }));

  // Cache the result for 5 minutes
  cache.set('short', cacheKey, features);

  res.success(features);
}));

// ============================================
// REVENUE FORECASTING ROUTES
// ============================================

/**
 * GET /api/analytics/forecast/revenue
 * Get revenue forecast for specified days (30/60/90)
 */
router.get('/forecast/revenue', authenticate, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;

  if (![30, 60, 90].includes(days)) {
    throw ApiError.badRequest('Days must be 30, 60, or 90');
  }

  // Try to get from cache
  const cacheKey = `analytics:forecast:revenue:${days}`;
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  const forecast = await forecastService.getRevenueForecast(days);

  // Cache for 15 minutes (forecasts don't change rapidly)
  cache.set('short', cacheKey, forecast);

  res.json({ success: true, data: forecast });
}));

/**
 * GET /api/analytics/forecast/pipeline
 * Get pipeline-based revenue forecast
 */
router.get('/forecast/pipeline', authenticate, asyncHandler(async (req, res) => {
  // Try to get from cache
  const cacheKey = 'analytics:forecast:pipeline';
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  const forecast = await forecastService.getPipelineForecast();

  // Cache for 5 minutes
  cache.set('short', cacheKey, forecast);

  res.json({ success: true, data: forecast });
}));

/**
 * GET /api/analytics/forecast/summary
 * Get combined forecast summary with all metrics
 */
router.get('/forecast/summary', authenticate, asyncHandler(async (req, res) => {
  // Try to get from cache
  const cacheKey = 'analytics:forecast:summary';
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  const summary = await forecastService.getForecastSummary();

  // Cache for 10 minutes
  cache.set('short', cacheKey, summary);

  res.json({ success: true, data: summary });
}));

/**
 * GET /api/analytics/seasonality
 * Get seasonality analysis patterns
 */
router.get('/seasonality', authenticate, asyncHandler(async (req, res) => {
  // Try to get from cache
  const cacheKey = 'analytics:seasonality';
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  const seasonality = await forecastService.getSeasonalityAnalysis();

  // Cache for 1 hour (seasonality patterns are stable)
  cache.set('long', cacheKey, seasonality);

  res.json({ success: true, data: seasonality });
}));

/**
 * GET /api/analytics/sales-velocity
 * Get sales velocity metrics by salesperson
 */
router.get('/sales-velocity', authenticate, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;

  // Try to get from cache
  const cacheKey = `analytics:sales-velocity:${days}`;
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  const velocity = await forecastService.getSalesVelocity(days);

  // Cache for 5 minutes
  cache.set('short', cacheKey, velocity);

  res.json({ success: true, data: velocity });
}));

// ============================================
// CONVERSION FUNNEL ANALYTICS ROUTES
// ============================================

/**
 * GET /api/analytics/funnel
 * Get complete funnel analysis
 */
router.get('/funnel', authenticate, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 90;

  // Try to get from cache
  const cacheKey = `analytics:funnel:${days}`;
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  const analysis = await conversionService.getFunnelAnalysis(days);

  // Cache for 10 minutes
  cache.set('short', cacheKey, analysis);

  res.json({ success: true, data: analysis });
}));

/**
 * GET /api/analytics/funnel/stages
 * Get stage conversion rates only
 */
router.get('/funnel/stages', authenticate, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 90;

  const cacheKey = `analytics:funnel:stages:${days}`;
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  const stages = await conversionService.getStageConversions(days);

  cache.set('short', cacheKey, stages);

  res.json({ success: true, data: stages });
}));

/**
 * GET /api/analytics/funnel/timing
 * Get stage timing analysis
 */
router.get('/funnel/timing', authenticate, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 90;

  const cacheKey = `analytics:funnel:timing:${days}`;
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  const timing = await conversionService.getStageTiming(days);

  cache.set('short', cacheKey, timing);

  res.json({ success: true, data: timing });
}));

/**
 * GET /api/analytics/funnel/trends
 * Get conversion trends over time
 */
router.get('/funnel/trends', authenticate, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 90;

  const cacheKey = `analytics:funnel:trends:${days}`;
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  const trends = await conversionService.getConversionTrends(days);

  cache.set('short', cacheKey, trends);

  res.json({ success: true, data: trends });
}));

/**
 * GET /api/analytics/funnel/by-source
 * Get conversion rates by lead source
 */
router.get('/funnel/by-source', authenticate, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 90;

  const cacheKey = `analytics:funnel:by-source:${days}`;
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  const bySource = await conversionService.getConversionBySource(days);

  cache.set('short', cacheKey, bySource);

  res.json({ success: true, data: bySource });
}));

// ============================================
// LEAD SOURCE ROI ANALYTICS ROUTES
// ============================================

/**
 * GET /api/analytics/lead-sources
 * Get comprehensive lead source analytics
 */
router.get('/lead-sources', authenticate, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 90;

  const cacheKey = `analytics:lead-sources:${days}`;
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  const analytics = await leadSourceService.getSourceAnalytics(days);

  cache.set('short', cacheKey, analytics);

  res.json({ success: true, data: analytics });
}));

/**
 * GET /api/analytics/lead-sources/breakdown
 * Get lead source breakdown
 */
router.get('/lead-sources/breakdown', authenticate, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 90;

  const cacheKey = `analytics:lead-sources:breakdown:${days}`;
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  const breakdown = await leadSourceService.getSourceBreakdown(days);

  cache.set('short', cacheKey, breakdown);

  res.json({ success: true, data: breakdown });
}));

/**
 * GET /api/analytics/lead-sources/performance
 * Get lead source performance with revenue
 */
router.get('/lead-sources/performance', authenticate, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 90;

  const cacheKey = `analytics:lead-sources:performance:${days}`;
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  const performance = await leadSourceService.getSourcePerformance(days);

  cache.set('short', cacheKey, performance);

  res.json({ success: true, data: performance });
}));

/**
 * GET /api/analytics/lead-sources/top
 * Get top performing lead sources
 */
router.get('/lead-sources/top', authenticate, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 90;

  const cacheKey = `analytics:lead-sources:top:${days}`;
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  const topSources = await leadSourceService.getTopPerformingSources(days);

  cache.set('short', cacheKey, topSources);

  res.json({ success: true, data: topSources });
}));

module.exports = { router, init };
