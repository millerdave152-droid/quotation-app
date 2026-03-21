/**
 * TeleTime POS - Fraud Scoring Service
 *
 * Central fraud scoring engine that evaluates every transaction against
 * configurable rules and produces a composite risk score (0-100).
 *
 * Depends on:
 *   - VelocityService   (Redis-backed sliding window velocity checks)
 *   - BINValidationService (card BIN lookup + risk assessment)
 *   - PostgreSQL          (fraud_rules, employee_risk_profiles, chargeback_cases, fraud_scores)
 *   - Redis (optional)    (rolling averages for amount anomaly z-scores)
 */

const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Entry-method risk points (static table)
// ---------------------------------------------------------------------------

const ENTRY_METHOD_RISK = {
  chip: 0,
  contactless: 0,
  tap: 0,
  ecommerce: 3,
  swipe: 8,
  fallback_swipe: 8,
  moto: 10,
  manual: 12,
  keyed: 12,
};

// ---------------------------------------------------------------------------
// Redis key constants
// ---------------------------------------------------------------------------

const AVG_KEY_PREFIX = 'fraud:score:avg';  // rolling averages per location:category
const AVG_TTL = 604800; // 7 days


class FraudScoringService {
  /**
   * @param {import('pg').Pool} pool
   * @param {object} deps
   * @param {import('./VelocityService')} deps.velocityService
   * @param {import('./BINValidationService')} deps.binService
   * @param {import('ioredis').Redis|null} deps.redisClient
   */
  constructor(pool, deps = {}) {
    this.pool = pool;
    this.velocityService = deps.velocityService || null;
    this.binService = deps.binService || null;
    this.redis = deps.redisClient || null;
    this.mlScoringService = deps.mlScoringService || null;

    this.rules = [];
    this._rulesCacheTime = 0;
    this._refreshInterval = null;
    this._initialized = false;
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  /**
   * Load rules and start the 5-minute auto-refresh interval.
   * Call once during server startup.
   */
  async initialize() {
    await this.loadRules();
    this._refreshInterval = setInterval(() => {
      this.loadRules().catch(err =>
        logger.error({ err: err.message }, '[FraudScoring] Rule refresh failed')
      );
    }, 300000); // 5 minutes
    this._initialized = true;
    logger.info({ ruleCount: this.rules.length }, '[FraudScoring] Initialized');
  }

  /**
   * Load active fraud rules from the database into memory cache.
   */
  async loadRules() {
    try {
      const { rows } = await this.pool.query(
        'SELECT * FROM fraud_rules WHERE is_active = true ORDER BY weight DESC, risk_points DESC'
      );
      this.rules = rows;
      this._rulesCacheTime = Date.now();
      return rows;
    } catch (err) {
      logger.error({ err: err.message }, '[FraudScoring] Failed to load rules');
      return this.rules; // return stale cache if available
    }
  }

  // =========================================================================
  // MAIN SCORING
  // =========================================================================

  /**
   * Score a transaction against all configured rules.
   *
   * @param {object} txnData
   * @param {number} txnData.amount       - Transaction amount in dollars
   * @param {string} [txnData.cardBin]    - First 6-8 digits
   * @param {string} [txnData.lastFour]   - Last 4 digits
   * @param {string} [txnData.entryMethod] - chip/tap/swipe/moto/manual/ecommerce
   * @param {string} [txnData.terminalId]
   * @param {number} [txnData.employeeId]
   * @param {number} [txnData.locationId]
   * @param {number} [txnData.customerId]
   * @param {string} [txnData.category]   - Product category for amount anomaly
   * @param {string} [txnData.ipAddress]
   * @returns {Promise<{score: number, riskLevel: string, action: string, signals: object, triggeredRules: object[]}>}
   */
  async scoreTransaction(txnData) {
    const signals = {};
    const triggeredRules = [];
    let totalPoints = 0;

    // Run ALL independent checks in parallel for maximum performance
    const [
      velocityResult, binResult, employeeResult, customerResult,
      amountAnomaly, splitResult, cardTestResult, geoResult, declineResult,
    ] = await Promise.all([
      this._checkVelocity(txnData),
      this._checkBINRisk(txnData),
      this._checkEmployeeRisk(txnData.employeeId),
      this._checkCustomerAnomaly(txnData.customerId, txnData.amount),
      this._checkAmountAnomaly(txnData),
      this._detectSplitTransaction(txnData),
      this._detectCardTesting(txnData),
      this._detectGeographicAnomaly(txnData),
      this._analyzeDeclinePattern(txnData),
    ]);

    // --- (a) Velocity checks ---
    if (velocityResult) {
      signals.velocity = velocityResult;
      for (const [key, check] of Object.entries(velocityResult)) {
        if (check.exceeded) {
          const pts = check.riskPoints || 0;
          totalPoints += pts;
          triggeredRules.push({ source: 'velocity', dimension: key, riskPoints: pts, details: check });
        }
      }
    }

    // --- (b) Amount anomaly ---
    signals.amount_anomaly = amountAnomaly;
    if (amountAnomaly.riskPoints > 0) {
      totalPoints += amountAnomaly.riskPoints;
      triggeredRules.push({ source: 'amount_anomaly', riskPoints: amountAnomaly.riskPoints, details: amountAnomaly });
    }

    // --- (c) BIN risk ---
    if (binResult) {
      signals.bin_risk = binResult;
      if (binResult.riskPoints > 0) {
        totalPoints += binResult.riskPoints;
        triggeredRules.push({ source: 'bin_risk', riskPoints: binResult.riskPoints, details: binResult });
      }
    }

    // --- (d) Time anomaly (sync — not in Promise.all) ---
    const timeAnomaly = this._checkTimeAnomaly();
    signals.time_anomaly = timeAnomaly;
    if (timeAnomaly.riskPoints > 0) {
      totalPoints += timeAnomaly.riskPoints;
      triggeredRules.push({ source: 'time_anomaly', riskPoints: timeAnomaly.riskPoints, details: timeAnomaly });
    }

    // --- (e) Entry method risk (sync) ---
    const entryRisk = this._checkEntryMethodRisk(txnData.entryMethod);
    signals.entry_method = entryRisk;
    if (entryRisk.riskPoints > 0) {
      totalPoints += entryRisk.riskPoints;
      triggeredRules.push({ source: 'entry_method', riskPoints: entryRisk.riskPoints, details: entryRisk });
    }

    // --- (f) Employee risk ---
    if (employeeResult) {
      signals.employee_risk = employeeResult;
      if (employeeResult.riskPoints > 0) {
        totalPoints += employeeResult.riskPoints;
        triggeredRules.push({ source: 'employee_risk', riskPoints: employeeResult.riskPoints, details: employeeResult });
      }
    }

    // --- (g) Split transaction detection ---
    signals.split_transaction = splitResult;
    if (splitResult.riskPoints > 0) {
      totalPoints += splitResult.riskPoints;
      triggeredRules.push({ source: 'split_transaction', riskPoints: splitResult.riskPoints, details: splitResult });
    }

    // --- (h) Card testing detection ---
    signals.card_testing = cardTestResult;
    if (cardTestResult.riskPoints > 0) {
      totalPoints += cardTestResult.riskPoints;
      triggeredRules.push({ source: 'card_testing', riskPoints: cardTestResult.riskPoints, details: cardTestResult });
    }

    // --- (i) Geographic anomaly detection ---
    signals.geographic_anomaly = geoResult;
    if (geoResult.riskPoints > 0) {
      totalPoints += geoResult.riskPoints;
      triggeredRules.push({ source: 'geographic_anomaly', riskPoints: geoResult.riskPoints, details: geoResult });
    }

    // --- (j) Decline pattern analysis ---
    signals.decline_pattern = declineResult;
    if (declineResult.riskPoints > 0) {
      totalPoints += declineResult.riskPoints;
      triggeredRules.push({ source: 'decline_pattern', riskPoints: declineResult.riskPoints, details: declineResult });
    }

    // --- (k) Customer anomaly ---
    if (customerResult) {
      signals.customer_anomaly = customerResult;
      if (customerResult.riskPoints > 0) {
        totalPoints += customerResult.riskPoints;
        triggeredRules.push({ source: 'customer_anomaly', riskPoints: customerResult.riskPoints, details: customerResult });
      }
    }

    // --- (l) MOTO / address divergence ---
    const addressDivergence = this._checkAddressDivergence(txnData);
    if (addressDivergence) {
      signals.address_divergence = addressDivergence;
      if (addressDivergence.riskPoints > 0) {
        totalPoints += addressDivergence.riskPoints;
        triggeredRules.push({ source: 'address_divergence', riskPoints: addressDivergence.riskPoints, details: addressDivergence });
      }
    }

    // Cap at 100
    const ruleScore = Math.min(100, Math.max(0, totalPoints));

    // --- ML Scoring (A/B test) ---
    let finalScore = ruleScore;
    if (this.mlScoringService) {
      try {
        const mlFeatures = {
          amount: parseFloat(txnData.amount || 0),
          hour_of_day: new Date().getHours(),
          entry_method: txnData.entryMethod,
          card_bin: txnData.cardBin,
          velocity_card_count: signals.velocity?.card_use?.count || 0,
          employee_risk_score: signals.employee_risk?.riskScore || 0,
          rule_score: ruleScore,
        };

        const mlResult = await this.mlScoringService.scoreTransaction(mlFeatures);
        const abSignals = this.mlScoringService.buildABSignals(ruleScore, mlResult);

        // Store A/B comparison data in signals
        signals.ml_scoring = abSignals;

        // Use combined score when ML is active (confidence > 0)
        if (mlResult.confidence > 0) {
          finalScore = abSignals.combined_score;
        }
      } catch (_) {
        // ML scoring failure is non-fatal — continue with rule score
      }
    }

    const { riskLevel, action } = this.determineAction(finalScore, txnData);

    const result = { score: finalScore, riskLevel, action, signals, triggeredRules };

    // Fire-and-forget persistence + rolling average update
    this.persistScore(txnData, result);
    this.updateRollingAverages(txnData);

    return result;
  }

  // =========================================================================
  // ACTION DETERMINATION
  // =========================================================================

  /**
   * Determine risk level and action from score.
   *
   * @param {number} score - Composite score 0-100
   * @param {object} txnData - Transaction data for context-dependent thresholds
   * @returns {{riskLevel: string, action: string}}
   */
  determineAction(score, txnData = {}) {
    const amount = parseFloat(txnData.amount || 0);

    if (score >= 86) {
      return { riskLevel: 'critical', action: 'declined' };
    }
    if (score >= 61) {
      // High risk: hold for manager approval if amount > $500, else flag
      if (amount > 500) {
        return { riskLevel: 'high', action: 'held' };
      }
      return { riskLevel: 'high', action: 'flagged' };
    }
    if (score >= 31) {
      return { riskLevel: 'medium', action: 'flagged' };
    }
    return { riskLevel: 'low', action: 'approved' };
  }

  // =========================================================================
  // PERSISTENCE
  // =========================================================================

  /**
   * Insert into fraud_scores table. Fire-and-forget.
   */
  persistScore(txnData, result) {
    const riskLevel = result.riskLevel || 'low';

    this.pool.query(`
      INSERT INTO fraud_scores (
        transaction_id, score, risk_level, signals, action_taken,
        card_bin, card_last_four, entry_method, terminal_id,
        employee_id, location_id, customer_id, amount, currency,
        ip_address
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13, $14,
        $15
      )
    `, [
      txnData.transactionId || null,
      result.score,
      riskLevel,
      JSON.stringify(result.signals),
      result.action,
      txnData.cardBin || null,
      txnData.lastFour || null,
      txnData.entryMethod || null,
      txnData.terminalId || null,
      txnData.employeeId || null,
      txnData.locationId || null,
      txnData.customerId || null,
      parseFloat(txnData.amount || 0),
      txnData.currency || 'CAD',
      txnData.ipAddress || null,
    ]).catch(err => {
      logger.warn({ err: err.message }, '[FraudScoring] Score persistence failed');
    });
  }

  // =========================================================================
  // ROLLING AVERAGES (Exponential Moving Average in Redis)
  // =========================================================================

  /**
   * Update the per-location, per-category rolling average after a successful transaction.
   * Uses exponential moving average: newMean = alpha * value + (1 - alpha) * oldMean
   * Fire-and-forget.
   */
  updateRollingAverages(txnData) {
    const amount = parseFloat(txnData.amount || 0);
    if (amount <= 0) return;

    const locationId = txnData.locationId || 'all';
    const category = txnData.category || 'general';
    const key = `${AVG_KEY_PREFIX}:${locationId}:${category}`;
    const alpha = 0.05; // smoothing factor — slow adaptation

    if (this._isRedisAvailable()) {
      this.redis.get(key).then(raw => {
        let stats = raw ? JSON.parse(raw) : { mean: amount, variance: 0, count: 0 };
        const oldMean = stats.mean;
        const newMean = alpha * amount + (1 - alpha) * oldMean;
        // Welford-like variance update
        const diff = amount - oldMean;
        const newVariance = alpha * (diff * diff) + (1 - alpha) * (stats.variance || 0);

        stats = { mean: newMean, variance: newVariance, count: (stats.count || 0) + 1 };
        return this.redis.set(key, JSON.stringify(stats), 'EX', AVG_TTL);
      }).catch(err => {
        logger.warn({ err: err.message }, '[FraudScoring] Rolling average update failed');
      });
    } else {
      // PostgreSQL fallback: store in a lightweight table or just skip
      // The z-score check will return 0 risk when no averages are available
    }
  }

  // =========================================================================
  // LOCATION OVERRIDES
  // =========================================================================

  /**
   * Check if a rule has location-specific parameter overrides.
   *
   * @param {number|string} ruleId - Rule ID or rule_code
   * @param {number|string} locationId - Location to check
   * @returns {object|null} Override parameters or null
   */
  getLocationOverrides(ruleId, locationId) {
    if (!locationId) return null;

    const rule = typeof ruleId === 'string'
      ? this.rules.find(r => r.rule_code === ruleId)
      : this.rules.find(r => r.id === ruleId);

    if (!rule || !rule.location_overrides) return null;

    const overrides = typeof rule.location_overrides === 'string'
      ? JSON.parse(rule.location_overrides)
      : rule.location_overrides;

    return overrides[String(locationId)] || null;
  }

  // =========================================================================
  // INDIVIDUAL CHECK METHODS
  // =========================================================================

  /**
   * (a) Run all velocity checks via VelocityService.checkAllVelocities
   * @private
   */
  async _checkVelocity(txnData) {
    if (!this.velocityService) return null;

    try {
      return await this.velocityService.checkAllVelocities({
        cardBin: txnData.cardBin,
        lastFour: txnData.lastFour,
        terminalId: txnData.terminalId,
        employeeId: txnData.employeeId,
        entryMethod: txnData.entryMethod,
      });
    } catch (err) {
      logger.warn({ err: err.message }, '[FraudScoring] Velocity check failed');
      return null;
    }
  }

  /**
   * (b) Amount anomaly z-score against rolling averages per location/category.
   * @private
   */
  async _checkAmountAnomaly(txnData) {
    const amount = parseFloat(txnData.amount || 0);
    const noAnomaly = { riskPoints: 0, zscore: 0, mean: 0, stddev: 0 };

    if (amount <= 0) return noAnomaly;

    const locationId = txnData.locationId || 'all';
    const category = txnData.category || 'general';

    // Check for location-specific threshold override
    const override = this.getLocationOverrides('amount_anomaly', txnData.locationId);
    const zscoreThreshold = override?.zscore_threshold || 2.5;

    let stats = null;

    if (this._isRedisAvailable()) {
      try {
        const key = `${AVG_KEY_PREFIX}:${locationId}:${category}`;
        const raw = await this.redis.get(key);
        if (raw) stats = JSON.parse(raw);
      } catch (err) {
        logger.warn({ err: err.message }, '[FraudScoring] Redis avg read failed');
      }
    }

    if (!stats || stats.count < 10) {
      // Not enough data for reliable z-score
      return noAnomaly;
    }

    const stddev = Math.sqrt(stats.variance || 0);
    if (stddev < 1) return noAnomaly; // avoid division by near-zero

    const zscore = Math.abs((amount - stats.mean) / stddev);

    let riskPoints = 0;
    if (zscore > 3.5) {
      riskPoints = 15;
    } else if (zscore > zscoreThreshold) {
      riskPoints = 10;
    }

    return {
      riskPoints,
      zscore: Math.round(zscore * 100) / 100,
      mean: Math.round(stats.mean * 100) / 100,
      stddev: Math.round(stddev * 100) / 100,
      threshold: zscoreThreshold,
    };
  }

  /**
   * (c) BIN risk assessment via BINValidationService.assessBINRisk
   * @private
   */
  async _checkBINRisk(txnData) {
    if (!this.binService || !txnData.cardBin) return null;

    try {
      const binData = await this.binService.lookupBIN(txnData.cardBin);
      if (!binData) return { riskPoints: 0, flags: [] };
      return this.binService.assessBINRisk(binData, txnData.entryMethod);
    } catch (err) {
      logger.warn({ err: err.message }, '[FraudScoring] BIN risk check failed');
      return null;
    }
  }

  /**
   * (d) Time anomaly — off-hours activity detection.
   * Uses off_hours_activity rule params if configured, else defaults.
   * @private
   */
  _checkTimeAnomaly() {
    const rule = this.rules.find(r => r.rule_code === 'off_hours_activity');
    const params = rule?.parameters || {};
    const startHour = params.start_hour ?? 22; // 10 PM
    const endHour = params.end_hour ?? 6;       // 6 AM
    const riskPts = rule?.risk_points ?? 10;

    const hour = new Date().getHours();
    const isOffHours = hour >= startHour || hour < endHour;

    return {
      riskPoints: isOffHours ? riskPts : 0,
      currentHour: hour,
      offHoursRange: `${startHour}:00-${endHour}:00`,
      isOffHours,
    };
  }

  /**
   * (e) Entry method risk scoring.
   * @private
   */
  _checkEntryMethodRisk(entryMethod) {
    const method = (entryMethod || '').toLowerCase();
    const riskPoints = ENTRY_METHOD_RISK[method] ?? 0;

    return {
      riskPoints,
      method: method || 'unknown',
    };
  }

  /**
   * (f) Employee risk — query employee_risk_profiles.
   * @private
   */
  async _checkEmployeeRisk(employeeId) {
    if (!employeeId) return { riskPoints: 0, riskLevel: 'unknown' };

    try {
      const { rows } = await this.pool.query(
        'SELECT risk_level, risk_score, flagged_patterns FROM employee_risk_profiles WHERE user_id = $1',
        [employeeId]
      );

      if (rows.length === 0) return { riskPoints: 0, riskLevel: 'normal' };

      const profile = rows[0];
      let riskPoints = 0;

      if (profile.risk_level === 'critical') {
        riskPoints = 10;
      } else if (profile.risk_level === 'elevated') {
        riskPoints = 5;
      }

      return {
        riskPoints,
        riskLevel: profile.risk_level,
        riskScore: profile.risk_score,
        flaggedPatterns: profile.flagged_patterns,
      };
    } catch (err) {
      logger.warn({ err: err.message }, '[FraudScoring] Employee risk check failed');
      return { riskPoints: 0, riskLevel: 'error' };
    }
  }

  /**
   * (g) Split Transaction Detection.
   * Queries fraud_scores for same card at same location within sliding window.
   * Flags 3+ txns with amounts clustering below common payment thresholds.
   * Points: base 10 + 5 per additional split, capped at 30.
   * @private
   */
  async _detectSplitTransaction(txnData) {
    const noResult = { riskPoints: 0, detected: false };

    if (!txnData.cardBin || !txnData.lastFour) return noResult;

    const splitRule = this.rules.find(r => r.rule_code === 'split_transaction');
    if (!splitRule) return noResult;

    const params = splitRule.parameters || {};
    const override = this.getLocationOverrides('split_transaction', txnData.locationId);
    const windowMinutes = override?.window_minutes || params.window_minutes || 30;
    const maxSplits = override?.max_splits || params.max_splits || 3;

    try {
      // Query fraud_scores for same card at same location within window
      const { rows } = await this.pool.query(`
        SELECT amount, created_at FROM fraud_scores
        WHERE card_bin = $1 AND card_last_four = $2
          AND ($3::int IS NULL OR location_id = $3)
          AND created_at > NOW() - ($4 || ' minutes')::interval
        ORDER BY created_at DESC
      `, [txnData.cardBin, txnData.lastFour, txnData.locationId || null, windowMinutes.toString()]);

      const recentCount = rows.length + 1; // +1 for the current transaction

      if (recentCount < maxSplits) return noResult;

      // Check if amounts cluster below common payment thresholds
      const amounts = [...rows.map(r => parseFloat(r.amount)), parseFloat(txnData.amount || 0)];
      const thresholds = [100, 250, 500, 5000];
      let clusteringBelow = null;

      for (const threshold of thresholds) {
        const belowCount = amounts.filter(a => a > 0 && a < threshold).length;
        if (belowCount === amounts.length) {
          clusteringBelow = threshold;
          break;
        }
      }

      const basePts = splitRule.risk_points || 10;
      const extraSplits = Math.max(0, recentCount - maxSplits);
      const riskPoints = Math.min(basePts + (extraSplits * 5), 30);

      return {
        riskPoints,
        detected: true,
        count: recentCount,
        windowMinutes,
        threshold: maxSplits,
        amounts,
        clusteringBelow,
      };
    } catch (err) {
      logger.warn({ err: err.message }, '[FraudScoring] Split transaction check failed');
      return noResult;
    }
  }

  /**
   * (h) Card Testing Detection.
   * Detects rapid small-amount authorization attempts from same BIN range,
   * and multiple cards from same BIN at same terminal (gift card / stolen batch).
   * Points: 15 for small-amount pattern + 10 for multi-card same BIN. Capped at 25.
   * Sets blockLargeTxns flag to recommend blocking subsequent large txns for 1 hour.
   * @private
   */
  async _detectCardTesting(txnData) {
    const noResult = { riskPoints: 0, detected: false };

    if (!txnData.cardBin) return noResult;
    if (!this.velocityService) return noResult;

    const cardTestRule = this.rules.find(r => r.rule_code === 'card_testing');
    if (!cardTestRule) return noResult;

    const params = cardTestRule.parameters || {};
    const windowSeconds = params.window_seconds || 300;
    const minAttempts = params.min_attempts || 3;
    const smallThreshold = params.small_amount_threshold || 5;

    try {
      const cardHash = this.velocityService.hashCard(
        `${txnData.cardBin}${txnData.lastFour || ''}`
      );

      // Check velocity count for this card in 5-minute window
      const count = await this.velocityService.getCount('card_use', cardHash, windowSeconds);

      let riskPoints = 0;
      const flags = [];

      // (a) Small-amount rapid authorizations (sub-$5 average)
      if (count >= minAttempts) {
        const sumCents = await this.velocityService.getSum('card_use', cardHash, windowSeconds);
        const avgAmount = count > 0 ? (sumCents / 100) / count : 0;

        if (avgAmount < smallThreshold) {
          riskPoints += cardTestRule.risk_points || 15;
          flags.push('small_amount_rapid_auth');
        }
      }

      // (b) Multiple distinct cards from same BIN at same terminal
      if (txnData.terminalId) {
        try {
          const { rows } = await this.pool.query(`
            SELECT COUNT(DISTINCT card_last_four)::int AS distinct_cards
            FROM fraud_scores
            WHERE card_bin = $1 AND terminal_id = $2
              AND created_at > NOW() - ($3 || ' seconds')::interval
          `, [txnData.cardBin, txnData.terminalId, windowSeconds.toString()]);

          const distinctCards = rows[0]?.distinct_cards || 0;
          if (distinctCards >= 3) {
            riskPoints += 10;
            flags.push(`multi_card_same_bin:${distinctCards}`);
          }
        } catch { /* non-fatal */ }
      }

      if (riskPoints === 0) return noResult;

      // Flag for blocking subsequent large txns within 1 hour
      const blockLargeTxns = flags.includes('small_amount_rapid_auth') && count >= minAttempts;

      return {
        riskPoints: Math.min(riskPoints, 25),
        detected: true,
        attempts: count,
        windowSeconds,
        threshold: minAttempts,
        flags,
        blockLargeTxns,
      };
    } catch (err) {
      logger.warn({ err: err.message }, '[FraudScoring] Card testing check failed');
      return noResult;
    }
  }

  /**
   * (i) Geographic Anomaly Detection.
   * Uses VelocityService for card location tracking + Haversine distance.
   * Two tiers: impossible travel (>100km / 30min) = 15 pts,
   * suspicious travel (>50km / 60min) = 8 pts.
   * @private
   */
  async _detectGeographicAnomaly(txnData) {
    const noResult = { riskPoints: 0, detected: false };

    if (!this.velocityService || !txnData.cardBin || !txnData.lastFour) return noResult;
    if (!txnData.locationId) return noResult;

    const geoRule = this.rules.find(r => r.rule_code === 'geographic_anomaly');
    if (!geoRule) return noResult;

    try {
      const cardHash = this.velocityService.hashCard(
        `${txnData.cardBin}${txnData.lastFour}`
      );

      const currentLocation = {
        locationId: txnData.locationId,
        lat: txnData.lat || null,
        lng: txnData.lng || null,
      };

      // Track this card's current location
      if (currentLocation.lat != null && currentLocation.lng != null) {
        await this.velocityService.trackCardLocation(
          cardHash, currentLocation.locationId,
          currentLocation.lat, currentLocation.lng
        );
      }

      // Tier 1: Impossible travel — >100km in 30 minutes (15 pts)
      const impossibleResult = await this.velocityService.checkGeographicAnomaly(
        cardHash, currentLocation
      );

      if (impossibleResult.anomaly) {
        return {
          riskPoints: 15,
          detected: true,
          type: 'impossible_travel',
          distanceKm: impossibleResult.details.distanceKm,
          windowMinutes: 30,
          previousLocation: impossibleResult.details.previousLocation,
          currentLocation: impossibleResult.details.currentLocation,
        };
      }

      // Tier 2: Suspicious travel — >50km in 60 minutes (8 pts)
      if (currentLocation.lat != null && currentLocation.lng != null) {
        try {
          const { rows } = await this.pool.query(`
            SELECT metadata, location_id FROM velocity_events
            WHERE event_type = 'card_location' AND entity_id = $1
              AND created_at > NOW() - INTERVAL '60 minutes'
              AND created_at <= NOW() - INTERVAL '30 minutes'
            ORDER BY created_at DESC LIMIT 5
          `, [cardHash]);

          for (const row of rows) {
            const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
            if (meta.lat == null || meta.lng == null) continue;
            if (String(row.location_id) === String(currentLocation.locationId)) continue;

            const distKm = this._haversineKm(
              currentLocation.lat, currentLocation.lng,
              meta.lat, meta.lng
            );

            if (distKm > 50) {
              return {
                riskPoints: 8,
                detected: true,
                type: 'suspicious_travel',
                distanceKm: Math.round(distKm),
                windowMinutes: 60,
                previousLocation: row.location_id,
                currentLocation: currentLocation.locationId,
              };
            }
          }
        } catch { /* non-fatal — the 30-min check still ran */ }
      }

      return noResult;
    } catch (err) {
      logger.warn({ err: err.message }, '[FraudScoring] Geographic anomaly check failed');
      return noResult;
    }
  }

  /**
   * (j) Decline Pattern Analysis.
   * Detects: (a) multiple different cards declined at same terminal (15 pts),
   * (b) same card declined at different terminals (10 pts),
   * (c) declined then retry with smaller amount (5 pts).
   * Capped at 25 pts.
   * @private
   */
  async _analyzeDeclinePattern(txnData) {
    const noResult = { riskPoints: 0, detected: false };

    if (!txnData.terminalId && !txnData.cardBin) return noResult;

    try {
      let riskPoints = 0;
      const flags = [];

      // (a) Multiple different cards declined at same terminal
      if (txnData.terminalId) {
        const { rows } = await this.pool.query(`
          SELECT COUNT(DISTINCT card_bin || COALESCE(card_last_four, ''))::int AS distinct_cards,
                 COUNT(*)::int AS total_declines
          FROM fraud_scores
          WHERE terminal_id = $1 AND action_taken = 'declined'
            AND created_at > NOW() - INTERVAL '10 minutes'
        `, [txnData.terminalId]);

        const distinctCards = rows[0]?.distinct_cards || 0;
        if (distinctCards >= 3) {
          riskPoints += 15;
          flags.push({
            type: 'multi_card_decline_terminal',
            distinctCards,
            totalDeclines: rows[0]?.total_declines || 0,
          });
        }
      }

      // (b) Same card declined at different terminals
      if (txnData.cardBin && txnData.lastFour) {
        const { rows } = await this.pool.query(`
          SELECT COUNT(DISTINCT terminal_id)::int AS distinct_terminals,
                 COUNT(*)::int AS total_declines
          FROM fraud_scores
          WHERE card_bin = $1 AND card_last_four = $2 AND action_taken = 'declined'
            AND created_at > NOW() - INTERVAL '30 minutes'
        `, [txnData.cardBin, txnData.lastFour]);

        const distinctTerminals = rows[0]?.distinct_terminals || 0;
        if (distinctTerminals >= 2) {
          riskPoints += 10;
          flags.push({
            type: 'same_card_multi_terminal_decline',
            distinctTerminals,
            totalDeclines: rows[0]?.total_declines || 0,
          });
        }
      }

      // (c) Declined then retry with smaller amount (limit probing)
      if (txnData.cardBin && txnData.lastFour) {
        const { rows } = await this.pool.query(`
          SELECT amount, action_taken FROM fraud_scores
          WHERE card_bin = $1 AND card_last_four = $2
            AND created_at > NOW() - INTERVAL '15 minutes'
          ORDER BY created_at DESC LIMIT 5
        `, [txnData.cardBin, txnData.lastFour]);

        const currentAmount = parseFloat(txnData.amount || 0);
        const declinedHigher = rows.some(r =>
          r.action_taken === 'declined' && parseFloat(r.amount) > currentAmount
        );

        if (declinedHigher && currentAmount > 0) {
          riskPoints += 5;
          flags.push({
            type: 'decline_then_smaller',
            currentAmount,
            previousDeclinedAmount: rows.find(r => r.action_taken === 'declined')?.amount,
          });
        }
      }

      if (riskPoints === 0) return noResult;

      return {
        riskPoints: Math.min(riskPoints, 25),
        detected: true,
        flags,
      };
    } catch (err) {
      logger.warn({ err: err.message }, '[FraudScoring] Decline pattern check failed');
      return noResult;
    }
  }

  /**
   * (k) Customer Behavior Anomaly.
   * Enhanced customer risk with 4 sub-checks:
   *   (a) Chargebacks in last 12 months: +10 each, cap 30
   *   (b) First-time customer (<7 days) with high-value purchase: +5
   *   (c) Purchase above historical average (z-score > 2.0): +5
   *   (d) Multiple high-value purchases same day: +8
   * Capped at 40 pts.
   * @private
   */
  async _checkCustomerAnomaly(customerId, amount) {
    const amt = parseFloat(amount || 0);

    if (!customerId) {
      if (amt > 500) {
        return { riskPoints: 3, reason: 'high_value_no_customer', amount: amt, flags: [] };
      }
      return { riskPoints: 0, flags: [] };
    }

    try {
      let riskPoints = 0;
      const flags = [];

      // (a) Chargebacks in last 12 months: +10 each, cap 30
      const { rows: cbRows } = await this.pool.query(
        `SELECT COUNT(*)::int AS cnt FROM chargeback_cases
         WHERE customer_id = $1 AND created_at > NOW() - INTERVAL '12 months'`,
        [customerId]
      );
      const chargebackCount = cbRows[0]?.cnt || 0;

      if (chargebackCount > 0) {
        riskPoints += Math.min(chargebackCount * 10, 30);
        flags.push(`chargebacks_12mo:${chargebackCount}`);
      }

      // (b-d) Customer profile checks
      const { rows: custRows } = await this.pool.query(
        `SELECT created_at FROM customers WHERE id = $1`,
        [customerId]
      );

      if (custRows.length > 0) {
        const created = new Date(custRows[0].created_at);
        const daysSinceCreation = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);

        // (b) First-time customer with high-value purchase: +5
        if (daysSinceCreation < 7 && amt > 300) {
          riskPoints += 5;
          flags.push('new_customer_high_value');
        }

        // (c) Purchase above historical average (z-score > 2.0): +5
        const { rows: avgRows } = await this.pool.query(
          `SELECT AVG(total_amount)::numeric AS avg_amount,
                  STDDEV_POP(total_amount)::numeric AS stddev_amount,
                  COUNT(*)::int AS txn_count
           FROM transactions
           WHERE customer_id = $1
             AND created_at > NOW() - INTERVAL '12 months'
             AND status != 'voided'`,
          [customerId]
        );

        const avgAmount = parseFloat(avgRows[0]?.avg_amount || 0);
        const stddevAmount = parseFloat(avgRows[0]?.stddev_amount || 0);
        const txnCount = avgRows[0]?.txn_count || 0;

        if (txnCount >= 3 && avgAmount > 0 && stddevAmount > 1) {
          const zscore = (amt - avgAmount) / stddevAmount;
          if (zscore > 2.0) {
            riskPoints += 5;
            flags.push(`above_historical_avg:zscore_${Math.round(zscore * 10) / 10}`);
          }
        }

        // (d) Multiple high-value purchases same day: +8
        const { rows: todayRows } = await this.pool.query(
          `SELECT COUNT(*)::int AS cnt
           FROM transactions
           WHERE customer_id = $1
             AND created_at >= CURRENT_DATE
             AND status != 'voided'
             AND total_amount > 200`,
          [customerId]
        );

        const highValueToday = todayRows[0]?.cnt || 0;
        if (highValueToday >= 2) {
          riskPoints += 8;
          flags.push(`multi_high_value_today:${highValueToday}`);
        }
      }

      return {
        riskPoints: Math.min(riskPoints, 40),
        chargebackCount,
        flags,
      };
    } catch (err) {
      logger.warn({ err: err.message }, '[FraudScoring] Customer anomaly check failed');
      return { riskPoints: 0, flags: [] };
    }
  }

  // =========================================================================
  // INTERNALS
  // =========================================================================

  /**
   * Haversine formula — distance between two lat/lng points in km.
   * @private
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

  /** @private */
  _isRedisAvailable() {
    return this.redis && this.redis.status === 'ready';
  }

  /**
   * (l) Address divergence check for MOTO transactions.
   * If billing and delivery addresses are in different cities, adds fraud points.
   * @param {object} txnData - Must include billingAddress + deliveryAddress for MOTO
   * @returns {object|null} Divergence signal or null if not applicable
   * @private
   */
  _checkAddressDivergence(txnData) {
    // Only applies when both addresses are present (MOTO with delivery)
    if (!txnData.billingAddress || !txnData.deliveryAddress) return null;

    const billingCity = (txnData.billingAddress.city || '').toLowerCase().trim();
    const deliveryCity = (txnData.deliveryAddress.city || '').toLowerCase().trim();

    if (!billingCity || !deliveryCity) return null;

    const citiesDiffer = billingCity !== deliveryCity;
    const postalsDiffer = (txnData.billingAddress.postalCode || '').replace(/\s/g, '').toUpperCase() !==
                          (txnData.deliveryAddress.postalCode || '').replace(/\s/g, '').toUpperCase();

    if (!citiesDiffer && !postalsDiffer) {
      return { riskPoints: 0, divergent: false, detail: 'Addresses match' };
    }

    // Different cities = +5 (configurable via moto_settings)
    const riskPoints = citiesDiffer ? 5 : 0;

    return {
      riskPoints,
      divergent: true,
      citiesDiffer,
      postalsDiffer,
      billingCity: txnData.billingAddress.city,
      deliveryCity: txnData.deliveryAddress.city,
      detail: citiesDiffer
        ? `Billing city "${txnData.billingAddress.city}" differs from delivery city "${txnData.deliveryAddress.city}"`
        : 'Delivery postal code differs from billing postal code',
    };
  }

  /**
   * Stop the auto-refresh interval (for graceful shutdown).
   */
  destroy() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
  }
}

module.exports = FraudScoringService;
