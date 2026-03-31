/**
 * TeleTime POS - Velocity Tracking Service
 *
 * Real-time transaction velocity monitoring using Redis Sorted Sets
 * with automatic PostgreSQL fallback when Redis is unavailable.
 *
 * Used by FraudDetectionService for:
 *   - Card velocity (same card used N+ times in X seconds)
 *   - Terminal velocity (rapid fire on one terminal)
 *   - Employee velocity (unusual transaction volume)
 *   - Decline velocity (card testing detection)
 *   - MOTO velocity (manual-entry channel abuse)
 *   - Geographic anomaly (impossible travel detection)
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const FRAUD_SALT = process.env.FRAUD_SALT || 'teletime-fraud-default-salt-CHANGE-ME';
const KEY_PREFIX = 'fraud:vel';
const LOCATION_PREFIX = 'fraud:card:locations';
const LOCATION_TTL = 43200; // 12 hours in seconds

const CircuitBreaker = require('../utils/circuitBreaker');

class VelocityService {
  /**
   * @param {import('pg').Pool} pool - PostgreSQL connection pool
   * @param {import('ioredis').Redis|null} redisClient - ioredis client (optional)
   */
  constructor(pool, redisClient = null) {
    this.pool = pool;
    this.redis = redisClient;

    // Circuit breaker for PG fallback — prevents pool exhaustion under Redis outage
    this._pgBreaker = new CircuitBreaker('velocity-pg-fallback', {
      failureThreshold: 5,
      recoveryTimeout: 30000,
    });

    // Hourly cleanup of old PG rows (only when using PG fallback)
    if (!this.redis) {
      this._cleanupInterval = setInterval(() => this.cleanup().catch((err) => { logger.error({ err }, '[VelocityService] Cleanup failed'); }), 3600000);
    }
  }

  // =========================================================================
  // CORE VELOCITY CHECK
  // =========================================================================

  /**
   * Check velocity for a dimension/identifier using a Redis Sorted Set sliding window.
   * Atomic pipeline: ZREMRANGEBYSCORE → ZCOUNT → ZADD → EXPIRE
   *
   * @param {string} dimension - Event type (card_use, terminal_txn, employee_txn, decline, moto_txn)
   * @param {string} identifier - Hashed or raw entity identifier
   * @param {number} windowSeconds - Sliding window size in seconds
   * @param {number} maxCount - Threshold before flagging as exceeded
   * @returns {Promise<{count: number, exceeded: boolean, riskPoints: number}>}
   */
  async checkVelocity(dimension, identifier, windowSeconds, maxCount) {
    const now = Date.now();
    const cutoff = now - (windowSeconds * 1000);
    const member = `${now}:${crypto.randomBytes(4).toString('hex')}`; // unique member

    if (this._isRedisAvailable()) {
      try {
        const key = `${KEY_PREFIX}:${dimension}:${identifier}`;
        const ttl = windowSeconds + 60;

        const pipeline = this.redis.pipeline();
        pipeline.zremrangebyscore(key, '-inf', cutoff);     // 1. clean expired
        pipeline.zcount(key, cutoff, '+inf');                // 2. count current window
        pipeline.zadd(key, now, member);                     // 3. add this event
        pipeline.expire(key, ttl);                           // 4. set TTL

        const results = await pipeline.exec();

        // results[1] = [err, count] from ZCOUNT
        const count = (results[1][1] || 0) + 1; // +1 because ZADD happened after ZCOUNT
        const exceeded = count > maxCount;
        const riskPoints = exceeded ? Math.min(25, Math.round((count / maxCount) * 15)) : 0;

        return { count, exceeded, riskPoints };
      } catch (err) {
        logger.warn({ err: err.message, dimension, identifier },
          '[VelocityService] Redis pipeline failed — falling back to PG');
      }
    }

    // PostgreSQL fallback — guarded by circuit breaker to prevent pool exhaustion
    return this._pgBreaker.execute(
      () => this._checkVelocityPG(dimension, identifier, windowSeconds, maxCount),
      () => {
        // Circuit open — skip velocity check, signal to fraud scoring
        logger.error({ dimension, identifier, event: 'velocity_check_bypassed' },
          'Velocity check skipped — PG fallback circuit open');
        return { count: 0, exceeded: false, riskPoints: 0, bypassed: true };
      }
    );
  }

  /**
   * PostgreSQL fallback for checkVelocity.
   * Uses SERIALIZABLE isolation to eliminate the race window where two
   * concurrent checks both pass before either records its event.
   *
   * Flow: INSERT event → count window → if exceeded, DELETE the event (undo).
   */
  async _checkVelocityPG(dimension, identifier, windowSeconds, maxCount) {
    logger.warn({ dimension, identifier }, 'Velocity check using PG fallback — Redis unavailable');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');

      // 1. Insert the event
      const insertResult = await client.query(
        `INSERT INTO velocity_events (event_type, entity_id, amount_cents, metadata)
         VALUES ($1, $2, 0, '{}')
         RETURNING id`,
        [dimension, identifier]
      );
      const eventId = insertResult.rows[0].id;

      // 2. Count the window (includes the just-inserted row since we're in same txn)
      const countResult = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM velocity_events
         WHERE event_type = $1
           AND entity_id = $2
           AND created_at > NOW() - ($3 || ' seconds')::interval`,
        [dimension, identifier, windowSeconds.toString()]
      );

      const count = countResult.rows[0].cnt;
      const exceeded = count > maxCount;

      if (exceeded) {
        // Undo: remove the just-inserted event since the threshold is exceeded
        await client.query('DELETE FROM velocity_events WHERE id = $1', [eventId]);
      }

      await client.query('COMMIT');

      const riskPoints = exceeded ? Math.min(25, Math.round((count / maxCount) * 15)) : 0;
      return { count, exceeded, riskPoints };
    } catch (err) {
      await client.query('ROLLBACK');
      // Serialization failures (40001) are expected under contention — propagate
      // to circuit breaker for proper failure counting
      throw err;
    } finally {
      client.release();
    }
  }

  // =========================================================================
  // MULTI-DIMENSION CHECK
  // =========================================================================

  /**
   * Run all velocity checks for a transaction in parallel.
   *
   * @param {object} txnData
   * @param {string} [txnData.cardBin] - First 6-8 digits of card
   * @param {string} [txnData.lastFour] - Last 4 digits of card
   * @param {string} [txnData.terminalId] - POS terminal identifier
   * @param {string|number} [txnData.employeeId] - Cashier/salesperson ID
   * @param {string} [txnData.entryMethod] - 'chip','swipe','tap','moto','manual'
   * @returns {Promise<object>} Results keyed by check name
   */
  async checkAllVelocities(txnData) {
    const checks = [];
    const labels = [];

    // Card velocity: same card 3+ times in 5 minutes
    if (txnData.cardBin && txnData.lastFour) {
      const cardHash = this.hashCard(`${txnData.cardBin}${txnData.lastFour}`);
      checks.push(this.checkVelocity('card_use', cardHash, 300, 3));
      labels.push('card');
    }

    // Terminal velocity: 5+ txns on same terminal in 2 minutes
    if (txnData.terminalId) {
      checks.push(this.checkVelocity('terminal_txn', String(txnData.terminalId), 120, 5));
      labels.push('terminal');
    }

    // Employee velocity: 15+ txns by same employee in 1 hour
    if (txnData.employeeId) {
      checks.push(this.checkVelocity('employee_txn', String(txnData.employeeId), 3600, 15));
      labels.push('employee');
    }

    // Decline velocity: same card declined 3+ times in 10 minutes
    if (txnData.cardBin && txnData.lastFour) {
      const cardHash = this.hashCard(`${txnData.cardBin}${txnData.lastFour}`);
      checks.push(this.checkVelocity('decline', cardHash, 600, 3));
      labels.push('decline');
    }

    // MOTO velocity: manual-entry txns, 5+ in 1 hour by same employee
    if (txnData.entryMethod === 'moto' && txnData.employeeId) {
      checks.push(this.checkVelocity('moto_txn', String(txnData.employeeId), 3600, 5));
      labels.push('moto');
    }

    const results = await Promise.all(checks);

    const output = {};
    for (let i = 0; i < labels.length; i++) {
      output[labels[i]] = results[i];
    }

    return output;
  }

  // =========================================================================
  // GEOGRAPHIC ANOMALY DETECTION
  // =========================================================================

  /**
   * Track a card usage location for geographic anomaly detection.
   *
   * @param {string} cardHash - Hashed card identifier
   * @param {number|string} locationId - Store/terminal location ID
   * @param {number} [lat] - Latitude
   * @param {number} [lng] - Longitude
   */
  async trackCardLocation(cardHash, locationId, lat = null, lng = null) {
    const now = Date.now();
    const locationData = JSON.stringify({ locationId, lat, lng });

    if (this._isRedisAvailable()) {
      try {
        const key = `${LOCATION_PREFIX}:${cardHash}`;
        await this.redis.zadd(key, now, locationData);
        await this.redis.expire(key, LOCATION_TTL);
        return;
      } catch (err) {
        logger.warn({ err: err.message }, '[VelocityService] Redis location tracking failed');
      }
    }

    // PostgreSQL fallback — use velocity_events with location metadata
    try {
      await this.pool.query(
        `INSERT INTO velocity_events (event_type, entity_id, amount_cents, metadata, location_id)
         VALUES ('card_location', $1, 0, $2, $3)`,
        [cardHash, JSON.stringify({ lat, lng }), locationId]
      );
    } catch (err) {
      logger.warn({ err: err.message }, '[VelocityService] PG location tracking failed');
    }
  }

  /**
   * Check if the same card was used at a distant location within impossible travel time.
   *
   * @param {string} cardHash - Hashed card identifier
   * @param {{locationId: number, lat: number, lng: number}} currentLocation
   * @returns {Promise<{anomaly: boolean, riskPoints: number, details: object}>}
   */
  async checkGeographicAnomaly(cardHash, currentLocation) {
    const noAnomaly = { anomaly: false, riskPoints: 0, details: {} };

    if (!currentLocation || currentLocation.lat == null || currentLocation.lng == null) {
      return noAnomaly;
    }

    const windowMs = 30 * 60 * 1000; // 30 minutes
    const cutoff = Date.now() - windowMs;
    let recentLocations = [];

    if (this._isRedisAvailable()) {
      try {
        const key = `${LOCATION_PREFIX}:${cardHash}`;
        const members = await this.redis.zrangebyscore(key, cutoff, '+inf');
        recentLocations = members.map(m => {
          try { return JSON.parse(m); } catch { return null; }
        }).filter(Boolean);
      } catch (err) {
        logger.warn({ err: err.message }, '[VelocityService] Redis geo read failed');
      }
    }

    // PostgreSQL fallback if Redis had no results
    if (recentLocations.length === 0) {
      try {
        const { rows } = await this.pool.query(
          `SELECT metadata, location_id FROM velocity_events
           WHERE event_type = 'card_location' AND entity_id = $1
             AND created_at > NOW() - INTERVAL '30 minutes'
           ORDER BY created_at DESC LIMIT 10`,
          [cardHash]
        );
        recentLocations = rows.map(r => {
          const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
          return { locationId: r.location_id, lat: meta.lat, lng: meta.lng };
        }).filter(loc => loc.lat != null && loc.lng != null);
      } catch (err) {
        logger.warn({ err: err.message }, '[VelocityService] PG geo read failed');
        return noAnomaly;
      }
    }

    // Check distance from current location to each recent location
    for (const prev of recentLocations) {
      if (prev.lat == null || prev.lng == null) continue;
      if (String(prev.locationId) === String(currentLocation.locationId)) continue;

      const distKm = this._haversineKm(
        currentLocation.lat, currentLocation.lng,
        prev.lat, prev.lng
      );

      if (distKm > 100) {
        return {
          anomaly: true,
          riskPoints: 12,
          details: {
            previousLocation: prev.locationId,
            currentLocation: currentLocation.locationId,
            distanceKm: Math.round(distKm),
            windowMinutes: 30,
            threshold: 100,
          },
        };
      }
    }

    return noAnomaly;
  }

  /**
   * Haversine formula — distance between two lat/lng points in km.
   */
  _haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const toRad = (deg) => deg * (Math.PI / 180);
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // =========================================================================
  // CARD HASHING
  // =========================================================================

  /**
   * SHA-256 hash of identifier + FRAUD_SALT, truncated to 16 chars.
   *
   * @param {string} identifier - Raw card or entity identifier
   * @returns {string} Truncated hash
   */
  hashCard(identifier) {
    return crypto
      .createHash('sha256')
      .update(`${identifier}${FRAUD_SALT}`)
      .digest('hex')
      .substring(0, 16);
  }

  // =========================================================================
  // PERSISTENCE & RECOVERY
  // =========================================================================

  /**
   * Write a velocity event to PostgreSQL for durability (fire-and-forget).
   * Does NOT block the caller — errors are logged and swallowed.
   *
   * @param {object} eventData
   * @param {string} eventData.type - Event type
   * @param {string} eventData.entityId - Entity identifier
   * @param {number} [eventData.amountCents] - Amount in cents
   * @param {object} [eventData.metadata] - Additional data
   * @param {number} [eventData.transactionId] - Associated transaction ID
   * @param {number} [eventData.locationId] - Location ID
   */
  persistVelocityEvent(eventData) {
    const { type, entityId, amountCents = null, metadata = {}, transactionId = null, locationId = null } = eventData;

    this.pool.query(
      `INSERT INTO velocity_events (event_type, entity_id, amount_cents, metadata, transaction_id, location_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [type, entityId, amountCents, JSON.stringify(metadata), transactionId, locationId]
    ).catch(err => {
      logger.warn({ err: err.message, type, entityId }, '[VelocityService] Event persistence failed');
    });
  }

  /**
   * Recovery: rebuild Redis velocity counters from PostgreSQL velocity_events
   * for the last hour. Call on startup if Redis was restarted.
   */
  async rebuildFromPostgres() {
    if (!this._isRedisAvailable()) {
      logger.info('[VelocityService] No Redis — skipping rebuild');
      return { rebuilt: 0 };
    }

    try {
      const { rows } = await this.pool.query(
        `SELECT event_type, entity_id, amount_cents, metadata, created_at
         FROM velocity_events
         WHERE created_at > NOW() - INTERVAL '1 hour'
         ORDER BY created_at ASC`
      );

      if (rows.length === 0) {
        logger.info('[VelocityService] No recent velocity events to rebuild');
        return { rebuilt: 0 };
      }

      const pipeline = this.redis.pipeline();
      const keysToExpire = new Set();

      for (const row of rows) {
        const ts = new Date(row.created_at).getTime();
        const key = `${KEY_PREFIX}:${row.event_type}:${row.entity_id}`;
        const member = JSON.stringify({
          ts,
          amount: row.amount_cents,
          ...(typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata),
        });
        pipeline.zadd(key, ts, member);
        keysToExpire.add(key);
      }

      // Set TTLs
      for (const key of keysToExpire) {
        pipeline.expire(key, 3660); // 1 hour + 1 minute buffer
      }

      await pipeline.exec();
      logger.info({ count: rows.length, keys: keysToExpire.size },
        '[VelocityService] Rebuilt velocity counters from PostgreSQL');

      return { rebuilt: rows.length };
    } catch (err) {
      logger.error({ err: err.message }, '[VelocityService] Rebuild from PostgreSQL failed');
      return { rebuilt: 0 };
    }
  }

  // =========================================================================
  // BACKWARD-COMPATIBLE METHODS (used by FraudDetectionService)
  // =========================================================================

  /**
   * Record a velocity event (backward-compatible).
   * Writes to both Redis and PostgreSQL.
   *
   * @param {string} type - Event type (card_use, terminal_txn, employee_txn, decline)
   * @param {string} entityId - Identifier (card hash, terminal ID, employee ID)
   * @param {number|null} amountCents - Transaction amount in cents
   * @param {object} metadata - Additional event data
   */
  async recordEvent(type, entityId, amountCents = null, metadata = {}) {
    const now = Date.now();

    if (this._isRedisAvailable()) {
      try {
        const key = `${KEY_PREFIX}:${type}:${entityId}`;
        const member = JSON.stringify({ ts: now, amount: amountCents, ...metadata });
        await this.redis.zadd(key, now, member);
        await this.redis.expire(key, 90060); // 25 hours
      } catch (err) {
        logger.warn({ err: err.message, type, entityId },
          '[VelocityService] Redis write failed — falling back to PG');
        // Fall through to PG below
      }
    }

    // Always persist to PostgreSQL for durability
    this.persistVelocityEvent({
      type,
      entityId,
      amountCents,
      metadata,
      transactionId: metadata.transaction_id || null,
      locationId: metadata.location_id || null,
    });
  }

  /**
   * Get event count within a sliding window (backward-compatible).
   *
   * @param {string} type - Event type
   * @param {string} entityId - Identifier
   * @param {number} windowSeconds - Window size in seconds
   * @returns {Promise<number>} Event count
   */
  async getCount(type, entityId, windowSeconds) {
    const cutoff = Date.now() - (windowSeconds * 1000);

    if (this._isRedisAvailable()) {
      try {
        const key = `${KEY_PREFIX}:${type}:${entityId}`;
        await this.redis.zremrangebyscore(key, '-inf', cutoff);
        return await this.redis.zcard(key);
      } catch (err) {
        logger.warn({ err: err.message, type, entityId },
          '[VelocityService] Redis count failed — falling back to PG');
      }
    }

    // PostgreSQL fallback
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS cnt FROM velocity_events
       WHERE event_type = $1 AND entity_id = $2
         AND created_at > NOW() - ($3 || ' seconds')::interval`,
      [type, entityId, windowSeconds.toString()]
    );
    return rows[0].cnt;
  }

  /**
   * Get sum of amounts within a sliding window (backward-compatible).
   *
   * @param {string} type - Event type
   * @param {string} entityId - Identifier
   * @param {number} windowSeconds - Window size in seconds
   * @returns {Promise<number>} Sum of amount_cents
   */
  async getSum(type, entityId, windowSeconds) {
    const cutoff = Date.now() - (windowSeconds * 1000);

    if (this._isRedisAvailable()) {
      try {
        const key = `${KEY_PREFIX}:${type}:${entityId}`;
        await this.redis.zremrangebyscore(key, '-inf', cutoff);
        const members = await this.redis.zrangebyscore(key, cutoff, '+inf');
        let sum = 0;
        for (const m of members) {
          try {
            const parsed = JSON.parse(m);
            sum += parsed.amount || 0;
          } catch { /* skip malformed */ }
        }
        return sum;
      } catch (err) {
        logger.warn({ err: err.message, type, entityId },
          '[VelocityService] Redis sum failed — falling back to PG');
      }
    }

    // PostgreSQL fallback
    const { rows } = await this.pool.query(
      `SELECT COALESCE(SUM(amount_cents), 0)::int AS total FROM velocity_events
       WHERE event_type = $1 AND entity_id = $2
         AND created_at > NOW() - ($3 || ' seconds')::interval`,
      [type, entityId, windowSeconds.toString()]
    );
    return rows[0].total;
  }

  // =========================================================================
  // INTERNALS
  // =========================================================================

  /**
   * Check if Redis client is connected and usable.
   */
  _isRedisAvailable() {
    return this.redis && this.redis.status === 'ready';
  }

  /**
   * Purge velocity events older than 24 hours (PostgreSQL).
   */
  async cleanup() {
    const { rowCount } = await this.pool.query(
      "DELETE FROM velocity_events WHERE created_at < NOW() - INTERVAL '24 hours'"
    );
    if (rowCount > 0) {
      logger.info({ purged: rowCount }, '[VelocityService] Cleaned up old velocity events');
    }
  }

  /**
   * Stop cleanup interval (for graceful shutdown).
   */
  destroy() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }
}

module.exports = VelocityService;
