'use strict';

/**
 * Admin CE Import Routes
 *
 * POST /api/admin/products/import-ce
 *   Bulk-import Consumer Electronics products from Icecat Open API by UPC.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { ApiError, asyncHandler } = require('../../middleware/errorHandler');
const { fetchByUPC, delay } = require('../../services/icecatService');
const { normalizeIcecatProduct } = require('../../normalizers/icecatNormalizer');

// Module-level dependencies (injected via init)
let pool = null;

/**
 * Initialize the router with dependencies.
 * @param {object} deps
 * @param {Pool}   deps.pool - PostgreSQL connection pool
 * @returns {Router}
 */
const init = (deps) => {
  pool = deps.pool;
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
 * Upsert a single normalised Icecat product into the products table.
 *
 * If a row with the same UPC already exists we only update the
 * CE-enrichment columns (description, image, specs, icecat_product_id,
 * data_source).  A brand-new UPC inserts a full row.
 *
 * @param {Object} product - Output of normalizeIcecatProduct()
 * @returns {Promise<{ id: number, inserted: boolean }>}
 */
async function upsertProduct(product) {
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
        updated_at        = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [
      product.description,
      product.image_url,
      product.ce_specs ? JSON.stringify(product.ce_specs) : null,
      product.icecat_product_id,
      'icecat',
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
    product.brand_name || 'Unknown',                           // manufacturer
    product.sku || product.icecat_product_id || 'ICECAT-IMPORT', // model
    product.sku,                                               // sku
    product.upc,                                               // upc
    product.product_name || product.description?.substring(0, 200) || product.sku, // name
    product.description,                                       // description
    'Consumer Electronics',                                    // category (NOT NULL)
    toCents(product.msrp),                                     // msrp_cents
    product.image_url,                                         // image_url
    product.ce_specs ? JSON.stringify(product.ce_specs) : null, // ce_specs
    product.icecat_product_id,                                 // icecat_product_id
    'icecat',                                                  // data_source
    'icecat-bulk-import',                                      // import_source
  ]);

  return { id: result.rows[0].id, inserted: true };
}

// ── Route ───────────────────────────────────────────────────

/**
 * POST /api/admin/products/import-ce
 *
 * Body: { upcs: string[] }   (max 500)
 *
 * Sequentially fetches each UPC from Icecat, normalises the response,
 * and upserts into the products table.
 *
 * Returns: { success: [], notFound: [], errors: [], summary: {} }
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

  for (let i = 0; i < uniqueUpcs.length; i++) {
    const upc = uniqueUpcs[i];

    try {
      // Fetch from Icecat (normalizes UPC→EAN-13 for API, returns 12-digit upcA)
      const { found, data, upcA } = await fetchByUPC(upc);

      if (!found) {
        notFound.push({ upc, reason: 'Product not found in Icecat' });
        if (i < uniqueUpcs.length - 1) await delay();
        continue;
      }

      // Normalize
      const normalized = normalizeIcecatProduct(data);

      // Store the 12-digit UPC-A (used by Best Buy Canada, PricesAPI for matching)
      normalized.upc = upcA || upc;

      // Upsert
      const { id, inserted } = await upsertProduct(normalized);

      success.push({
        upc,
        productId: id,
        action: inserted ? 'inserted' : 'updated',
        brand: normalized.brand_name,
        sku: normalized.sku,
        name: normalized.product_name,
      });
    } catch (err) {
      errors.push({
        upc,
        error: err.message,
        statusCode: err.statusCode || null,
      });
    }

    // Rate-limit delay between requests (skip after last item)
    if (i < uniqueUpcs.length - 1) {
      await delay();
    }
  }

  res.success({
    success,
    notFound,
    errors,
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
