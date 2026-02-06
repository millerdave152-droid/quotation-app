/**
 * NotificationScheduler - Scheduled Email Notification Jobs
 * Handles automated reminders for expiring quotes and follow-ups
 */

const cron = require('node-cron');
let pool = require('../db');
const emailService = require('./EmailService');

class NotificationScheduler {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
    this.defaultSalesEmail = process.env.SALES_NOTIFICATION_EMAIL || process.env.EMAIL_FROM;
  }

  /**
   * Start all scheduled notification jobs
   */
  start() {
    if (this.isRunning) {
      return;
    }

    // Run expiry check daily at 9:00 AM
    const expiryJob = cron.schedule('0 9 * * *', async () => {
      await this.checkExpiringQuotes();
    }, {
      timezone: 'America/Toronto'
    });
    this.jobs.push(expiryJob);

    // Run follow-up check daily at 10:00 AM
    const followUpJob = cron.schedule('0 10 * * *', async () => {
      await this.checkFollowUpReminders();
    }, {
      timezone: 'America/Toronto'
    });
    this.jobs.push(followUpJob);

    this.isRunning = true;
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Check for quotes expiring within the next 3 days and send warnings
   */
  async checkExpiringQuotes() {
    try {
      // Find quotes that:
      // - Are in SENT or DRAFT status (still active)
      // - Have an expiry date within the next 3 days
      // - Haven't had an expiry warning sent today
      const result = await pool.query(`
        SELECT
          q.id,
          q.quote_number,
          q.quotation_number,
          q.expires_at,
          q.created_by,
          c.name as customer_name,
          EXTRACT(DAY FROM q.expires_at - CURRENT_DATE) as days_left
        FROM quotations q
        LEFT JOIN customers c ON q.customer_id = c.id
        WHERE q.status IN ('SENT', 'DRAFT')
          AND q.expires_at IS NOT NULL
          AND q.expires_at > CURRENT_DATE
          AND q.expires_at <= CURRENT_DATE + INTERVAL '3 days'
          AND NOT EXISTS (
            SELECT 1 FROM notification_log nl
            WHERE nl.quote_id = q.id
              AND nl.notification_type = 'EXPIRY_WARNING'
              AND nl.created_at >= CURRENT_DATE
          )
        ORDER BY q.expires_at ASC
      `);

      const expiringQuotes = result.rows;

      for (const quote of expiringQuotes) {
        const recipientEmail = quote.created_by || this.defaultSalesEmail;
        const daysLeft = Math.ceil(quote.days_left);

        if (recipientEmail) {
          await emailService.sendExpiryWarningEmail(quote.id, recipientEmail, daysLeft);
        }
      }

      return { processed: expiringQuotes.length };
    } catch (err) {
      console.error('Error checking expiring quotes:', err.message);
      return { error: err.message };
    }
  }

  /**
   * Check for quotes that need follow-up reminders
   * Sends reminders for quotes sent 7+ days ago without response
   */
  async checkFollowUpReminders() {
    try {
      const followUpDays = parseInt(process.env.FOLLOW_UP_DAYS) || 7;

      // Find quotes that:
      // - Are in SENT status
      // - Were sent more than X days ago
      // - Haven't been won/lost yet
      // - Haven't had a follow-up reminder sent in the last 3 days
      // SECURITY FIX: Use parameterized query instead of string interpolation
      const result = await pool.query(`
        SELECT
          q.id,
          q.quote_number,
          q.quotation_number,
          q.sent_at,
          q.created_by,
          c.name as customer_name,
          EXTRACT(DAY FROM CURRENT_DATE - q.sent_at) as days_since_sent
        FROM quotations q
        LEFT JOIN customers c ON q.customer_id = c.id
        WHERE q.status = 'SENT'
          AND q.sent_at IS NOT NULL
          AND q.sent_at <= CURRENT_DATE - INTERVAL '1 day' * $1
          AND NOT EXISTS (
            SELECT 1 FROM notification_log nl
            WHERE nl.quote_id = q.id
              AND nl.notification_type = 'FOLLOW_UP_REMINDER'
              AND nl.created_at >= CURRENT_DATE - INTERVAL '3 days'
          )
        ORDER BY q.sent_at ASC
        LIMIT 50
      `, [followUpDays]);

      const quotesNeedingFollowUp = result.rows;

      for (const quote of quotesNeedingFollowUp) {
        const recipientEmail = quote.created_by || this.defaultSalesEmail;
        const daysSinceSent = Math.floor(quote.days_since_sent);

        if (recipientEmail) {
          await emailService.sendFollowUpReminderEmail(quote.id, recipientEmail, daysSinceSent);
        }
      }

      return { processed: quotesNeedingFollowUp.length };
    } catch (err) {
      console.error('Error checking follow-up reminders:', err.message);
      return { error: err.message };
    }
  }

  /**
   * Manually trigger expiry check (for testing)
   */
  async runExpiryCheck() {
    return await this.checkExpiringQuotes();
  }

  /**
   * Manually trigger follow-up check (for testing)
   */
  async runFollowUpCheck() {
    return await this.checkFollowUpReminders();
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobCount: this.jobs.length,
      defaultSalesEmail: this.defaultSalesEmail
    };
  }
}

NotificationScheduler.prototype._setPool = function(p) { pool = p; };

// Export singleton instance
module.exports = new NotificationScheduler();
