/**
 * Churn Alerts API Routes
 *
 * Endpoints for managing churn risk alerts and viewing alert history
 */

const express = require('express');
const router = express.Router();
const churnAlertService = require('../services/ChurnAlertService');
const churnAlertJob = require('../jobs/churnAlertJob');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/churn-alerts/high-risk
 * Get all customers with high churn risk
 */
router.get('/high-risk', authenticate, asyncHandler(async (req, res) => {
  const customers = await churnAlertService.getHighChurnRiskCustomers();

  res.json({
    success: true,
    count: customers.length,
    data: customers
  });
}));

/**
 * GET /api/churn-alerts
 * Get recent churn alerts
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { limit = 50, customerId, status } = req.query;

  const alerts = await churnAlertService.getRecentAlerts({
    limit: parseInt(limit),
    customerId: customerId ? parseInt(customerId) : null,
    status
  });

  res.json({
    success: true,
    count: alerts.length,
    data: alerts
  });
}));

/**
 * GET /api/churn-alerts/stats
 * Get churn alert statistics
 */
router.get('/stats', authenticate, asyncHandler(async (req, res) => {
  const stats = await churnAlertService.getAlertStats();

  res.json({
    success: true,
    data: stats
  });
}));

/**
 * POST /api/churn-alerts/send
 * Manually trigger churn alert emails
 */
router.post('/send', authenticate, asyncHandler(async (req, res) => {
  const { sendSummary = true, sendIndividual = false } = req.body;

  const results = await churnAlertService.sendChurnAlerts({
    sendSummary,
    sendIndividual
  });

  res.json({
    success: true,
    message: 'Churn alerts processed',
    data: results
  });
}));

/**
 * POST /api/churn-alerts/run-job
 * Manually run the churn alert job
 */
router.post('/run-job', authenticate, asyncHandler(async (req, res) => {
  const { sendIndividual = false } = req.body;

  const jobResult = await churnAlertJob.runJob({ sendIndividual });

  res.json({
    success: jobResult.status === 'completed',
    message: `Job ${jobResult.status}`,
    data: {
      startTime: jobResult.startTime,
      endTime: jobResult.endTime,
      durationMs: jobResult.duration,
      status: jobResult.status,
      results: jobResult.results,
      error: jobResult.error
    }
  });
}));

/**
 * GET /api/churn-alerts/job-history
 * Get job execution history
 */
router.get('/job-history', authenticate, asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;

  const history = await churnAlertJob.getJobHistory(parseInt(limit));

  res.json({
    success: true,
    count: history.length,
    data: history
  });
}));

/**
 * GET /api/churn-alerts/customer/:customerId
 * Get alerts for a specific customer
 */
router.get('/customer/:customerId', authenticate, asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.customerId);

  if (isNaN(customerId)) {
    throw ApiError.badRequest('Invalid customer ID');
  }

  const alerts = await churnAlertService.getRecentAlerts({
    customerId,
    limit: 50
  });

  res.json({
    success: true,
    count: alerts.length,
    data: alerts
  });
}));

module.exports = router;
