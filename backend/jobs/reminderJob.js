/**
 * Automated Reminder Scheduler Job
 *
 * Runs periodically to create automated follow-up reminders based on:
 * - Inactive contacted leads (3+ days)
 * - Unviewed quotes (2+ days)
 * - Expiring quotes (within 3 days)
 * - At-risk customers
 * - Stale new leads (7+ days)
 * - High-value pending quotes
 *
 * Usage:
 *   - As standalone script: node backend/jobs/reminderJob.js
 *   - As cron job: 0 8 * * * cd /path/to/app && node backend/jobs/reminderJob.js
 *   - Programmatically: require('./reminderJob').runJob()
 */

const cron = require('node-cron');
const pool = require('../db');
const cache = require('../cache');
const AutomatedReminderService = require('../services/AutomatedReminderService');
const TaskService = require('../services/TaskService');

// Default schedule: 8:00 AM every day
const DEFAULT_SCHEDULE = '0 8 * * *';

// Initialize services
let automatedReminderService = null;
let taskService = null;

function initServices() {
  if (!taskService) {
    taskService = new TaskService(pool, cache);
  }
  if (!automatedReminderService) {
    automatedReminderService = new AutomatedReminderService(pool, cache, taskService);
  }
}

/**
 * Run the automated reminder job
 * @param {object} options - Job options
 * @returns {Promise<object>} - Job results
 */
async function runJob(options = {}) {
  const startTime = new Date();
  console.log(`[${startTime.toISOString()}] Starting automated reminder job...`);

  let jobResult = {
    startTime,
    endTime: null,
    duration: null,
    status: 'running',
    results: null,
    error: null
  };

  try {
    // Ensure tables exist
    await ensureTableExists();

    // Initialize services
    initServices();

    // Run all automated reminder checks
    const results = await automatedReminderService.runAllChecks();

    jobResult.results = results;
    jobResult.status = 'completed';

    console.log(`[${new Date().toISOString()}] Automated reminder job completed successfully.`);
    console.log(`  - Inactive leads checked: ${results.inactiveLeads.checked}, reminders: ${results.inactiveLeads.created}`);
    console.log(`  - Unviewed quotes checked: ${results.unviewedQuotes.checked}, reminders: ${results.unviewedQuotes.created}`);
    console.log(`  - Expiring quotes checked: ${results.expiringQuotes.checked}, reminders: ${results.expiringQuotes.created}`);
    console.log(`  - At-risk customers checked: ${results.atRiskCustomers.checked}, reminders: ${results.atRiskCustomers.created}`);
    console.log(`  - Stale leads checked: ${results.staleLeads.checked}, reminders: ${results.staleLeads.created}`);
    console.log(`  - High-value quotes checked: ${results.highValueQuotes.checked}, reminders: ${results.highValueQuotes.created}`);
    console.log(`  - Total reminders created: ${results.totalRemindersCreated}`);

  } catch (err) {
    jobResult.status = 'failed';
    jobResult.error = err.message;
    console.error(`[${new Date().toISOString()}] Automated reminder job failed:`, err.message);
  }

  jobResult.endTime = new Date();
  jobResult.duration = jobResult.endTime - startTime;

  // Log job execution
  await logJobExecution(jobResult);

  return jobResult;
}

/**
 * Ensure required tables exist
 */
async function ensureTableExists() {
  // Create job log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminder_job_log (
      id SERIAL PRIMARY KEY,
      start_time TIMESTAMP WITH TIME ZONE NOT NULL,
      end_time TIMESTAMP WITH TIME ZONE,
      duration_ms INTEGER,
      status VARCHAR(20) NOT NULL,
      inactive_leads_checked INTEGER DEFAULT 0,
      inactive_leads_created INTEGER DEFAULT 0,
      unviewed_quotes_checked INTEGER DEFAULT 0,
      unviewed_quotes_created INTEGER DEFAULT 0,
      expiring_quotes_checked INTEGER DEFAULT 0,
      expiring_quotes_created INTEGER DEFAULT 0,
      at_risk_customers_checked INTEGER DEFAULT 0,
      at_risk_customers_created INTEGER DEFAULT 0,
      stale_leads_checked INTEGER DEFAULT 0,
      stale_leads_created INTEGER DEFAULT 0,
      high_value_quotes_checked INTEGER DEFAULT 0,
      high_value_quotes_created INTEGER DEFAULT 0,
      total_reminders_created INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create index for faster lookups
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_reminder_job_log_created_at ON reminder_job_log(created_at)
  `);
}

/**
 * Log job execution to database
 * @param {object} jobResult - Job result data
 */
async function logJobExecution(jobResult) {
  try {
    const r = jobResult.results || {};
    await pool.query(`
      INSERT INTO reminder_job_log (
        start_time, end_time, duration_ms, status,
        inactive_leads_checked, inactive_leads_created,
        unviewed_quotes_checked, unviewed_quotes_created,
        expiring_quotes_checked, expiring_quotes_created,
        at_risk_customers_checked, at_risk_customers_created,
        stale_leads_checked, stale_leads_created,
        high_value_quotes_checked, high_value_quotes_created,
        total_reminders_created, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `, [
      jobResult.startTime,
      jobResult.endTime,
      jobResult.duration,
      jobResult.status,
      r.inactiveLeads?.checked || 0,
      r.inactiveLeads?.created || 0,
      r.unviewedQuotes?.checked || 0,
      r.unviewedQuotes?.created || 0,
      r.expiringQuotes?.checked || 0,
      r.expiringQuotes?.created || 0,
      r.atRiskCustomers?.checked || 0,
      r.atRiskCustomers?.created || 0,
      r.staleLeads?.checked || 0,
      r.staleLeads?.created || 0,
      r.highValueQuotes?.checked || 0,
      r.highValueQuotes?.created || 0,
      r.totalRemindersCreated || 0,
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
  console.log(`Starting automated reminder scheduler with schedule: ${schedule}`);

  const task = cron.schedule(schedule, async () => {
    await runJob();
  }, {
    scheduled: true,
    timezone: process.env.TIMEZONE || 'America/Toronto'
  });

  console.log('Automated reminder scheduler started.');
  return task;
}

/**
 * Get job execution history
 * @param {number} limit - Number of records to return
 * @returns {Promise<Array>}
 */
async function getJobHistory(limit = 20) {
  const result = await pool.query(`
    SELECT * FROM reminder_job_log
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);
  return result.rows;
}

/**
 * Get reminder statistics
 * @returns {Promise<object>}
 */
async function getReminderStats() {
  initServices();
  return automatedReminderService.getStats();
}

// Run as standalone script
if (require.main === module) {
  console.log('Running automated reminder job as standalone script...');

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
  getReminderStats,
  ensureTableExists,
  DEFAULT_SCHEDULE
};
