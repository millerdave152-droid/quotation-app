const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

let surveyService = null;

// Dashboard stats
router.get('/stats', authenticate, requirePermission('surveys.view'), asyncHandler(async (req, res) => {
  const stats = await surveyService.getDashboardStats();
  res.success(stats);
}));

// List templates
router.get('/templates', authenticate, requirePermission('surveys.view'), asyncHandler(async (req, res) => {
  const templates = await surveyService.listTemplates();
  res.success(templates);
}));

// Create template
router.post('/templates', authenticate, requirePermission('surveys.create'), asyncHandler(async (req, res) => {
  const template = await surveyService.createTemplate(req.body, req.user.userId);
  res.created(template);
}));

// Update template
router.put('/templates/:id', authenticate, requirePermission('surveys.edit'), asyncHandler(async (req, res) => {
  const template = await surveyService.updateTemplate(parseInt(req.params.id), req.body);
  res.success(template);
}));

// Get responses for template
router.get('/templates/:id/responses', authenticate, requirePermission('surveys.view'), asyncHandler(async (req, res) => {
  const { limit, offset } = req.query;
  const responses = await surveyService.getResponses(parseInt(req.params.id), {
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  });
  res.success(responses);
}));

// Queue survey
router.post('/queue', authenticate, requirePermission('surveys.send'), asyncHandler(async (req, res) => {
  const { templateId, customerId, transactionId, workOrderId } = req.body;
  const queued = await surveyService.queueSurvey(templateId, customerId, transactionId, workOrderId);
  res.created(queued);
}));

// PUBLIC: Respond to survey (no auth needed)
router.get('/respond/:token', asyncHandler(async (req, res) => {
  const { rows: [response] } = await surveyService.pool.query(
    `SELECT sr.*, st.name as template_name, st.questions, st.google_review_redirect_url
     FROM survey_responses sr JOIN survey_templates st ON st.id = sr.template_id
     WHERE sr.token = $1`, [req.params.token]
  );
  if (!response) throw new ApiError(404, 'Survey not found');
  res.json({ success: true, data: response });
}));

router.post('/respond/:token', asyncHandler(async (req, res) => {
  const result = await surveyService.respondToSurvey(req.params.token, req.body);
  res.json({ success: true, data: result });
}));

// Process pending surveys (internal/cron)
router.post('/process', authenticate, requirePermission('surveys.send'), asyncHandler(async (req, res) => {
  const processed = await surveyService.processPendingSurveys();
  res.success({ processed });
}));

const init = (deps) => {
  surveyService = deps.surveyService;
  return router;
};

module.exports = { init };
