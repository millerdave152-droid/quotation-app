'use strict';

/**
 * icecatNormalizer.js
 *
 * Maps an Open Icecat (free-tier) API product response into TeleTime's
 * internal products-table structure.
 *
 * Icecat payload shape (relevant paths):
 *   data.GeneralInfo.Brand
 *   data.GeneralInfo.BrandPartCode      → sku
 *   data.GeneralInfo.IcecatId           → icecat_product_id
 *   data.GeneralInfo.Description.LongDesc
 *   data.GeneralInfo.SuggestedRetailPrice.Value → msrp
 *   data.GeneralInfo.ReleaseDate
 *   data.Image.HighPic                  → primary image
 *   data.FeaturesGroups[]               → ce_specs (flattened)
 *   data.Multimedia[]                   → additional images
 *   data.ProductGallery[]               → gallery images
 *   data.EanCode                        → upc
 */

// ── Helpers ─────────────────────────────────────────────────

/**
 * Safely reach into a nested path, returning null if any segment is missing.
 */
function dig(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[k];
  }
  return cur ?? null;
}

/**
 * Parse a value to a finite number, or return null.
 */
function toNumber(val) {
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * Flatten Icecat FeaturesGroups into a flat { key: value } object for ce_specs.
 *
 * Icecat shape:
 *   FeaturesGroups[].FeatureGroup.Name.Value          → group name
 *   FeaturesGroups[].Features[].Feature.Name.Value     → feature name
 *   FeaturesGroups[].Features[].PresentationValue      → display value
 *   FeaturesGroups[].Features[].Value                  → raw value
 *
 * Produces: { "Display - Screen size": "55\"", "Audio - Watts": "20", … }
 */
function flattenFeatureGroups(groups) {
  if (!Array.isArray(groups) || groups.length === 0) return null;

  const specs = {};
  let hasData = false;

  for (const group of groups) {
    const groupName = dig(group, 'FeatureGroup', 'Name', 'Value')
      || dig(group, 'FeatureGroup', 'Name')
      || 'General';

    const features = group.Features;
    if (!Array.isArray(features)) continue;

    for (const feat of features) {
      const featureName = dig(feat, 'Feature', 'Name', 'Value')
        || dig(feat, 'Feature', 'Name');
      if (!featureName) continue;

      // Prefer the formatted PresentationValue; fall back to raw Value
      const value = feat.PresentationValue
        || feat.Value
        || dig(feat, 'LocalValue', 0, 'Value')
        || null;

      if (value == null || value === '') continue;

      const key = typeof groupName === 'string'
        ? `${groupName} - ${featureName}`
        : featureName;

      specs[key] = String(value);
      hasData = true;
    }
  }

  return hasData ? specs : null;
}

/**
 * Collect additional images from Multimedia and ProductGallery arrays.
 * Returns a JSON-serialisable array of URL strings, or null if empty.
 */
function collectAdditionalImages(data) {
  const urls = [];
  const seen = new Set();

  const add = (url) => {
    if (typeof url === 'string' && url.length > 0 && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };

  // Multimedia — videos / extra images
  if (Array.isArray(data.Multimedia)) {
    for (const m of data.Multimedia) {
      add(m.Url || m.url || m.ContentUrl);
    }
  }

  // ProductGallery
  if (Array.isArray(data.ProductGallery)) {
    for (const img of data.ProductGallery) {
      add(img.Pic || img.HighPic || img.Pic500x500 || img.ThumbPic);
    }
  }

  // Gallery (alternate key used by some Icecat versions)
  if (Array.isArray(data.Gallery)) {
    for (const img of data.Gallery) {
      add(img.Pic || img.HighPic || img.Pic500x500);
    }
  }

  return urls.length > 0 ? urls : null;
}

// ── Main normalizer ─────────────────────────────────────────

/**
 * Normalize a single Icecat API product payload into TeleTime's
 * products-table shape.
 *
 * @param {Object} raw - Full Icecat API response (the `data` envelope or the
 *                        top-level object that contains `GeneralInfo`, etc.)
 * @returns {Object} Normalized product ready for INSERT/UPDATE
 */
function normalizeIcecatProduct(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('icecatNormalizer: expected an object, got ' + typeof raw);
  }

  // Icecat responses may be wrapped in a `data` key or provided flat
  const data = raw.data && raw.data.GeneralInfo ? raw.data : raw;

  const info = data.GeneralInfo || {};
  const desc = info.Description || {};
  const price = info.SuggestedRetailPrice || {};
  const image = data.Image || {};

  // Brand — may be a string or an object with a Name/Value shape
  let brandName = null;
  if (typeof info.Brand === 'string') {
    brandName = info.Brand;
  } else if (info.Brand?.Name) {
    brandName = typeof info.Brand.Name === 'object'
      ? info.Brand.Name.Value || null
      : info.Brand.Name;
  } else if (info.BrandInfo?.BrandName) {
    brandName = info.BrandInfo.BrandName;
  }

  // SKU — BrandPartCode is the manufacturer part number
  const sku = info.BrandPartCode || info.MPN || null;

  // UPC / EAN
  const upc = data.EanCode
    || data.GTIN
    || (Array.isArray(info.GTIN) && info.GTIN[0])
    || null;

  // Description
  const description = desc.LongDesc
    || desc.ShortDesc
    || desc.LongDescription
    || desc.ShortDescription
    || info.Title
    || info.ProductName
    || null;

  // MSRP
  const msrp = toNumber(price.Value) || toNumber(price.price) || null;

  // Primary image
  const imageUrl = image.HighPic
    || image.MediumPic
    || image.LowPic
    || image.ThumbPic
    || null;

  // Additional images
  const additionalImages = collectAdditionalImages(data);

  // Flatten specs
  const ceSpecs = flattenFeatureGroups(data.FeaturesGroups || data.FeatureGroups);

  // Icecat product ID
  const icecatProductId = String(
    info.IcecatId || info.ProductID || info.productId || ''
  ) || null;

  // Release date (keep as-is, let the caller decide on formatting)
  const releaseDate = info.ReleaseDate || null;

  return {
    brand_name:          brandName,
    sku:                 sku,
    upc:                 typeof upc === 'string' ? upc : (upc != null ? String(upc) : null),
    description:         description,
    msrp:                msrp,
    image_url:           imageUrl,
    additional_images:   additionalImages,
    ce_specs:            ceSpecs,
    icecat_product_id:   icecatProductId,
    data_source:         'icecat',
    status:              'active',

    // Bonus fields — useful metadata callers may want
    release_date:        releaseDate,
    product_name:        info.ProductName || info.Title || null,
    currency:            price.Currency || null,
  };
}

module.exports = {
  normalizeIcecatProduct,
  // Exported for unit-testing internal helpers
  _internal: {
    dig,
    toNumber,
    flattenFeatureGroups,
    collectAdditionalImages,
  },
};
