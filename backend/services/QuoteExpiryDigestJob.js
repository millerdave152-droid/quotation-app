/**
 * Quote Expiry Digest Job
 * Sends daily email digests to sales reps about their expiring quotes
 */

const cron = require('node-cron');

class QuoteExpiryDigestJob {
  constructor(pool, emailService) {
    this.pool = pool;
    this.emailService = emailService;
    this.isRunning = false;
    this.lastRun = null;
    this.schedule = '0 8 * * 1-5'; // 8 AM weekdays
  }

  /**
   * Start the scheduled job
   */
  start() {
    console.log(`[QuoteExpiryDigest] Starting scheduler with schedule: ${this.schedule}`);

    cron.schedule(this.schedule, async () => {
      await this.run();
    }, {
      timezone: process.env.TIMEZONE || 'America/Toronto',
    });

    console.log('[QuoteExpiryDigest] Job scheduled');
  }

  /**
   * Run the digest job manually
   */
  async run() {
    if (this.isRunning) {
      console.log('[QuoteExpiryDigest] Job already running, skipping');
      return;
    }

    this.isRunning = true;
    console.log('[QuoteExpiryDigest] Starting digest job...');

    try {
      // Get all sales reps with expiring quotes
      const repsWithQuotes = await this.getRepsWithExpiringQuotes();

      console.log(`[QuoteExpiryDigest] Found ${repsWithQuotes.length} reps with expiring quotes`);

      const results = {
        sent: 0,
        failed: 0,
        skipped: 0,
      };

      for (const rep of repsWithQuotes) {
        try {
          // Check if rep has email notifications enabled
          const prefs = await this.getNotificationPreferences(rep.user_id);
          if (!prefs.emailDigest) {
            results.skipped++;
            continue;
          }

          // Get detailed quotes for this rep
          const quotes = await this.getExpiringQuotesForRep(rep.user_id);

          if (quotes.length === 0) {
            results.skipped++;
            continue;
          }

          // Generate and send email
          await this.sendDigestEmail(rep, quotes);
          results.sent++;

          // Log the notification
          await this.logNotification(rep.user_id, quotes.length);
        } catch (error) {
          console.error(`[QuoteExpiryDigest] Error sending to ${rep.email}:`, error);
          results.failed++;
        }
      }

      this.lastRun = new Date();
      console.log('[QuoteExpiryDigest] Job complete:', results);

      return results;
    } catch (error) {
      console.error('[QuoteExpiryDigest] Job error:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get all sales reps who have quotes expiring within 7 days
   */
  async getRepsWithExpiringQuotes() {
    const { rows } = await this.pool.query(`
      SELECT DISTINCT
        u.id AS user_id,
        u.name,
        u.email,
        COUNT(*) AS quote_count,
        SUM(uo.total_cents) AS total_value_cents
      FROM unified_orders uo
      JOIN users u ON u.id = uo.salesperson_id
      WHERE uo.source = 'quote'
        AND uo.status IN ('draft', 'quote_sent', 'quote_viewed')
        AND uo.quote_expiry_date IS NOT NULL
        AND uo.quote_expiry_date >= CURRENT_DATE
        AND uo.quote_expiry_date <= CURRENT_DATE + INTERVAL '7 days'
        AND u.email IS NOT NULL
        AND u.email != ''
      GROUP BY u.id, u.name, u.email
      ORDER BY COUNT(*) DESC
    `);

    return rows;
  }

  /**
   * Get detailed expiring quotes for a specific rep
   */
  async getExpiringQuotesForRep(userId) {
    const { rows } = await this.pool.query(`
      SELECT
        uo.id AS quote_id,
        uo.order_number AS quote_number,
        uo.customer_name,
        uo.customer_phone,
        uo.customer_email,
        uo.total_cents,
        uo.quote_expiry_date AS expires_at,
        uo.quote_expiry_date - CURRENT_DATE AS days_until_expiry,
        (SELECT COUNT(*) FROM unified_order_items WHERE order_id = uo.id) AS item_count,
        c.tier AS customer_tier
      FROM unified_orders uo
      LEFT JOIN customers c ON c.id = uo.customer_id
      WHERE uo.salesperson_id = $1
        AND uo.source = 'quote'
        AND uo.status IN ('draft', 'quote_sent', 'quote_viewed')
        AND uo.quote_expiry_date IS NOT NULL
        AND uo.quote_expiry_date >= CURRENT_DATE
        AND uo.quote_expiry_date <= CURRENT_DATE + INTERVAL '7 days'
      ORDER BY uo.quote_expiry_date ASC, uo.total_cents DESC
    `, [userId]);

    return rows.map(row => ({
      quoteId: row.quote_id,
      quoteNumber: row.quote_number,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      customerEmail: row.customer_email,
      totalValue: row.total_cents / 100,
      expiresAt: row.expires_at,
      daysUntilExpiry: parseInt(row.days_until_expiry),
      itemCount: parseInt(row.item_count),
      customerTier: row.customer_tier,
      isUrgent: parseInt(row.days_until_expiry) <= 1,
    }));
  }

  /**
   * Get notification preferences for a user
   */
  async getNotificationPreferences(userId) {
    try {
      const { rows } = await this.pool.query(`
        SELECT preferences FROM user_preferences WHERE user_id = $1
      `, [userId]);

      if (rows.length === 0) {
        // Default: email digest enabled
        return { emailDigest: true };
      }

      const prefs = rows[0].preferences || {};
      return {
        emailDigest: prefs.quoteExpiryDigest !== false, // Default true
      };
    } catch (error) {
      // Table might not exist, default to enabled
      return { emailDigest: true };
    }
  }

  /**
   * Generate email HTML
   */
  generateEmailHtml(rep, quotes) {
    const todayQuotes = quotes.filter(q => q.daysUntilExpiry <= 0);
    const urgentQuotes = quotes.filter(q => q.daysUntilExpiry === 1);
    const soonQuotes = quotes.filter(q => q.daysUntilExpiry > 1 && q.daysUntilExpiry <= 3);
    const laterQuotes = quotes.filter(q => q.daysUntilExpiry > 3);

    const totalValue = quotes.reduce((sum, q) => sum + q.totalValue, 0);
    const posUrl = process.env.POS_URL || 'http://localhost:3000';

    const formatCurrency = (val) => `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const quoteRow = (quote) => `
      <tr style="${quote.isUrgent ? 'background-color: #FEF2F2;' : ''}">
        <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">
          <strong>${quote.customerName || 'Unknown'}</strong>
          ${quote.customerTier ? `<span style="background: #F3F4F6; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-left: 8px;">${quote.customerTier}</span>` : ''}
          <br>
          <span style="color: #6B7280; font-size: 13px;">${quote.quoteNumber}</span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: right;">
          <strong>${formatCurrency(quote.totalValue)}</strong>
          <br>
          <span style="color: #6B7280; font-size: 13px;">${quote.itemCount} items</span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: center;">
          ${quote.daysUntilExpiry <= 0
            ? '<span style="color: #DC2626; font-weight: bold;">TODAY</span>'
            : quote.daysUntilExpiry === 1
            ? '<span style="color: #EA580C; font-weight: bold;">Tomorrow</span>'
            : `<span style="color: #6B7280;">${quote.daysUntilExpiry} days</span>`
          }
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">
          ${quote.customerPhone ? `<a href="tel:${quote.customerPhone}" style="color: #2563EB;">${quote.customerPhone}</a>` : '-'}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: center;">
          <a href="${posUrl}/quotes/${quote.quoteId}" style="background: #2563EB; color: white; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 13px;">View</a>
        </td>
      </tr>
    `;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #1F2937; margin: 0; padding: 0; background-color: #F3F4F6;">
        <div style="max-width: 700px; margin: 0 auto; padding: 20px;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); border-radius: 12px 12px 0 0; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Expiring Quotes Alert</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0 0;">Daily digest for ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>

          <!-- Main Content -->
          <div style="background: white; padding: 24px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
            <p style="margin: 0 0 16px 0;">Hi ${rep.name || 'there'},</p>

            <p style="margin: 0 0 24px 0;">You have <strong>${quotes.length} quote${quotes.length !== 1 ? 's' : ''}</strong> expiring in the next 7 days worth <strong>${formatCurrency(totalValue)}</strong>.</p>

            <!-- Summary Cards -->
            <div style="display: flex; gap: 12px; margin-bottom: 24px;">
              ${todayQuotes.length > 0 ? `
                <div style="flex: 1; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 16px; text-align: center;">
                  <div style="font-size: 28px; font-weight: bold; color: #DC2626;">${todayQuotes.length}</div>
                  <div style="font-size: 13px; color: #991B1B;">Expire Today</div>
                </div>
              ` : ''}
              ${urgentQuotes.length > 0 ? `
                <div style="flex: 1; background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 8px; padding: 16px; text-align: center;">
                  <div style="font-size: 28px; font-weight: bold; color: #EA580C;">${urgentQuotes.length}</div>
                  <div style="font-size: 13px; color: #9A3412;">Tomorrow</div>
                </div>
              ` : ''}
              <div style="flex: 1; background: #F3F4F6; border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #1F2937;">${quotes.length}</div>
                <div style="font-size: 13px; color: #6B7280;">This Week</div>
              </div>
            </div>

            <!-- Quotes Table -->
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background: #F9FAFB;">
                  <th style="padding: 12px; text-align: left; border-bottom: 2px solid #E5E7EB;">Customer</th>
                  <th style="padding: 12px; text-align: right; border-bottom: 2px solid #E5E7EB;">Value</th>
                  <th style="padding: 12px; text-align: center; border-bottom: 2px solid #E5E7EB;">Expires</th>
                  <th style="padding: 12px; text-align: left; border-bottom: 2px solid #E5E7EB;">Phone</th>
                  <th style="padding: 12px; text-align: center; border-bottom: 2px solid #E5E7EB;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${quotes.map(quoteRow).join('')}
              </tbody>
            </table>

            <!-- CTA Button -->
            <div style="text-align: center; margin-top: 24px;">
              <a href="${posUrl}/quotes?filter=expiring" style="display: inline-block; background: #2563EB; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">View All Expiring Quotes</a>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; padding: 20px; color: #6B7280; font-size: 12px;">
            <p style="margin: 0;">You're receiving this because you have expiring quotes assigned to you.</p>
            <p style="margin: 8px 0 0 0;">
              <a href="${posUrl}/settings/notifications" style="color: #2563EB;">Manage notification preferences</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Send the digest email
   */
  async sendDigestEmail(rep, quotes) {
    const todayCount = quotes.filter(q => q.daysUntilExpiry <= 0).length;
    const totalValue = quotes.reduce((sum, q) => sum + q.totalValue, 0);

    const subject = todayCount > 0
      ? `🔴 ${todayCount} Quote${todayCount !== 1 ? 's' : ''} Expire Today - Action Required`
      : `📋 ${quotes.length} Quote${quotes.length !== 1 ? 's' : ''} Expiring This Week ($${Math.round(totalValue).toLocaleString()})`;

    const html = this.generateEmailHtml(rep, quotes);

    if (this.emailService) {
      await this.emailService.sendEmail({
        to: rep.email,
        subject,
        html,
      });
    } else {
      console.log(`[QuoteExpiryDigest] Would send email to ${rep.email}: ${subject}`);
    }
  }

  /**
   * Log notification for tracking
   */
  async logNotification(userId, quoteCount) {
    try {
      await this.pool.query(`
        INSERT INTO notification_log (user_id, notification_type, metadata, sent_at)
        VALUES ($1, 'quote_expiry_digest', $2, NOW())
      `, [userId, JSON.stringify({ quoteCount, date: new Date().toISOString() })]);
    } catch (error) {
      // Table might not exist, ignore
      console.warn('[QuoteExpiryDigest] Could not log notification:', error.message);
    }
  }
}

module.exports = QuoteExpiryDigestJob;
