/**
 * API Caching Service
 * Prevents redundant API calls by caching responses in memory
 * Eliminates rate limit issues and flickering from excessive requests
 */

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

class APICache {
  constructor() {
    // In-memory cache: { url: { data, timestamp, promise } }
    this.cache = new Map();

    // Default cache TTL: 5 minutes
    this.defaultTTL = 5 * 60 * 1000;

    // Pending requests to prevent duplicate in-flight requests
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
   * Fetch with caching - main method
   */
  async fetch(url, options = {}) {
    const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
    const cacheKey = `${fullUrl}:${JSON.stringify(options)}`;

    // Check if we have a valid cached response
    const cached = this.cache.get(cacheKey);
    if (cached && this.isValid(cached, url)) {
      console.log(`[API Cache] HIT: ${url}`);
      return cached.data;
    }

    // Check if there's already a pending request for this URL
    if (this.pendingRequests.has(cacheKey)) {
      console.log(`[API Cache] WAITING: ${url}`);
      return this.pendingRequests.get(cacheKey);
    }

    // Make the request
    console.log(`[API Cache] MISS: ${url}`);
    const requestPromise = fetch(fullUrl, options)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
        // Remove from pending requests on error
        this.pendingRequests.delete(cacheKey);
        throw error;
      });

    // Store pending request
    this.pendingRequests.set(cacheKey, requestPromise);

    return requestPromise;
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

export default apiCache;
