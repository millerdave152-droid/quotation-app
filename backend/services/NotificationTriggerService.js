/**
 * NotificationTriggerService
 * - Queue-based notification sending infrastructure
 * - Checks trigger config, consent, renders template, queues to notification_queue
 * - processQueue() runs every minute to send pending notifications
 * - Sends email via AWS SES, SMS via Twilio (when configured)
 */

const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const { renderTemplate } = require('../routes/notification-templates');
const cron = require('node-cron');
let pool = require('../db');

class NotificationTriggerService {
  constructor() {
    this.ses = new SESv2Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@teletime.ca';
    this.fromName = process.env.EMAIL_FROM_NAME || 'TeleTime';
    this.twilioClient = null;
    this.twilioFrom = process.env.TWILIO_PHONE_NUMBER || null;
    this._processing = false;

    // Init Twilio if configured
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const twilio = require('twilio');
        this.twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        console.log('✅ Twilio SMS client initialized');
      } catch (e) {
        console.log('[NotificationService] Twilio not available:', e.message);
      }
    }
  }

  // ---- Queue a notification ----

  async send(templateCode, recipientCustomerId, variables = {}, options = {}) {
    try {
      // 1. Check trigger config
      const configResult = await pool.query(
        'SELECT is_enabled FROM notification_trigger_config WHERE template_code = $1',
        [templateCode]
      );
      if (configResult.rows.length && !configResult.rows[0].is_enabled) {
        return { queued: false, reason: 'trigger_disabled' };
      }

      // 2. Get template
      const tplResult = await pool.query(
        'SELECT * FROM notification_templates WHERE code = $1 AND is_active = true',
        [templateCode]
      );
      if (!tplResult.rows.length) {
        return { queued: false, reason: 'template_not_found' };
      }
      const template = tplResult.rows[0];

      // 3. Get customer
      let customer = null;
      if (recipientCustomerId) {
        const custResult = await pool.query(
          'SELECT id, name, email, phone, email_transactional, email_marketing, sms_transactional, sms_marketing FROM customers WHERE id = $1',
          [recipientCustomerId]
        );
        customer = custResult.rows[0] || null;
      }
      if (!customer) {
        return { queued: false, reason: 'customer_not_found' };
      }

      // 4. Check consent
      if (template.requires_consent) {
        const hasConsent = this.checkConsent(customer, template.consent_type);
        if (!hasConsent) {
          console.log(`[NotificationService] Skipping ${templateCode} — no consent for customer ${customer.id}`);
          return { queued: false, reason: 'no_consent' };
        }
      }

      // 5. Determine recipient
      let recipientEmail = null;
      let recipientPhone = null;
      if (template.channel === 'email') {
        recipientEmail = customer.email;
        if (!recipientEmail) return { queued: false, reason: 'no_email' };
      } else if (template.channel === 'sms') {
        recipientPhone = customer.phone;
        if (!recipientPhone) return { queued: false, reason: 'no_phone' };
      }

      // 6. Render
      const rendered = renderTemplate(template, variables);

      // 7. Insert into queue
      const { rows } = await pool.query(
        `INSERT INTO notification_queue
         (template_code, channel, recipient_email, recipient_phone, recipient_customer_id,
          subject, body, related_type, related_id, scheduled_for)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          templateCode,
          template.channel,
          recipientEmail,
          recipientPhone,
          customer.id,
          rendered.subject,
          rendered.body,
          options.related_type || null,
          options.related_id || null,
          options.scheduled_for || new Date()
        ]
      );

      // 8. Also log to notification_log for audit
      await pool.query(
        `INSERT INTO notification_log
         (customer_id, template_code, channel, notification_type, recipient_email, recipient_phone,
          subject, status, related_type, related_id, variables, event_name, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          customer.id, templateCode, template.channel, templateCode,
          recipientEmail, recipientPhone, rendered.subject, 'queued',
          options.related_type || null, options.related_id || null,
          JSON.stringify(variables), options.event_name || null,
          JSON.stringify({ queue_id: rows[0].id })
        ]
      );

      return { queued: true, id: rows[0].id, channel: template.channel };
    } catch (err) {
      console.error(`[NotificationService] Error queuing ${templateCode}:`, err.message);
      return { queued: false, reason: 'error', error: err.message };
    }
  }

  // ---- Consent check ----

  checkConsent(customer, consentType) {
    switch (consentType) {
      case 'email_transactional':
        return customer.email_transactional !== false;
      case 'email_marketing':
        return customer.email_marketing === true;
      case 'sms_transactional':
        return customer.sms_transactional === true;
      case 'sms_marketing':
        return customer.sms_marketing === true;
      default:
        return true;
    }
  }

  // ---- Process queue ----

  async processQueue() {
    if (this._processing) return;
    this._processing = true;

    try {
      const { rows: pending } = await pool.query(
        `SELECT * FROM notification_queue
         WHERE status IN ('pending')
           AND scheduled_for <= NOW()
           AND attempts < max_attempts
         ORDER BY scheduled_for ASC
         LIMIT 50`
      );

      if (!pending.length) { this._processing = false; return; }
      console.log(`[NotificationQueue] Processing ${pending.length} notifications...`);

      for (const notification of pending) {
        try {
          // Mark processing
          await pool.query(
            `UPDATE notification_queue SET status = 'processing', attempts = attempts + 1 WHERE id = $1`,
            [notification.id]
          );

          let result;
          if (notification.channel === 'email') {
            result = await this.sendEmail(notification);
          } else if (notification.channel === 'sms') {
            result = await this.sendSMS(notification);
          } else if (notification.channel === 'push') {
            result = await this.sendPush(notification);
          } else {
            throw new Error(`Unknown channel: ${notification.channel}`);
          }

          // Mark sent
          await pool.query(
            `UPDATE notification_queue
             SET status = 'sent', sent_at = NOW(), provider = $1, provider_message_id = $2
             WHERE id = $3`,
            [result.provider, result.messageId, notification.id]
          );

          // Update log
          await pool.query(
            `UPDATE notification_log SET status = 'sent'
             WHERE template_code = $1 AND metadata->>'queue_id' = $2`,
            [notification.template_code, String(notification.id)]
          );

        } catch (sendErr) {
          const currentAttempts = (notification.attempts || 0) + 1;
          const isFinal = currentAttempts >= notification.max_attempts;
          const retryDelay = Math.min(5 * Math.pow(2, currentAttempts - 1), 60) * 60 * 1000; // exponential backoff, max 60 min

          await pool.query(
            `UPDATE notification_queue
             SET status = $1, error_message = $2, next_retry_at = $3
             WHERE id = $4`,
            [
              isFinal ? 'failed' : 'pending',
              sendErr.message,
              isFinal ? null : new Date(Date.now() + retryDelay),
              notification.id
            ]
          );

          if (isFinal) {
            await pool.query(
              `UPDATE notification_log SET status = 'failed', error_message = $1
               WHERE template_code = $2 AND metadata->>'queue_id' = $3`,
              [sendErr.message, notification.template_code, String(notification.id)]
            );
          }

          console.error(`[NotificationQueue] Failed (attempt ${currentAttempts}/${notification.max_attempts}):`, sendErr.message);
        }
      }
    } catch (err) {
      console.error('[NotificationQueue] processQueue error:', err.message);
    } finally {
      this._processing = false;
    }
  }

  // ---- Channel senders ----

  async sendEmail(notification) {
    const result = await this.ses.send(new SendEmailCommand({
      FromEmailAddress: `${this.fromName} <${this.fromEmail}>`,
      Destination: { ToAddresses: [notification.recipient_email] },
      Content: {
        Simple: {
          Subject: { Data: notification.subject || 'TeleTime Notification' },
          Body: {
            Text: { Data: notification.body },
            Html: { Data: this.textToHtml(notification.body) }
          }
        }
      }
    }));
    return { provider: 'ses', messageId: result.MessageId || result.$metadata?.requestId };
  }

  async sendSMS(notification) {
    if (this.twilioClient && this.twilioFrom) {
      const message = await this.twilioClient.messages.create({
        body: notification.body,
        to: notification.recipient_phone,
        from: this.twilioFrom
      });
      return { provider: 'twilio', messageId: message.sid };
    }
    // Fallback: log-only mode
    console.log(`[NotificationQueue] SMS (no provider) to ${notification.recipient_phone}: ${notification.body}`);
    return { provider: 'log', messageId: `log-${Date.now()}` };
  }

  async sendPush(notification) {
    console.log(`[NotificationQueue] Push (no provider): ${notification.body}`);
    return { provider: 'log', messageId: `log-${Date.now()}` };
  }

  // ---- Helpers ----

  textToHtml(text) {
    if (!text) return '';
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;">${escaped}</body></html>`;
  }

  // ---- Start queue processor cron ----

  startQueueProcessor() {
    cron.schedule('* * * * *', () => {
      this.processQueue();
    });
    console.log('✅ Notification queue processor started (every minute)');
  }
}

module.exports = new NotificationTriggerService();
