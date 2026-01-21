/**
 * Database Query Caching Module
 * Uses node-cache for in-memory caching of frequently accessed data
 */

const NodeCache = require('node-cache');
const cacheConfig = require('./config/cache-config');

// Create cache instances with configurable TTLs for different data types
const caches = {
  // Short-lived cache for frequently changing data
  short: new NodeCache({
    stdTTL: cacheConfig.TTL_SHORT,
    checkperiod: 60, // Check for expired keys every 60 seconds
    useClones: false // Don't clone data (better performance)
  }),

  // Medium-lived cache for moderately static data
  medium: new NodeCache({
    stdTTL: cacheConfig.TTL_MEDIUM,
    checkperiod: 120,
    useClones: false
  }),

  // Long-lived cache for rarely changing data
  long: new NodeCache({
    stdTTL: cacheConfig.TTL_LONG,
    checkperiod: 300,
    useClones: false
  })
};

// Log cache configuration on startup
console.log(`✓ Cache initialized: TTL_SHORT=${cacheConfig.TTL_SHORT}s, TTL_MEDIUM=${cacheConfig.TTL_MEDIUM}s, TTL_LONG=${cacheConfig.TTL_LONG}s`);

/**
 * Get value from cache
 * @param {string} cacheType - 'short', 'medium', or 'long'
 * @param {string} key - Cache key
 * @returns {any|null} Cached value or null if not found
 */
const get = (cacheType, key) => {
  const cache = caches[cacheType];
  if (!cache) {
    console.error(`Invalid cache type: ${cacheType}`);
    return null;
  }
  return cache.get(key);
};

/**
 * Set value in cache
 * @param {string} cacheType - 'short', 'medium', or 'long'
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Optional custom TTL in seconds
 */
const set = (cacheType, key, value, ttl = null) => {
  const cache = caches[cacheType];
  if (!cache) {
    console.error(`Invalid cache type: ${cacheType}`);
    return false;
  }
  if (ttl) {
    return cache.set(key, value, ttl);
  }
  return cache.set(key, value);
};

/**
 * Delete specific key from cache
 * @param {string} cacheType - 'short', 'medium', or 'long'
 * @param {string} key - Cache key to delete
 */
const del = (cacheType, key) => {
  const cache = caches[cacheType];
  if (!cache) {
    console.error(`Invalid cache type: ${cacheType}`);
    return false;
  }
  return cache.del(key);
};

/**
 * Clear all caches or a specific cache type
 * @param {string} cacheType - Optional: 'short', 'medium', 'long', or null for all
 */
const clear = (cacheType = null) => {
  if (cacheType) {
    const cache = caches[cacheType];
    if (cache) {
      cache.flushAll();
      console.log(`✓ Cleared ${cacheType} cache`);
    }
  } else {
    // Clear all caches
    Object.keys(caches).forEach(type => {
      caches[type].flushAll();
    });
    console.log('✓ Cleared all caches');
  }
};

/**
 * Get cache statistics
 * @returns {object} Cache stats for all cache types
 */
const getStats = () => {
  return {
    short: caches.short.getStats(),
    medium: caches.medium.getStats(),
    long: caches.long.getStats()
  };
};

/**
 * Invalidate all cache keys matching a pattern prefix
 * Searches all cache types (short, medium, long) and deletes matching keys
 * @param {string} pattern - Key prefix to match (e.g., 'customers:' or 'products:*')
 */
const invalidatePattern = (pattern) => {
  // Remove trailing asterisk if present (for compatibility with wildcard patterns)
  const prefix = pattern.replace(/\*$/, '');
  let deletedCount = 0;

  Object.entries(caches).forEach(([type, cache]) => {
    const keys = cache.keys();
    keys.forEach(key => {
      if (key.startsWith(prefix)) {
        cache.del(key);
        deletedCount++;
      }
    });
  });

  if (deletedCount > 0) {
    console.log(`✓ Invalidated ${deletedCount} cache entries matching '${prefix}'`);
  }
};

/**
 * Wrapper function to cache database query results
 * @param {string} key - Cache key
 * @param {string} cacheType - 'short', 'medium', or 'long'
 * @param {Function} queryFn - Async function that executes the query
 * @returns {Promise<any>} Query result (from cache or database)
 */
const cacheQuery = async (key, cacheType, queryFn) => {
  // Try to get from cache first
  const cached = get(cacheType, key);
  if (cached !== undefined) {
    console.log(`✓ Cache HIT: ${key}`);
    return cached;
  }

  // Cache miss - execute query
  console.log(`✗ Cache MISS: ${key} - Fetching from database...`);
  try {
    const result = await queryFn();
    // Store in cache
    set(cacheType, key, result);
    return result;
  } catch (error) {
    console.error(`Error in cached query ${key}:`, error);
    throw error;
  }
};

/**
 * Invalidate caches when data changes
 * Call this after INSERT, UPDATE, or DELETE operations
 */
const invalidate = {
  // Clear product-related caches
  products: () => {
    del('long', 'products:all');
    del('medium', 'products:active');
    del('medium', 'products:categories');
    console.log('✓ Invalidated product caches');
  },

  // Clear customer-related caches
  customers: () => {
    del('medium', 'customers:all');
    del('short', 'customers:recent');
    console.log('✓ Invalidated customer caches');
  },

  // Clear quote-related caches
  quotes: () => {
    del('short', 'quotes:all');
    del('short', 'quotes:stats');
    del('short', 'quotes:recent');
    console.log('✓ Invalidated quote caches');
  },

  // Clear analytics caches
  analytics: () => {
    del('short', 'analytics:revenue');
    del('short', 'analytics:summary');
    console.log('✓ Invalidated analytics caches');
  },

  // Clear all caches (use sparingly - e.g., after bulk imports)
  all: () => {
    clear();
  }
};

module.exports = {
  get,
  set,
  del,
  clear,
  getStats,
  cacheQuery,
  invalidatePattern,
  invalidate
};
