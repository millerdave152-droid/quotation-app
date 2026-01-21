/**
 * Cache Configuration
 *
 * Externalized TTL (time-to-live) values for cache layers.
 * Override via environment variables for different environments.
 */

module.exports = {
  // Short-lived cache: 5 minutes (300 seconds)
  // Use for: frequently changing data, session-related data
  TTL_SHORT: parseInt(process.env.CACHE_TTL_SHORT, 10) || 300,

  // Medium-lived cache: 30 minutes (1800 seconds)
  // Use for: product lists, customer lists, moderately stable data
  TTL_MEDIUM: parseInt(process.env.CACHE_TTL_MEDIUM, 10) || 1800,

  // Long-lived cache: 2 hours (7200 seconds)
  // Use for: reference data, lookup tables, rarely changing configurations
  TTL_LONG: parseInt(process.env.CACHE_TTL_LONG, 10) || 7200,

  // Max entries in memory cache before LRU eviction
  MAX_ENTRIES: parseInt(process.env.CACHE_MAX_ENTRIES, 10) || 1000,

  // Whether caching is enabled (useful for testing/debugging)
  ENABLED: process.env.CACHE_ENABLED !== 'false'
};
