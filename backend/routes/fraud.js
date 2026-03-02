/**
 * TeleTime POS - Fraud Detection Routes
 * Handles fraud alerts, review queue, incidents, employee metrics, rules, and dashboard
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let fraudService = null;
let employeeMonitorService = null;
let cache = null;
let fraudMLDataService = null;
let mlScoringService = null;
let featureStoreService = null;

// ============================================================================
// DASHBOARD
// ============================================================================

router.get('/dashboard', authenticate, requirePermission('fraud.alerts.view'), asyncHandler(async (req, res) => {
  const stats = await fraudService.getDashboardStats();
  res.json({ success: true, data: stats });
}));

// ============================================================================
// ALERTS
// ============================================================================

router.get('/alerts', authenticate, requirePermission('fraud.alerts.view'), asyncHandler(async (req, res) => {
  const { status, severity, alert_type, user_id, date_from, date_to, page = 1, limit = 25 } = req.query;
  const filters = {};
  if (status) filters.status = status;
  if (severity) filters.severity = severity;
  if (alert_type) filters.alert_type = alert_type;
  if (user_id) filters.user_id = parseInt(user_id);
  if (date_from) filters.date_from = date_from;
  if (date_to) filters.date_to = date_to;

  const result = await fraudService.getAlerts(filters, { page: parseInt(page), limit: parseInt(limit) });
  res.json({ success: true, data: result });
}));

router.get('/alerts/:id', authenticate, requirePermission('fraud.alerts.view'), asyncHandler(async (req, res) => {
  const alert = await fraudService.getAlertById(parseInt(req.params.id));
  if (!alert) {
    throw ApiError.notFound('Alert');
  }
  res.json({ success: true, data: alert });
}));

router.put('/alerts/:id/review', authenticate, requirePermission('fraud.alerts.review'), asyncHandler(async (req, res) => {
  const { resolution, notes } = req.body;
  if (!resolution || !['confirmed_fraud', 'false_positive', 'dismissed'].includes(resolution)) {
    throw ApiError.badRequest('Invalid resolution. Must be: confirmed_fraud, false_positive, or dismissed');
  }

  const alert = await fraudService.reviewAlert(parseInt(req.params.id), req.user.id, resolution, notes || '');
  if (!alert) {
    throw ApiError.notFound('Alert');
  }

  await fraudService.logAuditEntry(req.user.id, 'fraud.alert.review', 'fraud_alert', parseInt(req.params.id), {
    resolution,
    notes
  }, req);

  res.json({ success: true, data: alert });
}));

// ============================================================================
// REVIEW QUEUE
// ============================================================================

router.get('/review-queue', authenticate, requirePermission('fraud.alerts.review'), asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 25 } = req.query;
  const filters = {};
  if (status) filters.status = status;

  const items = await fraudService.getReviewQueue(filters, { page: parseInt(page), limit: parseInt(limit) });
  res.json({ success: true, data: items });
}));

// ============================================================================
// INCIDENTS
// ============================================================================

router.post('/incidents', authenticate, requirePermission('fraud.incidents.manage'), asyncHandler(async (req, res) => {
  const { alert_ids, incident_type, employee_id, customer_id, total_loss, description, evidence } = req.body;

  if (!alert_ids || !Array.isArray(alert_ids) || alert_ids.length === 0) {
    throw ApiError.badRequest('At least one alert ID is required');
  }
  if (!incident_type) {
    throw ApiError.badRequest('Incident type is required');
  }

  const incident = await fraudService.createIncident(alert_ids, {
    incident_type,
    employee_id: employee_id || null,
    customer_id: customer_id || null,
    total_loss: total_loss || 0,
    description: description || '',
    evidence: evidence || {}
  });

  await fraudService.logAuditEntry(req.user.id, 'fraud.incident.create', 'fraud_incident', incident.id, {
    alert_ids,
    incident_type,
    total_loss
  }, req);

  res.status(201).json({ success: true, data: incident });
}));

router.get('/incidents', authenticate, requirePermission('fraud.incidents.manage'), asyncHandler(async (req, res) => {
  const { status, incident_type, page = 1, limit = 25 } = req.query;
  const filters = {};
  if (status) filters.status = status;
  if (incident_type) filters.incident_type = incident_type;

  const incidents = await fraudService.getIncidents(filters, { page: parseInt(page), limit: parseInt(limit) });
  res.json({ success: true, data: incidents });
}));

router.get('/incidents/:id', authenticate, requirePermission('fraud.incidents.manage'), asyncHandler(async (req, res) => {
  const incident = await fraudService.getIncidentById(parseInt(req.params.id));
  if (!incident) {
    throw ApiError.notFound('Incident');
  }
  res.json({ success: true, data: incident });
}));

router.put('/incidents/:id', authenticate, requirePermission('fraud.incidents.manage'), asyncHandler(async (req, res) => {
  const incident = await fraudService.updateIncident(parseInt(req.params.id), req.body, req.user.id);
  if (!incident) {
    throw ApiError.notFound('Incident not found or no changes');
  }

  await fraudService.logAuditEntry(req.user.id, 'fraud.incident.update', 'fraud_incident', parseInt(req.params.id), {
    updates: req.body
  }, req);

  res.json({ success: true, data: incident });
}));

// ============================================================================
// EMPLOYEE METRICS
// ============================================================================

router.get('/employee-metrics', authenticate, requirePermission('fraud.employee_metrics.view'), asyncHandler(async (req, res) => {
  const metrics = await fraudService.getEmployeeMetrics();
  res.json({ success: true, data: metrics });
}));

router.get('/employee-metrics/:userId', authenticate, requirePermission('fraud.employee_metrics.view'), asyncHandler(async (req, res) => {
  const metrics = await fraudService.getEmployeeMetrics(parseInt(req.params.userId));
  if (!metrics) {
    throw ApiError.notFound('Employee metrics');
  }
  res.json({ success: true, data: metrics });
}));

router.post('/employee-metrics/refresh', authenticate, requirePermission('fraud.employee_metrics.view'), asyncHandler(async (req, res) => {
  await fraudService.refreshEmployeeMetrics();
  res.json({ success: true, message: 'Employee metrics refreshed' });
}));

// ============================================================================
// RULES
// ============================================================================

router.get('/rules', authenticate, requirePermission('fraud.rules.manage'), asyncHandler(async (req, res) => {
  const rules = await fraudService.getRules();
  res.json({ success: true, data: rules });
}));

router.get('/rules/:id', authenticate, requirePermission('fraud.rules.manage'), asyncHandler(async (req, res) => {
  const ruleId = parseInt(req.params.id);
  const pool = fraudService.pool;

  // Fetch rule + effectiveness metrics in parallel
  const [ruleResult, metricsResult, topSignalResult, reviewedResult] = await Promise.all([
    pool.query('SELECT * FROM fraud_rules WHERE id = $1', [ruleId]),

    // How often this rule fires (from fraud_scores.signals JSONB) — last 30 days
    pool.query(`
      SELECT
        COUNT(*)::int AS total_fires,
        ROUND(COUNT(*)::numeric / GREATEST(EXTRACT(DAY FROM NOW() - MIN(fs.created_at)), 1), 1) AS fires_per_day,
        ROUND(COUNT(*)::numeric / GREATEST(EXTRACT(DAY FROM NOW() - MIN(fs.created_at)) / 7, 1), 1) AS fires_per_week
      FROM fraud_scores fs, LATERAL jsonb_each(fs.signals) AS s(key, value)
      WHERE fs.created_at >= NOW() - INTERVAL '30 days'
        AND s.key = (SELECT rule_code FROM fraud_rules WHERE id = $1)
        AND s.value::text NOT IN ('0', 'false', 'null', '""')
    `, [ruleId]),

    // What % of flagged transactions had this rule as the highest-scoring signal
    pool.query(`
      WITH flagged AS (
        SELECT fs.id, fs.signals
        FROM fraud_scores fs
        WHERE fs.created_at >= NOW() - INTERVAL '30 days'
          AND fs.action_taken IN ('flagged','held','escalated','declined','confirmed_fraud')
      ),
      top_signal AS (
        SELECT f.id,
          (SELECT key FROM jsonb_each(f.signals) AS s(key, value)
           WHERE s.value::text NOT IN ('0', 'false', 'null', '""')
           ORDER BY (s.value->>'risk_points')::int DESC NULLS LAST LIMIT 1) AS top_key
        FROM flagged f
      )
      SELECT
        COUNT(*)::int AS total_flagged,
        COUNT(*) FILTER (WHERE top_key = (SELECT rule_code FROM fraud_rules WHERE id = $1))::int AS as_top_signal
      FROM top_signal
    `, [ruleId]),

    // False positive rate: flagged by this rule, but reviewed as legitimate
    pool.query(`
      SELECT
        COUNT(*)::int AS reviewed_count,
        COUNT(*) FILTER (WHERE fs.action_taken = 'approved' OR
          (fs.reviewed_at IS NOT NULL AND fs.action_taken NOT IN ('declined','confirmed_fraud')))::int AS false_positives
      FROM fraud_scores fs, LATERAL jsonb_each(fs.signals) AS s(key, value)
      WHERE fs.created_at >= NOW() - INTERVAL '30 days'
        AND s.key = (SELECT rule_code FROM fraud_rules WHERE id = $1)
        AND s.value::text NOT IN ('0', 'false', 'null', '""')
        AND fs.reviewed_at IS NOT NULL
    `, [ruleId]),
  ]);

  if (ruleResult.rows.length === 0) {
    throw ApiError.notFound('Rule');
  }

  const m = metricsResult.rows[0] || {};
  const ts = topSignalResult.rows[0] || {};
  const rv = reviewedResult.rows[0] || {};

  res.json({
    success: true,
    data: {
      ...ruleResult.rows[0],
      effectiveness: {
        total_fires_30d: parseInt(m.total_fires) || 0,
        fires_per_day: parseFloat(m.fires_per_day) || 0,
        fires_per_week: parseFloat(m.fires_per_week) || 0,
        total_flagged_30d: parseInt(ts.total_flagged) || 0,
        as_top_signal: parseInt(ts.as_top_signal) || 0,
        top_signal_pct: ts.total_flagged > 0
          ? Math.round((ts.as_top_signal / ts.total_flagged) * 1000) / 10
          : 0,
        reviewed_count: parseInt(rv.reviewed_count) || 0,
        false_positives: parseInt(rv.false_positives) || 0,
        false_positive_rate: rv.reviewed_count > 0
          ? Math.round((rv.false_positives / rv.reviewed_count) * 1000) / 10
          : 0,
      },
    },
  });
}));

router.post('/rules', authenticate, requirePermission('fraud.rules.manage'), asyncHandler(async (req, res) => {
  const { rule_code, rule_name, description, rule_type, conditions, risk_points,
    severity, action, weight, parameters, location_overrides } = req.body;

  if (!rule_code || !rule_name || !rule_type) {
    throw ApiError.badRequest('rule_code, rule_name, and rule_type are required');
  }

  // Validate rule_type
  const validTypes = ['velocity', 'amount', 'pattern', 'employee', 'customer'];
  if (!validTypes.includes(rule_type)) {
    throw ApiError.badRequest(`rule_type must be one of: ${validTypes.join(', ')}`);
  }

  // Check for duplicate rule_code
  const existing = await fraudService.pool.query(
    'SELECT id FROM fraud_rules WHERE rule_code = $1', [rule_code]
  );
  if (existing.rows.length > 0) {
    throw ApiError.badRequest(`Rule code "${rule_code}" already exists`);
  }

  const { rows } = await fraudService.pool.query(`
    INSERT INTO fraud_rules (rule_code, rule_name, description, rule_type, conditions,
      risk_points, severity, action, is_active, weight, parameters, location_overrides, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $11, $12)
    RETURNING *
  `, [
    rule_code, rule_name, description || null, rule_type,
    JSON.stringify(conditions || {}), risk_points || 0,
    severity || 'medium', action || 'alert',
    weight || 0, JSON.stringify(parameters || {}),
    JSON.stringify(location_overrides || {}), req.user.id,
  ]);

  // Invalidate rules cache
  fraudService._rulesCache = null;
  fraudService._rulesCacheTime = 0;

  await fraudService.logAuditEntry(req.user.id, 'config_change', 'fraud_rule', rows[0].id, {
    event_category: 'fraud', action_detail: 'rule.create', rule_code, rule_name, rule_type,
  }, req);

  res.status(201).json({ success: true, data: rows[0] });
}));

router.put('/rules/:id', authenticate, requirePermission('fraud.rules.manage'), asyncHandler(async (req, res) => {
  const ruleId = parseInt(req.params.id);
  const pool = fraudService.pool;
  const updates = req.body;

  // Build dynamic update
  const fields = [];
  const params = [];
  let idx = 1;

  const allowed = ['rule_name', 'description', 'conditions', 'risk_points', 'severity',
    'action', 'is_active', 'weight', 'parameters', 'location_overrides'];

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      const val = ['conditions', 'parameters', 'location_overrides'].includes(key)
        ? JSON.stringify(updates[key]) : updates[key];
      params.push(val);
      fields.push(`${key} = $${idx++}`);
    }
  }

  if (fields.length === 0) {
    return res.json({ success: true, data: null, message: 'No changes' });
  }

  fields.push('updated_at = NOW()');
  params.push(ruleId);

  const { rows } = await pool.query(
    `UPDATE fraud_rules SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );

  if (rows.length === 0) throw ApiError.notFound('Rule');

  // Invalidate cache
  fraudService._rulesCache = null;
  fraudService._rulesCacheTime = 0;

  await fraudService.logAuditEntry(req.user.id, 'config_change', 'fraud_rule', ruleId, {
    event_category: 'fraud', action_detail: 'rule.update', updates,
  }, req);

  res.json({ success: true, data: rows[0] });
}));

router.delete('/rules/:id', authenticate, requirePermission('fraud.rules.manage'), asyncHandler(async (req, res) => {
  const ruleId = parseInt(req.params.id);
  const { rows } = await fraudService.pool.query(
    'UPDATE fraud_rules SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
    [ruleId]
  );

  if (rows.length === 0) throw ApiError.notFound('Rule');

  fraudService._rulesCache = null;
  fraudService._rulesCacheTime = 0;

  await fraudService.logAuditEntry(req.user.id, 'config_change', 'fraud_rule', ruleId, {
    event_category: 'fraud', action_detail: 'rule.delete', rule_code: rows[0].rule_code,
  }, req);

  res.json({ success: true, data: rows[0] });
}));

/**
 * POST /api/fraud/rules/:id/test
 * Dry-run a rule (current or with modified parameters) against the last 30 days
 */
router.post('/rules/:id/test', authenticate, requirePermission('fraud.rules.manage'), asyncHandler(async (req, res) => {
  const ruleId = parseInt(req.params.id);
  const pool = fraudService.pool;
  const { test_parameters } = req.body; // Optional override parameters for comparison

  // Get the rule
  const ruleResult = await pool.query('SELECT * FROM fraud_rules WHERE id = $1', [ruleId]);
  if (ruleResult.rows.length === 0) throw ApiError.notFound('Rule');
  const rule = ruleResult.rows[0];

  // Count how many fraud_scores in last 30 days have this rule in their signals
  const currentResult = await pool.query(`
    SELECT
      COUNT(*)::int AS total_transactions,
      COUNT(*) FILTER (WHERE signals ? $1)::int AS would_flag,
      COUNT(*) FILTER (WHERE signals ? $1 AND action_taken IN ('declined','confirmed_fraud'))::int AS would_decline,
      COUNT(*) FILTER (
        WHERE signals ? $1
        AND reviewed_at IS NOT NULL
        AND action_taken NOT IN ('declined','confirmed_fraud')
      )::int AS false_positives
    FROM fraud_scores
    WHERE created_at >= NOW() - INTERVAL '30 days'
  `, [rule.rule_code]);

  const current = currentResult.rows[0];

  // Simulate with test_parameters (weight change simulation)
  let proposed = null;
  if (test_parameters) {
    // For weight/threshold changes, we can simulate how many more/fewer would be caught
    // by checking the score distribution of transactions where this rule fired
    const scoreDistResult = await pool.query(`
      SELECT
        fs.score,
        (fs.signals->$1->>'risk_points')::int AS current_points,
        fs.action_taken,
        fs.reviewed_at
      FROM fraud_scores fs
      WHERE fs.created_at >= NOW() - INTERVAL '30 days'
        AND fs.signals ? $1
      ORDER BY fs.score
    `, [rule.rule_code]);

    const currentWeight = parseInt(rule.weight) || parseInt(rule.risk_points) || 0;
    const newWeight = parseInt(test_parameters.weight !== undefined ? test_parameters.weight : rule.weight) || 0;
    const delta = newWeight - currentWeight;

    let wouldFlag = 0;
    let wouldDecline = 0;
    let wouldFalsePositive = 0;

    for (const row of scoreDistResult.rows) {
      const adjustedScore = Math.max(0, Math.min(100, row.score + delta));
      const isFlagged = adjustedScore >= 30;
      const isDeclined = adjustedScore >= 80;
      const isReviewedLegit = row.reviewed_at && !['declined', 'confirmed_fraud'].includes(row.action_taken);

      if (isFlagged) wouldFlag++;
      if (isDeclined) wouldDecline++;
      if (isFlagged && isReviewedLegit) wouldFalsePositive++;
    }

    proposed = {
      total_transactions: parseInt(current.total_transactions),
      would_flag: wouldFlag,
      would_decline: wouldDecline,
      false_positives: wouldFalsePositive,
      false_positive_rate: wouldFlag > 0 ? Math.round((wouldFalsePositive / wouldFlag) * 1000) / 10 : 0,
      parameters: test_parameters,
    };
  }

  res.json({
    success: true,
    data: {
      rule_code: rule.rule_code,
      rule_name: rule.rule_name,
      period: '30 days',
      current: {
        total_transactions: parseInt(current.total_transactions),
        would_flag: parseInt(current.would_flag),
        would_decline: parseInt(current.would_decline),
        false_positives: parseInt(current.false_positives),
        false_positive_rate: current.would_flag > 0
          ? Math.round((current.false_positives / current.would_flag) * 1000) / 10
          : 0,
      },
      proposed,
    },
  });
}));

// ============================================================================
// CODE 10 — SILENT FRAUD ALERT
// ============================================================================

router.post('/code10', authenticate, asyncHandler(async (req, res) => {
  const { transaction_id, shift_id, customer_id } = req.body;

  // Look up the manual_code10 rule
  const ruleResult = await fraudService.pool.query(
    "SELECT * FROM fraud_rules WHERE rule_code = 'manual_code10' AND is_active = true"
  );

  const rule = ruleResult.rows[0];
  if (!rule) {
    // Rule not seeded yet — still acknowledge silently
    return res.json({ success: true, data: { acknowledged: true } });
  }

  // Create a critical alert
  await fraudService.createAlert({
    riskScore: 90,
    triggeredRules: [{
      triggered: true,
      rule,
      details: { initiated_by: req.user.id, transaction_id, shift_id }
    }],
    action: 'alert',
    alertType: 'code10',
    severity: 'critical'
  }, {
    userId: req.user.id,
    transactionId: transaction_id || null,
    shiftId: shift_id || null,
    customerId: customer_id || null
  });

  // Log audit entry
  await fraudService.logAuditEntry(req.user.id, 'fraud.code10', 'transaction', transaction_id || null, {
    shift_id,
    customer_id,
    risk_score: 90
  }, req);

  // Minimal response — no detailed fraud info visible
  res.json({ success: true, data: { acknowledged: true } });
}));

// ============================================================================
// EMPLOYEE RISK PROFILES
// ============================================================================

router.get('/employee-risk-profile/:userId', authenticate, requirePermission('fraud.employee_metrics.view'), asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId);
  const { rows } = await fraudService.pool.query(
    `SELECT erp.*,
            u.first_name || ' ' || u.last_name AS employee_name,
            u.email AS employee_email,
            u.role AS employee_role
     FROM employee_risk_profiles erp
     JOIN users u ON u.id = erp.user_id
     WHERE erp.user_id = $1`,
    [userId]
  );

  if (!rows[0]) {
    // Return a default profile if none exists yet
    const { rows: userRows } = await fraudService.pool.query(
      "SELECT id, first_name || ' ' || last_name AS employee_name, email AS employee_email, role AS employee_role FROM users WHERE id = $1",
      [userId]
    );
    if (!userRows[0]) throw ApiError.notFound('User');
    return res.json({
      success: true,
      data: {
        user_id: userId,
        risk_level: 'normal',
        total_alerts: 0,
        total_incidents: 0,
        last_alert_at: null,
        last_incident_at: null,
        notes: null,
        ...userRows[0]
      }
    });
  }

  res.json({ success: true, data: rows[0] });
}));

router.put('/employee-risk-profile/:userId', authenticate, requirePermission('fraud.incidents.manage'), asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId);
  const { risk_level, notes } = req.body;

  if (risk_level && !['normal', 'elevated', 'high', 'suspended'].includes(risk_level)) {
    throw ApiError.badRequest('Invalid risk_level. Must be: normal, elevated, high, or suspended');
  }

  const riskVal = risk_level || 'normal';
  const notesVal = notes !== undefined ? notes : null;

  const { rows } = await fraudService.pool.query(
    `INSERT INTO employee_risk_profiles (user_id, risk_level, notes, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       risk_level = COALESCE($2, employee_risk_profiles.risk_level),
       notes = CASE WHEN $3 IS NOT NULL THEN $3 ELSE employee_risk_profiles.notes END,
       updated_at = NOW()
     RETURNING *`,
    [userId, riskVal, notesVal]
  );

  await fraudService.logAuditEntry(req.user.id, 'fraud.employee_risk.update', 'employee_risk_profile', userId, {
    risk_level: riskVal,
    notes: notesVal
  }, req);

  res.json({ success: true, data: rows[0] });
}));

// ============================================================================
// FRAUD SCORES
// ============================================================================

router.get('/scores', authenticate, requirePermission('fraud.alerts.view'), asyncHandler(async (req, res) => {
  const { risk_level, employee_id, location_id, action_taken, min_score, date_from, date_to, page = 1, limit = 25 } = req.query;
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (risk_level) {
    conditions.push(`fs.risk_level = $${paramIdx++}`);
    params.push(risk_level);
  }
  if (employee_id) {
    conditions.push(`fs.employee_id = $${paramIdx++}`);
    params.push(parseInt(employee_id));
  }
  if (location_id) {
    conditions.push(`fs.location_id = $${paramIdx++}`);
    params.push(parseInt(location_id));
  }
  if (action_taken) {
    conditions.push(`fs.action_taken = $${paramIdx++}`);
    params.push(action_taken);
  }
  if (min_score) {
    conditions.push(`fs.score >= $${paramIdx++}`);
    params.push(parseInt(min_score));
  }
  if (date_from) {
    conditions.push(`fs.created_at >= $${paramIdx++}`);
    params.push(date_from);
  }
  if (date_to) {
    conditions.push(`fs.created_at <= $${paramIdx++}`);
    params.push(date_to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const countResult = await fraudService.pool.query(
    `SELECT COUNT(*) FROM fraud_scores fs ${whereClause}`, params
  );
  const total = parseInt(countResult.rows[0].count);

  const dataParams = [...params, parseInt(limit), offset];
  const { rows } = await fraudService.pool.query(`
    SELECT fs.*,
           u.first_name || ' ' || u.last_name AS employee_name
    FROM fraud_scores fs
    LEFT JOIN users u ON u.id = fs.employee_id
    ${whereClause}
    ORDER BY fs.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `, dataParams);

  res.json({ success: true, data: { rows, total, page: parseInt(page), limit: parseInt(limit) } });
}));

router.get('/scores/unreviewed-count', authenticate, requirePermission('fraud.alerts.view'), asyncHandler(async (req, res) => {
  const { rows } = await fraudService.pool.query(
    `SELECT COUNT(*) FROM fraud_scores WHERE reviewed_by IS NULL AND score >= 30`
  );
  res.json({ success: true, data: { count: parseInt(rows[0].count) } });
}));

router.get('/scores/:id', authenticate, requirePermission('fraud.alerts.view'), asyncHandler(async (req, res) => {
  const { rows } = await fraudService.pool.query(`
    SELECT fs.*,
           u.first_name || ' ' || u.last_name AS employee_name,
           c.name AS customer_name,
           r.first_name || ' ' || r.last_name AS reviewer_name
    FROM fraud_scores fs
    LEFT JOIN users u ON u.id = fs.employee_id
    LEFT JOIN customers c ON c.id = fs.customer_id
    LEFT JOIN users r ON r.id = fs.reviewed_by
    WHERE fs.id = $1
  `, [parseInt(req.params.id)]);

  if (!rows[0]) throw ApiError.notFound('Fraud score');
  res.json({ success: true, data: rows[0] });
}));

router.put('/scores/:id/review', authenticate, requirePermission('fraud.alerts.review'), asyncHandler(async (req, res) => {
  const { review_notes } = req.body;
  const { rows } = await fraudService.pool.query(`
    UPDATE fraud_scores
    SET reviewed_by = $1, reviewed_at = NOW(), review_notes = $2, updated_at = NOW()
    WHERE id = $3
    RETURNING *
  `, [req.user.id, review_notes || '', parseInt(req.params.id)]);

  if (!rows[0]) throw ApiError.notFound('Fraud score');

  await fraudService.logAuditEntry(req.user.id, 'fraud.score.review', 'fraud_score', parseInt(req.params.id), {
    review_notes
  }, req);

  res.json({ success: true, data: rows[0] });
}));

// ============================================================================
// TRANSACTION REVIEW QUEUE — fraud_scores-based review workflow
// ============================================================================

/**
 * GET /api/fraud/transactions
 * Paginated, filterable list of fraud_scores needing review.
 * Defaults to unreviewed flagged/held/escalated transactions.
 */
router.get('/transactions', authenticate, requirePermission('fraud.alerts.review'), asyncHandler(async (req, res) => {
  const {
    risk_level, employee_id, location_id, entry_method,
    min_score, date_from, date_to,
    search, // card_last_four, customer name, or transaction_id
    status = 'pending', // pending | reviewed | all
    sort_by = 'score', sort_dir = 'DESC',
    page = 1, limit = 25,
  } = req.query;

  const conditions = [];
  const params = [];
  let idx = 1;

  // Default: show unreviewed flagged/held/escalated
  if (status === 'pending') {
    conditions.push(`fs.reviewed_by IS NULL`);
    conditions.push(`fs.action_taken IN ('flagged', 'held', 'escalated')`);
  } else if (status === 'reviewed') {
    conditions.push(`fs.reviewed_by IS NOT NULL`);
  }
  // 'all' — no status filter

  if (risk_level) { conditions.push(`fs.risk_level = $${idx++}`); params.push(risk_level); }
  if (employee_id) { conditions.push(`fs.employee_id = $${idx++}`); params.push(parseInt(employee_id)); }
  if (location_id) { conditions.push(`fs.location_id = $${idx++}`); params.push(parseInt(location_id)); }
  if (entry_method) { conditions.push(`fs.entry_method = $${idx++}`); params.push(entry_method); }
  if (min_score) { conditions.push(`fs.score >= $${idx++}`); params.push(parseInt(min_score)); }
  if (date_from) { conditions.push(`fs.created_at >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`fs.created_at <= $${idx++}`); params.push(date_to); }

  if (search) {
    const searchTerm = search.trim();
    // Search by card_last_four, transaction_id, or customer name
    conditions.push(`(
      fs.card_last_four = $${idx}
      OR fs.transaction_id::text = $${idx}
      OR LOWER(c.name) LIKE LOWER('%' || $${idx} || '%')
    )`);
    params.push(searchTerm);
    idx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Validate sort column to prevent SQL injection
  const allowedSorts = ['score', 'amount', 'created_at', 'risk_level', 'entry_method', 'terminal_id', 'employee_name'];
  const sortCol = allowedSorts.includes(sort_by) ? sort_by : 'score';
  const sortDirection = sort_dir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const orderBy = sortCol === 'employee_name'
    ? `ORDER BY u.first_name ${sortDirection}, u.last_name ${sortDirection}`
    : `ORDER BY fs.${sortCol} ${sortDirection}`;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Count query
  const countResult = await fraudService.pool.query(`
    SELECT COUNT(*) FROM fraud_scores fs
    LEFT JOIN customers c ON c.id = fs.customer_id
    ${whereClause}
  `, params);
  const total = parseInt(countResult.rows[0].count);

  // Data query with employee + customer + reviewer names
  const dataParams = [...params, parseInt(limit), offset];
  const { rows } = await fraudService.pool.query(`
    SELECT fs.*,
           u.first_name || ' ' || u.last_name AS employee_name,
           c.name AS customer_name,
           r.first_name || ' ' || r.last_name AS reviewer_name
    FROM fraud_scores fs
    LEFT JOIN users u ON u.id = fs.employee_id
    LEFT JOIN customers c ON c.id = fs.customer_id
    LEFT JOIN users r ON r.id = fs.reviewed_by
    ${whereClause}
    ${orderBy}
    LIMIT $${idx++} OFFSET $${idx++}
  `, dataParams);

  res.json({ success: true, data: { rows, total, page: parseInt(page), limit: parseInt(limit) } });
}));

/**
 * GET /api/fraud/transactions/stats
 * Summary stats for the review queue header bar.
 */
router.get('/transactions/stats', authenticate, requirePermission('fraud.alerts.review'), asyncHandler(async (req, res) => {
  const { rows } = await fraudService.pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE reviewed_by IS NULL AND action_taken IN ('flagged','held','escalated')) AS total_pending,
      COUNT(*) FILTER (WHERE reviewed_by IS NULL AND risk_level = 'critical') AS critical_count,
      COUNT(*) FILTER (WHERE reviewed_by IS NULL AND risk_level = 'high') AS high_count,
      COUNT(*) FILTER (WHERE reviewed_by IS NULL AND risk_level = 'medium') AS medium_count,
      COUNT(*) FILTER (WHERE reviewed_by IS NULL AND risk_level = 'low') AS low_count,
      ROUND(EXTRACT(EPOCH FROM AVG(
        CASE WHEN reviewed_at IS NOT NULL THEN reviewed_at - created_at END
      )) / 60) AS avg_review_minutes,
      MIN(created_at) FILTER (WHERE reviewed_by IS NULL AND action_taken IN ('flagged','held','escalated')) AS oldest_unreviewed
    FROM fraud_scores
  `);

  const stats = rows[0];
  res.json({
    success: true,
    data: {
      total_pending: parseInt(stats.total_pending) || 0,
      by_risk_level: {
        critical: parseInt(stats.critical_count) || 0,
        high: parseInt(stats.high_count) || 0,
        medium: parseInt(stats.medium_count) || 0,
        low: parseInt(stats.low_count) || 0,
      },
      avg_review_minutes: parseInt(stats.avg_review_minutes) || 0,
      oldest_unreviewed: stats.oldest_unreviewed || null,
    },
  });
}));

/**
 * GET /api/fraud/transactions/:id
 * Full transaction detail with signals, customer info, employee info, timeline.
 */
router.get('/transactions/:id', authenticate, requirePermission('fraud.alerts.review'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);

  // Fraud score + related names
  const { rows } = await fraudService.pool.query(`
    SELECT fs.*,
           u.first_name || ' ' || u.last_name AS employee_name,
           u.email AS employee_email,
           u.role AS employee_role,
           c.name AS customer_name,
           c.email AS customer_email,
           c.phone AS customer_phone,
           r.first_name || ' ' || r.last_name AS reviewer_name
    FROM fraud_scores fs
    LEFT JOIN users u ON u.id = fs.employee_id
    LEFT JOIN customers c ON c.id = fs.customer_id
    LEFT JOIN users r ON r.id = fs.reviewed_by
    WHERE fs.id = $1
  `, [id]);

  if (!rows[0]) throw ApiError.notFound('Fraud transaction');
  const record = rows[0];

  // Customer stats (total transactions, chargebacks, total spend)
  let customerStats = null;
  if (record.customer_id) {
    const csResult = await fraudService.pool.query(`
      SELECT
        COUNT(t.transaction_id) AS total_transactions,
        COALESCE(SUM(t.total_amount), 0) AS total_spend,
        (SELECT COUNT(*) FROM chargeback_cases cc WHERE cc.customer_id = $1) AS chargeback_count
      FROM transactions t
      WHERE t.customer_id = $1
    `, [record.customer_id]);
    customerStats = csResult.rows[0] || null;
  }

  // Employee risk profile
  let employeeProfile = null;
  if (record.employee_id) {
    const epResult = await fraudService.pool.query(`
      SELECT risk_level, risk_score, void_rate, refund_rate, discount_rate,
             void_rate_zscore, refund_rate_zscore, discount_rate_zscore,
             total_alerts, total_incidents
      FROM employee_risk_profiles
      WHERE user_id = $1
    `, [record.employee_id]);
    employeeProfile = epResult.rows[0] || null;
  }

  // Audit trail for this fraud score
  let timeline = [];
  try {
    const tlResult = await fraudService.pool.query(`
      SELECT action, user_id, details, created_at,
             u.first_name || ' ' || u.last_name AS actor_name
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.entity_type = 'fraud_score' AND al.entity_id = $1
      ORDER BY al.created_at ASC
      LIMIT 50
    `, [id]);
    timeline = tlResult.rows;
  } catch (_) { /* audit_log may lack entity_type/entity_id columns */ }

  res.json({
    success: true,
    data: {
      ...record,
      customerStats,
      employeeProfile,
      timeline,
    },
  });
}));

/**
 * PUT /api/fraud/transactions/:id/review
 * Submit a review decision: approve, confirm_fraud, escalate, add_note.
 */
router.put('/transactions/:id/review', authenticate, requirePermission('fraud.alerts.review'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const { decision, notes } = req.body;

  const validDecisions = ['approve', 'confirm_fraud', 'escalate', 'add_note'];
  if (!decision || !validDecisions.includes(decision)) {
    throw ApiError.badRequest(`Invalid decision. Must be one of: ${validDecisions.join(', ')}`);
  }

  // Map decision to action_taken value
  const actionMap = {
    approve: 'approved',
    confirm_fraud: 'confirmed_fraud',
    escalate: 'escalated',
    add_note: null, // don't change action_taken, just add note
  };
  const newAction = actionMap[decision];

  let updateQuery, updateParams;
  if (decision === 'add_note') {
    // Only update review_notes, don't mark as reviewed
    updateQuery = `
      UPDATE fraud_scores
      SET review_notes = COALESCE(review_notes || E'\\n', '') || $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    updateParams = [`[${new Date().toISOString()}] ${req.user.id}: ${notes || ''}`, id];
  } else {
    updateQuery = `
      UPDATE fraud_scores
      SET action_taken = $1,
          reviewed_by = $2,
          reviewed_at = NOW(),
          review_notes = COALESCE(review_notes || E'\\n', '') || $3,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;
    updateParams = [newAction, req.user.id, `[${new Date().toISOString()}] ${decision}: ${notes || ''}`, id];
  }

  const { rows } = await fraudService.pool.query(updateQuery, updateParams);
  if (!rows[0]) throw ApiError.notFound('Fraud transaction');

  // Audit log
  await fraudService.logAuditEntry(req.user.id, `fraud.transaction.${decision}`, 'fraud_score', id, {
    decision,
    notes,
    previous_action: rows[0].action_taken,
  }, req);

  // If confirmed fraud, auto-create incident if not exists
  if (decision === 'confirm_fraud' && rows[0].transaction_id) {
    try {
      // Check for existing code10 or manual rule
      const ruleResult = await fraudService.pool.query(
        "SELECT * FROM fraud_rules WHERE rule_code = 'manual_code10' AND is_active = true"
      );
      if (ruleResult.rows[0]) {
        await fraudService.createAlert({
          riskScore: rows[0].score,
          triggeredRules: [{ triggered: true, rule: ruleResult.rows[0], details: { confirmed_from_review_queue: true } }],
          action: 'alert',
          alertType: 'confirmed_fraud',
          severity: 'critical',
        }, {
          userId: rows[0].employee_id,
          transactionId: rows[0].transaction_id,
        });
      }
    } catch (_) { /* Alert creation is best-effort */ }
  }

  res.json({ success: true, data: rows[0] });
}));

/**
 * PUT /api/fraud/transactions/batch-review
 * Batch review multiple fraud_scores records.
 */
router.put('/transactions/batch-review', authenticate, requirePermission('fraud.alerts.review'), asyncHandler(async (req, res) => {
  const { ids, decision, notes } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw ApiError.badRequest('ids must be a non-empty array');
  }
  if (ids.length > 100) {
    throw ApiError.badRequest('Maximum 100 records per batch');
  }

  const validDecisions = ['approve', 'confirm_fraud', 'escalate'];
  if (!decision || !validDecisions.includes(decision)) {
    throw ApiError.badRequest(`Invalid decision. Must be one of: ${validDecisions.join(', ')}`);
  }

  const actionMap = { approve: 'approved', confirm_fraud: 'confirmed_fraud', escalate: 'escalated' };
  const newAction = actionMap[decision];

  const noteText = `[${new Date().toISOString()}] batch_${decision}: ${notes || ''}`;

  const { rows } = await fraudService.pool.query(`
    UPDATE fraud_scores
    SET action_taken = $1,
        reviewed_by = $2,
        reviewed_at = NOW(),
        review_notes = COALESCE(review_notes || E'\\n', '') || $3,
        updated_at = NOW()
    WHERE id = ANY($4::bigint[])
    RETURNING id
  `, [newAction, req.user.id, noteText, ids.map(Number)]);

  // Audit log for batch
  await fraudService.logAuditEntry(req.user.id, 'fraud.transaction.batch_review', 'fraud_score', null, {
    decision,
    notes,
    ids: ids.map(Number),
    updated_count: rows.length,
  }, req);

  res.json({
    success: true,
    data: { updated: rows.length, total_requested: ids.length },
  });
}));

// ============================================================================
// EMPLOYEE MONITORING — Behavioral analysis endpoints
// ============================================================================

/**
 * GET /api/fraud/employees
 * List all employees with current risk profiles.
 * Sortable by risk_score, filterable by location_id and risk_level.
 */
router.get('/employees', authenticate, requirePermission('fraud.employee_metrics.view'), asyncHandler(async (req, res) => {
  if (!employeeMonitorService) throw ApiError.badRequest('Employee monitor service not available');
  const { risk_level, location_id, min_score, page, limit, sort_by, sort_dir } = req.query;
  const result = await employeeMonitorService.getAllProfiles(
    { risk_level, location_id, min_score },
    { page, limit, sort_by, sort_dir }
  );
  res.json({ success: true, data: result });
}));

/**
 * GET /api/fraud/employees/:id
 * Detailed employee fraud metrics with 30-day trend data,
 * peer comparison, and flagged patterns.
 */
router.get('/employees/:id', authenticate, requirePermission('fraud.employee_metrics.view'), asyncHandler(async (req, res) => {
  if (!employeeMonitorService) throw ApiError.badRequest('Employee monitor service not available');
  const profile = await employeeMonitorService.getProfile(parseInt(req.params.id));
  if (!profile) throw ApiError.notFound('Employee profile');
  res.json({ success: true, data: profile });
}));

/**
 * GET /api/fraud/employees/:id/transactions
 * Employee's transactions with fraud scores.
 * Filterable by type: voids, refunds, discounts, or all (default).
 */
router.get('/employees/:id/transactions', authenticate, requirePermission('fraud.employee_metrics.view'), asyncHandler(async (req, res) => {
  if (!employeeMonitorService) throw ApiError.badRequest('Employee monitor service not available');
  const { type, page, limit } = req.query;
  const result = await employeeMonitorService.getEmployeeTransactions(
    parseInt(req.params.id),
    { type, page, limit }
  );
  res.json({ success: true, data: result });
}));

/**
 * POST /api/fraud/employees/refresh
 * Manual trigger for metrics refresh + pattern detection.
 * Admin/manager only.
 */
router.post('/employees/refresh', authenticate, requirePermission('fraud.rules.manage'), asyncHandler(async (req, res) => {
  if (!employeeMonitorService) throw ApiError.badRequest('Employee monitor service not available');
  const result = await employeeMonitorService.refreshMetrics();
  res.json({ success: true, message: 'Employee metrics refreshed', data: result });
}));

// ============================================================================
// LEGACY EMPLOYEE MONITOR ENDPOINTS (backward compatibility)
// ============================================================================

router.get('/employee-monitor/profiles', authenticate, requirePermission('fraud.employee_metrics.view'), asyncHandler(async (req, res) => {
  if (!employeeMonitorService) throw ApiError.badRequest('Employee monitor service not available');
  const { risk_level, min_score, page, limit, sort_by, sort_dir } = req.query;
  const result = await employeeMonitorService.getAllProfiles(
    { risk_level, min_score },
    { page, limit, sort_by, sort_dir }
  );
  res.json({ success: true, data: result });
}));

router.get('/employee-monitor/profiles/:userId', authenticate, requirePermission('fraud.employee_metrics.view'), asyncHandler(async (req, res) => {
  if (!employeeMonitorService) throw ApiError.badRequest('Employee monitor service not available');
  const profile = await employeeMonitorService.getProfile(parseInt(req.params.userId));
  if (!profile) throw ApiError.notFound('Employee profile');
  res.json({ success: true, data: profile });
}));

router.post('/employee-monitor/refresh', authenticate, requirePermission('fraud.rules.manage'), asyncHandler(async (req, res) => {
  if (!employeeMonitorService) throw ApiError.badRequest('Employee monitor service not available');
  const result = await employeeMonitorService.refreshMetrics();
  res.json({ success: true, message: 'Employee profiles refreshed', data: result });
}));

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * GET /api/fraud/analytics
 * Comprehensive analytics with PostgreSQL aggregation. Cached for 15 minutes.
 * Query: date_from, date_to, location_id, preset (today|week|month|30d)
 */
router.get('/analytics', authenticate, requirePermission('fraud.alerts.view'), asyncHandler(async (req, res) => {
  const pool = fraudService.pool;
  let { date_from, date_to, location_id, preset } = req.query;

  // Resolve preset date ranges
  const now = new Date();
  if (preset === 'today') {
    date_from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    date_to = now.toISOString();
  } else if (preset === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - d.getDay());
    date_from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    date_to = now.toISOString();
  } else if (preset === 'month') {
    date_from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    date_to = now.toISOString();
  } else if (!date_from) {
    // Default: last 30 days
    const d = new Date(now); d.setDate(d.getDate() - 30);
    date_from = d.toISOString();
    date_to = now.toISOString();
  }

  if (!date_to) date_to = now.toISOString();

  // Cache key
  const cacheKey = `fraud:analytics:${date_from}:${date_to}:${location_id || 'all'}`;
  if (cache) {
    const cached = cache.get('medium', cacheKey);
    if (cached) return res.json({ success: true, data: cached, cached: true });
  }

  const params = [date_from, date_to];
  let locFilter = '';
  if (location_id) {
    params.push(parseInt(location_id));
    locFilter = ` AND fs.location_id = $${params.length}`;
  }

  // ---------------------------------------------------------------------------
  // 1) KPI Summary — current period + previous period for % change
  // ---------------------------------------------------------------------------
  const kpiQuery = `
    WITH current_period AS (
      SELECT
        COUNT(*)::int AS total_scanned,
        COUNT(*) FILTER (WHERE action_taken IN ('flagged','held','escalated'))::int AS flagged,
        COUNT(*) FILTER (WHERE action_taken IN ('declined','confirmed_fraud'))::int AS declined,
        COALESCE(SUM(amount) FILTER (WHERE action_taken IN ('declined','confirmed_fraud') AND score >= 60), 0)::numeric AS fraud_prevented
      FROM fraud_scores fs
      WHERE fs.created_at >= $1 AND fs.created_at <= $2 ${locFilter}
    ),
    prev_period AS (
      SELECT COUNT(*)::int AS prev_total
      FROM fraud_scores fs
      WHERE fs.created_at >= ($1::timestamptz - ($2::timestamptz - $1::timestamptz))
        AND fs.created_at < $1 ${locFilter}
    )
    SELECT cp.*, pp.prev_total FROM current_period cp, prev_period pp
  `;

  // ---------------------------------------------------------------------------
  // 2) Score Distribution — histogram buckets of 10
  // ---------------------------------------------------------------------------
  const distQuery = `
    SELECT
      (score / 10) * 10 AS bucket_start,
      (score / 10) * 10 + 9 AS bucket_end,
      COUNT(*)::int AS count,
      CASE
        WHEN score < 30 THEN 'low'
        WHEN score < 60 THEN 'medium'
        WHEN score < 80 THEN 'high'
        ELSE 'critical'
      END AS risk_band
    FROM fraud_scores fs
    WHERE fs.created_at >= $1 AND fs.created_at <= $2 ${locFilter}
    GROUP BY (score / 10), risk_band
    ORDER BY bucket_start
  `;

  // ---------------------------------------------------------------------------
  // 3) Timeline — daily counts by risk level
  // ---------------------------------------------------------------------------
  const timelineQuery = `
    SELECT
      DATE(fs.created_at) AS date,
      COUNT(*) FILTER (WHERE risk_level = 'low')::int AS low,
      COUNT(*) FILTER (WHERE risk_level = 'medium')::int AS medium,
      COUNT(*) FILTER (WHERE risk_level = 'high')::int AS high,
      COUNT(*) FILTER (WHERE risk_level = 'critical')::int AS critical,
      COUNT(*) FILTER (WHERE action_taken IN ('flagged','held','escalated','declined','confirmed_fraud'))::int AS flagged_total
    FROM fraud_scores fs
    WHERE fs.created_at >= $1 AND fs.created_at <= $2 ${locFilter}
    GROUP BY DATE(fs.created_at)
    ORDER BY date
  `;

  // ---------------------------------------------------------------------------
  // 4) Entry Method Breakdown
  // ---------------------------------------------------------------------------
  const entryQuery = `
    SELECT
      COALESCE(entry_method, 'unknown') AS method,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE action_taken IN ('flagged','held','escalated','declined','confirmed_fraud'))::int AS flagged,
      ROUND(COUNT(*) FILTER (WHERE action_taken IN ('flagged','held','escalated','declined','confirmed_fraud'))::numeric
            / NULLIF(COUNT(*), 0) * 100, 1) AS flag_rate
    FROM fraud_scores fs
    WHERE fs.created_at >= $1 AND fs.created_at <= $2 ${locFilter}
    GROUP BY COALESCE(entry_method, 'unknown')
    ORDER BY flagged DESC
  `;

  // ---------------------------------------------------------------------------
  // 5) Card Brand Analysis — flag rate per 1000 transactions
  // ---------------------------------------------------------------------------
  const brandQuery = `
    SELECT
      COALESCE(card_brand, 'unknown') AS brand,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE action_taken IN ('flagged','held','escalated','declined','confirmed_fraud'))::int AS flagged,
      ROUND(COUNT(*) FILTER (WHERE action_taken IN ('flagged','held','escalated','declined','confirmed_fraud'))::numeric
            / NULLIF(COUNT(*), 0) * 1000, 1) AS flags_per_1000
    FROM fraud_scores fs
    WHERE fs.created_at >= $1 AND fs.created_at <= $2 ${locFilter}
    GROUP BY COALESCE(card_brand, 'unknown')
    HAVING COUNT(*) >= 5
    ORDER BY flags_per_1000 DESC
  `;

  // ---------------------------------------------------------------------------
  // 6) Top Triggered Signals — from signals JSONB
  // ---------------------------------------------------------------------------
  const signalsQuery = `
    SELECT
      key AS signal_name,
      COUNT(*)::int AS trigger_count,
      ROUND(AVG(fs.score), 1) AS avg_score
    FROM fraud_scores fs,
         LATERAL jsonb_each(fs.signals) AS s(key, value)
    WHERE fs.created_at >= $1 AND fs.created_at <= $2 ${locFilter}
      AND s.value::text NOT IN ('0', 'false', 'null', '""', '0.0')
    GROUP BY key
    ORDER BY trigger_count DESC
    LIMIT 15
  `;

  // ---------------------------------------------------------------------------
  // 7) Time-of-Day Heatmap — day_of_week × hour
  // ---------------------------------------------------------------------------
  const heatmapQuery = `
    SELECT
      EXTRACT(DOW FROM fs.created_at)::int AS day_of_week,
      EXTRACT(HOUR FROM fs.created_at)::int AS hour,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE action_taken IN ('flagged','held','escalated','declined','confirmed_fraud'))::int AS flagged
    FROM fraud_scores fs
    WHERE fs.created_at >= $1 AND fs.created_at <= $2 ${locFilter}
    GROUP BY EXTRACT(DOW FROM fs.created_at), EXTRACT(HOUR FROM fs.created_at)
    ORDER BY day_of_week, hour
  `;

  // ---------------------------------------------------------------------------
  // 8) Location Comparison
  // ---------------------------------------------------------------------------
  const locationQuery = `
    SELECT
      fs.location_id,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE action_taken IN ('flagged','held','escalated','declined','confirmed_fraud'))::int AS flagged,
      ROUND(AVG(fs.score), 1) AS avg_score,
      ROUND(COUNT(*) FILTER (WHERE action_taken IN ('flagged','held','escalated','declined','confirmed_fraud'))::numeric
            / NULLIF(COUNT(*), 0) * 1000, 1) AS flags_per_1000
    FROM fraud_scores fs
    WHERE fs.created_at >= $1 AND fs.created_at <= $2
      AND fs.location_id IS NOT NULL
    GROUP BY fs.location_id
    HAVING COUNT(*) >= 5
    ORDER BY flags_per_1000 DESC
  `;

  // ---------------------------------------------------------------------------
  // 9) Employee Leaderboard — top 10 by flagged transaction involvement
  // ---------------------------------------------------------------------------
  const employeeQuery = `
    SELECT
      fs.employee_id,
      u.first_name || ' ' || u.last_name AS employee_name,
      COUNT(*)::int AS total_scanned,
      COUNT(*) FILTER (WHERE fs.action_taken IN ('flagged','held','escalated','declined','confirmed_fraud'))::int AS flagged,
      ROUND(AVG(fs.score), 1) AS avg_score,
      COALESCE(SUM(fs.amount) FILTER (WHERE fs.action_taken IN ('flagged','held','escalated','declined','confirmed_fraud')), 0)::numeric AS flagged_amount
    FROM fraud_scores fs
    LEFT JOIN users u ON fs.employee_id = u.id
    WHERE fs.created_at >= $1 AND fs.created_at <= $2 ${locFilter}
      AND fs.employee_id IS NOT NULL
    GROUP BY fs.employee_id, u.first_name, u.last_name
    ORDER BY flagged DESC
    LIMIT 10
  `;

  // ---------------------------------------------------------------------------
  // 10) Chargeback Metrics
  // ---------------------------------------------------------------------------
  const chargebackQuery = `
    SELECT
      COUNT(*)::int AS total_chargebacks,
      COUNT(*) FILTER (WHERE status = 'won')::int AS won,
      COUNT(*) FILTER (WHERE status = 'lost')::int AS lost,
      COUNT(*) FILTER (WHERE status IN ('received','responding'))::int AS pending,
      COALESCE(SUM(amount), 0)::numeric AS total_amount,
      COALESCE(SUM(amount) FILTER (WHERE status = 'lost'), 0)::numeric AS lost_amount,
      ROUND(COUNT(*) FILTER (WHERE status = 'won')::numeric
            / NULLIF(COUNT(*) FILTER (WHERE status IN ('won','lost')), 0) * 100, 1) AS win_rate
    FROM chargeback_cases
    WHERE created_at >= $1 AND created_at <= $2
  `;

  const chargebackReasonsQuery = `
    SELECT
      COALESCE(reason_code, 'unknown') AS reason_code,
      COALESCE(reason_description, reason_code, 'Unknown') AS description,
      COUNT(*)::int AS count,
      COALESCE(SUM(amount), 0)::numeric AS total_amount
    FROM chargeback_cases
    WHERE created_at >= $1 AND created_at <= $2
    GROUP BY reason_code, reason_description
    ORDER BY count DESC
    LIMIT 10
  `;

  // Execute all queries in parallel
  const [
    kpiResult, distResult, timelineResult, entryResult, brandResult,
    signalsResult, heatmapResult, locationResult, employeeResult,
    chargebackResult, cbReasonsResult,
  ] = await Promise.all([
    pool.query(kpiQuery, params),
    pool.query(distQuery, params),
    pool.query(timelineQuery, params),
    pool.query(entryQuery, params),
    pool.query(brandQuery, params),
    pool.query(signalsQuery, params),
    pool.query(heatmapQuery, params),
    pool.query(locationQuery, [date_from, date_to]),
    pool.query(employeeQuery, params),
    pool.query(chargebackQuery, [date_from, date_to]).catch(() => ({ rows: [{}] })),
    pool.query(chargebackReasonsQuery, [date_from, date_to]).catch(() => ({ rows: [] })),
  ]);

  const kpi = kpiResult.rows[0] || {};
  const pctChange = kpi.prev_total > 0
    ? Math.round(((kpi.total_scanned - kpi.prev_total) / kpi.prev_total) * 100)
    : null;

  const result = {
    date_from,
    date_to,
    kpi: {
      total_scanned: parseInt(kpi.total_scanned) || 0,
      total_scanned_pct_change: pctChange,
      flagged: parseInt(kpi.flagged) || 0,
      flagged_pct: kpi.total_scanned > 0 ? Math.round((kpi.flagged / kpi.total_scanned) * 1000) / 10 : 0,
      declined: parseInt(kpi.declined) || 0,
      declined_pct: kpi.total_scanned > 0 ? Math.round((kpi.declined / kpi.total_scanned) * 1000) / 10 : 0,
      fraud_prevented: parseFloat(kpi.fraud_prevented) || 0,
    },
    score_distribution: distResult.rows,
    timeline: timelineResult.rows,
    entry_methods: entryResult.rows,
    card_brands: brandResult.rows,
    top_signals: signalsResult.rows,
    heatmap: heatmapResult.rows,
    locations: locationResult.rows,
    employee_leaderboard: employeeResult.rows,
    chargebacks: {
      ...chargebackResult.rows[0],
      reason_codes: cbReasonsResult.rows,
    },
  };

  // Cache for 15 minutes
  if (cache) {
    cache.set('medium', cacheKey, result, 900);
  }

  res.json({ success: true, data: result });
}));

/**
 * GET /api/fraud/analytics/export
 * CSV export of fraud analytics data
 */
router.get('/analytics/export', authenticate, requirePermission('fraud.alerts.view'), asyncHandler(async (req, res) => {
  const pool = fraudService.pool;
  let { date_from, date_to, location_id } = req.query;

  if (!date_from) {
    const d = new Date(); d.setDate(d.getDate() - 30);
    date_from = d.toISOString();
  }
  if (!date_to) date_to = new Date().toISOString();

  const params = [date_from, date_to];
  let locFilter = '';
  if (location_id) {
    params.push(parseInt(location_id));
    locFilter = ` AND fs.location_id = $${params.length}`;
  }

  const { rows } = await pool.query(`
    SELECT
      fs.id, fs.transaction_id, fs.score, fs.risk_level, fs.action_taken,
      fs.card_brand, fs.entry_method, fs.amount, fs.location_id,
      fs.employee_id, u.first_name || ' ' || u.last_name AS employee_name,
      fs.created_at
    FROM fraud_scores fs
    LEFT JOIN users u ON fs.employee_id = u.id
    WHERE fs.created_at >= $1 AND fs.created_at <= $2 ${locFilter}
    ORDER BY fs.created_at DESC
    LIMIT 10000
  `, params);

  const headers = ['ID', 'Transaction ID', 'Score', 'Risk Level', 'Action', 'Card Brand',
                    'Entry Method', 'Amount', 'Location', 'Employee ID', 'Employee', 'Date'];
  const csvLines = [headers.join(',')];
  for (const r of rows) {
    csvLines.push([
      r.id, r.transaction_id, r.score, r.risk_level, r.action_taken,
      r.card_brand || '', r.entry_method || '', r.amount || '', r.location_id || '',
      r.employee_id || '', `"${(r.employee_name || '').replace(/"/g, '""')}"`,
      r.created_at ? new Date(r.created_at).toISOString() : '',
    ].join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fraud_analytics_${date_from.slice(0,10)}_${date_to.slice(0,10)}.csv"`);
  res.send(csvLines.join('\n'));
}));

// ============================================================================
// ML — TRAINING DATA EXPORT
// ============================================================================

router.post('/ml/export', authenticate, requirePermission('fraud.alerts.manage'), asyncHandler(async (req, res) => {
  if (!fraudMLDataService) {
    throw ApiError.badRequest('ML data service not configured');
  }

  const { start_date, end_date, format } = req.body;
  if (!start_date || !end_date) {
    throw ApiError.badRequest('start_date and end_date are required');
  }

  const validFormats = ['csv', 'json'];
  const exportFormat = validFormats.includes(format) ? format : 'csv';

  const metadata = await fraudMLDataService.exportTrainingData(start_date, end_date, exportFormat);
  res.json({ success: true, data: metadata });
}));

router.get('/ml/exports', authenticate, requirePermission('fraud.alerts.manage'), asyncHandler(async (req, res) => {
  if (!fraudMLDataService) {
    throw ApiError.badRequest('ML data service not configured');
  }

  const exports = fraudMLDataService.listExports();
  res.json({ success: true, data: exports });
}));

// ============================================================================
// ML — A/B PERFORMANCE COMPARISON
// ============================================================================

router.get('/ml/performance', authenticate, requirePermission('fraud.alerts.manage'), asyncHandler(async (req, res) => {
  const pool = fraudService.pool;
  const { period } = req.query; // week, month, quarter
  let intervalSql = '7 days';
  if (period === 'month') intervalSql = '30 days';
  if (period === 'quarter') intervalSql = '90 days';

  // Query fraud_scores for transactions that have both rule and ML scores
  const [overallResult, outcomeResult, distributionResult, weeklyResult] = await Promise.all([
    // Overall stats
    pool.query(`
      SELECT
        COUNT(*)::int AS total_scored,
        COUNT(*) FILTER (WHERE signals->'ml_scoring' IS NOT NULL)::int AS ml_scored,
        AVG(score)::numeric(5,1) AS avg_combined_score,
        AVG((signals->'ml_scoring'->>'ml_score')::numeric)::numeric(5,1) AS avg_ml_score,
        AVG(CASE WHEN signals->'ml_scoring'->>'ml_score' IS NULL
          THEN score ELSE score END)::numeric(5,1) AS avg_rule_score,
        COUNT(*) FILTER (WHERE action_taken = 'declined')::int AS total_declined,
        COUNT(*) FILTER (WHERE action_taken = 'flagged')::int AS total_flagged,
        COUNT(*) FILTER (WHERE action_taken = 'approved')::int AS total_approved
      FROM fraud_scores
      WHERE created_at >= NOW() - $1::interval
    `, [intervalSql]),

    // Outcome comparison: which method caught more actual fraud?
    pool.query(`
      SELECT
        COUNT(*)::int AS total_with_chargeback,
        COUNT(*) FILTER (WHERE fs.score >= 61)::int AS rule_would_flag,
        COUNT(*) FILTER (WHERE (fs.signals->'ml_scoring'->>'ml_score')::numeric >= 61)::int AS ml_would_flag,
        COUNT(*) FILTER (WHERE (fs.signals->'ml_scoring'->>'combined_score')::numeric >= 61)::int AS combined_would_flag,
        AVG(fs.score)::numeric(5,1) AS avg_rule_score_fraud,
        AVG((fs.signals->'ml_scoring'->>'ml_score')::numeric)::numeric(5,1) AS avg_ml_score_fraud
      FROM fraud_scores fs
      JOIN chargeback_cases cb ON cb.transaction_id = fs.transaction_id
      WHERE fs.created_at >= NOW() - $1::interval
        AND cb.status IN ('lost', 'received', 'under_review')
    `, [intervalSql]),

    // False positive comparison
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE fs.score >= 61 AND fs.reviewed_by IS NOT NULL AND fs.review_notes IS NOT NULL)::int AS rule_flagged_reviewed,
        COUNT(*) FILTER (WHERE fs.score >= 61 AND fs.reviewed_by IS NOT NULL
          AND cb.id IS NULL AND fs.review_notes NOT ILIKE '%fraud%')::int AS rule_false_positives,
        COUNT(*) FILTER (WHERE (fs.signals->'ml_scoring'->>'ml_score')::numeric >= 61)::int AS ml_would_flag_total
      FROM fraud_scores fs
      LEFT JOIN chargeback_cases cb ON cb.transaction_id = fs.transaction_id
      WHERE fs.created_at >= NOW() - $1::interval
    `, [intervalSql]),

    // Weekly trend
    pool.query(`
      SELECT
        DATE_TRUNC('week', fs.created_at)::date AS week_start,
        COUNT(*)::int AS total,
        AVG(fs.score)::numeric(5,1) AS avg_rule_score,
        AVG((fs.signals->'ml_scoring'->>'ml_score')::numeric)::numeric(5,1) AS avg_ml_score,
        COUNT(*) FILTER (WHERE fs.action_taken IN ('flagged', 'declined', 'held'))::int AS flagged,
        COUNT(*) FILTER (WHERE cb.id IS NOT NULL)::int AS chargebacks
      FROM fraud_scores fs
      LEFT JOIN chargeback_cases cb ON cb.transaction_id = fs.transaction_id
      WHERE fs.created_at >= NOW() - '90 days'::interval
      GROUP BY DATE_TRUNC('week', fs.created_at)
      ORDER BY week_start DESC
      LIMIT 12
    `),
  ]);

  const overall = overallResult.rows[0];
  const outcome = outcomeResult.rows[0];
  const distribution = distributionResult.rows[0];

  // ML service status
  const mlStatus = mlScoringService ? mlScoringService.getStatus() : { enabled: false };

  // Feature store status
  let featureStatus = null;
  if (featureStoreService) {
    try {
      featureStatus = await featureStoreService.getStatus();
    } catch (_) { /* ignore */ }
  }

  res.json({
    success: true,
    data: {
      period: intervalSql,
      overall: {
        total_scored: overall.total_scored,
        ml_scored: overall.ml_scored,
        ml_coverage: overall.total_scored > 0
          ? Math.round((overall.ml_scored / overall.total_scored) * 100) : 0,
        avg_combined_score: parseFloat(overall.avg_combined_score || 0),
        avg_ml_score: parseFloat(overall.avg_ml_score || 0),
        avg_rule_score: parseFloat(overall.avg_rule_score || 0),
        declined: overall.total_declined,
        flagged: overall.total_flagged,
        approved: overall.total_approved,
      },
      fraud_detection: {
        total_chargebacks: outcome.total_with_chargeback,
        rule_would_catch: outcome.rule_would_flag,
        ml_would_catch: outcome.ml_would_flag,
        combined_would_catch: outcome.combined_would_flag,
        avg_rule_score_on_fraud: parseFloat(outcome.avg_rule_score_fraud || 0),
        avg_ml_score_on_fraud: parseFloat(outcome.avg_ml_score_fraud || 0),
      },
      false_positives: {
        rule_flagged_reviewed: distribution.rule_flagged_reviewed,
        rule_false_positives: distribution.rule_false_positives,
        ml_would_flag_total: distribution.ml_would_flag_total,
        rule_fp_rate: distribution.rule_flagged_reviewed > 0
          ? Math.round((distribution.rule_false_positives / distribution.rule_flagged_reviewed) * 1000) / 10
          : 0,
      },
      weekly_trend: weeklyResult.rows,
      ml_service: mlStatus,
      feature_store: featureStatus,
    },
  });
}));

// ============================================================================
// ML — FEATURE STORE STATUS
// ============================================================================

router.get('/ml/features/status', authenticate, requirePermission('fraud.alerts.manage'), asyncHandler(async (req, res) => {
  if (!featureStoreService) {
    throw ApiError.badRequest('Feature store service not configured');
  }

  const status = await featureStoreService.getStatus();
  res.json({ success: true, data: status });
}));

router.post('/ml/features/refresh', authenticate, requirePermission('fraud.alerts.manage'), asyncHandler(async (req, res) => {
  if (!featureStoreService) {
    throw ApiError.badRequest('Feature store service not configured');
  }

  const results = await featureStoreService.refreshViews();
  res.json({ success: true, data: results });
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  fraudService = deps.fraudService;
  employeeMonitorService = deps.employeeMonitorService || null;
  cache = deps.cache || null;
  fraudMLDataService = deps.fraudMLDataService || null;
  mlScoringService = deps.mlScoringService || null;
  featureStoreService = deps.featureStoreService || null;
  return router;
};

module.exports = { init };
