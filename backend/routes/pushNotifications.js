const express = require('express');
const router = express.Router();
const pushService = require('../services/pushNotificationService');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
let pool = require('../db');

/**
 * GET /api/push/vapid-public-key
 * Get the VAPID public key for client-side subscription
 */
router.get('/vapid-public-key', (req, res) => {
  res.json({
    publicKey: process.env.VAPID_PUBLIC_KEY
  });
});

/**
 * POST /api/push/subscribe
 * Register a new push subscription for the authenticated user.
 * Accepts { subscription: { endpoint, keys: { p256dh, auth } }, userAgent }
 * Also accepts flat body { endpoint, keys: { p256dh, auth } } for backward compat.
 * Sets push_notifications_enabled = true on users table.
 */
router.post('/subscribe', authenticate, asyncHandler(async (req, res) => {
  // Accept both wrapped and flat body shapes
  const subscription = req.body.subscription || req.body;
  const userAgent = req.body.userAgent || req.headers['user-agent'];

  if (!subscription || !subscription.endpoint || !subscription.keys) {
    throw ApiError.badRequest('Invalid subscription object');
  }

  const result = await pushService.subscribe(subscription, userAgent, req.user.id);

  // Set push_notifications_enabled = true
  await pool.query(
    'UPDATE users SET push_notifications_enabled = true WHERE id = $1',
    [req.user.id]
  );

  res.status(201).json({
    success: true,
    message: 'Successfully subscribed to push notifications',
    id: result.id
  });
}));

/**
 * POST /api/push/unsubscribe
 * Remove a push subscription (backward compat)
 */
router.post('/unsubscribe', authenticate, asyncHandler(async (req, res) => {
  const { endpoint } = req.body;

  if (!endpoint) {
    throw ApiError.badRequest('Endpoint is required');
  }

  const removed = await pushService.unsubscribe(endpoint);

  if (removed) {
    res.json({ success: true, message: 'Successfully unsubscribed from push notifications' });
  } else {
    throw ApiError.notFound('Subscription');
  }
}));

/**
 * DELETE /api/push/unsubscribe
 * Remove a push subscription
 */
router.delete('/unsubscribe', authenticate, asyncHandler(async (req, res) => {
  const { endpoint } = req.body;

  if (!endpoint) {
    throw ApiError.badRequest('Endpoint is required');
  }

  const removed = await pushService.unsubscribe(endpoint);

  // Check if user has any remaining subscriptions
  const remaining = await pool.query(
    'SELECT COUNT(*) FROM push_subscriptions WHERE user_id = $1',
    [req.user.id]
  );
  if (parseInt(remaining.rows[0].count) === 0) {
    await pool.query(
      'UPDATE users SET push_notifications_enabled = false WHERE id = $1',
      [req.user.id]
    );
  }

  if (removed) {
    res.json({ success: true, message: 'Successfully unsubscribed' });
  } else {
    throw ApiError.notFound('Subscription');
  }
}));

/**
 * POST /api/push/send
 * Send a push notification to all subscribers (admin only)
 */
router.post('/send', authenticate, asyncHandler(async (req, res) => {
  const { title, body, url, tag } = req.body;

  if (!title || !body) {
    throw ApiError.badRequest('Title and body are required');
  }

  const payload = {
    title,
    body,
    icon: '/logo192.png',
    badge: '/logo192.png',
    tag: tag || 'notification',
    url: url || '/',
    data: {
      timestamp: new Date().toISOString()
    }
  };

  const results = await pushService.sendToAll(payload);

  res.json({
    message: 'Notifications sent',
    results
  });
}));

/**
 * GET /api/push/stats
 * Get push notification statistics
 */
router.get('/stats', authenticate, asyncHandler(async (req, res) => {
  const count = await pushService.getSubscriptionCount();

  res.json({
    totalSubscriptions: count,
    enabled: true
  });
}));

/**
 * POST /api/push/test
 * Send a test notification (for testing purposes)
 */
router.post('/test', authenticate, asyncHandler(async (req, res) => {
  const payload = {
    title: '🧪 Test Notification',
    body: 'This is a test notification from QuoteApp. If you see this, push notifications are working!',
    icon: '/logo192.png',
    badge: '/logo192.png',
    tag: 'test-notification',
    url: '/',
    data: {
      type: 'test',
      timestamp: new Date().toISOString()
    }
  };

  const results = await pushService.sendToAll(payload);

  res.json({
    message: 'Test notification sent',
    results
  });
}));

/**
 * GET /api/push/preferences
 * Get notification preferences for the authenticated user
 */
router.get('/preferences', authenticate, asyncHandler(async (req, res) => {
  const prefs = await pushService.getPreferences(req.user.id);
  res.json({ success: true, data: prefs });
}));

/**
 * PUT /api/push/preferences
 * Save notification preferences for the authenticated user
 */
router.put('/preferences', authenticate, asyncHandler(async (req, res) => {
  const { pushEnabled, soundEnabled, quietStart, quietEnd } = req.body;
  const prefs = await pushService.savePreferences(req.user.id, {
    pushEnabled, soundEnabled, quietStart, quietEnd,
  });
  res.json({ success: true, data: prefs });
}));

module.exports = router;
