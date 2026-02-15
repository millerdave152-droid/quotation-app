const webpush = require('web-push');
let pool = require('../db');

// Configure web-push with VAPID keys (skip if not configured)
if (process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('⚠️  VAPID keys not configured. Push notifications will be disabled.');
}

class PushNotificationService {
  /**
   * Subscribe a client to push notifications.
   * @param {object} subscription - Web Push subscription object
   * @param {string} userAgent
   * @param {number|null} userId - Owning user ID (for targeted push)
   */
  async subscribe(subscription, userAgent = '', userId = null) {
    try {
      const { endpoint, expirationTime, keys } = subscription;

      const query = `
        INSERT INTO push_subscriptions (endpoint, expiration_time, p256dh, auth, user_agent, user_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (endpoint)
        DO UPDATE SET
          expiration_time = EXCLUDED.expiration_time,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          user_agent = EXCLUDED.user_agent,
          user_id = EXCLUDED.user_id,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;

      const values = [
        endpoint,
        expirationTime || null,
        keys.p256dh,
        keys.auth,
        userAgent,
        userId,
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

  // =========================================================================
  // USER-TARGETED PUSH (for approval workflow)
  // =========================================================================

  /**
   * Get all push subscriptions for a specific user.
   */
  async getSubscriptionsForUser(userId) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM push_subscriptions WHERE user_id = $1`,
        [userId]
      );
      return rows.map(row => ({
        endpoint: row.endpoint,
        expirationTime: row.expiration_time,
        keys: { p256dh: row.p256dh, auth: row.auth },
      }));
    } catch (error) {
      console.error('[Push] Error fetching user subscriptions:', error.message);
      return [];
    }
  }

  /**
   * Get subscriptions for all users with given role(s), respecting quiet hours.
   */
  async getSubscriptionsForRoles(roles) {
    try {
      const { rows } = await pool.query(
        `SELECT ps.endpoint, ps.expiration_time, ps.p256dh, ps.auth, ps.user_id
         FROM push_subscriptions ps
         JOIN users u ON ps.user_id = u.id
         WHERE u.role = ANY($1::text[])
           AND ps.user_id IS NOT NULL`,
        [roles]
      );
      return rows.map(row => ({
        endpoint: row.endpoint,
        expirationTime: row.expiration_time,
        keys: { p256dh: row.p256dh, auth: row.auth },
        userId: row.user_id,
      }));
    } catch (error) {
      console.error('[Push] Error fetching role subscriptions:', error.message);
      return [];
    }
  }

  /**
   * Check if a user is in quiet hours. Returns true if notifications should be suppressed.
   */
  async isInQuietHours(userId) {
    try {
      const { rows } = await pool.query(
        `SELECT push_enabled, quiet_start, quiet_end
         FROM notification_preferences WHERE user_id = $1`,
        [userId]
      );
      if (rows.length === 0) return false; // No prefs = send everything
      const pref = rows[0];
      if (!pref.push_enabled) return true; // Push disabled entirely
      if (!pref.quiet_start || !pref.quiet_end) return false; // No quiet hours set

      // Check if current time (server local) falls within quiet window
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const [sh, sm] = pref.quiet_start.split(':').map(Number);
      const [eh, em] = pref.quiet_end.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;

      if (startMin <= endMin) {
        // Same-day range (e.g. 09:00-17:00)
        return nowMinutes >= startMin && nowMinutes < endMin;
      }
      // Overnight range (e.g. 22:00-07:00)
      return nowMinutes >= startMin || nowMinutes < endMin;
    } catch {
      return false; // On error, don't suppress
    }
  }

  /**
   * Send push to a specific user (all their subscriptions), respecting prefs.
   * Silently falls back if push fails.
   */
  async sendPushToUser(userId, payload) {
    try {
      if (await this.isInQuietHours(userId)) return { skipped: true, reason: 'quiet_hours' };

      const subs = await this.getSubscriptionsForUser(userId);
      if (subs.length === 0) return { skipped: true, reason: 'no_subscriptions' };

      let success = 0, failed = 0;
      for (const sub of subs) {
        try {
          await this.sendNotification(sub, payload);
          success++;
        } catch {
          failed++;
        }
      }
      return { success, failed };
    } catch (error) {
      console.error('[Push] sendPushToUser error:', error.message);
      return { skipped: true, reason: 'error' };
    }
  }

  /**
   * Send push to all users with given roles, respecting per-user prefs.
   */
  async sendPushToRoles(roles, payload) {
    try {
      const subs = await this.getSubscriptionsForRoles(roles);
      if (subs.length === 0) return { skipped: true, reason: 'no_subscriptions' };

      // Group by userId so we can check quiet hours per user
      const byUser = new Map();
      for (const sub of subs) {
        if (!byUser.has(sub.userId)) byUser.set(sub.userId, []);
        byUser.get(sub.userId).push(sub);
      }

      let success = 0, failed = 0, quietSkipped = 0;
      for (const [uid, userSubs] of byUser) {
        if (await this.isInQuietHours(uid)) { quietSkipped++; continue; }
        for (const sub of userSubs) {
          try {
            await this.sendNotification(sub, payload);
            success++;
          } catch {
            failed++;
          }
        }
      }
      return { success, failed, quietSkipped };
    } catch (error) {
      console.error('[Push] sendPushToRoles error:', error.message);
      return { skipped: true, reason: 'error' };
    }
  }

  /**
   * Send a price-override approval push to the assigned manager (or all managers).
   * Called by WebSocketService alongside the WS event.
   */
  async sendApprovalOverridePush({ managerId, salespersonName, productName, requestedPrice, originalPrice, requestId }) {
    const discountPct = originalPrice > 0
      ? Math.round(((originalPrice - requestedPrice) / originalPrice) * 100)
      : 0;

    const payload = {
      title: 'Price Override Request',
      body: `${salespersonName} requests $${Number(requestedPrice).toFixed(2)} on ${productName || 'a product'} (${discountPct}% off)`,
      icon: '/pos-icon.svg',
      badge: '/pos-icon.svg',
      tag: `approval-${requestId}`,
      url: '/?approvals=open',
      data: {
        type: 'approval_override',
        requestId,
        timestamp: new Date().toISOString(),
      },
    };

    if (managerId) {
      return this.sendPushToUser(managerId, payload);
    }
    return this.sendPushToRoles(['manager', 'senior_manager', 'admin'], payload);
  }

  /**
   * Get notification preferences for a user.
   */
  async getPreferences(userId) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM notification_preferences WHERE user_id = $1`,
        [userId]
      );
      if (rows.length > 0) return rows[0];
      // Return defaults
      return { user_id: userId, push_enabled: true, sound_enabled: true, quiet_start: null, quiet_end: null };
    } catch (error) {
      console.error('[Push] getPreferences error:', error.message);
      return { user_id: userId, push_enabled: true, sound_enabled: true, quiet_start: null, quiet_end: null };
    }
  }

  /**
   * Save notification preferences for a user.
   */
  async savePreferences(userId, { pushEnabled, soundEnabled, quietStart, quietEnd }) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO notification_preferences (user_id, push_enabled, sound_enabled, quiet_start, quiet_end, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           push_enabled  = EXCLUDED.push_enabled,
           sound_enabled = EXCLUDED.sound_enabled,
           quiet_start   = EXCLUDED.quiet_start,
           quiet_end     = EXCLUDED.quiet_end,
           updated_at    = NOW()
         RETURNING *`,
        [userId, pushEnabled ?? true, soundEnabled ?? true, quietStart || null, quietEnd || null]
      );
      return rows[0];
    } catch (error) {
      console.error('[Push] savePreferences error:', error.message);
      throw error;
    }
  }
}

PushNotificationService.prototype._setPool = function(p) { pool = p; };

module.exports = new PushNotificationService();
