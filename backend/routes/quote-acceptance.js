/**
 * Quote Acceptance Routes (Public - no auth required)
 * Handles online quote acceptance via magic link tokens
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const QuoteAcceptanceService = require('../services/QuoteAcceptanceService');

module.exports = ({ pool }) => {
  const acceptanceService = new QuoteAcceptanceService(pool);

  /**
   * GET /api/quote-accept/:token
   * Get quote summary for acceptance page (public, no auth)
   */
  router.get('/:token', asyncHandler(async (req, res) => {
    const { token } = req.params;
    const data = await acceptanceService.getQuoteByToken(token);

    if (!data) {
      return res.status(404).json({ success: false, message: 'Invalid or expired link' });
    }

    if (data.expired) {
      return res.json({ success: true, data, expired: true });
    }

    if (data.already_accepted) {
      return res.json({ success: true, data, already_accepted: true });
    }

    res.json({ success: true, data });
  }));

  /**
   * POST /api/quote-accept/:token
   * Accept the quote (public, no auth)
   */
  router.post('/:token', asyncHandler(async (req, res) => {
    const { token } = req.params;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    const result = await acceptanceService.acceptQuote(token, ipAddress, userAgent);
    res.json({ success: true, message: 'Quote accepted successfully', data: result });
  }));

  return router;
};
