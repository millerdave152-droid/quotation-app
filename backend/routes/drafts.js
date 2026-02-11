/**
 * Draft Routes
 * API endpoints for draft persistence and offline sync
 */

const express = require('express');
const router = express.Router();
const DraftService = require('../services/DraftService');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

let draftService;

/**
 * Initialize routes with dependencies
 */
const init = ({ pool }) => {
  draftService = new DraftService(pool);
  return router;
};

// Middleware to ensure service is initialized
const ensureInit = (req, res, next) => {
  if (!draftService) {
    throw ApiError.serviceUnavailable('Draft service');
  }
  next();
};

router.use(ensureInit);

// ============================================================================
// DRAFT CRUD
// ============================================================================

/**
 * POST /api/drafts
 * Save or update a draft
 */
router.post('/', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const draft = await draftService.saveDraft(req.body, userId);

  res.status(201).json({
    success: true,
    data: draft,
    meta: { timestamp: new Date().toISOString() }
  });
}));

/**
 * GET /api/drafts
 * List drafts for current user
 */
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { draftType, deviceId, registerId, includeExpired, limit, offset } = req.query;

  const result = await draftService.listDrafts({
    userId,
    draftType,
    deviceId,
    registerId: registerId ? parseInt(registerId) : undefined,
    includeExpired: includeExpired === 'true',
    limit: limit ? parseInt(limit) : 50,
    offset: offset ? parseInt(offset) : 0,
  });

  res.json({
    success: true,
    data: result.drafts,
    meta: {
      timestamp: new Date().toISOString(),
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      }
    }
  });
}));

/**
 * GET /api/drafts/:id
 * Get a specific draft by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const draft = await draftService.getDraft(parseInt(id));

  if (!draft) {
    throw ApiError.notFound('Draft');
  }

  res.json({
    success: true,
    data: draft,
    meta: { timestamp: new Date().toISOString() }
  });
}));

/**
 * GET /api/drafts/key/:key
 * Get a draft by its unique key
 */
router.get('/key/:key', asyncHandler(async (req, res) => {
  const { key } = req.params;
  const draft = await draftService.getDraftByKey(key);

  if (!draft) {
    throw ApiError.notFound('Draft');
  }

  res.json({
    success: true,
    data: draft,
    meta: { timestamp: new Date().toISOString() }
  });
}));

/**
 * DELETE /api/drafts/:id
 * Delete a draft
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  await draftService.deleteDraft(parseInt(id), userId);

  res.json({
    success: true,
    data: { deleted: true },
    meta: { timestamp: new Date().toISOString() }
  });
}));

/**
 * POST /api/drafts/:id/complete
 * Mark a draft as completed (converted to quote/transaction)
 */
router.post('/:id/complete', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  const userId = req.user?.id;

  await draftService.completeDraft(parseInt(id), userId, notes);

  res.json({
    success: true,
    data: { completed: true },
    meta: { timestamp: new Date().toISOString() }
  });
}));

// ============================================================================
// SYNC OPERATIONS
// ============================================================================

/**
 * POST /api/drafts/sync
 * Batch sync operations from offline client
 */
router.post('/sync', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const deviceId = req.body.deviceId || req.headers['x-device-id'];
  const { operations } = req.body;

  if (!Array.isArray(operations)) {
    throw ApiError.badRequest('operations must be an array');
  }

  const results = await draftService.batchSync(operations, userId, deviceId);

  res.json({
    success: true,
    data: {
      results,
      syncedAt: new Date().toISOString(),
    },
    meta: { timestamp: new Date().toISOString() }
  });
}));

/**
 * GET /api/drafts/sync/pending
 * Get pending operations that need to be processed
 */
router.get('/sync/pending', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const deviceId = req.query.deviceId || req.headers['x-device-id'];

  const operations = await draftService.getPendingSyncOperations({
    userId,
    deviceId,
    limit: parseInt(req.query.limit) || 100,
  });

  res.json({
    success: true,
    data: operations,
    meta: { timestamp: new Date().toISOString() }
  });
}));

/**
 * POST /api/drafts/sync/operation/:id/complete
 * Mark a sync operation as completed
 */
router.post('/sync/operation/:id/complete', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { success, errorMessage } = req.body;

  await draftService.processSyncOperation(parseInt(id), success, errorMessage);

  res.json({
    success: true,
    data: { processed: true },
    meta: { timestamp: new Date().toISOString() }
  });
}));

// ============================================================================
// ADMIN OPERATIONS
// ============================================================================

/**
 * POST /api/drafts/admin/cleanup
 * Clean up expired drafts (admin only)
 */
router.post('/admin/cleanup', asyncHandler(async (req, res) => {
  // Check admin role
  if (req.user?.role?.toLowerCase() !== 'admin') {
    throw ApiError.forbidden('Admin access required');
  }

  const deletedCount = await draftService.cleanupExpiredDrafts();

  res.json({
    success: true,
    data: { deletedCount },
    meta: { timestamp: new Date().toISOString() }
  });
}));

module.exports = { router, init };
