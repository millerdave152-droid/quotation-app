/**
 * Feature Flags Admin API
 * Runtime kill switches for ML scoring, A/B tests, and gradual rollouts.
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

let pool = null;
let mlScoringService = null;

// GET /api/admin/feature-flags
router.get('/', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT flag_name, is_enabled, updated_at FROM feature_flags ORDER BY flag_name'
  );
  res.json({ success: true, data: result.rows });
}));

// POST /api/admin/feature-flags/:flag/toggle
router.post('/:flag/toggle', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const { flag } = req.params;

  const result = await pool.query(
    `UPDATE feature_flags
     SET is_enabled = NOT is_enabled, updated_at = NOW(), updated_by = $2
     WHERE flag_name = $1
     RETURNING flag_name, is_enabled, updated_at`,
    [flag, req.user.id]
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound(`Feature flag '${flag}'`);
  }

  const updated = result.rows[0];

  // Invalidate cached flag immediately
  if (flag === 'ml_scoring_enabled' && mlScoringService) {
    await mlScoringService.invalidateFlagCache();
  }

  logger.info({ flag: updated.flag_name, enabled: updated.is_enabled, userId: req.user.id },
    `[FeatureFlags] ${updated.flag_name} toggled to ${updated.is_enabled}`);

  res.json({ success: true, data: updated });
}));

const init = (deps) => {
  pool = deps.pool;
  mlScoringService = deps.mlScoringService || null;
  return router;
};

module.exports = { init };
