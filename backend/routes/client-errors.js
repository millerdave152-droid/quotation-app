'use strict';

/**
 * TeleTime — Client Error Tracking Routes
 * Accepts batched error reports from POS/web clients,
 * and exposes query/management endpoints for the admin dashboard.
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let errorTrackingService = null;

// Rate limiter for the report endpoint (30 req/min per IP)
const reportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many error reports. Try again later.' },
});

// ============================================================================
// INGESTION — POST /api/errors/client-report
// Auth is optional (works pre-login for startup errors)
// ============================================================================

router.post('/client-report', reportLimiter, asyncHandler(async (req, res) => {
  const { errors, meta } = req.body || {};

  if (!Array.isArray(errors) || errors.length === 0) {
    return res.status(400).json({ success: false, message: 'errors[] is required' });
  }
  if (errors.length > 50) {
    return res.status(400).json({ success: false, message: 'Maximum 50 errors per batch' });
  }

  // Try to extract userId from Authorization header if present
  let userId = meta?.userId || null;
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
      userId = decoded.id || decoded.userId || userId;
    }
  } catch (_) {
    // Token invalid/expired — that's fine, proceed without userId
  }

  const result = await errorTrackingService.ingestBatch(errors, {
    ...meta,
    userId,
    userAgent: req.headers['user-agent'],
  });

  res.status(202).json({ success: true, data: result });
}));

// ============================================================================
// QUERY — GET /api/errors/client  (paginated error groups)
// ============================================================================

router.get('/client', authenticate, requirePermission('errors.client.view'), asyncHandler(async (req, res) => {
  const { status, severity, error_type, search, date_from, date_to, page, limit, sort_by, sort_dir } = req.query;

  const result = await errorTrackingService.getErrorGroups(
    {
      status: status || undefined,
      severity: severity || undefined,
      errorType: error_type || undefined,
      search: search || undefined,
      dateFrom: date_from || undefined,
      dateTo: date_to || undefined,
    },
    {
      page: page || 1,
      limit: limit || 25,
      sortBy: sort_by || 'last_seen',
      sortDir: sort_dir || 'DESC',
    }
  );

  res.json({ success: true, data: result });
}));

// ============================================================================
// STATS — GET /api/errors/client/stats
// ============================================================================

router.get('/client/stats', authenticate, requirePermission('errors.client.view'), asyncHandler(async (req, res) => {
  const { date_from, date_to } = req.query;
  const stats = await errorTrackingService.getStats(date_from, date_to);
  res.json({ success: true, data: stats });
}));

// ============================================================================
// DETAIL — GET /api/errors/client/:id
// ============================================================================

router.get('/client/:id', authenticate, requirePermission('errors.client.view'), asyncHandler(async (req, res) => {
  const group = await errorTrackingService.getErrorGroupDetail(parseInt(req.params.id));
  if (!group) {
    throw ApiError.notFound('Error group');
  }
  res.json({ success: true, data: group });
}));

// ============================================================================
// STATUS UPDATE — PATCH /api/errors/client/:id/status
// ============================================================================

router.patch('/client/:id/status', authenticate, requirePermission('errors.client.manage'), asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  if (!status) {
    return res.status(400).json({ success: false, message: 'status is required' });
  }

  const updated = await errorTrackingService.updateGroupStatus(
    parseInt(req.params.id),
    status,
    req.user.id,
    notes || null
  );

  if (!updated) {
    throw ApiError.notFound('Error group');
  }
  res.json({ success: true, data: updated });
}));

// ============================================================================
// BULK STATUS — POST /api/errors/client/bulk-status
// ============================================================================

router.post('/client/bulk-status', authenticate, requirePermission('errors.client.manage'), asyncHandler(async (req, res) => {
  const { groupIds, status } = req.body;
  if (!Array.isArray(groupIds) || !status) {
    return res.status(400).json({ success: false, message: 'groupIds[] and status are required' });
  }

  const result = await errorTrackingService.bulkUpdateStatus(groupIds, status, req.user.id);
  res.json({ success: true, data: result });
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  errorTrackingService = deps.errorTrackingService;
  return router;
};

module.exports = { init };
