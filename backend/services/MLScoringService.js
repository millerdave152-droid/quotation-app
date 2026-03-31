/**
 * TeleTime POS - ML Scoring Service
 *
 * Pluggable interface for machine learning-based fraud scoring.
 * Currently returns the rule-based score as a placeholder.
 * In the future, this will call a Python FastAPI microservice.
 *
 * Kill switches (all must be true for ML to run):
 *   1. ML_SCORING_ENABLED env var (default: false)
 *   2. feature_flags.ml_scoring_enabled DB flag (checked via Redis-cached query)
 *   3. Circuit breaker on ML endpoint (3 failures in 60s → open for 5 minutes)
 *
 * Configuration:
 *   ML_SCORING_ENABLED    - 'true' to enable ML scoring (default: false)
 *   ML_SCORING_URL        - URL of the Python FastAPI microservice
 *   ML_MODEL_VERSION      - Current model version string
 *   ML_WEIGHT             - Weight for ML score in combined scoring (0-1, default: 0.4)
 *   RULE_WEIGHT           - Weight for rule-based score (0-1, default: 0.6)
 */

const logger = require('../utils/logger');
const CircuitBreaker = require('../utils/circuitBreaker');

class MLScoringService {
  /**
   * @param {object} config
   * @param {boolean} config.enabled     - Whether ML scoring is active (env gate)
   * @param {string}  config.serviceUrl  - URL of the ML microservice
   * @param {string}  config.modelVersion - Model version identifier
   * @param {number}  config.mlWeight    - Weight for ML score (0-1)
   * @param {number}  config.ruleWeight  - Weight for rule score (0-1)
   * @param {object}  config.pool        - PostgreSQL pool for feature flag queries
   * @param {object}  config.redis       - Redis client for flag caching (optional)
   */
  constructor(config = {}) {
    this.enabled = config.enabled || process.env.ML_SCORING_ENABLED === 'true';
    this.serviceUrl = config.serviceUrl || process.env.ML_SCORING_URL || null;
    this.modelVersion = config.modelVersion || process.env.ML_MODEL_VERSION || 'placeholder-v0';
    this.mlWeight = parseFloat(config.mlWeight || process.env.ML_WEIGHT || '0.4');
    this.ruleWeight = parseFloat(config.ruleWeight || process.env.RULE_WEIGHT || '0.6');
    this.pool = config.pool || null;
    this.redis = config.redis || null;

    // Ensure weights sum to 1
    const total = this.mlWeight + this.ruleWeight;
    if (Math.abs(total - 1.0) > 0.01) {
      this.mlWeight = this.mlWeight / total;
      this.ruleWeight = this.ruleWeight / total;
    }

    this._stats = { total: 0, mlCalls: 0, mlErrors: 0, avgLatencyMs: 0 };

    // Circuit breaker for external ML endpoint (3 failures → open for 5 minutes)
    this._mlBreaker = new CircuitBreaker('ml-endpoint', {
      failureThreshold: 3,
      recoveryTimeout: 5 * 60 * 1000,
    });

    // In-memory flag cache for when Redis is unavailable
    this._flagCache = { value: null, expiresAt: 0 };
  }

  // ============================================================================
  // FEATURE FLAG CHECK
  // ============================================================================

  /**
   * Check if ML scoring is enabled via the feature_flags DB table.
   * Cached in Redis for 60 seconds, with in-memory fallback.
   * @returns {Promise<boolean>}
   */
  async checkFlag() {
    // Gate 1: env var must be true
    if (!this.enabled) return false;

    const CACHE_KEY = 'feature_flag:ml_scoring_enabled';
    const CACHE_TTL = 60;

    // Try Redis cache first
    if (this.redis) {
      try {
        const cached = await this.redis.get(CACHE_KEY);
        if (cached !== null) {
          return cached === 'true';
        }
      } catch { /* Redis unavailable — fall through */ }
    }

    // Try in-memory cache
    if (this._flagCache.expiresAt > Date.now()) {
      return this._flagCache.value;
    }

    // Query DB
    if (!this.pool) return false;
    try {
      const result = await this.pool.query(
        "SELECT is_enabled FROM feature_flags WHERE flag_name = 'ml_scoring_enabled'"
      );
      const isEnabled = result.rows[0]?.is_enabled === true;

      // Cache in Redis
      if (this.redis) {
        try {
          await this.redis.set(CACHE_KEY, String(isEnabled), 'EX', CACHE_TTL);
        } catch { /* non-fatal */ }
      }

      // Cache in memory
      this._flagCache = { value: isEnabled, expiresAt: Date.now() + (CACHE_TTL * 1000) };

      return isEnabled;
    } catch (err) {
      logger.warn({ err: err.message }, '[MLScoring] Feature flag query failed — ML scoring disabled');
      return false;
    }
  }

  /**
   * Invalidate the cached feature flag (called after admin toggle).
   */
  async invalidateFlagCache() {
    this._flagCache = { value: null, expiresAt: 0 };
    if (this.redis) {
      try {
        await this.redis.del('feature_flag:ml_scoring_enabled');
      } catch { /* non-fatal */ }
    }
  }

  // ============================================================================
  // PRIMARY INTERFACE
  // ============================================================================

  /**
   * Score a transaction using the ML model.
   * Returns null if ML scoring is disabled (env, flag, or circuit breaker).
   *
   * @param {object} features - Extracted transaction features
   * @param {number} features.rule_score - Rule-based score for fallback
   * @returns {Promise<object|null>} ML score result or null if disabled/skipped
   */
  async scoreTransaction(features) {
    this._stats.total++;

    // Gate 1: env var
    if (!this.enabled) return null;

    // Gate 2: DB feature flag
    const flagEnabled = await this.checkFlag();
    if (!flagEnabled) return null;

    // Gate 3: service URL must be configured
    if (!this.serviceUrl) {
      return {
        mlScore: features.rule_score || 0,
        confidence: 0.0,
        model_version: this.modelVersion,
        latency_ms: 0,
        is_placeholder: true,
      };
    }

    // Gate 4: circuit breaker on ML endpoint
    const startTime = Date.now();
    try {
      const result = await this._mlBreaker.execute(
        async () => {
          this._stats.mlCalls++;
          return this._callMLService(features);
        },
        () => {
          // Circuit open — fall back to rule score
          logger.error({ event: 'ml_circuit_open' }, '[MLScoring] ML endpoint circuit open — using rule-based fallback');
          return null;
        }
      );

      if (result === null) {
        // Circuit breaker returned fallback
        return {
          mlScore: features.rule_score || 0,
          confidence: 0.0,
          model_version: this.modelVersion,
          latency_ms: Date.now() - startTime,
          is_placeholder: true,
          circuit_open: true,
        };
      }

      const latency = Date.now() - startTime;
      this._stats.avgLatencyMs = (this._stats.avgLatencyMs * (this._stats.mlCalls - 1) + latency) / this._stats.mlCalls;

      return {
        mlScore: Math.min(100, Math.max(0, Math.round(result.score))),
        confidence: Math.min(1, Math.max(0, result.confidence || 0.5)),
        model_version: result.model_version || this.modelVersion,
        latency_ms: latency,
        is_placeholder: false,
      };
    } catch (err) {
      this._stats.mlErrors++;
      logger.warn({ err: err.message }, '[MLScoring] ML service call failed — using rule-based fallback');

      return {
        mlScore: features.rule_score || 0,
        confidence: 0.0,
        model_version: this.modelVersion,
        latency_ms: Date.now() - startTime,
        is_placeholder: true,
        error: err.message,
      };
    }
  }

  // ============================================================================
  // COMBINED SCORING
  // ============================================================================

  /**
   * Combine rule-based score and ML score into a final composite score.
   */
  combineScores(ruleScore, mlScore, mlConfidence = 0) {
    if (mlConfidence <= 0) {
      return {
        combinedScore: ruleScore,
        ruleContribution: ruleScore,
        mlContribution: 0,
        weights: { rule: 1.0, ml: 0.0 },
      };
    }

    const effectiveMlWeight = this.mlWeight * mlConfidence;
    const effectiveRuleWeight = 1 - effectiveMlWeight;

    const combined = Math.round(
      (ruleScore * effectiveRuleWeight) + (mlScore * effectiveMlWeight)
    );

    return {
      combinedScore: Math.min(100, Math.max(0, combined)),
      ruleContribution: Math.round(ruleScore * effectiveRuleWeight),
      mlContribution: Math.round(mlScore * effectiveMlWeight),
      weights: { rule: effectiveRuleWeight, ml: effectiveMlWeight },
    };
  }

  // ============================================================================
  // A/B TESTING SUPPORT
  // ============================================================================

  /**
   * Build A/B test signals to store alongside the fraud score.
   */
  buildABSignals(ruleScore, mlResult) {
    const combined = this.combineScores(ruleScore, mlResult.mlScore, mlResult.confidence);

    return {
      ml_score: mlResult.mlScore,
      ml_confidence: mlResult.confidence,
      ml_model_version: mlResult.model_version,
      ml_is_placeholder: mlResult.is_placeholder || false,
      ml_latency_ms: mlResult.latency_ms,
      combined_score: combined.combinedScore,
      rule_contribution: combined.ruleContribution,
      ml_contribution: combined.mlContribution,
      weights: combined.weights,
    };
  }

  // ============================================================================
  // SERVICE HEALTH & STATS
  // ============================================================================

  getStatus() {
    return {
      enabled: this.enabled,
      serviceUrl: this.serviceUrl,
      modelVersion: this.modelVersion,
      weights: { rule: this.ruleWeight, ml: this.mlWeight },
      stats: { ...this._stats },
      circuitState: this._mlBreaker.state,
      healthy: this.enabled ? (this._stats.mlErrors / Math.max(1, this._stats.mlCalls)) < 0.5 : true,
    };
  }

  // ============================================================================
  // INTERNAL — ML SERVICE CALL
  // ============================================================================

  /** @private */
  async _callMLService(features) {
    // Future implementation:
    // const response = await fetch(this.serviceUrl + '/predict', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ features }),
    //   signal: AbortSignal.timeout(2000),
    // });
    // return response.json();

    throw new Error('ML service not yet deployed');
  }
}

module.exports = MLScoringService;
