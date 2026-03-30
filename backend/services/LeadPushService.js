/**
 * LeadPushService
 * Sends targeted Web Push notifications for lead pipeline lifecycle events.
 * Wraps the platform's web-push library with lead-specific payload building,
 * push_notifications_enabled gating, and expired-subscription cleanup.
 *
 * All methods are fire-and-forget — errors are logged, never thrown.
 * Guarded by WEB_PUSH_ENABLED env var (set false in dev/test).
 */

const webpush = require('web-push');
const logger = require('../utils/logger');

const WEB_PUSH_ENABLED = process.env.WEB_PUSH_ENABLED === 'true';

class LeadPushService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Send a push notification to all active subscriptions for a user.
   * Checks push_notifications_enabled on users table.
   * Cleans up expired subscriptions (410/404).
   * Updates last_used_at on successful send.
   * @returns {{ sent: number, failed: number, suppressed: number }}
   */
  async sendToUser(userId, payload) {
    if (!WEB_PUSH_ENABLED) return { sent: 0, failed: 0, suppressed: 1, status: 'suppressed' };
    if (!userId) return { sent: 0, failed: 0, suppressed: 0 };

    try {
      // Check push_notifications_enabled
      const userResult = await this.pool.query(
        'SELECT push_notifications_enabled FROM users WHERE id = $1',
        [userId]
      );
      if (userResult.rows.length === 0 || !userResult.rows[0].push_notifications_enabled) {
        logger.info({ userId }, '[LeadPush] Suppressed — push not enabled');
        return { sent: 0, failed: 0, suppressed: 1 };
      }

      // Fetch all subscriptions for user
      const subsResult = await this.pool.query(
        'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
        [userId]
      );
      if (subsResult.rows.length === 0) {
        return { sent: 0, failed: 0, suppressed: 0 };
      }

      let sent = 0;
      let failed = 0;

      for (const sub of subsResult.rows) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
            { TTL: 3600 }
          );
          sent++;

          // Update last_used_at
          await this.pool.query(
            'UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = $1',
            [sub.id]
          ).catch(() => {});
        } catch (err) {
          // Expired subscription — delete it
          if (err.statusCode === 410 || err.statusCode === 404) {
            logger.info({ subId: sub.id, endpoint: sub.endpoint }, '[LeadPush] Subscription expired, removing');
            await this.pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {});
          } else {
            logger.error({ err, subId: sub.id }, '[LeadPush] Send failed');
          }
          failed++;
        }
      }

      return { sent, failed, suppressed: 0 };
    } catch (err) {
      logger.error({ err, userId }, '[LeadPush] sendToUser error');
      return { sent: 0, failed: 0, suppressed: 0 };
    }
  }

  /**
   * Send push to all staff at a store location.
   * @returns {{ sent: number, failed: number, suppressed: number }}
   */
  async sendToStore(storeLocationId, payload) {
    if (!WEB_PUSH_ENABLED) return { sent: 0, failed: 0, suppressed: 1, status: 'suppressed' };

    try {
      const usersResult = await this.pool.query(`
        SELECT u.id FROM users u
        WHERE u.is_active = true
          AND EXISTS (
            SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = u.id
          )
      `);

      let totalSent = 0;
      let totalFailed = 0;
      let totalSuppressed = 0;

      for (const user of usersResult.rows) {
        const r = await this.sendToUser(user.id, payload);
        totalSent += r.sent;
        totalFailed += r.failed;
        totalSuppressed += r.suppressed;
      }

      return { sent: totalSent, failed: totalFailed, suppressed: totalSuppressed };
    } catch (err) {
      logger.error({ err, storeLocationId }, '[LeadPush] sendToStore error');
      return { sent: 0, failed: 0, suppressed: 0 };
    }
  }

  /**
   * Build the push payload for a lead event.
   * Body text kept under 100 characters.
   * requireInteraction = true only for expiry-warning and quote-expired.
   * @param {string} templateId
   * @param {object} leadData — { id, customerName, quoteNumber, quoteTotal, expiryDate, daysLeft, time }
   * @returns {object} Push payload
   */
  buildPayload(templateId, leadData) {
    const leadId = leadData.id || leadData.leadId || 0;
    const name = leadData.customerName || 'Customer';
    const quoteNum = leadData.quoteNumber || '';
    const total = leadData.quoteTotal || '';
    const daysLeft = leadData.daysLeft;
    const time = leadData.time || '';
    const expiryDate = leadData.expiryDate || '';

    const baseData = {
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: `lead-${leadId}`,
      requireInteraction: false,
      data: {
        url: `/leads/${leadId}`,
        leadId,
        templateId
      }
    };

    const templates = {
      'lead-created': {
        ...baseData,
        title: 'New Lead',
        body: `${name} \u2014 Quote #${quoteNum}${total ? ' (' + total + ')' : ''}`.slice(0, 100)
      },
      'no-followup-nudge': {
        ...baseData,
        title: 'Follow Up Needed',
        body: `${name} \u00B7 Quote expires ${expiryDate}`.slice(0, 100)
      },
      'expiry-warning': {
        ...baseData,
        title: '\u26A0\uFE0F Quote Expiring',
        body: `${name} \u00B7 ${daysLeft != null ? daysLeft + ' days left on' : ''} Quote #${quoteNum}`.slice(0, 100),
        requireInteraction: true
      },
      'quote-expired': {
        ...baseData,
        title: 'Quote Expired',
        body: `${name} \u00B7 Lead still open`.slice(0, 100),
        requireInteraction: true
      },
      'followup-reminder': {
        ...baseData,
        title: 'Follow-Up Today',
        body: `${name}${time ? ' at ' + time : ''} \u00B7 Tap to view`.slice(0, 100)
      }
    };

    return templates[templateId] || {
      ...baseData,
      title: 'Lead Update',
      body: name.slice(0, 100)
    };
  }
}

module.exports = LeadPushService;
