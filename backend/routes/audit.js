/**
 * TeleTime POS - Audit Log Routes
 * Provides read access to the system-wide audit trail,
 * hash-chain verification, PCI DSS compliance reporting,
 * and log retention management.
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let fraudService = null;
let auditLogService = null;
let logArchiveService = null;

// ============================================================================
// ROOT — API DISCOVERY
// ============================================================================

router.get('/', authenticate, (req, res) => {
  res.json({
    success: true,
    data: {
      endpoints: [
        'GET /api/audit/logs',
        'GET /api/audit/logs/entity/:type/:id',
        'GET /api/audit/employee/:userId',
        'GET /api/audit/verify-chain',
        'POST /api/audit/verify-chain',
        'GET /api/audit/verify-chain/status',
        'GET /api/audit/compliance-report',
        'GET /api/audit/compliance-report/cached',
        'GET /api/audit/retention-status',
        'POST /api/audit/archive',
        'POST /api/audit/export'
      ]
    }
  });
});

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
// HASH-CHAIN VERIFICATION
// ============================================================================

router.get('/verify-chain', authenticate, requirePermission('audit.logs.view'), asyncHandler(async (req, res) => {
  if (!auditLogService) {
    return res.status(503).json({ success: false, message: 'Audit hash-chain service not available' });
  }

  const startId = req.query.start_id ? parseInt(req.query.start_id) : null;
  const endId = req.query.end_id ? parseInt(req.query.end_id) : null;
  const result = await auditLogService.verifyChain(startId, endId);
  res.json({ success: true, data: result });
}));

/**
 * POST /verify-chain — Verify chain integrity for a date range
 * Body: { start_date, end_date }
 */
router.post('/verify-chain', authenticate, requirePermission('audit.logs.view'), asyncHandler(async (req, res) => {
  if (!auditLogService) {
    throw ApiError.badRequest('Audit hash-chain service not available');
  }

  const { start_date, end_date } = req.body;
  if (!start_date || !end_date) {
    throw ApiError.badRequest('start_date and end_date are required');
  }

  const result = await auditLogService.verifyChainIntegrity(start_date, end_date);

  // Audit log the verification action
  auditLogService.logEvent({
    eventType: 'audit.chain_verify',
    eventCategory: 'system',
    severity: 'info',
    employeeId: req.user.id,
    details: {
      date_range: { start: start_date, end: end_date },
      totalRecords: result.totalRecords,
      violations: result.violations.length,
    },
  });

  res.json({ success: true, data: result });
}));

/**
 * GET /verify-chain/status — Get last verification result
 */
router.get('/verify-chain/status', authenticate, requirePermission('audit.logs.view'), asyncHandler(async (req, res) => {
  if (!auditLogService) {
    throw ApiError.badRequest('Audit hash-chain service not available');
  }

  const lastResult = auditLogService.getLastVerification();
  res.json({
    success: true,
    data: lastResult || { status: 'no_verification_run', checked_at: null },
  });
}));

// ============================================================================
// PCI DSS COMPLIANCE REPORT
// ============================================================================

/**
 * GET /compliance-report — Generate or retrieve a compliance report
 * Query: ?period=day|week|month|quarter|year (default: month)
 */
router.get('/compliance-report', authenticate, requirePermission('audit.logs.view'), asyncHandler(async (req, res) => {
  if (!auditLogService) {
    throw ApiError.badRequest('Audit service not available');
  }

  const period = req.query.period || 'month';
  const validPeriods = ['day', 'week', 'month', 'quarter', 'year'];
  if (!validPeriods.includes(period)) {
    throw ApiError.badRequest(`period must be one of: ${validPeriods.join(', ')}`);
  }

  const report = await auditLogService.generateComplianceReport(period);

  // Audit the report generation
  auditLogService.logEvent({
    eventType: 'audit.compliance_report',
    eventCategory: 'report',
    severity: 'info',
    employeeId: req.user.id,
    details: { period, total_events: report.total_events },
  });

  res.json({ success: true, data: report });
}));

/**
 * GET /compliance-report/cached — Get last cached report without regenerating
 */
router.get('/compliance-report/cached', authenticate, requirePermission('audit.logs.view'), asyncHandler(async (req, res) => {
  if (!auditLogService) {
    throw ApiError.badRequest('Audit service not available');
  }

  const cached = auditLogService.getLastComplianceReport();
  res.json({
    success: true,
    data: cached || { status: 'no_report_generated', generated_at: null },
  });
}));

// ============================================================================
// LOG RETENTION & ARCHIVAL
// ============================================================================

/**
 * GET /retention-status — Get current log retention tier breakdown
 */
router.get('/retention-status', authenticate, requirePermission('audit.logs.view'), asyncHandler(async (req, res) => {
  if (!logArchiveService) {
    throw ApiError.badRequest('Log archive service not available');
  }

  const status = await logArchiveService.getRetentionStatus();
  res.json({ success: true, data: status });
}));

/**
 * POST /archive — Trigger log archival (admin only)
 * Body: { older_than_months: 12 }
 */
router.post('/archive', authenticate, requirePermission('audit.logs.view'), asyncHandler(async (req, res) => {
  if (!logArchiveService) {
    throw ApiError.badRequest('Log archive service not available');
  }

  const olderThanMonths = parseInt(req.body.older_than_months) || 12;
  if (olderThanMonths < 3) {
    throw ApiError.badRequest('Cannot archive logs less than 3 months old (PCI DSS Req 10.7)');
  }

  const result = await logArchiveService.archiveLogs(olderThanMonths);

  auditLogService.logEvent({
    eventType: 'audit.archive',
    eventCategory: 'system',
    severity: 'info',
    employeeId: req.user.id,
    details: { older_than_months: olderThanMonths, exported: result.exported, files: result.files },
  });

  res.json({ success: true, data: result });
}));

/**
 * POST /export — Export a date range to compressed JSON
 * Body: { start_date, end_date }
 */
router.post('/export', authenticate, requirePermission('audit.logs.view'), asyncHandler(async (req, res) => {
  if (!logArchiveService) {
    throw ApiError.badRequest('Log archive service not available');
  }

  const { start_date, end_date } = req.body;
  if (!start_date || !end_date) {
    throw ApiError.badRequest('start_date and end_date are required');
  }

  const result = await logArchiveService.exportToJsonFile(start_date, end_date);

  auditLogService.logEvent({
    eventType: 'audit.export',
    eventCategory: 'export',
    severity: 'info',
    employeeId: req.user.id,
    details: { start_date, end_date, records: result.count, file: result.file },
  });

  res.json({ success: true, data: result });
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  fraudService = deps.fraudService;
  auditLogService = deps.auditLogService || null;
  logArchiveService = deps.logArchiveService || null;
  return router;
};

module.exports = { init };
