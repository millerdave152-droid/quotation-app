/**
 * EmailQueueService - Reliable Email Queue with Retry Logic
 * Week 2.4 of 4-week sprint
 *
 * Provides:
 * - Job queuing for reliable email delivery
 * - Automatic retry with exponential backoff
 * - Admin monitoring capabilities
 * - Integration with existing EmailService
 */

const pool = require('../db');
const EmailService = require('./EmailService');
const cron = require('node-cron');

class EmailQueueService {
  constructor() {
    this.isProcessing = false;
    this.processInterval = null;
    this.cronJob = null;
  }

  /**
   * Enqueue an email job for reliable delivery
   * @param {Object} options - Email job options
   * @returns {Promise<Object>} Created job
   */
  async enqueue(options) {
    const {
      quoteId = null,
      recipientEmail,
      ccEmails = [],
      bccEmails = [],
      subject,
      bodyText = null,
      bodyHtml = null,
      templateName = null,
      templateData = null,
      attachmentUrls = [],
      priority = 5,
      maxAttempts = 3,
      scheduledAt = new Date(),
      createdBy = null
    } = options;

    if (!recipientEmail || !subject) {
      throw new Error('recipientEmail and subject are required');
    }

    const result = await pool.query(`
      INSERT INTO email_jobs (
        quote_id, recipient_email, cc_emails, bcc_emails,
        subject, body_text, body_html, template_name, template_data,
        attachment_urls, priority, max_attempts, scheduled_at, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      quoteId,
      recipientEmail,
      ccEmails,
      bccEmails,
      subject,
      bodyText,
      bodyHtml,
      templateName,
      templateData ? JSON.stringify(templateData) : null,
      attachmentUrls,
      priority,
      maxAttempts,
      scheduledAt,
      createdBy
    ]);

    console.log(`[EmailQueue] Job ${result.rows[0].id} enqueued for ${recipientEmail}`);
    return result.rows[0];
  }

  /**
   * Enqueue a quote-related email
   * Helper method for common quote email patterns
   */
  async enqueueQuoteEmail(quoteId, recipientEmail, type, options = {}) {
    const templateMap = {
      'created': { subject: 'Quote Created', template: 'quote_created' },
      'sent': { subject: 'Your Quote', template: 'quote_sent' },
      'won': { subject: 'Quote Won!', template: 'quote_won' },
      'lost': { subject: 'Quote Lost', template: 'quote_lost' },
      'expiry_warning': { subject: 'Quote Expiring Soon', template: 'expiry_warning' },
      'follow_up': { subject: 'Follow-up Reminder', template: 'follow_up' }
    };

    const config = templateMap[type] || { subject: 'Quote Notification', template: 'default' };

    return this.enqueue({
      quoteId,
      recipientEmail,
      subject: options.subject || config.subject,
      templateName: config.template,
      templateData: { quoteId, type, ...options.templateData },
      priority: options.priority || 5,
      createdBy: options.createdBy
    });
  }

  /**
   * Process pending email jobs
   * @param {number} batchSize - Number of jobs to process per batch
   * @returns {Promise<Object>} Processing results
   */
  async processQueue(batchSize = 10) {
    if (this.isProcessing) {
      console.log('[EmailQueue] Already processing, skipping...');
      return { skipped: true };
    }

    this.isProcessing = true;
    const results = { processed: 0, sent: 0, failed: 0, errors: [] };

    try {
      // Fetch pending jobs
      const jobsResult = await pool.query(`
        SELECT * FROM email_jobs
        WHERE status = 'pending'
          AND scheduled_at <= NOW()
          AND attempts < max_attempts
        ORDER BY priority ASC, scheduled_at ASC
        LIMIT $1
      `, [batchSize]);

      const jobs = jobsResult.rows;

      if (jobs.length === 0) {
        this.isProcessing = false;
        return results;
      }

      console.log(`[EmailQueue] Processing ${jobs.length} jobs...`);

      for (const job of jobs) {
        try {
          await this.processJob(job);
          results.sent++;
        } catch (err) {
          results.failed++;
          results.errors.push({ jobId: job.id, error: err.message });
        }
        results.processed++;
      }

      console.log(`[EmailQueue] Batch complete: ${results.sent} sent, ${results.failed} failed`);

    } catch (err) {
      console.error('[EmailQueue] Queue processing error:', err.message);
      results.errors.push({ error: err.message });
    } finally {
      this.isProcessing = false;
    }

    return results;
  }

  /**
   * Process a single email job
   * @param {Object} job - Email job record
   */
  async processJob(job) {
    const startTime = Date.now();

    // Mark as processing
    await pool.query(`
      UPDATE email_jobs
      SET status = 'processing',
          processing_started_at = NOW(),
          attempts = attempts + 1
      WHERE id = $1
    `, [job.id]);

    try {
      let sendResult;

      // If using a template, generate content
      if (job.template_name && job.template_data) {
        sendResult = await this.sendTemplatedEmail(job);
      } else {
        // Direct send with HTML/text content
        sendResult = await EmailService.sendEmail(
          job.recipient_email,
          job.subject,
          job.body_html || `<p>${job.body_text}</p>`,
          job.body_text
        );
      }

      if (sendResult.success) {
        await this.markComplete(job.id);
        console.log(`[EmailQueue] Job ${job.id} sent successfully in ${Date.now() - startTime}ms`);
      } else {
        throw new Error(sendResult.error || 'Email send failed');
      }

    } catch (err) {
      await this.markFailed(job.id, err.message, this.classifyError(err));

      // Check if we should retry
      const updatedJob = await this.getJob(job.id);
      if (updatedJob.attempts >= updatedJob.max_attempts) {
        console.error(`[EmailQueue] Job ${job.id} permanently failed after ${updatedJob.attempts} attempts`);
      } else {
        // Schedule retry with exponential backoff
        const backoffMinutes = Math.pow(2, updatedJob.attempts) * 5; // 5, 10, 20 min
        await this.scheduleRetry(job.id, backoffMinutes);
        console.log(`[EmailQueue] Job ${job.id} scheduled for retry in ${backoffMinutes} minutes`);
      }

      throw err;
    }
  }

  /**
   * Send email using template
   */
  async sendTemplatedEmail(job) {
    const templateData = typeof job.template_data === 'string'
      ? JSON.parse(job.template_data)
      : job.template_data;

    const { quoteId, type } = templateData;

    // Use existing EmailService methods based on template type
    switch (job.template_name) {
      case 'quote_created':
        return await EmailService.sendQuoteCreatedEmail(quoteId, job.recipient_email);

      case 'quote_won':
        return await EmailService.sendQuoteWonEmail(quoteId, job.recipient_email);

      case 'quote_lost':
        return await EmailService.sendQuoteLostEmail(quoteId, job.recipient_email, templateData.lostReason);

      case 'expiry_warning':
        return await EmailService.sendExpiryWarningEmail(quoteId, job.recipient_email, templateData.daysLeft || 3);

      case 'follow_up':
        return await EmailService.sendFollowUpReminderEmail(quoteId, job.recipient_email, templateData.daysSinceSent || 7);

      default:
        // Fallback to direct send
        return await EmailService.sendEmail(
          job.recipient_email,
          job.subject,
          job.body_html || `<p>${job.body_text || 'No content'}</p>`,
          job.body_text
        );
    }
  }

  /**
   * Mark job as complete
   */
  async markComplete(jobId) {
    await pool.query(`
      UPDATE email_jobs
      SET status = 'sent',
          sent_at = NOW(),
          error_message = NULL,
          error_code = NULL
      WHERE id = $1
    `, [jobId]);
  }

  /**
   * Mark job as failed
   */
  async markFailed(jobId, errorMessage, errorCode = 'SEND_ERROR') {
    await pool.query(`
      UPDATE email_jobs
      SET status = 'failed',
          error_message = $2,
          error_code = $3
      WHERE id = $1
    `, [jobId, errorMessage, errorCode]);
  }

  /**
   * Schedule a retry for a job
   */
  async scheduleRetry(jobId, minutesFromNow) {
    await pool.query(`
      UPDATE email_jobs
      SET status = 'pending',
          scheduled_at = NOW() + INTERVAL '1 minute' * $2
      WHERE id = $1
    `, [jobId, minutesFromNow]);
  }

  /**
   * Classify error type for monitoring
   */
  classifyError(err) {
    const message = err.message?.toLowerCase() || '';

    if (message.includes('rate') || message.includes('throttl')) {
      return 'RATE_LIMIT';
    }
    if (message.includes('invalid') && message.includes('email')) {
      return 'INVALID_EMAIL';
    }
    if (message.includes('bounce')) {
      return 'BOUNCE';
    }
    if (message.includes('credential') || message.includes('auth')) {
      return 'AUTH_ERROR';
    }
    if (message.includes('timeout') || message.includes('network')) {
      return 'NETWORK_ERROR';
    }

    return 'SEND_ERROR';
  }

  /**
   * Get a single job by ID
   */
  async getJob(jobId) {
    const result = await pool.query('SELECT * FROM email_jobs WHERE id = $1', [jobId]);
    return result.rows[0];
  }

  /**
   * Retry a failed job manually
   */
  async retryJob(jobId) {
    const job = await this.getJob(jobId);

    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status !== 'failed') {
      throw new Error('Can only retry failed jobs');
    }

    // Reset for retry
    await pool.query(`
      UPDATE email_jobs
      SET status = 'pending',
          scheduled_at = NOW(),
          attempts = 0,
          error_message = NULL,
          error_code = NULL
      WHERE id = $1
    `, [jobId]);

    console.log(`[EmailQueue] Job ${jobId} reset for retry`);
    return this.getJob(jobId);
  }

  /**
   * Cancel a pending job
   */
  async cancelJob(jobId) {
    const result = await pool.query(`
      UPDATE email_jobs
      SET status = 'cancelled'
      WHERE id = $1 AND status IN ('pending', 'failed')
      RETURNING *
    `, [jobId]);

    if (result.rows.length === 0) {
      throw new Error('Job not found or cannot be cancelled');
    }

    console.log(`[EmailQueue] Job ${jobId} cancelled`);
    return result.rows[0];
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    const result = await pool.query(`
      SELECT
        status,
        COUNT(*) as count,
        AVG(attempts) as avg_attempts
      FROM email_jobs
      GROUP BY status
    `);

    const stats = {
      total: 0,
      pending: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      cancelled: 0
    };

    result.rows.forEach(row => {
      stats[row.status] = parseInt(row.count);
      stats.total += parseInt(row.count);
    });

    // Get recent failures
    const failuresResult = await pool.query(`
      SELECT error_code, COUNT(*) as count
      FROM email_jobs
      WHERE status = 'failed'
        AND created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY error_code
    `);

    stats.recentFailures = failuresResult.rows;

    return stats;
  }

  /**
   * Get paginated list of jobs with filters
   */
  async getJobs(options = {}) {
    const {
      status = null,
      quoteId = null,
      recipientEmail = null,
      startDate = null,
      endDate = null,
      page = 1,
      limit = 20
    } = options;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (quoteId) {
      conditions.push(`quote_id = $${paramIndex++}`);
      params.push(quoteId);
    }

    if (recipientEmail) {
      conditions.push(`recipient_email ILIKE $${paramIndex++}`);
      params.push(`%${recipientEmail}%`);
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM email_jobs ${whereClause}
    `, params);

    // Get paginated jobs
    params.push(limit, offset);
    const jobsResult = await pool.query(`
      SELECT
        ej.*,
        q.quotation_number
      FROM email_jobs ej
      LEFT JOIN quotations q ON ej.quote_id = q.id
      ${whereClause}
      ORDER BY ej.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, params);

    return {
      jobs: jobsResult.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(countResult.rows[0].total / limit)
      }
    };
  }

  /**
   * Start the queue processor
   * @param {string} schedule - Cron schedule (default: every 2 minutes)
   */
  start(schedule = '*/2 * * * *') {
    if (this.cronJob) {
      console.log('[EmailQueue] Already running');
      return;
    }

    this.cronJob = cron.schedule(schedule, async () => {
      await this.processQueue();
    }, { timezone: 'America/Toronto' });

    console.log(`[EmailQueue] Started with schedule: ${schedule}`);
  }

  /**
   * Stop the queue processor
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[EmailQueue] Stopped');
    }
  }

  /**
   * Clean up old completed/cancelled jobs
   * @param {number} daysOld - Delete jobs older than this many days
   */
  async cleanup(daysOld = 30) {
    const result = await pool.query(`
      DELETE FROM email_jobs
      WHERE status IN ('sent', 'cancelled')
        AND created_at < NOW() - INTERVAL '1 day' * $1
      RETURNING id
    `, [daysOld]);

    console.log(`[EmailQueue] Cleaned up ${result.rows.length} old jobs`);
    return result.rows.length;
  }
}

// Export singleton
module.exports = new EmailQueueService();
