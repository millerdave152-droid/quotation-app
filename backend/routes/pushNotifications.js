const express = require('express');
const router = express.Router();
const pushService = require('../services/pushNotificationService');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

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
 * Subscribe to push notifications
 */
router.post('/subscribe', authenticate, asyncHandler(async (req, res) => {
  const subscription = req.body;
  const userAgent = req.headers['user-agent'];

  if (!subscription || !subscription.endpoint || !subscription.keys) {
    throw ApiError.badRequest('Invalid subscription object');
  }

  const result = await pushService.subscribe(subscription, userAgent);

  res.status(201).json({
    message: 'Successfully subscribed to push notifications',
    id: result.id
  });
}));

/**
 * POST /api/push/unsubscribe
 * Unsubscribe from push notifications
 */
router.post('/unsubscribe', authenticate, asyncHandler(async (req, res) => {
  const { endpoint } = req.body;

  if (!endpoint) {
    throw ApiError.badRequest('Endpoint is required');
  }

  const removed = await pushService.unsubscribe(endpoint);

  if (removed) {
    res.json({ message: 'Successfully unsubscribed from push notifications' });
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

module.exports = router;
