'use strict';

/**
 * Search Routes — Universal Semantic Search
 *
 * POST /api/search  — hybrid FTS + vector search across entities
 *
 * Rate-limited. Requires authentication.
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { search } = require('../services/searchService');

// ── Rate limiter: 30 req/min per user ───────────────────────────

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id?.toString() || 'anon',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many search requests. Please wait a moment.',
  },
});

// ── Routes ──────────────────────────────────────────────────────

router.use(authenticate);

/**
 * POST /api/search
 *
 * Body: { query: string, entities?: string[], limit?: number, surface?: string }
 *
 * Returns: { success: true, data: { results, meta } }
 */
router.post('/', searchLimiter, asyncHandler(async (req, res) => {
  const { query, entities, limit, surface } = req.body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Search query is required.',
    });
  }

  const validEntities = ['customers', 'products', 'quotations', 'customer_notes'];
  const filteredEntities = entities && Array.isArray(entities)
    ? entities.filter(e => validEntities.includes(e))
    : undefined;

  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50);

  const result = await search({
    query: query.trim(),
    entities: filteredEntities,
    limit: safeLimit,
    userId: req.user?.id,
    surface: surface || 'global',
  });

  res.json({ success: true, data: result });
}));

module.exports = router;
