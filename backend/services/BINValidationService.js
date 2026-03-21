/**
 * TeleTime POS - BIN Validation Service
 *
 * Identifies card brand, type (credit/debit/prepaid), issuing bank, and country
 * from the first 6-8 digits of a card number (Bank Identification Number).
 *
 * Three-tier lookup: Redis cache → PostgreSQL bin_cache → binlist.net API
 * Falls back to a local static BIN range table when the API is unavailable.
 *
 * Used by FraudDetectionService to score prepaid, foreign, and commercial cards.
 */

const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REDIS_KEY_PREFIX = 'fraud:bin';
const REDIS_TTL = 7776000; // 90 days in seconds
const RATE_LIMIT_KEY = 'fraud:bin:ratelimit';
const RATE_LIMIT_WINDOW = 60;   // 1 minute
const RATE_LIMIT_MAX = 10;      // 10 requests per minute (binlist.net free tier)
const API_TIMEOUT_MS = 5000;
const PG_EXPIRY_DAYS = 90;

// ---------------------------------------------------------------------------
// Static BIN range table — major Canadian & international card prefixes
// Used as final fallback when both Redis/PG cache and binlist.net are empty.
// ---------------------------------------------------------------------------

const STATIC_BIN_TABLE = [
  // Canadian Big 5 banks — Visa
  { prefix: '450601', brand: 'visa', type: 'debit', issuerName: 'Royal Bank of Canada', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { prefix: '450602', brand: 'visa', type: 'credit', issuerName: 'Royal Bank of Canada', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { prefix: '454722', brand: 'visa', type: 'debit', issuerName: 'Toronto-Dominion Bank', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { prefix: '454723', brand: 'visa', type: 'credit', issuerName: 'Toronto-Dominion Bank', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { prefix: '450046', brand: 'visa', type: 'debit', issuerName: 'Bank of Montreal', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { prefix: '450047', brand: 'visa', type: 'credit', issuerName: 'Bank of Montreal', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { prefix: '455702', brand: 'visa', type: 'debit', issuerName: 'Bank of Nova Scotia', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { prefix: '455703', brand: 'visa', type: 'credit', issuerName: 'Bank of Nova Scotia', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { prefix: '457142', brand: 'visa', type: 'debit', issuerName: 'CIBC', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { prefix: '457143', brand: 'visa', type: 'credit', issuerName: 'CIBC', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { prefix: '453107', brand: 'visa', type: 'debit', issuerName: 'Desjardins Group', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { prefix: '453108', brand: 'visa', type: 'credit', issuerName: 'Desjardins Group', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { prefix: '451209', brand: 'visa', type: 'credit', issuerName: 'National Bank of Canada', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { prefix: '450940', brand: 'visa', type: 'credit', issuerName: 'Canadian Tire Bank', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },

  // Canadian Big 5 — Mastercard
  { prefix: '525893', brand: 'mastercard', type: 'credit', issuerName: 'Royal Bank of Canada', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'standard' },
  { prefix: '549186', brand: 'mastercard', type: 'credit', issuerName: 'Toronto-Dominion Bank', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'standard' },
  { prefix: '516730', brand: 'mastercard', type: 'credit', issuerName: 'Bank of Montreal', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'standard' },
  { prefix: '540463', brand: 'mastercard', type: 'credit', issuerName: 'Bank of Nova Scotia', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'standard' },
  { prefix: '520561', brand: 'mastercard', type: 'credit', issuerName: 'CIBC', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'standard' },
  { prefix: '549100', brand: 'mastercard', type: 'credit', issuerName: 'Desjardins Group', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'standard' },

  // Common Canadian prepaid BINs
  { prefix: '431274', brand: 'visa', type: 'prepaid', issuerName: 'Peoples Trust Company', issuerCountry: 'CA', isPrepaid: true, isCommercial: false, category: 'prepaid' },
  { prefix: '474515', brand: 'visa', type: 'prepaid', issuerName: 'Peoples Trust Company', issuerCountry: 'CA', isPrepaid: true, isCommercial: false, category: 'prepaid' },
  { prefix: '402632', brand: 'visa', type: 'prepaid', issuerName: 'STACK Prepaid Mastercard', issuerCountry: 'CA', isPrepaid: true, isCommercial: false, category: 'prepaid' },
  { prefix: '516632', brand: 'mastercard', type: 'prepaid', issuerName: 'Home Trust Company', issuerCountry: 'CA', isPrepaid: true, isCommercial: false, category: 'prepaid' },
  { prefix: '533248', brand: 'mastercard', type: 'prepaid', issuerName: 'Koho Financial', issuerCountry: 'CA', isPrepaid: true, isCommercial: false, category: 'prepaid' },
  { prefix: '530680', brand: 'mastercard', type: 'prepaid', issuerName: 'Wealthsimple Cash', issuerCountry: 'CA', isPrepaid: true, isCommercial: false, category: 'prepaid' },

  // Generic brand-level fallback (by IIN prefix ranges)
  { prefix: '4', brand: 'visa', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '51', brand: 'mastercard', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '52', brand: 'mastercard', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '53', brand: 'mastercard', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '54', brand: 'mastercard', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '55', brand: 'mastercard', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '2221', brand: 'mastercard', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '23', brand: 'mastercard', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '24', brand: 'mastercard', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '25', brand: 'mastercard', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '26', brand: 'mastercard', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '27', brand: 'mastercard', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '34', brand: 'amex', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '37', brand: 'amex', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '6011', brand: 'discover', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '65', brand: 'discover', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
  { prefix: '3528', brand: 'jcb', type: 'credit', issuerName: null, issuerCountry: 'JP', isPrepaid: false, isCommercial: false, category: null },
  { prefix: '36', brand: 'diners', type: 'credit', issuerName: null, issuerCountry: null, isPrepaid: false, isCommercial: false, category: null },
];

// Sort longest prefix first so lookups match most specific entry
STATIC_BIN_TABLE.sort((a, b) => b.prefix.length - a.prefix.length);

// ---------------------------------------------------------------------------
// Canadian bank BINs for batch preload
// ---------------------------------------------------------------------------

const CANADIAN_PRELOAD_BINS = [
  // RBC
  { bin: '450601', brand: 'visa', type: 'debit', issuerName: 'Royal Bank of Canada', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { bin: '450602', brand: 'visa', type: 'credit', issuerName: 'Royal Bank of Canada', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { bin: '525893', brand: 'mastercard', type: 'credit', issuerName: 'Royal Bank of Canada', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'standard' },
  // TD
  { bin: '454722', brand: 'visa', type: 'debit', issuerName: 'Toronto-Dominion Bank', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { bin: '454723', brand: 'visa', type: 'credit', issuerName: 'Toronto-Dominion Bank', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { bin: '549186', brand: 'mastercard', type: 'credit', issuerName: 'Toronto-Dominion Bank', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'standard' },
  // BMO
  { bin: '450046', brand: 'visa', type: 'debit', issuerName: 'Bank of Montreal', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { bin: '450047', brand: 'visa', type: 'credit', issuerName: 'Bank of Montreal', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { bin: '516730', brand: 'mastercard', type: 'credit', issuerName: 'Bank of Montreal', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'standard' },
  // Scotiabank
  { bin: '455702', brand: 'visa', type: 'debit', issuerName: 'Bank of Nova Scotia', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { bin: '455703', brand: 'visa', type: 'credit', issuerName: 'Bank of Nova Scotia', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { bin: '540463', brand: 'mastercard', type: 'credit', issuerName: 'Bank of Nova Scotia', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'standard' },
  // CIBC
  { bin: '457142', brand: 'visa', type: 'debit', issuerName: 'CIBC', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { bin: '457143', brand: 'visa', type: 'credit', issuerName: 'CIBC', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { bin: '520561', brand: 'mastercard', type: 'credit', issuerName: 'CIBC', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'standard' },
  // Desjardins
  { bin: '453107', brand: 'visa', type: 'debit', issuerName: 'Desjardins Group', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { bin: '453108', brand: 'visa', type: 'credit', issuerName: 'Desjardins Group', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  { bin: '549100', brand: 'mastercard', type: 'credit', issuerName: 'Desjardins Group', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'standard' },
  // National Bank
  { bin: '451209', brand: 'visa', type: 'credit', issuerName: 'National Bank of Canada', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  // Canadian Tire
  { bin: '450940', brand: 'visa', type: 'credit', issuerName: 'Canadian Tire Bank', issuerCountry: 'CA', isPrepaid: false, isCommercial: false, category: 'classic' },
  // Prepaid (common in fraud)
  { bin: '431274', brand: 'visa', type: 'prepaid', issuerName: 'Peoples Trust Company', issuerCountry: 'CA', isPrepaid: true, isCommercial: false, category: 'prepaid' },
  { bin: '474515', brand: 'visa', type: 'prepaid', issuerName: 'Peoples Trust Company', issuerCountry: 'CA', isPrepaid: true, isCommercial: false, category: 'prepaid' },
  { bin: '516632', brand: 'mastercard', type: 'prepaid', issuerName: 'Home Trust Company', issuerCountry: 'CA', isPrepaid: true, isCommercial: false, category: 'prepaid' },
  { bin: '533248', brand: 'mastercard', type: 'prepaid', issuerName: 'Koho Financial', issuerCountry: 'CA', isPrepaid: true, isCommercial: false, category: 'prepaid' },
  { bin: '530680', brand: 'mastercard', type: 'prepaid', issuerName: 'Wealthsimple Cash', issuerCountry: 'CA', isPrepaid: true, isCommercial: false, category: 'prepaid' },
];


class BINValidationService {
  /**
   * @param {import('pg').Pool} pool - PostgreSQL connection pool
   * @param {import('ioredis').Redis|null} redisClient - ioredis client (optional)
   */
  constructor(pool, redisClient = null) {
    this.pool = pool;
    this.redis = redisClient;
  }

  // =========================================================================
  // PRIMARY LOOKUP
  // =========================================================================

  /**
   * Look up a BIN (first 6-8 digits of a card number).
   *
   * Three-tier: Redis → PostgreSQL bin_cache → binlist.net API → static table.
   *
   * @param {string} bin - 6-8 digit BIN string
   * @returns {Promise<{bin:string, brand:string|null, type:string|null, category:string|null,
   *   issuerName:string|null, issuerCountry:string|null, isPrepaid:boolean, isCommercial:boolean}|null>}
   */
  async lookupBIN(bin) {
    if (!bin || bin.length < 6) return null;
    const cleanBin = bin.substring(0, 8).replace(/\D/g, '');
    if (cleanBin.length < 6) return null;

    // Tier 1: Redis cache
    const redisResult = await this._readRedis(cleanBin);
    if (redisResult) return redisResult;

    // Tier 2: PostgreSQL bin_cache (only non-expired rows)
    const pgResult = await this._readPostgres(cleanBin);
    if (pgResult) {
      this._writeRedis(cleanBin, pgResult); // backfill Redis (fire-and-forget)
      return pgResult;
    }

    // Tier 3: binlist.net API (only accept if it returned meaningful data)
    const apiResult = await this._fetchFromAPI(cleanBin);
    if (apiResult && apiResult.brand) {
      this._cacheResult(cleanBin, apiResult); // persist to both caches
      return apiResult;
    }

    // Tier 4 (fallback): Local static BIN table
    const staticResult = this._lookupStatic(cleanBin);
    if (staticResult) {
      this._cacheResult(cleanBin, staticResult); // cache static match for future lookups
      return staticResult;
    }

    return null;
  }

  /**
   * Backward-compatible alias for lookupBIN.
   * Called by FraudDetectionService as `binService.lookup(cardBin)`.
   */
  async lookup(bin) {
    return this.lookupBIN(bin);
  }

  // =========================================================================
  // RISK ASSESSMENT
  // =========================================================================

  /**
   * Assess fraud risk based on BIN data.
   *
   * @param {object} binData - Result from lookupBIN()
   * @param {string} [entryMethod] - Card entry method ('chip','swipe','tap','moto','manual')
   * @returns {{riskPoints: number, flags: string[]}}
   */
  assessBINRisk(binData, entryMethod = null) {
    if (!binData) return { riskPoints: 0, flags: [] };

    let points = 0;
    const flags = [];

    // Prepaid cards — high risk for electronics retail
    if (binData.isPrepaid) {
      points += 8;
      flags.push('prepaid_card');
    }

    // Foreign-issued card (not Canadian)
    if (binData.issuerCountry && binData.issuerCountry !== 'CA') {
      points += 6;
      flags.push('foreign_card');
    }

    // Commercial/corporate card — slightly elevated risk
    if (binData.isCommercial) {
      points += 2;
      flags.push('commercial_card');
    }

    // Debit card used in MOTO (mail order / telephone order) — unusual
    if (binData.type === 'debit' && entryMethod === 'moto') {
      points += 4;
      flags.push('debit_moto');
    }

    return { riskPoints: Math.min(points, 15), flags };
  }

  // =========================================================================
  // BATCH PRELOAD
  // =========================================================================

  /**
   * Preload common Canadian bank BIN ranges into both Redis and PostgreSQL caches.
   * Call once on startup to prime the cache and avoid API calls for known local cards.
   *
   * @returns {Promise<{loaded: number, skipped: number}>}
   */
  async preloadCanadianBINs() {
    let loaded = 0;
    let skipped = 0;

    for (const entry of CANADIAN_PRELOAD_BINS) {
      try {
        // Check if already cached in PostgreSQL
        const { rows } = await this.pool.query(
          'SELECT bin FROM bin_cache WHERE bin = $1 AND expires_at > NOW()',
          [entry.bin]
        );

        if (rows.length > 0) {
          // Already cached and not expired — just backfill Redis
          this._writeRedis(entry.bin, this._fromPreloadEntry(entry));
          skipped++;
          continue;
        }

        const data = this._fromPreloadEntry(entry);

        // Write to PostgreSQL
        await this.pool.query(
          `INSERT INTO bin_cache (bin, card_brand, card_type, issuer_name, issuer_country, is_prepaid, is_commercial, category, expires_at, raw_response)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + ($10 * INTERVAL '1 day'), $9)
           ON CONFLICT (bin) DO UPDATE SET
             card_brand = EXCLUDED.card_brand, card_type = EXCLUDED.card_type,
             issuer_name = EXCLUDED.issuer_name, issuer_country = EXCLUDED.issuer_country,
             is_prepaid = EXCLUDED.is_prepaid, is_commercial = EXCLUDED.is_commercial,
             category = EXCLUDED.category, expires_at = EXCLUDED.expires_at,
             raw_response = EXCLUDED.raw_response, fetched_at = NOW()`,
          [entry.bin, entry.brand, entry.type, entry.issuerName, entry.issuerCountry,
           entry.isPrepaid, entry.isCommercial, entry.category,
           JSON.stringify({ source: 'preload', ...entry }), PG_EXPIRY_DAYS]
        );

        // Write to Redis
        this._writeRedis(entry.bin, data);
        loaded++;
      } catch (err) {
        logger.warn({ err: err.message, bin: entry.bin }, '[BINService] Preload entry failed');
      }
    }

    logger.info({ loaded, skipped, total: CANADIAN_PRELOAD_BINS.length },
      '[BINService] Canadian BIN preload complete');

    return { loaded, skipped };
  }

  // =========================================================================
  // TIER 1: Redis
  // =========================================================================

  /** @private */
  async _readRedis(bin) {
    if (!this._isRedisAvailable()) return null;
    try {
      const cached = await this.redis.get(`${REDIS_KEY_PREFIX}:${bin}`);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      logger.warn({ err: err.message, bin }, '[BINService] Redis read failed');
    }
    return null;
  }

  /** @private — fire-and-forget */
  _writeRedis(bin, data) {
    if (!this._isRedisAvailable()) return;
    this.redis.set(`${REDIS_KEY_PREFIX}:${bin}`, JSON.stringify(data), 'EX', REDIS_TTL)
      .catch(err => logger.warn({ err: err.message, bin }, '[BINService] Redis write failed'));
  }

  // =========================================================================
  // TIER 2: PostgreSQL bin_cache
  // =========================================================================

  /** @private */
  async _readPostgres(bin) {
    try {
      const { rows } = await this.pool.query(
        'SELECT * FROM bin_cache WHERE bin = $1 AND (expires_at IS NULL OR expires_at > NOW())',
        [bin]
      );
      if (rows[0]) return this._normalizeRow(rows[0]);
    } catch (err) {
      logger.warn({ err: err.message, bin }, '[BINService] PG read failed');
    }
    return null;
  }

  // =========================================================================
  // TIER 3: binlist.net API
  // =========================================================================

  /** @private */
  async _fetchFromAPI(bin) {
    // Token bucket rate limiting
    if (!(await this._acquireRateToken())) {
      logger.debug({ bin }, '[BINService] Rate limited — skipping API call');
      return null;
    }

    try {
      const response = await fetch(`https://lookup.binlist.net/${bin}`, {
        headers: { 'Accept-Version': '3' },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });

      if (!response.ok) {
        if (response.status === 429) {
          logger.warn({ bin }, '[BINService] API rate limited (429)');
        }
        return null;
      }

      const data = await response.json();

      return {
        bin,
        brand: (data.scheme || '').toLowerCase() || null,
        type: (data.type || '').toLowerCase() || null,
        category: (data.brand || '').toLowerCase() || null,
        issuerName: data.bank?.name || null,
        issuerCountry: data.country?.alpha2 || null,
        isPrepaid: data.prepaid === true,
        isCommercial: data.type === 'commercial' || false,
      };
    } catch (err) {
      logger.warn({ err: err.message, bin }, '[BINService] API fetch failed');
      return null;
    }
  }

  /**
   * Token bucket rate limiter using Redis sorted sets.
   * Falls back to a simple in-memory timestamp when Redis is unavailable.
   * @private
   * @returns {Promise<boolean>} true if a token was acquired
   */
  async _acquireRateToken() {
    if (this._isRedisAvailable()) {
      try {
        const now = Date.now();
        const cutoff = now - (RATE_LIMIT_WINDOW * 1000);

        const pipeline = this.redis.pipeline();
        pipeline.zremrangebyscore(RATE_LIMIT_KEY, '-inf', cutoff);
        pipeline.zcard(RATE_LIMIT_KEY);
        pipeline.zadd(RATE_LIMIT_KEY, now, `${now}:${Math.random()}`);
        pipeline.expire(RATE_LIMIT_KEY, RATE_LIMIT_WINDOW + 10);
        const results = await pipeline.exec();

        const count = results[1][1]; // ZCARD result
        if (count >= RATE_LIMIT_MAX) {
          // Remove the entry we just added (we're over limit)
          await this.redis.zremrangebyscore(RATE_LIMIT_KEY, now, now);
          return false;
        }
        return true;
      } catch (err) {
        logger.warn({ err: err.message }, '[BINService] Redis rate limit check failed');
        // Fall through to in-memory fallback
      }
    }

    // In-memory fallback — simple timestamp
    if (!this._lastApiCall) this._lastApiCall = 0;
    const now = Date.now();
    if (now - this._lastApiCall < 6000) return false; // ~10/min
    this._lastApiCall = now;
    return true;
  }

  // =========================================================================
  // TIER 4: Static BIN table
  // =========================================================================

  /**
   * Match a BIN against the local static table.
   * Tries longest prefix first for the most specific match.
   * @private
   */
  _lookupStatic(bin) {
    for (const entry of STATIC_BIN_TABLE) {
      if (bin.startsWith(entry.prefix)) {
        return {
          bin,
          brand: entry.brand,
          type: entry.type,
          category: entry.category,
          issuerName: entry.issuerName,
          issuerCountry: entry.issuerCountry,
          isPrepaid: entry.isPrepaid,
          isCommercial: entry.isCommercial,
        };
      }
    }
    return null;
  }

  // =========================================================================
  // CACHE WRITE (both tiers)
  // =========================================================================

  /** @private — persist to Redis + PostgreSQL (fire-and-forget) */
  _cacheResult(bin, data) {
    // Redis
    this._writeRedis(bin, data);

    // PostgreSQL
    this.pool.query(
      `INSERT INTO bin_cache (bin, card_brand, card_type, issuer_name, issuer_country, is_prepaid, is_commercial, category, expires_at, raw_response)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + ($10 * INTERVAL '1 day'), $9)
       ON CONFLICT (bin) DO UPDATE SET
         card_brand = EXCLUDED.card_brand, card_type = EXCLUDED.card_type,
         issuer_name = EXCLUDED.issuer_name, issuer_country = EXCLUDED.issuer_country,
         is_prepaid = EXCLUDED.is_prepaid, is_commercial = EXCLUDED.is_commercial,
         category = EXCLUDED.category, expires_at = EXCLUDED.expires_at,
         raw_response = EXCLUDED.raw_response, fetched_at = NOW()`,
      [bin, data.brand, data.type, data.issuerName, data.issuerCountry,
       data.isPrepaid, data.isCommercial, data.category,
       JSON.stringify(data), PG_EXPIRY_DAYS]
    ).catch(err => logger.warn({ err: err.message, bin }, '[BINService] PG cache write failed'));
  }

  // =========================================================================
  // NORMALIZATION
  // =========================================================================

  /**
   * Normalize a PostgreSQL bin_cache row to the standard return shape.
   * @private
   */
  _normalizeRow(row) {
    return {
      bin: row.bin,
      brand: row.card_brand,
      type: row.card_type,
      category: row.category || null,
      issuerName: row.issuer_name,
      issuerCountry: row.issuer_country,
      isPrepaid: row.is_prepaid === true,
      isCommercial: row.is_commercial === true,
    };
  }

  /**
   * Convert a preload entry to the standard return shape.
   * @private
   */
  _fromPreloadEntry(entry) {
    return {
      bin: entry.bin,
      brand: entry.brand,
      type: entry.type,
      category: entry.category,
      issuerName: entry.issuerName,
      issuerCountry: entry.issuerCountry,
      isPrepaid: entry.isPrepaid,
      isCommercial: entry.isCommercial,
    };
  }

  // =========================================================================
  // BACKWARD COMPATIBILITY — FraudDetectionService reads these field names
  // =========================================================================

  // FraudDetectionService accesses: binData.cardBrand, binData.cardType,
  // binData.issuerName, binData.issuerCountry, binData.isPrepaid
  // Our new shape uses: brand, type. Provide getters via a wrapping proxy
  // in lookup() — simpler: just add aliased fields in the return objects.

  // Actually, the cleanest approach: normalize ALL outputs to include both
  // old and new field names. Done in _addAliases below.

  /**
   * Add backward-compatible aliases to a result object.
   * Old callers use: cardBrand, cardType
   * New callers use: brand, type
   * @private
   */
  _addAliases(data) {
    if (!data) return data;
    return {
      ...data,
      cardBrand: data.brand,
      cardType: data.type,
    };
  }

  // =========================================================================
  // INTERNALS
  // =========================================================================

  /** @private */
  _isRedisAvailable() {
    return this.redis && this.redis.status === 'ready';
  }
}

// ---------------------------------------------------------------------------
// Override lookupBIN and lookup to add backward-compatible aliases
// ---------------------------------------------------------------------------
const origLookupBIN = BINValidationService.prototype.lookupBIN;
BINValidationService.prototype.lookupBIN = async function (bin) {
  const result = await origLookupBIN.call(this, bin);
  return this._addAliases(result);
};

const origLookup = BINValidationService.prototype.lookup;
BINValidationService.prototype.lookup = async function (bin) {
  const result = await origLookup.call(this, bin);
  return this._addAliases(result);
};

module.exports = BINValidationService;
