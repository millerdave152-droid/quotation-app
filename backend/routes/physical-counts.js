const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

let countService = null;

// List counts
router.get('/', authenticate, requirePermission('inventory_counts.view'), asyncHandler(async (req, res) => {
  const { locationId, status, limit, offset } = req.query;
  const result = await countService.listCounts({
    locationId: locationId ? parseInt(locationId) : undefined,
    status,
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  });
  res.success(result);
}));

// Get single count with items
router.get('/:id', authenticate, requirePermission('inventory_counts.view'), asyncHandler(async (req, res) => {
  const count = await countService.getCount(parseInt(req.params.id));
  res.success(count);
}));

// Create count
router.post('/', authenticate, requirePermission('inventory_counts.create'), asyncHandler(async (req, res) => {
  const { locationId, countType, notes } = req.body;
  const count = await countService.createCount(locationId, countType || 'full', req.user.userId, notes);
  res.created(count);
}));

// Start count (snapshot expected inventory)
router.post('/:id/start', authenticate, requirePermission('inventory_counts.count'), asyncHandler(async (req, res) => {
  const count = await countService.startCount(parseInt(req.params.id), req.user.userId);
  res.success(count);
}));

// Record single count entry
router.post('/:id/record', authenticate, requirePermission('inventory_counts.count'), asyncHandler(async (req, res) => {
  const { productId, countedQty, barcode } = req.body;
  const item = await countService.recordCount(parseInt(req.params.id), productId, countedQty, req.user.userId, barcode);
  res.success(item);
}));

// Bulk record counts
router.post('/:id/bulk-record', authenticate, requirePermission('inventory_counts.count'), asyncHandler(async (req, res) => {
  const { entries } = req.body;
  const results = await countService.bulkRecordCounts(parseInt(req.params.id), entries, req.user.userId);
  res.success(results);
}));

// Complete count (move to review)
router.post('/:id/complete', authenticate, requirePermission('inventory_counts.count'), asyncHandler(async (req, res) => {
  const count = await countService.completeCount(parseInt(req.params.id), req.user.userId);
  res.success(count);
}));

// Approve count (apply adjustments)
// Requires inventory_counts.approve permission. Self-approval forbidden.
router.post('/:id/approve', authenticate, requirePermission('inventory_counts.approve'), asyncHandler(async (req, res) => {
  const countId = parseInt(req.params.id);
  const userId = req.user.id || req.user.userId;

  // Prevent self-approval: the person who created or counted cannot approve
  const existing = await countService.getCount(countId);
  if (existing.started_by === userId) {
    return res.status(403).json({
      success: false,
      error: 'Cannot approve your own inventory count',
      code: 'SELF_APPROVAL_FORBIDDEN',
    });
  }

  const result = await countService.approveCount(countId, userId);

  // Audit log
  const pool = req.app.get('pool');
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address, user_agent, created_at)
         VALUES ($1, 'PHYSICAL_COUNT_APPROVED', 'physical_count', $2, $3, $4, $5, NOW())`,
        [
          userId,
          countId,
          JSON.stringify({
            count_id: countId,
            approved_by: userId,
            variance_units: existing.total_variance_units || 0,
            variance_value_cents: existing.total_variance_cost_cents || 0,
            location_id: existing.location_id,
            count_number: existing.count_number,
          }),
          req.ip,
          req.get('user-agent'),
        ]
      );
    } catch (auditErr) {
      const logger = require('../utils/logger');
      logger.error({ err: auditErr }, '[PhysicalCount] Audit log insert failed (non-fatal)');
    }
  }

  res.success(result);
}));

// Variance report
router.get('/:id/variance', authenticate, requirePermission('inventory_counts.view'), asyncHandler(async (req, res) => {
  const report = await countService.getVarianceReport(parseInt(req.params.id));
  res.success(report);
}));

// ABC Classification
router.get('/abc/:locationId', authenticate, requirePermission('inventory_counts.view'), asyncHandler(async (req, res) => {
  const classification = await countService.getAbcClassification(parseInt(req.params.locationId));
  res.success(classification);
}));

// Generate cycle counts
router.post('/cycle-count/:locationId', authenticate, requirePermission('inventory_counts.create'), asyncHandler(async (req, res) => {
  const counts = await countService.generateCycleCount(parseInt(req.params.locationId));
  res.success(counts);
}));

const init = (deps) => {
  countService = deps.countService;
  return router;
};

module.exports = { init };
