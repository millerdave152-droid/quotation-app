'use strict';

/**
 * Skulytics Nightly Sync Job
 *
 * Cron-scheduled job that runs an incremental product sync from
 * the Skulytics catalogue API every night at 2:00 AM Eastern.
 *
 * Features:
 *   - Overlap guard via skulytics_sync_runs status='running' check
 *   - Consistent structured logging: [SKULYTICS_SYNC] {timestamp} {event} {details}
 *   - Never crashes the process — all errors are caught and logged
 *
 * Usage:
 *   const skulyticsSyncJob = require('./jobs/skulyticsSync.job');
 *   skulyticsSyncJob.start();   // register cron
 *   skulyticsSyncJob.stop();    // unregister
 *   skulyticsSyncJob.run();     // run on-demand (respects overlap guard)
 *   skulyticsSyncJob.getStatus();
 */

const cron = require('node-cron');
const pool = require('../db');
const { SkulyticsSyncService } = require('../services/skulytics/SkulyticsSyncService');

// ── Logging ─────────────────────────────────────────────────

const PREFIX = '[SKULYTICS_SYNC]';

function log(event, details = '') {
  const ts = new Date().toISOString();
  console.log(`${PREFIX} ${ts} ${event} ${details}`.trimEnd());
}

function logError(event, details = '') {
  const ts = new Date().toISOString();
  console.error(`${PREFIX} ${ts} ${event} ${details}`.trimEnd());
}

// ── Job ─────────────────────────────────────────────────────

class SkulyticsSyncJob {
  constructor() {
    this.cronTask = null;
    this.lastRun = null;
    this.lastResult = null;
  }

  /**
   * Register the cron schedule.
   * Default: 2:00 AM Eastern (America/Toronto) every night.
   *
   * @param {string} [schedule] - cron expression override
   */
  start(schedule = '0 2 * * *') {
    if (this.cronTask) {
      log('SKIP', 'Cron already registered');
      return;
    }

    this.cronTask = cron.schedule(schedule, () => {
      this.run();
    }, {
      timezone: 'America/Toronto',
    });

    log('SCHEDULED', `Cron registered: "${schedule}" (America/Toronto)`);
  }

  /**
   * Unregister the cron schedule.
   */
  stop() {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
      log('STOPPED', 'Cron unregistered');
    }
  }

  /**
   * Check skulytics_sync_runs for any currently-running sync.
   * @returns {Promise<boolean>}
   */
  async _isRunning() {
    try {
      const { rows } = await pool.query(
        `SELECT id, started_at, triggered_by
         FROM skulytics_sync_runs
         WHERE status = 'running'
         ORDER BY started_at DESC
         LIMIT 1`
      );
      if (rows.length > 0) {
        const run = rows[0];
        log('OVERLAP_DETECTED', `run_id=${run.id} started_at=${run.started_at} triggered_by=${run.triggered_by}`);
        return true;
      }
      return false;
    } catch (err) {
      // If we can't check, err on the side of caution and skip
      logError('OVERLAP_CHECK_FAILED', err.message);
      return true;
    }
  }

  /**
   * Execute a sync run.
   * Guards against overlapping runs and never throws.
   *
   * @param {string} [triggeredBy='scheduler']
   * @returns {Promise<Object|null>} sync result or null if skipped
   */
  async run(triggeredBy = 'scheduler') {
    const startTime = Date.now();

    try {
      // ── Overlap guard ──────────────────────────────────────
      if (await this._isRunning()) {
        log('SKIPPED', 'Another sync run is already active');
        return null;
      }

      log('STARTING', `triggered_by=${triggeredBy}`);

      // ── Run sync ───────────────────────────────────────────
      const service = new SkulyticsSyncService();
      const result = await service.runIncrementalSync(triggeredBy);

      const durationMs = Date.now() - startTime;
      const durationSec = (durationMs / 1000).toFixed(1);

      log(
        'COMPLETED',
        `status=${result.status} processed=${result.processed} ` +
        `created=${result.created} updated=${result.updated} ` +
        `failed=${result.failed} duration=${durationSec}s ` +
        `run_id=${result.runId}`
      );

      this.lastRun = new Date();
      this.lastResult = result;

      return result;

    } catch (err) {
      const durationMs = Date.now() - startTime;
      const durationSec = (durationMs / 1000).toFixed(1);

      logError('FAILED', `error="${err.message}" duration=${durationSec}s`);

      this.lastRun = new Date();
      this.lastResult = { status: 'failed', error: err.message };

      // Never crash the process
      return { status: 'failed', error: err.message };
    }
  }

  /**
   * Return job status for health-check / admin endpoints.
   */
  getStatus() {
    return {
      scheduled: this.cronTask !== null,
      lastRun: this.lastRun,
      lastResult: this.lastResult,
    };
  }
}

module.exports = new SkulyticsSyncJob();
