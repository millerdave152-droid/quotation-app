/**
 * Analytics Routes Module
 * Handles revenue analytics and feature adoption metrics
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

// Module-level dependencies (injected via init)
let pool = null;

/**
 * Initialize the router with dependencies
 * @param {object} deps - Dependencies
 * @param {Pool} deps.pool - PostgreSQL connection pool
 */
const init = (deps) => {
  pool = deps.pool;
  return router;
};

// ============================================
// ANALYTICS ROUTES
// ============================================

/**
 * GET /api/analytics/revenue-features
 * Get revenue features analytics
 */
router.get('/revenue-features', asyncHandler(async (req, res) => {
  const { startDate, endDate, period = '30' } = req.query;

  // Calculate date range (default to last 30 days)
  const days = parseInt(period) || 30;
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - (days * 24 * 60 * 60 * 1000));

  // Get all quotes in date range
  const totalQuotesResult = await pool.query(
    'SELECT COUNT(*) as count FROM quotations WHERE created_at >= $1 AND created_at <= $2',
    [start, end]
  );
  const totalQuotes = parseInt(totalQuotesResult.rows[0].count);

  // Get financing data
  const financingResult = await pool.query(
    `SELECT COUNT(DISTINCT qf.quote_id) as count,
            SUM(qf.financed_amount_cents) as total_financed,
            SUM(qf.total_interest_cents) as total_interest
     FROM quote_financing qf
     JOIN quotations q ON qf.quote_id = q.id
     WHERE q.created_at >= $1 AND q.created_at <= $2`,
    [start, end]
  );

  // Get warranties data
  const warrantiesResult = await pool.query(
    `SELECT COUNT(DISTINCT qw.quote_id) as count,
            SUM(qw.warranty_cost_cents) as total_revenue
     FROM quote_warranties qw
     JOIN quotations q ON qw.quote_id = q.id
     WHERE q.created_at >= $1 AND q.created_at <= $2`,
    [start, end]
  );

  // Get delivery data
  const deliveryResult = await pool.query(
    `SELECT COUNT(DISTINCT qd.quote_id) as count,
            SUM(qd.total_delivery_cost_cents) as total_revenue
     FROM quote_delivery qd
     JOIN quotations q ON qd.quote_id = q.id
     WHERE q.created_at >= $1 AND q.created_at <= $2`,
    [start, end]
  );

  // Get rebates data
  const rebatesResult = await pool.query(
    `SELECT COUNT(DISTINCT qr.quote_id) as count,
            SUM(qr.rebate_amount_cents) as total_rebates
     FROM quote_rebates qr
     JOIN quotations q ON qr.quote_id = q.id
     WHERE q.created_at >= $1 AND q.created_at <= $2`,
    [start, end]
  );

  // Get trade-ins data
  const tradeInsResult = await pool.query(
    `SELECT COUNT(DISTINCT qt.quote_id) as count,
            SUM(qt.trade_in_value_cents) as total_value
     FROM quote_trade_ins qt
     JOIN quotations q ON qt.quote_id = q.id
     WHERE q.created_at >= $1 AND q.created_at <= $2`,
    [start, end]
  );

  // Calculate analytics
  const financingCount = parseInt(financingResult.rows[0].count) || 0;
  const warrantiesCount = parseInt(warrantiesResult.rows[0].count) || 0;
  const deliveryCount = parseInt(deliveryResult.rows[0].count) || 0;
  const rebatesCount = parseInt(rebatesResult.rows[0].count) || 0;
  const tradeInsCount = parseInt(tradeInsResult.rows[0].count) || 0;

  const warrantiesRevenue = parseInt(warrantiesResult.rows[0].total_revenue) || 0;
  const deliveryRevenue = parseInt(deliveryResult.rows[0].total_revenue) || 0;
  const tradeInsValue = parseInt(tradeInsResult.rows[0].total_value) || 0;
  const rebatesValue = parseInt(rebatesResult.rows[0].total_rebates) || 0;

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
      financing: parseInt(financingResult.rows[0].total_interest) || 0,
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

  res.success(analytics);
}));

/**
 * GET /api/analytics/top-features
 * Get top performing revenue features
 */
router.get('/top-features', asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;

  // Get recent quotes with any revenue features
  const quotesResult = await pool.query(
    `SELECT DISTINCT q.id, q.quotation_number, q.total_cents, q.created_at, q.customer_name
     FROM quotations q
     LEFT JOIN quote_financing qf ON q.id = qf.quote_id
     LEFT JOIN quote_warranties qw ON q.id = qw.quote_id
     LEFT JOIN quote_delivery qd ON q.id = qd.quote_id
     LEFT JOIN quote_rebates qr ON q.id = qr.quote_id
     LEFT JOIN quote_trade_ins qt ON q.id = qt.quote_id
     WHERE qf.id IS NOT NULL OR qw.id IS NOT NULL OR qd.id IS NOT NULL
           OR qr.id IS NOT NULL OR qt.id IS NOT NULL
     ORDER BY q.created_at DESC
     LIMIT $1`,
    [limit]
  );

  // For each quote, get the detailed feature information
  const features = await Promise.all(quotesResult.rows.map(async (quote) => {
    const quoteId = quote.id;

    // Check for each feature type
    const hasFinancing = (await pool.query(
      'SELECT COUNT(*) as count FROM quote_financing WHERE quote_id = $1',
      [quoteId]
    )).rows[0].count > 0;

    const warrantiesCount = parseInt((await pool.query(
      'SELECT COUNT(*) as count FROM quote_warranties WHERE quote_id = $1',
      [quoteId]
    )).rows[0].count);

    const hasDelivery = (await pool.query(
      'SELECT COUNT(*) as count FROM quote_delivery WHERE quote_id = $1',
      [quoteId]
    )).rows[0].count > 0;

    const rebatesCount = parseInt((await pool.query(
      'SELECT COUNT(*) as count FROM quote_rebates WHERE quote_id = $1',
      [quoteId]
    )).rows[0].count);

    const tradeInsCount = parseInt((await pool.query(
      'SELECT COUNT(*) as count FROM quote_trade_ins WHERE quote_id = $1',
      [quoteId]
    )).rows[0].count);

    return {
      quoteId: quote.id,
      quoteNumber: quote.quotation_number,
      customerName: quote.customer_name,
      date: quote.created_at,
      total: quote.total_cents,
      features: {
        financing: hasFinancing,
        warranties: warrantiesCount,
        delivery: hasDelivery,
        rebates: rebatesCount,
        tradeIns: tradeInsCount
      }
    };
  }));

  res.success(features);
}));

module.exports = { router, init };
