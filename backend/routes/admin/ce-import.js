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

  // Try to find an existing product by UPC first, then by model/sku
  const model = product.model || product.sku || product.icecat_product_id || null;
  let existing = await pool.query(
    'SELECT id FROM products WHERE upc = $1 LIMIT 1',
    [product.upc]
  );

  // If no UPC match, try matching by model or sku (the product may already
  // exist from a price-list import that didn't include the UPC)
  if (existing.rows.length === 0 && model) {
    existing = await pool.query(
      'SELECT id FROM products WHERE model = $1 OR sku = $1 LIMIT 1',
      [model]
    );
  }

  if (existing.rows.length > 0) {
    // ── UPDATE enrichment fields + backfill UPC + fix model ──
    const id = existing.rows[0].id;
    const newModel = product.model || null;
    await pool.query(`
      UPDATE products SET
        upc                = COALESCE($1, upc),
        description        = COALESCE($2, description),
        image_url          = COALESCE($3, image_url),
        ce_specs           = COALESCE($4, ce_specs),
        icecat_product_id  = COALESCE($5, icecat_product_id),
        data_source        = $6,
        msrp_cents         = COALESCE($7, msrp_cents),
        color              = COALESCE($8, color),
        name               = COALESCE($9, name),
        model              = CASE WHEN $10::text IS NOT NULL THEN $10 ELSE model END,
        sku                = CASE WHEN $11::text IS NOT NULL THEN $11 ELSE sku END,
        manufacturer       = COALESCE($12, manufacturer),
        barcode_formats    = COALESCE($13, barcode_formats),
        barcode_attributes = COALESCE($14, barcode_attributes),
        updated_at         = CURRENT_TIMESTAMP
      WHERE id = $15
    `, [
      product.upc,
      product.description,
      product.image_url,
      product.ce_specs ? JSON.stringify(product.ce_specs) : null,
      product.icecat_product_id || null,
      dataSource,
      toCents(product.msrp),
      product.color || null,
      product.product_name || null,
      newModel,
      product.sku || null,
      product.brand_name || null,
      product.barcode_formats || null,
      product.barcode_attributes ? JSON.stringify(product.barcode_attributes) : null,
      id,
    ]);

    // Insert competitor pricing from store data
    await insertCompetitorPrices(id, product);

    return { id, inserted: false };
  }

  // ── INSERT new product ─────────────────────────────────
  // Build a human-readable name: prefer Icecat product name, then "Brand Model"
  const brand = product.brand_name || '';
  const modelNum = product.model || product.sku || '';
  const productName = product.product_name
    || (brand && modelNum ? `${brand} ${modelNum}` : null)
    || product.sku
    || ('UPC-' + product.upc);

  const result = await pool.query(`
    INSERT INTO products (
      manufacturer, model, sku, upc, name, description, category,
      msrp_cents, image_url, ce_specs, icecat_product_id, data_source,
      color, import_source, import_date, active,
      barcode_formats, barcode_attributes,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12,
      $13, $14, CURRENT_TIMESTAMP, true,
      $15, $16,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) RETURNING id
  `, [
    product.brand_name || 'Unknown',                                              // manufacturer
    product.model || product.mpn || product.sku || 'Unknown',                       // model
    product.sku,                                                                  // sku
    product.upc,                                                                  // upc
    productName,                                                                  // name
    product.description,                                                          // description
    product.category || 'Consumer Electronics',                                   // category (NOT NULL)
    toCents(product.msrp),                                                        // msrp_cents
    product.image_url,                                                            // image_url
    product.ce_specs ? JSON.stringify(product.ce_specs) : null,                   // ce_specs
    product.icecat_product_id || null,                                            // icecat_product_id
    dataSource,                                                                   // data_source
    product.color || null,                                                        // color
    `${dataSource}-bulk-import`,                                                  // import_source
    product.barcode_formats || null,                                              // barcode_formats
    product.barcode_attributes ? JSON.stringify(product.barcode_attributes) : null, // barcode_attributes
  ]);

  const id = result.rows[0].id;

  // Insert competitor pricing from store data
  await insertCompetitorPrices(id, product);

  return { id, inserted: true };
}

/**
 * Insert / refresh competitor pricing rows from Barcode Lookup store data.
 *
 * Replaces any previous barcode_lookup rows for this product, then inserts
 * one row per store that has a valid price.
 *
 * @param {number} productId - products.id
 * @param {Object} product   - Normalized product (needs online_prices array)
 */
async function insertCompetitorPrices(productId, product) {
  const stores = product.online_prices;
  if (!Array.isArray(stores) || stores.length === 0) return;

  // Remove stale barcode_lookup rows for this product
  await pool.query(
    `DELETE FROM competitor_prices WHERE product_id = $1 AND pricing_source = 'barcode_lookup'`,
    [productId]
  );

  for (const store of stores) {
    const price = parseFloat(store.price);
    if (!Number.isFinite(price) || price <= 0) continue;

    await pool.query(`
      INSERT INTO competitor_prices (
        product_id, competitor_name, competitor_price, currency,
        competitor_url, pricing_source, last_fetched_at,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'barcode_lookup', NOW(), NOW(), NOW())
    `, [
      productId,
      store.name || 'Unknown Store',
      price,
      store.currency || 'CAD',
      store.link || null,
    ]);
  }
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
          model: normalized.model,
          mpn: normalized.mpn,
          sku: normalized.sku,
          name: normalized.product_name,
          onlinePriceCount: Array.isArray(normalized.online_prices) ? normalized.online_prices.length : 0,
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
