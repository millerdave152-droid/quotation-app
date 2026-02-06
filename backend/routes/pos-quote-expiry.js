/**
 * TeleTime POS - Quote Expiry Routes
 * API endpoints for detecting and managing expiring quotes
 */

const express = require('express');

/**
 * Initialize quote expiry routes
 * @param {object} deps - Dependencies
 * @param {object} deps.quoteExpiryService - QuoteExpiryService instance
 * @returns {express.Router}
 */
function init({ quoteExpiryService }) {
  const router = express.Router();

  /**
   * GET /api/pos/quotes/expiring
   * Get quotes expiring within the specified window
   * Query: days (default: 7), repId (optional), sortBy (priority|expiry|value), limit, offset
   */
  router.get('/expiring', async (req, res) => {
    try {
      const {
        days = 7,
        repId,
        sortBy = 'priority',
        limit = 100,
        offset = 0,
        includeExpired = false,
      } = req.query;

      const daysAhead = parseInt(days, 10) || 7;
      const salesRepId = repId ? parseInt(repId, 10) : null;

      const result = await quoteExpiryService.getPOSExpiringQuotes(
        daysAhead,
        salesRepId,
        {
          sortBy,
          limit: parseInt(limit, 10) || 100,
          offset: parseInt(offset, 10) || 0,
          includeExpired: includeExpired === 'true',
        }
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error('[POS Quote Expiry] Get expiring quotes error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/pos/quotes/expiring/stats
   * Get aggregate statistics on expiring quotes
   * Query: repId (optional)
   */
  router.get('/expiring/stats', async (req, res) => {
    try {
      const { repId } = req.query;
      const salesRepId = repId ? parseInt(repId, 10) : null;

      const stats = await quoteExpiryService.getPOSQuoteExpiryStats(salesRepId);

      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      console.error('[POS Quote Expiry] Get stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/pos/quotes/:id/followed-up
   * Mark a quote as followed up
   * Body: { contactMethod?, notes?, outcome?, callbackDate? }
   */
  router.post('/:id/followed-up', async (req, res) => {
    try {
      const { id } = req.params;
      const quoteId = parseInt(id, 10);

      if (isNaN(quoteId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid quote ID',
        });
      }

      const {
        contactMethod = 'phone',
        notes,
        outcome,
        callbackDate,
      } = req.body;

      // Get user from request (if authenticated)
      const userId = req.user?.id || null;

      const result = await quoteExpiryService.markPOSQuoteFollowedUp(quoteId, {
        userId,
        contactMethod,
        notes,
        outcome,
        callbackDate,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[POS Quote Expiry] Mark followed up error:', error);

      if (error.message === 'Quote not found') {
        return res.status(404).json({
          success: false,
          error: 'Quote not found',
        });
      }

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/pos/quotes/:id/follow-ups
   * Get follow-up history for a quote
   */
  router.get('/:id/follow-ups', async (req, res) => {
    try {
      const { id } = req.params;
      const quoteId = parseInt(id, 10);

      if (isNaN(quoteId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid quote ID',
        });
      }

      const history = await quoteExpiryService.getPOSQuoteFollowUpHistory(quoteId);

      res.json({
        success: true,
        followUps: history,
      });
    } catch (error) {
      console.error('[POS Quote Expiry] Get follow-up history error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/pos/quotes/expiring/dashboard
   * Get dashboard summary with urgent quotes and alerts
   * Query: repId (optional)
   */
  router.get('/expiring/dashboard', async (req, res) => {
    try {
      const { repId } = req.query;
      const salesRepId = repId ? parseInt(repId, 10) : null;

      // Get stats
      const stats = await quoteExpiryService.getPOSQuoteExpiryStats(salesRepId);

      // Get urgent quotes (expiring in 3 days)
      const urgentResult = await quoteExpiryService.getPOSExpiringQuotes(
        3,
        salesRepId,
        { limit: 5, sortBy: 'priority' }
      );

      // Generate alerts
      const alerts = [];

      if (stats.expiringToday > 0) {
        alerts.push({
          type: 'urgent',
          severity: 'high',
          message: `${stats.expiringToday} quote${stats.expiringToday > 1 ? 's' : ''} expiring today`,
          action: 'View expiring quotes',
          actionUrl: '/pos/quotes/expiring?days=1',
        });
      }

      if (stats.expiringIn3Days > stats.expiringToday) {
        const in3Days = stats.expiringIn3Days - stats.expiringToday;
        alerts.push({
          type: 'warning',
          severity: 'medium',
          message: `${in3Days} more quote${in3Days > 1 ? 's' : ''} expiring in the next 3 days`,
          action: 'Review quotes',
          actionUrl: '/pos/quotes/expiring?days=3',
        });
      }

      if (stats.totalAtRiskValue > 10000) {
        alerts.push({
          type: 'info',
          severity: 'medium',
          message: `$${stats.totalAtRiskValue.toLocaleString()} in quotes at risk`,
          action: 'View high-value quotes',
          actionUrl: '/pos/quotes/expiring?sortBy=value',
        });
      }

      res.json({
        success: true,
        stats,
        urgentQuotes: urgentResult.quotes,
        alerts,
      });
    } catch (error) {
      console.error('[POS Quote Expiry] Get dashboard error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return router;
}

module.exports = { init };
