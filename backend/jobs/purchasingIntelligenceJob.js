/**
 * Purchasing Intelligence Scheduler Job
 *
 * Runs daily and weekly to analyze purchasing patterns, generate
 * recommendations, and send email reports to the purchasing team.
 *
 * Schedules:
 *   - Daily at 6:00 AM: Quick analysis and critical alerts
 *   - Weekly (Monday 6:00 AM): Full analysis with comprehensive report
 *
 * Usage:
 *   - As standalone script: node backend/jobs/purchasingIntelligenceJob.js
 *   - Programmatically: require('./purchasingIntelligenceJob').startScheduler()
 */

const cron = require('node-cron');
const purchasingService = require('../services/PurchasingIntelligenceService');
const EmailService = require('../services/EmailService');
const pool = require('../db');

// Default schedules
const DAILY_SCHEDULE = '0 6 * * *';      // 6:00 AM every day
const WEEKLY_SCHEDULE = '0 6 * * 1';     // 6:00 AM every Monday

let emailService = null;

/**
 * Run the daily purchasing intelligence analysis
 * @returns {Promise<object>} - Job results
 */
async function runDailyJob() {
  const startTime = new Date();
  console.log(`[${startTime.toISOString()}] Starting daily purchasing intelligence analysis...`);

  try {
    const result = await purchasingService.runFullAnalysis('daily');

    console.log(`[${new Date().toISOString()}] Daily analysis completed.`);
    console.log(`  - Products analyzed: ${result.productsAnalyzed}`);
    console.log(`  - Recommendations generated: ${result.totalRecommendations}`);
    console.log(`  - Critical alerts: ${result.criticalAlerts?.length || 0}`);

    // Send email for critical alerts only
    if (result.criticalAlerts?.length > 0) {
      await sendCriticalAlertEmail(result);
    }

    return {
      status: 'completed',
      ...result
    };
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Daily analysis failed:`, err.message);
    return {
      status: 'failed',
      error: err.message
    };
  }
}

/**
 * Run the weekly comprehensive analysis
 * @returns {Promise<object>} - Job results
 */
async function runWeeklyJob() {
  const startTime = new Date();
  console.log(`[${startTime.toISOString()}] Starting weekly purchasing intelligence analysis...`);

  try {
    const result = await purchasingService.runFullAnalysis('weekly');

    console.log(`[${new Date().toISOString()}] Weekly analysis completed.`);
    console.log(`  - Products analyzed: ${result.productsAnalyzed}`);
    console.log(`  - Recommendations generated: ${result.totalRecommendations}`);

    // Send comprehensive weekly report
    await sendWeeklyReport(result);

    // Mark email sent
    if (result.runId) {
      await pool.query(`
        UPDATE purchasing_agent_runs
        SET email_sent = true
        WHERE id = $1
      `, [result.runId]);
    }

    return {
      status: 'completed',
      ...result
    };
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Weekly analysis failed:`, err.message);
    return {
      status: 'failed',
      error: err.message
    };
  }
}

/**
 * Send email for critical alerts
 * @param {object} result - Analysis result
 */
async function sendCriticalAlertEmail(result) {
  const recipients = getRecipients();
  if (recipients.length === 0) {
    console.log('No recipients configured for purchasing alerts');
    return;
  }

  if (!emailService) {
    emailService = new EmailService();
  }

  const subject = `[URGENT] ${result.criticalAlerts.length} Critical Stock Alerts - Immediate Action Required`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .alert-item { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 10px 0; }
    .alert-title { font-weight: bold; color: #dc2626; }
    .stats { display: flex; gap: 20px; margin: 20px 0; }
    .stat-box { background: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; }
    .stat-number { font-size: 24px; font-weight: bold; color: #dc2626; }
    .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Critical Stock Alert</h1>
    <p>${result.criticalAlerts.length} products need immediate restocking</p>
  </div>
  <div class="content">
    <h2>Critical Alerts</h2>
    ${result.criticalAlerts.map(alert => `
      <div class="alert-item">
        <div class="alert-title">${alert.product_name} (${alert.sku || 'N/A'})</div>
        <p>${alert.reasoning}</p>
        <p><strong>Current Stock:</strong> ${alert.current_stock} units</p>
        <p><strong>Daily Sales Rate:</strong> ${alert.avg_daily_sales?.toFixed(1) || '0'} units/day</p>
        <p><strong>Suggested Order:</strong> ${alert.suggested_quantity} units</p>
      </div>
    `).join('')}

    <h2>Summary</h2>
    <div class="stats">
      <div class="stat-box">
        <div class="stat-number">${result.productsAnalyzed}</div>
        <div>Products Analyzed</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${result.criticalAlerts?.length || 0}</div>
        <div>Critical Alerts</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${result.trendingUp?.length || 0}</div>
        <div>Trending Up</div>
      </div>
    </div>

    <p style="margin-top: 20px;">
      <a href="${process.env.APP_URL || 'http://localhost:3000'}/purchasing-intelligence"
         style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
        View Full Dashboard
      </a>
    </p>
  </div>
  <div class="footer">
    <p>This is an automated alert from the Purchasing Intelligence System.</p>
    <p>Generated on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
  `;

  try {
    await emailService.sendEmail(recipients, subject, htmlBody);
    console.log(`Critical alert email sent to ${recipients.length} recipients`);
  } catch (err) {
    console.error('Failed to send critical alert email:', err.message);
  }
}

/**
 * Send weekly comprehensive report
 * @param {object} result - Analysis result
 */
async function sendWeeklyReport(result) {
  const recipients = getRecipients();
  if (recipients.length === 0) {
    console.log('No recipients configured for purchasing reports');
    return;
  }

  if (!emailService) {
    emailService = new EmailService();
  }

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);

  const subject = `Weekly Purchasing Intelligence Report - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .section { margin: 20px 0; padding: 20px; background: #f9fafb; border-radius: 8px; }
    .section h2 { margin-top: 0; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
    .stat-card { background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .stat-number { font-size: 28px; font-weight: bold; }
    .stat-label { font-size: 12px; color: #6b7280; }
    .critical { color: #dc2626; }
    .warning { color: #f59e0b; }
    .success { color: #10b981; }
    .table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    .table th, .table td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    .table th { background: #f3f4f6; font-weight: 600; }
    .priority-badge { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    .priority-critical { background: #fef2f2; color: #dc2626; }
    .priority-high { background: #fff7ed; color: #ea580c; }
    .priority-medium { background: #fefce8; color: #ca8a04; }
    .ai-summary { background: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; }
    .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Weekly Purchasing Intelligence Report</h1>
    <p>Analysis Period: ${weekStart.toLocaleDateString()} - ${new Date().toLocaleDateString()}</p>
  </div>

  <div class="content">
    <!-- Summary Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">${result.productsAnalyzed}</div>
        <div class="stat-label">Products Analyzed</div>
      </div>
      <div class="stat-card">
        <div class="stat-number critical">${result.criticalAlerts?.length || 0}</div>
        <div class="stat-label">Critical Alerts</div>
      </div>
      <div class="stat-card">
        <div class="stat-number success">${result.trendingUp?.length || 0}</div>
        <div class="stat-label">Trending Up</div>
      </div>
      <div class="stat-card">
        <div class="stat-number warning">${result.trendingDown?.length || 0}</div>
        <div class="stat-label">Declining</div>
      </div>
    </div>

    ${result.aiSummary ? `
    <!-- AI Summary -->
    <div class="section">
      <h2>AI Analysis Summary</h2>
      <div class="ai-summary">
        ${result.aiSummary.replace(/\n/g, '<br>')}
      </div>
    </div>
    ` : ''}

    ${result.criticalAlerts?.length > 0 ? `
    <!-- Critical Alerts -->
    <div class="section">
      <h2>Critical Stock Alerts</h2>
      <table class="table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Days Left</th>
            <th>Current Stock</th>
            <th>Suggested Order</th>
          </tr>
        </thead>
        <tbody>
          ${result.criticalAlerts.slice(0, 10).map(alert => `
            <tr>
              <td><strong>${alert.product_name}</strong><br><small>${alert.sku || ''}</small></td>
              <td><span class="priority-badge priority-critical">${alert.days_of_stock_remaining} days</span></td>
              <td>${alert.current_stock} units</td>
              <td><strong>${alert.suggested_quantity}</strong> units</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    ${result.trendingUp?.length > 0 ? `
    <!-- Trending Up -->
    <div class="section">
      <h2>Products Trending Up</h2>
      <p>Consider increasing order quantities for these products:</p>
      <table class="table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Growth</th>
            <th>Suggested Order</th>
          </tr>
        </thead>
        <tbody>
          ${result.trendingUp.slice(0, 5).map(product => `
            <tr>
              <td>${product.product_name}</td>
              <td class="success">+${((product.growth_rate || 0) * 100).toFixed(1)}%</td>
              <td>${product.suggested_quantity} units</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    ${result.trendingDown?.length > 0 ? `
    <!-- Trending Down -->
    <div class="section">
      <h2>Products with Declining Demand</h2>
      <p>Consider reducing order quantities for these products:</p>
      <table class="table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Decline</th>
            <th>Current Stock</th>
          </tr>
        </thead>
        <tbody>
          ${result.trendingDown.slice(0, 5).map(product => `
            <tr>
              <td>${product.product_name}</td>
              <td class="warning">${((product.growth_rate || 0) * 100).toFixed(1)}%</td>
              <td>${product.current_stock} units</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    ${result.topProducts?.length > 0 ? `
    <!-- Top Products -->
    <div class="section">
      <h2>Top Selling Products (Last 30 Days)</h2>
      <table class="table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Product</th>
            <th>Units Sold</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${result.topProducts.slice(0, 10).map((product, idx) => `
            <tr>
              <td>#${idx + 1}</td>
              <td>${product.name}</td>
              <td>${product.total_units}</td>
              <td>$${parseFloat(product.total_revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <p style="text-align: center; margin-top: 30px;">
      <a href="${process.env.APP_URL || 'http://localhost:3000'}/purchasing-intelligence"
         style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
        View Full Dashboard
      </a>
    </p>
  </div>

  <div class="footer">
    <p>This is an automated report from the Purchasing Intelligence System.</p>
    <p>Generated on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
  `;

  try {
    await emailService.sendEmail(recipients, subject, htmlBody);
    console.log(`Weekly report email sent to ${recipients.length} recipients`);
  } catch (err) {
    console.error('Failed to send weekly report email:', err.message);
  }
}

/**
 * Get email recipients from environment
 * @returns {string[]} - List of email addresses
 */
function getRecipients() {
  const recipients = process.env.PURCHASING_REPORT_RECIPIENTS;
  if (!recipients) return [];
  return recipients.split(',').map(email => email.trim()).filter(Boolean);
}

/**
 * Start the scheduled jobs
 * @param {object} options - Scheduler options
 * @returns {object} - Cron task instances
 */
function startScheduler(options = {}) {
  const timezone = process.env.TIMEZONE || 'America/Toronto';

  console.log(`Starting purchasing intelligence scheduler...`);
  console.log(`  - Daily schedule: ${options.dailySchedule || DAILY_SCHEDULE}`);
  console.log(`  - Weekly schedule: ${options.weeklySchedule || WEEKLY_SCHEDULE}`);
  console.log(`  - Timezone: ${timezone}`);

  const dailyTask = cron.schedule(options.dailySchedule || DAILY_SCHEDULE, async () => {
    console.log('[Scheduler] Running daily purchasing intelligence analysis...');
    await runDailyJob();
  }, {
    scheduled: true,
    timezone
  });

  const weeklyTask = cron.schedule(options.weeklySchedule || WEEKLY_SCHEDULE, async () => {
    console.log('[Scheduler] Running weekly purchasing intelligence analysis...');
    await runWeeklyJob();
  }, {
    scheduled: true,
    timezone
  });

  console.log('Purchasing intelligence scheduler started.');

  return {
    dailyTask,
    weeklyTask,
    stop: () => {
      dailyTask.stop();
      weeklyTask.stop();
      console.log('Purchasing intelligence scheduler stopped.');
    }
  };
}

/**
 * Run job manually (for testing or one-off execution)
 * @param {string} type - 'daily' or 'weekly'
 * @returns {Promise<object>}
 */
async function runJob(type = 'daily') {
  if (type === 'weekly') {
    return runWeeklyJob();
  }
  return runDailyJob();
}

// Run as standalone script
if (require.main === module) {
  const args = process.argv.slice(2);
  const type = args[0] || 'daily';

  console.log(`Running ${type} purchasing intelligence job as standalone script...`);

  runJob(type)
    .then(result => {
      console.log('Job completed:', result.status);
      process.exit(result.status === 'completed' ? 0 : 1);
    })
    .catch(err => {
      console.error('Job error:', err);
      process.exit(1);
    });
}

module.exports = {
  runJob,
  runDailyJob,
  runWeeklyJob,
  startScheduler,
  DAILY_SCHEDULE,
  WEEKLY_SCHEDULE
};
