/**
 * TeleTime POS - Feature Store Service
 *
 * Pre-computes and caches ML features for real-time fraud scoring.
 * Uses PostgreSQL materialized views as the source of truth,
 * with Redis caching (1-hour TTL) for low-latency feature serving.
 *
 * Feature groups:
 *   - Card features:     per-card aggregates (7d/30d/90d)
 *   - Customer features:  CLV, return rate, chargeback count
 *   - Location features:  avg amount, fraud rate, busiest hours
 *   - Employee features:  already covered by mv_employee_fraud_metrics
 */

const logger = require('../utils/logger');

const REDIS_PREFIX = 'fraud:features';
const FEATURE_TTL = 3600; // 1 hour in seconds

class FeatureStoreService {
  /**
   * @param {Pool} pool - PostgreSQL connection pool
   * @param {import('ioredis').Redis|null} redis - Redis client (optional)
   */
  constructor(pool, redis = null) {
    this.pool = pool;
    this.redis = redis;
  }

  // ============================================================================
  // MATERIALIZED VIEW REFRESH
  // ============================================================================

  /**
   * Refresh all ML feature materialized views.
   * Called hourly by cron. CONCURRENTLY allows reads during refresh.
   */
  async refreshViews() {
    const views = ['mv_card_features', 'mv_customer_features', 'mv_location_features'];
    const results = {};

    for (const view of views) {
      const start = Date.now();
      try {
        await this.pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
        results[view] = { status: 'ok', duration_ms: Date.now() - start };
      } catch (err) {
        // If CONCURRENTLY fails (no unique index yet), try without
        try {
          await this.pool.query(`REFRESH MATERIALIZED VIEW ${view}`);
          results[view] = { status: 'ok_non_concurrent', duration_ms: Date.now() - start };
        } catch (err2) {
          results[view] = { status: 'error', error: err2.message, duration_ms: Date.now() - start };
          logger.warn({ view, err: err2.message }, '[FeatureStore] View refresh failed');
        }
      }
    }

    logger.info({ results }, '[FeatureStore] Materialized view refresh complete');

    // Clear Redis cache after refresh so next lookups get fresh data
    if (this._isRedisAvailable()) {
      try {
        const keys = await this.redis.keys(`${REDIS_PREFIX}:*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch (_) {
        // Non-fatal
      }
    }

    return results;
  }

  // ============================================================================
  // FEATURE LOOKUPS (with Redis cache)
  // ============================================================================

  /**
   * Get pre-computed features for a card.
   * @param {string} cardBin - First 6-8 digits
   * @param {string} lastFour - Last 4 digits
   * @returns {Promise<object|null>}
   */
  async getCardFeatures(cardBin, lastFour) {
    if (!cardBin || !lastFour) return null;
    const key = `${REDIS_PREFIX}:card:${cardBin}${lastFour}`;

    // Try Redis cache first
    const cached = await this._getFromCache(key);
    if (cached) return cached;

    // Fall back to materialized view
    const { rows } = await this.pool.query(
      `SELECT * FROM mv_card_features WHERE card_key = $1`,
      [cardBin + lastFour]
    );

    const features = rows[0] || null;
    if (features) {
      await this._setCache(key, features);
    }
    return features;
  }

  /**
   * Get pre-computed features for a customer.
   * @param {number} customerId
   * @returns {Promise<object|null>}
   */
  async getCustomerFeatures(customerId) {
    if (!customerId) return null;
    const key = `${REDIS_PREFIX}:customer:${customerId}`;

    const cached = await this._getFromCache(key);
    if (cached) return cached;

    const { rows } = await this.pool.query(
      `SELECT * FROM mv_customer_features WHERE customer_id = $1`,
      [customerId]
    );

    const features = rows[0] || null;
    if (features) {
      await this._setCache(key, features);
    }
    return features;
  }

  /**
   * Get pre-computed features for a location.
   * @param {number} locationId
   * @returns {Promise<object|null>}
   */
  async getLocationFeatures(locationId) {
    if (!locationId) return null;
    const key = `${REDIS_PREFIX}:location:${locationId}`;

    const cached = await this._getFromCache(key);
    if (cached) return cached;

    const { rows } = await this.pool.query(
      `SELECT * FROM mv_location_features WHERE location_id = $1`,
      [locationId]
    );

    const features = rows[0] || null;
    if (features) {
      await this._setCache(key, features);
    }
    return features;
  }

  /**
   * Get all feature groups for a transaction in a single call.
   * Used by the ML scoring pipeline for real-time feature serving.
   *
   * @param {object} txnData
   * @param {string} txnData.cardBin
   * @param {string} txnData.lastFour
   * @param {number} txnData.customerId
   * @param {number} txnData.locationId
   * @returns {Promise<object>}
   */
  async getTransactionFeatures(txnData) {
    const [card, customer, location] = await Promise.all([
      this.getCardFeatures(txnData.cardBin, txnData.lastFour),
      this.getCustomerFeatures(txnData.customerId),
      this.getLocationFeatures(txnData.locationId),
    ]);

    return {
      card: card || {},
      customer: customer || {},
      location: location || {},
    };
  }

  // ============================================================================
  // FEATURE STORE STATUS
  // ============================================================================

  /**
   * Get feature store status and view freshness.
   * @returns {Promise<object>}
   */
  async getStatus() {
    const views = ['mv_card_features', 'mv_customer_features', 'mv_location_features'];
    const status = {};

    for (const view of views) {
      try {
        const { rows } = await this.pool.query(`
          SELECT
            COUNT(*)::int AS row_count,
            (SELECT last_refresh FROM pg_catalog.pg_stat_user_tables WHERE relname = $1) AS last_refresh
        `, [view]);
        status[view] = {
          row_count: rows[0]?.row_count || 0,
          last_refresh: rows[0]?.last_refresh || null,
        };
      } catch (err) {
        status[view] = { error: err.message };
      }
    }

    // Redis cache stats
    let cacheKeys = 0;
    if (this._isRedisAvailable()) {
      try {
        const keys = await this.redis.keys(`${REDIS_PREFIX}:*`);
        cacheKeys = keys.length;
      } catch (_) { /* ignore */ }
    }

    return {
      views: status,
      redis_cache: {
        available: this._isRedisAvailable(),
        cached_keys: cacheKeys,
        ttl_seconds: FEATURE_TTL,
      },
    };
  }

  // ============================================================================
  // REDIS HELPERS
  // ============================================================================

  /** @private */
  _isRedisAvailable() {
    return this.redis && this.redis.status === 'ready';
  }

  /** @private */
  async _getFromCache(key) {
    if (!this._isRedisAvailable()) return null;
    try {
      const raw = await this.redis.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  /** @private */
  async _setCache(key, data) {
    if (!this._isRedisAvailable()) return;
    try {
      await this.redis.set(key, JSON.stringify(data), 'EX', FEATURE_TTL);
    } catch (_) {
      // Non-fatal
    }
  }
}

module.exports = FeatureStoreService;
