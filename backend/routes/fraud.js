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

router.put('/rules/:id', authenticate, requirePermission('fraud.rules.manage'), asyncHandler(async (req, res) => {
  const rule = await fraudService.updateRule(parseInt(req.params.id), req.body);
  if (!rule) {
    throw ApiError.notFound('Rule not found or no changes');
  }

  await fraudService.logAuditEntry(req.user.id, 'fraud.rule.update', 'fraud_rule', parseInt(req.params.id), {
    updates: req.body
  }, req);

  res.json({ success: true, data: rule });
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  fraudService = deps.fraudService;
  return router;
};

module.exports = { init };
