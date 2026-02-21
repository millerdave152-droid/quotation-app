'use strict';

/**
 * pricesApiService.js
 *
 * Client for PricesAPI.io (free tier — 1,000 calls/month).
 * Searches for products by UPC and retrieves retailer offers.
 */

const https = require('https');

const API_BASE = 'https://api.pricesapi.com/v1';

// ── Helpers ─────────────────────────────────────────────────

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');

        if (res.statusCode === 404) {
          return resolve({ _notFound: true, statusCode: 404, body });
        }
        if (res.statusCode === 429) {
          const err = new Error('PricesAPI rate limit exceeded');
          err.statusCode = 429;
          err.body = body;
          return reject(err);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(`PricesAPI returned ${res.statusCode}`);
          err.statusCode = res.statusCode;
          err.body = body;
          return reject(err);
        }

        try {
          resolve(JSON.parse(body));
        } catch (parseErr) {
          parseErr.body = body;
          reject(parseErr);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('PricesAPI request timed out (15 s)'));
    });
  });
}

// ── Retailer matching ───────────────────────────────────────

/**
 * Map of normalised retailer patterns → competitor_pricing keys.
 * Keys match what CompetitorPricingPanel expects.
 */
const RETAILER_MAP = [
  { pattern: /best\s*buy/i,      key: 'best_buy' },
  { pattern: /home\s*depot/i,    key: 'home_depot' },
  { pattern: /lowe['']?s/i,      key: 'lowes' },
  { pattern: /canadian\s*tire/i, key: 'canadian_tire' },
  { pattern: /costco/i,          key: 'costco' },
  { pattern: /amazon/i,          key: 'amazon' },
  { pattern: /wayfair/i,         key: 'wayfair' },
  { pattern: /aj\s*madison/i,    key: 'aj_madison' },
  { pattern: /walmart/i,         key: 'walmart' },
];

/**
 * Match a retailer name string to a known key, or slugify it.
 */
function matchRetailer(name) {
  if (!name) return null;
  for (const { pattern, key } of RETAILER_MAP) {
    if (pattern.test(name)) return key;
  }
  // Fallback: slugify
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ── Public API ──────────────────────────────────────────────

/**
 * Search PricesAPI for a product by UPC.
 *
 * @param {string} upc
 * @returns {Promise<{ found: boolean, productId: string|null, data: Object|null }>}
 */
async function searchByUPC(upc) {
  const token = process.env.PRICES_API_KEY;
  if (!token) throw new Error('PRICES_API_KEY is not configured');

  const url = `${API_BASE}/search?query=${encodeURIComponent(upc)}&country=ca&token=${token}`;
  const result = await httpsGet(url);

  if (result._notFound) {
    return { found: false, productId: null, data: null };
  }

  // PricesAPI returns { products: [...] } or similar
  const products = result.products || result.results || result.data || [];
  if (!Array.isArray(products) || products.length === 0) {
    return { found: false, productId: null, data: null };
  }

  const first = products[0];
  const productId = first.id || first.product_id || first.asin || null;

  return { found: true, productId: productId ? String(productId) : null, data: first };
}

/**
 * Get retailer offers for a PricesAPI product ID.
 *
 * @param {string} productId
 * @returns {Promise<{ offers: Object[] }>}
 */
async function getOffers(productId) {
  const token = process.env.PRICES_API_KEY;
  if (!token) throw new Error('PRICES_API_KEY is not configured');

  const url = `${API_BASE}/products/${encodeURIComponent(productId)}/offers?country=ca&token=${token}`;
  const result = await httpsGet(url);

  if (result._notFound) {
    return { offers: [] };
  }

  const offers = result.offers || result.results || result.data || [];
  return { offers: Array.isArray(offers) ? offers : [] };
}

/**
 * Parse an array of PricesAPI offers into the CompetitorPricingPanel shape.
 *
 * Returns:
 * {
 *   best_buy:    { price: 1299, last_updated: '...' },
 *   home_depot:  { price: 1349, last_updated: '...' },
 *   ...
 *   lowest_price: 1299,
 *   is_in_stock: true
 * }
 *
 * @param {Object[]} offers - Raw PricesAPI offer objects
 * @returns {{ competitorPricing: Object, isInStock: boolean, rawOffers: Object[] }}
 */
function extractRetailerPrices(offers) {
  const now = new Date().toISOString();
  const pricing = {};
  let lowestPrice = null;
  let anyInStock = false;

  for (const offer of offers) {
    const retailerName = offer.seller || offer.merchant || offer.retailer || offer.store || offer.name;
    const key = matchRetailer(retailerName);
    if (!key) continue;

    const price = parseFloat(offer.price ?? offer.total_price ?? offer.base_price ?? 0);
    const inStock = offer.in_stock !== false
      && offer.availability !== 'out_of_stock'
      && offer.stock_status !== 'out_of_stock';

    if (inStock && price > 0) anyInStock = true;

    // Keep the lowest price per retailer
    if (!pricing[key] || (price > 0 && price < (pricing[key].price || Infinity))) {
      pricing[key] = {
        price: price > 0 ? Math.round(price) : 0,
        last_updated: offer.updated_at || offer.last_updated || now,
      };
    }

    if (price > 0 && (lowestPrice === null || price < lowestPrice)) {
      lowestPrice = price;
    }
  }

  // Add lowest_price for the panel
  if (lowestPrice !== null) {
    pricing.lowest_price = Math.round(lowestPrice);
  }

  return {
    competitorPricing: pricing,
    isInStock: anyInStock,
    rawOffers: offers,
  };
}

module.exports = {
  searchByUPC,
  getOffers,
  extractRetailerPrices,
  // Exported for testing
  _internal: { matchRetailer, httpsGet },
};
