'use strict';

/**
 * Materialized View Refresh Job
 * Refreshes mv_daily_sales every 15 minutes.
 */

const cron = require('node-cron');
const pool = require('../db');

const TAG = '[MVRefreshJob]';

class MVRefreshJob {
  constructor() {
    this.cronTask = null;
    this.lastRun = null;
    this.lastResult = null;
  }

  /**
   * Register the cron schedule.
   * Default: every 15 minutes.
   */
  start(schedule = '*/15 * * * *') {
    if (this.cronTask) {
      return;
    }

    this.cronTask = cron.schedule(schedule, () => {
      this.run();
    }, {
      timezone: 'America/Toronto',
    });

  }

  async run(triggeredBy = 'scheduler') {
    const startTime = Date.now();

    try {
      await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_sales');
      const elapsed = Date.now() - startTime;

      this.lastRun = new Date().toISOString();
      this.lastResult = { success: true, elapsed_ms: elapsed };

      return this.lastResult;
    } catch (err) {
      const elapsed = Date.now() - startTime;
      this.lastRun = new Date().toISOString();
      this.lastResult = { success: false, error: err.message, elapsed_ms: elapsed };

      // Don't log error for "does not exist" during first deploy
      if (err.message.includes('does not exist')) {
        console.warn(`${TAG} SKIP — mv_daily_sales not yet created`);
      } else {
        console.error(`${TAG} ERROR — ${err.message}`);
      }
      return this.lastResult;
    }
  }

  stop() {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
    }
  }

  getStatus() {
    return {
      scheduled: this.cronTask !== null,
      lastRun: this.lastRun,
      lastResult: this.lastResult,
    };
  }
}

module.exports = new MVRefreshJob();
