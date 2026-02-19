'use strict';

/**
 * SkulyticsApiClient.js
 *
 * HTTP client wrapping the Skulytics product catalogue API.
 * Reads credentials from environment variables. Surfaces typed errors
 * so callers can react to rate-limits, unavailability, and auth issues
 * without parsing raw HTTP responses.
 */

const axios = require('axios');

// ── Typed errors ────────────────────────────────────────────

class SkulyticsApiError extends Error {
  /**
   * @param {string} message
   * @param {number|null} statusCode
   * @param {*} responseBody
   */
  constructor(message, statusCode = null, responseBody = null) {
    super(message);
    this.name = 'SkulyticsApiError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

class SkulyticsRateLimitError extends SkulyticsApiError {
  /**
   * @param {number} retryAfterMs - milliseconds until the rate-limit window resets
   * @param {*} responseBody
   */
  constructor(retryAfterMs, responseBody = null) {
    super(`Skulytics rate limit exceeded — retry after ${retryAfterMs}ms`, 429, responseBody);
    this.name = 'SkulyticsRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

class SkulyticsUnavailableError extends SkulyticsApiError {
  /**
   * @param {string} message
   * @param {number|null} statusCode
   * @param {*} responseBody
   */
  constructor(message, statusCode = null, responseBody = null) {
    super(message, statusCode, responseBody);
    this.name = 'SkulyticsUnavailableError';
  }
}

// ── Client ──────────────────────────────────────────────────

class SkulyticsApiClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.apiKey]     - override env SKULYTICS_API_KEY
   * @param {string} [options.baseUrl]    - override env SKULYTICS_API_BASE_URL
   * @param {number} [options.timeoutMs]  - request timeout (default 30 000)
   */
  constructor(options = {}) {
    this.apiKey  = options.apiKey  || process.env.SKULYTICS_API_KEY;
    this.baseUrl = options.baseUrl
      || process.env.SKULYTICS_API_BASE_URL
      || 'https://api.appliance-data.com';

    if (!this.apiKey) {
      throw new Error('SKULYTICS_API_KEY is required (env var or options.apiKey)');
    }

    this.client = axios.create({
      baseURL: this.baseUrl.replace(/\/+$/, ''),
      timeout: options.timeoutMs || 30_000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json',
      },
    });
  }

  // ── Rate-limit header parsing ─────────────────────────────

  /**
   * Extract rate-limit metadata from response headers.
   *
   * Common header schemes:
   *   X-RateLimit-Remaining / X-RateLimit-Reset (epoch seconds)
   *   RateLimit-Remaining  / RateLimit-Reset    (delta seconds)
   *   Retry-After                               (delta seconds or HTTP-date)
   *
   * @param {import('axios').AxiosResponse} response
   * @returns {{ remaining: number, resetMs: number }}
   */
  _parseRateLimitHeaders(response) {
    const headers = response.headers || {};

    const remaining = parseInt(
      headers['x-ratelimit-remaining'] ??
      headers['ratelimit-remaining'] ??
      '9999',
      10
    );

    let resetMs = 0;
    const resetRaw =
      headers['x-ratelimit-reset'] ??
      headers['ratelimit-reset'] ??
      headers['retry-after'];

    if (resetRaw) {
      const parsed = Number(resetRaw);
      if (Number.isFinite(parsed)) {
        // If > 1e9 treat as epoch seconds, otherwise delta seconds
        resetMs = parsed > 1_000_000_000
          ? Math.max(0, parsed * 1000 - Date.now())
          : parsed * 1000;
      }
    }

    return {
      remaining: Number.isFinite(remaining) ? remaining : 9999,
      resetMs,
    };
  }

  // ── Error mapping ─────────────────────────────────────────

  /**
   * Convert an axios error into the appropriate typed Skulytics error.
   * @param {import('axios').AxiosError} err
   * @throws {SkulyticsRateLimitError|SkulyticsUnavailableError|SkulyticsApiError}
   */
  _handleError(err) {
    if (!err.response) {
      // Network error / timeout / DNS failure
      throw new SkulyticsUnavailableError(
        `Skulytics API unreachable: ${err.message}`,
        null,
        null
      );
    }

    const { status, data, headers } = err.response;

    if (status === 429) {
      const retryAfter = headers?.['retry-after'];
      const resetMs = retryAfter
        ? Number(retryAfter) * 1000
        : 60_000; // conservative 60 s default
      throw new SkulyticsRateLimitError(resetMs, data);
    }

    if (status >= 500) {
      throw new SkulyticsUnavailableError(
        `Skulytics API returned ${status}: ${data?.message || 'Internal Server Error'}`,
        status,
        data
      );
    }

    // 4xx (other than 429)
    throw new SkulyticsApiError(
      `Skulytics API error ${status}: ${data?.message || JSON.stringify(data)}`,
      status,
      data
    );
  }

  // ── Public methods ────────────────────────────────────────

  /**
   * Fetch a page of products from the catalogue.
   * Supports both cursor-based and page-number pagination.
   * The real API uses page numbers; the cursor param is converted to a page number.
   *
   * @param {Object}  [params]
   * @param {string}  [params.cursor]   - opaque cursor (may be a page number string)
   * @param {number}  [params.pageSize] - items per page (default 100, max 500)
   * @returns {Promise<{
   *   products: Object[],
   *   nextCursor: string|null,
   *   nextPage: number|null,
   *   hasMore: boolean,
   *   rateLimitRemaining: number,
   *   rateLimitResetMs: number
   * }>}
   */
  async getProducts({ cursor = null, pageSize = 100 } = {}) {
    try {
      // Convert cursor to page number for the real API
      const page = cursor ? (parseInt(cursor, 10) || 1) : 1;
      const params = { page, page_size: pageSize };

      const response = await this.client.get('/products', { params });
      const body = response.data;

      const rl = this._parseRateLimitHeaders(response);

      // Determine product array from response
      const products = body.products ?? body.data ?? body.items ?? [];

      // Has more if we got a full page
      const hasMore = products.length >= pageSize;
      const nextPage = hasMore ? page + 1 : null;

      return {
        products,
        nextCursor:         nextPage ? String(nextPage) : null,
        nextPage,
        hasMore,
        rateLimitRemaining: rl.remaining,
        rateLimitResetMs:   rl.resetMs,
      };
    } catch (err) {
      if (err instanceof SkulyticsApiError) throw err;
      this._handleError(err);
    }
  }

  /**
   * Fetch a single product by its SKU.
   *
   * @param {string} sku
   * @returns {Promise<{
   *   product: Object|null,
   *   rateLimitRemaining: number,
   *   rateLimitResetMs: number
   * }>}
   */
  async getProductBySku(sku) {
    try {
      const response = await this.client.get(`/products/sku/${encodeURIComponent(sku)}`);
      const body = response.data;

      const rl = this._parseRateLimitHeaders(response);

      return {
        product:            body.product ?? body.data ?? body,
        rateLimitRemaining: rl.remaining,
        rateLimitResetMs:   rl.resetMs,
      };
    } catch (err) {
      if (err instanceof SkulyticsApiError) throw err;
      this._handleError(err);
    }
  }
}

module.exports = {
  SkulyticsApiClient,
  SkulyticsApiError,
  SkulyticsRateLimitError,
  SkulyticsUnavailableError,
};
