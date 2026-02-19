'use strict';

/**
 * Skulytics Normalizer Router
 *
 * Detects the API schema version of an incoming raw payload and dispatches
 * to the matching versioned normalizer.  If the version cannot be determined,
 * throws SkulyticsNormalizerError with the raw payload attached for logging.
 */

const { normalizeV1 } = require('./v1Normalizer');

// ── Custom error ────────────────────────────────────────────

class SkulyticsNormalizerError extends Error {
  /**
   * @param {string} message
   * @param {Object} rawPayload  - the unparseable payload (for logging)
   * @param {string} [version]   - version that was attempted, if any
   */
  constructor(message, rawPayload, version) {
    super(message);
    this.name = 'SkulyticsNormalizerError';
    this.rawPayload = rawPayload;
    this.version = version || null;
  }
}

// ── Version detection ───────────────────────────────────────

/**
 * Structural markers that identify the v1 payload shape:
 *
 *   - Real API has `product_id` (number) + `sku` (string)
 *   - Legacy/test payloads may use `id` (string) + `sku`
 *   - v1 nests pricing in a `price` object with `msrp`, `map`, `umrp`
 *
 * Future versions will add their own heuristic checks here.
 *
 * @param {Object} raw
 * @returns {string|null} - detected version string or null
 */
function detectVersion(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // ── v1 detection ──────────────────────────────────────────
  const hasProductId = typeof raw.product_id === 'number' || typeof raw.product_id === 'string';
  const hasLegacyId  = typeof raw.id === 'string' || typeof raw.id === 'number';
  const hasSku       = typeof raw.sku === 'string';

  if ((hasProductId || hasLegacyId) && hasSku) {
    // Negative check: if it has v2+ markers, skip v1
    if (raw.schemaVersion && raw.schemaVersion !== 'v1') return raw.schemaVersion;

    return 'v1';
  }

  return null;
}

// ── Dispatcher ──────────────────────────────────────────────

/** @type {Record<string, (raw: Object) => import('./normalizerTypes').NormalizedProduct>} */
const normalizers = {
  v1: normalizeV1,
  // v2: normalizeV2,  — add here when available
};

/**
 * Normalize a single raw Skulytics API product payload.
 *
 * @param {Object} raw - Raw API response for one product
 * @returns {import('./normalizerTypes').NormalizedProduct}
 * @throws {SkulyticsNormalizerError} if the version cannot be detected or is unsupported
 */
function normalize(raw) {
  const version = detectVersion(raw);

  if (!version) {
    throw new SkulyticsNormalizerError(
      'Unable to detect Skulytics API schema version from payload',
      raw
    );
  }

  const handler = normalizers[version];
  if (!handler) {
    throw new SkulyticsNormalizerError(
      `Unsupported Skulytics API schema version: ${version}`,
      raw,
      version
    );
  }

  return handler(raw);
}

/**
 * Normalize an array of raw API payloads, collecting errors instead of throwing.
 *
 * @param {Object[]} items - Array of raw API product objects
 * @returns {{ results: import('./normalizerTypes').NormalizedProduct[], errors: Array<{index: number, error: Error, raw: Object}> }}
 */
function normalizeBatch(items) {
  const results = [];
  const errors = [];

  for (let i = 0; i < items.length; i++) {
    try {
      results.push(normalize(items[i]));
    } catch (err) {
      errors.push({ index: i, error: err, raw: items[i] });
    }
  }

  return { results, errors };
}

module.exports = {
  normalize,
  normalizeBatch,
  detectVersion,
  SkulyticsNormalizerError,
};
