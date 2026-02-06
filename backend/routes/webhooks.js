/**
 * Webhook Routes
 * API endpoints for managing webhook subscriptions and viewing delivery logs
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const WebhookService = require('../services/WebhookService');

let webhookService = null;

/**
 * Initialize the router with dependencies
 */
const init = (deps) => {
  webhookService = new WebhookService(deps.pool, deps.cache);
  return router;
};

// ============================================
// WEBHOOK MANAGEMENT
// ============================================

/**
 * GET /api/webhooks
 * Get all webhooks
 */
router.get('/', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const { active, event } = req.query;

  const webhooks = await webhookService.getWebhooks({
    active: active === 'true' ? true : active === 'false' ? false : undefined,
    event
  });

  // Hide secrets - with null check
  const safeWebhooks = webhooks.map(w => ({
    ...w,
    secret: w.secret ? '***' + w.secret.slice(-8) : '***[not set]'
  }));

  res.success(safeWebhooks);
}));

/**
 * GET /api/webhooks/events
 * Get list of supported webhook events
 */
router.get('/events', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  res.success({
    events: Object.values(WebhookService.EVENTS),
    eventsByCategory: {
      leads: [
        'lead.created',
        'lead.updated',
        'lead.converted',
        'lead.lost'
      ],
      quotes: [
        'quote.created',
        'quote.sent',
        'quote.won',
        'quote.lost'
      ],
      customers: [
        'customer.created',
        'customer.updated'
      ],
      tasks: [
        'task.created',
        'task.completed'
      ],
      payments: [
        'payment.received'
      ]
    }
  });
}));

/**
 * GET /api/webhooks/:id
 * Get webhook by ID
 */
router.get('/:id', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const webhook = await webhookService.getWebhookById(req.params.id);

  if (!webhook) {
    throw ApiError.notFound('Webhook');
  }

  // Hide full secret - with null check
  res.success({
    ...webhook,
    secret: webhook.secret ? '***' + webhook.secret.slice(-8) : '***[not set]'
  });
}));

/**
 * POST /api/webhooks
 * Create a new webhook
 */
router.post('/', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const { name, url, events, headers, is_active, retry_count } = req.body;

  if (!name || !url) {
    throw ApiError.validation('Name and URL are required');
  }

  if (!events || !Array.isArray(events) || events.length === 0) {
    throw ApiError.validation('At least one event must be specified');
  }

  const webhook = await webhookService.createWebhook({
    name,
    url,
    events,
    headers,
    is_active,
    retry_count
  }, req.user?.id);

  res.created({
    ...webhook,
    secret: webhook.secret // Return full secret on creation only
  });
}));

/**
 * PUT /api/webhooks/:id
 * Update a webhook
 */
router.put('/:id', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const { name, url, events, headers, is_active, retry_count } = req.body;

  const webhook = await webhookService.updateWebhook(req.params.id, {
    name,
    url,
    events,
    headers,
    is_active,
    retry_count
  });

  if (!webhook) {
    throw ApiError.notFound('Webhook');
  }

  res.success({
    ...webhook,
    secret: '***' + webhook.secret.slice(-8)
  });
}));

/**
 * DELETE /api/webhooks/:id
 * Delete a webhook
 */
router.delete('/:id', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const deleted = await webhookService.deleteWebhook(req.params.id);

  if (!deleted) {
    throw ApiError.notFound('Webhook');
  }

  res.success(null, { message: 'Webhook deleted successfully' });
}));

/**
 * POST /api/webhooks/:id/regenerate-secret
 * Regenerate webhook secret
 */
router.post('/:id/regenerate-secret', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const webhook = await webhookService.regenerateSecret(req.params.id);

  if (!webhook) {
    throw ApiError.notFound('Webhook');
  }

  res.success({
    id: webhook.id,
    name: webhook.name,
    secret: webhook.secret // Return new secret
  });
}));

/**
 * POST /api/webhooks/:id/test
 * Test webhook delivery
 */
router.post('/:id/test', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await webhookService.testWebhook(req.params.id);

  res.success({
    success: result.success,
    attempts: result.attempts,
    error: result.error,
    message: result.success
      ? 'Test webhook delivered successfully'
      : `Test delivery failed: ${result.error}`
  });
}));

// ============================================
// WEBHOOK LOGS
// ============================================

/**
 * GET /api/webhooks/:id/logs
 * Get delivery logs for a webhook
 */
router.get('/:id/logs', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, success } = req.query;

  const logs = await webhookService.getLogs(req.params.id, {
    limit: parseInt(limit),
    offset: parseInt(offset),
    success: success === 'true' ? true : success === 'false' ? false : undefined
  });

  res.success(logs);
}));

/**
 * GET /api/webhooks/:id/stats
 * Get webhook delivery statistics
 */
router.get('/:id/stats', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const stats = await webhookService.getStats(req.params.id);
  res.success(stats);
}));

// ============================================
// UTILITY ENDPOINTS
// ============================================

/**
 * POST /api/webhooks/cleanup-logs
 * Clean up old webhook logs (admin only)
 */
router.post('/cleanup-logs', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const { daysToKeep = 30 } = req.body;

  const deleted = await webhookService.cleanupLogs(parseInt(daysToKeep));

  res.success({
    message: `Cleaned up ${deleted} old log entries`,
    deleted
  });
}));

/**
 * Export webhook service for use in other modules
 */
const getService = () => webhookService;

module.exports = { router, init, getService };
