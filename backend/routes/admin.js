/**
 * Admin Routes - Email Queue Monitoring
 * Week 2.5 of 4-week sprint
 *
 * Provides admin endpoints for monitoring and managing email jobs
 */

const express = require('express');
const router = express.Router();
const EmailQueueService = require('../services/EmailQueueService');
const { authenticate } = require('../middleware/auth');
const pool = require('../db');

/**
 * Middleware to check admin role
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const adminRoles = ['admin', 'manager'];
  if (!adminRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
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
router.get('/email-jobs', async (req, res) => {
  try {
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
  } catch (err) {
    console.error('Error fetching email jobs:', err);
    res.status(500).json({ error: 'Failed to fetch email jobs' });
  }
});

/**
 * GET /api/admin/email-jobs/stats
 * Get email queue statistics
 */
router.get('/email-jobs/stats', async (req, res) => {
  try {
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
  } catch (err) {
    console.error('Error fetching email stats:', err);
    res.status(500).json({ error: 'Failed to fetch email statistics' });
  }
});

/**
 * GET /api/admin/email-jobs/failed
 * Get failed jobs for quick access
 */
router.get('/email-jobs/failed', async (req, res) => {
  try {
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
  } catch (err) {
    console.error('Error fetching failed jobs:', err);
    res.status(500).json({ error: 'Failed to fetch failed jobs' });
  }
});

/**
 * GET /api/admin/email-jobs/:id
 * Get single job details including logs
 */
router.get('/email-jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const jobResult = await pool.query(`
      SELECT
        ej.*,
        q.quotation_number,
        CONCAT(u.first_name, ' ', u.last_name) as created_by_name
      FROM email_jobs ej
      LEFT JOIN quotations q ON ej.quote_id = q.id
      LEFT JOIN users u ON ej.created_by = u.id
      WHERE ej.id = $1
    `, [id]);

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get job logs
    const logsResult = await pool.query(`
      SELECT * FROM email_job_logs
      WHERE email_job_id = $1
      ORDER BY created_at DESC
    `, [id]);

    res.json({
      job: jobResult.rows[0],
      logs: logsResult.rows
    });
  } catch (err) {
    console.error('Error fetching job details:', err);
    res.status(500).json({ error: 'Failed to fetch job details' });
  }
});

/**
 * POST /api/admin/email-jobs/:id/retry
 * Retry a failed job
 */
router.post('/email-jobs/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;

    const job = await EmailQueueService.retryJob(parseInt(id));

    res.json({
      success: true,
      message: 'Job scheduled for retry',
      job
    });
  } catch (err) {
    console.error('Error retrying job:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/email-jobs/:id/cancel
 * Cancel a pending/failed job
 */
router.post('/email-jobs/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;

    const job = await EmailQueueService.cancelJob(parseInt(id));

    res.json({
      success: true,
      message: 'Job cancelled',
      job
    });
  } catch (err) {
    console.error('Error cancelling job:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/email-jobs/retry-all-failed
 * Retry all failed jobs
 */
router.post('/email-jobs/retry-all-failed', async (req, res) => {
  try {
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
  } catch (err) {
    console.error('Error retrying all failed jobs:', err);
    res.status(500).json({ error: 'Failed to retry jobs' });
  }
});

/**
 * POST /api/admin/email-jobs/process-now
 * Trigger immediate queue processing
 */
router.post('/email-jobs/process-now', async (req, res) => {
  try {
    const { batch_size = 10 } = req.body;

    const result = await EmailQueueService.processQueue(
      Math.min(parseInt(batch_size), 50)
    );

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('Error processing queue:', err);
    res.status(500).json({ error: 'Failed to process queue' });
  }
});

/**
 * POST /api/admin/email-jobs/cleanup
 * Clean up old completed jobs
 */
router.post('/email-jobs/cleanup', async (req, res) => {
  try {
    const { days_old = 30 } = req.body;

    const deleted = await EmailQueueService.cleanup(
      Math.max(parseInt(days_old), 7) // Minimum 7 days
    );

    res.json({
      success: true,
      message: `Cleaned up ${deleted} old jobs`,
      deleted
    });
  } catch (err) {
    console.error('Error cleaning up jobs:', err);
    res.status(500).json({ error: 'Failed to cleanup jobs' });
  }
});

/**
 * GET /api/admin/email-jobs/error-summary
 * Get summary of errors by type
 */
router.get('/email-jobs/error-summary', async (req, res) => {
  try {
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
  } catch (err) {
    console.error('Error fetching error summary:', err);
    res.status(500).json({ error: 'Failed to fetch error summary' });
  }
});

module.exports = router;
