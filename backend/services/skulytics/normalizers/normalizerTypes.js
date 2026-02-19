/**
 * JSDoc type definitions for Skulytics normalized product output.
 *
 * Every normalizer version (v1, v2, …) MUST produce this exact shape.
 * The field list mirrors the `global_skulytics_products` table columns
 * so inserts/upserts can use the output directly.
 */

/**
 * @typedef {Object} NormalizedImage
 * @property {string}  url        - Fully-qualified image URL
 * @property {string}  type       - e.g. "primary", "thumbnail", "lifestyle", "swatch"
 * @property {number}  sort_order - 0-based display order
 */

/**
 * @typedef {Object} NormalizedProduct
 *
 * ── Identity ────────────────────────────────────────────────
 * @property {string}      skulytics_id         - Skulytics canonical product ID
 * @property {string}      api_schema_version   - Version tag of the normalizer that produced this ("v1", "v2", …)
 *
 * ── Core catalog ────────────────────────────────────────────
 * @property {string}      sku
 * @property {string|null} upc
 * @property {string}      brand
 * @property {string|null} model_number
 * @property {string|null} model_name
 *
 * ── Categorization ──────────────────────────────────────────
 * @property {string|null}   category_slug
 * @property {string[]|null} category_path
 *
 * ── Pricing ─────────────────────────────────────────────────
 * @property {number|null} msrp
 * @property {number|null} map_price
 * @property {string}      currency  - ISO 4217, defaults to "CAD"
 *
 * ── Physical dimensions (always metric) ─────────────────────
 * @property {number|null} weight_kg
 * @property {number|null} width_cm
 * @property {number|null} height_cm
 * @property {number|null} depth_cm
 *
 * ── Variants ────────────────────────────────────────────────
 * @property {string|null}  variant_group_id
 * @property {boolean}      is_variant_parent
 * @property {string|null}  parent_skulytics_id
 * @property {string|null}  variant_type
 * @property {string|null}  variant_value
 *
 * ── Status ──────────────────────────────────────────────────
 * @property {boolean}      is_discontinued
 *
 * ── Rich data (pass-through / lightly normalized) ───────────
 * @property {Object|null}        specs
 * @property {NormalizedImage[]}  images
 * @property {Object|null}        warranty
 * @property {number|null}        buyback_value
 *
 * ── Audit ───────────────────────────────────────────────────
 * @property {Object}       raw_json  - Original API payload, preserved unchanged
 */

/**
 * @typedef {Object} SkulyticsNormalizerErrorOptions
 * @property {string}  message    - Human-readable error description
 * @property {Object}  rawPayload - The raw API payload that could not be normalized
 * @property {string}  [version]  - Detected (or attempted) version string
 */

module.exports = {};
