/**
 * CLV Calculation Job
 * Week 4.2 of 4-week sprint
 *
 * Nightly job to calculate and store CLV metrics for all active customers.
 * Runs at 2 AM daily (configurable via environment variable).
 */

const cron = require('node-cron');
const pool = require('../db');
const CustomerService = require('../services/CustomerService');

class CLVCalculationJob {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
    this.lastRun = null;
    this.lastRunStats = null;
    this.customerService = new CustomerService(pool, {
      cacheQuery: async (key, ttl, fn) => fn() // No caching during batch job
    });
  }

  /**
   * Start the scheduled job
   * @param {string} schedule - Cron schedule (default: 2 AM daily)
   */
  start(schedule = '0 2 * * *') {
    if (this.cronJob) {
      console.log('[CLV Job] Already running');
      return;
    }

    this.cronJob = cron.schedule(schedule, async () => {
      await this.run();
    }, { timezone: process.env.TZ || 'America/Toronto' });

    console.log(`[CLV Job] Scheduled: ${schedule}`);
  }

  /**
   * Stop the scheduled job
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[CLV Job] Stopped');
    }
  }

  /**
   * Run the CLV calculation for all active customers
   */
  async run(triggeredBy = 'scheduled') {
    if (this.isRunning) {
      console.log('[CLV Job] Already running, skipping...');
      return { skipped: true };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const stats = {
      processed: 0,
      updated: 0,
      errors: 0,
      errorDetails: []
    };

    console.log('[CLV Job] Starting CLV calculation...');

    try {
      // Log job start
      const jobLog = await pool.query(
        `INSERT INTO clv_job_log (started_at, status, triggered_by)
         VALUES (NOW(), 'running', $1) RETURNING id`,
        [triggeredBy || 'scheduled']
      ).catch(() => ({ rows: [{ id: null }] }));
      const jobLogId = jobLog.rows[0]?.id;

      // Get all customers
      const customersResult = await pool.query(`
        SELECT id, name FROM customers
        ORDER BY id
      `);

      const customers = customersResult.rows;
      console.log(`[CLV Job] Processing ${customers.length} customers...`);

      // Process in configurable batches
      const batchSize = parseInt(process.env.CLV_BATCH_SIZE) || 50;
      for (let i = 0; i < customers.length; i += batchSize) {
        const batch = customers.slice(i, i + batchSize);

        await Promise.all(batch.map(async (customer) => {
          try {
            await this.calculateAndStoreCustomerCLV(customer.id);
            stats.updated++;
          } catch (err) {
            stats.errors++;
            stats.errorDetails.push({
              customerId: customer.id,
              error: err.message
            });
          }
          stats.processed++;
        }));

        // Log progress every 100 customers
        if (stats.processed % 100 === 0) {
          console.log(`[CLV Job] Progress: ${stats.processed}/${customers.length}`);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[CLV Job] Completed in ${duration}ms: ${stats.updated} updated, ${stats.errors} errors`);

      // Log job completion
      if (jobLogId) {
        await pool.query(
          `UPDATE clv_job_log SET
            completed_at = NOW(), status = 'completed',
            customers_processed = $1, customers_updated = $2,
            errors = $3, error_details = $4, duration_ms = $5
           WHERE id = $6`,
          [stats.processed, stats.updated, stats.errors,
           stats.errorDetails.length > 0 ? JSON.stringify(stats.errorDetails.slice(0, 50)) : null,
           duration, jobLogId]
        ).catch(err => console.error('[CLV Job] Failed to update job log:', err.message));
      }

      this.lastRun = new Date();
      this.lastRunStats = { ...stats, duration };

      return stats;

    } catch (error) {
      console.error('[CLV Job] Fatal error:', error.message);
      stats.errorDetails.push({ fatal: true, error: error.message });
      // Log job failure
      if (jobLogId) {
        const duration = Date.now() - startTime;
        await pool.query(
          `UPDATE clv_job_log SET
            completed_at = NOW(), status = 'failed',
            customers_processed = $1, customers_updated = $2,
            errors = $3, error_details = $4, duration_ms = $5
           WHERE id = $6`,
          [stats.processed, stats.updated, stats.errors,
           JSON.stringify([...stats.errorDetails.slice(0, 50)]),
           duration, jobLogId]
        ).catch(err => console.error('[CLV Job] Failed to update job log:', err.message));
      }
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Calculate and store CLV for a single customer
   * @param {number} customerId - Customer ID
   */
  async calculateAndStoreCustomerCLV(customerId) {
    // Get CLV data from CustomerService
    const clvData = await this.customerService.calculateLifetimeValue(customerId);

    if (!clvData) {
      throw new Error('CLV calculation returned no data');
    }

    // Determine segment based on lifetime value
    const segment = this.determineSegment(clvData.metrics?.lifetimeValue || 0);

    // Determine trend (compare to previous if available)
    const trend = await this.determineTrend(customerId, clvData.metrics?.lifetimeValue || 0);

    // Calculate days since last activity
    const daysSinceActivity = await this.getDaysSinceLastActivity(customerId);

    const clvScore = Math.round((clvData.metrics?.lifetimeValue || 0) * 100);
    const churnRisk = clvData.engagement?.churnRisk || 'unknown';
    const totalTransactions = clvData.metrics?.totalTransactions || 0;
    const avgOrderValueCents = Math.round((clvData.metrics?.averageOrderValue || 0) * 100);

    // Update customer record
    await pool.query(`
      UPDATE customers SET
        clv_score = $1,
        churn_risk = $2,
        clv_segment = $3,
        clv_last_calculated = NOW(),
        total_transactions = $4,
        avg_order_value_cents = $5,
        days_since_last_activity = $6,
        clv_trend = $7
      WHERE id = $8
    `, [
      clvScore,
      churnRisk,
      segment,
      totalTransactions,
      avgOrderValueCents,
      daysSinceActivity,
      trend,
      customerId
    ]);

    // Record history snapshot (one per day per customer)
    await pool.query(`
      INSERT INTO clv_history (customer_id, clv_score, churn_risk, clv_segment,
        total_transactions, avg_order_value_cents, days_since_last_activity, snapshot_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE)
      ON CONFLICT (customer_id, snapshot_date) DO UPDATE SET
        clv_score = EXCLUDED.clv_score,
        churn_risk = EXCLUDED.churn_risk,
        clv_segment = EXCLUDED.clv_segment,
        total_transactions = EXCLUDED.total_transactions,
        avg_order_value_cents = EXCLUDED.avg_order_value_cents,
        days_since_last_activity = EXCLUDED.days_since_last_activity
    `, [customerId, clvScore, churnRisk, segment, totalTransactions, avgOrderValueCents, daysSinceActivity])
      .catch(err => console.warn(`[CLV Job] History insert failed for customer ${customerId}:`, err.message));
  }

  /**
   * Determine customer segment based on lifetime value
   * @param {number} lifetimeValue - Lifetime value in dollars
   * @returns {string} Segment name
   */
  determineSegment(lifetimeValue) {
    // Thresholds (configurable via env)
    const platinum = parseInt(process.env.CLV_PLATINUM_THRESHOLD) || 50000;
    const gold = parseInt(process.env.CLV_GOLD_THRESHOLD) || 20000;
    const silver = parseInt(process.env.CLV_SILVER_THRESHOLD) || 5000;

    if (lifetimeValue >= platinum) return 'platinum';
    if (lifetimeValue >= gold) return 'gold';
    if (lifetimeValue >= silver) return 'silver';
    return 'bronze';
  }

  /**
   * Determine CLV trend by comparing to previous value
   * @param {number} customerId - Customer ID
   * @param {number} currentValue - Current lifetime value
   * @returns {string} Trend (improving/stable/declining)
   */
  async determineTrend(customerId, currentValue) {
    const result = await pool.query(
      'SELECT clv_score FROM customers WHERE id = $1',
      [customerId]
    );

    if (result.rows.length === 0 || result.rows[0].clv_score === null) {
      return 'stable';
    }

    const previousValue = result.rows[0].clv_score / 100; // Convert from cents
    const changePercent = previousValue > 0
      ? ((currentValue - previousValue) / previousValue) * 100
      : 0;

    if (changePercent > 10) return 'improving';
    if (changePercent < -10) return 'declining';
    return 'stable';
  }

  /**
   * Calculate days since last customer activity
   * @param {number} customerId - Customer ID
   * @returns {number|null} Days since last activity
   */
  async getDaysSinceLastActivity(customerId) {
    const result = await pool.query(`
      SELECT EXTRACT(DAY FROM NOW() - MAX(last_activity)) as days
      FROM (
        SELECT MAX(created_at) as last_activity FROM quotations WHERE customer_id = $1
        UNION ALL
        SELECT MAX(created_at) as last_activity FROM transactions WHERE customer_id = $1
      ) combined
    `, [customerId]);

    return result.rows[0]?.days ? Math.floor(result.rows[0].days) : null;
  }

  /**
   * Get job status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      lastRunStats: this.lastRunStats,
      scheduled: this.cronJob !== null
    };
  }

  /**
   * Run for a single customer (for testing or on-demand)
   * @param {number} customerId - Customer ID
   */
  async runForCustomer(customerId) {
    try {
      await this.calculateAndStoreCustomerCLV(customerId);
      return { success: true, customerId };
    } catch (error) {
      return { success: false, customerId, error: error.message };
    }
  }
}

// Export singleton
module.exports = new CLVCalculationJob();
