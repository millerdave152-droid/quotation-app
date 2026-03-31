/**
 * TeleTime POS - Fraud ML Data Service
 *
 * Exports labeled training data for machine learning model training.
 * Joins fraud_scores with transactions, chargebacks, and review outcomes
 * to produce feature vectors with fraud/legitimate labels.
 *
 * Labels:
 *   'fraud'      — Transaction has chargeback with status 'lost' OR confirmed fraud in review
 *   'legitimate' — Reviewed and approved OR no chargeback after 120 days
 *   'unlabeled'  — Too recent to determine (< 120 days, no review, no chargeback)
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const EXPORT_DIR = path.join(__dirname, '..', 'exports', 'fraud-training');

// Feature descriptions for metadata
const FEATURE_DESCRIPTIONS = {
  amount: 'Transaction amount in CAD',
  hour_of_day: 'Hour of transaction (0-23)',
  day_of_week: 'Day of week (0=Sunday, 6=Saturday)',
  entry_method_chip: 'One-hot: EMV chip read',
  entry_method_contactless: 'One-hot: contactless/tap',
  entry_method_swipe: 'One-hot: magnetic stripe swipe',
  entry_method_manual: 'One-hot: manual key entry',
  entry_method_ecommerce: 'One-hot: e-commerce',
  entry_method_moto: 'One-hot: mail/telephone order',
  card_bin_first6: 'First 6 digits of card number',
  card_type: 'Card type (credit/debit)',
  card_brand: 'Card brand (Visa/MC/Amex)',
  is_prepaid: 'Boolean: prepaid card',
  is_foreign: 'Boolean: foreign-issued card',
  velocity_card_count: 'Same card uses in last 5 minutes',
  velocity_terminal_count: 'Terminal transactions in last 2 minutes',
  velocity_employee_count: 'Employee transactions in last 30 minutes',
  decline_count: 'Declines on same card in last 10 minutes',
  amount_zscore: 'Standard deviations from category mean amount',
  customer_transaction_count: 'Total prior customer transactions',
  customer_lifetime_value: 'Customer lifetime spend in CAD',
  employee_void_rate: 'Employee void rate (0-1)',
  employee_refund_rate: 'Employee refund rate (0-1)',
  employee_risk_score: 'Employee composite risk score (0-100)',
  avs_match: 'Boolean: AVS address verification passed',
  cvv_match: 'Boolean: CVV verification passed',
  is_first_customer_transaction: 'Boolean: first transaction for this customer',
  time_since_last_card_use_minutes: 'Minutes since same card last used',
  rule_score: 'Rule-based fraud score (0-100)',
  risk_level: 'Rule-based risk level (low/medium/high/critical)',
  action_taken: 'Action taken (approved/flagged/held/declined)',
  label: 'Target label: fraud / legitimate / unlabeled',
};

class FraudMLDataService {
  /**
   * @param {Pool} pool - PostgreSQL connection pool
   * @param {object|null} redis - ioredis client (optional, for feature lookups)
   */
  constructor(pool, redis = null) {
    this.pool = pool;
    this.redis = redis;
    this._ensureExportDir();
  }

  /** @private */
  _ensureExportDir() {
    if (!fs.existsSync(EXPORT_DIR)) {
      fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }
  }

  // ============================================================================
  // TRAINING DATA EXPORT
  // ============================================================================

  /**
   * Export labeled fraud data for ML model training.
   *
   * @param {string|Date} startDate - Range start
   * @param {string|Date} endDate   - Range end
   * @param {string} format         - 'csv' or 'json' (default: 'csv')
   * @returns {Promise<object>} Export metadata
   */
  async exportTrainingData(startDate, endDate, format = 'csv', exportedBy = null) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    logger.info({ startDate, endDate, format }, '[FraudML] Starting training data export');

    // Main query: fraud_scores + transaction + chargeback + review + employee + customer
    const { rows } = await this.pool.query(`
      SELECT
        fs.id AS score_id,
        fs.transaction_id,
        fs.score AS rule_score,
        fs.risk_level,
        fs.action_taken,
        fs.signals,
        fs.card_bin,
        fs.card_last_four,
        fs.card_type,
        fs.card_brand,
        fs.entry_method,
        fs.employee_id,
        fs.location_id,
        fs.customer_id,
        fs.amount,
        fs.avs_result,
        fs.cvv_result,
        fs.ip_address,
        ENCODE(HMAC(COALESCE(fs.device_fingerprint, ''), $3, 'sha256'), 'hex') AS device_fingerprint_hash,
        fs.reviewed_by,
        fs.review_notes,
        fs.created_at,

        -- Transaction details
        t.total_amount AS txn_amount,
        t.discount_amount,
        t.status AS txn_status,
        EXTRACT(HOUR FROM fs.created_at) AS hour_of_day,
        EXTRACT(DOW FROM fs.created_at) AS day_of_week,

        -- Chargeback label
        cb.id AS chargeback_id,
        cb.status AS cb_status,

        -- Employee risk
        erp.void_rate AS emp_void_rate,
        erp.refund_rate AS emp_refund_rate,
        erp.risk_score AS emp_risk_score,

        -- Customer history
        cust_agg.txn_count AS customer_txn_count,
        cust_agg.total_spent AS customer_ltv,
        cust_agg.first_txn_date AS customer_first_txn,

        -- BIN data
        bc.is_prepaid,
        bc.issuer_country,

        -- Time since last card use
        prev_card.prev_card_time,

        -- Velocity snapshots from signals
        fs.signals->'velocity'->'card_use'->>'count' AS vel_card_raw,
        fs.signals->'velocity'->'terminal_velocity'->>'count' AS vel_terminal_raw,
        fs.signals->'velocity'->'employee_velocity'->>'count' AS vel_employee_raw,
        fs.signals->'decline_pattern'->>'declineCount' AS decline_raw,
        (fs.signals->'amount_anomaly'->>'zscore')::numeric AS amount_zscore

      FROM fraud_scores fs
      LEFT JOIN transactions t ON t.transaction_id = fs.transaction_id
      LEFT JOIN chargeback_cases cb ON cb.transaction_id = fs.transaction_id
      LEFT JOIN employee_risk_profiles erp ON erp.user_id = fs.employee_id
      LEFT JOIN bin_cache bc ON bc.bin = SUBSTRING(fs.card_bin FROM 1 FOR 6)

      -- Customer aggregate subquery
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS txn_count,
          COALESCE(SUM(total_amount), 0)::numeric AS total_spent,
          MIN(created_at) AS first_txn_date
        FROM transactions
        WHERE customer_id = fs.customer_id
          AND transaction_id < fs.transaction_id
      ) cust_agg ON fs.customer_id IS NOT NULL

      -- Previous card use time
      LEFT JOIN LATERAL (
        SELECT MAX(created_at) AS prev_card_time
        FROM fraud_scores fs2
        WHERE fs2.card_last_four = fs.card_last_four
          AND fs2.card_bin = fs.card_bin
          AND fs2.id < fs.id
          AND fs2.created_at >= fs.created_at - INTERVAL '24 hours'
      ) prev_card ON true

      WHERE fs.created_at >= $1 AND fs.created_at <= $2

      ORDER BY fs.created_at ASC
    `, [start.toISOString(), end.toISOString(), process.env.FRAUD_SALT || 'default-salt']);

    if (rows.length === 0) {
      return {
        success: false,
        message: 'No fraud score records found in date range',
        date_range: { start: start.toISOString(), end: end.toISOString() },
      };
    }

    // Transform rows into feature vectors
    const now = new Date();
    const labelCutoff = new Date(now);
    labelCutoff.setDate(labelCutoff.getDate() - 120);

    const features = rows.map(row => this._extractFeatures(row, labelCutoff));

    // Compute stats
    const fraudCount = features.filter(f => f.label === 'fraud').length;
    const legitCount = features.filter(f => f.label === 'legitimate').length;
    const unlabeledCount = features.filter(f => f.label === 'unlabeled').length;

    // Write export file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `fraud_training_${timestamp}.${format}`;
    const filePath = path.join(EXPORT_DIR, fileName);

    if (format === 'csv') {
      this._writeCsv(filePath, features);
    } else {
      this._writeJson(filePath, features);
    }

    // Write metadata file
    const metadata = {
      export_id: timestamp,
      file: fileName,
      format,
      date_range: { start: start.toISOString(), end: end.toISOString() },
      exported_at: new Date().toISOString(),
      total_records: features.length,
      label_distribution: {
        fraud: fraudCount,
        legitimate: legitCount,
        unlabeled: unlabeledCount,
      },
      fraud_rate: features.length > 0
        ? Math.round((fraudCount / (fraudCount + legitCount || 1)) * 10000) / 100
        : 0,
      feature_count: Object.keys(FEATURE_DESCRIPTIONS).length,
      feature_descriptions: FEATURE_DESCRIPTIONS,
    };

    const metaPath = path.join(EXPORT_DIR, `fraud_training_${timestamp}_meta.json`);
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

    logger.info({
      file: fileName,
      records: features.length,
      fraud: fraudCount,
      legitimate: legitCount,
      unlabeled: unlabeledCount,
    }, '[FraudML] Training data export complete');

    // PIPEDA compliance: audit log for data exports containing PII
    try {
      await this.pool.query(
        `INSERT INTO data_export_audit
           (exported_by, export_type, record_count, exported_at, contains_pii, anonymization_method)
         VALUES ($1, 'fraud_ml_training', $2, NOW(), true, 'device_fingerprint_hmac_sha256')`,
        [exportedBy, features.length]
      );
    } catch (auditErr) {
      logger.error({ err: auditErr.message }, '[FraudML] Data export audit log failed (non-fatal)');
    }

    return metadata;
  }

  // ============================================================================
  // FEATURE EXTRACTION
  // ============================================================================

  /** @private */
  _extractFeatures(row, labelCutoff) {
    const signals = typeof row.signals === 'string'
      ? JSON.parse(row.signals) : (row.signals || {});

    // Determine label
    let label = 'unlabeled';
    if (row.cb_status === 'lost' || row.txn_status === 'voided') {
      label = 'fraud';
    } else if (row.review_notes?.toLowerCase().includes('fraud') ||
               row.review_notes?.toLowerCase().includes('confirmed fraud')) {
      label = 'fraud';
    } else if (row.reviewed_by && !row.chargeback_id) {
      label = 'legitimate';
    } else if (!row.chargeback_id && new Date(row.created_at) < labelCutoff) {
      label = 'legitimate';
    } else if (row.cb_status === 'won') {
      label = 'legitimate';
    }

    // Entry method one-hot encoding
    const em = (row.entry_method || '').toLowerCase();
    const entryMethodOneHot = {
      entry_method_chip: em === 'chip' ? 1 : 0,
      entry_method_contactless: (em === 'contactless' || em === 'tap') ? 1 : 0,
      entry_method_swipe: (em === 'swipe' || em === 'fallback_swipe') ? 1 : 0,
      entry_method_manual: (em === 'manual' || em === 'keyed') ? 1 : 0,
      entry_method_ecommerce: em === 'ecommerce' ? 1 : 0,
      entry_method_moto: em === 'moto' ? 1 : 0,
    };

    // AVS/CVV match booleans
    const avsMatch = row.avs_result ? ['Y', 'M', 'D', 'F', 'X'].includes(row.avs_result.toUpperCase()) : false;
    const cvvMatch = row.cvv_result ? ['M', 'Y', '1'].includes(row.cvv_result.toUpperCase()) : false;

    // Time since last card use
    let timeSinceLastCard = null;
    if (row.prev_card_time) {
      timeSinceLastCard = Math.round(
        (new Date(row.created_at) - new Date(row.prev_card_time)) / 60000
      );
    }

    // Is foreign card
    const isForeign = row.issuer_country
      ? !['CA', 'CAN', 'Canada'].includes(row.issuer_country)
      : false;

    return {
      // Core
      amount: parseFloat(row.amount || 0),
      hour_of_day: parseInt(row.hour_of_day || 0),
      day_of_week: parseInt(row.day_of_week || 0),

      // Entry method one-hot
      ...entryMethodOneHot,

      // Card features
      card_bin_first6: row.card_bin ? row.card_bin.substring(0, 6) : null,
      card_type: row.card_type || null,
      card_brand: row.card_brand || null,
      is_prepaid: row.is_prepaid ? 1 : 0,
      is_foreign: isForeign ? 1 : 0,

      // Velocity features (from signals JSONB)
      velocity_card_count: parseInt(row.vel_card_raw || 0),
      velocity_terminal_count: parseInt(row.vel_terminal_raw || 0),
      velocity_employee_count: parseInt(row.vel_employee_raw || 0),
      decline_count: parseInt(row.decline_raw || 0),

      // Amount anomaly
      amount_zscore: parseFloat(row.amount_zscore || 0),

      // Customer features
      customer_transaction_count: row.customer_txn_count || 0,
      customer_lifetime_value: parseFloat(row.customer_ltv || 0),
      is_first_customer_transaction: (row.customer_txn_count || 0) === 0 ? 1 : 0,

      // Employee features
      employee_void_rate: parseFloat(row.emp_void_rate || 0),
      employee_refund_rate: parseFloat(row.emp_refund_rate || 0),
      employee_risk_score: parseInt(row.emp_risk_score || 0),

      // Verification
      avs_match: avsMatch ? 1 : 0,
      cvv_match: cvvMatch ? 1 : 0,

      // Temporal
      time_since_last_card_use_minutes: timeSinceLastCard,

      // Rule-based score (for comparison)
      rule_score: row.rule_score,
      risk_level: row.risk_level,
      action_taken: row.action_taken,

      // Label
      label,
    };
  }

  // ============================================================================
  // FILE WRITERS
  // ============================================================================

  /** @private */
  _writeCsv(filePath, features) {
    if (features.length === 0) return;
    const headers = Object.keys(features[0]);
    const lines = [headers.join(',')];
    for (const row of features) {
      const values = headers.map(h => {
        const v = row[h];
        if (v === null || v === undefined) return '';
        if (typeof v === 'string' && (v.includes(',') || v.includes('"'))) {
          return `"${v.replace(/"/g, '""')}"`;
        }
        return String(v);
      });
      lines.push(values.join(','));
    }
    fs.writeFileSync(filePath, lines.join('\n'));
  }

  /** @private */
  _writeJson(filePath, features) {
    fs.writeFileSync(filePath, JSON.stringify({ records: features }, null, 2));
  }

  // ============================================================================
  // LIST EXPORTS
  // ============================================================================

  /**
   * List all available training data exports with metadata.
   * @returns {Array<object>}
   */
  listExports() {
    this._ensureExportDir();
    const files = fs.readdirSync(EXPORT_DIR)
      .filter(f => f.endsWith('_meta.json'))
      .sort()
      .reverse();

    return files.map(f => {
      try {
        const content = fs.readFileSync(path.join(EXPORT_DIR, f), 'utf8');
        return JSON.parse(content);
      } catch (_) {
        return { file: f, error: 'Could not read metadata' };
      }
    });
  }
}

module.exports = FraudMLDataService;
