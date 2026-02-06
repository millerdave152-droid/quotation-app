/**
 * RebateReminderJob - Scheduled Task for Rebate Reminders
 *
 * Handles automated sending of rebate reminder emails:
 * 1. Post-purchase reminders (7, 14, 21 days after purchase)
 * 2. Deadline reminders (14, 7, 3, 1 days before expiry)
 * 3. Expired claim marking
 *
 * Can be triggered:
 * - Manually via API endpoint
 * - Scheduled via cron (external scheduler)
 * - Scheduled via node-cron (internal)
 */

class RebateReminderJob {
  constructor(pool, emailService = null, options = {}) {
    this.pool = pool;
    this.emailService = emailService;

    // Import services
    const RebateFollowUpService = require('./RebateFollowUpService');
    this.followUpService = new RebateFollowUpService(pool, emailService);

    // Job configuration
    this.config = {
      // Post-purchase reminder schedule (days after purchase)
      postPurchaseDays: options.postPurchaseDays || [7, 14, 21],

      // Deadline reminder schedule (days before deadline)
      deadlineDays: options.deadlineDays || [14, 7, 3, 1],

      // Batch size limits
      postPurchaseLimit: options.postPurchaseLimit || 100,
      deadlineLimit: options.deadlineLimit || 100,

      // Enable/disable specific reminder types
      enablePostPurchase: options.enablePostPurchase !== false,
      enableDeadline: options.enableDeadline !== false,
      enableExpiredMarking: options.enableExpiredMarking !== false,

      // Dry run mode (no actual emails sent)
      dryRun: options.dryRun || false,
    };

    // Job state
    this.isRunning = false;
    this.lastRun = null;
    this.lastResults = null;

    // Internal scheduler (optional)
    this.cronJob = null;
  }

  /**
   * Run all reminder jobs
   * @param {Object} options - Override default options
   * @returns {Promise<Object>} Results from all jobs
   */
  async run(options = {}) {
    if (this.isRunning) {
      return {
        success: false,
        message: 'Job is already running',
        startedAt: this.lastRun,
      };
    }

    const config = { ...this.config, ...options };
    const startTime = new Date();
    this.isRunning = true;
    this.lastRun = startTime;

    const results = {
      startedAt: startTime,
      completedAt: null,
      dryRun: config.dryRun,
      postPurchase: null,
      deadline: null,
      expired: null,
      summary: {
        totalProcessed: 0,
        totalSent: 0,
        totalFailed: 0,
        totalExpired: 0,
      },
    };

    try {
      console.log(`[RebateReminderJob] Starting job run at ${startTime.toISOString()}`);
      console.log(`[RebateReminderJob] Config: dryRun=${config.dryRun}`);

      // 1. Process post-purchase reminders (7 days after purchase)
      if (config.enablePostPurchase) {
        console.log('[RebateReminderJob] Processing post-purchase reminders...');
        results.postPurchase = await this.followUpService.processPostPurchaseReminders({
          dryRun: config.dryRun,
          limit: config.postPurchaseLimit,
        });
        results.summary.totalProcessed += results.postPurchase.processed;
        results.summary.totalSent += results.postPurchase.sent;
        results.summary.totalFailed += results.postPurchase.failed;
        console.log(`[RebateReminderJob] Post-purchase: processed=${results.postPurchase.processed}, sent=${results.postPurchase.sent}, failed=${results.postPurchase.failed}`);
      }

      // 2. Process deadline reminders
      if (config.enableDeadline) {
        console.log('[RebateReminderJob] Processing deadline reminders...');
        results.deadline = await this.followUpService.processReminders({
          dryRun: config.dryRun,
          limit: config.deadlineLimit,
        });
        results.summary.totalProcessed += results.deadline.processed;
        results.summary.totalSent += results.deadline.sent;
        results.summary.totalFailed += results.deadline.failed;
        console.log(`[RebateReminderJob] Deadline: processed=${results.deadline.processed}, sent=${results.deadline.sent}, failed=${results.deadline.failed}`);
      }

      // 3. Mark expired claims
      if (config.enableExpiredMarking && !config.dryRun) {
        console.log('[RebateReminderJob] Marking expired claims...');
        results.expired = await this.followUpService.markExpiredClaims();
        results.summary.totalExpired = results.expired.expiredCount;
        console.log(`[RebateReminderJob] Expired: marked=${results.expired.expiredCount}`);
      }

      results.completedAt = new Date();
      results.success = true;
      results.duration = results.completedAt - startTime;

      console.log(`[RebateReminderJob] Job completed in ${results.duration}ms`);
      console.log(`[RebateReminderJob] Summary: processed=${results.summary.totalProcessed}, sent=${results.summary.totalSent}, failed=${results.summary.totalFailed}, expired=${results.summary.totalExpired}`);

    } catch (error) {
      console.error('[RebateReminderJob] Job failed:', error);
      results.success = false;
      results.error = error.message;
      results.completedAt = new Date();
      results.duration = results.completedAt - startTime;
    } finally {
      this.isRunning = false;
      this.lastResults = results;
    }

    return results;
  }

  /**
   * Run only post-purchase reminders
   */
  async runPostPurchaseOnly(options = {}) {
    return this.run({
      ...options,
      enableDeadline: false,
      enableExpiredMarking: false,
    });
  }

  /**
   * Run only deadline reminders
   */
  async runDeadlineOnly(options = {}) {
    return this.run({
      ...options,
      enablePostPurchase: false,
      enableExpiredMarking: false,
    });
  }

  /**
   * Dry run - preview what would be sent without sending
   */
  async dryRun(options = {}) {
    return this.run({ ...options, dryRun: true });
  }

  /**
   * Get job status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      lastResults: this.lastResults,
      config: this.config,
    };
  }

  /**
   * Get preview of pending reminders without sending
   */
  async getPreview() {
    const [postPurchase, deadline, expiring] = await Promise.all([
      this.followUpService.getPostPurchaseReminders({ limit: 100 }),
      this.followUpService.getPendingReminders({ limit: 100 }),
      this.followUpService.getExpiringClaims(7),
    ]);

    return {
      postPurchase: {
        count: postPurchase.length,
        totalAmount: postPurchase.reduce((sum, r) => sum + r.amount, 0),
        items: postPurchase.slice(0, 10), // Preview first 10
      },
      deadline: {
        count: deadline.length,
        totalAmount: deadline.reduce((sum, r) => sum + r.amount, 0),
        items: deadline.slice(0, 10),
      },
      expiringSoon: {
        count: expiring.length,
        totalAmount: expiring.reduce((sum, r) => sum + r.amount, 0),
        urgentCount: expiring.filter(r => r.isUrgent).length,
        items: expiring.slice(0, 10),
      },
    };
  }

  /**
   * Start internal cron scheduler
   * Requires node-cron package: npm install node-cron
   * @param {string} schedule - Cron expression (default: daily at 9 AM)
   */
  startScheduler(schedule = '0 9 * * *') {
    try {
      const cron = require('node-cron');

      if (this.cronJob) {
        this.cronJob.stop();
      }

      this.cronJob = cron.schedule(schedule, async () => {
        console.log('[RebateReminderJob] Scheduled run triggered');
        await this.run();
      });

      console.log(`[RebateReminderJob] Scheduler started with schedule: ${schedule}`);
      return true;
    } catch (error) {
      console.error('[RebateReminderJob] Failed to start scheduler:', error.message);
      console.error('[RebateReminderJob] Install node-cron: npm install node-cron');
      return false;
    }
  }

  /**
   * Stop internal cron scheduler
   */
  stopScheduler() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[RebateReminderJob] Scheduler stopped');
      return true;
    }
    return false;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    return this.config;
  }
}

module.exports = RebateReminderJob;
