'use strict';

/**
 * Centralized Job Scheduler
 *
 * Registry for all cron-scheduled background jobs. Provides startAll()
 * and stopAll() lifecycle hooks for server startup and graceful shutdown.
 *
 * To add a new job:
 *   1. Import it below
 *   2. Add an entry to the JOBS array with { name, job }
 *   3. The job must expose .start() and .stop() methods
 */

const skulyticsSyncJob = require('./skulyticsSync.job');
const overdueInvoicesJob = require('./overdueInvoices.job');
const quoteAlertsJob = require('./quoteAlerts.job');
const mvRefreshJob = require('./mvRefresh.job');
const nightlyEmbeddingsJob = require('./nightlyEmbeddings.job');

// ── Job Registry ────────────────────────────────────────────

const JOBS = [
  { name: 'skulytics-sync', job: skulyticsSyncJob },
  { name: 'overdue-invoices', job: overdueInvoicesJob },
  { name: 'quote-alerts',    job: quoteAlertsJob },
  { name: 'mv-refresh',     job: mvRefreshJob },
  { name: 'nightly-embeddings', job: nightlyEmbeddingsJob },
];

// ── Lifecycle ───────────────────────────────────────────────

/**
 * Start all registered jobs.
 * Called once inside the app.listen callback.
 */
function startAll() {
  for (const { name, job } of JOBS) {
    try {
      job.start();
    } catch (err) {
      console.error(`[SCHEDULER] Failed to start ${name}: ${err.message}`);
    }
  }
}

/**
 * Stop all registered jobs.
 * Called from SIGTERM / SIGINT handlers for graceful shutdown.
 */
function stopAll() {
  for (const { name, job } of JOBS) {
    try {
      job.stop();
    } catch (err) {
      console.error(`[SCHEDULER] Failed to stop ${name}: ${err.message}`);
    }
  }
}

module.exports = {
  startAll,
  stopAll,
  // Direct job references for ad-hoc access (health checks, manual triggers)
  skulyticsSyncJob,
  overdueInvoicesJob,
  quoteAlertsJob,
  mvRefreshJob,
  nightlyEmbeddingsJob,
};
