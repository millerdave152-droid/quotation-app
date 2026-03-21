'use strict';

/**
 * Quote Follow-Up Alerts Job
 * Runs daily at 8:00 AM ET to scan for stalled quotes,
 * create in-app notifications, and send digest emails.
 */

const cron = require('node-cron');
const { runDailyQuoteAlerts } = require('../services/quoteAlertsService');

const TAG = '[QuoteAlertsJob]';

class QuoteAlertsJob {
  constructor() {
    this.cronTask = null;
    this.lastRun = null;
    this.lastResult = null;
  }

  /**
   * Register the cron schedule.
   * Default: 8:00 AM Eastern every day.
   */
  start(schedule = '0 8 * * *') {
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
      const result = await runDailyQuoteAlerts();
      const elapsed = Date.now() - startTime;

      this.lastRun = new Date().toISOString();
      this.lastResult = { success: true, ...result, elapsed_ms: elapsed };

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

module.exports = new QuoteAlertsJob();
