/**
 * TeleTime POS - Redis Connection Configuration
 *
 * Centralized Redis client with TLS in production, retry logic,
 * and graceful degradation when Redis is unavailable.
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;
let connectionReady = false;

/**
 * Create and return the singleton Redis client.
 * Returns null when REDIS_URL is not configured (PostgreSQL fallback mode).
 */
function createClient() {
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL;
  if (!url) {
    logger.info('[Redis] REDIS_URL not set — running in PostgreSQL-fallback mode');
    return null;
  }

  const isProduction = process.env.NODE_ENV === 'production';

  const opts = {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 10) {
        logger.error('[Redis] Max reconnect attempts reached — giving up');
        return null; // stop retrying
      }
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
  };

  // Enable TLS in production (ElastiCache, Upstash, etc.)
  if (isProduction) {
    opts.tls = {};
  }

  try {
    redisClient = new Redis(url, opts);

    redisClient.on('connect', () => {
      logger.info('[Redis] Connected');
    });

    redisClient.on('ready', () => {
      connectionReady = true;
      logger.info('[Redis] Ready for commands');
    });

    redisClient.on('error', (err) => {
      connectionReady = false;
      logger.warn({ err: err.message }, '[Redis] Connection error — fraud system will use PostgreSQL fallback');
    });

    redisClient.on('close', () => {
      connectionReady = false;
      logger.info('[Redis] Connection closed');
    });

    return redisClient;
  } catch (err) {
    logger.warn({ err: err.message }, '[Redis] Initialization failed — running in PostgreSQL-fallback mode');
    redisClient = null;
    return null;
  }
}

/**
 * Connect the lazy client. Safe to call multiple times.
 * Resolves to the client (or null on failure).
 */
async function connect() {
  const client = createClient();
  if (!client) return null;

  try {
    await client.connect();
    return client;
  } catch (err) {
    logger.warn({ err: err.message }, '[Redis] Connect failed — using PostgreSQL fallback');
    redisClient = null;
    return null;
  }
}

/**
 * Return the current client (may be null if Redis is unavailable).
 */
function getClient() {
  return redisClient;
}

/**
 * Whether Redis is currently connected and ready.
 */
function isReady() {
  return connectionReady && redisClient !== null;
}

/**
 * Graceful shutdown.
 */
async function disconnect() {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch { /* ignore */ }
    redisClient = null;
    connectionReady = false;
  }
}

// Circuit breaker for services that fall back to PostgreSQL when Redis is unavailable.
// Import and use: const { cachePgBreaker } = require('../config/redis');
const CircuitBreaker = require('../utils/circuitBreaker');
const cachePgBreaker = new CircuitBreaker('cache-pg-fallback', {
  failureThreshold: 5,
  recoveryTimeout: 30000,
});

module.exports = {
  createClient,
  connect,
  getClient,
  isReady,
  disconnect,
  cachePgBreaker,
};
