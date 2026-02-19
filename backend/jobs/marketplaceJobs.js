/**
 * Marketplace Polling Jobs
 *
 * Automated background jobs for marketplace integration:
 *   1. Order Polling — pull new/updated orders from ALL active channels
 *   2. Inventory Batch Sync — push queued stock changes per channel
 *   3. Import Status Check — monitor pending offer/stock imports across channels
 *   4. Order Acceptance Monitor — warn about approaching acceptance deadlines
 *   5. Listing Health Scan — scan channel listings for quality issues
 *   6. Return Polling — poll and auto-process marketplace returns
 *   7. Message Polling — poll customer messages from all channels
 *   8. Daily Summary Report — generate previous day's sales summary (default 1440 min / 24h)
 *
 * Configuration (environment variables):
 *   MARKETPLACE_POLLING_ENABLED        — master switch (default 'false')
 *   MARKETPLACE_POLL_ORDERS_MINUTES    — order poll frequency (default 15)
 *   MARKETPLACE_POLL_INVENTORY_MINUTES — inventory sync frequency (default 30)
 *   MARKETPLACE_POLL_IMPORTS_MINUTES   — import check frequency (default 10)
 *   MARKETPLACE_POLL_ACCEPTANCE_MINUTES— acceptance monitor frequency (default 5)
 *   MARKETPLACE_POLL_HEALTH_MINUTES    — listing health scan frequency (default 360)
 *   MARKETPLACE_POLL_RETURNS_MINUTES   — return polling frequency (default 30)
 *   MARKETPLACE_POLL_MESSAGES_MINUTES  — message polling frequency (default 15)
 *   MARKETPLACE_POLL_DAILY_SUMMARY_MINUTES — daily summary frequency (default 1440)
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
const { getInstance: getChannelManager } = require('../services/ChannelManager');
const listingHealthMonitor = require('../services/ListingHealthMonitor');
const returnsManager = require('../services/ReturnsManager');
const messagingHub = require('../services/MessagingHub');
const reportGenerator = require('../services/ReportGenerator');

const PREFIX = '[MarketplaceJobs]';

// Job state tracking
const jobs = {
  orders: { handle: null, lastRun: null, nextRun: null, lastResult: null, running: false },
  inventory: { handle: null, lastRun: null, nextRun: null, lastResult: null, running: false },
  imports: { handle: null, lastRun: null, nextRun: null, lastResult: null, running: false },
  acceptance: { handle: null, lastRun: null, nextRun: null, lastResult: null, running: false },
  healthScan: { handle: null, lastRun: null, nextRun: null, lastResult: null, running: false },
  returns: { handle: null, lastRun: null, nextRun: null, lastResult: null, running: false },
  messages: { handle: null, lastRun: null, nextRun: null, lastResult: null, running: false },
  dailySummary: { handle: null, lastRun: null, nextRun: null, lastResult: null, running: false },
};

// Read interval config (minutes → milliseconds)
function getIntervalMs(envVar, defaultMinutes) {
  const minutes = parseInt(process.env[envVar]) || defaultMinutes;
  return minutes * 60 * 1000;
}

/**
 * Try to get the ChannelManager. Returns null if not available.
 * Graceful degradation — jobs fall back to legacy miraklService.
 */
async function tryGetManager() {
  try {
    return await getChannelManager();
  } catch (err) {
    console.warn(`${PREFIX} ChannelManager unavailable, using legacy path:`, err.message);
    return null;
  }
}

// ============================================
// JOB 1: ORDER POLLING (all active channels)
// ============================================

async function jobOrderPoll() {
  if (jobs.orders.running) return;
  jobs.orders.running = true;
  const startTime = Date.now();

  try {
    const manager = await tryGetManager();

    if (manager && manager.getAllAdapters().length > 0) {
      // Multi-channel path
      console.log(`${PREFIX} Polling orders from ${manager.getAllAdapters().length} active channel(s)...`);
      const results = await manager.pollAllOrders();

      let totalNew = 0, totalUpdated = 0, totalPolled = 0, totalErrors = 0;
      const perChannel = [];

      for (const r of results) {
        if (r.error) {
          totalErrors++;
          console.error(`${PREFIX}   ${r.channelCode}: FAILED — ${r.error}`);
          perChannel.push({ channel: r.channelCode, status: 'failed', error: r.error });
        } else {
          totalNew += r.newOrders || 0;
          totalUpdated += r.updatedOrders || 0;
          totalPolled += r.totalPolled || 0;
          totalErrors += r.errors?.length || 0;
          console.log(
            `${PREFIX}   ${r.channelCode}: ${r.newOrders} new, ${r.updatedOrders} updated, ${r.totalPolled} total` +
            (r.errors?.length ? ` (${r.errors.length} errors)` : '')
          );
          perChannel.push({
            channel: r.channelCode,
            status: 'success',
            newOrders: r.newOrders,
            updatedOrders: r.updatedOrders,
            totalPolled: r.totalPolled
          });
        }
      }

      jobs.orders.lastResult = {
        status: totalErrors > 0 && totalPolled === 0 ? 'failed' : totalErrors > 0 ? 'partial' : 'success',
        newOrders: totalNew,
        updatedOrders: totalUpdated,
        totalPolled,
        errors: totalErrors,
        channels: perChannel,
        durationMs: Date.now() - startTime,
      };

      console.log(
        `${PREFIX} Order poll complete: ${totalNew} new, ${totalUpdated} updated across ${results.length} channel(s)`
      );
    } else {
      // Legacy single-channel path (Best Buy via miraklService)
      console.log(`${PREFIX} Polling orders from Mirakl (legacy)...`);
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
    }
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
// JOB 2: INVENTORY BATCH SYNC (per channel)
// ============================================

async function jobInventorySync() {
  if (jobs.inventory.running) return;
  jobs.inventory.running = true;
  const startTime = Date.now();

  try {
    const manager = await tryGetManager();

    if (manager && manager.getAllAdapters().length > 0) {
      // Group pending queue entries by channel_id
      const pendingByChannel = await pool.query(`
        SELECT
          COALESCE(q.channel_id, (SELECT id FROM marketplace_channels WHERE status = 'ACTIVE' ORDER BY id LIMIT 1)) AS channel_id,
          COUNT(*) AS cnt
        FROM marketplace_inventory_queue q
        WHERE q.synced_at IS NULL
        GROUP BY 1
      `);

      if (pendingByChannel.rows.length === 0 || pendingByChannel.rows.every(r => parseInt(r.cnt) === 0)) {
        console.log(`${PREFIX} No pending inventory changes, skipping`);
        jobs.inventory.lastResult = { status: 'skipped', reason: 'queue_empty', durationMs: Date.now() - startTime };
        return;
      }

      let totalProcessed = 0;
      const perChannel = [];

      for (const row of pendingByChannel.rows) {
        const channelId = parseInt(row.channel_id);
        const count = parseInt(row.cnt);
        if (!channelId || count === 0) continue;

        try {
          const adapter = manager.getAdapter(channelId);
          console.log(`${PREFIX}   ${adapter.channelCode}: processing ${count} queued changes...`);
          const result = await adapter.processInventoryBatch();
          const processed = result.submitted || result.processed || 0;
          totalProcessed += processed;
          perChannel.push({ channel: adapter.channelCode, channelId, processed, importId: result.importId });
          console.log(`${PREFIX}   ${adapter.channelCode}: pushed ${processed} stock updates`);
        } catch (err) {
          console.error(`${PREFIX}   Channel ${channelId}: inventory sync failed — ${err.message}`);
          perChannel.push({ channelId, error: err.message });
        }
      }

      jobs.inventory.lastResult = {
        status: perChannel.some(c => c.error) ? 'partial' : 'success',
        processed: totalProcessed,
        channels: perChannel,
        durationMs: Date.now() - startTime,
      };

      console.log(`${PREFIX} Inventory batch sync complete: ${totalProcessed} products across ${perChannel.length} channel(s)`);
    } else {
      // Legacy single-channel path
      const pendingResult = await pool.query(
        `SELECT COUNT(*) as cnt FROM marketplace_inventory_queue WHERE synced_at IS NULL`
      );
      const pendingCount = parseInt(pendingResult.rows[0].cnt) || 0;

      if (pendingCount === 0) {
        console.log(`${PREFIX} No pending inventory changes, skipping`);
        jobs.inventory.lastResult = { status: 'skipped', reason: 'queue_empty', durationMs: Date.now() - startTime };
        return;
      }

      console.log(`${PREFIX} Processing ${pendingCount} pending inventory changes (legacy)...`);
      const result = await miraklService.processInventoryBatch();

      jobs.inventory.lastResult = {
        status: 'success',
        processed: result.processed,
        importId: result.importId || null,
        durationMs: Date.now() - startTime,
      };

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
    }
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
// JOB 3: IMPORT STATUS CHECK (across channels)
// ============================================

async function jobImportStatusCheck() {
  if (jobs.imports.running) return;
  jobs.imports.running = true;
  const startTime = Date.now();

  try {
    // Find pending imports (include channel_id for routing)
    const pendingImports = await pool.query(`
      SELECT import_id, mirakl_import_id, import_type, status, submitted_at, channel_id
      FROM marketplace_offer_imports
      WHERE status IN ('QUEUED', 'PROCESSING', 'SUBMITTED')
      ORDER BY submitted_at ASC
    `);

    if (pendingImports.rows.length === 0) {
      jobs.imports.lastResult = { status: 'skipped', reason: 'no_pending_imports', durationMs: Date.now() - startTime };
      return;
    }

    console.log(`${PREFIX} Checking ${pendingImports.rows.length} pending imports...`);

    const manager = await tryGetManager();
    let checked = 0;
    let completed = 0;
    let errors = 0;

    for (const imp of pendingImports.rows) {
      try {
        let result;

        // Route to the correct adapter by channel_id
        if (imp.channel_id && manager) {
          try {
            const adapter = manager.getAdapter(imp.channel_id);
            result = await adapter.checkImportStatus(imp.mirakl_import_id);
          } catch (adapterErr) {
            // Adapter not loaded for this channel — fall back to legacy
            result = await miraklService.checkImportStatus(imp.mirakl_import_id);
          }
        } else {
          result = await miraklService.checkImportStatus(imp.mirakl_import_id);
        }

        checked++;

        if (result.status === 'COMPLETE' || result.status === 'COMPLETED') {
          completed++;
          console.log(`${PREFIX}   Import ${imp.mirakl_import_id} (${imp.import_type}): COMPLETE`);
        } else {
          console.log(`${PREFIX}   Import ${imp.mirakl_import_id} (${imp.import_type}): ${result.status}`);
        }
      } catch (err) {
        errors++;
        console.error(`${PREFIX}   Failed to check import ${imp.mirakl_import_id}:`, err.message);
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
    // Works cross-channel already — orders have channel_id, we query all
    const result = await pool.query(`
      SELECT
        mo.id, mo.mirakl_order_id, mo.total_price_cents,
        mo.acceptance_deadline, mo.channel_id,
        mc.channel_code,
        EXTRACT(EPOCH FROM (mo.acceptance_deadline - NOW())) / 60 as minutes_remaining
      FROM marketplace_orders mo
      LEFT JOIN marketplace_channels mc ON mc.id = mo.channel_id
      WHERE mo.mirakl_order_state = 'WAITING_ACCEPTANCE'
        AND mo.acceptance_deadline IS NOT NULL
      ORDER BY mo.acceptance_deadline ASC
    `);

    const orders = result.rows;
    let critical = 0;
    let warning = 0;

    for (const order of orders) {
      const minsLeft = parseFloat(order.minutes_remaining);
      const channelLabel = order.channel_code ? ` [${order.channel_code}]` : '';

      if (minsLeft < 30) {
        critical++;
        console.error(
          `${PREFIX} CRITICAL:${channelLabel} Order ${order.mirakl_order_id} acceptance deadline in ${Math.round(minsLeft)} minutes — will auto-reject`
        );
      } else if (minsLeft < 120) {
        warning++;
        const hoursLeft = (minsLeft / 60).toFixed(1);
        console.warn(
          `${PREFIX} WARNING:${channelLabel} Order ${order.mirakl_order_id} acceptance deadline in ${hoursLeft} hours`
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
// JOB 5: LISTING HEALTH SCAN (all channels)
// ============================================

async function jobHealthScan() {
  if (jobs.healthScan.running) return;
  jobs.healthScan.running = true;
  const startTime = Date.now();

  try {
    // Get all active channels
    const { rows: channels } = await pool.query(
      `SELECT id, channel_code FROM marketplace_channels WHERE status = 'ACTIVE' ORDER BY id`
    );

    if (channels.length === 0) {
      console.log(`${PREFIX} No active channels for health scan, skipping`);
      jobs.healthScan.lastResult = { status: 'skipped', reason: 'no_active_channels', durationMs: Date.now() - startTime };
      return;
    }

    console.log(`${PREFIX} Running listing health scan across ${channels.length} channel(s)...`);

    let totalIssues = 0;
    let totalFixed = 0;
    const perChannel = [];

    for (const channel of channels) {
      try {
        const result = await listingHealthMonitor.scanChannel(channel.id);
        totalIssues += result.issuesFound || 0;
        totalFixed += result.issuesResolved || 0;
        perChannel.push({
          channel: channel.channel_code,
          channelId: channel.id,
          issuesFound: result.issuesFound,
          issuesResolved: result.issuesResolved,
          scanned: result.scanned
        });
        console.log(
          `${PREFIX}   ${channel.channel_code}: scanned ${result.scanned} listings, ${result.issuesFound} issues found, ${result.issuesResolved} resolved`
        );
      } catch (err) {
        console.error(`${PREFIX}   ${channel.channel_code}: health scan failed — ${err.message}`);
        perChannel.push({ channel: channel.channel_code, channelId: channel.id, error: err.message });
      }
    }

    jobs.healthScan.lastResult = {
      status: perChannel.some(c => c.error) ? 'partial' : 'success',
      totalIssues,
      totalFixed,
      channels: perChannel,
      durationMs: Date.now() - startTime,
    };

    console.log(`${PREFIX} Health scan complete: ${totalIssues} issues found, ${totalFixed} resolved across ${channels.length} channel(s)`);
  } catch (err) {
    console.error(`${PREFIX} Health scan FAILED:`, err.message);
    jobs.healthScan.lastResult = { status: 'failed', error: err.message, durationMs: Date.now() - startTime };
  } finally {
    jobs.healthScan.running = false;
    jobs.healthScan.lastRun = new Date();
    const intervalMs = getIntervalMs('MARKETPLACE_POLL_HEALTH_MINUTES', 360);
    jobs.healthScan.nextRun = new Date(Date.now() + intervalMs);
  }
}

// ============================================
// JOB 6: RETURN POLLING (all channels)
// ============================================

async function jobReturnPoll() {
  if (jobs.returns.running) return;
  jobs.returns.running = true;
  const startTime = Date.now();

  try {
    const manager = await tryGetManager();

    if (!manager || manager.getAllAdapters().length === 0) {
      console.log(`${PREFIX} No active channel adapters for return polling, skipping`);
      jobs.returns.lastResult = { status: 'skipped', reason: 'no_adapters', durationMs: Date.now() - startTime };
      return;
    }

    const adapters = manager.getAllAdapters();
    console.log(`${PREFIX} Polling returns from ${adapters.length} active channel(s)...`);

    let totalNew = 0;
    let totalProcessed = 0;
    let totalErrors = 0;
    const perChannel = [];

    for (const adapter of adapters) {
      try {
        // Poll returns from channel adapter
        const returns = await adapter.pollReturns({ since: jobs.returns.lastRun || undefined });

        let channelNew = 0;
        let channelProcessed = 0;

        for (const ret of returns) {
          try {
            const result = await returnsManager.processReturn(ret, adapter.channelId);
            channelProcessed++;
            if (result.isNew) channelNew++;
          } catch (err) {
            totalErrors++;
            console.error(`${PREFIX}   ${adapter.channelCode}: failed to process return ${ret.returnId}: ${err.message}`);
          }
        }

        totalNew += channelNew;
        totalProcessed += channelProcessed;
        perChannel.push({
          channel: adapter.channelCode,
          channelId: adapter.channelId,
          polled: returns.length,
          newReturns: channelNew,
          processed: channelProcessed
        });

        console.log(
          `${PREFIX}   ${adapter.channelCode}: ${returns.length} polled, ${channelNew} new, ${channelProcessed} processed`
        );
      } catch (err) {
        totalErrors++;
        console.error(`${PREFIX}   ${adapter.channelCode}: return poll failed — ${err.message}`);
        perChannel.push({ channel: adapter.channelCode, channelId: adapter.channelId, error: err.message });
      }
    }

    jobs.returns.lastResult = {
      status: totalErrors > 0 && totalProcessed === 0 ? 'failed' : totalErrors > 0 ? 'partial' : 'success',
      newReturns: totalNew,
      processed: totalProcessed,
      errors: totalErrors,
      channels: perChannel,
      durationMs: Date.now() - startTime,
    };

    console.log(
      `${PREFIX} Return poll complete: ${totalNew} new, ${totalProcessed} processed across ${adapters.length} channel(s)`
    );
  } catch (err) {
    console.error(`${PREFIX} Return poll FAILED:`, err.message);
    jobs.returns.lastResult = { status: 'failed', error: err.message, durationMs: Date.now() - startTime };
  } finally {
    jobs.returns.running = false;
    jobs.returns.lastRun = new Date();
    const intervalMs = getIntervalMs('MARKETPLACE_POLL_RETURNS_MINUTES', 30);
    jobs.returns.nextRun = new Date(Date.now() + intervalMs);
  }
}

// ============================================
// JOB 7: MESSAGE POLLING (all channels)
// ============================================

async function jobMessagePoll() {
  if (jobs.messages.running) return;
  jobs.messages.running = true;
  const startTime = Date.now();

  try {
    const manager = await tryGetManager();

    if (!manager || manager.getAllAdapters().length === 0) {
      console.log(`${PREFIX} No active channel adapters for message polling, skipping`);
      jobs.messages.lastResult = { status: 'skipped', reason: 'no_adapters', durationMs: Date.now() - startTime };
      return;
    }

    const adapters = manager.getAllAdapters();
    console.log(`${PREFIX} Polling messages from ${adapters.length} active channel(s)...`);

    let totalNew = 0;
    let totalPolled = 0;
    const perChannel = [];

    for (const adapter of adapters) {
      try {
        const result = await messagingHub.pollMessages(adapter.channelId);
        totalNew += result.newMessages;
        totalPolled += result.totalPolled;
        perChannel.push({
          channel: adapter.channelCode,
          channelId: adapter.channelId,
          newMessages: result.newMessages,
          totalPolled: result.totalPolled
        });
      } catch (err) {
        console.error(`${PREFIX}   ${adapter.channelCode}: message poll failed — ${err.message}`);
        perChannel.push({ channel: adapter.channelCode, channelId: adapter.channelId, error: err.message });
      }
    }

    jobs.messages.lastResult = {
      status: perChannel.some(c => c.error) ? 'partial' : 'success',
      newMessages: totalNew,
      totalPolled,
      channels: perChannel,
      durationMs: Date.now() - startTime,
    };

    console.log(
      `${PREFIX} Message poll complete: ${totalNew} new messages, ${totalPolled} threads across ${adapters.length} channel(s)`
    );
  } catch (err) {
    console.error(`${PREFIX} Message poll FAILED:`, err.message);
    jobs.messages.lastResult = { status: 'failed', error: err.message, durationMs: Date.now() - startTime };
  } finally {
    jobs.messages.running = false;
    jobs.messages.lastRun = new Date();
    const intervalMs = getIntervalMs('MARKETPLACE_POLL_MESSAGES_MINUTES', 15);
    jobs.messages.nextRun = new Date(Date.now() + intervalMs);
  }
}

// ============================================
// JOB 8: DAILY SUMMARY REPORT (runs at 7 AM interval-based)
// ============================================

async function jobDailySummary() {
  if (jobs.dailySummary.running) return;
  jobs.dailySummary.running = true;
  const startTime = Date.now();

  try {
    // Generate yesterday's summary (the completed day)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const report = await reportGenerator.generateDailySummary(yesterday);

    const summary = {
      date: report.date,
      orders: report.totals.order_count,
      revenue: report.totals.gross_revenue,
      netRevenue: report.totals.net_revenue,
      channels: report.byChannel.length,
      topProduct: report.topProducts.length > 0 ? report.topProducts[0].sku : null,
      returns: report.returns.count,
      issues: report.issues,
    };

    console.log(
      `${PREFIX} Daily summary for ${report.date}: $${report.totals.gross_revenue} gross, ` +
      `${report.totals.order_count} orders, ${report.byChannel.length} channels`
    );

    // TODO: Wire up email delivery here when email service is available
    // await emailService.sendDailySummary(report);

    jobs.dailySummary.lastResult = {
      status: 'success',
      summary,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    console.error(`${PREFIX} Daily summary FAILED:`, err.message);
    jobs.dailySummary.lastResult = { status: 'failed', error: err.message, durationMs: Date.now() - startTime };
  } finally {
    jobs.dailySummary.running = false;
    jobs.dailySummary.lastRun = new Date();
    const intervalMs = getIntervalMs('MARKETPLACE_POLL_DAILY_SUMMARY_MINUTES', 1440);
    jobs.dailySummary.nextRun = new Date(Date.now() + intervalMs);
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
  healthScan: jobHealthScan,
  returns: jobReturnPoll,
  messages: jobMessagePoll,
  dailySummary: jobDailySummary,
};

const INTERVAL_ENV = {
  orders: { env: 'MARKETPLACE_POLL_ORDERS_MINUTES', default: 15 },
  inventory: { env: 'MARKETPLACE_POLL_INVENTORY_MINUTES', default: 30 },
  imports: { env: 'MARKETPLACE_POLL_IMPORTS_MINUTES', default: 10 },
  acceptance: { env: 'MARKETPLACE_POLL_ACCEPTANCE_MINUTES', default: 5 },
  healthScan: { env: 'MARKETPLACE_POLL_HEALTH_MINUTES', default: 360 },
  returns: { env: 'MARKETPLACE_POLL_RETURNS_MINUTES', default: 30 },
  messages: { env: 'MARKETPLACE_POLL_MESSAGES_MINUTES', default: 15 },
  dailySummary: { env: 'MARKETPLACE_POLL_DAILY_SUMMARY_MINUTES', default: 1440 },
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

  console.log(`${PREFIX} All 8 jobs started`);
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
 * Get current polling status with per-channel info.
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

  // Gather per-channel sync times (non-blocking — use cached data from lastResult)
  const channelSyncs = jobs.orders.lastResult?.channels || [];

  return { enabled, jobs: jobStatuses, channelSyncs };
}

/**
 * Get extended status including live per-channel last_sync_at from DB.
 * Async version — call when you need fresh data.
 */
async function getPollingStatusExtended() {
  const base = getPollingStatus();

  try {
    const { rows } = await pool.query(`
      SELECT id, channel_code, channel_name, status, last_sync_at
      FROM marketplace_channels
      ORDER BY channel_name
    `);
    base.channels = rows;
  } catch (_) {
    base.channels = [];
  }

  return base;
}

/**
 * Manually trigger a specific job.
 * @param {string} jobName - 'orders', 'inventory', 'imports', 'acceptance', 'healthScan', 'returns', or 'messages'
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
  getPollingStatusExtended,
  runJobNow,
};
