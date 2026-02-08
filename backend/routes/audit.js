/**
 * TeleTime POS - Audit Log Routes
 * Provides read access to the system-wide audit trail
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let fraudService = null;

// ============================================================================
// AUDIT LOGS
// ============================================================================

router.get('/logs', authenticate, requirePermission('audit.logs.view'), asyncHandler(async (req, res) => {
  const { user_id, action, entity_type, date_from, date_to, page = 1, limit = 50 } = req.query;
  const filters = {};
  if (user_id) filters.user_id = parseInt(user_id);
  if (action) filters.action = action;
  if (entity_type) filters.entity_type = entity_type;
  if (date_from) filters.date_from = date_from;
  if (date_to) filters.date_to = date_to;

  const logs = await fraudService.getAuditLogs(filters, { page: parseInt(page), limit: parseInt(limit) });
  res.json({ success: true, data: logs });
}));

router.get('/logs/entity/:type/:id', authenticate, requirePermission('audit.logs.view'), asyncHandler(async (req, res) => {
  const logs = await fraudService.getAuditLogs(
    { entity_type: req.params.type, entity_id: parseInt(req.params.id) },
    { page: 1, limit: 100 }
  );
  res.json({ success: true, data: logs });
}));

router.get('/employee/:userId', authenticate, requirePermission('audit.logs.view'), asyncHandler(async (req, res) => {
  const logs = await fraudService.getAuditLogs(
    { user_id: parseInt(req.params.userId) },
    { page: 1, limit: 100 }
  );
  res.json({ success: true, data: logs });
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  fraudService = deps.fraudService;
  return router;
};

module.exports = { init };
