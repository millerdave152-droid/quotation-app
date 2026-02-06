/**
 * TeleTime POS - Scheduled Batch Email Service
 * Handles automatic batch email sending at shift end or scheduled times
 */

const cron = require('node-cron');

class ScheduledBatchEmailService {
  constructor(pool, batchEmailService, emailService) {
    this.pool = pool;
    this.batchEmailService = batchEmailService;
    this.emailService = emailService;
    this.scheduledJob = null;
    this.isInitialized = false;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the scheduled service
   * Sets up cron job based on settings
   */
  async initialize() {
    try {
      const settings = await this.getSettings();

      if (settings.auto_send_enabled && settings.send_trigger === 'scheduled_time') {
        this.setupScheduledJob(settings.scheduled_time);
      }

      this.isInitialized = true;
      console.log('[ScheduledBatchEmail] Service initialized');
    } catch (error) {
      console.error('[ScheduledBatchEmail] Initialization error:', error);
    }
  }

  /**
   * Setup cron job for scheduled time
   */
  setupScheduledJob(scheduledTime) {
    // Clear existing job
    if (this.scheduledJob) {
      this.scheduledJob.stop();
      this.scheduledJob = null;
    }

    if (!scheduledTime) return;

    // Parse time (HH:MM:SS or HH:MM)
    const [hours, minutes] = scheduledTime.split(':').map(Number);

    // Create cron expression (run daily at specified time)
    const cronExpression = `${minutes} ${hours} * * *`;

    this.scheduledJob = cron.schedule(cronExpression, async () => {
      console.log('[ScheduledBatchEmail] Running scheduled batch at', new Date().toISOString());
      await this.runScheduledBatch();
    });

    console.log(`[ScheduledBatchEmail] Scheduled job set for ${hours}:${minutes.toString().padStart(2, '0')}`);
  }

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================

  /**
   * Get batch email settings
   */
  async getSettings() {
    const result = await this.pool.query(
      'SELECT * FROM batch_email_settings WHERE id = 1'
    );

    if (result.rows.length === 0) {
      // Create default settings
      await this.pool.query('INSERT INTO batch_email_settings (id) VALUES (1) ON CONFLICT DO NOTHING');
      return this.getSettings();
    }

    return result.rows[0];
  }

  /**
   * Update batch email settings
   */
  async updateSettings(updates, userId) {
    const allowedFields = [
      'auto_send_enabled',
      'send_trigger',
      'scheduled_time',
      'include_current_shift_only',
      'email_subject_template',
      'send_manager_summary',
      'manager_email',
      'cc_manager_on_failures',
      'max_emails_per_batch',
      'send_delay_ms',
      'max_retries',
      'retry_delay_minutes',
    ];

    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClause.length === 0) {
      return this.getSettings();
    }

    // Add updated_by
    setClause.push(`updated_by = $${paramIndex}`);
    values.push(userId);

    const query = `
      UPDATE batch_email_settings
      SET ${setClause.join(', ')}
      WHERE id = 1
      RETURNING *
    `;

    const result = await this.pool.query(query, values);

    // Re-configure scheduled job if settings changed
    const settings = result.rows[0];
    if (settings.auto_send_enabled && settings.send_trigger === 'scheduled_time') {
      this.setupScheduledJob(settings.scheduled_time);
    } else if (this.scheduledJob) {
      this.scheduledJob.stop();
      this.scheduledJob = null;
    }

    return settings;
  }

  // ============================================================================
  // SHIFT END TRIGGER
  // ============================================================================

  /**
   * Called when a shift ends - triggers auto-send if enabled
   */
  async onShiftEnd(shiftId, closedByUserId) {
    try {
      const settings = await this.getSettings();

      if (!settings.auto_send_enabled) {
        console.log('[ScheduledBatchEmail] Auto-send disabled, skipping');
        return null;
      }

      if (settings.send_trigger !== 'shift_end') {
        console.log('[ScheduledBatchEmail] Trigger is not shift_end, skipping');
        return null;
      }

      console.log(`[ScheduledBatchEmail] Shift ${shiftId} ended, triggering batch email`);

      return this.runShiftBatch(shiftId, closedByUserId);
    } catch (error) {
      console.error('[ScheduledBatchEmail] onShiftEnd error:', error);
      throw error;
    }
  }

  /**
   * Run batch for a specific shift
   */
  async runShiftBatch(shiftId, triggeredByUserId = null) {
    const settings = await this.getSettings();

    // Create schedule log entry
    const logResult = await this.pool.query(
      `INSERT INTO batch_email_schedule_log
       (trigger_type, shift_id, status)
       VALUES ('shift_end', $1, 'processing')
       RETURNING *`,
      [shiftId]
    );

    const logId = logResult.rows[0].id;

    try {
      // Create batch for the shift
      const batch = await this.batchEmailService.createShiftReceiptBatch(shiftId);

      if (!batch || batch.total_count === 0) {
        await this.pool.query(
          `UPDATE batch_email_schedule_log
           SET status = 'completed',
               total_receipts = 0,
               completed_at = NOW()
           WHERE id = $1`,
          [logId]
        );

        return { success: true, message: 'No unsent receipts found', logId };
      }

      // Update log with batch reference
      await this.pool.query(
        `UPDATE batch_email_schedule_log
         SET batch_id = $1, total_receipts = $2
         WHERE id = $3`,
        [batch.id, batch.total_count, logId]
      );

      // Process the batch
      const result = await this.batchEmailService.processBatch(batch.id);

      // Update log with results
      await this.pool.query(
        `UPDATE batch_email_schedule_log
         SET status = 'completed',
             sent_count = $1,
             failed_count = $2,
             skipped_count = $3,
             completed_at = NOW()
         WHERE id = $4`,
        [result.sent_count, result.failed_count, result.skipped_count || 0, logId]
      );

      // Send manager notification if enabled
      if (settings.send_manager_summary && settings.manager_email) {
        await this.sendManagerSummary(settings.manager_email, {
          shiftId,
          total: batch.total_count,
          sent: result.sent_count,
          failed: result.failed_count,
          skipped: result.skipped_count || 0,
        });

        await this.pool.query(
          `UPDATE batch_email_schedule_log
           SET manager_notified = TRUE,
               manager_notification_sent_at = NOW()
           WHERE id = $1`,
          [logId]
        );
      }

      return {
        success: true,
        logId,
        batchId: batch.id,
        total: batch.total_count,
        sent: result.sent_count,
        failed: result.failed_count,
      };
    } catch (error) {
      console.error('[ScheduledBatchEmail] runShiftBatch error:', error);

      await this.pool.query(
        `UPDATE batch_email_schedule_log
         SET status = 'failed',
             error_message = $1,
             completed_at = NOW()
         WHERE id = $2`,
        [error.message, logId]
      );

      // Notify manager of failure if enabled
      const settings = await this.getSettings();
      if (settings.cc_manager_on_failures && settings.manager_email) {
        await this.sendManagerFailureNotification(settings.manager_email, error, shiftId);
      }

      throw error;
    }
  }

  // ============================================================================
  // SCHEDULED TIME TRIGGER
  // ============================================================================

  /**
   * Run scheduled batch (for all completed shifts today)
   */
  async runScheduledBatch() {
    const settings = await this.getSettings();

    // Create schedule log entry
    const logResult = await this.pool.query(
      `INSERT INTO batch_email_schedule_log
       (trigger_type, status)
       VALUES ('scheduled', 'processing')
       RETURNING *`
    );

    const logId = logResult.rows[0].id;

    try {
      // Get today's date range
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      // Find all unsent receipts from completed shifts today
      const unsentResult = await this.pool.query(
        `SELECT t.transaction_id, t.transaction_number, t.total_amount,
                c.customer_id, c.name as customer_name, c.email as customer_email
         FROM transactions t
         LEFT JOIN customers c ON t.customer_id = c.customer_id
         LEFT JOIN pos_shifts s ON t.shift_id = s.id
         LEFT JOIN receipt_email_tracking ret ON t.transaction_id = ret.transaction_id
         WHERE t.created_at BETWEEN $1 AND $2
           AND t.status = 'completed'
           AND c.email IS NOT NULL
           AND c.email != ''
           AND ret.id IS NULL
           AND (s.ended_at IS NOT NULL OR $3 = FALSE)
         ORDER BY t.created_at`,
        [today, endOfDay, settings.include_current_shift_only]
      );

      if (unsentResult.rows.length === 0) {
        await this.pool.query(
          `UPDATE batch_email_schedule_log
           SET status = 'completed',
               total_receipts = 0,
               completed_at = NOW()
           WHERE id = $1`,
          [logId]
        );

        return { success: true, message: 'No unsent receipts found', logId };
      }

      const transactionIds = unsentResult.rows.map(r => r.transaction_id);

      // Create manual batch with these transactions
      const batch = await this.batchEmailService.createManualBatch(transactionIds);

      if (!batch) {
        throw new Error('Failed to create batch');
      }

      // Update log with batch reference
      await this.pool.query(
        `UPDATE batch_email_schedule_log
         SET batch_id = $1, total_receipts = $2
         WHERE id = $3`,
        [batch.id, batch.total_count, logId]
      );

      // Process the batch
      const result = await this.batchEmailService.processBatch(batch.id);

      // Update log with results
      await this.pool.query(
        `UPDATE batch_email_schedule_log
         SET status = 'completed',
             sent_count = $1,
             failed_count = $2,
             skipped_count = $3,
             completed_at = NOW()
         WHERE id = $4`,
        [result.sent_count, result.failed_count, result.skipped_count || 0, logId]
      );

      // Send manager notification if enabled
      if (settings.send_manager_summary && settings.manager_email) {
        await this.sendManagerSummary(settings.manager_email, {
          scheduled: true,
          total: batch.total_count,
          sent: result.sent_count,
          failed: result.failed_count,
          skipped: result.skipped_count || 0,
        });

        await this.pool.query(
          `UPDATE batch_email_schedule_log
           SET manager_notified = TRUE,
               manager_notification_sent_at = NOW()
           WHERE id = $1`,
          [logId]
        );
      }

      return {
        success: true,
        logId,
        batchId: batch.id,
        total: batch.total_count,
        sent: result.sent_count,
        failed: result.failed_count,
      };
    } catch (error) {
      console.error('[ScheduledBatchEmail] runScheduledBatch error:', error);

      await this.pool.query(
        `UPDATE batch_email_schedule_log
         SET status = 'failed',
             error_message = $1,
             completed_at = NOW()
         WHERE id = $2`,
        [error.message, logId]
      );

      throw error;
    }
  }

  // ============================================================================
  // MANAGER NOTIFICATIONS
  // ============================================================================

  /**
   * Send summary email to manager
   */
  async sendManagerSummary(managerEmail, summary) {
    const subject = summary.shiftId
      ? `Batch Email Summary - Shift #${summary.shiftId}`
      : `Batch Email Summary - ${new Date().toLocaleDateString()}`;

    const hasFailures = summary.failed > 0;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1f2937;">Batch Receipt Email Summary</h2>

        ${summary.shiftId ? `<p style="color: #6b7280;">Shift #${summary.shiftId} has ended.</p>` : ''}
        ${summary.scheduled ? `<p style="color: #6b7280;">Scheduled batch run completed.</p>` : ''}

        <div style="background: ${hasFailures ? '#fef3c7' : '#d1fae5'}; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px 0; color: ${hasFailures ? '#92400e' : '#065f46'};">
            ${hasFailures ? 'Completed with Errors' : 'All Emails Sent Successfully'}
          </h3>

          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #374151;">Total Receipts:</td>
              <td style="padding: 8px 0; font-weight: bold; color: #374151;">${summary.total}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #059669;">Sent Successfully:</td>
              <td style="padding: 8px 0; font-weight: bold; color: #059669;">${summary.sent}</td>
            </tr>
            ${summary.failed > 0 ? `
            <tr>
              <td style="padding: 8px 0; color: #dc2626;">Failed:</td>
              <td style="padding: 8px 0; font-weight: bold; color: #dc2626;">${summary.failed}</td>
            </tr>
            ` : ''}
            ${summary.skipped > 0 ? `
            <tr>
              <td style="padding: 8px 0; color: #d97706;">Skipped:</td>
              <td style="padding: 8px 0; font-weight: bold; color: #d97706;">${summary.skipped}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        ${hasFailures ? `
        <p style="color: #6b7280; font-size: 14px;">
          Failed emails can be retried from the POS Reports section.
        </p>
        ` : ''}

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px;">
          This is an automated message from TeleTime POS.
        </p>
      </div>
    `;

    try {
      await this.emailService.sendEmail({
        to: managerEmail,
        subject,
        html,
      });

      console.log(`[ScheduledBatchEmail] Manager summary sent to ${managerEmail}`);
    } catch (error) {
      console.error('[ScheduledBatchEmail] Failed to send manager summary:', error);
    }
  }

  /**
   * Send failure notification to manager
   */
  async sendManagerFailureNotification(managerEmail, error, shiftId = null) {
    const subject = 'Batch Email Failed - Action Required';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Batch Email Failed</h2>

        <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 0; color: #991b1b;">
            ${shiftId ? `The batch email for Shift #${shiftId} failed to process.` : 'The scheduled batch email failed to process.'}
          </p>
          <p style="margin: 10px 0 0 0; color: #7f1d1d; font-family: monospace; font-size: 13px;">
            Error: ${error.message || 'Unknown error'}
          </p>
        </div>

        <p style="color: #6b7280;">
          Please check the POS system and retry the batch manually if needed.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px;">
          This is an automated alert from TeleTime POS.
        </p>
      </div>
    `;

    try {
      await this.emailService.sendEmail({
        to: managerEmail,
        subject,
        html,
      });
    } catch (err) {
      console.error('[ScheduledBatchEmail] Failed to send failure notification:', err);
    }
  }

  // ============================================================================
  // SCHEDULE LOG
  // ============================================================================

  /**
   * Get recent schedule log entries
   */
  async getScheduleLog(options = {}) {
    const { limit = 50, offset = 0, shiftId = null, status = null } = options;

    let query = `
      SELECT l.*, b.created_by
      FROM batch_email_schedule_log l
      LEFT JOIN email_batches b ON l.batch_id = b.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (shiftId) {
      query += ` AND l.shift_id = $${paramIndex}`;
      params.push(shiftId);
      paramIndex++;
    }

    if (status) {
      query += ` AND l.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY l.triggered_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // ============================================================================
  // TEST
  // ============================================================================

  /**
   * Test the email configuration by sending a test email
   */
  async testEmailConfig(testEmail) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1f2937;">Test Email</h2>
        <div style="background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #065f46;">
            This is a test email from TeleTime POS batch email system.
          </p>
          <p style="margin: 10px 0 0 0; color: #047857;">
            Sent at: ${new Date().toLocaleString()}
          </p>
        </div>
        <p style="color: #6b7280;">
          If you received this email, your email configuration is working correctly.
        </p>
      </div>
    `;

    await this.emailService.sendEmail({
      to: testEmail,
      subject: 'TeleTime POS - Test Email',
      html,
    });

    return { success: true, message: 'Test email sent' };
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Stop scheduled jobs
   */
  stop() {
    if (this.scheduledJob) {
      this.scheduledJob.stop();
      this.scheduledJob = null;
    }
    console.log('[ScheduledBatchEmail] Service stopped');
  }
}

module.exports = ScheduledBatchEmailService;
