/**
 * Marketplace Polling Jobs
 *
 * Automated background jobs for Best Buy Marketplace integration:
 *   1. Order Polling — pull new/updated orders from Mirakl
 *   2. Inventory Batch Sync — push queued stock changes to Best Buy
 *   3. Import Status Check — monitor pending offer/stock imports
 *   4. Order Acceptance Monitor — warn about approaching acceptance deadlines
 *
 * Configuration (environment variables):
 *   MARKETPLACE_POLLING_ENABLED        — master switch (default 'false')
 *   MARKETPLACE_POLL_ORDERS_MINUTES    — order poll frequency (default 15)
 *   MARKETPLACE_POLL_INVENTORY_MINUTES — inventory sync frequency (default 30)
 *   MARKETPLACE_POLL_IMPORTS_MINUTES   — import check frequency (default 10)
 *   MARKETPLACE_POLL_ACCEPTANCE_MINUTES— acceptance monitor frequency (default 5)
 *
 * Usage:
 *   const marketplaceJobs = require('./jobs/marketplaceJobs');
 *   marketplaceJobs.startPolling();
 *   marketplaceJobs.stopPolling();
 *   marketplaceJobs.getPollingStatus();
 *   marketplaceJobs.runJobNow('orders');
 */

const pool = require('../db');
const miraklService = require('../services/miraklService');

const PREFIX = '[MarketplaceJobs]';

// Job state tracking
const jobs = {
  orders: { handle: null, lastRun: null, nextRun: null, lastResult: null, running: false },
  inventory: { handle: null, lastRun: null, nextRun: null, lastResult: null, running: false },
  imports: { handle: null, lastRun: null, nextRun: null, lastResult: null, running: false },
  acceptance: { handle: null, lastRun: null, nextRun: null, lastResult: null, running: false },
};

// Read interval config (minutes → milliseconds)
function getIntervalMs(envVar, defaultMinutes) {
  const minutes = parseInt(process.env[envVar]) || defaultMinutes;
  return minutes * 60 * 1000;
}

// ============================================
// JOB 1: ORDER POLLING
// ============================================

async function jobOrderPoll() {
  if (jobs.orders.running) return;
  jobs.orders.running = true;
  const startTime = Date.now();

  try {
    console.log(`${PREFIX} Polling orders from Mirakl...`);
    const result = await miraklService.pollOrders();

    jobs.orders.lastResult = {
      status: 'success',
      newOrders: result.newOrders,
      updatedOrders: result.updatedOrders,
      totalPolled: result.totalPolled,
      errors: result.errors?.length || 0,
      durationMs: Date.now() - startTime,
    };

    console.log(
      `${PREFIX} Order poll complete: ${result.newOrders} new, ${result.updatedOrders} updated, ${result.totalPolled} total` +
      (result.errors?.length ? ` (${result.errors.length} errors)` : '')
    );
  } catch (err) {
    console.error(`${PREFIX} Order poll FAILED:`, err.message);

    jobs.orders.lastResult = { status: 'failed', error: err.message, durationMs: Date.now() - startTime };

    try {
      await miraklService.logSync('ORDER_POLL', 'order', 'FAILED', {
        direction: 'inbound',
        errorMessage: err.message,
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime,
      });
    } catch (logErr) {
      console.error(`${PREFIX} Failed to log order poll failure:`, logErr.message);
    }
  } finally {
    jobs.orders.running = false;
    jobs.orders.lastRun = new Date();
    const intervalMs = getIntervalMs('MARKETPLACE_POLL_ORDERS_MINUTES', 15);
    jobs.orders.nextRun = new Date(Date.now() + intervalMs);
  }
}

// ============================================
// JOB 2: INVENTORY BATCH SYNC
// ============================================

async function jobInventorySync() {
  if (jobs.inventory.running) return;
  jobs.inventory.running = true;
  const startTime = Date.now();

  try {
    // Check if there are pending items before calling the batch processor
    const pendingResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM marketplace_inventory_queue WHERE synced_at IS NULL`
    );
    const pendingCount = parseInt(pendingResult.rows[0].cnt) || 0;

    if (pendingCount === 0) {
      console.log(`${PREFIX} No pending inventory changes, skipping`);
      jobs.inventory.lastResult = { status: 'skipped', reason: 'queue_empty', durationMs: Date.now() - startTime };
      return;
    }

    console.log(`${PREFIX} Processing ${pendingCount} pending inventory changes...`);
    const result = await miraklService.processInventoryBatch();

    jobs.inventory.lastResult = {
      status: 'success',
      processed: result.processed,
      importId: result.importId || null,
      durationMs: Date.now() - startTime,
    };

    // Log to sync_log
    try {
      await miraklService.logSync('INVENTORY_BATCH', 'inventory', 'SUCCESS', {
        direction: 'outbound',
        recordsProcessed: result.processed,
        recordsSucceeded: result.processed,
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime,
      });
    } catch (logErr) {
      console.error(`${PREFIX} Failed to log inventory sync:`, logErr.message);
    }

    console.log(`${PREFIX} Inventory batch sync complete: ${result.processed} products pushed`);
  } catch (err) {
    console.error(`${PREFIX} Inventory batch sync FAILED:`, err.message);

    jobs.inventory.lastResult = { status: 'failed', error: err.message, durationMs: Date.now() - startTime };

    try {
      await miraklService.logSync('INVENTORY_BATCH', 'inventory', 'FAILED', {
        direction: 'outbound',
        errorMessage: err.message,
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime,
      });
    } catch (logErr) {
      console.error(`${PREFIX} Failed to log inventory sync failure:`, logErr.message);
    }
  } finally {
    jobs.inventory.running = false;
    jobs.inventory.lastRun = new Date();
    const intervalMs = getIntervalMs('MARKETPLACE_POLL_INVENTORY_MINUTES', 30);
    jobs.inventory.nextRun = new Date(Date.now() + intervalMs);
  }
}

// ============================================
// JOB 3: IMPORT STATUS CHECK
// ============================================

async function jobImportStatusCheck() {
  if (jobs.imports.running) return;
  jobs.imports.running = true;
  const startTime = Date.now();

  try {
    // Find pending imports
    const pendingImports = await pool.query(`
      SELECT id, mirakl_import_id, import_type, status, submitted_at
      FROM marketplace_offer_imports
      WHERE status IN ('QUEUED', 'PROCESSING')
      ORDER BY submitted_at ASC
    `);

    if (pendingImports.rows.length === 0) {
      jobs.imports.lastResult = { status: 'skipped', reason: 'no_pending_imports', durationMs: Date.now() - startTime };
      return;
    }

    console.log(`${PREFIX} Checking ${pendingImports.rows.length} pending imports...`);

    let checked = 0;
    let completed = 0;
    let errors = 0;

    for (const imp of pendingImports.rows) {
      try {
        const result = await miraklService.checkImportStatus(imp.mirakl_import_id);
        checked++;

        if (result.status === 'COMPLETE' || result.status === 'COMPLETED') {
          completed++;
          console.log(`${PREFIX} Import ${imp.mirakl_import_id} (${imp.import_type}): COMPLETE`);
        } else {
          console.log(`${PREFIX} Import ${imp.mirakl_import_id} (${imp.import_type}): ${result.status}`);
        }
      } catch (err) {
        errors++;
        console.error(`${PREFIX} Failed to check import ${imp.mirakl_import_id}:`, err.message);
      }
    }

    jobs.imports.lastResult = {
      status: 'success',
      checked,
      completed,
      errors,
      durationMs: Date.now() - startTime,
    };

    console.log(`${PREFIX} Import status check done: ${checked} checked, ${completed} completed, ${errors} errors`);
  } catch (err) {
    console.error(`${PREFIX} Import status check FAILED:`, err.message);
    jobs.imports.lastResult = { status: 'failed', error: err.message, durationMs: Date.now() - startTime };
  } finally {
    jobs.imports.running = false;
    jobs.imports.lastRun = new Date();
    const intervalMs = getIntervalMs('MARKETPLACE_POLL_IMPORTS_MINUTES', 10);
    jobs.imports.nextRun = new Date(Date.now() + intervalMs);
  }
}

// ============================================
// JOB 4: ORDER ACCEPTANCE MONITOR
// ============================================

async function jobAcceptanceMonitor() {
  if (jobs.acceptance.running) return;
  jobs.acceptance.running = true;
  const startTime = Date.now();

  try {
    const result = await pool.query(`
      SELECT
        id, mirakl_order_id, total_price_cents,
        acceptance_deadline,
        EXTRACT(EPOCH FROM (acceptance_deadline - NOW())) / 60 as minutes_remaining
      FROM marketplace_orders
      WHERE mirakl_order_state = 'WAITING_ACCEPTANCE'
        AND acceptance_deadline IS NOT NULL
      ORDER BY acceptance_deadline ASC
    `);

    const orders = result.rows;
    let critical = 0;
    let warning = 0;

    for (const order of orders) {
      const minsLeft = parseFloat(order.minutes_remaining);

      if (minsLeft < 30) {
        critical++;
        console.error(
          `${PREFIX} CRITICAL: Order ${order.mirakl_order_id} acceptance deadline in ${Math.round(minsLeft)} minutes — will auto-reject`
        );
      } else if (minsLeft < 120) {
        warning++;
        const hoursLeft = (minsLeft / 60).toFixed(1);
        console.warn(
          `${PREFIX} WARNING: Order ${order.mirakl_order_id} acceptance deadline in ${hoursLeft} hours`
        );
      }
    }

    jobs.acceptance.lastResult = {
      status: 'success',
      totalWaiting: orders.length,
      critical,
      warning,
      durationMs: Date.now() - startTime,
    };

    if (critical > 0 || warning > 0) {
      console.log(`${PREFIX} Acceptance monitor: ${orders.length} waiting, ${critical} critical, ${warning} warning`);
    }
  } catch (err) {
    console.error(`${PREFIX} Acceptance monitor FAILED:`, err.message);
    jobs.acceptance.lastResult = { status: 'failed', error: err.message, durationMs: Date.now() - startTime };
  } finally {
    jobs.acceptance.running = false;
    jobs.acceptance.lastRun = new Date();
    const intervalMs = getIntervalMs('MARKETPLACE_POLL_ACCEPTANCE_MINUTES', 5);
    jobs.acceptance.nextRun = new Date(Date.now() + intervalMs);
  }
}

// ============================================
// CONTROL API
// ============================================

const JOB_MAP = {
  orders: jobOrderPoll,
  inventory: jobInventorySync,
  imports: jobImportStatusCheck,
  acceptance: jobAcceptanceMonitor,
};

const INTERVAL_ENV = {
  orders: { env: 'MARKETPLACE_POLL_ORDERS_MINUTES', default: 15 },
  inventory: { env: 'MARKETPLACE_POLL_INVENTORY_MINUTES', default: 30 },
  imports: { env: 'MARKETPLACE_POLL_IMPORTS_MINUTES', default: 10 },
  acceptance: { env: 'MARKETPLACE_POLL_ACCEPTANCE_MINUTES', default: 5 },
};

/**
 * Start all polling jobs.
 * @returns {object} Job handles
 */
function startPolling() {
  console.log(`${PREFIX} Starting marketplace polling engine...`);

  for (const [name, config] of Object.entries(INTERVAL_ENV)) {
    const intervalMs = getIntervalMs(config.env, config.default);
    const minutes = intervalMs / 60000;
    const fn = JOB_MAP[name];

    // Run immediately on startup, then at interval
    jobs[name].nextRun = new Date(Date.now() + intervalMs);
    jobs[name].handle = setInterval(fn, intervalMs);

    console.log(`${PREFIX}   ${name}: every ${minutes} min`);

    // Stagger initial runs to avoid thundering herd (offset by job index * 10s)
    const staggerMs = Object.keys(INTERVAL_ENV).indexOf(name) * 10000;
    setTimeout(fn, staggerMs);
  }

  console.log(`${PREFIX} All 4 jobs started`);
  return jobs;
}

/**
 * Stop all polling jobs.
 */
function stopPolling() {
  console.log(`${PREFIX} Stopping all marketplace polling jobs...`);

  for (const [name, job] of Object.entries(jobs)) {
    if (job.handle) {
      clearInterval(job.handle);
      job.handle = null;
      job.nextRun = null;
      console.log(`${PREFIX}   Stopped: ${name}`);
    }
  }
}

/**
 * Get current polling status.
 * @returns {object} Status of all jobs
 */
function getPollingStatus() {
  const enabled = process.env.MARKETPLACE_POLLING_ENABLED === 'true';

  const jobStatuses = Object.entries(INTERVAL_ENV).map(([name, config]) => ({
    name,
    intervalMinutes: parseInt(process.env[config.env]) || config.default,
    active: !!jobs[name].handle,
    running: jobs[name].running,
    lastRun: jobs[name].lastRun,
    nextRun: jobs[name].nextRun,
    lastResult: jobs[name].lastResult,
  }));

  return { enabled, jobs: jobStatuses };
}

/**
 * Manually trigger a specific job.
 * @param {string} jobName - 'orders', 'inventory', 'imports', or 'acceptance'
 * @returns {Promise} Job result
 */
async function runJobNow(jobName) {
  const fn = JOB_MAP[jobName];
  if (!fn) {
    throw new Error(`Unknown job: ${jobName}. Valid: ${Object.keys(JOB_MAP).join(', ')}`);
  }

  if (jobs[jobName].running) {
    throw new Error(`Job '${jobName}' is already running`);
  }

  console.log(`${PREFIX} Manually triggering job: ${jobName}`);
  await fn();
  return jobs[jobName].lastResult;
}

module.exports = {
  startPolling,
  stopPolling,
  getPollingStatus,
  runJobNow,
};
