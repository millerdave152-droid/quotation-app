/**
 * AI Assistant API Routes
 * Endpoints for the customer support AI assistant
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const aiService = require('../services/ai');

/**
 * @route   POST /api/ai/chat
 * @desc    Send a message and get AI response
 * @access  Private
 */
router.post('/chat', authenticate, async (req, res) => {
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
 * @route   GET /api/ai/health
 * @desc    Health check for AI service
 * @access  Public
 */
router.get('/health', async (req, res) => {
  try {
    // Check if Anthropic API key is configured
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

    // Check database connection
    const db = require('../config/database');
    await db.query('SELECT 1');

    res.json({
      success: true,
      data: {
        status: hasApiKey ? 'operational' : 'degraded',
        apiKeyConfigured: hasApiKey,
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

module.exports = router;
