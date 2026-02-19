'use strict';

/**
 * SkulyticsSyncService.js
 *
 * Orchestrates incremental (and future full) product syncs from the
 * Skulytics catalogue API into global_skulytics_products.
 *
 * Responsibilities:
 *   - Cursor-based pagination with crash-safe resume
 *   - Per-SKU normalize → upsert → log pipeline
 *   - Exponential backoff + jitter for 429 / 5xx
 *   - Consecutive-failure escalation
 *   - Stale-product marking after full syncs
 */

const pool = require('../../db');
const { SkulyticsApiClient, SkulyticsRateLimitError, SkulyticsUnavailableError, SkulyticsApiError } = require('./SkulyticsApiClient');
const { normalize } = require('./normalizers');
const { skulyticsUpsert } = require('./skulyticsUpsert');

// ── Constants ───────────────────────────────────────────────

const PAGE_SIZE               = 100;
const MAX_RETRY_ATTEMPTS      = 5;
const BASE_RETRY_MS           = 1_000;
const MAX_RETRY_MS            = 60_000;
const RATE_LIMIT_FLOOR        = 10;   // pause when remaining < this
const CONSECUTIVE_FAIL_LIMIT  = 3;
const STALE_THRESHOLD_HOURS   = 36;

// ── Helpers ─────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Exponential backoff with full jitter.
 * @param {number} attempt  - 0-based attempt index
 * @returns {number} milliseconds to wait
 */
function backoffWithJitter(attempt) {
  const exponential = Math.min(BASE_RETRY_MS * 2 ** attempt, MAX_RETRY_MS);
  return Math.floor(Math.random() * exponential);
}

/**
 * Decide whether an error is retryable.
 * Retryable: 429, 5xx, network errors.
 * NOT retryable: 4xx other than 429.
 */
function isRetryable(err) {
  if (err instanceof SkulyticsRateLimitError) return true;
  if (err instanceof SkulyticsUnavailableError) return true;
  if (err instanceof SkulyticsApiError) {
    return err.statusCode != null && err.statusCode >= 500;
  }
  // Network/timeout errors (no statusCode)
  if (!err.statusCode && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT')) return true;
  return false;
}

// ── Stub: notification service ──────────────────────────────
// TODO: replace with real NotificationService integration

const notificationService = {
  async sendAdminAlert({ subject, body }) {
    console.error(`[SkulyticsSync] ADMIN ALERT — ${subject}: ${body}`);
  },
};

// ── Service ─────────────────────────────────────────────────

class SkulyticsSyncService {
  /**
   * @param {Object} [deps] — dependency injection for testing
   * @param {import('pg').Pool}            [deps.pool]
   * @param {SkulyticsApiClient}           [deps.apiClient]
   * @param {Object}                       [deps.notificationService]
   */
  constructor(deps = {}) {
    this.pool    = deps.pool    || pool;
    this.api     = deps.apiClient || new SkulyticsApiClient();
    this.notifier = deps.notificationService || notificationService;
  }

  // ── Sync run lifecycle ──────────────────────────────────────

  /**
   * Insert a new sync-run record.
   *
   * @param {'full'|'incremental'|'manual_sku'} runType
   * @param {string} triggeredBy - e.g. "cron", "admin:user@example.com"
   * @returns {Promise<Object>} the inserted row
   */
  async createSyncRun(runType, triggeredBy) {
    const { rows } = await this.pool.query(
      `INSERT INTO skulytics_sync_runs
         (run_type, status, triggered_by)
       VALUES ($1, 'running', $2)
       RETURNING *`,
      [runType, triggeredBy]
    );
    return rows[0];
  }

  /**
   * Finalise a sync-run record.
   *
   * @param {string} runId
   * @param {'completed'|'failed'|'partial'} status
   * @param {string|null} [errorMessage]
   * @param {Object} [counters]
   */
  async completeSyncRun(runId, status, errorMessage = null, counters = {}) {
    await this.pool.query(
      `UPDATE skulytics_sync_runs SET
         status             = $2,
         error_message      = $3,
         completed_at       = NOW(),
         processed          = COALESCE($4, processed),
         created            = COALESCE($5, created),
         updated            = COALESCE($6, updated),
         discontinued       = COALESCE($7, discontinued),
         failed             = COALESCE($8, failed),
         error_count        = COALESCE($9, error_count),
         rate_limit_hits    = COALESCE($10, rate_limit_hits)
       WHERE id = $1`,
      [
        runId,
        status,
        errorMessage,
        counters.processed   ?? null,
        counters.created     ?? null,
        counters.updated     ?? null,
        counters.discontinued ?? null,
        counters.failed      ?? null,
        counters.errorCount  ?? null,
        counters.rateLimitHits ?? null,
      ]
    );
  }

  /**
   * Persist page number + interim counters on the sync-run row (crash-safe resume).
   * Stores the page number as a string in the api_cursor column.
   */
  async _persistCursor(runId, cursor, counters) {
    await this.pool.query(
      `UPDATE skulytics_sync_runs SET
         api_cursor          = $2,
         last_successful_sku = $3,
         processed           = $4,
         created             = $5,
         updated             = $6,
         failed              = $7,
         rate_limit_hits     = $8
       WHERE id = $1`,
      [
        runId,
        cursor,
        counters.lastSku || null,
        counters.processed,
        counters.created,
        counters.updated,
        counters.failed,
        counters.rateLimitHits,
      ]
    );
  }

  // ── Cursor resume ───────────────────────────────────────────

  /**
   * Load the api_cursor from the most recently completed sync run,
   * so an incremental sync resumes where the last one left off.
   * The cursor may be an opaque string or a page number string.
   *
   * @returns {Promise<string|null>}
   */
  async _loadLastCursor() {
    const { rows } = await this.pool.query(
      `SELECT api_cursor
       FROM skulytics_sync_runs
       WHERE status = 'completed' AND run_type IN ('full', 'incremental')
       ORDER BY completed_at DESC
       LIMIT 1`
    );
    return rows[0]?.api_cursor ?? null;
  }

  // ── Per-SKU pipeline ────────────────────────────────────────

  /**
   * Normalize → upsert → log a single raw API product.
   *
   * @param {Object}  rawProduct
   * @param {string}  syncRunId
   * @param {import('pg').PoolClient} pgClient
   * @returns {Promise<'created'|'updated'|'failed'>}
   */
  async _processProduct(rawProduct, syncRunId, pgClient) {
    const sku = rawProduct.sku || 'unknown';
    try {
      const normalized = normalize(rawProduct);
      const outcome = await skulyticsUpsert(normalized, syncRunId, pgClient);

      await pgClient.query(
        `INSERT INTO skulytics_sync_sku_log
           (sync_run_id, skulytics_id, sku, status)
         VALUES ($1, $2, $3, $4)`,
        [syncRunId, normalized.skulytics_id, normalized.sku, outcome]
      );

      return outcome;
    } catch (err) {
      await pgClient.query(
        `INSERT INTO skulytics_sync_sku_log
           (sync_run_id, skulytics_id, sku, status, error_message)
         VALUES ($1, $2, $3, 'failed', $4)`,
        [syncRunId, String(rawProduct.product_id || rawProduct.id || ''), sku, err.message]
      );
      return 'failed';
    }
  }

  // ── Batch processing ────────────────────────────────────────

  /**
   * Process a single page of raw products inside one DB transaction.
   *
   * @param {Object[]} products
   * @param {string}   syncRunId
   * @returns {Promise<{ created: number, updated: number, failed: number }>}
   */
  async _processBatch(products, syncRunId) {
    const client = await this.pool.connect();
    const counts = { created: 0, updated: 0, failed: 0 };

    try {
      await client.query('BEGIN');

      for (const raw of products) {
        const outcome = await this._processProduct(raw, syncRunId, client);
        if (outcome === 'created')  counts.created++;
        else if (outcome === 'updated') counts.updated++;
        else counts.failed++;
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      // If the entire batch transaction fails, mark all as failed
      counts.failed = products.length;
      counts.created = 0;
      counts.updated = 0;
      console.error(`[SkulyticsSync] Batch transaction failed: ${err.message}`);
    } finally {
      client.release();
    }

    return counts;
  }

  // ── Retry wrapper ───────────────────────────────────────────

  /**
   * Fetch a page with retry logic.
   * Retries 429 and 5xx with exponential backoff + jitter, up to MAX_RETRY_ATTEMPTS.
   * Does NOT retry other 4xx errors.
   *
   * @param {Object} params - { cursor, pageSize }
   * @param {Object} counters - mutable counters object (for rateLimitHits tracking)
   * @returns {Promise<Object>} API page response
   */
  async _fetchPageWithRetry(params, counters) {
    let lastError;

    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const page = await this.api.getProducts(params);

        // Proactive rate-limit pause
        if (page.rateLimitRemaining < RATE_LIMIT_FLOOR) {
          const waitMs = Math.max(page.rateLimitResetMs, 1_000);
          console.warn(`[SkulyticsSync] Rate limit low (${page.rateLimitRemaining} remaining), pausing ${waitMs}ms`);
          counters.rateLimitHits++;
          await sleep(waitMs);
        }

        return page;
      } catch (err) {
        lastError = err;

        if (!isRetryable(err)) throw err;

        if (err instanceof SkulyticsRateLimitError) {
          counters.rateLimitHits++;
          const waitMs = err.retryAfterMs || backoffWithJitter(attempt);
          console.warn(`[SkulyticsSync] 429 hit, waiting ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`);
          await sleep(waitMs);
        } else {
          const waitMs = backoffWithJitter(attempt);
          console.warn(`[SkulyticsSync] Retryable error, waiting ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}): ${err.message}`);
          await sleep(waitMs);
        }
      }
    }

    throw lastError;
  }

  // ── Stale marking ───────────────────────────────────────────

  /**
   * Mark products as stale if they haven't been synced in STALE_THRESHOLD_HOURS.
   * Run once at the end of a full sync, NOT per-batch.
   *
   * @returns {Promise<number>} count of products marked stale
   */
  async markStaleProducts() {
    const { rowCount } = await this.pool.query(
      `UPDATE global_skulytics_products
       SET is_stale = true
       WHERE last_synced_at < NOW() - INTERVAL '${STALE_THRESHOLD_HOURS} hours'
         AND is_stale = false`
    );
    if (rowCount > 0) {
      console.log(`[SkulyticsSync] Marked ${rowCount} products as stale`);
    }
    return rowCount;
  }

  // ── Escalation ──────────────────────────────────────────────

  /**
   * Check the last N sync runs. If all failed, alert admins.
   */
  async _checkConsecutiveFailures() {
    const { rows } = await this.pool.query(
      `SELECT status FROM skulytics_sync_runs
       ORDER BY started_at DESC
       LIMIT $1`,
      [CONSECUTIVE_FAIL_LIMIT]
    );

    if (rows.length < CONSECUTIVE_FAIL_LIMIT) return;

    const allFailed = rows.every(r => r.status === 'failed');
    if (allFailed) {
      await this.escalateFailure();
    }
  }

  /**
   * Escalate repeated sync failures to admin notification channel.
   */
  async escalateFailure() {
    console.error('[SkulyticsSync] ESCALATION: 3 consecutive sync runs failed');
    await this.notifier.sendAdminAlert({
      subject: 'Skulytics sync failure — 3 consecutive failures',
      body:
        `The last ${CONSECUTIVE_FAIL_LIMIT} Skulytics sync runs have all failed. ` +
        'Manual investigation is required. Check skulytics_sync_runs and skulytics_sync_sku_log for details.',
    });
  }

  // ── Main sync entrypoint ────────────────────────────────────

  /**
   * Run an incremental sync from the Skulytics catalogue API.
   *
   * - Resumes from the last successful cursor
   * - Paginates in batches of PAGE_SIZE
   * - Normalizes, upserts, and logs each SKU
   * - Persists cursor after every batch for crash safety
   * - Marks stale products at the end
   *
   * @param {string} triggeredBy - e.g. "cron", "admin:user@example.com"
   * @returns {Promise<Object>} final sync-run record summary
   */
  async runIncrementalSync(triggeredBy = 'cron') {
    const run = await this.createSyncRun('incremental', triggeredBy);
    const runId = run.id;

    const counters = {
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
      rateLimitHits: 0,
      lastSku: null,
    };

    let cursor = await this._loadLastCursor();
    let hasMore = true;
    let partialFailure = false;

    try {
      while (hasMore) {
        // Fetch page with retry (pass cursor or page depending on API)
        const page = await this._fetchPageWithRetry(
          { cursor, pageSize: PAGE_SIZE },
          counters
        );

        const products = page.products;

        if (!products || products.length === 0) {
          hasMore = false;
          break;
        }

        // Process batch
        const batchResult = await this._processBatch(products, runId);

        counters.processed += products.length;
        counters.created   += batchResult.created;
        counters.updated   += batchResult.updated;
        counters.failed    += batchResult.failed;
        counters.lastSku    = products[products.length - 1].sku || counters.lastSku;

        if (batchResult.failed > 0) partialFailure = true;

        // Advance cursor and persist for resume safety
        cursor  = page.nextCursor ?? (page.nextPage ? String(page.nextPage) : null);
        hasMore = page.hasMore && !!cursor;

        await this._persistCursor(runId, cursor, counters);
      }

      // Mark stale products at end of sync
      await this.markStaleProducts();

      // Determine final status
      const finalStatus = counters.failed > 0 ? 'partial' : 'completed';

      await this.completeSyncRun(runId, finalStatus, null, {
        processed:      counters.processed,
        created:        counters.created,
        updated:        counters.updated,
        discontinued:   0,
        failed:         counters.failed,
        errorCount:     counters.failed,
        rateLimitHits:  counters.rateLimitHits,
      });

      console.log(
        `[SkulyticsSync] Sync ${finalStatus}: ` +
        `${counters.processed} processed, ${counters.created} created, ` +
        `${counters.updated} updated, ${counters.failed} failed`
      );

      return { runId, status: finalStatus, ...counters };

    } catch (err) {
      // Full API unavailability or unrecoverable error
      const isUnavailable = err instanceof SkulyticsUnavailableError;
      const finalStatus = partialFailure ? 'partial' : 'failed';

      await this.completeSyncRun(runId, finalStatus, err.message, {
        processed:      counters.processed,
        created:        counters.created,
        updated:        counters.updated,
        discontinued:   0,
        failed:         counters.failed,
        errorCount:     counters.failed + 1,
        rateLimitHits:  counters.rateLimitHits,
      });

      console.error(`[SkulyticsSync] Sync ${finalStatus}: ${err.message}`);

      // Check for consecutive failures and escalate if needed
      await this._checkConsecutiveFailures();

      return { runId, status: finalStatus, error: err.message, ...counters };
    }
  }

  // ── Full sync ───────────────────────────────────────────────

  /**
   * Run a full catalogue sync (no cursor resume — starts from the beginning).
   *
   * @param {string} triggeredBy
   * @returns {Promise<Object>} final sync-run record summary
   */
  async runFullSync(triggeredBy = 'manual') {
    const run = await this.createSyncRun('full', triggeredBy);
    const runId = run.id;

    const counters = {
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
      rateLimitHits: 0,
      lastSku: null,
    };

    let cursor = null; // full sync always starts from the beginning
    let hasMore = true;
    let partialFailure = false;

    try {
      while (hasMore) {
        const page = await this._fetchPageWithRetry(
          { cursor, pageSize: PAGE_SIZE },
          counters
        );

        const products = page.products;

        if (!products || products.length === 0) {
          hasMore = false;
          break;
        }

        const batchResult = await this._processBatch(products, runId);

        counters.processed += products.length;
        counters.created   += batchResult.created;
        counters.updated   += batchResult.updated;
        counters.failed    += batchResult.failed;
        counters.lastSku    = products[products.length - 1].sku || counters.lastSku;

        if (batchResult.failed > 0) partialFailure = true;

        cursor  = page.nextCursor ?? (page.nextPage ? String(page.nextPage) : null);
        hasMore = page.hasMore && !!cursor;

        await this._persistCursor(runId, String(cursor), counters);
      }

      // Mark stale products at end of full sync
      await this.markStaleProducts();

      const finalStatus = counters.failed > 0 ? 'partial' : 'completed';

      await this.completeSyncRun(runId, finalStatus, null, {
        processed:      counters.processed,
        created:        counters.created,
        updated:        counters.updated,
        discontinued:   0,
        failed:         counters.failed,
        errorCount:     counters.failed,
        rateLimitHits:  counters.rateLimitHits,
      });

      console.log(
        `[SkulyticsSync] Full sync ${finalStatus}: ` +
        `${counters.processed} processed, ${counters.created} created, ` +
        `${counters.updated} updated, ${counters.failed} failed`
      );

      return { runId, status: finalStatus, ...counters };

    } catch (err) {
      const finalStatus = partialFailure ? 'partial' : 'failed';

      await this.completeSyncRun(runId, finalStatus, err.message, {
        processed:      counters.processed,
        created:        counters.created,
        updated:        counters.updated,
        discontinued:   0,
        failed:         counters.failed,
        errorCount:     counters.failed + 1,
        rateLimitHits:  counters.rateLimitHits,
      });

      console.error(`[SkulyticsSync] Full sync ${finalStatus}: ${err.message}`);
      await this._checkConsecutiveFailures();

      return { runId, status: finalStatus, error: err.message, ...counters };
    }
  }

  // ── Single-SKU sync ─────────────────────────────────────────

  /**
   * Fetch and upsert a single product by SKU.
   *
   * @param {string} sku
   * @param {string} triggeredBy
   * @returns {Promise<Object>} sync result
   */
  async runManualSkuSync(sku, triggeredBy = 'manual') {
    const run = await this.createSyncRun('manual_sku', triggeredBy);
    const runId = run.id;

    try {
      const { product } = await this.api.getProductBySku(sku);

      if (!product) {
        await this.completeSyncRun(runId, 'completed', null, {
          processed: 0, created: 0, updated: 0, failed: 0, errorCount: 0,
        });
        console.log(`[SkulyticsSync] SKU ${sku}: not found in Skulytics API`);
        return { runId, status: 'completed', sku, outcome: 'not_found' };
      }

      const client = await this.pool.connect();
      let outcome;

      try {
        await client.query('BEGIN');
        outcome = await this._processProduct(product, runId, client);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        outcome = 'failed';
      } finally {
        client.release();
      }

      const status = outcome === 'failed' ? 'partial' : 'completed';
      const counters = {
        processed: 1,
        created:  outcome === 'created' ? 1 : 0,
        updated:  outcome === 'updated' ? 1 : 0,
        failed:   outcome === 'failed'  ? 1 : 0,
        errorCount: outcome === 'failed' ? 1 : 0,
      };

      await this.completeSyncRun(runId, status, null, counters);

      console.log(`[SkulyticsSync] SKU ${sku}: ${outcome}`);
      return { runId, status, sku, outcome, ...counters };

    } catch (err) {
      await this.completeSyncRun(runId, 'failed', err.message, {
        processed: 0, created: 0, updated: 0, failed: 1, errorCount: 1,
      });

      console.error(`[SkulyticsSync] SKU ${sku} failed: ${err.message}`);
      return { runId, status: 'failed', sku, error: err.message };
    }
  }
}

module.exports = { SkulyticsSyncService };
