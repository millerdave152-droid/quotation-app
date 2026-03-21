'use strict';

/**
 * Nightly Embeddings Job
 *
 * Runs at 2 AM ET — re-embeds recently modified records
 * and backfills NULLs across all searchable entity tables.
 */

const cron = require('node-cron');
const { runNightlyEmbeddingJob } = require('../services/embeddingService');

class NightlyEmbeddingsJob {
  constructor() {
    this.cronTask = null;
    this.lastRun = null;
    this.lastResult = null;
  }

  start(schedule = '0 2 * * *') {
    if (this.cronTask) return;

    this.cronTask = cron.schedule(schedule, () => this.run('cron'), {
      timezone: 'America/Toronto',
    });
  }

  async run(triggeredBy = 'manual') {
    this.lastRun = new Date();

    try {
      this.lastResult = await runNightlyEmbeddingJob();
    } catch (err) {
      console.error('[NightlyEmbeddingsJob] Error:', err.message);
      this.lastResult = { error: err.message };
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
      running: !!this.cronTask,
      lastRun: this.lastRun,
      lastResult: this.lastResult,
    };
  }
}

module.exports = new NightlyEmbeddingsJob();
