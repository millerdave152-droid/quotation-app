'use strict';

/**
 * icecatService.js
 *
 * Fetches product data from the Icecat Open (free-tier) REST API.
 * Free tier requires only a username — no API key needed.
 *
 * Rate-limiting: the caller is responsible for pacing requests;
 * this module provides a `delay()` helper for convenience.
 */

const https = require('https');

const ICECAT_BASE = 'https://live.icecat.biz/api';
const DEFAULT_LANG = 'EN';
const RATE_LIMIT_DELAY_MS = 300;

/**
 * Normalize a UPC/EAN barcode for Icecat GTIN lookup.
 *
 * - Strips whitespace and dashes
 * - 12-digit UPC-A → prepend 0 to make 13-digit EAN-13 (Icecat expects EAN-13)
 * - 13-digit EAN-13 → use as-is
 * - 14-digit GTIN-14 → strip leading 0
 *
 * Returns { gtin, upcA }:
 *   gtin — the 13-digit EAN-13 to send to Icecat
 *   upcA — the 12-digit UPC-A for storage (Best Buy Canada, PricesAPI matching)
 *
 * @param {string} raw
 * @returns {{ gtin: string, upcA: string }}
 */
function normalizeUPC(raw) {
  const cleaned = String(raw).replace(/[\s\-]/g, '');

  let gtin;
  let upcA;

  if (cleaned.length === 12) {
    // UPC-A → pad to EAN-13 for Icecat
    gtin = '0' + cleaned;
    upcA = cleaned;
  } else if (cleaned.length === 13) {
    gtin = cleaned;
    // Derive UPC-A: if it starts with 0 the trailing 12 digits are the UPC-A
    upcA = cleaned.startsWith('0') ? cleaned.substring(1) : cleaned;
  } else if (cleaned.length === 14) {
    // GTIN-14 → strip leading 0 to get EAN-13
    gtin = cleaned.substring(1);
    upcA = gtin.startsWith('0') ? gtin.substring(1) : gtin;
  } else {
    // Non-standard length — pass through as-is
    gtin = cleaned;
    upcA = cleaned;
  }

  return { gtin, upcA };
}

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
 * Rejects on network errors or non-2xx status codes.
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

        if (res.statusCode === 404) {
          return resolve({ _notFound: true, statusCode: 404, body });
        }
        // Icecat v2 API returns 400 for "GTIN not found" — treat as not-found
        if (res.statusCode === 400) {
          try {
            const parsed = JSON.parse(body);
            // StatusCode 16 = "GTIN not found" in Icecat's error taxonomy
            if (parsed.StatusCode === 16 || (parsed.Message && parsed.Message.toLowerCase().includes('not be found'))) {
              return resolve({ _notFound: true, statusCode: 400, body });
            }
          } catch (_) { /* not JSON, fall through */ }
          const err = new Error(`Icecat API returned 400: ${body.substring(0, 200)}`);
          err.statusCode = 400;
          err.body = body;
          return reject(err);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(`Icecat API returned ${res.statusCode}`);
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
      req.destroy(new Error('Icecat API request timed out (15 s)'));
    });
  });
}

/**
 * Fetch a single product from Icecat by UPC / EAN code.
 *
 * The UPC is automatically normalized (12→13 digit padding, whitespace/dash
 * stripping) before calling the Icecat API.
 *
 * @param {string} upc - UPC or EAN barcode (any common format)
 * @param {Object} [options]
 * @param {string} [options.username] - Icecat username (defaults to env)
 * @param {string} [options.lang]     - Language code (defaults to "EN")
 * @returns {Promise<{ found: boolean, data: Object|null, upcA: string }>}
 *   upcA is the 12-digit UPC-A (for DB storage / Best Buy / PricesAPI matching)
 */
async function fetchByUPC(upc, options = {}) {
  const username = options.username || process.env.ICECAT_USERNAME;
  if (!username) {
    throw new Error('ICECAT_USERNAME is not configured');
  }

  const { gtin, upcA } = normalizeUPC(upc);
  const lang = options.lang || DEFAULT_LANG;
  const url = `${ICECAT_BASE}?shopname=${encodeURIComponent(username)}&lang=${lang}&GTIN=${encodeURIComponent(gtin)}&content=`;

  const result = await httpsGet(url);

  // 404 page or HTML error
  if (result._notFound) {
    return { found: false, data: null, upcA };
  }

  // Icecat v2 API returns { StatusCode, Code, Error, Message } on error
  if (result.Code === 400 || result.Code === 404 || result.StatusCode === 16) {
    return { found: false, data: null, upcA };
  }

  // Legacy Icecat error codes
  if (result.Code === 'ProductNotFound' || result.ErrorMessage) {
    return { found: false, data: null, upcA };
  }

  // Success: v2 API wraps data in { msg: "OK", data: { ... } }
  if (result.msg === 'OK' && result.data) {
    return { found: true, data: result.data, upcA };
  }

  // Fallback: return raw result
  return { found: true, data: result, upcA };
}

module.exports = {
  fetchByUPC,
  normalizeUPC,
  delay,
  RATE_LIMIT_DELAY_MS,
};
