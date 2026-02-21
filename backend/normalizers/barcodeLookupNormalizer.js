'use strict';

/**
 * barcodeLookupNormalizer.js
 *
 * Maps a Barcode Lookup API (v3) product response into TeleTime's
 * internal products-table structure.
 *
 * Barcode Lookup payload shape (relevant paths):
 *   products[0].barcode_number       → upc
 *   products[0].product_name         → product_name
 *   products[0].brand                → brand_name
 *   products[0].model                → sku
 *   products[0].description          → description
 *   products[0].stores[].store_price → msrp (first available price as fallback)
 *   products[0].images[0]            → image_url
 *   products[0].images[]             → additional_images
 *   products[0].category             → category
 *   products[0].specifications[]     → ce_specs (key/value JSONB)
 */

// ── Helpers ─────────────────────────────────────────────────

/**
 * Parse a value to a finite positive number, or return null.
 */
function toNumber(val) {
  if (val == null || val === '') return null;
  const n = Number(String(val).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Extract the best available price from the stores array.
 * Prefers manufacturer_suggested_retail_price, then falls back to
 * the lowest store price.
 *
 * @param {Object} product - Single product object from API
 * @returns {number|null} Price in dollars, or null
 */
function extractMSRP(product) {
  if (!product) return null;

  // Check for explicit manufacturer price fields
  const mfgPrice = toNumber(product.manufacturer_suggested_retail_price)
    || toNumber(product.msrp);
  if (mfgPrice) return mfgPrice;

  // Fall back to first available store price
  if (Array.isArray(product.stores) && product.stores.length > 0) {
    for (const store of product.stores) {
      const price = toNumber(store.store_price || store.price);
      if (price) return price;
    }
  }

  return null;
}

/**
 * Convert the specifications array into a flat { key: value } object for ce_specs.
 *
 * Barcode Lookup shape: [ "Key: Value", "Key: Value", ... ]
 * or sometimes: [ { key: "...", value: "..." }, ... ]
 *
 * @param {Array} specs
 * @returns {Object|null}
 */
function flattenSpecifications(specs) {
  if (!Array.isArray(specs) || specs.length === 0) return null;

  const result = {};
  let hasData = false;

  for (const spec of specs) {
    if (typeof spec === 'string') {
      // "Key: Value" format
      const colonIdx = spec.indexOf(':');
      if (colonIdx > 0) {
        const key = spec.substring(0, colonIdx).trim();
        const value = spec.substring(colonIdx + 1).trim();
        if (key && value) {
          result[key] = value;
          hasData = true;
        }
      }
    } else if (spec && typeof spec === 'object') {
      // { key: "...", value: "..." } format
      const key = spec.key || spec.name || spec.attribute;
      const value = spec.value || spec.val;
      if (key && value != null && value !== '') {
        result[String(key)] = String(value);
        hasData = true;
      }
    }
  }

  return hasData ? result : null;
}

/**
 * Collect images from the images array.
 * Returns { primary, additional } where primary is the first image
 * and additional is the rest (or null if empty).
 *
 * @param {Array} images
 * @returns {{ primary: string|null, additional: string[]|null }}
 */
function collectImages(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return { primary: null, additional: null };
  }

  const validImages = images.filter(img => typeof img === 'string' && img.length > 0);
  if (validImages.length === 0) {
    return { primary: null, additional: null };
  }

  const primary = validImages[0];
  const additional = validImages.length > 1 ? validImages : null;

  return { primary, additional };
}

// ── Main normalizer ─────────────────────────────────────────

/**
 * Normalize a single Barcode Lookup API product response into TeleTime's
 * products-table shape.
 *
 * @param {Object} raw - Full Barcode Lookup API response (contains products[])
 * @returns {Object} Normalized product ready for INSERT/UPDATE
 */
function normalizeBarcodeProduct(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('barcodeLookupNormalizer: expected an object, got ' + typeof raw);
  }

  // Extract first product from the response
  const products = raw.products || raw;
  const product = Array.isArray(products) ? products[0] : products;

  if (!product || typeof product !== 'object') {
    throw new Error('barcodeLookupNormalizer: no product data found in response');
  }

  const { primary: imageUrl, additional: additionalImages } = collectImages(product.images);
  const ceSpecs = flattenSpecifications(product.specifications);
  const msrp = extractMSRP(product);

  return {
    upc:                product.barcode_number || null,
    product_name:       product.product_name || product.title || null,
    brand_name:         product.brand || null,
    sku:                product.model || product.mpn || null,
    description:        product.description || null,
    msrp:               msrp,
    image_url:          imageUrl,
    additional_images:  additionalImages,
    category:           product.category || null,
    ce_specs:           ceSpecs,
    data_source:        'barcode_lookup',
    status:             'active',
  };
}

module.exports = {
  normalizeBarcodeProduct,
  _internal: {
    toNumber,
    extractMSRP,
    flattenSpecifications,
    collectImages,
  },
};
