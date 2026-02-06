const cron = require('node-cron');
const pool = require('../db');
const CustomerService = require('../services/CustomerService');

class AutoTagJob {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
    this.lastRun = null;
    this.lastRunStats = null;
    this.customerService = new CustomerService(pool, {
      cacheQuery: async (key, ttl, fn) => fn(),
    });
  }

  start(schedule = '0 3 * * *') {
    if (this.cronJob) {
      console.log('[AutoTag Job] Already running');
      return;
    }
    this.cronJob = cron.schedule(schedule, () => this.run(), { timezone: 'America/Toronto' });
    console.log(`[AutoTag Job] Scheduled: ${schedule}`);
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
  }

  async run() {
    if (this.isRunning) return;
    this.isRunning = true;
    const start = Date.now();
    console.log('[AutoTag Job] Evaluating auto-assign rules...');

    try {
      const results = await this.customerService.evaluateAutoTags();
      const totalAssigned = results.reduce((sum, r) => sum + r.assigned_count, 0);
      this.lastRunStats = { results, total_assigned: totalAssigned, duration_ms: Date.now() - start };
      this.lastRun = new Date();
      console.log(`[AutoTag Job] Done in ${Date.now() - start}ms — assigned ${totalAssigned} tags across ${results.length} rules`);
    } catch (err) {
      console.error('[AutoTag Job] Failed:', err);
      this.lastRunStats = { error: err.message };
    } finally {
      this.isRunning = false;
    }
  }

  getStatus() {
    return { running: this.isRunning, lastRun: this.lastRun, lastRunStats: this.lastRunStats };
  }
}

module.exports = new AutoTagJob();
