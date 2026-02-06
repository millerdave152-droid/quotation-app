/**
 * API Caching Service
 * Prevents redundant API calls by caching responses in memory
 * Eliminates rate limit issues and flickering from excessive requests
 *
 * Features:
 * - In-memory caching with configurable TTL per endpoint
 * - Request deduplication for in-flight requests
 * - AbortController support for request cancellation
 * - Timeout handling
 * - Proper error handling and propagation
 */

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Default request timeout in milliseconds
const DEFAULT_TIMEOUT = 30000;

class APICache {
  constructor() {
    // In-memory cache: { url: { data, timestamp, promise } }
    this.cache = new Map();

    // Default cache TTL: 5 minutes
    this.defaultTTL = 5 * 60 * 1000;

    // Pending requests to prevent duplicate in-flight requests
    // Stores: { cacheKey: { promise, abortController } }
    this.pendingRequests = new Map();

    // Custom TTLs for specific endpoints
    this.customTTLs = {
      '/api/products': 2 * 60 * 1000, // 2 min - refresh more often for new imports
      '/api/customers': 5 * 60 * 1000, // 5 min - customers update occasionally
      '/api/quotes': 2 * 60 * 1000, // 2 min - quotes update frequently
      '/api/dashboard/stats': 1 * 60 * 1000, // 1 min - dashboard needs freshness
    };
  }

  /**
   * Get TTL for a specific endpoint
   */
  getTTL(url) {
    for (const [pattern, ttl] of Object.entries(this.customTTLs)) {
      if (url.includes(pattern)) {
        return ttl;
      }
    }
    return this.defaultTTL;
  }

  /**
   * Check if cached data is still valid
   */
  isValid(cacheEntry, url) {
    if (!cacheEntry) return false;
    const ttl = this.getTTL(url);
    const age = Date.now() - cacheEntry.timestamp;
    return age < ttl;
  }

  /**
   * Get auth headers from localStorage
   */
  getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    if (token) {
      return { 'Authorization': `Bearer ${token}` };
    }
    return {};
  }

  /**
   * Fetch with caching - main method
   * @param {string} url - API endpoint URL
   * @param {object} options - Fetch options
   * @param {number} options.timeout - Request timeout in ms (default: 30000)
   * @param {AbortSignal} options.signal - External abort signal
   * @param {boolean} options.skipCache - Skip cache and force fresh request
   * @returns {Promise<any>} Response data
   */
  async fetch(url, options = {}) {
    const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
    const { timeout = DEFAULT_TIMEOUT, signal: externalSignal, skipCache = false, ...fetchOpts } = options;
    const cacheKey = `${fullUrl}:${JSON.stringify(fetchOpts)}`;

    // Check if we have a valid cached response (unless skipCache is true)
    if (!skipCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && this.isValid(cached, url)) {
        console.log(`[API Cache] HIT: ${url}`);
        return cached.data;
      }
    }

    // Check if there's already a pending request for this URL
    const pendingRequest = this.pendingRequests.get(cacheKey);
    if (pendingRequest && !skipCache) {
      console.log(`[API Cache] WAITING: ${url}`);
      return pendingRequest.promise;
    }

    // Create abort controller for timeout handling
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeout);

    // If external signal is provided, link it to our controller
    if (externalSignal) {
      externalSignal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        abortController.abort();
      });
    }

    // Merge auth headers with provided options
    const authHeaders = this.getAuthHeaders();
    const fetchOptions = {
      ...fetchOpts,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...fetchOpts.headers
      },
      signal: abortController.signal,
    };

    // Make the request
    console.log(`[API Cache] MISS: ${url}`);
    const requestPromise = fetch(fullUrl, fetchOptions)
      .then(async (response) => {
        clearTimeout(timeoutId);

        if (!response.ok) {
          // Try to parse error body for detailed message
          let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch {
            // Ignore JSON parse errors
          }

          const error = new Error(errorMessage);
          error.status = response.status;
          error.statusText = response.statusText;
          throw error;
        }

        const data = await response.json();

        // Cache the response
        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });

        // Remove from pending requests
        this.pendingRequests.delete(cacheKey);

        return data;
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        // Remove from pending requests on error
        this.pendingRequests.delete(cacheKey);

        // Enhance error message for aborted/timeout requests
        if (error.name === 'AbortError') {
          const timeoutError = new Error(`Request timeout after ${timeout}ms: ${url}`);
          timeoutError.code = 'TIMEOUT';
          timeoutError.url = url;
          throw timeoutError;
        }

        // Enhance network errors
        if (error.message === 'Failed to fetch' || error.message === 'Network request failed') {
          const networkError = new Error(`Network error: Unable to connect to ${fullUrl}`);
          networkError.code = 'NETWORK_ERROR';
          networkError.url = url;
          throw networkError;
        }

        throw error;
      });

    // Store pending request with its abort controller
    this.pendingRequests.set(cacheKey, {
      promise: requestPromise,
      abortController,
    });

    return requestPromise;
  }

  /**
   * Cancel a pending request
   * @param {string} url - URL pattern to cancel
   */
  cancelRequest(urlPattern) {
    let count = 0;
    for (const [key, value] of this.pendingRequests.entries()) {
      if (key.includes(urlPattern)) {
        value.abortController?.abort();
        this.pendingRequests.delete(key);
        count++;
      }
    }
    if (count > 0) {
      console.log(`[API Cache] Cancelled ${count} requests matching: ${urlPattern}`);
    }
  }

  /**
   * Invalidate cache for a specific URL or pattern
   */
  invalidate(urlPattern) {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(urlPattern)) {
        this.cache.delete(key);
        count++;
      }
    }
    console.log(`[API Cache] Invalidated ${count} entries matching: ${urlPattern}`);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
    this.pendingRequests.clear();
    console.log('[API Cache] Cleared all cache');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      pending: this.pendingRequests.size,
      entries: Array.from(this.cache.keys())
    };
  }

  /**
   * Prefetch data (fire and forget)
   */
  prefetch(url, options = {}) {
    this.fetch(url, options).catch(err => {
      console.warn(`[API Cache] Prefetch failed for ${url}:`, err);
    });
  }

  /**
   * Batch fetch multiple URLs in parallel with caching
   * @param {string[]} urls - Array of URLs to fetch
   * @param {object} options - Fetch options applied to all requests
   * @returns {Promise<Array>} Array of responses (null for failed requests)
   */
  async fetchAll(urls, options = {}) {
    const promises = urls.map(url =>
      this.fetch(url, options).catch(error => {
        console.error(`[API Cache] Error fetching ${url}:`, error);
        return null; // Return null for failed requests
      })
    );
    return Promise.all(promises);
  }

  /**
   * Fetch with automatic retry for transient failures
   * @param {string} url - API endpoint URL
   * @param {object} options - Fetch options
   * @param {number} options.retries - Number of retries (default: 3)
   * @param {number} options.retryDelay - Delay between retries in ms (default: 1000)
   * @returns {Promise<any>} Response data
   */
  async fetchWithRetry(url, options = {}) {
    const { retries = 3, retryDelay = 1000, ...fetchOptions } = options;
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.fetch(url, { ...fetchOptions, skipCache: attempt > 0 });
      } catch (error) {
        lastError = error;

        // Don't retry on 4xx errors (client errors) except 408 (timeout) and 429 (rate limit)
        if (error.status && error.status >= 400 && error.status < 500 &&
            error.status !== 408 && error.status !== 429) {
          throw error;
        }

        // Don't retry on aborted requests (user cancelled)
        if (error.name === 'AbortError' && error.code !== 'TIMEOUT') {
          throw error;
        }

        if (attempt < retries) {
          const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
          console.log(`[API Cache] Retry ${attempt + 1}/${retries} for ${url} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}

// Create singleton instance
const apiCache = new APICache();

// Export convenience methods
export const cachedFetch = (url, options) => apiCache.fetch(url, options);
export const invalidateCache = (pattern) => apiCache.invalidate(pattern);
export const clearCache = () => apiCache.clear();
export const prefetchData = (url, options) => apiCache.prefetch(url, options);
export const batchFetch = (urls, options) => apiCache.fetchAll(urls, options);
export const getCacheStats = () => apiCache.getStats();
export const cancelRequest = (pattern) => apiCache.cancelRequest(pattern);
export const fetchWithRetry = (url, options) => apiCache.fetchWithRetry(url, options);

export default apiCache;
