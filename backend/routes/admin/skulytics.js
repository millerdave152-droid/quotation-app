'use strict';

/**
 * Admin Skulytics Routes
 *
 * Endpoints for manual SKU refresh and catalogue health monitoring.
 *
 * POST /api/admin/skulytics/refresh/:sku — refresh a single SKU from Skulytics
 * GET  /api/admin/skulytics/health       — catalogue health dashboard data
 * GET  /api/admin/skulytics/catalogue       — paginated catalogue browse
 * GET  /api/admin/skulytics/catalogue/stats — dashboard import stats
 * GET  /api/admin/skulytics/catalogue/:id   — single product detail
 * POST /api/admin/skulytics/match/confirm   — confirm auto-match
 * POST /api/admin/skulytics/match/reject    — reject auto-match
 * POST /api/admin/skulytics/import          — bulk import products
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { SkulyticsApiClient, SkulyticsUnavailableError, SkulyticsRateLimitError } = require('../../services/skulytics/SkulyticsApiClient');
const { normalize } = require('../../services/skulytics/normalizers');
const { skulyticsUpsert } = require('../../services/skulytics/skulyticsUpsert');
const SkulyticsImportService = require('../../services/SkulyticsImportService');

const router = express.Router();

// ── Rate limiter: 20 per minute per authenticated user ──────

const skuRefreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  // req.user is always set because authenticate runs before this middleware.
  // We key on user ID so each authenticated user gets their own 20/min bucket.
  keyGenerator: (req) => `skulytics-refresh:${req.user.id}`,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      data: null,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many SKU refresh requests. Limit is 20 per minute.',
      },
      meta: { timestamp: new Date().toISOString() },
    });
  },
});

// ── Validation ──────────────────────────────────────────────

const SKU_PATTERN = /^[A-Za-z0-9\-]+$/;
const SKU_MAX_LENGTH = 100;

function validateSku(sku) {
  if (!sku || typeof sku !== 'string') return false;
  if (sku.length > SKU_MAX_LENGTH) return false;
  return SKU_PATTERN.test(sku);
}

// ── Audit helper ────────────────────────────────────────────

async function logAudit(userId, action, resourceType, resourceId, metadata = {}, req = null) {
  try {
    await pool.query(
      `INSERT INTO audit_log
         (user_id, action, entity_type, entity_id, ip_address, user_agent, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        userId,
        action,
        resourceType,
        resourceId,
        req?.ip || null,
        req?.get('user-agent') || null,
        Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    console.error('[SkulyticsAdmin] Audit log insert failed:', err.message);
  }
}

// ── POST /refresh/:sku ─────────────────────────────────────

router.post(
  '/refresh/:sku',
  authenticate,
  requireRole('admin', 'catalog_manager'),
  skuRefreshLimiter,
  asyncHandler(async (req, res) => {
    const { sku } = req.params;

    // Validate SKU format
    if (!validateSku(sku)) {
      throw ApiError.badRequest(
        'Invalid SKU format. Must be alphanumeric and hyphens only, max 100 characters.'
      );
    }

    // Fetch from Skulytics API
    let apiResult;
    try {
      const apiClient = new SkulyticsApiClient();
      apiResult = await apiClient.getProductBySku(sku);
    } catch (err) {
      if (err instanceof SkulyticsRateLimitError) {
        return res.status(429).json({
          success: false,
          data: null,
          error: {
            code: 'SKULYTICS_RATE_LIMITED',
            message: 'Skulytics API rate limit exceeded. Please try again shortly.',
          },
          meta: { timestamp: new Date().toISOString() },
        });
      }

      if (err instanceof SkulyticsUnavailableError) {
        return res.status(502).json({
          success: false,
          data: null,
          error: {
            code: 'SKULYTICS_UNAVAILABLE',
            message: 'Skulytics API is currently unavailable. Cached product data remains valid.',
          },
          meta: { timestamp: new Date().toISOString() },
        });
      }

      throw err;
    }

    // Check if product exists in Skulytics
    if (!apiResult.product) {
      throw ApiError.notFound(`SKU '${sku}' not found in Skulytics catalogue`);
    }

    // Normalize
    const normalized = normalize(apiResult.product);

    // Upsert inside a transaction
    const client = await pool.connect();
    let outcome;

    try {
      await client.query('BEGIN');

      // Create a minimal sync run for audit trail
      const { rows: runRows } = await client.query(
        `INSERT INTO skulytics_sync_runs
           (run_type, status, triggered_by, processed, created, updated, failed)
         VALUES ('manual_sku', 'completed', $1, 1, 0, 0, 0)
         RETURNING id`,
        [`admin:${req.user.email}`]
      );
      const syncRunId = runRows[0].id;

      outcome = await skulyticsUpsert(normalized, syncRunId, client);

      // Log to per-SKU log
      await client.query(
        `INSERT INTO skulytics_sync_sku_log
           (sync_run_id, skulytics_id, sku, status)
         VALUES ($1, $2, $3, $4)`,
        [syncRunId, normalized.skulytics_id, normalized.sku, outcome]
      );

      // Update sync run counters
      const counterCol = outcome === 'created' ? 'created' : 'updated';
      await client.query(
        `UPDATE skulytics_sync_runs
         SET ${counterCol} = 1, completed_at = NOW()
         WHERE id = $1`,
        [syncRunId]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Audit log (fire-and-forget)
    logAudit(
      req.user.id,
      'skulytics.manual_refresh',
      'sku',
      sku,
      {
        run_type: 'manual_sku',
        skulytics_id: normalized.skulytics_id,
        outcome,
        tenant_id: req.user.tenant_id || null,
      },
      req
    );

    // Fetch the freshly-upserted row for last_synced_at
    const { rows: freshRows } = await pool.query(
      `SELECT last_synced_at FROM global_skulytics_products WHERE skulytics_id = $1`,
      [normalized.skulytics_id]
    );

    res.success({
      sku: normalized.sku,
      skulytics_id: normalized.skulytics_id,
      outcome,
      last_synced_at: freshRows[0]?.last_synced_at || new Date().toISOString(),
    });
  })
);

// ── GET /health ─────────────────────────────────────────────

router.get(
  '/health',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    // Catalogue health stats
    const catalogQuery = pool.query(`
      SELECT
        COUNT(*)::int                                                       AS total_skus,
        COUNT(*) FILTER (WHERE is_stale)::int                               AS stale_skus,
        COUNT(*) FILTER (WHERE is_discontinued)::int                        AS discontinued_skus,
        COUNT(*) FILTER (WHERE last_synced_at < NOW() - INTERVAL '25 hours')::int AS overdue_skus,
        MAX(last_synced_at)                                                 AS most_recent_sync
      FROM global_skulytics_products
    `);

    // Last 5 sync runs
    const syncsQuery = pool.query(`
      SELECT
        id,
        run_type,
        status,
        processed,
        failed,
        CASE
          WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (completed_at - started_at))::int
          ELSE NULL
        END AS duration_seconds,
        started_at
      FROM skulytics_sync_runs
      ORDER BY started_at DESC
      LIMIT 5
    `);

    // Run both queries in parallel
    const [catalogResult, syncsResult] = await Promise.all([catalogQuery, syncsQuery]);

    const catalog = catalogResult.rows[0] || {
      total_skus: 0,
      stale_skus: 0,
      discontinued_skus: 0,
      overdue_skus: 0,
      most_recent_sync: null,
    };

    res.success({
      catalog,
      recentSyncs: syncsResult.rows,
    });
  })
);

// ── GET /catalogue ─────────────────────────────────────────
// Paginated catalogue browse with filtering

router.get(
  '/catalogue',
  authenticate,
  requireRole('admin', 'catalog_manager'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, search, brand, category, status, inStock } = req.query;
    const result = await SkulyticsImportService.getCatalogue({
      page, pageSize, search, brand, category, status, inStock,
    });
    res.paginated(result.items, result.pagination);
  })
);

// ── GET /catalogue/stats ──────────────────────────────────
// Dashboard import stats

router.get(
  '/catalogue/stats',
  authenticate,
  requireRole('admin', 'catalog_manager'),
  asyncHandler(async (req, res) => {
    const stats = await SkulyticsImportService.getStats();
    res.success(stats);
  })
);

// ── GET /catalogue/:skulytics_id ──────────────────────────
// Single product detail from global catalogue

router.get(
  '/catalogue/:skulytics_id',
  authenticate,
  requireRole('admin', 'catalog_manager'),
  asyncHandler(async (req, res) => {
    const product = await SkulyticsImportService.getProduct(req.params.skulytics_id);
    if (!product) {
      throw ApiError.notFound('Product not found in Skulytics catalogue');
    }
    res.success(product);
  })
);

// ── POST /match/confirm ───────────────────────────────────
// Confirm an auto-matched product

router.post(
  '/match/confirm',
  authenticate,
  requireRole('admin', 'catalog_manager'),
  asyncHandler(async (req, res) => {
    const { matchId } = req.body;
    if (!matchId) {
      throw ApiError.badRequest('matchId is required');
    }
    const result = await SkulyticsImportService.confirmMatch(matchId, req.user.id);
    if (!result) {
      throw ApiError.notFound('Import match not found');
    }

    logAudit(req.user.id, 'skulytics.match_confirmed', 'skulytics_import_match', matchId, {}, req);
    res.success(result);
  })
);

// ── POST /match/reject ────────────────────────────────────
// Reject an auto-matched product

router.post(
  '/match/reject',
  authenticate,
  requireRole('admin', 'catalog_manager'),
  asyncHandler(async (req, res) => {
    const { matchId } = req.body;
    if (!matchId) {
      throw ApiError.badRequest('matchId is required');
    }
    const result = await SkulyticsImportService.rejectMatch(matchId, req.user.id);
    if (!result) {
      throw ApiError.notFound('Import match not found');
    }

    logAudit(req.user.id, 'skulytics.match_rejected', 'skulytics_import_match', matchId, {}, req);
    res.success(result);
  })
);

// ── POST /import ──────────────────────────────────────────
// Bulk import products from global catalogue

router.post(
  '/import',
  authenticate,
  requireRole('admin', 'catalog_manager'),
  asyncHandler(async (req, res) => {
    const { skulyticsIds } = req.body;
    if (!Array.isArray(skulyticsIds) || skulyticsIds.length === 0) {
      throw ApiError.badRequest('skulyticsIds must be a non-empty array');
    }
    if (skulyticsIds.length > 200) {
      throw ApiError.badRequest('Maximum 200 products per import batch');
    }

    // Look up the tenant — single-tenant app, grab the first (and only) tenant row
    const { rows: tenantRows } = await pool.query('SELECT id FROM tenants LIMIT 1');
    if (!tenantRows.length) {
      throw ApiError.internal('No tenant configured in the system');
    }
    const tenantId = tenantRows[0].id;

    const result = await SkulyticsImportService.bulkImport(skulyticsIds, req.user.id, tenantId);

    logAudit(
      req.user.id,
      'skulytics.bulk_import',
      'products',
      null,
      { imported: result.imported, skipped: result.skipped, error_count: result.errors.length },
      req
    );

    res.success(result);
  })
);

module.exports = router;
