/**
 * TeleTime POS - Fraud Detection Service
 * Core scoring engine for fraud detection with configurable rules,
 * real-time risk assessment, alert generation, and audit logging.
 */

class FraudDetectionService {
  /**
   * @param {Pool} pool - PostgreSQL connection pool
   */
  constructor(pool) {
    this.pool = pool;
    this._rulesCache = null;
    this._rulesCacheTime = 0;
    this.RULES_CACHE_TTL = 300000; // 5 minutes
  }

  // ============================================================================
  // PUBLIC API — Risk Assessment
  // ============================================================================

  /**
   * Assess a transaction for fraud risk
   * @param {object} txnData - Transaction data (total_amount, discount_amount, items, etc.)
   * @param {number} userId - Employee processing the transaction
   * @param {number} shiftId - Current register shift
   * @param {number|null} customerId - Customer if known
   * @returns {Promise<object>} { riskScore, triggeredRules[], action, alertId? }
   */
  async assessTransaction(txnData, userId, shiftId, customerId = null) {
    const triggeredRules = [];
    const rules = await this._loadRules();

    // Amount checks
    const amountRule = rules.find(r => r.rule_code === 'amount_high_txn' && r.is_active);
    if (amountRule) {
      const result = this._checkAmountThreshold(
        parseFloat(txnData.total_amount || txnData.totalAmount || 0),
        amountRule.conditions.threshold,
        amountRule
      );
      if (result.triggered) triggeredRules.push(result);
    }

    // Discount checks
    const discountRule = rules.find(r => r.rule_code === 'amount_high_discount' && r.is_active);
    if (discountRule && txnData.discount_amount > 0) {
      const subtotal = parseFloat(txnData.subtotal || txnData.total_amount || 0);
      const discountPct = subtotal > 0 ? (parseFloat(txnData.discount_amount) / subtotal) * 100 : 0;
      if (discountPct > (discountRule.conditions.threshold_percent || 30)) {
        triggeredRules.push({
          triggered: true,
          rule: discountRule,
          details: { discount_percent: discountPct.toFixed(1), threshold: discountRule.conditions.threshold_percent }
        });
      }
    }

    // Customer chargeback history
    if (customerId) {
      const cbRule = rules.find(r => r.rule_code === 'chargeback_history' && r.is_active);
      if (cbRule) {
        const cbResult = await this._checkCustomerChargebackHistory(customerId, cbRule);
        if (cbResult.triggered) triggeredRules.push(cbResult);
      }
    }

    const riskScore = this._calculateRiskScore(triggeredRules);
    const action = this._determineAction(riskScore, triggeredRules);

    let alertId = null;
    if (triggeredRules.length > 0) {
      const alert = await this.createAlert({
        riskScore,
        triggeredRules,
        action,
        alertType: 'transaction',
        severity: this._getHighestSeverity(triggeredRules)
      }, {
        userId,
        shiftId,
        customerId,
        transactionId: txnData.transaction_id || null,
        entityType: 'transaction'
      });
      alertId = alert?.id;
    }

    return { riskScore, triggeredRules, action, alertId };
  }

  /**
   * Assess a refund for fraud risk
   * @param {object} returnData - Return data
   * @param {number} userId - Employee processing the refund
   * @param {number} shiftId - Current register shift
   * @returns {Promise<object>} { riskScore, triggeredRules[], action, alertId? }
   */
  async assessRefund(returnData, userId, shiftId) {
    const triggeredRules = [];
    const rules = await this._loadRules();

    // High refund amount
    const amountRule = rules.find(r => r.rule_code === 'amount_high_refund' && r.is_active);
    if (amountRule) {
      const refundAmount = parseFloat(returnData.total_refund_amount || returnData.refundAmount || 0);
      const result = this._checkAmountThreshold(refundAmount, amountRule.conditions.threshold, amountRule);
      if (result.triggered) triggeredRules.push(result);
    }

    // Velocity: too many refunds in shift
    const velocityRule = rules.find(r => r.rule_code === 'velocity_refund' && r.is_active);
    if (velocityRule) {
      const result = await this._checkVelocity(userId, shiftId, 'refund', velocityRule);
      if (result.triggered) triggeredRules.push(result);
    }

    // Self-refund: employee refunding their own sale
    const selfRefundRule = rules.find(r => r.rule_code === 'pattern_self_refund' && r.is_active);
    if (selfRefundRule && returnData.original_transaction_id) {
      const result = await this._checkSelfRefund(userId, returnData.original_transaction_id, selfRefundRule);
      if (result.triggered) triggeredRules.push(result);
    }

    // Customer repeat returns
    const customerId = returnData.customer_id || null;
    if (customerId) {
      const repeatRule = rules.find(r => r.rule_code === 'pattern_repeat_return' && r.is_active);
      if (repeatRule) {
        const result = await this._checkRepeatReturns(customerId, repeatRule);
        if (result.triggered) triggeredRules.push(result);
      }
    }

    // No receipt return
    const noReceiptRule = rules.find(r => r.rule_code === 'pattern_no_receipt' && r.is_active);
    if (noReceiptRule && returnData.no_receipt) {
      triggeredRules.push({
        triggered: true,
        rule: noReceiptRule,
        details: { pattern: 'no_receipt_return' }
      });
    }

    const riskScore = this._calculateRiskScore(triggeredRules);
    const action = this._determineAction(riskScore, triggeredRules);

    let alertId = null;
    if (triggeredRules.length > 0) {
      const alert = await this.createAlert({
        riskScore,
        triggeredRules,
        action,
        alertType: 'refund',
        severity: this._getHighestSeverity(triggeredRules)
      }, {
        userId,
        shiftId,
        customerId,
        returnId: returnData.return_id || returnData.id || null,
        entityType: 'return'
      });
      alertId = alert?.id;
    }

    return { riskScore, triggeredRules, action, alertId };
  }

  /**
   * Assess a void for fraud risk
   * @param {number} txnId - Transaction being voided
   * @param {number} userId - Employee voiding the transaction
   * @param {number} shiftId - Current register shift
   * @returns {Promise<object>} { riskScore, triggeredRules[], action, alertId? }
   */
  async assessVoid(txnId, userId, shiftId) {
    const triggeredRules = [];
    const rules = await this._loadRules();

    // Void velocity
    const velocityRule = rules.find(r => r.rule_code === 'velocity_void' && r.is_active);
    if (velocityRule) {
      const result = await this._checkVelocity(userId, shiftId, 'void', velocityRule);
      if (result.triggered) triggeredRules.push(result);
    }

    // Void completed transaction pattern
    const voidCompleteRule = rules.find(r => r.rule_code === 'pattern_void_complete' && r.is_active);
    if (voidCompleteRule) {
      const result = await this._checkVoidCompleted(txnId, voidCompleteRule);
      if (result.triggered) triggeredRules.push(result);
    }

    const riskScore = this._calculateRiskScore(triggeredRules);
    const action = this._determineAction(riskScore, triggeredRules);

    let alertId = null;
    if (triggeredRules.length > 0) {
      const alert = await this.createAlert({
        riskScore,
        triggeredRules,
        action,
        alertType: 'void',
        severity: this._getHighestSeverity(triggeredRules)
      }, {
        userId,
        shiftId,
        transactionId: txnId,
        entityType: 'transaction'
      });
      alertId = alert?.id;
    }

    return { riskScore, triggeredRules, action, alertId };
  }

  /**
   * Assess a discount application for fraud risk
   * Checks 3 discount-specific patterns: tier maxing, discount+void, discount+refund ratio
   * @param {object} discountData - { employee_id, product_id, discount_pct, discount_amount, original_price }
   * @param {number} userId - Employee applying the discount
   * @returns {Promise<object>} { riskScore, triggeredRules[], action, alertId? }
   */
  async assessDiscount(discountData, userId) {
    const triggeredRules = [];
    const rules = await this._loadRules();

    // Rule 1: Discount tier maxing pattern
    const maxPatternRule = rules.find(r => r.rule_code === 'discount_max_pattern' && r.is_active);
    if (maxPatternRule) {
      const result = await this._checkDiscountMaxPattern(userId, discountData.discount_pct, maxPatternRule);
      if (result.triggered) triggeredRules.push(result);
    }

    // Rule 2: Discount + void pattern (check historical)
    const voidPatternRule = rules.find(r => r.rule_code === 'discount_void_pattern' && r.is_active);
    if (voidPatternRule) {
      const result = await this._checkDiscountVoidPattern(userId, voidPatternRule);
      if (result.triggered) triggeredRules.push(result);
    }

    // Rule 3: Discount to refund ratio
    const refundRatioRule = rules.find(r => r.rule_code === 'discount_refund_ratio' && r.is_active);
    if (refundRatioRule) {
      const result = await this._checkDiscountRefundRatio(userId, refundRatioRule);
      if (result.triggered) triggeredRules.push(result);
    }

    // Also check the existing high-discount rule
    const highDiscountRule = rules.find(r => r.rule_code === 'amount_high_discount' && r.is_active);
    if (highDiscountRule && discountData.discount_pct > (highDiscountRule.conditions.threshold_percent || 30)) {
      triggeredRules.push({
        triggered: true,
        rule: highDiscountRule,
        details: { discount_percent: discountData.discount_pct, threshold: highDiscountRule.conditions.threshold_percent }
      });
    }

    const riskScore = this._calculateRiskScore(triggeredRules);
    const action = this._determineAction(riskScore, triggeredRules);

    let alertId = null;
    if (triggeredRules.length > 0) {
      const alert = await this.createAlert({
        riskScore,
        triggeredRules,
        action,
        alertType: 'discount',
        severity: this._getHighestSeverity(triggeredRules)
      }, {
        userId,
        entityType: 'discount_transaction',
        customerId: null
      });
      alertId = alert?.id;
    }

    return { riskScore, triggeredRules, action, alertId };
  }

  // ============================================================================
  // PUBLIC API — Alerts
  // ============================================================================

  /**
   * Create a fraud alert record
   * @param {object} assessment - { riskScore, triggeredRules, action, alertType, severity }
   * @param {object} context - { userId, shiftId, transactionId?, returnId?, customerId? }
   * @returns {Promise<object>} Created alert record
   */
  async createAlert(assessment, context) {
    // Use the first triggered rule for the primary rule_id
    const primaryRule = assessment.triggeredRules[0]?.rule;
    if (!primaryRule) return null;

    const { rows } = await this.pool.query(
      `INSERT INTO fraud_alerts
        (transaction_id, return_id, user_id, customer_id, rule_id, risk_score, alert_type, severity, details, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')
       RETURNING *`,
      [
        context.transactionId || null,
        context.returnId || null,
        context.userId,
        context.customerId || null,
        primaryRule.id,
        assessment.riskScore,
        assessment.alertType,
        assessment.severity,
        JSON.stringify({
          triggered_rules: assessment.triggeredRules.map(tr => ({
            rule_code: tr.rule.rule_code,
            rule_name: tr.rule.rule_name,
            risk_points: tr.rule.risk_points,
            details: tr.details || {}
          })),
          action: assessment.action
        })
      ]
    );

    const alert = rows[0];

    // Auto-add to review queue if score >= 30
    if (assessment.riskScore >= 30) {
      await this.pool.query(
        `INSERT INTO fraud_review_queue (alert_id, priority, status)
         VALUES ($1, $2, 'pending')
         ON CONFLICT (alert_id) DO NOTHING`,
        [alert.id, assessment.riskScore]
      );
    }

    return alert;
  }

  /**
   * Get fraud alerts with filters and pagination
   */
  async getAlerts(filters = {}, pagination = { page: 1, limit: 25 }) {
    const conditions = ['1=1'];
    const params = [];
    let paramIdx = 1;

    if (filters.status) {
      conditions.push(`fa.status = $${paramIdx++}`);
      params.push(filters.status);
    }
    if (filters.severity) {
      conditions.push(`fa.severity = $${paramIdx++}`);
      params.push(filters.severity);
    }
    if (filters.alert_type) {
      conditions.push(`fa.alert_type = $${paramIdx++}`);
      params.push(filters.alert_type);
    }
    if (filters.user_id) {
      conditions.push(`fa.user_id = $${paramIdx++}`);
      params.push(filters.user_id);
    }
    if (filters.date_from) {
      conditions.push(`fa.created_at >= $${paramIdx++}`);
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      conditions.push(`fa.created_at <= $${paramIdx++}`);
      params.push(filters.date_to);
    }

    const offset = (pagination.page - 1) * pagination.limit;

    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM fraud_alerts fa WHERE ${conditions.join(' AND ')}`,
      params
    );

    const { rows } = await this.pool.query(
      `SELECT fa.*,
              fr.rule_code, fr.rule_name,
              u.first_name || ' ' || u.last_name AS employee_name,
              reviewer.first_name || ' ' || reviewer.last_name AS reviewer_name
       FROM fraud_alerts fa
       JOIN fraud_rules fr ON fr.id = fa.rule_id
       JOIN users u ON u.id = fa.user_id
       LEFT JOIN users reviewer ON reviewer.id = fa.reviewed_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY fa.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, pagination.limit, offset]
    );

    return {
      alerts: rows,
      total: parseInt(countResult.rows[0].count),
      page: pagination.page,
      limit: pagination.limit
    };
  }

  /**
   * Get a single alert by ID with full details
   */
  async getAlertById(alertId) {
    const { rows } = await this.pool.query(
      `SELECT fa.*,
              fr.rule_code, fr.rule_name, fr.description AS rule_description,
              u.first_name || ' ' || u.last_name AS employee_name, u.email AS employee_email,
              reviewer.first_name || ' ' || reviewer.last_name AS reviewer_name,
              t.transaction_number, t.total_amount AS transaction_amount,
              r.return_number, r.total_refund_amount
       FROM fraud_alerts fa
       JOIN fraud_rules fr ON fr.id = fa.rule_id
       JOIN users u ON u.id = fa.user_id
       LEFT JOIN users reviewer ON reviewer.id = fa.reviewed_by
       LEFT JOIN transactions t ON t.transaction_id = fa.transaction_id
       LEFT JOIN pos_returns r ON r.id = fa.return_id
       WHERE fa.id = $1`,
      [alertId]
    );
    return rows[0] || null;
  }

  /**
   * Review / resolve a fraud alert
   */
  async reviewAlert(alertId, reviewerId, resolution, notes = '') {
    const statusMap = {
      confirmed_fraud: 'confirmed_fraud',
      false_positive: 'false_positive',
      dismissed: 'dismissed'
    };

    const newStatus = statusMap[resolution];
    if (!newStatus) {
      throw new Error(`Invalid resolution: ${resolution}`);
    }

    const { rows } = await this.pool.query(
      `UPDATE fraud_alerts
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3
       WHERE id = $4
       RETURNING *`,
      [newStatus, reviewerId, notes, alertId]
    );

    // Also resolve in review queue
    await this.pool.query(
      `UPDATE fraud_review_queue
       SET status = 'resolved', resolution = $1, resolution_notes = $2, resolved_at = NOW()
       WHERE alert_id = $3`,
      [resolution, notes, alertId]
    );

    return rows[0];
  }

  // ============================================================================
  // PUBLIC API — Review Queue
  // ============================================================================

  /**
   * Get review queue items sorted by priority
   */
  async getReviewQueue(filters = {}, pagination = { page: 1, limit: 25 }) {
    const conditions = ['1=1'];
    const params = [];
    let paramIdx = 1;

    if (filters.status) {
      conditions.push(`frq.status = $${paramIdx++}`);
      params.push(filters.status);
    }

    const offset = (pagination.page - 1) * pagination.limit;

    const { rows } = await this.pool.query(
      `SELECT frq.*,
              fa.risk_score, fa.alert_type, fa.severity, fa.details, fa.created_at AS alert_created_at,
              fr.rule_code, fr.rule_name,
              u.first_name || ' ' || u.last_name AS employee_name,
              assignee.first_name || ' ' || assignee.last_name AS assignee_name
       FROM fraud_review_queue frq
       JOIN fraud_alerts fa ON fa.id = frq.alert_id
       JOIN fraud_rules fr ON fr.id = fa.rule_id
       JOIN users u ON u.id = fa.user_id
       LEFT JOIN users assignee ON assignee.id = frq.assigned_to
       WHERE ${conditions.join(' AND ')}
       ORDER BY frq.priority DESC, frq.created_at ASC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, pagination.limit, offset]
    );

    return rows;
  }

  // ============================================================================
  // PUBLIC API — Incidents
  // ============================================================================

  /**
   * Create a fraud incident from one or more alerts
   */
  async createIncident(alertIds, details) {
    // Generate incident number: FRD-YYYYMMDD-0001
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { rows: countRows } = await this.pool.query(
      `SELECT COUNT(*) FROM fraud_incidents WHERE incident_number LIKE $1`,
      [`FRD-${dateStr}-%`]
    );
    const seq = (parseInt(countRows[0].count) + 1).toString().padStart(4, '0');
    const incidentNumber = `FRD-${dateStr}-${seq}`;

    const { rows } = await this.pool.query(
      `INSERT INTO fraud_incidents
        (incident_number, alert_ids, employee_id, customer_id, incident_type, total_loss, description, evidence, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
       RETURNING *`,
      [
        incidentNumber,
        alertIds,
        details.employee_id || null,
        details.customer_id || null,
        details.incident_type,
        details.total_loss || 0,
        details.description || '',
        JSON.stringify(details.evidence || {})
      ]
    );

    // Update related alerts to 'confirmed_fraud'
    if (alertIds.length > 0) {
      await this.pool.query(
        `UPDATE fraud_alerts SET status = 'confirmed_fraud' WHERE id = ANY($1)`,
        [alertIds]
      );
    }

    return rows[0];
  }

  /**
   * Get incidents with optional filters
   */
  async getIncidents(filters = {}, pagination = { page: 1, limit: 25 }) {
    const conditions = ['1=1'];
    const params = [];
    let paramIdx = 1;

    if (filters.status) {
      conditions.push(`fi.status = $${paramIdx++}`);
      params.push(filters.status);
    }
    if (filters.incident_type) {
      conditions.push(`fi.incident_type = $${paramIdx++}`);
      params.push(filters.incident_type);
    }

    const offset = (pagination.page - 1) * pagination.limit;

    const { rows } = await this.pool.query(
      `SELECT fi.*,
              emp.first_name || ' ' || emp.last_name AS employee_name,
              resolver.first_name || ' ' || resolver.last_name AS resolved_by_name
       FROM fraud_incidents fi
       LEFT JOIN users emp ON emp.id = fi.employee_id
       LEFT JOIN users resolver ON resolver.id = fi.resolved_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY fi.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, pagination.limit, offset]
    );

    return rows;
  }

  /**
   * Get a single incident by ID
   */
  async getIncidentById(incidentId) {
    const { rows } = await this.pool.query(
      `SELECT fi.*,
              emp.first_name || ' ' || emp.last_name AS employee_name,
              resolver.first_name || ' ' || resolver.last_name AS resolved_by_name
       FROM fraud_incidents fi
       LEFT JOIN users emp ON emp.id = fi.employee_id
       LEFT JOIN users resolver ON resolver.id = fi.resolved_by
       WHERE fi.id = $1`,
      [incidentId]
    );
    return rows[0] || null;
  }

  /**
   * Update incident status/details
   */
  async updateIncident(incidentId, updates, userId) {
    const fields = [];
    const params = [];
    let paramIdx = 1;

    if (updates.status) {
      fields.push(`status = $${paramIdx++}`);
      params.push(updates.status);
      if (updates.status === 'resolved' || updates.status === 'closed') {
        fields.push(`resolved_by = $${paramIdx++}`);
        params.push(userId);
        fields.push(`resolved_at = NOW()`);
      }
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIdx++}`);
      params.push(updates.description);
    }
    if (updates.total_loss !== undefined) {
      fields.push(`total_loss = $${paramIdx++}`);
      params.push(updates.total_loss);
    }
    if (updates.evidence) {
      fields.push(`evidence = $${paramIdx++}`);
      params.push(JSON.stringify(updates.evidence));
    }

    if (fields.length === 0) return null;

    params.push(incidentId);
    const { rows } = await this.pool.query(
      `UPDATE fraud_incidents SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    return rows[0];
  }

  // ============================================================================
  // PUBLIC API — Employee Metrics
  // ============================================================================

  /**
   * Get employee fraud metrics from materialized view
   */
  async getEmployeeMetrics(userId = null) {
    if (userId) {
      const { rows } = await this.pool.query(
        `SELECT * FROM employee_fraud_metrics WHERE user_id = $1`,
        [userId]
      );
      return rows[0] || null;
    }

    const { rows } = await this.pool.query(
      `SELECT * FROM employee_fraud_metrics ORDER BY fraud_alert_count DESC, void_count DESC`
    );
    return rows;
  }

  /**
   * Refresh the materialized view
   */
  async refreshEmployeeMetrics() {
    await this.pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY employee_fraud_metrics');
  }

  // ============================================================================
  // PUBLIC API — Audit Logging
  // ============================================================================

  /**
   * Log an audit entry for a sensitive action
   */
  async logAuditEntry(userId, action, entityType, entityId, details = {}, req = null) {
    const ipAddress = req
      ? (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || null)
      : null;
    const shiftId = details.shift_id || (req?.body?.shiftId) || (req?.body?.shift_id) || null;

    await this.pool.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address, shift_id, risk_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        action,
        entityType,
        entityId,
        JSON.stringify(details),
        ipAddress,
        shiftId,
        details.risk_score || null
      ]
    );
  }

  // ============================================================================
  // PUBLIC API — Dashboard Stats
  // ============================================================================

  /**
   * Get summary stats for the fraud dashboard
   */
  async getDashboardStats() {
    const { rows } = await this.pool.query(`
      SELECT
        (SELECT COUNT(*) FROM fraud_alerts WHERE status = 'new') AS new_alerts,
        (SELECT COUNT(*) FROM fraud_alerts WHERE status = 'reviewing') AS reviewing_alerts,
        (SELECT COUNT(*) FROM fraud_alerts WHERE status = 'confirmed_fraud' AND created_at > NOW() - INTERVAL '30 days') AS confirmed_30d,
        (SELECT COUNT(*) FROM fraud_review_queue WHERE status = 'pending') AS pending_reviews,
        (SELECT COUNT(*) FROM fraud_incidents WHERE status IN ('open', 'investigating')) AS active_incidents,
        (SELECT COALESCE(SUM(total_loss), 0) FROM fraud_incidents WHERE created_at > NOW() - INTERVAL '30 days') AS total_loss_30d,
        (SELECT COUNT(*) FROM chargeback_cases WHERE status IN ('received', 'responding')) AS active_chargebacks,
        (SELECT AVG(risk_score) FROM fraud_alerts WHERE created_at > NOW() - INTERVAL '7 days') AS avg_risk_7d
    `);

    return rows[0];
  }

  // ============================================================================
  // PUBLIC API — Rules Management
  // ============================================================================

  /**
   * Get all fraud rules
   */
  async getRules() {
    const { rows } = await this.pool.query(
      `SELECT * FROM fraud_rules ORDER BY rule_type, rule_code`
    );
    return rows;
  }

  /**
   * Update a fraud rule
   */
  async updateRule(ruleId, updates) {
    const fields = [];
    const params = [];
    let paramIdx = 1;

    if (updates.rule_name !== undefined) {
      fields.push(`rule_name = $${paramIdx++}`);
      params.push(updates.rule_name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIdx++}`);
      params.push(updates.description);
    }
    if (updates.conditions !== undefined) {
      fields.push(`conditions = $${paramIdx++}`);
      params.push(JSON.stringify(updates.conditions));
    }
    if (updates.risk_points !== undefined) {
      fields.push(`risk_points = $${paramIdx++}`);
      params.push(updates.risk_points);
    }
    if (updates.severity !== undefined) {
      fields.push(`severity = $${paramIdx++}`);
      params.push(updates.severity);
    }
    if (updates.action !== undefined) {
      fields.push(`action = $${paramIdx++}`);
      params.push(updates.action);
    }
    if (updates.is_active !== undefined) {
      fields.push(`is_active = $${paramIdx++}`);
      params.push(updates.is_active);
    }

    fields.push('updated_at = NOW()');

    if (fields.length <= 1) return null;

    params.push(ruleId);
    const { rows } = await this.pool.query(
      `UPDATE fraud_rules SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    // Invalidate cache
    this._rulesCache = null;
    this._rulesCacheTime = 0;

    return rows[0];
  }

  // ============================================================================
  // PUBLIC API — Chargebacks
  // ============================================================================

  async getChargebacks(filters = {}, pagination = { page: 1, limit: 25 }) {
    const conditions = ['1=1'];
    const params = [];
    let paramIdx = 1;

    if (filters.status) {
      conditions.push(`cc.status = $${paramIdx++}`);
      params.push(filters.status);
    }

    const offset = (pagination.page - 1) * pagination.limit;

    const { rows } = await this.pool.query(
      `SELECT cc.*,
              t.transaction_number, t.total_amount AS transaction_amount,
              c.name AS customer_name
       FROM chargeback_cases cc
       JOIN transactions t ON t.transaction_id = cc.transaction_id
       LEFT JOIN customers c ON c.id = cc.customer_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY cc.deadline ASC NULLS LAST, cc.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, pagination.limit, offset]
    );

    return rows;
  }

  async getChargebackById(chargebackId) {
    const { rows: cbRows } = await this.pool.query(
      `SELECT cc.*,
              t.transaction_number, t.total_amount AS transaction_amount,
              c.name AS customer_name
       FROM chargeback_cases cc
       JOIN transactions t ON t.transaction_id = cc.transaction_id
       LEFT JOIN customers c ON c.id = cc.customer_id
       WHERE cc.id = $1`,
      [chargebackId]
    );

    if (!cbRows[0]) return null;

    const { rows: evidenceRows } = await this.pool.query(
      `SELECT ce.*, u.first_name || ' ' || u.last_name AS uploaded_by_name
       FROM chargeback_evidence ce
       JOIN users u ON u.id = ce.uploaded_by
       WHERE ce.chargeback_id = $1
       ORDER BY ce.created_at DESC`,
      [chargebackId]
    );

    return { ...cbRows[0], evidence: evidenceRows };
  }

  async createChargeback(data) {
    const { rows } = await this.pool.query(
      `INSERT INTO chargeback_cases
        (transaction_id, payment_id, case_number, amount, reason_code, status, deadline, customer_id, notes)
       VALUES ($1, $2, $3, $4, $5, 'received', $6, $7, $8)
       RETURNING *`,
      [
        data.transaction_id,
        data.payment_id,
        data.case_number || null,
        data.amount,
        data.reason_code || null,
        data.deadline || null,
        data.customer_id || null,
        data.notes || null
      ]
    );

    // Check if customer has chargeback history and create alert
    if (data.customer_id) {
      const rules = await this._loadRules();
      const cbRule = rules.find(r => r.rule_code === 'chargeback_history' && r.is_active);
      if (cbRule) {
        await this.createAlert({
          riskScore: cbRule.risk_points,
          triggeredRules: [{ triggered: true, rule: cbRule, details: { chargeback_id: rows[0].id, amount: data.amount } }],
          action: 'alert',
          alertType: 'chargeback',
          severity: cbRule.severity
        }, {
          userId: data.created_by,
          transactionId: data.transaction_id,
          customerId: data.customer_id
        });
      }
    }

    return rows[0];
  }

  async updateChargeback(chargebackId, updates) {
    const fields = [];
    const params = [];
    let paramIdx = 1;

    if (updates.status) {
      fields.push(`status = $${paramIdx++}`);
      params.push(updates.status);
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramIdx++}`);
      params.push(updates.notes);
    }
    if (updates.deadline !== undefined) {
      fields.push(`deadline = $${paramIdx++}`);
      params.push(updates.deadline);
    }
    if (updates.reason_code !== undefined) {
      fields.push(`reason_code = $${paramIdx++}`);
      params.push(updates.reason_code);
    }

    fields.push('updated_at = NOW()');

    if (fields.length <= 1) return null;

    params.push(chargebackId);
    const { rows } = await this.pool.query(
      `UPDATE chargeback_cases SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    return rows[0];
  }

  async addChargebackEvidence(chargebackId, data) {
    const { rows } = await this.pool.query(
      `INSERT INTO chargeback_evidence (chargeback_id, evidence_type, file_path, description, uploaded_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [chargebackId, data.evidence_type, data.file_path || null, data.description || null, data.uploaded_by]
    );
    return rows[0];
  }

  // ============================================================================
  // PUBLIC API — Audit Logs Query
  // ============================================================================

  async getAuditLogs(filters = {}, pagination = { page: 1, limit: 50 }) {
    const conditions = ['1=1'];
    const params = [];
    let paramIdx = 1;

    if (filters.user_id) {
      conditions.push(`al.user_id = $${paramIdx++}`);
      params.push(filters.user_id);
    }
    if (filters.action) {
      conditions.push(`al.action = $${paramIdx++}`);
      params.push(filters.action);
    }
    if (filters.entity_type) {
      conditions.push(`al.entity_type = $${paramIdx++}`);
      params.push(filters.entity_type);
    }
    if (filters.entity_id) {
      conditions.push(`al.entity_id = $${paramIdx++}`);
      params.push(filters.entity_id);
    }
    if (filters.date_from) {
      conditions.push(`al.created_at >= $${paramIdx++}`);
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      conditions.push(`al.created_at <= $${paramIdx++}`);
      params.push(filters.date_to);
    }

    const offset = (pagination.page - 1) * pagination.limit;

    const { rows } = await this.pool.query(
      `SELECT al.*,
              u.first_name || ' ' || u.last_name AS user_name, u.email AS user_email
       FROM audit_log al
       JOIN users u ON u.id = al.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY al.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, pagination.limit, offset]
    );

    return rows;
  }

  // ============================================================================
  // PRIVATE — Rule Evaluation
  // ============================================================================

  /**
   * Load rules with caching
   */
  async _loadRules() {
    const now = Date.now();
    if (this._rulesCache && (now - this._rulesCacheTime) < this.RULES_CACHE_TTL) {
      return this._rulesCache;
    }

    const { rows } = await this.pool.query(
      `SELECT * FROM fraud_rules WHERE is_active = true`
    );

    this._rulesCache = rows;
    this._rulesCacheTime = now;
    return rows;
  }

  /**
   * Check velocity: count of actions in current shift
   */
  async _checkVelocity(userId, shiftId, type, rule) {
    let count = 0;

    if (type === 'refund') {
      const { rows } = await this.pool.query(
        `SELECT COUNT(*) FROM pos_returns
         WHERE processed_by = $1
           AND created_at >= (SELECT started_at FROM register_shifts WHERE shift_id = $2)`,
        [userId, shiftId]
      );
      count = parseInt(rows[0].count);
    } else if (type === 'void') {
      const { rows } = await this.pool.query(
        `SELECT COUNT(*) FROM transactions
         WHERE voided_by = $1 AND status = 'voided'
           AND created_at >= (SELECT started_at FROM register_shifts WHERE shift_id = $2)`,
        [userId, shiftId]
      );
      count = parseInt(rows[0].count);
    }

    const maxCount = rule.conditions.max_count || 3;
    return {
      triggered: count >= maxCount,
      rule,
      details: { count, limit: maxCount, type }
    };
  }

  /**
   * Check amount against threshold
   */
  _checkAmountThreshold(amount, threshold, rule) {
    return {
      triggered: amount > threshold,
      rule,
      details: { amount, threshold }
    };
  }

  /**
   * Check if employee is refunding their own sale
   */
  async _checkSelfRefund(userId, originalTxnId, rule) {
    const { rows } = await this.pool.query(
      `SELECT user_id FROM transactions WHERE transaction_id = $1`,
      [originalTxnId]
    );

    const originalCashier = rows[0]?.user_id;
    return {
      triggered: originalCashier === userId,
      rule,
      details: { pattern: 'self_refund', original_cashier: originalCashier, refunding_employee: userId }
    };
  }

  /**
   * Check if voiding a completed transaction
   */
  async _checkVoidCompleted(txnId, rule) {
    const { rows } = await this.pool.query(
      `SELECT status FROM transactions WHERE transaction_id = $1`,
      [txnId]
    );

    return {
      triggered: rows[0]?.status === 'completed',
      rule,
      details: { pattern: 'void_completed', transaction_status: rows[0]?.status }
    };
  }

  /**
   * Check customer repeat returns
   */
  async _checkRepeatReturns(customerId, rule) {
    const windowDays = rule.conditions.window_days || 30;
    const maxReturns = rule.conditions.max_returns || 3;

    const { rows } = await this.pool.query(
      `SELECT COUNT(*) FROM pos_returns r
       JOIN transactions t ON t.transaction_id = r.original_transaction_id
       WHERE t.customer_id = $1
         AND r.created_at > NOW() - ($2 || ' days')::INTERVAL`,
      [customerId, windowDays]
    );

    const count = parseInt(rows[0].count);
    return {
      triggered: count >= maxReturns,
      rule,
      details: { return_count: count, limit: maxReturns, window_days: windowDays }
    };
  }

  /**
   * Check customer chargeback history
   */
  async _checkCustomerChargebackHistory(customerId, rule) {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*) FROM chargeback_cases WHERE customer_id = $1`,
      [customerId]
    );

    return {
      triggered: parseInt(rows[0].count) > 0,
      rule,
      details: { chargeback_count: parseInt(rows[0].count) }
    };
  }

  // ============================================================================
  // PRIVATE — Discount Fraud Checks
  // ============================================================================

  /**
   * Check if employee is consistently maxing their discount tier limit.
   * Looks at recent discount_transactions and counts how many are at or near the tier max.
   */
  async _checkDiscountMaxPattern(userId, currentDiscountPct, rule) {
    const windowHours = rule.conditions.window_hours || 168; // 7 days default
    const minTxns = rule.conditions.min_transactions || 5;
    const nearMaxPct = rule.conditions.near_max_threshold_pct || 90;

    // Get employee's tier max
    const tierResult = await this.pool.query(
      `SELECT dat.max_discount_pct_standard, dat.max_discount_pct_high_margin
       FROM discount_authority_tiers dat
       JOIN users u ON LOWER(
         CASE WHEN u.role = 'user' THEN 'staff' WHEN u.role = 'admin' THEN 'master' ELSE u.role END
       ) = dat.role_name
       WHERE u.id = $1`,
      [userId]
    );
    if (!tierResult.rows[0]) return { triggered: false, rule, details: {} };

    const tierMax = Math.max(
      parseFloat(tierResult.rows[0].max_discount_pct_standard) || 0,
      parseFloat(tierResult.rows[0].max_discount_pct_high_margin) || 0
    );
    if (tierMax <= 0) return { triggered: false, rule, details: {} };

    // Count recent discount transactions near the max
    const { rows } = await this.pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE discount_pct >= $1) as near_max_count
       FROM discount_transactions
       WHERE employee_id = $2
         AND created_at > NOW() - ($3 || ' hours')::INTERVAL`,
      [tierMax * (nearMaxPct / 100), userId, windowHours]
    );

    const total = parseInt(rows[0].total);
    const nearMaxCount = parseInt(rows[0].near_max_count);

    return {
      triggered: total >= minTxns && nearMaxCount >= minTxns,
      rule,
      details: {
        total_discount_txns: total,
        near_max_count: nearMaxCount,
        tier_max: tierMax,
        window_hours: windowHours
      }
    };
  }

  /**
   * Check if employee has a pattern of applying discounts then voiding transactions.
   * Looks for voided transactions that had discounts applied by the same employee.
   * Note: transactions table has voided_by but no voided_at timestamp,
   * so we compare against the discount creation time window.
   */
  async _checkDiscountVoidPattern(userId, rule) {
    const minDiscountPct = rule.conditions.min_discount_pct || 5;

    const { rows } = await this.pool.query(
      `SELECT COUNT(*) as pattern_count
       FROM discount_transactions dt
       JOIN transactions t ON t.transaction_id = dt.sale_id
       WHERE dt.employee_id = $1
         AND t.status = 'voided'
         AND t.voided_by = $1
         AND dt.discount_pct >= $2
         AND dt.created_at > NOW() - INTERVAL '30 days'`,
      [userId, minDiscountPct]
    );

    const count = parseInt(rows[0].pattern_count);
    return {
      triggered: count >= 2,
      rule,
      details: { discount_void_count: count, period: '30 days' }
    };
  }

  /**
   * Check employee's ratio of discounted transactions to refunds.
   * High ratio may indicate discount-then-refund scheme.
   */
  async _checkDiscountRefundRatio(userId, rule) {
    const windowDays = rule.conditions.window_days || 30;
    const minDiscountTxns = rule.conditions.min_discount_txns || 3;
    const ratioThreshold = rule.conditions.refund_ratio_threshold || 0.4;

    const { rows } = await this.pool.query(
      `SELECT
         (SELECT COUNT(*) FROM discount_transactions
          WHERE employee_id = $1 AND created_at > NOW() - ($2 || ' days')::INTERVAL) as discount_count,
         (SELECT COUNT(*) FROM pos_returns
          WHERE processed_by = $1 AND created_at > NOW() - ($2 || ' days')::INTERVAL) as refund_count`,
      [userId, windowDays]
    );

    const discountCount = parseInt(rows[0].discount_count);
    const refundCount = parseInt(rows[0].refund_count);
    const ratio = discountCount > 0 ? refundCount / discountCount : 0;

    return {
      triggered: discountCount >= minDiscountTxns && ratio >= ratioThreshold,
      rule,
      details: { discount_count: discountCount, refund_count: refundCount, ratio: +ratio.toFixed(2), threshold: ratioThreshold }
    };
  }

  // ============================================================================
  // PRIVATE — Scoring
  // ============================================================================

  /**
   * Calculate risk score from triggered rules (0-100)
   */
  _calculateRiskScore(triggeredRules) {
    const total = triggeredRules
      .filter(tr => tr.triggered)
      .reduce((sum, tr) => sum + (tr.rule.risk_points || 0), 0);
    return Math.min(100, Math.max(0, total));
  }

  /**
   * Determine action based on score and rule actions
   * 0-29 = allow, 30-59 = alert, 60-79 = require_approval, 80+ = block
   */
  _determineAction(score, triggeredRules) {
    // If any rule explicitly blocks, block
    const hasBlock = triggeredRules.some(tr => tr.triggered && tr.rule.action === 'block');
    if (hasBlock) return 'block';

    // If any rule requires approval, require approval
    const hasApproval = triggeredRules.some(tr => tr.triggered && tr.rule.action === 'require_approval');
    if (hasApproval && score >= 20) return 'require_approval';

    // Score-based thresholds
    if (score >= 80) return 'block';
    if (score >= 60) return 'require_approval';
    if (score >= 30) return 'alert';
    return 'allow';
  }

  /**
   * Get highest severity from triggered rules
   */
  _getHighestSeverity(triggeredRules) {
    const order = { critical: 4, high: 3, medium: 2, low: 1 };
    let highest = 'low';
    for (const tr of triggeredRules) {
      if (tr.triggered && (order[tr.rule.severity] || 0) > (order[highest] || 0)) {
        highest = tr.rule.severity;
      }
    }
    return highest;
  }
}

module.exports = FraudDetectionService;
