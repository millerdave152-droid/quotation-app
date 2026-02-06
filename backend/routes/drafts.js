/**
 * Draft Routes
 * API endpoints for draft persistence and offline sync
 */

const express = require('express');
const router = express.Router();
const DraftService = require('../services/DraftService');

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
    return res.status(500).json({
      success: false,
      error: { code: 'SERVICE_NOT_INITIALIZED', message: 'Draft service not initialized' }
    });
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
router.post('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    const draft = await draftService.saveDraft(req.body, userId);

    res.status(201).json({
      success: true,
      data: draft,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error) {
    if (error.code === 'SYNC_CONFLICT') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'SYNC_CONFLICT',
          message: error.message,
          serverVersion: error.serverVersion,
          clientVersion: error.clientVersion
        }
      });
    }

    console.error('Error saving draft:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SAVE_ERROR', message: 'Failed to save draft' }
    });
  }
});

/**
 * GET /api/drafts
 * List drafts for current user
 */
router.get('/', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error listing drafts:', error);
    res.status(500).json({
      success: false,
      error: { code: 'LIST_ERROR', message: 'Failed to list drafts' }
    });
  }
});

/**
 * GET /api/drafts/:id
 * Get a specific draft by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const draft = await draftService.getDraft(parseInt(id));

    if (!draft) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Draft not found' }
      });
    }

    res.json({
      success: true,
      data: draft,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error) {
    console.error('Error getting draft:', error);
    res.status(500).json({
      success: false,
      error: { code: 'GET_ERROR', message: 'Failed to get draft' }
    });
  }
});

/**
 * GET /api/drafts/key/:key
 * Get a draft by its unique key
 */
router.get('/key/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const draft = await draftService.getDraftByKey(key);

    if (!draft) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Draft not found' }
      });
    }

    res.json({
      success: true,
      data: draft,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error) {
    console.error('Error getting draft by key:', error);
    res.status(500).json({
      success: false,
      error: { code: 'GET_ERROR', message: 'Failed to get draft' }
    });
  }
});

/**
 * DELETE /api/drafts/:id
 * Delete a draft
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    await draftService.deleteDraft(parseInt(id), userId);

    res.json({
      success: true,
      data: { deleted: true },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Draft not found' }
      });
    }

    console.error('Error deleting draft:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_ERROR', message: 'Failed to delete draft' }
    });
  }
});

/**
 * POST /api/drafts/:id/complete
 * Mark a draft as completed (converted to quote/transaction)
 */
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const userId = req.user?.id;

    await draftService.completeDraft(parseInt(id), userId, notes);

    res.json({
      success: true,
      data: { completed: true },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Draft not found' }
      });
    }

    console.error('Error completing draft:', error);
    res.status(500).json({
      success: false,
      error: { code: 'COMPLETE_ERROR', message: 'Failed to complete draft' }
    });
  }
});

// ============================================================================
// SYNC OPERATIONS
// ============================================================================

/**
 * POST /api/drafts/sync
 * Batch sync operations from offline client
 */
router.post('/sync', async (req, res) => {
  try {
    const userId = req.user?.id;
    const deviceId = req.body.deviceId || req.headers['x-device-id'];
    const { operations } = req.body;

    if (!Array.isArray(operations)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'operations must be an array' }
      });
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
  } catch (error) {
    console.error('Error syncing:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SYNC_ERROR', message: 'Failed to sync operations' }
    });
  }
});

/**
 * GET /api/drafts/sync/pending
 * Get pending operations that need to be processed
 */
router.get('/sync/pending', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error getting pending operations:', error);
    res.status(500).json({
      success: false,
      error: { code: 'PENDING_ERROR', message: 'Failed to get pending operations' }
    });
  }
});

/**
 * POST /api/drafts/sync/operation/:id/complete
 * Mark a sync operation as completed
 */
router.post('/sync/operation/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { success, errorMessage } = req.body;

    await draftService.processSyncOperation(parseInt(id), success, errorMessage);

    res.json({
      success: true,
      data: { processed: true },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error) {
    console.error('Error processing sync operation:', error);
    res.status(500).json({
      success: false,
      error: { code: 'PROCESS_ERROR', message: 'Failed to process operation' }
    });
  }
});

// ============================================================================
// ADMIN OPERATIONS
// ============================================================================

/**
 * POST /api/drafts/admin/cleanup
 * Clean up expired drafts (admin only)
 */
router.post('/admin/cleanup', async (req, res) => {
  try {
    // Check admin role
    if (req.user?.role?.toLowerCase() !== 'admin') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin access required' }
      });
    }

    const deletedCount = await draftService.cleanupExpiredDrafts();

    res.json({
      success: true,
      data: { deletedCount },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error) {
    console.error('Error cleaning up drafts:', error);
    res.status(500).json({
      success: false,
      error: { code: 'CLEANUP_ERROR', message: 'Failed to cleanup drafts' }
    });
  }
});

module.exports = { router, init };
