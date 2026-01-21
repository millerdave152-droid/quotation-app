/**
 * Churn Alert Scheduler Job
 *
 * Runs daily to identify high churn risk customers and send email alerts
 * to the sales team for proactive engagement.
 *
 * Usage:
 *   - As standalone script: node backend/jobs/churnAlertJob.js
 *   - As cron job: 0 9 * * * cd /path/to/app && node backend/jobs/churnAlertJob.js
 *   - Programmatically: require('./churnAlertJob').runJob()
 */

const cron = require('node-cron');
const churnAlertService = require('../services/ChurnAlertService');
const pool = require('../db');

// Default schedule: 9:00 AM every day
const DEFAULT_SCHEDULE = '0 9 * * *';

/**
 * Run the churn alert job
 * @param {object} options - Job options
 * @returns {Promise<object>} - Job results
 */
async function runJob(options = {}) {
  const startTime = new Date();
  console.log(`[${startTime.toISOString()}] Starting churn alert job...`);

  let jobResult = {
    startTime,
    endTime: null,
    duration: null,
    status: 'running',
    results: null,
    error: null
  };

  try {
    // Ensure churn_alerts table exists
    await ensureTableExists();

    // Run the churn alert process
    const results = await churnAlertService.sendChurnAlerts({
      sendSummary: true,
      sendIndividual: options.sendIndividual || false
    });

    jobResult.results = results;
    jobResult.status = 'completed';

    console.log(`[${new Date().toISOString()}] Churn alert job completed successfully.`);
    console.log(`  - High risk customers: ${results.totalHighRisk}`);
    console.log(`  - Alerts sent: ${results.alertsSent}`);
    console.log(`  - Alerts skipped: ${results.alertsSkipped}`);
    console.log(`  - Alerts failed: ${results.alertsFailed}`);

  } catch (err) {
    jobResult.status = 'failed';
    jobResult.error = err.message;
    console.error(`[${new Date().toISOString()}] Churn alert job failed:`, err.message);
  }

  jobResult.endTime = new Date();
  jobResult.duration = jobResult.endTime - startTime;

  // Log job execution
  await logJobExecution(jobResult);

  return jobResult;
}

/**
 * Ensure the churn_alerts table exists
 */
async function ensureTableExists() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS churn_alerts (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      recipient_email VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'sent',
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create index for faster lookups
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_churn_alerts_customer_id ON churn_alerts(customer_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_churn_alerts_created_at ON churn_alerts(created_at)
  `);

  // Create job log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS churn_alert_job_log (
      id SERIAL PRIMARY KEY,
      start_time TIMESTAMP WITH TIME ZONE NOT NULL,
      end_time TIMESTAMP WITH TIME ZONE,
      duration_ms INTEGER,
      status VARCHAR(20) NOT NULL,
      high_risk_count INTEGER,
      alerts_sent INTEGER,
      alerts_failed INTEGER,
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Log job execution to database
 * @param {object} jobResult - Job result data
 */
async function logJobExecution(jobResult) {
  try {
    await pool.query(`
      INSERT INTO churn_alert_job_log
      (start_time, end_time, duration_ms, status, high_risk_count, alerts_sent, alerts_failed, error_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      jobResult.startTime,
      jobResult.endTime,
      jobResult.duration,
      jobResult.status,
      jobResult.results?.totalHighRisk || 0,
      jobResult.results?.alertsSent || 0,
      jobResult.results?.alertsFailed || 0,
      jobResult.error
    ]);
  } catch (err) {
    console.error('Failed to log job execution:', err.message);
  }
}

/**
 * Start the scheduler
 * @param {string} schedule - Cron schedule expression
 * @returns {object} - Cron task instance
 */
function startScheduler(schedule = DEFAULT_SCHEDULE) {
  console.log(`Starting churn alert scheduler with schedule: ${schedule}`);

  const task = cron.schedule(schedule, async () => {
    await runJob();
  }, {
    scheduled: true,
    timezone: process.env.TIMEZONE || 'America/Toronto'
  });

  console.log('Churn alert scheduler started.');
  return task;
}

/**
 * Get job execution history
 * @param {number} limit - Number of records to return
 * @returns {Promise<Array>}
 */
async function getJobHistory(limit = 20) {
  const result = await pool.query(`
    SELECT * FROM churn_alert_job_log
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);
  return result.rows;
}

// Run as standalone script
if (require.main === module) {
  console.log('Running churn alert job as standalone script...');

  runJob()
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
  startScheduler,
  getJobHistory,
  ensureTableExists,
  DEFAULT_SCHEDULE
};
