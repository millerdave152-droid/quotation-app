const webpush = require('web-push');
const pool = require('../db');

// Configure web-push with VAPID keys
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

class PushNotificationService {
  /**
   * Subscribe a client to push notifications
   */
  async subscribe(subscription, userAgent = '') {
    try {
      const { endpoint, expirationTime, keys } = subscription;

      const query = `
        INSERT INTO push_subscriptions (endpoint, expiration_time, p256dh, auth, user_agent)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (endpoint)
        DO UPDATE SET
          expiration_time = EXCLUDED.expiration_time,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          user_agent = EXCLUDED.user_agent,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;

      const values = [
        endpoint,
        expirationTime || null,
        keys.p256dh,
        keys.auth,
        userAgent
      ];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error saving push subscription:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe a client from push notifications
   */
  async unsubscribe(endpoint) {
    try {
      const query = 'DELETE FROM push_subscriptions WHERE endpoint = $1 RETURNING id';
      const result = await pool.query(query, [endpoint]);
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error removing push subscription:', error);
      throw error;
    }
  }

  /**
   * Get all active subscriptions
   */
  async getAllSubscriptions() {
    try {
      const query = 'SELECT * FROM push_subscriptions ORDER BY created_at DESC';
      const result = await pool.query(query);

      return result.rows.map(row => ({
        endpoint: row.endpoint,
        expirationTime: row.expiration_time,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth
        }
      }));
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      throw error;
    }
  }

  /**
   * Send push notification to a specific subscription
   */
  async sendNotification(subscription, payload) {
    try {
      const options = {
        TTL: 3600, // Time to live in seconds
      };

      await webpush.sendNotification(subscription, JSON.stringify(payload), options);
      return true;
    } catch (error) {
      console.error('Error sending push notification:', error);

      // If subscription is no longer valid, remove it
      if (error.statusCode === 410 || error.statusCode === 404) {
        console.log('Subscription expired, removing:', subscription.endpoint);
        await this.unsubscribe(subscription.endpoint);
      }

      throw error;
    }
  }

  /**
   * Send push notification to all subscribers
   */
  async sendToAll(payload) {
    try {
      const subscriptions = await this.getAllSubscriptions();
      const results = {
        success: 0,
        failed: 0,
        errors: []
      };

      for (const subscription of subscriptions) {
        try {
          await this.sendNotification(subscription, payload);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            endpoint: subscription.endpoint,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error sending notifications to all subscribers:', error);
      throw error;
    }
  }

  /**
   * Send quote update notification
   */
  async sendQuoteUpdateNotification(quoteNumber, status, message) {
    const payload = {
      title: `Quote ${quoteNumber} ${status}`,
      body: message,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: `quote-${quoteNumber}`,
      url: `/?quote=${quoteNumber}`,
      data: {
        quoteNumber,
        status,
        timestamp: new Date().toISOString()
      }
    };

    return this.sendToAll(payload);
  }

  /**
   * Send approval request notification
   */
  async sendApprovalRequestNotification(quoteNumber, requestedBy) {
    const payload = {
      title: '🔔 Approval Required',
      body: `Quote ${quoteNumber} requires your approval (requested by ${requestedBy})`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: 'approval-required',
      url: `/?view=approvals&quote=${quoteNumber}`,
      data: {
        type: 'approval_request',
        quoteNumber,
        requestedBy,
        timestamp: new Date().toISOString()
      }
    };

    return this.sendToAll(payload);
  }

  /**
   * Send follow-up reminder notification
   */
  async sendFollowUpReminderNotification(quoteNumber, customerName, daysOverdue) {
    const payload = {
      title: '📞 Follow-Up Reminder',
      body: `Quote ${quoteNumber} for ${customerName} needs follow-up (${daysOverdue} days overdue)`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: 'follow-up-reminder',
      url: `/?view=followups&quote=${quoteNumber}`,
      data: {
        type: 'follow_up_reminder',
        quoteNumber,
        customerName,
        daysOverdue,
        timestamp: new Date().toISOString()
      }
    };

    return this.sendToAll(payload);
  }

  /**
   * Get subscription count
   */
  async getSubscriptionCount() {
    try {
      const query = 'SELECT COUNT(*) as count FROM push_subscriptions';
      const result = await pool.query(query);
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting subscription count:', error);
      throw error;
    }
  }
}

module.exports = new PushNotificationService();
