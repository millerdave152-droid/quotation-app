/**
 * EmailService - Centralized Email Notification Service
 * Handles all automated email notifications for quote lifecycle events
 */

const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const pool = require('../db');

class EmailService {
  constructor() {
    this.sesClient = new SESv2Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@teletime.ca';
    this.companyName = process.env.COMPANY_NAME || 'Teletime';
  }

  /**
   * Log notification to database for audit trail
   */
  async logNotification(quoteId, type, recipientEmail, subject, status = 'sent', errorMessage = null) {
    try {
      await pool.query(`
        INSERT INTO notification_log (quote_id, notification_type, recipient_email, subject, status, error_message)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [quoteId, type, recipientEmail, subject, status, errorMessage]);
    } catch (err) {
      console.error('Failed to log notification:', err.message);
    }
  }

  /**
   * Send email using AWS SES
   */
  async sendEmail(to, subject, htmlBody, textBody = null) {
    try {
      const command = new SendEmailCommand({
        FromEmailAddress: this.fromEmail,
        Destination: {
          ToAddresses: Array.isArray(to) ? to : [to]
        },
        Content: {
          Simple: {
            Subject: { Data: subject },
            Body: {
              Html: { Data: htmlBody },
              Text: { Data: textBody || this.stripHtml(htmlBody) }
            }
          }
        }
      });

      await this.sesClient.send(command);
      return { success: true };
    } catch (err) {
      console.error(`Failed to send email to ${to}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Strip HTML tags for plain text version
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Get quote details for email templates
   */
  async getQuoteDetails(quoteId) {
    const result = await pool.query(`
      SELECT
        q.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.id = $1
    `, [quoteId]);
    return result.rows[0];
  }

  /**
   * Format currency for display
   */
  formatCurrency(cents) {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format((cents || 0) / 100);
  }

  // ============================================
  // NOTIFICATION METHODS
  // ============================================

  /**
   * Send notification when a new quote is created
   */
  async sendQuoteCreatedEmail(quoteId, creatorEmail) {
    try {
      const quote = await this.getQuoteDetails(quoteId);
      if (!quote || !creatorEmail) return;

      const subject = `New Quote Created: ${quote.quote_number || quote.quotation_number}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">Quote Created</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <p style="font-size: 16px; color: #374151;">A new quote has been created:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Quote Number:</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${quote.quote_number || quote.quotation_number}</td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Customer:</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${quote.customer_name || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Total Amount:</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #10b981;">${this.formatCurrency(quote.total_cents)}</td>
              </tr>
              <tr>
                <td style="padding: 12px; color: #6b7280;">Status:</td>
                <td style="padding: 12px;"><span style="background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 20px; font-size: 14px;">DRAFT</span></td>
              </tr>
            </table>
            <p style="color: #6b7280; font-size: 14px;">Log in to view and send this quote to the customer.</p>
          </div>
          <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
            ${this.companyName} Quotation System
          </div>
        </div>
      `;

      const result = await this.sendEmail(creatorEmail, subject, html);
      await this.logNotification(quoteId, 'QUOTE_CREATED', creatorEmail, subject, result.success ? 'sent' : 'failed', result.error);
      return result;
    } catch (err) {
      console.error('sendQuoteCreatedEmail error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send notification when a quote is won
   */
  async sendQuoteWonEmail(quoteId, recipientEmail) {
    try {
      const quote = await this.getQuoteDetails(quoteId);
      if (!quote || !recipientEmail) return;

      const subject = `Quote Won! ${quote.quote_number || quote.quotation_number} - ${quote.customer_name}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Quote Won!</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <p style="font-size: 18px; color: #374151; text-align: center;">Congratulations on closing this deal!</p>
            <div style="background: white; border-radius: 12px; padding: 24px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px 0; color: #6b7280;">Quote:</td>
                  <td style="padding: 12px 0; font-weight: bold; text-align: right;">${quote.quote_number || quote.quotation_number}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; color: #6b7280;">Customer:</td>
                  <td style="padding: 12px 0; font-weight: bold; text-align: right;">${quote.customer_name}</td>
                </tr>
                <tr style="border-top: 2px solid #10b981;">
                  <td style="padding: 16px 0; color: #374151; font-size: 18px;">Total Value:</td>
                  <td style="padding: 16px 0; font-weight: bold; text-align: right; font-size: 24px; color: #10b981;">${this.formatCurrency(quote.total_cents)}</td>
                </tr>
              </table>
            </div>
            <p style="text-align: center; color: #6b7280;">Won on ${new Date().toLocaleDateString('en-CA')}</p>
          </div>
          <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
            ${this.companyName} Quotation System
          </div>
        </div>
      `;

      const result = await this.sendEmail(recipientEmail, subject, html);
      await this.logNotification(quoteId, 'QUOTE_WON', recipientEmail, subject, result.success ? 'sent' : 'failed', result.error);
      return result;
    } catch (err) {
      console.error('sendQuoteWonEmail error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send notification when a quote is lost
   */
  async sendQuoteLostEmail(quoteId, recipientEmail, lostReason = null) {
    try {
      const quote = await this.getQuoteDetails(quoteId);
      if (!quote || !recipientEmail) return;

      const subject = `Quote Lost: ${quote.quote_number || quote.quotation_number}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">Quote Lost</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Quote:</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${quote.quote_number || quote.quotation_number}</td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Customer:</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${quote.customer_name}</td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Value:</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${this.formatCurrency(quote.total_cents)}</td>
              </tr>
              ${lostReason ? `
              <tr>
                <td style="padding: 12px; color: #6b7280;">Reason:</td>
                <td style="padding: 12px; font-weight: bold; color: #ef4444;">${lostReason}</td>
              </tr>
              ` : ''}
            </table>
            <p style="color: #6b7280; font-size: 14px; text-align: center;">Use this feedback to improve future quotes.</p>
          </div>
          <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
            ${this.companyName} Quotation System
          </div>
        </div>
      `;

      const result = await this.sendEmail(recipientEmail, subject, html);
      await this.logNotification(quoteId, 'QUOTE_LOST', recipientEmail, subject, result.success ? 'sent' : 'failed', result.error);
      return result;
    } catch (err) {
      console.error('sendQuoteLostEmail error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send expiry warning email
   */
  async sendExpiryWarningEmail(quoteId, recipientEmail, daysLeft) {
    try {
      const quote = await this.getQuoteDetails(quoteId);
      if (!quote || !recipientEmail) return;

      const subject = `Quote Expiring Soon: ${quote.quote_number || quote.quotation_number} (${daysLeft} days left)`;
      const urgencyColor = daysLeft <= 1 ? '#ef4444' : daysLeft <= 3 ? '#f59e0b' : '#3b82f6';

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: ${urgencyColor}; padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">Quote Expiring ${daysLeft <= 1 ? 'Tomorrow!' : `in ${daysLeft} Days`}</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <p style="font-size: 16px; color: #374151;">This quote needs attention before it expires:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Quote:</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${quote.quote_number || quote.quotation_number}</td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Customer:</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${quote.customer_name}</td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Value:</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #10b981;">${this.formatCurrency(quote.total_cents)}</td>
              </tr>
              <tr>
                <td style="padding: 12px; color: #6b7280;">Expires:</td>
                <td style="padding: 12px; font-weight: bold; color: ${urgencyColor};">${new Date(quote.expires_at).toLocaleDateString('en-CA')}</td>
              </tr>
            </table>
            <p style="color: #6b7280; font-size: 14px;">Follow up with the customer to close this deal before it expires.</p>
          </div>
          <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
            ${this.companyName} Quotation System
          </div>
        </div>
      `;

      const result = await this.sendEmail(recipientEmail, subject, html);
      await this.logNotification(quoteId, 'EXPIRY_WARNING', recipientEmail, subject, result.success ? 'sent' : 'failed', result.error);
      return result;
    } catch (err) {
      console.error('sendExpiryWarningEmail error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send follow-up reminder email
   */
  async sendFollowUpReminderEmail(quoteId, recipientEmail, daysSinceSent) {
    try {
      const quote = await this.getQuoteDetails(quoteId);
      if (!quote || !recipientEmail) return;

      const subject = `Follow-up Reminder: ${quote.quote_number || quote.quotation_number} - ${quote.customer_name}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">Follow-up Reminder</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <p style="font-size: 16px; color: #374151;">It's been ${daysSinceSent} days since this quote was sent. Time for a follow-up!</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Quote:</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${quote.quote_number || quote.quotation_number}</td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Customer:</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${quote.customer_name}</td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Contact:</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${quote.customer_email || quote.customer_phone || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px; color: #6b7280;">Value:</td>
                <td style="padding: 12px; font-weight: bold; color: #10b981;">${this.formatCurrency(quote.total_cents)}</td>
              </tr>
            </table>
            <p style="color: #6b7280; font-size: 14px;">Reach out to keep this opportunity warm.</p>
          </div>
          <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
            ${this.companyName} Quotation System
          </div>
        </div>
      `;

      const result = await this.sendEmail(recipientEmail, subject, html);
      await this.logNotification(quoteId, 'FOLLOW_UP_REMINDER', recipientEmail, subject, result.success ? 'sent' : 'failed', result.error);
      return result;
    } catch (err) {
      console.error('sendFollowUpReminderEmail error:', err.message);
      return { success: false, error: err.message };
    }
  }
}

// Export singleton instance
module.exports = new EmailService();
