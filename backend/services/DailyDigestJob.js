/**
 * Daily Digest Job
 * Sends morning email digests to sales reps with their daily overview
 * Includes: new leads, follow-ups due, yesterday's sales, expiring quotes, overdue invoices, response time
 */

const cron = require('node-cron');

class DailyDigestJob {
  constructor(pool, emailService) {
    this.pool = pool;
    this.emailService = emailService;
    this.isRunning = false;
    this.lastRun = null;
    this.schedule = '15 8 * * 1-5'; // 8:15 AM weekdays (offset from expiry digest)
  }

  /**
   * Start the scheduled job
   */
  start() {
    console.log(`[DailyDigest] Starting scheduler with schedule: ${this.schedule}`);

    cron.schedule(this.schedule, async () => {
      await this.run();
    }, {
      timezone: process.env.TIMEZONE || 'America/Toronto',
    });

    console.log('[DailyDigest] Job scheduled');
  }

  /**
   * Run the digest job
   */
  async run() {
    if (this.isRunning) {
      console.log('[DailyDigest] Job already running, skipping');
      return;
    }

    this.isRunning = true;
    console.log('[DailyDigest] Starting digest job...');

    try {
      const reps = await this.getActiveReps();
      console.log(`[DailyDigest] Found ${reps.length} active reps`);

      const results = { sent: 0, failed: 0, skipped: 0 };

      for (const rep of reps) {
        try {
          const prefs = await this.getNotificationPreferences(rep.id);
          if (!prefs.dailyDigest) {
            results.skipped++;
            continue;
          }

          const digest = await this.getDigestDataForRep(rep.id);

          // Skip if nothing to report
          if (!digest.hasContent) {
            results.skipped++;
            continue;
          }

          await this.sendDigestEmail(rep, digest);
          results.sent++;
        } catch (error) {
          console.error(`[DailyDigest] Error for ${rep.email}:`, error.message);
          results.failed++;
        }
      }

      this.lastRun = new Date();
      console.log('[DailyDigest] Job complete:', results);
      return results;
    } catch (error) {
      console.error('[DailyDigest] Job error:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get all active sales reps
   */
  async getActiveReps() {
    const { rows } = await this.pool.query(`
      SELECT id, name, email
      FROM users
      WHERE is_active = true
        AND email IS NOT NULL
        AND email != ''
        AND role IN ('admin', 'manager', 'salesperson')
      ORDER BY name
    `);
    return rows;
  }

  /**
   * Get notification preferences for a user
   */
  async getNotificationPreferences(userId) {
    try {
      const { rows } = await this.pool.query(
        'SELECT preferences FROM user_preferences WHERE user_id = $1',
        [userId]
      );

      if (rows.length === 0) {
        return { dailyDigest: true };
      }

      const prefs = rows[0].preferences || {};
      return { dailyDigest: prefs.dailyDigest !== false };
    } catch {
      return { dailyDigest: true };
    }
  }

  /**
   * Get all digest data for a rep
   */
  async getDigestDataForRep(userId) {
    const [newLeads, followUps, yesterdaySales, expiringQuotes, overdueInvoices, responseTime] = await Promise.all([
      this.getNewLeads(userId),
      this.getFollowUpsDue(userId),
      this.getYesterdaySales(userId),
      this.getExpiringQuotes(userId),
      this.getOverdueInvoices(userId),
      this.getAvgResponseTime(userId),
    ]);

    const hasContent = newLeads.length > 0 || followUps.length > 0 ||
      yesterdaySales.total > 0 || expiringQuotes.length > 0 || overdueInvoices.length > 0;

    return { newLeads, followUps, yesterdaySales, expiringQuotes, overdueInvoices, responseTime, hasContent };
  }

  /**
   * New leads assigned in last 24h
   */
  async getNewLeads(userId) {
    const { rows } = await this.pool.query(`
      SELECT id, lead_number, contact_name, contact_email, priority, source
      FROM leads
      WHERE assigned_to = $1
        AND created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY priority DESC, created_at DESC
      LIMIT 10
    `, [userId]);
    return rows;
  }

  /**
   * Follow-ups due today
   */
  async getFollowUpsDue(userId) {
    const { rows } = await this.pool.query(`
      SELECT id, lead_number, contact_name, contact_phone, follow_up_date, priority
      FROM leads
      WHERE assigned_to = $1
        AND follow_up_date <= CURRENT_DATE
        AND status NOT IN ('converted', 'lost')
      ORDER BY follow_up_date ASC, priority DESC
      LIMIT 10
    `, [userId]);
    return rows;
  }

  /**
   * Yesterday's sales/commission
   */
  async getYesterdaySales(userId) {
    try {
      const { rows } = await this.pool.query(`
        SELECT
          COUNT(DISTINCT order_id) AS orders,
          COALESCE(SUM(base_amount_cents), 0) AS sales_cents,
          COALESCE(SUM(commission_amount_cents), 0) AS commission_cents
        FROM commission_earnings
        WHERE sales_rep_id = $1
          AND order_date = CURRENT_DATE - 1
      `, [userId]);

      const row = rows[0] || {};
      return {
        orders: parseInt(row.orders) || 0,
        total: (parseInt(row.sales_cents) || 0) / 100,
        commission: (parseInt(row.commission_cents) || 0) / 100,
      };
    } catch {
      return { orders: 0, total: 0, commission: 0 };
    }
  }

  /**
   * Quotes expiring within 3 days
   */
  async getExpiringQuotes(userId) {
    try {
      const { rows } = await this.pool.query(`
        SELECT
          q.id, q.quotation_number, q.total_cents,
          c.name AS customer_name,
          q.valid_until
        FROM quotations q
        LEFT JOIN customers c ON c.id = q.customer_id
        WHERE q.created_by = $1
          AND q.status IN ('draft', 'sent')
          AND q.valid_until IS NOT NULL
          AND q.valid_until >= CURRENT_DATE
          AND q.valid_until <= CURRENT_DATE + 3
        ORDER BY q.valid_until ASC
        LIMIT 10
      `, [userId]);
      return rows;
    } catch {
      return [];
    }
  }

  /**
   * Overdue invoices for rep's customers
   */
  async getOverdueInvoices(userId) {
    try {
      const { rows } = await this.pool.query(`
        SELECT
          i.id, i.invoice_number, i.total, i.due_date,
          c.name AS customer_name
        FROM invoices i
        JOIN customers c ON c.id = i.customer_id
        JOIN quotations q ON q.customer_id = c.id AND q.created_by = $1
        WHERE i.status IN ('sent', 'overdue')
          AND i.due_date < CURRENT_DATE
        ORDER BY i.due_date ASC
        LIMIT 10
      `, [userId]);
      return rows;
    } catch {
      return [];
    }
  }

  /**
   * Average response time this week
   */
  async getAvgResponseTime(userId) {
    try {
      const { rows } = await this.pool.query(`
        SELECT
          AVG(EXTRACT(EPOCH FROM (first_contacted_at - created_at)) / 3600) AS avg_hours,
          COUNT(*) AS total_contacted
        FROM leads
        WHERE assigned_to = $1
          AND first_contacted_at IS NOT NULL
          AND first_contacted_at >= DATE_TRUNC('week', CURRENT_DATE)
      `, [userId]);

      const row = rows[0] || {};
      return {
        avgHours: row.avg_hours ? parseFloat(row.avg_hours) : null,
        totalContacted: parseInt(row.total_contacted) || 0,
      };
    } catch {
      return { avgHours: null, totalContacted: 0 };
    }
  }

  /**
   * Generate email HTML
   */
  generateEmailHtml(rep, digest) {
    const posUrl = process.env.FRONTEND_URL || process.env.POS_URL || 'http://localhost:3000';
    const formatCurrency = (val) => `$${Number(val).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const sections = [];

    // Yesterday's Sales
    if (digest.yesterdaySales.total > 0) {
      sections.push(`
        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px; padding: 20px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 12px; color: #15803D; font-size: 15px;">Yesterday's Sales</h3>
          <div style="display: flex; gap: 20px;">
            <div><div style="font-size: 28px; font-weight: 700; color: #15803D;">${formatCurrency(digest.yesterdaySales.total)}</div><div style="font-size: 12px; color: #6B7280;">Revenue</div></div>
            <div><div style="font-size: 28px; font-weight: 700; color: #667EEA;">${formatCurrency(digest.yesterdaySales.commission)}</div><div style="font-size: 12px; color: #6B7280;">Commission</div></div>
            <div><div style="font-size: 28px; font-weight: 700; color: #374151;">${digest.yesterdaySales.orders}</div><div style="font-size: 12px; color: #6B7280;">Orders</div></div>
          </div>
        </div>
      `);
    }

    // New Leads
    if (digest.newLeads.length > 0) {
      const leadRows = digest.newLeads.map(l => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F3F4F6;">${l.lead_number}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F3F4F6;">${l.contact_name}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F3F4F6;">
            <span style="background: ${l.priority === 'hot' ? '#FEF2F2' : l.priority === 'warm' ? '#FEFCE8' : '#F0F9FF'}; color: ${l.priority === 'hot' ? '#DC2626' : l.priority === 'warm' ? '#D97706' : '#0284C7'}; padding: 2px 8px; border-radius: 10px; font-size: 11px; text-transform: uppercase; font-weight: 600;">${l.priority || 'normal'}</span>
          </td>
        </tr>
      `).join('');

      sections.push(`
        <div style="background: white; border: 1px solid #E5E7EB; border-radius: 10px; padding: 20px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 12px; color: #1D4ED8; font-size: 15px;">New Leads (${digest.newLeads.length})</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead><tr style="background: #F9FAFB;"><th style="padding: 8px 12px; text-align: left;">Lead #</th><th style="padding: 8px 12px; text-align: left;">Contact</th><th style="padding: 8px 12px; text-align: left;">Priority</th></tr></thead>
            <tbody>${leadRows}</tbody>
          </table>
        </div>
      `);
    }

    // Follow-ups Due
    if (digest.followUps.length > 0) {
      const fuRows = digest.followUps.map(f => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F3F4F6;">${f.contact_name}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F3F4F6;">${f.contact_phone || '-'}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F3F4F6; color: ${new Date(f.follow_up_date) < new Date() ? '#DC2626' : '#374151'};">${new Date(f.follow_up_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
        </tr>
      `).join('');

      sections.push(`
        <div style="background: ${digest.followUps.some(f => new Date(f.follow_up_date) < new Date()) ? '#FEF2F2' : 'white'}; border: 1px solid ${digest.followUps.some(f => new Date(f.follow_up_date) < new Date()) ? '#FECACA' : '#E5E7EB'}; border-radius: 10px; padding: 20px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 12px; color: #DC2626; font-size: 15px;">Follow-ups Due (${digest.followUps.length})</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead><tr style="background: #F9FAFB;"><th style="padding: 8px 12px; text-align: left;">Contact</th><th style="padding: 8px 12px; text-align: left;">Phone</th><th style="padding: 8px 12px; text-align: left;">Due</th></tr></thead>
            <tbody>${fuRows}</tbody>
          </table>
        </div>
      `);
    }

    // Expiring Quotes
    if (digest.expiringQuotes.length > 0) {
      const eqRows = digest.expiringQuotes.map(q => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F3F4F6;">${q.quotation_number}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F3F4F6;">${q.customer_name || '-'}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F3F4F6; text-align: right;">${formatCurrency((q.total_cents || 0) / 100)}</td>
        </tr>
      `).join('');

      sections.push(`
        <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 10px; padding: 20px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 12px; color: #D97706; font-size: 15px;">Expiring Quotes (${digest.expiringQuotes.length})</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead><tr style="background: #F9FAFB;"><th style="padding: 8px 12px; text-align: left;">Quote</th><th style="padding: 8px 12px; text-align: left;">Customer</th><th style="padding: 8px 12px; text-align: right;">Value</th></tr></thead>
            <tbody>${eqRows}</tbody>
          </table>
        </div>
      `);
    }

    // Response Time
    if (digest.responseTime.avgHours != null && digest.responseTime.totalContacted > 0) {
      const hrs = digest.responseTime.avgHours;
      const display = hrs < 1 ? `${Math.round(hrs * 60)}min` : `${hrs.toFixed(1)}h`;
      sections.push(`
        <div style="background: #F0F4FF; border: 1px solid #C7D2FE; border-radius: 10px; padding: 20px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px; color: #4338CA; font-size: 15px;">Response Time This Week</h3>
          <div style="font-size: 28px; font-weight: 700; color: #4338CA;">${display}</div>
          <div style="font-size: 12px; color: #6B7280;">${digest.responseTime.totalContacted} leads contacted</div>
        </div>
      `);
    }

    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #1F2937; margin: 0; padding: 0; background-color: #F3F4F6;">
        <div style="max-width: 650px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667EEA 0%, #764BA2 100%); border-radius: 12px 12px 0 0; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Good Morning, ${rep.name || 'there'}!</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Your daily digest for ${today}</p>
          </div>
          <div style="background: white; padding: 24px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            ${sections.join('')}
            ${sections.length === 0 ? '<p style="text-align: center; color: #9CA3AF; padding: 20px;">No new items to report today. Keep up the great work!</p>' : ''}
            <div style="text-align: center; margin-top: 24px;">
              <a href="${posUrl}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #667EEA, #764BA2); color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Open Dashboard</a>
            </div>
          </div>
          <div style="text-align: center; padding: 20px; color: #9CA3AF; font-size: 12px;">
            <p style="margin: 0;">TeleTime Solutions - Daily Digest</p>
            <p style="margin: 8px 0 0;"><a href="${posUrl}/settings/notifications" style="color: #667EEA;">Manage preferences</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Send the digest email
   */
  async sendDigestEmail(rep, digest) {
    const subject = this.buildSubject(digest);
    const html = this.generateEmailHtml(rep, digest);

    if (this.emailService) {
      await this.emailService.sendEmail({
        to: rep.email,
        subject,
        html,
      });
    } else {
      console.log(`[DailyDigest] Would send email to ${rep.email}: ${subject}`);
    }
  }

  /**
   * Build a descriptive subject line
   */
  buildSubject(digest) {
    const parts = [];
    if (digest.followUps.length > 0) parts.push(`${digest.followUps.length} follow-up${digest.followUps.length !== 1 ? 's' : ''}`);
    if (digest.newLeads.length > 0) parts.push(`${digest.newLeads.length} new lead${digest.newLeads.length !== 1 ? 's' : ''}`);
    if (digest.expiringQuotes.length > 0) parts.push(`${digest.expiringQuotes.length} expiring quote${digest.expiringQuotes.length !== 1 ? 's' : ''}`);

    if (parts.length > 0) {
      return `Daily Digest: ${parts.join(', ')}`;
    }
    return 'Daily Digest - Your Morning Overview';
  }
}

module.exports = DailyDigestJob;
