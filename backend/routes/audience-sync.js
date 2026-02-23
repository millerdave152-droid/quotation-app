const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

let syncService = null;

// List syncs
router.get('/', authenticate, requirePermission('audience_sync.view'), asyncHandler(async (req, res) => {
  const syncs = await syncService.listSyncs();
  res.success(syncs);
}));

// Create sync
router.post('/', authenticate, requirePermission('audience_sync.create'), asyncHandler(async (req, res) => {
  const sync = await syncService.createSync(req.body, req.user.userId);
  res.created(sync);
}));

// Update sync
router.put('/:id', authenticate, requirePermission('audience_sync.edit'), asyncHandler(async (req, res) => {
  const sync = await syncService.updateSync(parseInt(req.params.id), req.body);
  res.success(sync);
}));

// Run sync
router.post('/:id/run', authenticate, requirePermission('audience_sync.run'), asyncHandler(async (req, res) => {
  const result = await syncService.runSync(parseInt(req.params.id));
  res.success({ logId: result.logId, membersMatched: result.membersMatched });
}));

// Get sync logs
router.get('/:id/logs', authenticate, requirePermission('audience_sync.view'), asyncHandler(async (req, res) => {
  const logs = await syncService.getSyncLogs(parseInt(req.params.id));
  res.success(logs);
}));

const init = (deps) => {
  syncService = deps.syncService;
  return router;
};

module.exports = { init };
