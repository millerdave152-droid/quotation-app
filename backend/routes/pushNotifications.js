const express = require('express');
const router = express.Router();
const pushService = require('../services/pushNotificationService');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/push/vapid-public-key
 * Get the VAPID public key for client-side subscription
 */
router.get('/vapid-public-key', (req, res) => {
  try {
    res.json({
      publicKey: process.env.VAPID_PUBLIC_KEY
    });
  } catch (error) {
    console.error('Error fetching VAPID public key:', error);
    res.status(500).json({ error: 'Failed to fetch VAPID public key' });
  }
});

/**
 * POST /api/push/subscribe
 * Subscribe to push notifications
 */
router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const subscription = req.body;
    const userAgent = req.headers['user-agent'];

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    const result = await pushService.subscribe(subscription, userAgent);

    res.status(201).json({
      message: 'Successfully subscribed to push notifications',
      id: result.id
    });
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    res.status(500).json({ error: 'Failed to subscribe to push notifications' });
  }
});

/**
 * POST /api/push/unsubscribe
 * Unsubscribe from push notifications
 */
router.post('/unsubscribe', authenticate, async (req, res) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }

    const removed = await pushService.unsubscribe(endpoint);

    if (removed) {
      res.json({ message: 'Successfully unsubscribed from push notifications' });
    } else {
      res.status(404).json({ error: 'Subscription not found' });
    }
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    res.status(500).json({ error: 'Failed to unsubscribe from push notifications' });
  }
});

/**
 * POST /api/push/send
 * Send a push notification to all subscribers (admin only)
 */
router.post('/send', authenticate, async (req, res) => {
  try {
    const { title, body, url, tag } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
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
  } catch (error) {
    console.error('Error sending push notifications:', error);
    res.status(500).json({ error: 'Failed to send push notifications' });
  }
});

/**
 * GET /api/push/stats
 * Get push notification statistics
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    const count = await pushService.getSubscriptionCount();

    res.json({
      totalSubscriptions: count,
      enabled: true
    });
  } catch (error) {
    console.error('Error fetching push notification stats:', error);
    res.status(500).json({ error: 'Failed to fetch push notification stats' });
  }
});

/**
 * POST /api/push/test
 * Send a test notification (for testing purposes)
 */
router.post('/test', authenticate, async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

module.exports = router;
