/**
 * TeleTime POS - Sales Rep Routes
 * Endpoints for fetching active/on-shift sales representatives
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const SalesRepService = require('../services/SalesRepService');

// ============================================================================
// MODULE STATE
// ============================================================================

let salesRepService = null;

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/pos/active-sales-reps
 * Get active/on-shift sales representatives for quick selection
 *
 * Query params:
 *   - limit: Max reps to return (default: 15, max: 25)
 *   - includeStats: Include sales stats (default: true)
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "reps": [
 *       {
 *         "id": 123,
 *         "name": "Alex Vargas",
 *         "firstName": "Alex",
 *         "lastName": "Vargas",
 *         "initials": "AV",
 *         "avatarUrl": "/avatars/123.jpg",
 *         "isOnShift": true,
 *         "shiftStart": "2025-01-27T09:00:00Z",
 *         "registerName": "Register 1",
 *         "salesToday": 12,
 *         "revenueToday": 4250.00
 *       }
 *     ],
 *     "defaultRepId": 123,
 *     "source": "shifts",
 *     "count": 5
 *   }
 * }
 */
router.get('/active-sales-reps', authenticate, asyncHandler(async (req, res) => {
  const { limit = 15, includeStats = 'true' } = req.query;

  const result = await salesRepService.getActiveSalesReps({
    currentUserId: req.user.id,
    limit: Math.min(parseInt(limit, 10) || 15, 25),
    includeStats: includeStats !== 'false',
  });

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * GET /api/pos/sales-reps/search
 * Search all sales reps by name or email
 *
 * Query params:
 *   - q: Search query (optional)
 *   - limit: Max results (default: 50, max: 100)
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "reps": [...],
 *     "count": 10
 *   }
 * }
 */
router.get('/sales-reps/search', authenticate, asyncHandler(async (req, res) => {
  const { q = '', limit = 50 } = req.query;

  const reps = await salesRepService.searchSalesReps({
    search: q,
    limit: Math.min(parseInt(limit, 10) || 50, 100),
  });

  res.json({
    success: true,
    data: {
      reps,
      count: reps.length,
    },
  });
}));

/**
 * GET /api/pos/sales-reps/:id
 * Get a single sales rep by ID
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "rep": { ... }
 *   }
 * }
 */
router.get('/sales-reps/:id', authenticate, asyncHandler(async (req, res) => {
  const repId = parseInt(req.params.id, 10);

  if (!repId || isNaN(repId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid rep ID',
    });
  }

  const rep = await salesRepService.getSalesRepById(repId);

  if (!rep) {
    return res.status(404).json({
      success: false,
      error: 'Sales rep not found',
    });
  }

  res.json({
    success: true,
    data: {
      rep,
    },
  });
}));

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize routes with dependencies
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Router} Express router instance
 */
const init = (pool) => {
  salesRepService = new SalesRepService(pool);
  return router;
};

module.exports = { init };
