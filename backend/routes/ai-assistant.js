/**
 * AI Assistant API Routes
 * Endpoints for the customer support AI assistant
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const aiService = require('../services/ai');
const featureFlags = require('../services/ai/featureFlags');

/**
 * @route   POST /api/ai/chat
 * @desc    Send a message and get AI response
 * @access  Private
 */
router.post('/chat', authenticate, featureFlags.checkEnabled(), asyncHandler(async (req, res) => {
  const { message, conversationId } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw ApiError.badRequest('Message is required');
  }

  if (message.length > 4000) {
    throw ApiError.badRequest('Message exceeds maximum length of 4000 characters');
  }

  const result = await aiService.handleChat({
    conversationId: conversationId || null,
    userMessage: message.trim(),
    userId: req.user.id,
    locationId: req.user.location_id || null
  });

  res.json({
    success: true,
    data: {
      conversationId: result.conversationId,
      queryLogId: result.queryLogId,
      message: result.message,
      model: result.model,
      queryType: result.queryType,
      responseTimeMs: result.responseTimeMs,
      tokenUsage: {
        input: result.tokenUsage.input_tokens,
        output: result.tokenUsage.output_tokens
      }
    }
  });
}));

/**
 * @route   POST /api/ai/conversations
 * @desc    Start a new conversation
 * @access  Private
 */
router.post('/conversations', authenticate, asyncHandler(async (req, res) => {
  const { title, customerContextId, quotationContextId } = req.body;

  const db = require('../config/database');
  const result = await db.query(
    `INSERT INTO ai_conversations (user_id, location_id, title, customer_context_id, quotation_context_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, title, status, created_at`,
    [req.user.id, req.user.location_id || null, title || null, customerContextId || null, quotationContextId || null]
  );

  res.status(201).json({
    success: true,
    data: {
      conversation: result.rows[0]
    }
  });
}));

/**
 * @route   GET /api/ai/conversations
 * @desc    Get user's conversation list
 * @access  Private
 */
router.get('/conversations', authenticate, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = parseInt(req.query.offset) || 0;

  const conversations = await aiService.getConversations(req.user.id, limit, offset);

  res.json({
    success: true,
    data: {
      conversations,
      pagination: {
        limit,
        offset,
        hasMore: conversations.length === limit
      }
    }
  });
}));

/**
 * @route   GET /api/ai/conversations/:id
 * @desc    Get a specific conversation with messages
 * @access  Private
 */
router.get('/conversations/:id', authenticate, asyncHandler(async (req, res) => {
  const conversationId = req.params.id;
  const db = require('../config/database');

  // Get conversation
  const convResult = await db.query(
    `SELECT * FROM ai_conversations
     WHERE id = $1 AND user_id = $2 AND status != 'deleted'`,
    [conversationId, req.user.id]
  );

  if (convResult.rows.length === 0) {
    throw ApiError.notFound('Conversation');
  }

  // Get messages
  const messages = await aiService.getConversationHistory(conversationId);

  res.json({
    success: true,
    data: {
      conversation: convResult.rows[0],
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolName: m.tool_name,
        createdAt: m.created_at
      }))
    }
  });
}));

/**
 * @route   DELETE /api/ai/conversations/:id
 * @desc    Archive a conversation
 * @access  Private
 */
router.delete('/conversations/:id', authenticate, asyncHandler(async (req, res) => {
  const conversationId = req.params.id;
  const db = require('../config/database');

  const result = await db.query(
    `UPDATE ai_conversations
     SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [conversationId, req.user.id]
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Conversation');
  }

  res.json({
    success: true,
    message: 'Conversation archived'
  });
}));

/**
 * @route   POST /api/ai/feedback
 * @desc    Submit feedback on an AI response
 * @access  Private
 */
router.post('/feedback', authenticate, asyncHandler(async (req, res) => {
  const { queryLogId, feedback, notes } = req.body;

  if (!queryLogId) {
    throw ApiError.badRequest('queryLogId is required');
  }

  if (!feedback || !['helpful', 'not_helpful', 'incorrect'].includes(feedback)) {
    throw ApiError.badRequest('Invalid feedback value. Must be: helpful, not_helpful, or incorrect');
  }

  await aiService.submitFeedback(queryLogId, feedback, notes, req.user.id);

  res.json({
    success: true,
    message: 'Feedback submitted successfully'
  });
}));

/**
 * @route   GET /api/ai/analytics/usage
 * @desc    Get AI usage analytics
 * @access  Private (Admin/Manager)
 */
router.get('/analytics/usage', authenticate, requireRole(['admin', 'manager']), asyncHandler(async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 7, 30);
  const analytics = await aiService.getAnalytics(days);

  res.json({
    success: true,
    data: analytics
  });
}));

/**
 * @route   GET /api/ai/analytics/pilot
 * @desc    Get pilot dashboard summary
 * @access  Private (Admin/Manager)
 */
router.get('/analytics/pilot', authenticate, requireRole(['admin', 'manager']), asyncHandler(async (req, res) => {
  const db = require('../config/database');
  const result = await db.query('SELECT * FROM ai_pilot_dashboard');

  res.json({
    success: true,
    data: result.rows[0] || {}
  });
}));

/**
 * @route   GET /api/ai/analytics/realtime
 * @desc    Get real-time metrics (last hour, today)
 * @access  Private (Admin/Manager)
 */
router.get('/analytics/realtime', authenticate, requireRole(['admin', 'manager']), asyncHandler(async (req, res) => {
  const db = require('../config/database');
  const result = await db.query('SELECT * FROM ai_realtime_metrics');

  res.json({
    success: true,
    data: result.rows[0] || {}
  });
}));

/**
 * @route   GET /api/ai/analytics/hourly
 * @desc    Get hourly metrics for last 48 hours
 * @access  Private (Admin/Manager)
 */
router.get('/analytics/hourly', authenticate, requireRole(['admin', 'manager']), asyncHandler(async (req, res) => {
  const db = require('../config/database');
  const result = await db.query('SELECT * FROM ai_hourly_stats ORDER BY hour DESC LIMIT 48');

  res.json({
    success: true,
    data: {
      hourlyStats: result.rows
    }
  });
}));

/**
 * @route   GET /api/ai/analytics/errors
 * @desc    Get recent errors for debugging
 * @access  Private (Admin/Manager)
 */
router.get('/analytics/errors', authenticate, requireRole(['admin', 'manager']), asyncHandler(async (req, res) => {
  const db = require('../config/database');
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);

  const result = await db.query('SELECT * FROM ai_recent_errors LIMIT $1', [limit]);

  res.json({
    success: true,
    data: {
      errors: result.rows,
      count: result.rows.length
    }
  });
}));

/**
 * @route   GET /api/ai/analytics/latency
 * @desc    Get latency percentiles by day
 * @access  Private (Admin/Manager)
 */
router.get('/analytics/latency', authenticate, requireRole(['admin', 'manager']), asyncHandler(async (req, res) => {
  const db = require('../config/database');
  const days = Math.min(parseInt(req.query.days) || 7, 30);

  const result = await db.query(
    'SELECT * FROM ai_latency_percentiles WHERE date >= CURRENT_DATE - $1 ORDER BY date DESC',
    [days]
  );

  res.json({
    success: true,
    data: {
      latencyStats: result.rows
    }
  });
}));

/**
 * @route   GET /api/ai/analytics/feedback
 * @desc    Get feedback summary by day and query type
 * @access  Private (Admin/Manager)
 */
router.get('/analytics/feedback', authenticate, requireRole(['admin', 'manager']), asyncHandler(async (req, res) => {
  const db = require('../config/database');

  const result = await db.query('SELECT * FROM ai_feedback_summary ORDER BY date DESC, total_feedback DESC');

  res.json({
    success: true,
    data: {
      feedbackStats: result.rows
    }
  });
}));

/**
 * @route   GET /api/ai/health
 * @desc    Health check for AI service
 * @access  Public
 */
router.get('/health', asyncHandler(async (req, res) => {
  try {
    // Check if Anthropic API key is configured
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

    // Check feature flag status
    const flagStatus = await featureFlags.getStatus();

    // Check database connection
    const db = require('../config/database');
    await db.query('SELECT 1');

    // Determine overall status
    let status = 'operational';
    if (!hasApiKey) status = 'degraded';
    if (!flagStatus.enabled) status = 'disabled';

    res.json({
      success: true,
      data: {
        status,
        apiKeyConfigured: hasApiKey,
        aiEnabled: flagStatus.enabled,
        enabledSource: flagStatus.effectiveSource,
        database: 'connected',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    // Health check returns 503 with status info rather than propagating
    res.status(503).json({
      success: false,
      data: {
        status: 'error',
        message: error.message
      }
    });
  }
}));

// ============================================================
// ADMIN: FEATURE FLAG MANAGEMENT
// ============================================================

/**
 * @route   GET /api/ai/admin/status
 * @desc    Get AI feature flag status
 * @access  Private (Admin only)
 */
router.get('/admin/status', authenticate, requireRole(['admin']), asyncHandler(async (req, res) => {
  const status = await featureFlags.getStatus();

  res.json({
    success: true,
    data: status
  });
}));

/**
 * @route   POST /api/ai/admin/toggle
 * @desc    Toggle AI assistant on/off
 * @access  Private (Admin only)
 */
router.post('/admin/toggle', authenticate, requireRole(['admin']), asyncHandler(async (req, res) => {
  const { enabled, persist } = req.body;

  if (typeof enabled !== 'boolean') {
    throw ApiError.badRequest('enabled must be a boolean');
  }

  const changedBy = req.user.email || req.user.id;

  if (persist) {
    // Persist to database (survives restarts)
    await featureFlags.setDatabaseSetting(enabled, changedBy);
  } else {
    // Runtime only (lost on restart)
    featureFlags.setRuntimeOverride(enabled);
  }

  const newStatus = await featureFlags.getStatus();

  // Log the action
  console.log(`[AI Admin] AI Assistant ${enabled ? 'ENABLED' : 'DISABLED'} by ${changedBy} (persist: ${persist})`);

  res.json({
    success: true,
    message: `AI Assistant ${enabled ? 'enabled' : 'disabled'}${persist ? ' (persistent)' : ' (runtime only)'}`,
    data: newStatus
  });
}));

/**
 * @route   POST /api/ai/admin/kill-switch
 * @desc    Emergency kill switch - disable AI immediately
 * @access  Private (Admin only)
 */
router.post('/admin/kill-switch', authenticate, requireRole(['admin']), asyncHandler(async (req, res) => {
  const changedBy = req.user.email || req.user.id;
  const reason = req.body.reason || 'Emergency kill switch activated';

  // Set both runtime and database to ensure it's off
  featureFlags.setRuntimeOverride(false);
  await featureFlags.setDatabaseSetting(false, changedBy);

  console.warn(`[AI Admin] KILL SWITCH ACTIVATED by ${changedBy}. Reason: ${reason}`);

  res.json({
    success: true,
    message: 'AI Assistant has been disabled (kill switch activated)',
    data: {
      enabled: false,
      activatedBy: changedBy,
      reason,
      timestamp: new Date().toISOString()
    }
  });
}));

/**
 * @route   POST /api/ai/admin/clear-override
 * @desc    Clear runtime override, fall back to DB/env settings
 * @access  Private (Admin only)
 */
router.post('/admin/clear-override', authenticate, requireRole(['admin']), asyncHandler(async (req, res) => {
  featureFlags.setRuntimeOverride(null);
  featureFlags.clearCache();

  const newStatus = await featureFlags.getStatus();

  console.log(`[AI Admin] Runtime override cleared by ${req.user.email || req.user.id}`);

  res.json({
    success: true,
    message: 'Runtime override cleared',
    data: newStatus
  });
}));

module.exports = router;
