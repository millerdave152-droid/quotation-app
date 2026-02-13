/**
 * Offer validation + enrichment helpers for Mirakl (Best Buy)
 */

const LOGISTIC_CLASSES = new Set(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL']);

function stripNonDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeUpc(raw) {
  if (!raw) return '';
  let digits = stripNonDigits(raw);
  // If 14-digit GTIN, strip leading zeros to UPC-A (12) when possible
  if (digits.length === 14) {
    digits = digits.replace(/^0+/, '');
  }
  return digits;
}

function getUpcCandidate(product) {
  return product.upc || '';
}

function getStockQuantity(product) {
  const candidates = [
    product.stock_quantity,
    product.qty_on_hand,
    product.quantity_in_stock,
    product.quantity,
    product.stock,
    product.qty_available
  ];
  const value = candidates.find(v => v !== null && v !== undefined);
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getPrice(product) {
  if (product.price != null) return parseFloat(product.price) || 0;
  if (product.msrp_cents != null) return parseFloat(product.msrp_cents) / 100 || 0;
  if (product.retail_price_cents != null) return parseFloat(product.retail_price_cents) / 100 || 0;
  return 0;
}

function getCategoryText(product) {
  return String(product.bestbuy_category_id || product.category || '').toLowerCase();
}

function mapLogisticClass(categoryText) {
  if (categoryText.includes('refrigerator') || categoryText.includes('range') ||
      categoryText.includes('washer') || categoryText.includes('dryer')) {
    return 'XXL';
  }
  if (categoryText.includes('dishwasher') || categoryText.includes('laundry centre')) {
    return 'XL';
  }
  if (categoryText.includes('microwave') || categoryText.includes('range hood') ||
      categoryText.includes('wall oven') || categoryText.includes('cooktop') ||
      categoryText.includes('freezer')) {
    return 'L';
  }
  if (categoryText.includes('bar fridge')) {
    return 'L';
  }
  if (categoryText.includes('vacuum') || categoryText.includes('accessori')) {
    return 'M';
  }
  return 'L';
}

function validateProductForOffer(product) {
  const errors = [];
  const warnings = [];

  const upcRaw = getUpcCandidate(product);
  const upc = normalizeUpc(upcRaw);

  if (!upc) {
    errors.push('UPC/barcode is missing');
  } else if (!(upc.length === 12 || upc.length === 13)) {
    errors.push('UPC/barcode must be 12 or 13 digits (after normalization)');
  }

  if (!product.bestbuy_category_id) {
    errors.push('bestbuy_category_id is missing');
  }

  const price = getPrice(product);
  if (!price || price <= 0) {
    errors.push('Price must be greater than 0');
  }

  const sku = String(product.sku || '').trim();
  if (!sku) {
    errors.push('SKU is missing');
  } else if (sku.length > 40) {
    errors.push('SKU exceeds 40 characters');
  }

  const name = String(product.name || '').trim();
  if (!name) {
    errors.push('Product name is missing');
  }

  const logisticClass = product.bestbuy_logistic_class;
  if (logisticClass && !LOGISTIC_CLASSES.has(String(logisticClass).toUpperCase())) {
    errors.push('bestbuy_logistic_class is invalid');
  }

  const leadtime = product.bestbuy_leadtime_to_ship;
  if (leadtime != null && parseInt(leadtime, 10) > 3) {
    errors.push('bestbuy_leadtime_to_ship must be <= 3');
  }

  const stockQty = getStockQuantity(product);
  if (stockQty < 0) {
    errors.push('Stock quantity must be >= 0');
  }

  const description = String(product.description || '').trim();
  if (description && description.length < 50) {
    warnings.push('Description is shorter than 50 characters');
  }

  if (!product.bestbuy_product_tax_code) {
    warnings.push('bestbuy_product_tax_code is missing');
  }

  const categoryText = getCategoryText(product);
  const ehfAmount = parseFloat(product.bestbuy_ehf_amount || 0) || 0;
  if (
    ehfAmount === 0 &&
    (categoryText.includes('fridge') || categoryText.includes('refrigerator') ||
     categoryText.includes('range') || categoryText.includes('washer') ||
     categoryText.includes('dryer') || categoryText.includes('dishwasher'))
  ) {
    warnings.push('bestbuy_ehf_amount is 0 for appliance category');
  }

  const discountPrice = product.marketplace_discount_price != null
    ? parseFloat(product.marketplace_discount_price)
    : null;
  if (discountPrice != null && discountPrice >= price) {
    warnings.push('marketplace_discount_price is >= regular price');
  }

  if (stockQty === 0) {
    warnings.push('Stock quantity is 0 (offer will be out of stock)');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function enrichOfferData(product) {
  const enriched = { ...product };

  const categoryText = getCategoryText(enriched);
  if (!enriched.bestbuy_logistic_class) {
    enriched.bestbuy_logistic_class = mapLogisticClass(categoryText);
  }

  if (enriched.bestbuy_leadtime_to_ship == null) {
    enriched.bestbuy_leadtime_to_ship = 2;
  }

  if (enriched.bestbuy_min_quantity_alert == null) {
    enriched.bestbuy_min_quantity_alert = 5;
  }

  if (!enriched.bestbuy_product_tax_code) {
    enriched.bestbuy_product_tax_code = 'FR020000';
  }

  const upcRaw = getUpcCandidate(enriched);
  const upc = normalizeUpc(upcRaw);
  if (upc) {
    enriched.upc = upc;
  }

  if (enriched.sku && String(enriched.sku).length > 40) {
    enriched.sku = String(enriched.sku).slice(0, 40);
  }

  return enriched;
}

function validateBulkOffers(products = []) {
  const valid = [];
  const invalid = [];
  const warnings = [];

  for (const product of products) {
    const enriched = enrichOfferData(product);
    const result = validateProductForOffer(enriched);

    if (result.valid) {
      valid.push(enriched);
    } else {
      invalid.push({ product: enriched, errors: result.errors });
    }

    if (result.warnings.length > 0) {
      warnings.push({ product: enriched, warnings: result.warnings });
    }
  }

  return {
    valid,
    invalid,
    warnings,
    summary: {
      total: products.length,
      validCount: valid.length,
      invalidCount: invalid.length,
      warningCount: warnings.length
    }
  };
}

module.exports = {
  validateProductForOffer,
  enrichOfferData,
  validateBulkOffers
};
