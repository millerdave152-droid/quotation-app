/**
 * ChurnAlertService - Automated Email Alerts for High Churn Risk Customers
 *
 * Identifies customers with high churn risk based on CLV data and sends
 * daily email alerts to the sales team for proactive engagement.
 */

const pool = require('../db');
const emailService = require('./EmailService');

class ChurnAlertService {
  constructor() {
    this.salesTeamEmail = process.env.SALES_TEAM_EMAIL || process.env.EMAIL_FROM || 'sales@teletime.ca';
    this.companyName = process.env.COMPANY_NAME || 'Teletime';
  }

  /**
   * Get all customers with high churn risk
   * High churn risk = no activity for 180+ days
   * @returns {Promise<Array>} - List of high churn risk customers with CLV data
   */
  async getHighChurnRiskCustomers() {
    const result = await pool.query(`
      WITH customer_activity AS (
        SELECT
          c.id as customer_id,
          c.name as customer_name,
          c.email as customer_email,
          c.phone as customer_phone,
          c.company,
          c.created_at as customer_since,
          GREATEST(
            COALESCE((SELECT MAX(created_at) FROM orders WHERE customer_id = c.id), '1970-01-01'),
            COALESCE((SELECT MAX(created_at) FROM quotations WHERE customer_id = c.id), '1970-01-01')
          ) as last_activity,
          COALESCE(
            (SELECT SUM(total_cents) / 100.0 FROM orders WHERE customer_id = c.id AND status != 'cancelled'),
            (SELECT SUM(total_amount) FROM quotations WHERE customer_id = c.id AND status IN ('accepted', 'converted')),
            0
          ) as lifetime_value,
          COALESCE(
            (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND status != 'cancelled'),
            0
          ) as total_orders,
          COALESCE(
            (SELECT COUNT(*) FROM quotations WHERE customer_id = c.id AND status IN ('accepted', 'converted')),
            0
          ) as converted_quotes
        FROM customers c
      )
      SELECT
        customer_id,
        customer_name,
        customer_email,
        customer_phone,
        company,
        customer_since,
        last_activity,
        lifetime_value,
        total_orders,
        converted_quotes,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_activity)) / 86400.0 as days_since_last_activity,
        CASE
          WHEN lifetime_value >= 50000 THEN 'platinum'
          WHEN lifetime_value >= 20000 THEN 'gold'
          WHEN lifetime_value >= 5000 THEN 'silver'
          ELSE 'bronze'
        END as segment
      FROM customer_activity
      WHERE last_activity < CURRENT_TIMESTAMP - INTERVAL '180 days'
        AND last_activity > '1970-01-01'
        AND lifetime_value > 0
      ORDER BY lifetime_value DESC
    `);

    return result.rows;
  }

  /**
   * Check if an alert was already sent for this customer today
   * @param {number} customerId - Customer ID
   * @returns {Promise<boolean>}
   */
  async wasAlertSentToday(customerId) {
    const result = await pool.query(`
      SELECT id FROM churn_alerts
      WHERE customer_id = $1
        AND created_at >= CURRENT_DATE
        AND created_at < CURRENT_DATE + INTERVAL '1 day'
    `, [customerId]);

    return result.rows.length > 0;
  }

  /**
   * Log a churn alert to the database
   * @param {number} customerId - Customer ID
   * @param {string} recipientEmail - Email recipient
   * @param {string} status - 'sent', 'failed', 'skipped'
   * @param {string|null} errorMessage - Error message if failed
   * @returns {Promise<object>}
   */
  async logChurnAlert(customerId, recipientEmail, status, errorMessage = null) {
    const result = await pool.query(`
      INSERT INTO churn_alerts (customer_id, recipient_email, status, error_message, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      RETURNING *
    `, [customerId, recipientEmail, status, errorMessage]);

    return result.rows[0];
  }

  /**
   * Format currency for display
   * @param {number} amount - Amount in dollars
   * @returns {string}
   */
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  }

  /**
   * Generate HTML email for a single high churn risk customer
   * @param {object} customer - Customer data
   * @returns {string}
   */
  generateSingleCustomerEmail(customer) {
    const segmentColors = {
      platinum: { bg: '#1e293b', text: 'Platinum' },
      gold: { bg: '#b45309', text: 'Gold' },
      silver: { bg: '#64748b', text: 'Silver' },
      bronze: { bg: '#78716c', text: 'Bronze' }
    };

    const segmentStyle = segmentColors[customer.segment] || segmentColors.bronze;

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">High Churn Risk Alert</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Customer requires immediate attention</p>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
              <div>
                <h2 style="margin: 0 0 8px; color: #111827;">${customer.customer_name}</h2>
                <p style="margin: 0; color: #6b7280; font-size: 14px;">${customer.company || 'No company'}</p>
              </div>
              <span style="background: ${segmentStyle.bg}; color: white; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
                ${segmentStyle.text}
              </span>
            </div>

            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
              <p style="margin: 0; color: #991b1b; font-weight: 600; font-size: 16px;">
                No activity for ${Math.round(customer.days_since_last_activity)} days
              </p>
              <p style="margin: 8px 0 0; color: #b91c1c; font-size: 14px;">
                Last activity: ${new Date(customer.last_activity).toLocaleDateString('en-CA')}
              </p>
            </div>

            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Lifetime Value:</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold; text-align: right; color: #059669;">${this.formatCurrency(customer.lifetime_value)}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Total Orders:</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold; text-align: right;">${customer.total_orders}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Email:</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">
                  <a href="mailto:${customer.customer_email}" style="color: #2563eb;">${customer.customer_email || 'N/A'}</a>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; color: #6b7280;">Phone:</td>
                <td style="padding: 12px 0; font-weight: bold; text-align: right;">${customer.customer_phone || 'N/A'}</td>
              </tr>
            </table>
          </div>

          <p style="text-align: center; color: #6b7280; font-size: 14px; margin-top: 20px;">
            Reach out to this customer to prevent churn and retain their business.
          </p>
        </div>
        <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
          ${this.companyName} Churn Alert System
        </div>
      </div>
    `;
  }

  /**
   * Generate HTML email for multiple high churn risk customers (summary)
   * @param {Array} customers - Array of customer data
   * @returns {string}
   */
  generateSummaryEmail(customers) {
    const segmentColors = {
      platinum: '#1e293b',
      gold: '#b45309',
      silver: '#64748b',
      bronze: '#78716c'
    };

    const customerRows = customers.map(c => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          <strong>${c.customer_name}</strong><br>
          <span style="color: #6b7280; font-size: 13px;">${c.company || 'No company'}</span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
          <span style="background: ${segmentColors[c.segment] || '#78716c'}; color: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; text-transform: uppercase;">
            ${c.segment}
          </span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #059669; font-weight: bold;">
          ${this.formatCurrency(c.lifetime_value)}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #dc2626; font-weight: bold;">
          ${Math.round(c.days_since_last_activity)} days
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
          ${c.customer_email ? `<a href="mailto:${c.customer_email}" style="color: #2563eb;">Contact</a>` : 'N/A'}
        </td>
      </tr>
    `).join('');

    const totalAtRiskValue = customers.reduce((sum, c) => sum + parseFloat(c.lifetime_value || 0), 0);

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Daily Churn Risk Report</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">${new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <div style="display: flex; gap: 20px; margin-bottom: 30px;">
            <div style="flex: 1; background: white; border-radius: 12px; padding: 20px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <div style="font-size: 36px; font-weight: bold; color: #dc2626;">${customers.length}</div>
              <div style="color: #6b7280; font-size: 14px;">Customers at Risk</div>
            </div>
            <div style="flex: 1; background: white; border-radius: 12px; padding: 20px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <div style="font-size: 36px; font-weight: bold; color: #059669;">${this.formatCurrency(totalAtRiskValue)}</div>
              <div style="color: #6b7280; font-size: 14px;">Total Value at Risk</div>
            </div>
          </div>

          <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f3f4f6;">
                  <th style="padding: 14px 12px; text-align: left; color: #374151; font-weight: 600;">Customer</th>
                  <th style="padding: 14px 12px; text-align: center; color: #374151; font-weight: 600;">Segment</th>
                  <th style="padding: 14px 12px; text-align: right; color: #374151; font-weight: 600;">CLV</th>
                  <th style="padding: 14px 12px; text-align: center; color: #374151; font-weight: 600;">Inactive</th>
                  <th style="padding: 14px 12px; text-align: right; color: #374151; font-weight: 600;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${customerRows}
              </tbody>
            </table>
          </div>

          <p style="text-align: center; color: #6b7280; font-size: 14px; margin-top: 24px;">
            These customers have been inactive for 180+ days and require proactive engagement to prevent churn.
          </p>
        </div>
        <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
          ${this.companyName} Churn Alert System - Automated Daily Report
        </div>
      </div>
    `;
  }

  /**
   * Send churn alert emails to the sales team
   * @param {object} options - Options
   * @param {boolean} options.sendSummary - Send summary email (default: true)
   * @param {boolean} options.sendIndividual - Send individual emails per customer (default: false)
   * @returns {Promise<object>} - Results summary
   */
  async sendChurnAlerts(options = {}) {
    const { sendSummary = true, sendIndividual = false } = options;

    const results = {
      totalHighRisk: 0,
      alertsSent: 0,
      alertsSkipped: 0,
      alertsFailed: 0,
      errors: []
    };

    try {
      // Get high churn risk customers
      const highRiskCustomers = await this.getHighChurnRiskCustomers();
      results.totalHighRisk = highRiskCustomers.length;

      if (highRiskCustomers.length === 0) {
        return results;
      }

      // Send summary email if enabled
      if (sendSummary && highRiskCustomers.length > 0) {
        const subject = `Daily Churn Alert: ${highRiskCustomers.length} Customers at High Risk`;
        const html = this.generateSummaryEmail(highRiskCustomers);

        const emailResult = await emailService.sendEmail(this.salesTeamEmail, subject, html);

        if (emailResult.success) {
          results.alertsSent++;

          // Log alert for each customer in the summary
          for (const customer of highRiskCustomers) {
            await this.logChurnAlert(customer.customer_id, this.salesTeamEmail, 'sent');
          }
        } else {
          results.alertsFailed++;
          results.errors.push({ type: 'summary', error: emailResult.error });

          for (const customer of highRiskCustomers) {
            await this.logChurnAlert(customer.customer_id, this.salesTeamEmail, 'failed', emailResult.error);
          }
        }
      }

      // Send individual emails if enabled
      if (sendIndividual) {
        for (const customer of highRiskCustomers) {
          try {
            // Check if alert was already sent today
            const alreadySent = await this.wasAlertSentToday(customer.customer_id);

            if (alreadySent) {
              results.alertsSkipped++;
              continue;
            }

            const subject = `Churn Alert: ${customer.customer_name} - ${Math.round(customer.days_since_last_activity)} days inactive`;
            const html = this.generateSingleCustomerEmail(customer);

            const emailResult = await emailService.sendEmail(this.salesTeamEmail, subject, html);

            if (emailResult.success) {
              results.alertsSent++;
              await this.logChurnAlert(customer.customer_id, this.salesTeamEmail, 'sent');
            } else {
              results.alertsFailed++;
              results.errors.push({ customerId: customer.customer_id, error: emailResult.error });
              await this.logChurnAlert(customer.customer_id, this.salesTeamEmail, 'failed', emailResult.error);
            }
          } catch (err) {
            results.alertsFailed++;
            results.errors.push({ customerId: customer.customer_id, error: err.message });
            await this.logChurnAlert(customer.customer_id, this.salesTeamEmail, 'failed', err.message);
          }
        }
      }

      return results;
    } catch (err) {
      console.error('Error in churn alert process:', err);
      results.errors.push({ type: 'process', error: err.message });
      throw err;
    }
  }

  /**
   * Get recent churn alerts from the database
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async getRecentAlerts(options = {}) {
    const { limit = 50, customerId = null, status = null } = options;

    let query = `
      SELECT
        ca.*,
        c.name as customer_name,
        c.email as customer_email,
        c.company
      FROM churn_alerts ca
      JOIN customers c ON ca.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (customerId) {
      query += ` AND ca.customer_id = $${paramIndex}`;
      params.push(customerId);
      paramIndex++;
    }

    if (status) {
      query += ` AND ca.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY ca.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get churn alert statistics
   * @returns {Promise<object>}
   */
  async getAlertStats() {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_alerts,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
        COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped_count,
        COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as today_count,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_count,
        COUNT(DISTINCT customer_id) as unique_customers_alerted
      FROM churn_alerts
    `);

    return result.rows[0];
  }
}

// Export singleton instance
module.exports = new ChurnAlertService();
