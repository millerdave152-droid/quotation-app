'use strict';

/**
 * barcodeLookupService.js
 *
 * Fetches product data from the Barcode Lookup API (v3).
 * Primary source for CE product enrichment; Icecat is the fallback.
 *
 * Docs: https://www.barcodelookup.com/api
 *
 * Rate-limiting: the caller is responsible for pacing requests;
 * this module provides a `delay()` helper for convenience.
 */

const https = require('https');

const BARCODE_LOOKUP_BASE = 'https://api.barcodelookup.com/v3/products';
const RATE_LIMIT_DELAY_MS = 300;

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms = RATE_LIMIT_DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Perform an HTTPS GET and return the parsed JSON body.
 *
 * @param {string} url
 * @returns {Promise<Object>}
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');

        // 404 = product not found
        if (res.statusCode === 404) {
          return resolve({ _notFound: true, statusCode: 404 });
        }

        // 429 = rate limited
        if (res.statusCode === 429) {
          const err = new Error('Barcode Lookup API rate limit exceeded');
          err.statusCode = 429;
          err.body = body;
          return reject(err);
        }

        // 403 = invalid or missing API key
        if (res.statusCode === 403) {
          const err = new Error('Barcode Lookup API key invalid or missing');
          err.statusCode = 403;
          err.body = body;
          return reject(err);
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(`Barcode Lookup API returned ${res.statusCode}`);
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
      req.destroy(new Error('Barcode Lookup API request timed out (15 s)'));
    });
  });
}

/**
 * Fetch a product from Barcode Lookup by UPC/EAN.
 *
 * Uses geo=ca for Canada-market data on every call.
 *
 * @param {string} upc - UPC or EAN barcode
 * @param {Object} [options]
 * @param {string} [options.apiKey] - API key (defaults to env)
 * @returns {Promise<{ found: boolean, data: Object|null }>}
 *   data is the raw API response (contains products[] array)
 */
async function fetchByUPC(upc, options = {}) {
  const apiKey = options.apiKey || process.env.BARCODE_LOOKUP_API_KEY;
  if (!apiKey) {
    throw new Error('BARCODE_LOOKUP_API_KEY is not configured');
  }

  // Clean the UPC (strip whitespace/dashes)
  const cleaned = String(upc).replace(/[\s\-]/g, '');

  const url = `${BARCODE_LOOKUP_BASE}?barcode=${encodeURIComponent(cleaned)}&geo=ca&formatted=y&key=${encodeURIComponent(apiKey)}`;

  const result = await httpsGet(url);

  if (result._notFound) {
    return { found: false, data: null };
  }

  // API returns { products: [...] } on success
  if (!result.products || result.products.length === 0) {
    return { found: false, data: null };
  }

  return { found: true, data: result };
}

module.exports = {
  fetchByUPC,
  delay,
  RATE_LIMIT_DELAY_MS,
};
