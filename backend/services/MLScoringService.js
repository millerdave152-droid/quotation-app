/**
 * TeleTime POS - ML Scoring Service
 *
 * Pluggable interface for machine learning-based fraud scoring.
 * Currently returns the rule-based score as a placeholder.
 * In the future, this will call a Python FastAPI microservice.
 *
 * Interface:
 *   scoreTransaction(features) → { mlScore, confidence, model_version }
 *
 * Configuration:
 *   ML_SCORING_ENABLED    - 'true' to enable ML scoring (default: false)
 *   ML_SCORING_URL        - URL of the Python FastAPI microservice
 *   ML_MODEL_VERSION      - Current model version string
 *   ML_WEIGHT             - Weight for ML score in combined scoring (0-1, default: 0.4)
 *   RULE_WEIGHT           - Weight for rule-based score (0-1, default: 0.6)
 */

const logger = require('../utils/logger');

class MLScoringService {
  /**
   * @param {object} config
   * @param {boolean} config.enabled     - Whether ML scoring is active
   * @param {string}  config.serviceUrl  - URL of the ML microservice
   * @param {string}  config.modelVersion - Model version identifier
   * @param {number}  config.mlWeight    - Weight for ML score (0-1)
   * @param {number}  config.ruleWeight  - Weight for rule score (0-1)
   */
  constructor(config = {}) {
    this.enabled = config.enabled || process.env.ML_SCORING_ENABLED === 'true';
    this.serviceUrl = config.serviceUrl || process.env.ML_SCORING_URL || null;
    this.modelVersion = config.modelVersion || process.env.ML_MODEL_VERSION || 'placeholder-v0';
    this.mlWeight = parseFloat(config.mlWeight || process.env.ML_WEIGHT || '0.4');
    this.ruleWeight = parseFloat(config.ruleWeight || process.env.RULE_WEIGHT || '0.6');

    // Ensure weights sum to 1
    const total = this.mlWeight + this.ruleWeight;
    if (Math.abs(total - 1.0) > 0.01) {
      this.mlWeight = this.mlWeight / total;
      this.ruleWeight = this.ruleWeight / total;
    }

    this._stats = { total: 0, mlCalls: 0, mlErrors: 0, avgLatencyMs: 0 };
  }

  // ============================================================================
  // PRIMARY INTERFACE
  // ============================================================================

  /**
   * Score a transaction using the ML model.
   * Currently a placeholder that mirrors the rule-based score.
   * When a real ML model is deployed, this will call the FastAPI service.
   *
   * @param {object} features - Extracted transaction features
   * @param {number} features.amount
   * @param {number} features.hour_of_day
   * @param {string} features.entry_method
   * @param {string} features.card_bin
   * @param {number} features.velocity_card_count
   * @param {number} features.employee_risk_score
   * @param {number} [features.rule_score] - Rule-based score for fallback
   * @returns {Promise<{mlScore: number, confidence: number, model_version: string, latency_ms: number}>}
   */
  async scoreTransaction(features) {
    this._stats.total++;

    if (!this.enabled || !this.serviceUrl) {
      // Placeholder: return rule-based score as ML score with low confidence
      return {
        mlScore: features.rule_score || 0,
        confidence: 0.0, // 0 confidence = placeholder
        model_version: this.modelVersion,
        latency_ms: 0,
        is_placeholder: true,
      };
    }

    // When ML service is deployed, call it here
    const startTime = Date.now();
    try {
      this._stats.mlCalls++;
      const result = await this._callMLService(features);
      const latency = Date.now() - startTime;

      // Update rolling average latency
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
   * Weights are configurable via constructor config.
   *
   * @param {number} ruleScore - Rule-based score (0-100)
   * @param {number} mlScore   - ML model score (0-100)
   * @param {number} mlConfidence - ML model confidence (0-1)
   * @returns {{combinedScore: number, ruleContribution: number, mlContribution: number}}
   */
  combineScores(ruleScore, mlScore, mlConfidence = 0) {
    // If ML confidence is 0 (placeholder), use rule score only
    if (mlConfidence <= 0) {
      return {
        combinedScore: ruleScore,
        ruleContribution: ruleScore,
        mlContribution: 0,
        weights: { rule: 1.0, ml: 0.0 },
      };
    }

    // Scale ML weight by confidence — low-confidence ML has less influence
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
   * Both rule-based and ML scores are computed and returned for comparison.
   *
   * @param {number} ruleScore - Rule-based score
   * @param {object} mlResult  - Result from scoreTransaction()
   * @returns {object} A/B test signals for fraud_scores.signals
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

  /**
   * Get ML scoring service status and statistics.
   * @returns {object}
   */
  getStatus() {
    return {
      enabled: this.enabled,
      serviceUrl: this.serviceUrl,
      modelVersion: this.modelVersion,
      weights: { rule: this.ruleWeight, ml: this.mlWeight },
      stats: { ...this._stats },
      healthy: this.enabled ? (this._stats.mlErrors / Math.max(1, this._stats.mlCalls)) < 0.5 : true,
    };
  }

  // ============================================================================
  // INTERNAL — ML SERVICE CALL
  // ============================================================================

  /**
   * Call the external ML scoring microservice.
   * Placeholder for future FastAPI integration.
   * @private
   */
  async _callMLService(features) {
    // Future implementation:
    // const response = await fetch(this.serviceUrl + '/predict', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ features }),
    //   signal: AbortSignal.timeout(2000), // 2s timeout
    // });
    // return response.json();

    throw new Error('ML service not yet deployed');
  }
}

module.exports = MLScoringService;
