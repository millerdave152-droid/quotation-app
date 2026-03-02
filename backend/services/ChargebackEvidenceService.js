/**
 * TeleTime POS - Chargeback Evidence Service
 *
 * Automated evidence collection for chargeback defense.
 * - buildEvidencePackage(): Collects all available evidence for a chargeback case
 * - buildCE3Evidence(): Visa Compelling Evidence 3.0 for reason code 10.4
 *
 * Evidence is stored in chargeback_cases.evidence_json (JSONB) and individual
 * records in chargeback_evidence table.
 */

const logger = require('../utils/logger');

class ChargebackEvidenceService {
  /**
   * @param {Pool} pool - PostgreSQL connection pool
   * @param {object|null} wsService - WebSocket service for real-time notifications
   */
  constructor(pool, wsService = null) {
    this.pool = pool;
    this.wsService = wsService;
  }

  // ============================================================================
  // PRIMARY API — buildEvidencePackage
  // ============================================================================

  /**
   * Collect all available evidence for a chargeback case and store it.
   * Called automatically on chargeback creation and can be re-run manually.
   *
   * Evidence types collected:
   *  - transaction_snapshot: full transaction details
   *  - authorization: auth code, processor reference
   *  - avs_cvv: address/CVV verification results
   *  - emv_log: chip read confirmation
   *  - delivery: fulfillment/delivery proof
   *  - customer_history: prior transactions from same customer
   *  - prior_undisputed: prior undisputed same-card transactions
   *
   * @param {number} chargebackId
   * @returns {Promise<object>} Assembled evidence package
   */
  async buildEvidencePackage(chargebackId) {
    // 1) Load the chargeback case
    const { rows: cbRows } = await this.pool.query(`
      SELECT cc.*, p.card_last_four, p.card_brand, p.authorization_code,
             p.payment_method, p.amount AS payment_amount, p.processor_reference
      FROM chargeback_cases cc
      LEFT JOIN payments p ON cc.payment_id = p.payment_id
      WHERE cc.id = $1
    `, [chargebackId]);

    if (cbRows.length === 0) {
      throw new Error(`Chargeback case ${chargebackId} not found`);
    }

    const cb = cbRows[0];
    const evidence = {};
    const evidenceRecords = [];

    // 2) Transaction snapshot
    const txnEvidence = await this._collectTransactionEvidence(cb);
    if (txnEvidence) {
      evidence.transaction_snapshot = txnEvidence;
      evidenceRecords.push({
        type: 'transaction_snapshot',
        description: `Transaction #${txnEvidence.transaction_number} — $${txnEvidence.total_amount} on ${txnEvidence.date}. Auth: ${txnEvidence.authorization_code || 'N/A'}, Card: ****${txnEvidence.card_last_four || 'N/A'}`,
        data: txnEvidence,
      });
    }

    // 3) Authorization evidence
    if (cb.authorization_code) {
      const authEvidence = {
        authorization_code: cb.authorization_code,
        processor_reference: cb.processor_reference || null,
        payment_method: cb.payment_method,
        card_brand: cb.card_brand,
        card_last_four: cb.card_last_four,
        payment_amount: cb.payment_amount,
      };
      evidence.authorization = authEvidence;
      evidenceRecords.push({
        type: 'authorization',
        description: `Authorization code: ${cb.authorization_code}, Processor ref: ${cb.processor_reference || 'N/A'}, Method: ${cb.payment_method}`,
        data: authEvidence,
      });
    }

    // 4) AVS/CVV from fraud_scores
    const fraudEvidence = await this._collectFraudScoreEvidence(cb.transaction_id);
    if (fraudEvidence) {
      if (fraudEvidence.avs_result || fraudEvidence.cvv_result) {
        evidence.avs_cvv = {
          avs_result: fraudEvidence.avs_result,
          cvv_result: fraudEvidence.cvv_result,
          entry_method: fraudEvidence.entry_method,
          fraud_score: fraudEvidence.score,
        };
        evidenceRecords.push({
          type: 'avs_cvv',
          description: `AVS: ${fraudEvidence.avs_result || 'N/A'}, CVV: ${fraudEvidence.cvv_result || 'N/A'}, Entry: ${fraudEvidence.entry_method || 'N/A'}, Score: ${fraudEvidence.score}/100`,
          data: evidence.avs_cvv,
        });
      }

      // 5) EMV chip read
      if (fraudEvidence.entry_method === 'chip') {
        evidence.emv_log = {
          entry_method: 'chip',
          card_bin: fraudEvidence.card_bin,
          verified: true,
        };
        evidenceRecords.push({
          type: 'emv_log',
          description: `EMV chip read confirmed. BIN: ${fraudEvidence.card_bin || 'N/A'}. Chip-authenticated transaction.`,
          data: evidence.emv_log,
        });
      }
    }

    // 6) Delivery / fulfillment proof
    const deliveryEvidence = await this._collectDeliveryEvidence(cb.transaction_id);
    if (deliveryEvidence) {
      evidence.delivery = deliveryEvidence;
      evidenceRecords.push({
        type: 'other',
        description: `Delivery: ${deliveryEvidence.fulfillment_type}, Status: ${deliveryEvidence.status}. Address: ${deliveryEvidence.delivery_summary || 'N/A'}`,
        data: deliveryEvidence,
      });
    }

    // 7) Customer history — prior transactions from same customer
    const customerHistory = await this._collectCustomerHistory(cb.customer_id, cb.transaction_id);
    if (customerHistory) {
      evidence.customer_history = customerHistory;
      evidenceRecords.push({
        type: 'customer_history',
        description: `${customerHistory.total_transactions} prior transactions totalling $${customerHistory.total_spent}. Oldest: ${customerHistory.first_transaction_date || 'N/A'}`,
        data: customerHistory,
      });
    }

    // 8) Prior undisputed same-card transactions
    const priorUndisputed = await this._collectPriorUndisputed(cb.card_last_four, cb.card_brand, cb.transaction_id);
    if (priorUndisputed && priorUndisputed.transactions.length > 0) {
      evidence.prior_undisputed = priorUndisputed;
      evidenceRecords.push({
        type: 'other',
        description: `${priorUndisputed.transactions.length} prior undisputed transactions with same card (****${cb.card_last_four}), total $${priorUndisputed.total_amount}`,
        data: priorUndisputed,
      });
    }

    // 9) Store assembled evidence in chargeback_cases.evidence_json
    await this.pool.query(`
      UPDATE chargeback_cases
      SET evidence_json = $1, updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(evidence), chargebackId]);

    // 10) Insert individual evidence records (auto-populated)
    for (const item of evidenceRecords) {
      await this.pool.query(`
        INSERT INTO chargeback_evidence (chargeback_id, evidence_type, description, is_auto_populated)
        VALUES ($1, $2, $3, true)
        ON CONFLICT DO NOTHING
      `, [chargebackId, item.type, item.description]);
    }

    logger.info({ chargebackId, evidenceCount: evidenceRecords.length },
      '[ChargebackEvidence] Evidence package built');

    return {
      chargeback_id: chargebackId,
      evidence_count: evidenceRecords.length,
      evidence_types: evidenceRecords.map(e => e.type),
      evidence,
    };
  }

  // ============================================================================
  // VISA CE 3.0 — Compelling Evidence for reason code 10.4
  // ============================================================================

  /**
   * Build Visa Compelling Evidence 3.0 package for fraud disputes (reason 10.4).
   *
   * CE 3.0 requires finding 2+ prior undisputed transactions from the same
   * payment card that share 2+ of these matching attributes with the
   * disputed transaction:
   *   - IP address
   *   - Device fingerprint
   *   - Customer account/login
   *   - Delivery address
   *
   * Data must be retained for at least 540 days to support CE 3.0 evidence.
   *
   * @param {number} chargebackId
   * @returns {Promise<object>} CE 3.0 evidence package or null if insufficient
   */
  async buildCE3Evidence(chargebackId) {
    // 1) Load the disputed transaction's fraud_score for matching attributes
    const { rows: cbRows } = await this.pool.query(`
      SELECT cc.transaction_id, cc.card_brand, cc.reason_code,
             p.card_last_four, p.card_brand AS payment_card_brand
      FROM chargeback_cases cc
      LEFT JOIN payments p ON cc.payment_id = p.payment_id
      WHERE cc.id = $1
    `, [chargebackId]);

    if (cbRows.length === 0) {
      return null;
    }

    const cb = cbRows[0];

    // CE 3.0 applies to Visa reason code 10.4 (fraud — card-not-present)
    if (cb.card_brand !== 'Visa' && cb.payment_card_brand !== 'Visa') {
      return { applicable: false, reason: 'CE 3.0 only applies to Visa disputes' };
    }

    // 2) Get the disputed transaction's attributes from fraud_scores
    const { rows: disputedRows } = await this.pool.query(`
      SELECT fs.ip_address, fs.device_fingerprint, fs.customer_id,
             fs.transaction_id, fs.card_bin, fs.card_last_four,
             fs.created_at
      FROM fraud_scores fs
      WHERE fs.transaction_id = $1
      ORDER BY fs.created_at DESC LIMIT 1
    `, [cb.transaction_id]);

    if (disputedRows.length === 0) {
      return { applicable: false, reason: 'No fraud score data for disputed transaction' };
    }

    const disputed = disputedRows[0];

    // Get delivery address for disputed transaction
    const { rows: deliveryRows } = await this.pool.query(`
      SELECT delivery_address
      FROM order_fulfillment
      WHERE transaction_id = $1 AND delivery_address IS NOT NULL
      LIMIT 1
    `, [cb.transaction_id]);

    const disputedDelivery = deliveryRows[0]?.delivery_address || null;

    // 3) Find prior undisputed same-card transactions (within 540 days)
    const { rows: priorTxns } = await this.pool.query(`
      SELECT fs.transaction_id, fs.ip_address, fs.device_fingerprint,
             fs.customer_id, fs.created_at, fs.amount,
             of2.delivery_address
      FROM fraud_scores fs
      LEFT JOIN order_fulfillment of2 ON of2.transaction_id = fs.transaction_id
      WHERE fs.card_last_four = $1
        AND fs.card_bin = $2
        AND fs.transaction_id != $3
        AND fs.created_at >= NOW() - INTERVAL '540 days'
        AND fs.transaction_id NOT IN (
          SELECT cc2.transaction_id FROM chargeback_cases cc2
          WHERE cc2.transaction_id IS NOT NULL
        )
      ORDER BY fs.created_at DESC
      LIMIT 50
    `, [cb.card_last_four, disputed.card_bin, cb.transaction_id]);

    // 4) Score each prior transaction on matching attributes
    const matchedTransactions = [];

    for (const prior of priorTxns) {
      const matchingAttributes = [];

      // IP address match
      if (disputed.ip_address && prior.ip_address &&
          String(disputed.ip_address) === String(prior.ip_address)) {
        matchingAttributes.push('ip_address');
      }

      // Device fingerprint match
      if (disputed.device_fingerprint && prior.device_fingerprint &&
          disputed.device_fingerprint === prior.device_fingerprint) {
        matchingAttributes.push('device_fingerprint');
      }

      // Customer account match
      if (disputed.customer_id && prior.customer_id &&
          disputed.customer_id === prior.customer_id) {
        matchingAttributes.push('customer_account');
      }

      // Delivery address match
      if (disputedDelivery && prior.delivery_address) {
        if (this._addressesMatch(disputedDelivery, prior.delivery_address)) {
          matchingAttributes.push('delivery_address');
        }
      }

      if (matchingAttributes.length >= 2) {
        matchedTransactions.push({
          transaction_id: prior.transaction_id,
          date: prior.created_at,
          amount: prior.amount,
          matching_attributes: matchingAttributes,
          match_count: matchingAttributes.length,
        });
      }
    }

    // 5) CE 3.0 requires at least 2 qualifying transactions
    const qualifying = matchedTransactions.length >= 2;

    const ce3Package = {
      applicable: true,
      qualifying,
      reason_code: cb.reason_code,
      disputed_transaction: {
        transaction_id: cb.transaction_id,
        ip_address: disputed.ip_address ? String(disputed.ip_address) : null,
        device_fingerprint: disputed.device_fingerprint || null,
        customer_id: disputed.customer_id,
        delivery_address: disputedDelivery,
        date: disputed.created_at,
      },
      qualifying_transactions: matchedTransactions.slice(0, 10),
      total_qualifying: matchedTransactions.length,
      summary: qualifying
        ? `Found ${matchedTransactions.length} prior undisputed transactions sharing 2+ attributes with disputed transaction.`
        : `Only ${matchedTransactions.length} qualifying transaction(s) found. CE 3.0 requires at least 2.`,
    };

    // Store CE 3.0 evidence in evidence_json
    if (qualifying) {
      await this.pool.query(`
        UPDATE chargeback_cases
        SET evidence_json = COALESCE(evidence_json, '{}')::jsonb || $1::jsonb,
            updated_at = NOW()
        WHERE id = $2
      `, [JSON.stringify({ ce3_evidence: ce3Package }), chargebackId]);

      // Insert evidence record
      await this.pool.query(`
        INSERT INTO chargeback_evidence (chargeback_id, evidence_type, description, is_auto_populated)
        VALUES ($1, 'other', $2, true)
      `, [
        chargebackId,
        `Visa CE 3.0: ${matchedTransactions.length} qualifying transactions found with ${matchedTransactions[0]?.matching_attributes.join(', ')} matches`,
      ]);

      logger.info({ chargebackId, qualifying: matchedTransactions.length },
        '[ChargebackEvidence] CE 3.0 evidence built — qualifying');
    } else {
      logger.info({ chargebackId, found: matchedTransactions.length },
        '[ChargebackEvidence] CE 3.0 — insufficient qualifying transactions');
    }

    return ce3Package;
  }

  // ============================================================================
  // EVIDENCE COLLECTION HELPERS
  // ============================================================================

  /** @private */
  async _collectTransactionEvidence(cb) {
    const { rows } = await this.pool.query(`
      SELECT t.transaction_id, t.transaction_number, t.total_amount, t.subtotal,
             t.discount_amount, t.hst_amount, t.status, t.created_at,
             t.user_id AS cashier_id,
             u.first_name || ' ' || u.last_name AS cashier_name,
             c.name AS customer_name,
             c.email AS customer_email, c.phone AS customer_phone
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE t.transaction_id = $1
    `, [cb.transaction_id]);

    if (rows.length === 0) return null;

    const t = rows[0];
    return {
      transaction_id: t.transaction_id,
      transaction_number: t.transaction_number,
      total_amount: parseFloat(t.total_amount),
      subtotal: parseFloat(t.subtotal || 0),
      discount_amount: parseFloat(t.discount_amount || 0),
      hst_amount: parseFloat(t.hst_amount || 0),
      status: t.status,
      date: new Date(t.created_at).toISOString(),
      cashier: t.cashier_name,
      customer: t.customer_name,
      customer_email: t.customer_email,
      customer_phone: t.customer_phone,
      authorization_code: cb.authorization_code,
      card_last_four: cb.card_last_four,
      card_brand: cb.card_brand,
      payment_method: cb.payment_method,
    };
  }

  /** @private */
  async _collectFraudScoreEvidence(transactionId) {
    const { rows } = await this.pool.query(`
      SELECT score, avs_result, cvv_result, entry_method, card_bin, signals
      FROM fraud_scores
      WHERE transaction_id = $1
      ORDER BY created_at DESC LIMIT 1
    `, [transactionId]);

    return rows[0] || null;
  }

  /** @private */
  async _collectDeliveryEvidence(transactionId) {
    const { rows } = await this.pool.query(`
      SELECT fulfillment_type, status, delivery_address, scheduled_date,
             actual_delivery_date, tracking_number, carrier
      FROM order_fulfillment
      WHERE transaction_id = $1
      LIMIT 1
    `, [transactionId]);

    if (rows.length === 0) return null;

    const d = rows[0];
    let deliverySummary = null;
    if (d.delivery_address) {
      const addr = typeof d.delivery_address === 'string'
        ? JSON.parse(d.delivery_address) : d.delivery_address;
      deliverySummary = [addr.street1, addr.city, addr.province, addr.postal_code]
        .filter(Boolean).join(', ');
    }

    return {
      fulfillment_type: d.fulfillment_type,
      status: d.status,
      scheduled_date: d.scheduled_date,
      actual_delivery_date: d.actual_delivery_date,
      tracking_number: d.tracking_number,
      carrier: d.carrier,
      delivery_summary: deliverySummary,
      delivery_address: d.delivery_address,
    };
  }

  /** @private */
  async _collectCustomerHistory(customerId, excludeTransactionId) {
    if (!customerId) return null;

    const { rows } = await this.pool.query(`
      SELECT COUNT(*)::int AS total_transactions,
             COALESCE(SUM(total_amount), 0)::numeric AS total_spent,
             MIN(created_at) AS first_transaction_date,
             MAX(created_at) AS last_transaction_date,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
             COUNT(*) FILTER (WHERE status = 'voided')::int AS voided,
             COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded
      FROM transactions
      WHERE customer_id = $1
        AND transaction_id != $2
    `, [customerId, excludeTransactionId]);

    if (rows.length === 0 || rows[0].total_transactions === 0) return null;

    const h = rows[0];
    return {
      total_transactions: h.total_transactions,
      total_spent: parseFloat(h.total_spent).toFixed(2),
      first_transaction_date: h.first_transaction_date
        ? new Date(h.first_transaction_date).toISOString().slice(0, 10) : null,
      last_transaction_date: h.last_transaction_date
        ? new Date(h.last_transaction_date).toISOString().slice(0, 10) : null,
      completed: h.completed,
      voided: h.voided,
      refunded: h.refunded,
    };
  }

  /** @private */
  async _collectPriorUndisputed(cardLastFour, cardBrand, excludeTransactionId) {
    if (!cardLastFour) return null;

    const { rows } = await this.pool.query(`
      SELECT t.transaction_id, t.transaction_number, t.total_amount,
             t.created_at, t.status,
             p.authorization_code, p.payment_method
      FROM transactions t
      JOIN payments p ON p.transaction_id = t.transaction_id
      WHERE p.card_last_four = $1
        AND t.transaction_id != $2
        AND t.status = 'completed'
        AND t.transaction_id NOT IN (
          SELECT cc.transaction_id FROM chargeback_cases cc
          WHERE cc.transaction_id IS NOT NULL
        )
      ORDER BY t.created_at DESC
      LIMIT 20
    `, [cardLastFour, excludeTransactionId]);

    if (rows.length === 0) return null;

    return {
      transactions: rows.map(r => ({
        transaction_id: r.transaction_id,
        transaction_number: r.transaction_number,
        amount: parseFloat(r.total_amount),
        date: new Date(r.created_at).toISOString().slice(0, 10),
        authorization_code: r.authorization_code,
      })),
      total_amount: rows.reduce((sum, r) => sum + parseFloat(r.total_amount), 0).toFixed(2),
      count: rows.length,
    };
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  /**
   * Compare two delivery addresses for CE 3.0 matching.
   * Normalizes and compares street + postal code.
   * @private
   */
  _addressesMatch(addr1, addr2) {
    const normalize = (addr) => {
      if (!addr) return null;
      const a = typeof addr === 'string' ? JSON.parse(addr) : addr;
      const street = (a.street1 || '').toLowerCase().trim()
        .replace(/\b(st|street|ave|avenue|blvd|boulevard|dr|drive|rd|road|ln|lane|ct|court|pl|place)\b/g, '')
        .replace(/[^a-z0-9]/g, '');
      const postal = (a.postal_code || '').replace(/\s/g, '').toLowerCase();
      return `${street}|${postal}`;
    };

    const n1 = normalize(addr1);
    const n2 = normalize(addr2);
    return n1 && n2 && n1 === n2;
  }
}

module.exports = ChargebackEvidenceService;
