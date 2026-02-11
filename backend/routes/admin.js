/**
 * Admin Routes - Email Queue Monitoring & Override Audit
 * Week 2.5 of 4-week sprint
 *
 * Provides admin endpoints for monitoring email jobs and override audit
 */

const express = require('express');
const router = express.Router();
const EmailQueueService = require('../services/EmailQueueService');
const { authenticate } = require('../middleware/auth');
const pool = require('../db');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

// CSV helper for export
const escapeCSV = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Middleware to check admin role
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }

  const adminRoles = ['admin', 'manager'];
  if (!adminRoles.includes(req.user.role)) {
    throw ApiError.forbidden('Admin access required');
  }

  next();
};

// Apply auth to all admin routes
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/admin/email-jobs
 * List email jobs with filters and pagination
 */
router.get('/email-jobs', asyncHandler(async (req, res) => {
  const {
    status,
    quote_id,
    recipient_email,
    start_date,
    end_date,
    page = 1,
    limit = 20
  } = req.query;

  const result = await EmailQueueService.getJobs({
    status,
    quoteId: quote_id ? parseInt(quote_id) : null,
    recipientEmail: recipient_email,
    startDate: start_date,
    endDate: end_date,
    page: parseInt(page),
    limit: Math.min(parseInt(limit) || 20, 100)
  });

  res.json(result);
}));

/**
 * GET /api/admin/email-jobs/stats
 * Get email queue statistics
 */
router.get('/email-jobs/stats', asyncHandler(async (req, res) => {
  const stats = await EmailQueueService.getStats();

  // Add additional metrics
  const metricsResult = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE sent_at IS NOT NULL) as total_sent,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as last_24h_total,
      COUNT(*) FILTER (WHERE sent_at IS NOT NULL AND created_at >= NOW() - INTERVAL '24 hours') as last_24h_sent,
      COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours') as last_24h_failed,
      AVG(EXTRACT(EPOCH FROM (sent_at - created_at))) FILTER (WHERE sent_at IS NOT NULL) as avg_delivery_time_seconds
    FROM email_jobs
  `);

  res.json({
    ...stats,
    metrics: metricsResult.rows[0]
  });
}));

/**
 * GET /api/admin/email-jobs/failed
 * Get failed jobs for quick access
 */
router.get('/email-jobs/failed', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const result = await pool.query(`
    SELECT * FROM email_jobs_failed
    LIMIT $1 OFFSET $2
  `, [Math.min(parseInt(limit), 100), (parseInt(page) - 1) * parseInt(limit)]);

  const countResult = await pool.query(`
    SELECT COUNT(*) as total FROM email_jobs WHERE status = 'failed'
  `);

  res.json({
    jobs: result.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(countResult.rows[0].total)
    }
  });
}));

/**
 * GET /api/admin/email-jobs/:id
 * Get single job details including logs
 */
router.get('/email-jobs/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Validate ID is a valid integer
  const jobId = parseInt(id, 10);
  if (isNaN(jobId) || jobId <= 0) {
    throw ApiError.badRequest('Invalid job ID');
  }

  const jobResult = await pool.query(`
    SELECT
      ej.*,
      q.quotation_number,
      CONCAT(u.first_name, ' ', u.last_name) as created_by_name
    FROM email_jobs ej
    LEFT JOIN quotations q ON ej.quote_id = q.id
    LEFT JOIN users u ON ej.created_by = u.id
    WHERE ej.id = $1
  `, [jobId]);

  if (jobResult.rows.length === 0) {
    throw ApiError.notFound('Job');
  }

  // Get job logs
  const logsResult = await pool.query(`
    SELECT * FROM email_job_logs
    WHERE email_job_id = $1
    ORDER BY created_at DESC
    LIMIT 1000
  `, [jobId]);

  res.json({
    job: jobResult.rows[0],
    logs: logsResult.rows
  });
}));

/**
 * POST /api/admin/email-jobs/:id/retry
 * Retry a failed job
 */
router.post('/email-jobs/:id/retry', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Validate ID is a valid integer
  const jobId = parseInt(id, 10);
  if (isNaN(jobId) || jobId <= 0) {
    throw ApiError.badRequest('Invalid job ID');
  }

  const job = await EmailQueueService.retryJob(jobId);

  res.json({
    success: true,
    message: 'Job scheduled for retry',
    job
  });
}));

/**
 * POST /api/admin/email-jobs/:id/cancel
 * Cancel a pending/failed job
 */
router.post('/email-jobs/:id/cancel', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Validate ID is a valid integer
  const jobId = parseInt(id, 10);
  if (isNaN(jobId) || jobId <= 0) {
    throw ApiError.badRequest('Invalid job ID');
  }

  const job = await EmailQueueService.cancelJob(jobId);

  res.json({
    success: true,
    message: 'Job cancelled',
    job
  });
}));

/**
 * POST /api/admin/email-jobs/retry-all-failed
 * Retry all failed jobs
 */
router.post('/email-jobs/retry-all-failed', asyncHandler(async (req, res) => {
  const result = await pool.query(`
    UPDATE email_jobs
    SET status = 'pending',
        scheduled_at = NOW(),
        attempts = 0,
        error_message = NULL,
        error_code = NULL
    WHERE status = 'failed'
    RETURNING id
  `);

  res.json({
    success: true,
    message: `${result.rows.length} jobs scheduled for retry`,
    count: result.rows.length
  });
}));

/**
 * POST /api/admin/email-jobs/process-now
 * Trigger immediate queue processing
 */
router.post('/email-jobs/process-now', asyncHandler(async (req, res) => {
  const { batch_size = 10 } = req.body;

  const result = await EmailQueueService.processQueue(
    Math.min(parseInt(batch_size), 50)
  );

  res.json({
    success: true,
    ...result
  });
}));

/**
 * POST /api/admin/email-jobs/cleanup
 * Clean up old completed jobs
 */
router.post('/email-jobs/cleanup', asyncHandler(async (req, res) => {
  const { days_old = 30 } = req.body;

  const deleted = await EmailQueueService.cleanup(
    Math.max(parseInt(days_old), 7) // Minimum 7 days
  );

  res.json({
    success: true,
    message: `Cleaned up ${deleted} old jobs`,
    deleted
  });
}));

/**
 * GET /api/admin/email-jobs/error-summary
 * Get summary of errors by type
 */
router.get('/email-jobs/error-summary', asyncHandler(async (req, res) => {
  const { days = 7 } = req.query;

  const result = await pool.query(`
    SELECT
      error_code,
      COUNT(*) as count,
      MAX(error_message) as sample_message,
      MAX(created_at) as last_occurrence
    FROM email_jobs
    WHERE status = 'failed'
      AND created_at >= NOW() - INTERVAL '1 day' * $1
    GROUP BY error_code
    ORDER BY count DESC
  `, [Math.min(parseInt(days), 90)]);

  res.json({
    period_days: parseInt(days),
    errors: result.rows
  });
}));

// ============================================================================
// OVERRIDE AUDIT ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/overrides
 * Get override history with filters and pagination
 */
router.get('/overrides', asyncHandler(async (req, res) => {
  const {
    start_date,
    end_date,
    manager_id,
    cashier_id,
    override_type,
    was_approved,
    page = 1,
    limit = 50,
    sort_by = 'created_at',
    sort_order = 'desc',
  } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(Math.max(1, parseInt(limit)), 200);
  const offset = (pageNum - 1) * limitNum;

  // Build query conditions
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (start_date) {
    conditions.push(`ol.created_at >= $${paramIndex}`);
    params.push(start_date);
    paramIndex++;
  }

  if (end_date) {
    conditions.push(`ol.created_at <= $${paramIndex}`);
    params.push(end_date);
    paramIndex++;
  }

  if (manager_id) {
    conditions.push(`ol.approved_by = $${paramIndex}`);
    params.push(parseInt(manager_id));
    paramIndex++;
  }

  if (cashier_id) {
    conditions.push(`ol.cashier_id = $${paramIndex}`);
    params.push(parseInt(cashier_id));
    paramIndex++;
  }

  if (override_type) {
    conditions.push(`ol.override_type = $${paramIndex}`);
    params.push(override_type);
    paramIndex++;
  }

  if (was_approved !== undefined && was_approved !== '') {
    conditions.push(`ol.was_approved = $${paramIndex}`);
    params.push(was_approved === 'true');
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Validate sort column
  const validSortColumns = ['created_at', 'override_type', 'original_value', 'override_value'];
  const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
  const sortDir = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // Main query
  const query = `
    SELECT
      ol.id,
      ol.override_type,
      ol.transaction_id,
      ol.quotation_id,
      ol.shift_id,
      ol.cashier_id,
      ol.approved_by,
      ol.original_value,
      ol.override_value,
      ol.was_approved,
      ol.denial_reason,
      ol.reason,
      ol.product_id,
      ol.product_name,
      ol.quantity,
      ol.created_at,
      t.transaction_number,
      CONCAT(cu.first_name, ' ', cu.last_name) AS cashier_name,
      CONCAT(mu.first_name, ' ', mu.last_name) AS manager_name
    FROM override_log ol
    LEFT JOIN transactions t ON ol.transaction_id = t.transaction_id
    LEFT JOIN users cu ON ol.cashier_id = cu.id
    LEFT JOIN users mu ON ol.approved_by = mu.id
    ${whereClause}
    ORDER BY ol.${sortColumn} ${sortDir}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limitNum, offset);

  const result = await pool.query(query, params);

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM override_log ol
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params.slice(0, -2));
  const total = parseInt(countResult.rows[0].total);

  res.json({
    success: true,
    data: {
      overrides: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    },
  });
}));

/**
 * GET /api/admin/overrides/summary
 * Get summary statistics for overrides
 */
router.get('/overrides/summary', asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (start_date) {
    conditions.push(`created_at >= $${paramIndex}`);
    params.push(start_date);
    paramIndex++;
  }

  if (end_date) {
    conditions.push(`created_at <= $${paramIndex}`);
    params.push(end_date);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get summary stats
  const summaryQuery = `
    SELECT
      COUNT(*) as total_overrides,
      COUNT(*) FILTER (WHERE was_approved = true) as approved_count,
      COUNT(*) FILTER (WHERE was_approved = false) as denied_count,
      SUM(
        CASE
          WHEN was_approved = true AND original_value > override_value
          THEN original_value - override_value
          ELSE 0
        END
      ) as total_discount_amount,
      AVG(
        CASE
          WHEN was_approved = true AND original_value > 0
          THEN ((original_value - override_value) / original_value) * 100
          ELSE NULL
        END
      ) as avg_discount_percent
    FROM override_log
    ${whereClause}
  `;

  const summaryResult = await pool.query(summaryQuery, params);

  // Get breakdown by type
  const typeQuery = `
    SELECT
      override_type,
      COUNT(*) as count,
      COUNT(*) FILTER (WHERE was_approved = true) as approved_count,
      SUM(
        CASE
          WHEN was_approved = true AND original_value > override_value
          THEN original_value - override_value
          ELSE 0
        END
      ) as discount_amount
    FROM override_log
    ${whereClause}
    GROUP BY override_type
    ORDER BY count DESC
  `;

  const typeResult = await pool.query(typeQuery, params);

  // Get top managers
  const managersQuery = `
    SELECT
      ol.approved_by,
      CONCAT(u.first_name, ' ', u.last_name) as manager_name,
      COUNT(*) as override_count,
      SUM(
        CASE
          WHEN ol.original_value > ol.override_value
          THEN ol.original_value - ol.override_value
          ELSE 0
        END
      ) as total_discount
    FROM override_log ol
    LEFT JOIN users u ON ol.approved_by = u.id
    ${whereClause.replace('created_at', 'ol.created_at')}
    ${conditions.length > 0 ? 'AND' : 'WHERE'} ol.was_approved = true AND ol.approved_by IS NOT NULL
    GROUP BY ol.approved_by, u.first_name, u.last_name
    ORDER BY override_count DESC
    LIMIT 5
  `;

  const managersResult = await pool.query(managersQuery, params);

  // Get most common type
  const mostCommonType = typeResult.rows.length > 0 ? typeResult.rows[0].override_type : null;

  const summary = summaryResult.rows[0];

  res.json({
    success: true,
    data: {
      totalOverrides: parseInt(summary.total_overrides) || 0,
      approvedCount: parseInt(summary.approved_count) || 0,
      deniedCount: parseInt(summary.denied_count) || 0,
      approvalRate: summary.total_overrides > 0
        ? ((summary.approved_count / summary.total_overrides) * 100).toFixed(1)
        : 0,
      totalDiscountAmount: parseFloat(summary.total_discount_amount) || 0,
      avgDiscountPercent: parseFloat(summary.avg_discount_percent) || 0,
      mostCommonType,
      byType: typeResult.rows.map((row) => ({
        type: row.override_type,
        count: parseInt(row.count),
        approvedCount: parseInt(row.approved_count),
        discountAmount: parseFloat(row.discount_amount) || 0,
      })),
      topManagers: managersResult.rows.map((row) => ({
        managerId: row.approved_by,
        managerName: row.manager_name,
        overrideCount: parseInt(row.override_count),
        totalDiscount: parseFloat(row.total_discount) || 0,
      })),
    },
  });
}));

/**
 * GET /api/admin/overrides/export
 * Export override history to CSV
 */
router.get('/overrides/export', asyncHandler(async (req, res) => {
  const {
    start_date,
    end_date,
    manager_id,
    cashier_id,
    override_type,
    was_approved,
  } = req.query;

  // Build query conditions
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (start_date) {
    conditions.push(`ol.created_at >= $${paramIndex}`);
    params.push(start_date);
    paramIndex++;
  }

  if (end_date) {
    conditions.push(`ol.created_at <= $${paramIndex}`);
    params.push(end_date);
    paramIndex++;
  }

  if (manager_id) {
    conditions.push(`ol.approved_by = $${paramIndex}`);
    params.push(parseInt(manager_id));
    paramIndex++;
  }

  if (cashier_id) {
    conditions.push(`ol.cashier_id = $${paramIndex}`);
    params.push(parseInt(cashier_id));
    paramIndex++;
  }

  if (override_type) {
    conditions.push(`ol.override_type = $${paramIndex}`);
    params.push(override_type);
    paramIndex++;
  }

  if (was_approved !== undefined && was_approved !== '') {
    conditions.push(`ol.was_approved = $${paramIndex}`);
    params.push(was_approved === 'true');
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Query all matching records (limit to 10000 for safety)
  const query = `
    SELECT
      ol.id,
      ol.created_at,
      t.transaction_number,
      ol.override_type,
      CONCAT(cu.first_name, ' ', cu.last_name) AS cashier_name,
      ol.product_name,
      ol.quantity,
      ol.original_value,
      ol.override_value,
      ol.was_approved,
      CONCAT(mu.first_name, ' ', mu.last_name) AS manager_name,
      ol.reason,
      ol.denial_reason
    FROM override_log ol
    LEFT JOIN transactions t ON ol.transaction_id = t.transaction_id
    LEFT JOIN users cu ON ol.cashier_id = cu.id
    LEFT JOIN users mu ON ol.approved_by = mu.id
    ${whereClause}
    ORDER BY ol.created_at DESC
    LIMIT 10000
  `;

  const result = await pool.query(query, params);

  // Build CSV
  const headers = [
    'Date',
    'Transaction #',
    'Override Type',
    'Cashier',
    'Product',
    'Quantity',
    'Original Value',
    'New Value',
    'Discount Amount',
    'Status',
    'Approved By',
    'Reason',
    'Denial Reason',
  ];

  let csv = headers.join(',') + '\n';

  for (const row of result.rows) {
    const discountAmount = row.original_value > row.override_value
      ? (row.original_value - row.override_value).toFixed(2)
      : '0.00';

    const values = [
      escapeCSV(new Date(row.created_at).toISOString()),
      escapeCSV(row.transaction_number || 'N/A'),
      escapeCSV(row.override_type),
      escapeCSV(row.cashier_name || 'Unknown'),
      escapeCSV(row.product_name || 'N/A'),
      escapeCSV(row.quantity || ''),
      escapeCSV(parseFloat(row.original_value).toFixed(2)),
      escapeCSV(parseFloat(row.override_value).toFixed(2)),
      escapeCSV(discountAmount),
      escapeCSV(row.was_approved ? 'Approved' : 'Denied'),
      escapeCSV(row.manager_name || 'N/A'),
      escapeCSV(row.reason || ''),
      escapeCSV(row.denial_reason || ''),
    ];

    csv += values.join(',') + '\n';
  }

  // Set headers for CSV download
  const filename = `override_audit_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}));

/**
 * GET /api/admin/overrides/managers
 * Get list of managers for filter dropdown
 */
router.get('/overrides/managers', asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT DISTINCT
      u.id,
      CONCAT(u.first_name, ' ', u.last_name) as name,
      u.role
    FROM users u
    INNER JOIN override_log ol ON u.id = ol.approved_by
    WHERE ol.was_approved = true
    ORDER BY name
  `);

  res.json({
    success: true,
    data: result.rows,
  });
}));

/**
 * GET /api/admin/overrides/cashiers
 * Get list of cashiers for filter dropdown
 */
router.get('/overrides/cashiers', asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT DISTINCT
      u.id,
      CONCAT(u.first_name, ' ', u.last_name) as name,
      u.role
    FROM users u
    INNER JOIN override_log ol ON u.id = ol.cashier_id
    ORDER BY name
  `);

  res.json({
    success: true,
    data: result.rows,
  });
}));

/**
 * GET /api/admin/overrides/types
 * Get list of override types for filter dropdown
 */
router.get('/overrides/types', asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT DISTINCT override_type
    FROM override_log
    ORDER BY override_type
  `);

  res.json({
    success: true,
    data: result.rows.map((r) => r.override_type),
  });
}));

module.exports = router;
