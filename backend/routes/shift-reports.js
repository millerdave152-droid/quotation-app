/**
 * TeleTime POS - Shift Report Routes
 * Endpoints for generating shift and period reports
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const ShiftReportService = require('../services/ShiftReportService');

// ============================================================================
// MODULE STATE
// ============================================================================

let reportService = null;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const reportParamsSchema = Joi.object({
  shiftId: Joi.number().integer().positive(),
  startTime: Joi.string().isoDate(),
  endTime: Joi.string().isoDate(),
  storeId: Joi.number().integer().positive(),
  registerId: Joi.number().integer().positive(),
}).or('shiftId', 'startTime'); // Require either shiftId or startTime

const compareParamsSchema = Joi.object({
  currentStart: Joi.string().isoDate().required(),
  currentEnd: Joi.string().isoDate().required(),
  previousStart: Joi.string().isoDate().required(),
  previousEnd: Joi.string().isoDate().required(),
  storeId: Joi.number().integer().positive(),
  registerId: Joi.number().integer().positive(),
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/reports/shift/:shiftId
 * Generate full report for a specific shift
 */
router.get('/shift/:shiftId', authenticate, asyncHandler(async (req, res) => {
  const shiftId = parseInt(req.params.shiftId, 10);

  if (!shiftId || isNaN(shiftId)) {
    throw ApiError.badRequest('Invalid shift ID');
  }

  const report = await reportService.generateShiftReport({ shiftId });

  if (!report.shift) {
    throw ApiError.notFound('Shift not found');
  }

  res.json({
    success: true,
    data: report,
  });
}));

/**
 * GET /api/reports/shift/:shiftId/summary
 * Get summary only for a specific shift (faster, for dashboards)
 */
router.get('/shift/:shiftId/summary', authenticate, asyncHandler(async (req, res) => {
  const shiftId = parseInt(req.params.shiftId, 10);

  if (!shiftId || isNaN(shiftId)) {
    throw ApiError.badRequest('Invalid shift ID');
  }

  const summary = await reportService.getShiftSummary({ shiftId });

  if (!summary.shift) {
    throw ApiError.notFound('Shift not found');
  }

  res.json({
    success: true,
    data: summary,
  });
}));

/**
 * POST /api/reports/period
 * Generate report for a date/time range
 *
 * Body:
 * {
 *   "startTime": "2025-01-27T00:00:00Z",
 *   "endTime": "2025-01-27T23:59:59Z",
 *   "storeId": 1,        // optional
 *   "registerId": 1      // optional
 * }
 */
router.post('/period', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = reportParamsSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw ApiError.badRequest('Invalid parameters', error.details);
  }

  const report = await reportService.generateShiftReport(value);

  res.json({
    success: true,
    data: report,
  });
}));

/**
 * POST /api/reports/period/summary
 * Get summary only for a date/time range (faster)
 */
router.post('/period/summary', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = reportParamsSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw ApiError.badRequest('Invalid parameters', error.details);
  }

  const summary = await reportService.getShiftSummary(value);

  res.json({
    success: true,
    data: summary,
  });
}));

/**
 * GET /api/reports/today
 * Quick endpoint for today's report
 */
router.get('/today', authenticate, asyncHandler(async (req, res) => {
  const { registerId, storeId } = req.query;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const params = {
    startTime: today.toISOString(),
    endTime: tomorrow.toISOString(),
  };

  if (registerId) params.registerId = parseInt(registerId, 10);
  if (storeId) params.storeId = parseInt(storeId, 10);

  const report = await reportService.generateShiftReport(params);

  res.json({
    success: true,
    data: report,
  });
}));

/**
 * GET /api/reports/today/summary
 * Quick endpoint for today's summary
 */
router.get('/today/summary', authenticate, asyncHandler(async (req, res) => {
  const { registerId, storeId } = req.query;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const params = {
    startTime: today.toISOString(),
    endTime: tomorrow.toISOString(),
  };

  if (registerId) params.registerId = parseInt(registerId, 10);
  if (storeId) params.storeId = parseInt(storeId, 10);

  const summary = await reportService.getShiftSummary(params);

  res.json({
    success: true,
    data: summary,
  });
}));

/**
 * POST /api/reports/compare
 * Compare two periods
 *
 * Body:
 * {
 *   "currentStart": "2025-01-27T00:00:00Z",
 *   "currentEnd": "2025-01-27T23:59:59Z",
 *   "previousStart": "2025-01-26T00:00:00Z",
 *   "previousEnd": "2025-01-26T23:59:59Z",
 *   "storeId": 1,
 *   "registerId": 1
 * }
 */
router.post('/compare', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = compareParamsSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw ApiError.badRequest('Invalid parameters', error.details);
  }

  const currentParams = {
    startTime: value.currentStart,
    endTime: value.currentEnd,
    storeId: value.storeId,
    registerId: value.registerId,
  };

  const previousParams = {
    startTime: value.previousStart,
    endTime: value.previousEnd,
    storeId: value.storeId,
    registerId: value.registerId,
  };

  const comparison = await reportService.comparePeriodsReport(currentParams, previousParams);

  res.json({
    success: true,
    data: comparison,
  });
}));

/**
 * GET /api/reports/my-shift
 * Get report for current user's active shift
 */
router.get('/my-shift', authenticate, asyncHandler(async (req, res) => {
  // Find user's active shift
  const shiftResult = await reportService.pool.query(`
    SELECT shift_id FROM register_shifts
    WHERE user_id = $1 AND status = 'open'
    LIMIT 1
  `, [req.user.id]);

  if (shiftResult.rows.length === 0) {
    return res.json({
      success: true,
      data: null,
      message: 'No active shift found',
    });
  }

  const shiftId = shiftResult.rows[0].shift_id;
  const report = await reportService.generateShiftReport({ shiftId });

  res.json({
    success: true,
    data: report,
  });
}));

/**
 * GET /api/reports/my-shift/summary
 * Get summary for current user's active shift
 */
router.get('/my-shift/summary', authenticate, asyncHandler(async (req, res) => {
  // Find user's active shift
  const shiftResult = await reportService.pool.query(`
    SELECT shift_id FROM register_shifts
    WHERE user_id = $1 AND status = 'open'
    LIMIT 1
  `, [req.user.id]);

  if (shiftResult.rows.length === 0) {
    return res.json({
      success: true,
      data: null,
      message: 'No active shift found',
    });
  }

  const shiftId = shiftResult.rows[0].shift_id;
  const summary = await reportService.getShiftSummary({ shiftId });

  res.json({
    success: true,
    data: summary,
  });
}));

/**
 * GET /api/reports/sales-rep/:repId
 * Get report for a specific sales rep over a period
 */
router.get('/sales-rep/:repId', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const repId = parseInt(req.params.repId, 10);
  const { startTime, endTime } = req.query;

  if (!repId || isNaN(repId)) {
    throw ApiError.badRequest('Invalid rep ID');
  }

  // Default to today if no dates provided
  let start = startTime;
  let end = endTime;

  if (!start) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    start = today.toISOString();
  }

  if (!end) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    end = tomorrow.toISOString();
  }

  // Custom query for rep-specific report
  const repReport = await getRepReport(reportService.pool, repId, start, end);

  res.json({
    success: true,
    data: repReport,
  });
}));

// ============================================================================
// CSV EXPORT ROUTES
// ============================================================================

/**
 * GET /api/reports/export/csv
 * Export report as CSV file
 *
 * Query params:
 *   - date: Date string (YYYY-MM-DD) for daily report
 *   - shiftId: Specific shift ID
 *   - startTime: Start of period (ISO)
 *   - endTime: End of period (ISO)
 *   - type: Report type (summary, transactions, products, payments, reps, hourly, items)
 *   - registerId: Optional register filter
 */
router.get('/export/csv', authenticate, asyncHandler(async (req, res) => {
  const { date, shiftId, startTime, endTime, type = 'summary', registerId } = req.query;

  // Build params
  const params = {};

  if (shiftId) {
    params.shiftId = parseInt(shiftId, 10);
  } else if (date) {
    // Parse date for daily report
    const reportDate = new Date(date);
    reportDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(reportDate);
    nextDay.setDate(nextDay.getDate() + 1);

    params.startTime = reportDate.toISOString();
    params.endTime = nextDay.toISOString();
  } else if (startTime && endTime) {
    params.startTime = startTime;
    params.endTime = endTime;
  } else {
    // Default to today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    params.startTime = today.toISOString();
    params.endTime = tomorrow.toISOString();
  }

  if (registerId) {
    params.registerId = parseInt(registerId, 10);
  }

  // Validate report type
  const validTypes = ['summary', 'transactions', 'products', 'payments', 'reps', 'hourly', 'items'];
  if (!validTypes.includes(type)) {
    throw ApiError.badRequest(`Invalid report type. Valid types: ${validTypes.join(', ')}`);
  }

  // Generate CSV
  let csv;
  if (type === 'items') {
    csv = await reportService.exportTransactionItemsCSV(params);
  } else {
    csv = await reportService.exportShiftReportCSV(params, type);
  }

  // Build filename
  const dateStr = params.shiftId
    ? `shift-${params.shiftId}`
    : (date || new Date(params.startTime).toISOString().split('T')[0]);
  const filename = `${type}-report-${dateStr}.csv`;

  // Set headers for download
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}));

/**
 * GET /api/reports/export/zip
 * Export all reports as ZIP file
 *
 * Query params:
 *   - date: Date string (YYYY-MM-DD) for daily report
 *   - shiftId: Specific shift ID
 *   - startTime: Start of period (ISO)
 *   - endTime: End of period (ISO)
 *   - registerId: Optional register filter
 */
router.get('/export/zip', authenticate, asyncHandler(async (req, res) => {
  const { date, shiftId, startTime, endTime, registerId } = req.query;

  // Build params
  const params = {};

  if (shiftId) {
    params.shiftId = parseInt(shiftId, 10);
  } else if (date) {
    const reportDate = new Date(date);
    reportDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(reportDate);
    nextDay.setDate(nextDay.getDate() + 1);

    params.startTime = reportDate.toISOString();
    params.endTime = nextDay.toISOString();
  } else if (startTime && endTime) {
    params.startTime = startTime;
    params.endTime = endTime;
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    params.startTime = today.toISOString();
    params.endTime = tomorrow.toISOString();
  }

  if (registerId) {
    params.registerId = parseInt(registerId, 10);
  }

  // Generate ZIP
  const zipBuffer = await reportService.exportShiftReportZip(params);

  // Build filename
  const dateStr = params.shiftId
    ? `shift-${params.shiftId}`
    : (date || new Date(params.startTime).toISOString().split('T')[0]);
  const filename = `shift-reports-${dateStr}.zip`;

  // Set headers for download
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', zipBuffer.length);
  res.send(zipBuffer);
}));

/**
 * GET /api/reports/shift/:shiftId/csv
 * Export specific shift report as CSV
 */
router.get('/shift/:shiftId/csv', authenticate, asyncHandler(async (req, res) => {
  const shiftId = parseInt(req.params.shiftId, 10);
  const { type = 'summary' } = req.query;

  if (!shiftId || isNaN(shiftId)) {
    throw ApiError.badRequest('Invalid shift ID');
  }

  const validTypes = ['summary', 'transactions', 'products', 'payments', 'reps', 'hourly', 'items'];
  if (!validTypes.includes(type)) {
    throw ApiError.badRequest(`Invalid report type. Valid types: ${validTypes.join(', ')}`);
  }

  const params = { shiftId };

  let csv;
  if (type === 'items') {
    csv = await reportService.exportTransactionItemsCSV(params);
  } else {
    csv = await reportService.exportShiftReportCSV(params, type);
  }

  const filename = `${type}-report-shift-${shiftId}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}));

/**
 * GET /api/reports/shift/:shiftId/zip
 * Export specific shift as ZIP with all reports
 */
router.get('/shift/:shiftId/zip', authenticate, asyncHandler(async (req, res) => {
  const shiftId = parseInt(req.params.shiftId, 10);

  if (!shiftId || isNaN(shiftId)) {
    throw ApiError.badRequest('Invalid shift ID');
  }

  const params = { shiftId };
  const zipBuffer = await reportService.exportShiftReportZip(params);

  const filename = `shift-reports-${shiftId}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', zipBuffer.length);
  res.send(zipBuffer);
}));

/**
 * GET /api/reports/today/csv
 * Export today's report as CSV
 */
router.get('/today/csv', authenticate, asyncHandler(async (req, res) => {
  const { type = 'summary', registerId } = req.query;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const params = {
    startTime: today.toISOString(),
    endTime: tomorrow.toISOString(),
  };

  if (registerId) {
    params.registerId = parseInt(registerId, 10);
  }

  const validTypes = ['summary', 'transactions', 'products', 'payments', 'reps', 'hourly', 'items'];
  if (!validTypes.includes(type)) {
    throw ApiError.badRequest(`Invalid report type. Valid types: ${validTypes.join(', ')}`);
  }

  let csv;
  if (type === 'items') {
    csv = await reportService.exportTransactionItemsCSV(params);
  } else {
    csv = await reportService.exportShiftReportCSV(params, type);
  }

  const dateStr = today.toISOString().split('T')[0];
  const filename = `${type}-report-${dateStr}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}));

/**
 * GET /api/reports/today/zip
 * Export today's reports as ZIP
 */
router.get('/today/zip', authenticate, asyncHandler(async (req, res) => {
  const { registerId } = req.query;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const params = {
    startTime: today.toISOString(),
    endTime: tomorrow.toISOString(),
  };

  if (registerId) {
    params.registerId = parseInt(registerId, 10);
  }

  const zipBuffer = await reportService.exportShiftReportZip(params);

  const dateStr = today.toISOString().split('T')[0];
  const filename = `shift-reports-${dateStr}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', zipBuffer.length);
  res.send(zipBuffer);
}));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get report for a specific sales rep
 */
async function getRepReport(pool, repId, startTime, endTime) {
  const query = `
    SELECT
      u.id as rep_id,
      u.first_name,
      u.last_name,
      u.email,
      COUNT(DISTINCT t.transaction_id) FILTER (WHERE t.status = 'completed') as transaction_count,
      COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) as total_revenue,
      COALESCE(SUM(t.discount_amount) FILTER (WHERE t.status = 'completed'), 0) as total_discounts,
      COALESCE(AVG(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) as avg_transaction,
      COALESCE(SUM(item_counts.item_count) FILTER (WHERE t.status = 'completed'), 0) as items_sold,
      COUNT(DISTINCT t.transaction_id) FILTER (WHERE t.status = 'voided') as voided_count,
      COUNT(DISTINCT t.transaction_id) FILTER (WHERE t.quote_id IS NOT NULL AND t.status = 'completed') as quotes_converted
    FROM users u
    LEFT JOIN transactions t ON t.salesperson_id = u.id
      AND t.created_at >= $2
      AND t.created_at < $3
    LEFT JOIN LATERAL (
      SELECT COUNT(*) as item_count
      FROM transaction_items ti
      WHERE ti.transaction_id = t.transaction_id
    ) item_counts ON true
    WHERE u.id = $1
    GROUP BY u.id, u.first_name, u.last_name, u.email
  `;

  const result = await pool.query(query, [repId, startTime, endTime]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    rep: {
      id: row.rep_id,
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      email: row.email,
    },
    period: {
      start: startTime,
      end: endTime,
    },
    metrics: {
      transactionCount: parseInt(row.transaction_count, 10) || 0,
      totalRevenue: parseFloat(row.total_revenue) || 0,
      totalDiscounts: parseFloat(row.total_discounts) || 0,
      avgTransaction: parseFloat(row.avg_transaction) || 0,
      itemsSold: parseInt(row.items_sold, 10) || 0,
      voidedTransactions: parseInt(row.voided_count, 10) || 0,
      quotesConverted: parseInt(row.quotes_converted, 10) || 0,
    },
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize routes with dependencies
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Router} Express router instance
 */
const init = (pool) => {
  reportService = new ShiftReportService(pool);
  return router;
};

module.exports = { init };
