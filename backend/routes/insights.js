/**
 * Insights Routes Module
 * Handles AI-powered business insights and unified timeline
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const cache = require('../cache');
const { authenticate } = require('../middleware/auth');
const insightsEngine = require('../services/InsightsEngine');
const emailService = require('../services/EmailService');

// Module-level dependencies (injected via init)
let pool = null;

/**
 * Initialize the router with dependencies
 * @param {object} deps - Dependencies
 * @param {Pool} deps.pool - PostgreSQL connection pool
 */
const init = (deps) => {
  pool = deps.pool;
  return router;
};

// ============================================
// INSIGHTS ROUTES
// ============================================

/**
 * GET /api/insights
 * Get AI-generated business insights
 *
 * Query params:
 * - limit: number of insights to return (default: 20)
 * - priority: filter by priority (critical, high, medium, low)
 * - types: comma-separated list of insight types to include
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { limit = 20, priority = null, types = null } = req.query;
  const userId = req.user?.id;

  // Parse types if provided
  const typeArray = types ? types.split(',').map(t => t.trim()) : null;

  // Generate insights
  let insights = await insightsEngine.generateInsights({
    limit: parseInt(limit),
    priority,
    types: typeArray
  });

  // Filter out dismissed insights for this user
  if (userId) {
    const dismissedIds = await insightsEngine.getDismissedInsightIds(userId);
    insights = insights.filter(i => !dismissedIds.includes(i.id));
  }

  res.success({
    insights,
    count: insights.length,
    generatedAt: new Date().toISOString()
  });
}));

/**
 * GET /api/insights/timeline
 * Get unified activity timeline across all modules
 *
 * Query params:
 * - limit: number of events to return (default: 50)
 * - customerId: filter by customer ID
 * - startDate: filter events after this date
 */
router.get('/timeline', authenticate, asyncHandler(async (req, res) => {
  const { limit = 50, customerId = null, startDate = null } = req.query;

  const timeline = await insightsEngine.getUnifiedTimeline({
    limit: parseInt(limit),
    customerId: customerId ? parseInt(customerId) : null,
    startDate: startDate ? new Date(startDate) : null
  });

  res.success({
    events: timeline,
    count: timeline.length
  });
}));

/**
 * GET /api/insights/quick-actions
 * Get counts for quick action items on dashboard
 */
router.get('/quick-actions', authenticate, asyncHandler(async (req, res) => {
  // Try cache first (1 minute TTL)
  const cacheKey = 'insights:quick-actions';
  const cached = cache.get('short', cacheKey);
  if (cached) {
    return res.success(cached);
  }

  const counts = await insightsEngine.getQuickActionCounts();

  // Build quick actions array with counts
  const quickActions = [
    {
      id: 'quotes-expiring',
      label: 'Quotes Expiring Soon',
      count: parseInt(counts.quotes_expiring_soon) || 0,
      icon: 'clock',
      color: 'warning',
      path: '/quotes?filter=expiring',
      priority: 'high'
    },
    {
      id: 'stale-quotes',
      label: 'Stale Quotes',
      count: parseInt(counts.stale_quotes) || 0,
      icon: 'alert-circle',
      color: 'warning',
      path: '/quotes?filter=stale',
      priority: 'medium'
    },
    {
      id: 'overdue-invoices',
      label: 'Overdue Invoices',
      count: parseInt(counts.overdue_invoices) || 0,
      icon: 'file-text',
      color: 'danger',
      path: '/invoices?filter=overdue',
      priority: 'high'
    },
    {
      id: 'low-stock',
      label: 'Low Stock Items',
      count: parseInt(counts.low_stock_items) || 0,
      icon: 'package',
      color: 'warning',
      path: '/inventory?filter=low-stock',
      priority: 'medium'
    },
    {
      id: 'out-of-stock',
      label: 'Out of Stock',
      count: parseInt(counts.out_of_stock_items) || 0,
      icon: 'alert-triangle',
      color: 'danger',
      path: '/inventory?filter=out-of-stock',
      priority: 'critical'
    },
    {
      id: 'pending-orders',
      label: 'Pending Orders',
      count: parseInt(counts.pending_orders) || 0,
      icon: 'shopping-cart',
      color: 'info',
      path: '/orders?filter=pending',
      priority: 'high'
    }
  ];

  // Filter to only show actions with counts > 0 and sort by priority
  const activeActions = quickActions
    .filter(a => a.count > 0)
    .sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

  const result = {
    actions: activeActions,
    totalCount: activeActions.reduce((sum, a) => sum + a.count, 0),
    allActions: quickActions
  };

  // Cache for 1 minute
  cache.set('short', cacheKey, result);

  res.success(result);
}));

/**
 * POST /api/insights/:id/dismiss
 * Dismiss an insight for the current user
 */
router.post('/:id/dismiss', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError('User not authenticated', 401);
  }

  const result = await insightsEngine.dismissInsight(id, userId);

  res.success({
    message: 'Insight dismissed',
    insightId: id,
    expiresAt: result.expires_at
  });
}));

/**
 * POST /api/insights/:id/action
 * Execute an action from an insight
 */
router.post('/:id/action', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, data } = req.body;

  // Handle different action types
  switch (action) {
    case 'send_followup': {
      const recipientEmail = data?.customerEmail || data?.email;
      if (data?.quoteId && recipientEmail) {
        const result = await emailService.sendFollowUpReminderEmail(
          data.quoteId, recipientEmail, data?.daysSinceSent || 0
        );
        res.success({ message: 'Follow-up email sent', action, emailResult: result });
      } else {
        // No quote/email — log an in-app notification to the salesperson instead
        res.success({ message: 'Follow-up action noted (no email — missing quote or customer email)', action, data });
      }
      break;
    }

    case 'extend_quote':
      if (data?.quoteId) {
        // Extend quote by 7 days
        const result = await pool.query(
          `UPDATE quotations
           SET expiry_date = COALESCE(expiry_date, CURRENT_DATE) + INTERVAL '7 days',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING id, expiry_date`,
          [data.quoteId]
        );
        res.success({ message: 'Quote extended by 7 days', quote: result.rows[0] });
      } else {
        throw new ApiError('Quote ID required', 400);
      }
      break;

    case 'send_reminder':
    case 'send_payment_reminder':
    case 'send_reengagement':
    case 'send_reorder_reminder':
    case 'send_thankyou': {
      const email = data?.customerEmail || data?.email;
      const customerName = data?.customerName || 'Valued Customer';

      if (!email) {
        res.success({ message: `${action} skipped (no customer email)`, action, data });
        break;
      }

      const templates = {
        send_reminder: {
          subject: `Reminder: Your quote is waiting — ${emailService.companyName}`,
          body: `<p>Hi ${customerName},</p><p>Just a friendly reminder that your quote is still available. We'd love to help you finalize your purchase.</p><p>Please let us know if you have any questions or need adjustments.</p>`,
        },
        send_payment_reminder: {
          subject: `Payment Reminder — ${emailService.companyName}`,
          body: `<p>Hi ${customerName},</p><p>This is a reminder regarding your outstanding balance. Please reach out if you need any assistance with payment options.</p>`,
        },
        send_reengagement: {
          subject: `We miss you! — ${emailService.companyName}`,
          body: `<p>Hi ${customerName},</p><p>It's been a while since your last visit. We have some great new products and offers that might interest you.</p><p>Stop by or give us a call — we'd love to help!</p>`,
        },
        send_reorder_reminder: {
          subject: `Time to reorder? — ${emailService.companyName}`,
          body: `<p>Hi ${customerName},</p><p>Based on your purchase history, it may be time to restock. We have your favorites ready to go.</p><p>Let us know if you'd like to place a new order.</p>`,
        },
        send_thankyou: {
          subject: `Thank you for your purchase! — ${emailService.companyName}`,
          body: `<p>Hi ${customerName},</p><p>Thank you for choosing ${emailService.companyName}! We appreciate your business and hope you're enjoying your purchase.</p><p>If you need anything, don't hesitate to reach out.</p>`,
        },
      };

      const tpl = templates[action];
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">${emailService.companyName}</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            ${tpl.body}
          </div>
          <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
            ${emailService.companyName} &bull; <a href="mailto:${emailService.fromEmail}" style="color: #6366f1;">${emailService.fromEmail}</a>
          </div>
        </div>`;

      const emailResult = await emailService.sendEmail(email, tpl.subject, html);
      await emailService.logNotification(
        data?.quoteId || null, action.toUpperCase(), email, tpl.subject,
        emailResult.success ? 'sent' : 'failed', emailResult.error || null
      );
      res.success({ message: `${action} email sent`, action, emailResult });
      break;
    }

    case 'create_po':
      // Return data needed to create PO
      res.success({
        message: 'Redirect to PO creation',
        redirectTo: `/inventory/purchase-orders/new?productId=${data?.productId}`,
        data
      });
      break;

    case 'create_quote':
      res.success({
        message: 'Redirect to quote creation',
        redirectTo: `/quotes/new?customerId=${data?.customerId}`,
        data
      });
      break;

    default:
      res.success({ message: 'Action acknowledged', action, data });
  }
}));

/**
 * GET /api/insights/summary
 * Get a summary of all insight categories
 */
router.get('/summary', authenticate, asyncHandler(async (req, res) => {
  const insights = await insightsEngine.generateInsights({ limit: 100 });

  // Group by type and count
  const summary = insights.reduce((acc, insight) => {
    if (!acc[insight.type]) {
      acc[insight.type] = { count: 0, critical: 0, high: 0, medium: 0, low: 0 };
    }
    acc[insight.type].count++;
    acc[insight.type][insight.priority]++;
    return acc;
  }, {});

  // Count by priority
  const byPriority = insights.reduce((acc, insight) => {
    acc[insight.priority] = (acc[insight.priority] || 0) + 1;
    return acc;
  }, {});

  res.success({
    total: insights.length,
    byType: summary,
    byPriority,
    generatedAt: new Date().toISOString()
  });
}));

module.exports = { router, init };
