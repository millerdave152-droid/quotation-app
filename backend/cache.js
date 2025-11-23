/**
 * Database Query Caching Module
 * Uses node-cache for in-memory caching of frequently accessed data
 */

const NodeCache = require('node-cache');

// Create cache instances with different TTLs for different data types
const caches = {
  // Short-lived cache for frequently changing data (5 minutes)
  short: new NodeCache({
    stdTTL: 300, // 5 minutes
    checkperiod: 60, // Check for expired keys every 60 seconds
    useClones: false // Don't clone data (better performance)
  }),

  // Medium-lived cache for moderately static data (30 minutes)
  medium: new NodeCache({
    stdTTL: 1800, // 30 minutes
    checkperiod: 120,
    useClones: false
  }),

  // Long-lived cache for rarely changing data (2 hours)
  long: new NodeCache({
    stdTTL: 7200, // 2 hours
    checkperiod: 300,
    useClones: false
  })
};

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
  invalidate
};
