/**
 * AI Assistant API Routes
 * Endpoints for the customer support AI assistant
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const aiService = require('../services/ai');
const featureFlags = require('../services/ai/featureFlags');

/**
 * @route   POST /api/ai/chat
 * @desc    Send a message and get AI response
 * @access  Private
 */
router.post('/chat', authenticate, featureFlags.checkEnabled(), async (req, res) => {
  try {
    const { message, conversationId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    if (message.length > 4000) {
      return res.status(400).json({
        success: false,
        message: 'Message exceeds maximum length of 4000 characters'
      });
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

  } catch (error) {
    console.error('[AI Routes] Chat error:', error);

    // Handle specific error types
    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        message: 'AI service is temporarily busy. Please try again in a moment.'
      });
    }

    if (error.status === 401) {
      return res.status(500).json({
        success: false,
        message: 'AI service configuration error. Please contact administrator.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to process your request. Please try again.'
    });
  }
});

/**
 * @route   POST /api/ai/conversations
 * @desc    Start a new conversation
 * @access  Private
 */
router.post('/conversations', authenticate, async (req, res) => {
  try {
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

  } catch (error) {
    console.error('[AI Routes] Create conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create conversation'
    });
  }
});

/**
 * @route   GET /api/ai/conversations
 * @desc    Get user's conversation list
 * @access  Private
 */
router.get('/conversations', authenticate, async (req, res) => {
  try {
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

  } catch (error) {
    console.error('[AI Routes] Get conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations'
    });
  }
});

/**
 * @route   GET /api/ai/conversations/:id
 * @desc    Get a specific conversation with messages
 * @access  Private
 */
router.get('/conversations/:id', authenticate, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const db = require('../config/database');

    // Get conversation
    const convResult = await db.query(
      `SELECT * FROM ai_conversations
       WHERE id = $1 AND user_id = $2 AND status != 'deleted'`,
      [conversationId, req.user.id]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
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

  } catch (error) {
    console.error('[AI Routes] Get conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation'
    });
  }
});

/**
 * @route   DELETE /api/ai/conversations/:id
 * @desc    Archive a conversation
 * @access  Private
 */
router.delete('/conversations/:id', authenticate, async (req, res) => {
  try {
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
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    res.json({
      success: true,
      message: 'Conversation archived'
    });

  } catch (error) {
    console.error('[AI Routes] Delete conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to archive conversation'
    });
  }
});

/**
 * @route   POST /api/ai/feedback
 * @desc    Submit feedback on an AI response
 * @access  Private
 */
router.post('/feedback', authenticate, async (req, res) => {
  try {
    const { queryLogId, feedback, notes } = req.body;

    if (!queryLogId) {
      return res.status(400).json({
        success: false,
        message: 'queryLogId is required'
      });
    }

    if (!feedback || !['helpful', 'not_helpful', 'incorrect'].includes(feedback)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid feedback value. Must be: helpful, not_helpful, or incorrect'
      });
    }

    await aiService.submitFeedback(queryLogId, feedback, notes, req.user.id);

    res.json({
      success: true,
      message: 'Feedback submitted successfully'
    });

  } catch (error) {
    console.error('[AI Routes] Feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback'
    });
  }
});

/**
 * @route   GET /api/ai/analytics/usage
 * @desc    Get AI usage analytics
 * @access  Private (Admin/Manager)
 */
router.get('/analytics/usage', authenticate, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 30);
    const analytics = await aiService.getAnalytics(days);

    res.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('[AI Routes] Analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics'
    });
  }
});

/**
 * @route   GET /api/ai/analytics/pilot
 * @desc    Get pilot dashboard summary
 * @access  Private (Admin/Manager)
 */
router.get('/analytics/pilot', authenticate, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const db = require('../config/database');
    const result = await db.query('SELECT * FROM ai_pilot_dashboard');

    res.json({
      success: true,
      data: result.rows[0] || {}
    });

  } catch (error) {
    console.error('[AI Routes] Pilot analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pilot analytics'
    });
  }
});

/**
 * @route   GET /api/ai/analytics/realtime
 * @desc    Get real-time metrics (last hour, today)
 * @access  Private (Admin/Manager)
 */
router.get('/analytics/realtime', authenticate, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const db = require('../config/database');
    const result = await db.query('SELECT * FROM ai_realtime_metrics');

    res.json({
      success: true,
      data: result.rows[0] || {}
    });

  } catch (error) {
    console.error('[AI Routes] Realtime analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch realtime metrics'
    });
  }
});

/**
 * @route   GET /api/ai/analytics/hourly
 * @desc    Get hourly metrics for last 48 hours
 * @access  Private (Admin/Manager)
 */
router.get('/analytics/hourly', authenticate, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const db = require('../config/database');
    const result = await db.query('SELECT * FROM ai_hourly_stats ORDER BY hour DESC LIMIT 48');

    res.json({
      success: true,
      data: {
        hourlyStats: result.rows
      }
    });

  } catch (error) {
    console.error('[AI Routes] Hourly analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hourly metrics'
    });
  }
});

/**
 * @route   GET /api/ai/analytics/errors
 * @desc    Get recent errors for debugging
 * @access  Private (Admin/Manager)
 */
router.get('/analytics/errors', authenticate, requireRole(['admin', 'manager']), async (req, res) => {
  try {
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

  } catch (error) {
    console.error('[AI Routes] Errors analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch error logs'
    });
  }
});

/**
 * @route   GET /api/ai/analytics/latency
 * @desc    Get latency percentiles by day
 * @access  Private (Admin/Manager)
 */
router.get('/analytics/latency', authenticate, requireRole(['admin', 'manager']), async (req, res) => {
  try {
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

  } catch (error) {
    console.error('[AI Routes] Latency analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch latency metrics'
    });
  }
});

/**
 * @route   GET /api/ai/analytics/feedback
 * @desc    Get feedback summary by day and query type
 * @access  Private (Admin/Manager)
 */
router.get('/analytics/feedback', authenticate, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const db = require('../config/database');

    const result = await db.query('SELECT * FROM ai_feedback_summary ORDER BY date DESC, total_feedback DESC');

    res.json({
      success: true,
      data: {
        feedbackStats: result.rows
      }
    });

  } catch (error) {
    console.error('[AI Routes] Feedback analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch feedback summary'
    });
  }
});

/**
 * @route   GET /api/ai/health
 * @desc    Health check for AI service
 * @access  Public
 */
router.get('/health', async (req, res) => {
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
    res.status(503).json({
      success: false,
      data: {
        status: 'error',
        message: error.message
      }
    });
  }
});

// ============================================================
// ADMIN: FEATURE FLAG MANAGEMENT
// ============================================================

/**
 * @route   GET /api/ai/admin/status
 * @desc    Get AI feature flag status
 * @access  Private (Admin only)
 */
router.get('/admin/status', authenticate, requireRole(['admin']), async (req, res) => {
  try {
    const status = await featureFlags.getStatus();

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('[AI Routes] Admin status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch AI status'
    });
  }
});

/**
 * @route   POST /api/ai/admin/toggle
 * @desc    Toggle AI assistant on/off
 * @access  Private (Admin only)
 */
router.post('/admin/toggle', authenticate, requireRole(['admin']), async (req, res) => {
  try {
    const { enabled, persist } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'enabled must be a boolean'
      });
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

  } catch (error) {
    console.error('[AI Routes] Admin toggle error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle AI status'
    });
  }
});

/**
 * @route   POST /api/ai/admin/kill-switch
 * @desc    Emergency kill switch - disable AI immediately
 * @access  Private (Admin only)
 */
router.post('/admin/kill-switch', authenticate, requireRole(['admin']), async (req, res) => {
  try {
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

  } catch (error) {
    console.error('[AI Routes] Kill switch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to activate kill switch'
    });
  }
});

/**
 * @route   POST /api/ai/admin/clear-override
 * @desc    Clear runtime override, fall back to DB/env settings
 * @access  Private (Admin only)
 */
router.post('/admin/clear-override', authenticate, requireRole(['admin']), async (req, res) => {
  try {
    featureFlags.setRuntimeOverride(null);
    featureFlags.clearCache();

    const newStatus = await featureFlags.getStatus();

    console.log(`[AI Admin] Runtime override cleared by ${req.user.email || req.user.id}`);

    res.json({
      success: true,
      message: 'Runtime override cleared',
      data: newStatus
    });

  } catch (error) {
    console.error('[AI Routes] Clear override error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear override'
    });
  }
});

module.exports = router;
