'use strict';

/**
 * Overdue Invoices Job
 * Runs daily at 6:00 AM ET to mark institutional invoices as overdue
 * when their due_date has passed and they are not yet paid or voided.
 */

const cron = require('node-cron');
const pool = require('../db');
const InstitutionalService = require('../services/institutionalService');

const TAG = '[OverdueInvoicesJob]';

class OverdueInvoicesJob {
  constructor() {
    this.cronTask = null;
    this.lastRun = null;
    this.lastResult = null;
    this.service = new InstitutionalService(pool, null);
  }

  /**
   * Register the cron schedule.
   * Default: 6:00 AM Eastern every day.
   */
  start(schedule = '0 6 * * *') {
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
      const count = await this.service.updateOverdueStatuses();
      const elapsed = Date.now() - startTime;

      this.lastRun = new Date().toISOString();
      this.lastResult = { success: true, updated: count, elapsed_ms: elapsed };

      return this.lastResult;
    } catch (err) {
      const elapsed = Date.now() - startTime;
      this.lastRun = new Date().toISOString();
      this.lastResult = { success: false, error: err.message, elapsed_ms: elapsed };

      console.error(`${TAG} ERROR — ${err.message}`);
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

module.exports = new OverdueInvoicesJob();
