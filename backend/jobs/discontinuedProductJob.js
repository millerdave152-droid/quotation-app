const cron = require('node-cron');
const pool = require('../db');
const DiscontinuedProductService = require('../services/DiscontinuedProductService');

class DiscontinuedProductJob {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
    this.lastRun = null;
    this.lastRunStats = null;
    DiscontinuedProductService.init({ pool });
  }

  /**
   * Start the scheduled job.
   * @param {string} schedule - Cron expression (default: 2 AM daily)
   */
  start(schedule = '0 2 * * *') {
    if (this.cronJob) {
      console.log('[DiscontinuedProducts Job] Already running');
      return;
    }

    this.cronJob = cron.schedule(schedule, () => this.run(), { timezone: 'America/Toronto' });
    console.log(`[DiscontinuedProducts Job] Scheduled: ${schedule}`);
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[DiscontinuedProducts Job] Stopped');
    }
  }

  async run() {
    if (this.isRunning) {
      console.log('[DiscontinuedProducts Job] Already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const start = Date.now();
    console.log('[DiscontinuedProducts Job] Starting auto-hide check...');

    try {
      const result = await DiscontinuedProductService.autoHideDiscontinuedProducts();
      this.lastRunStats = { ...result, duration_ms: Date.now() - start };
      this.lastRun = new Date();
      console.log(`[DiscontinuedProducts Job] Done in ${Date.now() - start}ms — hid ${result.hidden_count} products`);
    } catch (err) {
      console.error('[DiscontinuedProducts Job] Failed:', err);
      this.lastRunStats = { error: err.message };
    } finally {
      this.isRunning = false;
    }
  }

  getStatus() {
    return {
      running: this.isRunning,
      lastRun: this.lastRun,
      lastRunStats: this.lastRunStats,
    };
  }
}

module.exports = new DiscontinuedProductJob();
