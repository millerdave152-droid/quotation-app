'use strict';

/**
 * Admin CE Import Routes
 *
 * POST /api/admin/products/import-ce
 *   Bulk-import Consumer Electronics products using a primary/fallback chain:
 *   1. Barcode Lookup API (primary)
 *   2. Icecat Open API (fallback)
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { ApiError, asyncHandler } = require('../../middleware/errorHandler');

// Primary source
const barcodeLookupService = require('../../services/barcodeLookupService');
const { normalizeBarcodeProduct } = require('../../normalizers/barcodeLookupNormalizer');

// Fallback source
const icecatService = require('../../services/icecatService');
const { normalizeIcecatProduct } = require('../../normalizers/icecatNormalizer');

// Module-level dependencies (injected via init)
let pool = null;
let cache = null;

/**
 * Initialize the router with dependencies.
 * @param {object} deps
 * @param {Pool}   deps.pool - PostgreSQL connection pool
 * @param {Object} [deps.cache] - Cache instance (optional)
 * @returns {Router}
 */
const init = (deps) => {
  pool = deps.pool;
  cache = deps.cache || null;
  return router;
};

// ── Middleware ───────────────────────────────────────────────

const requireAdmin = (req, _res, next) => {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }
  const adminRoles = ['admin', 'manager'];
  if (!adminRoles.includes(req.user.role)) {
    throw ApiError.forbidden('Admin access required');
  }
  next();
};

router.use(authenticate);
router.use(requireAdmin);

// ── Helpers ─────────────────────────────────────────────────

/**
 * Convert a dollar amount (number or string) to integer cents.
 * Returns null when the input is not a valid positive number.
 */
function toCents(val) {
  if (val == null) return null;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Upsert a single normalised product into the products table.
 *
 * If a row with the same UPC already exists we only update the
 * CE-enrichment columns.  A brand-new UPC inserts a full row.
 *
 * @param {Object} product - Output of normalizeBarcodeProduct() or normalizeIcecatProduct()
 * @returns {Promise<{ id: number, inserted: boolean }>}
 */
async function upsertProduct(product) {
  const dataSource = product.data_source || 'barcode_lookup';

  // Try to find an existing product by UPC first
  const existing = await pool.query(
    'SELECT id FROM products WHERE upc = $1 LIMIT 1',
    [product.upc]
  );

  if (existing.rows.length > 0) {
    // ── UPDATE enrichment fields only ──────────────────────
    const id = existing.rows[0].id;
    await pool.query(`
      UPDATE products SET
        description       = COALESCE($1, description),
        image_url         = COALESCE($2, image_url),
        ce_specs          = COALESCE($3, ce_specs),
        icecat_product_id = COALESCE($4, icecat_product_id),
        data_source       = $5,
        msrp_cents        = COALESCE($6, msrp_cents),
        updated_at        = CURRENT_TIMESTAMP
      WHERE id = $7
    `, [
      product.description,
      product.image_url,
      product.ce_specs ? JSON.stringify(product.ce_specs) : null,
      product.icecat_product_id || null,
      dataSource,
      toCents(product.msrp),
      id,
    ]);

    return { id, inserted: false };
  }

  // ── INSERT new product ─────────────────────────────────
  const result = await pool.query(`
    INSERT INTO products (
      manufacturer, model, sku, upc, name, description, category,
      msrp_cents, image_url, ce_specs, icecat_product_id, data_source,
      import_source, import_date, active,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12,
      $13, CURRENT_TIMESTAMP, true,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) RETURNING id
  `, [
    product.brand_name || 'Unknown',                                              // manufacturer
    product.sku || product.icecat_product_id || 'CE-IMPORT',                      // model
    product.sku,                                                                  // sku
    product.upc,                                                                  // upc
    product.product_name || product.description?.substring(0, 200) || product.sku, // name
    product.description,                                                          // description
    product.category || 'Consumer Electronics',                                   // category (NOT NULL)
    toCents(product.msrp),                                                        // msrp_cents
    product.image_url,                                                            // image_url
    product.ce_specs ? JSON.stringify(product.ce_specs) : null,                   // ce_specs
    product.icecat_product_id || null,                                            // icecat_product_id
    dataSource,                                                                   // data_source
    `${dataSource}-bulk-import`,                                                  // import_source
  ]);

  return { id: result.rows[0].id, inserted: true };
}

/**
 * Try Barcode Lookup first, then fall back to Icecat.
 *
 * @param {string} upc - Raw UPC from user input
 * @returns {Promise<{ normalized: Object|null, source: string|null }>}
 */
async function fetchAndNormalize(upc) {
  // ── 1. Primary: Barcode Lookup ──────────────────────────
  if (process.env.BARCODE_LOOKUP_API_KEY) {
    try {
      const blResult = await barcodeLookupService.fetchByUPC(upc);
      if (blResult.found && blResult.data) {
        const normalized = normalizeBarcodeProduct(blResult.data);
        // Preserve the original UPC if normalizer didn't extract one
        if (!normalized.upc) normalized.upc = upc;
        return { normalized, source: 'barcode_lookup' };
      }
    } catch (err) {
      // Log but don't fail — fall through to Icecat
      console.warn(`[CE Import] Barcode Lookup error for ${upc}: ${err.message}`);
    }
  }

  // ── 2. Fallback: Icecat ─────────────────────────────────
  if (process.env.ICECAT_USERNAME) {
    try {
      const icResult = await icecatService.fetchByUPC(upc);
      if (icResult.found && icResult.data) {
        const normalized = normalizeIcecatProduct(icResult.data);
        // Store 12-digit UPC-A (Best Buy Canada / PricesAPI matching)
        normalized.upc = icResult.upcA || upc;
        return { normalized, source: 'icecat' };
      }
    } catch (err) {
      console.warn(`[CE Import] Icecat error for ${upc}: ${err.message}`);
    }
  }

  // ── 3. Both failed ──────────────────────────────────────
  return { normalized: null, source: null };
}

// ── Route ───────────────────────────────────────────────────

/**
 * POST /api/admin/products/import-ce
 *
 * Body: { upcs: string[] }   (max 500)
 *
 * For each UPC, tries Barcode Lookup (primary) then Icecat (fallback).
 * Normalises the response and upserts into the products table.
 *
 * Returns: { success: [], notFound: [], errors: [], sources: {}, summary: {} }
 */
router.post('/import-ce', asyncHandler(async (req, res) => {
  const { upcs } = req.body;

  if (!Array.isArray(upcs) || upcs.length === 0) {
    throw new ApiError('Request body must include a non-empty "upcs" array', 400);
  }

  if (upcs.length > 500) {
    throw new ApiError('Maximum 500 UPCs per request', 400);
  }

  // Deduplicate
  const uniqueUpcs = [...new Set(upcs.map(u => String(u).trim()).filter(Boolean))];

  const success = [];
  const notFound = [];
  const errors = [];
  const sources = { barcode_lookup: 0, icecat: 0 };

  for (let i = 0; i < uniqueUpcs.length; i++) {
    const upc = uniqueUpcs[i];

    try {
      const { normalized, source } = await fetchAndNormalize(upc);

      if (!normalized) {
        notFound.push({ upc, reason: 'Product not found in Barcode Lookup or Icecat' });
      } else {
        // Ensure data_source matches the actual source used
        normalized.data_source = source;
        sources[source]++;

        const { id, inserted } = await upsertProduct(normalized);

        success.push({
          upc,
          productId: id,
          action: inserted ? 'inserted' : 'updated',
          source,
          brand: normalized.brand_name,
          sku: normalized.sku,
          name: normalized.product_name,
        });
      }
    } catch (err) {
      errors.push({
        upc,
        error: err.message,
        statusCode: err.statusCode || null,
      });
    }

    // Rate-limit delay between requests (skip after last item)
    if (i < uniqueUpcs.length - 1) {
      await barcodeLookupService.delay();
    }
  }

  // Invalidate product cache so new imports show up immediately
  if (success.length > 0 && cache && cache.invalidatePattern) {
    cache.invalidatePattern('products:');
  }

  res.success({
    success,
    notFound,
    errors,
    sources,
    summary: {
      total: uniqueUpcs.length,
      imported: success.filter(s => s.action === 'inserted').length,
      updated: success.filter(s => s.action === 'updated').length,
      notFound: notFound.length,
      failed: errors.length,
    },
  });
}));

module.exports = { router, init };
