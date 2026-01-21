/**
 * Reports API Routes
 * Handles report templates, execution, and scheduling
 * Uses consistent error handling with asyncHandler and ApiError
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const ReportBuilderService = require('../services/ReportBuilderService');

// Module-level dependencies (injected via init)
let pool = null;
let reportService = null;

/**
 * Initialize the router with dependencies
 * @param {object} deps - Dependencies
 * @param {Pool} deps.pool - PostgreSQL connection pool
 */
const init = (deps) => {
  pool = deps.pool;
  reportService = new ReportBuilderService(pool);

  // Ensure tables exist
  reportService.ensureTables().catch(err => {
    console.error('Failed to ensure report tables:', err);
  });

  return router;
};

// ============================================
// REPORT BUILDER METADATA
// ============================================

/**
 * GET /api/reports/metrics
 * Get available metrics for report builder
 */
router.get('/metrics', authenticate, asyncHandler(async (req, res) => {
  const metrics = reportService.getAvailableMetrics();
  res.json({ success: true, data: metrics });
}));

/**
 * GET /api/reports/dimensions
 * Get available dimensions for report builder
 */
router.get('/dimensions', authenticate, asyncHandler(async (req, res) => {
  const dimensions = reportService.getAvailableDimensions();
  res.json({ success: true, data: dimensions });
}));

/**
 * GET /api/reports/prebuilt
 * Get pre-built report templates
 */
router.get('/prebuilt', authenticate, asyncHandler(async (req, res) => {
  const templates = reportService.getPrebuiltTemplates();
  res.json({ success: true, data: templates });
}));

// ============================================
// REPORT TEMPLATES
// ============================================

/**
 * GET /api/reports/templates
 * Get all report templates
 */
router.get('/templates', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user?.username || req.user?.id;
  const templates = await reportService.getTemplates(userId);
  res.json({ success: true, data: templates });
}));

/**
 * GET /api/reports/templates/:id
 * Get a single report template
 */
router.get('/templates/:id', authenticate, asyncHandler(async (req, res) => {
  const templateId = parseInt(req.params.id);

  if (isNaN(templateId)) {
    throw ApiError.badRequest('Invalid template ID');
  }

  const template = await reportService.getTemplate(templateId);

  if (!template) {
    throw ApiError.notFound('Template');
  }

  res.json({ success: true, data: template });
}));

/**
 * POST /api/reports/templates
 * Create a new report template
 */
router.post('/templates', authenticate, asyncHandler(async (req, res) => {
  const { name, description, config, isPublic } = req.body;

  if (!name) {
    throw ApiError.badRequest('Template name is required');
  }

  if (!config || !config.metrics || !Array.isArray(config.metrics)) {
    throw ApiError.badRequest('Report config with metrics array is required');
  }

  const template = await reportService.createTemplate({
    name,
    description,
    config,
    createdBy: req.user?.username || req.user?.id,
    isPublic
  });

  res.status(201).json({ success: true, data: template });
}));

/**
 * PUT /api/reports/templates/:id
 * Update a report template
 */
router.put('/templates/:id', authenticate, asyncHandler(async (req, res) => {
  const templateId = parseInt(req.params.id);

  if (isNaN(templateId)) {
    throw ApiError.badRequest('Invalid template ID');
  }

  const template = await reportService.updateTemplate(templateId, req.body);

  if (!template) {
    throw ApiError.notFound('Template');
  }

  res.json({ success: true, data: template });
}));

/**
 * DELETE /api/reports/templates/:id
 * Delete a report template
 */
router.delete('/templates/:id', authenticate, asyncHandler(async (req, res) => {
  const templateId = parseInt(req.params.id);

  if (isNaN(templateId)) {
    throw ApiError.badRequest('Invalid template ID');
  }

  await reportService.deleteTemplate(templateId);
  res.json({ success: true, message: 'Template deleted' });
}));

// ============================================
// REPORT EXECUTION
// ============================================

/**
 * POST /api/reports/execute
 * Execute a report with given configuration
 */
router.post('/execute', authenticate, asyncHandler(async (req, res) => {
  const { config, templateId } = req.body;

  if (!config && !templateId) {
    throw ApiError.badRequest('Report config or templateId is required');
  }

  let reportConfig = config;

  // If templateId provided, get config from template
  if (templateId && !config) {
    const template = await reportService.getTemplate(templateId);
    if (!template) {
      throw ApiError.notFound('Template');
    }
    reportConfig = typeof template.config === 'string'
      ? JSON.parse(template.config)
      : template.config;
  }

  if (!reportConfig.metrics || !Array.isArray(reportConfig.metrics)) {
    throw ApiError.badRequest('Report config must include metrics array');
  }

  const result = await reportService.executeReport(reportConfig, { templateId });
  res.json({ success: true, data: result });
}));

/**
 * POST /api/reports/templates/:id/execute
 * Execute a report template
 */
router.post('/templates/:id/execute', authenticate, asyncHandler(async (req, res) => {
  const templateId = parseInt(req.params.id);

  if (isNaN(templateId)) {
    throw ApiError.badRequest('Invalid template ID');
  }

  const template = await reportService.getTemplate(templateId);

  if (!template) {
    throw ApiError.notFound('Template');
  }

  const config = typeof template.config === 'string'
    ? JSON.parse(template.config)
    : template.config;

  // Allow overriding date range and filters
  if (req.body.dateRange) {
    config.dateRange = req.body.dateRange;
  }
  if (req.body.filters) {
    config.filters = { ...config.filters, ...req.body.filters };
  }

  const result = await reportService.executeReport(config, { templateId });
  res.json({ success: true, data: result });
}));

/**
 * GET /api/reports/executions
 * Get report execution history
 */
router.get('/executions', authenticate, asyncHandler(async (req, res) => {
  const templateId = req.query.templateId ? parseInt(req.query.templateId) : null;
  const limit = parseInt(req.query.limit) || 50;

  const executions = await reportService.getExecutionHistory(templateId, limit);
  res.json({ success: true, data: executions });
}));

// ============================================
// SCHEDULED REPORTS
// ============================================

/**
 * GET /api/reports/scheduled
 * Get all scheduled reports
 */
router.get('/scheduled', authenticate, asyncHandler(async (req, res) => {
  const templateId = req.query.templateId ? parseInt(req.query.templateId) : null;
  const schedules = await reportService.getScheduledReports(templateId);
  res.json({ success: true, data: schedules });
}));

/**
 * POST /api/reports/scheduled
 * Create a scheduled report
 */
router.post('/scheduled', authenticate, asyncHandler(async (req, res) => {
  const { templateId, scheduleType, scheduleConfig, recipients } = req.body;

  if (!templateId) {
    throw ApiError.badRequest('Template ID is required');
  }

  if (!scheduleType || !['daily', 'weekly', 'monthly'].includes(scheduleType)) {
    throw ApiError.badRequest('Schedule type must be daily, weekly, or monthly');
  }

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    throw ApiError.badRequest('At least one recipient email is required');
  }

  const schedule = await reportService.scheduleReport({
    templateId,
    scheduleType,
    scheduleConfig,
    recipients,
    createdBy: req.user?.username || req.user?.id
  });

  res.status(201).json({ success: true, data: schedule });
}));

/**
 * PUT /api/reports/scheduled/:id
 * Update a scheduled report
 */
router.put('/scheduled/:id', authenticate, asyncHandler(async (req, res) => {
  const scheduleId = parseInt(req.params.id);

  if (isNaN(scheduleId)) {
    throw ApiError.badRequest('Invalid schedule ID');
  }

  const schedule = await reportService.updateScheduledReport(scheduleId, req.body);

  if (!schedule) {
    throw ApiError.notFound('Scheduled report');
  }

  res.json({ success: true, data: schedule });
}));

/**
 * DELETE /api/reports/scheduled/:id
 * Delete a scheduled report
 */
router.delete('/scheduled/:id', authenticate, asyncHandler(async (req, res) => {
  const scheduleId = parseInt(req.params.id);

  if (isNaN(scheduleId)) {
    throw ApiError.badRequest('Invalid schedule ID');
  }

  await reportService.deleteScheduledReport(scheduleId);
  res.json({ success: true, message: 'Scheduled report deleted' });
}));

/**
 * POST /api/reports/scheduled/process
 * Process due scheduled reports (for cron job)
 */
router.post('/scheduled/process', authenticate, asyncHandler(async (req, res) => {
  const results = await reportService.processScheduledReports();
  res.json({
    success: true,
    data: {
      processed: results.length,
      results
    }
  });
}));

module.exports = { router, init };
