'use strict';

/**
 * v1Normalizer.js
 *
 * Maps the real Skulytics / Appliance-Data v1 API response shape
 * to our internal NormalizedProduct.
 *
 * Also supports the legacy test format for backward compatibility.
 * See normalizerTypes.js for the output contract.
 */

// ── Helpers ─────────────────────────────────────────────────

/**
 * Parse a value to a finite number, or return null.
 */
function toNumber(val) {
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build category path as a TEXT[] array for the DB column.
 * Real API: builds from nested category/subcategory/detail_category objects.
 * Legacy: uses category.path array directly.
 */
function buildCategoryPath(raw) {
  // Real API: nested category objects
  if (raw.category?.category_name || raw.subcategory?.subcategory_name || raw.detail_category?.detail_category_name) {
    const parts = [];
    if (raw.category?.category_name) parts.push(raw.category.category_name);
    if (raw.subcategory?.subcategory_name) parts.push(raw.subcategory.subcategory_name);
    if (raw.detail_category?.detail_category_name) parts.push(raw.detail_category.detail_category_name);
    return parts; // TEXT[] — always return array
  }
  // Legacy: category.path array
  if (raw.category?.path) {
    return Array.isArray(raw.category.path) ? raw.category.path : [raw.category.path];
  }
  // Legacy: category_path
  if (raw.category_path) {
    return Array.isArray(raw.category_path) ? raw.category_path : [raw.category_path];
  }
  return null;
}

/**
 * Extract warranty info from the product_spec array.
 * Returns a structured object or null.
 */
function extractWarranty(raw) {
  // Real API: product_spec array with section="Warranty"
  const specs = raw.product_spec;
  if (Array.isArray(specs) && specs.length > 0) {
    const warrantySpecs = specs.filter(
      s => s.section && s.section.toLowerCase() === 'warranty'
    );
    if (warrantySpecs.length > 0) {
      const warranty = {};
      for (const ws of warrantySpecs) {
        const key = (ws.category || 'general').toLowerCase().replace(/\s+/g, '_');
        warranty[key] = ws.feature;
      }
      return warranty;
    }
  }
  // Legacy: direct warranty field
  return raw.warranty || null;
}

/**
 * Build competitor_pricing JSONB from price.lap object.
 */
function buildCompetitorPricing(raw) {
  const lap = raw.price?.lap;
  if (!lap || typeof lap !== 'object') return null;

  const entries = {};
  for (const [key, val] of Object.entries(lap)) {
    if (key.endsWith('_last_updated')) continue;
    if (key === 'lowest_price') continue;
    entries[key.replace('_price', '')] = {
      price: toNumber(val) || 0,
      last_updated: lap[`${key.replace('_price', '')}_last_updated`] || null,
    };
  }
  return Object.keys(entries).length > 0 ? entries : null;
}

/**
 * Normalize images from multiple possible formats.
 */
function normalizeImages(raw) {
  // Real API: product_images array
  if (Array.isArray(raw.product_images) && raw.product_images.length > 0) {
    return raw.product_images.map((img, i) => ({
      url:        img.url || '',
      type:       i === 0 ? 'primary' : 'alternate',
      sort_order: img.priority ?? i,
    }));
  }
  // Legacy: media or images array/object
  const source = raw.media ?? raw.images;
  if (!source) return [];
  if (Array.isArray(source)) {
    return source.map((img, i) => ({
      url:        img.url || img.src || img.href || '',
      type:       img.type || img.kind || img.tag || 'photo',
      sort_order: img.sort_order ?? img.sortOrder ?? img.position ?? i,
    }));
  }
  if (typeof source === 'object') {
    return Object.entries(source).map(([type, val], i) => ({
      url:        typeof val === 'string' ? val : (val?.url || ''),
      type,
      sort_order: i,
    }));
  }
  return [];
}

/**
 * Extract specs from multiple possible formats.
 */
function extractSpecs(raw) {
  const result = {};
  let hasData = false;

  // Real API: product_spec entries (excluding warranty)
  if (Array.isArray(raw.product_spec)) {
    for (const s of raw.product_spec) {
      if (s.section && s.section.toLowerCase() === 'warranty') continue;
      const key = `${s.section || 'General'} - ${s.category || 'Other'}`;
      result[key] = s.feature;
      hasData = true;
    }
  }

  // Real API: filter entries
  if (Array.isArray(raw.filter)) {
    for (const f of raw.filter) {
      if (f.field && f.value) {
        result[f.field] = f.value;
        hasData = true;
      }
    }
  }

  // Real API: product_feature entries
  if (Array.isArray(raw.product_feature) && raw.product_feature.length > 0) {
    result._features = raw.product_feature.map(f => f.value).filter(Boolean);
    hasData = true;
  }

  if (hasData) return result;

  // Legacy: specifications or specs object
  return raw.specifications ?? raw.specs ?? null;
}

// ── Main normalizer ─────────────────────────────────────────

/**
 * Normalize a single Skulytics v1 API product payload.
 * Handles both the real API shape (product_id, brand object, price)
 * and legacy test format (id, brand string, pricing).
 *
 * @param {Object} raw - Raw API response object for one product
 * @returns {import('./normalizerTypes').NormalizedProduct}
 */
function normalizeV1(raw) {
  // Identity: real API uses product_id, legacy uses id
  const skulyticsId = String(raw.product_id ?? raw.id);

  // Brand: real API uses brand.brand_name, legacy uses brand as string or brand.name
  let brand = null;
  if (typeof raw.brand === 'string') {
    brand = raw.brand;
  } else if (raw.brand?.brand_name) {
    brand = raw.brand.brand_name;
  } else if (raw.brand?.name) {
    brand = raw.brand.name;
  }

  // Pricing: real API uses price object, legacy uses pricing object or flat fields
  const msrp = toNumber(raw.price?.msrp ?? raw.pricing?.msrp ?? raw.msrp);
  const rawMap = toNumber(raw.price?.map ?? raw.pricing?.map ?? raw.map_price);
  const mapPrice = rawMap || null;
  const currency = raw.pricing?.currency ?? raw.currency ?? 'CAD';
  const umrp = toNumber(raw.price?.umrp);

  // Category slug: real API uses nested objects, legacy uses category.slug
  const categorySlug = raw.detail_category?.detail_category_slug
    || raw.subcategory?.subcategory_slug
    || raw.category?.category_slug
    || raw.category?.slug
    || raw.category_slug
    || null;

  // Status: real API uses status string, legacy uses discontinued boolean
  const isDiscontinued = raw.status === 'Discontinued'
    || raw.discontinued === true;

  // In-stock: real API uses price.in_stock_status
  const isInStock = raw.price?.in_stock_status === 1;

  // Model number: real API doesn't have one separately, use sku
  const modelNumber = raw.modelNumber ?? raw.model_number ?? raw.sku;

  return {
    // Identity
    skulytics_id:        skulyticsId,
    api_schema_version:  'v1',

    // Core catalog
    sku:                 raw.sku,
    upc:                 raw.upc ?? raw.barcode ?? null,
    brand:               brand,
    model_number:        modelNumber,
    model_name:          raw.name ?? raw.title ?? raw.basic_description ?? null,

    // Categorization
    category_slug:       categorySlug,
    category_path:       buildCategoryPath(raw),

    // Pricing
    msrp:                msrp,
    map_price:           mapPrice,
    currency:            currency,

    // New pricing fields
    umrp:                umrp,
    is_in_stock:         isInStock,
    competitor_pricing:  buildCompetitorPricing(raw),

    // Physical dimensions (not in real API; legacy may have them)
    weight_kg:           null,
    width_cm:            null,
    height_cm:           null,
    depth_cm:            null,

    // Variants
    variant_group_id:    raw.variantGroupId ?? raw.variant_group_id ?? null,
    is_variant_parent:   raw.isVariantParent ?? raw.is_variant_parent ?? false,
    parent_skulytics_id: raw.parentId ?? raw.parent_skulytics_id ?? null,
    variant_type:        raw.variantType ?? raw.variant_type ?? (raw.color ? 'color' : null),
    variant_value:       raw.variantValue ?? raw.variant_value ?? raw.color ?? null,

    // Status
    is_discontinued:     isDiscontinued,

    // Rich data
    specs:               extractSpecs(raw),
    images:              normalizeImages(raw),
    warranty:            extractWarranty(raw),
    buyback_value:       toNumber(raw.buybackValue ?? raw.buyback_value),

    // New fields
    brand_slug:          raw.brand?.brand_slug ?? null,
    primary_image:       raw.image ?? null,
    product_link:        raw.link ?? null,
    is_multi_brand:      raw.is_multi_brand === 1,

    // Audit — always the full original payload, untouched
    raw_json:            raw,
  };
}

module.exports = {
  normalizeV1,
  // Exported for unit-testing internal helpers
  _internal: {
    toNumber,
    buildCategoryPath,
    extractWarranty,
    buildCompetitorPricing,
    normalizeImages,
    extractSpecs,
  },
};
