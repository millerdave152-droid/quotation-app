'use strict';

/**
 * skulyticsUpsert.js
 *
 * Idempotent upsert for global_skulytics_products.
 * Uses INSERT … ON CONFLICT (skulytics_id) DO UPDATE.
 *
 * Supports both the base schema (migration 10) and the extended
 * schema (migration 61) with 7 additional columns.
 */

// Module-level cache: null = unchecked, true/false = checked
let _hasExtendedColumns = null;

/**
 * Check once whether the extended columns from migration 61 exist.
 * @param {import('pg').PoolClient} pgClient
 * @returns {Promise<boolean>}
 */
async function _checkExtendedColumns(pgClient) {
  if (_hasExtendedColumns !== null) return _hasExtendedColumns;
  const { rows } = await pgClient.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'global_skulytics_products' AND column_name = 'is_in_stock'`
  );
  _hasExtendedColumns = rows.length > 0;
  return _hasExtendedColumns;
}

/**
 * Reset the column cache (for testing).
 */
function _resetColumnCache() {
  _hasExtendedColumns = null;
}

// ── Base upsert (original 28 columns) ──────────────────────

async function _baseUpsert(product, syncRunId, pgClient) {
  const result = await pgClient.query(
    `INSERT INTO global_skulytics_products (
        skulytics_id, api_schema_version,
        sku, upc, brand, model_number, model_name,
        category_slug, category_path,
        msrp, map_price, currency,
        weight_kg, width_cm, height_cm, depth_cm,
        variant_group_id, is_variant_parent, parent_skulytics_id,
        variant_type, variant_value,
        is_discontinued, discontinued_at,
        is_stale, last_synced_at, sync_run_id,
        raw_json, specs, images, warranty, buyback_value,
        created_at, updated_at
      ) VALUES (
        $1,  $2,
        $3,  $4,  $5,  $6,  $7,
        $8,  $9,
        $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19,
        $20, $21,
        $22, CASE WHEN $22::boolean THEN NOW() ELSE NULL END,
        false, NOW(), $23,
        $24, $25, $26, $27, $28,
        NOW(), NOW()
      )
      ON CONFLICT (skulytics_id) DO UPDATE SET
        api_schema_version  = EXCLUDED.api_schema_version,
        sku                 = EXCLUDED.sku,
        upc                 = EXCLUDED.upc,
        brand               = EXCLUDED.brand,
        model_number        = EXCLUDED.model_number,
        model_name          = EXCLUDED.model_name,
        category_slug       = EXCLUDED.category_slug,
        category_path       = EXCLUDED.category_path,
        msrp                = EXCLUDED.msrp,
        map_price           = EXCLUDED.map_price,
        currency            = EXCLUDED.currency,
        weight_kg           = EXCLUDED.weight_kg,
        width_cm            = EXCLUDED.width_cm,
        height_cm           = EXCLUDED.height_cm,
        depth_cm            = EXCLUDED.depth_cm,
        variant_group_id    = EXCLUDED.variant_group_id,
        is_variant_parent   = EXCLUDED.is_variant_parent,
        parent_skulytics_id = EXCLUDED.parent_skulytics_id,
        variant_type        = EXCLUDED.variant_type,
        variant_value       = EXCLUDED.variant_value,
        is_discontinued     = EXCLUDED.is_discontinued,
        discontinued_at     = CASE
                                WHEN EXCLUDED.is_discontinued AND NOT global_skulytics_products.is_discontinued
                                  THEN NOW()
                                WHEN NOT EXCLUDED.is_discontinued
                                  THEN NULL
                                ELSE global_skulytics_products.discontinued_at
                              END,
        is_stale            = false,
        last_synced_at      = NOW(),
        sync_run_id         = EXCLUDED.sync_run_id,
        raw_json            = EXCLUDED.raw_json,
        specs               = EXCLUDED.specs,
        images              = EXCLUDED.images,
        warranty            = EXCLUDED.warranty,
        buyback_value       = EXCLUDED.buyback_value
      RETURNING
        (xmax = 0) AS was_inserted,
        updated_at`,
    [
      product.skulytics_id,                              // $1
      product.api_schema_version,                        // $2
      product.sku,                                       // $3
      product.upc,                                       // $4
      product.brand,                                     // $5
      product.model_number,                              // $6
      product.model_name,                                // $7
      product.category_slug,                             // $8
      product.category_path,                             // $9
      product.msrp,                                      // $10
      product.map_price,                                 // $11
      product.currency,                                  // $12
      product.weight_kg,                                 // $13
      product.width_cm,                                  // $14
      product.height_cm,                                 // $15
      product.depth_cm,                                  // $16
      product.variant_group_id,                          // $17
      product.is_variant_parent,                         // $18
      product.parent_skulytics_id,                       // $19
      product.variant_type,                              // $20
      product.variant_value,                             // $21
      product.is_discontinued,                           // $22
      syncRunId,                                         // $23
      JSON.stringify(product.raw_json),                  // $24
      product.specs ? JSON.stringify(product.specs) : null,   // $25
      product.images ? JSON.stringify(product.images) : null, // $26
      product.warranty ? JSON.stringify(product.warranty) : null, // $27
      product.buyback_value,                             // $28
    ]
  );
  return result;
}

// ── Extended upsert (35 columns — base + 7 new) ───────────

async function _extendedUpsert(product, syncRunId, pgClient) {
  const result = await pgClient.query(
    `INSERT INTO global_skulytics_products (
        skulytics_id, api_schema_version,
        sku, upc, brand, model_number, model_name,
        category_slug, category_path,
        msrp, map_price, currency,
        weight_kg, width_cm, height_cm, depth_cm,
        variant_group_id, is_variant_parent, parent_skulytics_id,
        variant_type, variant_value,
        is_discontinued, discontinued_at,
        is_stale, last_synced_at, sync_run_id,
        raw_json, specs, images, warranty, buyback_value,
        is_in_stock, umrp, competitor_pricing,
        brand_slug, primary_image, product_link, is_multi_brand,
        created_at, updated_at
      ) VALUES (
        $1,  $2,
        $3,  $4,  $5,  $6,  $7,
        $8,  $9,
        $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19,
        $20, $21,
        $22, CASE WHEN $22::boolean THEN NOW() ELSE NULL END,
        false, NOW(), $23,
        $24, $25, $26, $27, $28,
        $29, $30, $31,
        $32, $33, $34, $35,
        NOW(), NOW()
      )
      ON CONFLICT (skulytics_id) DO UPDATE SET
        api_schema_version  = EXCLUDED.api_schema_version,
        sku                 = EXCLUDED.sku,
        upc                 = EXCLUDED.upc,
        brand               = EXCLUDED.brand,
        model_number        = EXCLUDED.model_number,
        model_name          = EXCLUDED.model_name,
        category_slug       = EXCLUDED.category_slug,
        category_path       = EXCLUDED.category_path,
        msrp                = EXCLUDED.msrp,
        map_price           = EXCLUDED.map_price,
        currency            = EXCLUDED.currency,
        weight_kg           = EXCLUDED.weight_kg,
        width_cm            = EXCLUDED.width_cm,
        height_cm           = EXCLUDED.height_cm,
        depth_cm            = EXCLUDED.depth_cm,
        variant_group_id    = EXCLUDED.variant_group_id,
        is_variant_parent   = EXCLUDED.is_variant_parent,
        parent_skulytics_id = EXCLUDED.parent_skulytics_id,
        variant_type        = EXCLUDED.variant_type,
        variant_value       = EXCLUDED.variant_value,
        is_discontinued     = EXCLUDED.is_discontinued,
        discontinued_at     = CASE
                                WHEN EXCLUDED.is_discontinued AND NOT global_skulytics_products.is_discontinued
                                  THEN NOW()
                                WHEN NOT EXCLUDED.is_discontinued
                                  THEN NULL
                                ELSE global_skulytics_products.discontinued_at
                              END,
        is_stale            = false,
        last_synced_at      = NOW(),
        sync_run_id         = EXCLUDED.sync_run_id,
        raw_json            = EXCLUDED.raw_json,
        specs               = EXCLUDED.specs,
        images              = EXCLUDED.images,
        warranty            = EXCLUDED.warranty,
        buyback_value       = EXCLUDED.buyback_value,
        is_in_stock         = EXCLUDED.is_in_stock,
        umrp                = EXCLUDED.umrp,
        competitor_pricing  = EXCLUDED.competitor_pricing,
        brand_slug          = EXCLUDED.brand_slug,
        primary_image       = EXCLUDED.primary_image,
        product_link        = EXCLUDED.product_link,
        is_multi_brand      = EXCLUDED.is_multi_brand
      RETURNING
        (xmax = 0) AS was_inserted,
        updated_at`,
    [
      product.skulytics_id,                              // $1
      product.api_schema_version,                        // $2
      product.sku,                                       // $3
      product.upc,                                       // $4
      product.brand,                                     // $5
      product.model_number,                              // $6
      product.model_name,                                // $7
      product.category_slug,                             // $8
      product.category_path,                             // $9
      product.msrp,                                      // $10
      product.map_price,                                 // $11
      product.currency,                                  // $12
      product.weight_kg,                                 // $13
      product.width_cm,                                  // $14
      product.height_cm,                                 // $15
      product.depth_cm,                                  // $16
      product.variant_group_id,                          // $17
      product.is_variant_parent,                         // $18
      product.parent_skulytics_id,                       // $19
      product.variant_type,                              // $20
      product.variant_value,                             // $21
      product.is_discontinued,                           // $22
      syncRunId,                                         // $23
      JSON.stringify(product.raw_json),                  // $24
      product.specs ? JSON.stringify(product.specs) : null,   // $25
      product.images ? JSON.stringify(product.images) : null, // $26
      product.warranty ? JSON.stringify(product.warranty) : null, // $27
      product.buyback_value,                             // $28
      product.is_in_stock ?? false,                      // $29
      product.umrp,                                      // $30
      product.competitor_pricing ? JSON.stringify(product.competitor_pricing) : null, // $31
      product.brand_slug,                                // $32
      product.primary_image,                             // $33
      product.product_link,                              // $34
      product.is_multi_brand ?? false,                   // $35
    ]
  );
  return result;
}

// ── Public API ─────────────────────────────────────────────

/**
 * Upsert a single normalized product into global_skulytics_products.
 *
 * @param {import('./normalizers/normalizerTypes').NormalizedProduct} product
 * @param {string} syncRunId  - UUID of the current skulytics_sync_runs row
 * @param {import('pg').PoolClient} pgClient - client within an active transaction
 * @returns {Promise<'created'|'updated'|'unchanged'>}
 */
async function skulyticsUpsert(product, syncRunId, pgClient) {
  const useExtended = await _checkExtendedColumns(pgClient);

  const result = useExtended
    ? await _extendedUpsert(product, syncRunId, pgClient)
    : await _baseUpsert(product, syncRunId, pgClient);

  const row = result.rows[0];

  if (row.was_inserted) return 'created';

  return 'updated';
}

module.exports = { skulyticsUpsert, _resetColumnCache };
