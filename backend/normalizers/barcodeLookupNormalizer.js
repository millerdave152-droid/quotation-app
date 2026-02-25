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
 * Check if a token is a measurement/specification, not a model code.
 * Examples: 42dB, 240V, 65", 3.1.2ch, 60Hz, 1200W
 *
 * @param {string} tok
 * @returns {boolean}
 */
function isMeasurement(tok) {
  if (!tok) return false;
  // digit(s) followed by a unit suffix
  if (/^\d+(\.\d+)*\s*(dB|Hz|kHz|MHz|GHz|V|W|BTU|lb|kg|cm|mm|in|ft|gal|ch|L|"|"|°|CFM|RPM|Amp|GB|TB|MB|KB|MP|cu|qt|oz)$/i.test(tok)) return true;
  // Quoted measurement like 24"
  if (/^\d+[""]$/.test(tok)) return true;
  return false;
}

/**
 * Check if a token looks like a consumer model code.
 *
 * Model codes: ≥3 chars, mix of letters+digits, not a measurement or tech term.
 * Examples: HW-Q900C, KOST100ESS, UN65U8000FFXZC, DW80B7070AP/AC
 *
 * @param {string} tok
 * @returns {boolean}
 */
function looksLikeModel(tok) {
  if (!tok || tok.length < 3) return false;
  // Must contain at least one letter AND one digit
  if (!/[A-Za-z]/.test(tok) || !/[0-9]/.test(tok)) return false;
  // Skip pure numbers
  if (/^\d+(\.\d+)?$/.test(tok)) return false;
  // Skip measurement tokens
  if (isMeasurement(tok)) return false;
  // Skip generic tech terms that mix letters and digits
  if (/^(Wi-?Fi\d?|USB\d?|Bluetooth\d?|HDMI\d?|Dolby|ATMOS|UHD|OLED|QLED|NanoCell)$/i.test(tok)) return false;
  return true;
}

// Common brand names to skip when scanning for model codes
const SKIP_BRANDS = new Set([
  'SAMSUNG', 'LG', 'SONY', 'KITCHENAID', 'WHIRLPOOL', 'BOSCH', 'GE',
  'FRIGIDAIRE', 'MAYTAG', 'PANASONIC', 'TOSHIBA', 'SHARP', 'HISENSE',
  'TCL', 'VIZIO', 'BOSE', 'JBL', 'PHILIPS', 'ELECTROLUX', 'KENMORE',
  'MIELE', 'FISHER', 'PAYKEL', 'BREVILLE', 'DYSON', 'CUISINART',
  'DELONGHI', 'LENOVO', 'DELL', 'ASUS', 'ACER', 'PLAYSTATION', 'XBOX',
  'NINTENDO', 'STUDIO', 'BUNDLE',
]);

/**
 * Extract the consumer-facing model number from the product title.
 *
 * Product titles typically place the model code near the brand name:
 *   "Samsung HW-Q900C Wireless Dolby ATMOS Soundbar (2023)"
 *   "KitchenAid 30" Stainless Steel Wall Oven - KOST100ESS"
 *   "65" UHD 4K Smart TV (UN65U8000FFXZC) in Black"
 *
 * Strategy:
 *  1. Walk FORWARD through the title tokens looking for dash-containing
 *     model codes (strongest signal — e.g. HW-Q900C, QN-65Q80C).
 *  2. Walk FORWARD for alphanumeric model codes (≥4 chars), skipping the
 *     MPN if a better candidate exists.
 *  3. If nothing found in title, fall back to rawModel or MPN.
 *
 * @param {string|null} title    - Product title / name
 * @param {string|null} mpn      - Manufacturer Part Number from API
 * @param {string|null} rawModel - API's model field (may equal MPN)
 * @returns {string|null} Best-guess consumer model number
 */
function extractModelFromTitle(title, mpn, rawModel) {
  if (!title) return rawModel || mpn || null;

  // Tokenise: split on spaces, commas, pipes but PRESERVE dashes and slashes
  // within tokens (model codes like HW-Q900C and DW80B7070AP/AC need them).
  // Strip surrounding parentheses/brackets from each token.
  const tokens = title
    .split(/[\s,|]+/)
    .map(t => t.replace(/^[(\[{]+|[)\]}]+$/g, '').trim())
    .filter(Boolean);

  const mpnUpper = mpn ? mpn.toUpperCase() : null;

  // First pass (FORWARD): dash-containing model codes — strongest signal
  // Consumer models with dashes: HW-Q900C, QN-65Q80C, WF-1000XM5, DW80B7070AP/AC
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.includes('-') && looksLikeModel(tok)) {
      const tokUpper = tok.toUpperCase();
      if (SKIP_BRANDS.has(tokUpper)) continue;
      return tok;
    }
  }

  // Second pass (FORWARD): alphanumeric model codes (≥4 chars)
  // Skip the exact MPN if we find another good candidate
  let mpnToken = null;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.length >= 4 && looksLikeModel(tok)) {
      const tokUpper = tok.toUpperCase();
      if (SKIP_BRANDS.has(tokUpper)) continue;
      // Remember if we see the MPN, but prefer a non-MPN candidate
      if (mpnUpper && tokUpper === mpnUpper) {
        mpnToken = tok;
        continue;
      }
      return tok;
    }
  }

  // If the only model-like token was the MPN itself, use it (it IS the model)
  if (mpnToken) return mpnToken;

  // Fall back to rawModel or MPN
  return rawModel || mpn || null;
}

/**
 * Extract physical attributes (color, weight, dimensions) from the API
 * product object and merge them into a ce_specs object.
 *
 * @param {Object} product - Single product from API
 * @param {Object|null} existingSpecs - Already-flattened specifications
 * @returns {Object|null} Merged specs
 */
function mergePhysicalAttributes(product, existingSpecs) {
  const attrs = {};
  let hasNew = false;

  if (product.color) { attrs['Color'] = product.color; hasNew = true; }
  if (product.weight) { attrs['Weight'] = `${product.weight}`; hasNew = true; }
  if (product.length) { attrs['Length'] = `${product.length}`; hasNew = true; }
  if (product.width)  { attrs['Width']  = `${product.width}`;  hasNew = true; }
  if (product.height) { attrs['Height'] = `${product.height}`; hasNew = true; }

  if (!hasNew && !existingSpecs) return null;

  // Physical attrs first, then specification overrides
  return { ...attrs, ...(existingSpecs || {}) };
}

/**
 * Normalise the stores array into a clean online_prices list.
 *
 * @param {Array} stores - Stores array from Barcode Lookup API
 * @returns {Array|null} Cleaned store pricing entries, or null
 */
function normalizeStorePricing(stores) {
  if (!Array.isArray(stores) || stores.length === 0) return null;

  const prices = [];
  for (const s of stores) {
    if (!s || typeof s !== 'object') continue;
    prices.push({
      name:         s.store_name || s.name || null,
      price:        s.store_price || s.price || null,
      sale_price:   s.sale_price || null,
      currency:     s.currency || s.currency_code || null,
      link:         s.product_url || s.link || null,
      availability: s.availability || null,
      condition:    s.condition || null,
      country:      s.country || null,
      last_update:  s.last_update || null,
    });
  }

  return prices.length > 0 ? prices : null;
}

/**
 * Collect extended barcode attributes that don't map to dedicated columns.
 *
 * The Barcode Lookup API v3 returns many optional fields beyond the core
 * product data.  We gather them into a single JSONB blob so nothing is lost.
 *
 * @param {Object} product - Single product from API
 * @returns {Object|null} Attributes object, or null if nothing to store
 */
function collectAttributes(product) {
  if (!product || typeof product !== 'object') return null;

  const ATTR_FIELDS = [
    'age_group', 'ingredients', 'nutrition_facts',
    'energy_efficiency_class', 'gender', 'material',
    'pattern', 'format', 'multipack', 'size',
    'release_date', 'last_update', 'asin',
    'contributors', 'features', 'reviews',
  ];

  const attrs = {};
  let hasData = false;

  for (const field of ATTR_FIELDS) {
    const val = product[field];
    if (val == null) continue;

    // Skip empty strings
    if (typeof val === 'string' && val.trim() === '') continue;

    // Skip empty arrays
    if (Array.isArray(val) && val.length === 0) continue;

    attrs[field] = val;
    hasData = true;
  }

  return hasData ? attrs : null;
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
  const flatSpecs = flattenSpecifications(product.specifications);
  const ceSpecs = mergePhysicalAttributes(product, flatSpecs);
  const msrp = extractMSRP(product);
  const barcodeAttributes = collectAttributes(product);

  const rawMpn = product.mpn || null;
  const rawModel = product.model || null;
  const title = product.product_name || product.title || null;

  // Extract the real consumer model — prefer title extraction over MPN
  // Pass rawModel so the extractor can decide if it's trustworthy
  const extractedModel = extractModelFromTitle(title, rawMpn, rawModel);
  const sku = extractedModel || rawMpn || null;

  // Enrich ce_specs with MPN, manufacturer, and additional images for search
  const enrichedSpecs = { ...(ceSpecs || {}) };
  if (rawMpn) enrichedSpecs['MPN'] = rawMpn;
  if (rawModel && rawModel !== extractedModel) enrichedSpecs['API Model'] = rawModel;
  if (product.manufacturer) enrichedSpecs['Manufacturer'] = product.manufacturer;
  if (product.asin) enrichedSpecs['ASIN'] = product.asin;
  if (additionalImages) enrichedSpecs['Additional Images'] = JSON.stringify(additionalImages);

  return {
    upc:                product.barcode_number || null,
    product_name:       title,
    brand_name:         product.brand || null,
    model:              extractedModel,
    mpn:                rawMpn,
    sku:                sku,                   // backward compat (= model)
    description:        product.description || null,
    msrp:               msrp,
    image_url:          imageUrl,
    additional_images:  additionalImages,
    category:           product.category || null,
    ce_specs:           Object.keys(enrichedSpecs).length > 0 ? enrichedSpecs : null,
    color:              product.color || null,
    online_prices:      normalizeStorePricing(product.stores),
    barcode_formats:    product.barcode_formats || null,
    barcode_attributes: barcodeAttributes,
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
    extractModelFromTitle,
    mergePhysicalAttributes,
    normalizeStorePricing,
    collectAttributes,
    isMeasurement,
    looksLikeModel,
  },
};
