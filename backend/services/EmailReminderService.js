/**
 * EmailReminderService
 * Sends lead-pipeline email notifications via the platform's SES integration.
 *
 * Templates:
 *   lead-created        — New lead from quote opt-in
 *   no-followup-nudge   — 2 days in 'quoted', zero follow-ups
 *   expiry-warning      — Quote T−3 days, lead not resolved
 *   quote-expired       — Quote expired, lead still open
 *   followup-reminder   — Day of a scheduled follow-up
 */

const emailService = require('./EmailService');
const logger = require('../utils/logger');

const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || 'https://app.teletime.ca';
const COMPANY_NAME = process.env.COMPANY_NAME || 'Teletime';
const BATCH_SIZE = 20;

class EmailReminderService {
  constructor(pool) {
    this.pool = pool;
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Dispatch a lead email to one or more recipients.
   * Non-blocking — logs errors, never throws.
   * @param {string} templateId — one of the 5 template IDs
   * @param {number} leadId
   * @param {number[]} recipientUserIds
   */
  async dispatchLeadEmail(templateId, leadId, recipientUserIds) {
    try {
      if (!recipientUserIds || recipientUserIds.length === 0) return;

      // Fetch lead with linked data
      const lead = await this._getLeadData(leadId);
      if (!lead) {
        logger.warn({ leadId, templateId }, '[EmailReminder] Lead not found, skipping email');
        return;
      }

      // Resolve recipients (email + notification preferences)
      const recipients = await this._resolveRecipients(recipientUserIds);

      for (const recipient of recipients) {
        // Check notification preferences
        const prefs = recipient.notification_preferences || {};
        if (prefs.lead_email_reminders === false) {
          logger.info({ userId: recipient.id, templateId, leadId },
            '[EmailReminder] Suppressed — user opted out');
          continue;
        }

        const { subject, html } = this._renderTemplate(templateId, lead, recipient);
        const result = await emailService.sendEmail(recipient.email, subject, html);

        // Log to notification_log
        await emailService.logNotification(
          lead.primary_quote_id || null,
          `LEAD_${templateId.replace(/-/g, '_').toUpperCase()}`,
          recipient.email,
          subject,
          result.success ? 'sent' : 'failed',
          result.error || null
        );
      }

      // Mark matching lead_reminders as sent
      await this._markRemindersSent(leadId, templateId);

    } catch (err) {
      logger.error({ err, templateId, leadId }, '[EmailReminder] dispatchLeadEmail failed');
      // Never throw — email failure must not block lead workflow
    }
  }

  /**
   * Process pending email reminders from the lead_reminders queue.
   * Picks up records with reminder_type = 'email', sent_at IS NULL, scheduled_at <= NOW()
   * @returns {{ processed: number, sent: number, errors: number }}
   */
  async processEmailQueue() {
    const result = await this.pool.query(`
      SELECT r.id, r.lead_id, r.trigger_type, r.recipient_user_id, r.message_body
      FROM lead_reminders r
      WHERE r.reminder_type = 'email'
        AND r.sent_at IS NULL
        AND r.scheduled_at <= NOW()
      ORDER BY r.scheduled_at ASC
      LIMIT $1
    `, [BATCH_SIZE]);

    let sent = 0;
    let errors = 0;

    for (const row of result.rows) {
      try {
        const templateId = this._triggerToTemplate(row.trigger_type);
        const recipientIds = row.recipient_user_id ? [row.recipient_user_id] : [];

        if (templateId && recipientIds.length > 0) {
          await this.dispatchLeadEmail(templateId, row.lead_id, recipientIds);
        }

        // Mark sent regardless (dispatchLeadEmail handles its own errors)
        await this.pool.query(
          'UPDATE lead_reminders SET sent_at = NOW() WHERE id = $1',
          [row.id]
        );
        sent++;
      } catch (err) {
        logger.error({ err, reminderId: row.id }, '[EmailReminder] Queue item failed');
        errors++;
      }
    }

    return { processed: result.rows.length, sent, errors };
  }

  // ============================================================
  // Template Rendering
  // ============================================================

  _renderTemplate(templateId, lead, recipient) {
    const leadUrl = `${APP_URL}/leads/${lead.id}`;
    const customerName = lead.customer_name || 'Customer';
    const quoteNumber = lead.primary_quote_number || '-';
    const quoteTotal = this._formatCurrency(lead.primary_quote_total_cents);
    const expiryDate = lead.primary_quote_expires_at
      ? new Date(lead.primary_quote_expires_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'N/A';
    const storeName = lead.store_location_name || 'Store';
    const staffName = lead.assigned_to_name || 'Team';

    const daysUntilExpiry = lead.primary_quote_expires_at
      ? Math.ceil((new Date(lead.primary_quote_expires_at) - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    const templates = {
      'lead-created': {
        subject: `New Lead: ${customerName} \u2014 Quote #${quoteNumber}`,
        headerColor: '#667eea',
        headerGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        heading: 'New Lead Created',
        body: `
          <p style="font-size: 16px; color: #374151;">A new lead has been created from a quote opt-in:</p>
          ${this._detailsTable(lead, quoteNumber, quoteTotal, expiryDate, storeName, staffName)}
          <p style="color: #374151; margin-top: 16px;">Review the lead and schedule a follow-up to get the conversation started.</p>
        `
      },
      'no-followup-nudge': {
        subject: `Follow Up with ${customerName} \u2014 Quote Expires ${expiryDate}`,
        headerColor: '#f59e0b',
        headerGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        heading: 'Follow-Up Needed',
        body: `
          <p style="font-size: 16px; color: #374151;"><strong>${customerName}</strong> has been in "Quoted" status with no follow-up contact.</p>
          ${this._detailsTable(lead, quoteNumber, quoteTotal, expiryDate, storeName, staffName)}
          <p style="color: #374151; margin-top: 16px;">Reach out today to keep this opportunity moving forward.</p>
        `
      },
      'expiry-warning': {
        subject: `Quote Expiring Soon: ${customerName} \u2014 ${daysUntilExpiry != null ? daysUntilExpiry : '?'} Days Left`,
        headerColor: '#ef4444',
        headerGradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        heading: 'Quote Expiring Soon',
        body: `
          <p style="font-size: 16px; color: #374151;">The quote for <strong>${customerName}</strong> expires ${daysUntilExpiry != null && daysUntilExpiry <= 0 ? 'today' : `in <strong>${daysUntilExpiry}</strong> day(s)`}.</p>
          ${this._detailsTable(lead, quoteNumber, quoteTotal, expiryDate, storeName, staffName)}
          <p style="color: #374151; margin-top: 16px;">Take action now to close this deal before the quote expires.</p>
        `
      },
      'quote-expired': {
        subject: `Expired Quote \u2014 Lead Still Open: ${customerName}`,
        headerColor: '#6b7280',
        headerGradient: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
        heading: 'Quote Expired \u2014 Lead Still Open',
        body: `
          <p style="font-size: 16px; color: #374151;">The quote for <strong>${customerName}</strong> has expired but the lead is still open.</p>
          ${this._detailsTable(lead, quoteNumber, quoteTotal, expiryDate, storeName, staffName)}
          <p style="color: #374151; margin-top: 16px;">Consider issuing a revised quote or updating the lead status.</p>
        `
      },
      'followup-reminder': {
        subject: `Reminder: Follow-Up with ${customerName} Today${lead.followup_time ? ' at ' + lead.followup_time : ''}`,
        headerColor: '#8b5cf6',
        headerGradient: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
        heading: 'Follow-Up Reminder',
        body: `
          <p style="font-size: 16px; color: #374151;">You have a follow-up scheduled with <strong>${customerName}</strong>${lead.followup_time ? ' at <strong>' + lead.followup_time + '</strong>' : ' today'}.</p>
          ${this._detailsTable(lead, quoteNumber, quoteTotal, expiryDate, storeName, staffName)}
          <p style="color: #374151; margin-top: 16px;">Make sure to log the outcome after your interaction.</p>
        `
      }
    };

    const tpl = templates[templateId];
    if (!tpl) {
      return { subject: `Lead Update: ${customerName}`, html: '<p>Lead update notification.</p>' };
    }

    const html = this._wrapLayout(tpl.heading, tpl.headerGradient, tpl.body, leadUrl);
    return { subject: tpl.subject, html };
  }

  _detailsTable(lead, quoteNumber, quoteTotal, expiryDate, storeName, staffName) {
    return `
      <div style="background: white; border-radius: 10px; padding: 20px; margin: 16px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; color: #6b7280; width: 40%;">Customer:</td>
            <td style="padding: 10px 0; font-weight: 600; text-align: right;">${lead.customer_name || '-'}${lead.customer_phone ? ' &middot; ' + lead.customer_phone : ''}</td>
          </tr>
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280;">Quote:</td>
            <td style="padding: 10px 0; font-weight: 600; text-align: right;">${quoteNumber}</td>
          </tr>
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280;">Total Value:</td>
            <td style="padding: 10px 0; font-weight: 600; text-align: right; color: #10b981;">${quoteTotal}</td>
          </tr>
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280;">Expires:</td>
            <td style="padding: 10px 0; text-align: right;">${expiryDate}</td>
          </tr>
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280;">Store:</td>
            <td style="padding: 10px 0; text-align: right;">${storeName}</td>
          </tr>
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280;">Assigned To:</td>
            <td style="padding: 10px 0; text-align: right;">${staffName}</td>
          </tr>
        </table>
      </div>
    `;
  }

  _wrapLayout(heading, headerGradient, body, leadUrl) {
    return `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: ${headerGradient}; padding: 28px 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">${heading}</h1>
        </div>
        <div style="padding: 28px 30px; background: #f9fafb;">
          ${body}
          <div style="text-align: center; margin-top: 24px;">
            <a href="${leadUrl}" style="display: inline-block; padding: 12px 28px; background: #6366F1; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">View Lead</a>
          </div>
        </div>
        <div style="padding: 20px 30px; text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0 0 4px;">${COMPANY_NAME} Lead Pipeline</p>
          <p style="margin: 0;">To manage your email notifications, update your preferences in Settings.</p>
        </div>
      </div>
    `;
  }

  // ============================================================
  // Helpers
  // ============================================================

  async _getLeadData(leadId) {
    const result = await this.pool.query(`
      SELECT
        l.id, l.status, l.assigned_to, l.contact_name AS customer_name,
        l.contact_phone AS customer_phone, l.contact_email AS customer_email,
        NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS assigned_to_name,
        loc.name AS store_location_name,
        lq_data.quote_id AS primary_quote_id,
        lq_data.quote_number AS primary_quote_number,
        lq_data.total_cents AS primary_quote_total_cents,
        lq_data.expires_at AS primary_quote_expires_at
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN locations loc ON l.store_location_id = loc.id
      LEFT JOIN LATERAL (
        SELECT q.id AS quote_id, q.quote_number, q.total_cents, q.expires_at
        FROM lead_quotes lq
        JOIN quotations q ON lq.quote_id = q.id
        WHERE lq.lead_id = l.id AND lq.is_primary = true
        ORDER BY lq.linked_at DESC
        LIMIT 1
      ) lq_data ON true
      WHERE l.id = $1
    `, [leadId]);

    return result.rows[0] || null;
  }

  async _resolveRecipients(userIds) {
    if (!userIds || userIds.length === 0) return [];
    const result = await this.pool.query(`
      SELECT id, email, first_name, last_name, notification_preferences
      FROM users
      WHERE id = ANY($1) AND is_active = true AND email IS NOT NULL
    `, [userIds]);
    return result.rows;
  }

  async _markRemindersSent(leadId, templateId) {
    const triggerType = this._templateToTrigger(templateId);
    if (!triggerType) return;

    await this.pool.query(`
      UPDATE lead_reminders SET sent_at = NOW()
      WHERE lead_id = $1 AND trigger_type = $2 AND reminder_type = 'email' AND sent_at IS NULL
    `, [leadId, triggerType]).catch(() => {});
  }

  _triggerToTemplate(triggerType) {
    const map = {
      no_contact: 'no-followup-nudge',
      quote_expiry: 'expiry-warning',
      state_stale: 'quote-expired',
      manual: 'followup-reminder'
    };
    return map[triggerType] || null;
  }

  _templateToTrigger(templateId) {
    const map = {
      'lead-created': null,
      'no-followup-nudge': 'no_contact',
      'expiry-warning': 'quote_expiry',
      'quote-expired': 'state_stale',
      'followup-reminder': 'manual'
    };
    return map[templateId] || null;
  }

  _formatCurrency(cents) {
    if (!cents && cents !== 0) return '$0.00';
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
  }
}

module.exports = EmailReminderService;
