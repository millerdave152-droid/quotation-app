/**
 * Notification Service
 * Handles in-app notifications for users
 */

class NotificationService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Create a notification for a user
   * @param {object} params - Notification parameters
   * @returns {Promise<object>} Created notification
   */
  async createNotification({
    userId,
    notificationType,
    title,
    message,
    icon = 'bell',
    relatedQuoteId = null,
    relatedCounterOfferId = null,
    relatedApprovalId = null,
    actionUrl = null,
    priority = 'normal'
  }) {
    const result = await this.pool.query(`
      INSERT INTO user_notifications (
        user_id, notification_type, title, message, icon,
        related_quote_id, related_counter_offer_id, related_approval_id,
        action_url, priority
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      userId, notificationType, title, message, icon,
      relatedQuoteId, relatedCounterOfferId, relatedApprovalId,
      actionUrl, priority
    ]);

    return result.rows[0];
  }

  /**
   * Create notifications for multiple users
   * @param {Array<number>} userIds - User IDs to notify
   * @param {object} notificationData - Notification data
   * @returns {Promise<number>} Number of notifications created
   */
  async createBulkNotifications(userIds, notificationData) {
    if (!userIds || userIds.length === 0) return 0;

    const {
      notificationType,
      title,
      message,
      icon = 'bell',
      relatedQuoteId = null,
      relatedCounterOfferId = null,
      relatedApprovalId = null,
      actionUrl = null,
      priority = 'normal'
    } = notificationData;

    // Build VALUES clause for bulk insert
    const values = [];
    const placeholders = userIds.map((userId, idx) => {
      const base = idx * 10;
      values.push(
        userId, notificationType, title, message, icon,
        relatedQuoteId, relatedCounterOfferId, relatedApprovalId,
        actionUrl, priority
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`;
    }).join(', ');

    const result = await this.pool.query(`
      INSERT INTO user_notifications (
        user_id, notification_type, title, message, icon,
        related_quote_id, related_counter_offer_id, related_approval_id,
        action_url, priority
      )
      VALUES ${placeholders}
    `, values);

    return result.rowCount;
  }

  /**
   * Get notifications for a user
   * @param {number} userId - User ID
   * @param {object} options - Query options
   * @returns {Promise<Array>} Notifications
   */
  async getUserNotifications(userId, options = {}) {
    const { limit = 50, unreadOnly = false, offset = 0 } = options;

    let query = `
      SELECT
        n.*,
        q.quote_number,
        q.customer_id
      FROM user_notifications n
      LEFT JOIN quotations q ON n.related_quote_id = q.id
      WHERE n.user_id = $1
    `;

    if (unreadOnly) {
      query += ` AND n.is_read = false`;
    }

    query += ` ORDER BY n.created_at DESC LIMIT $2 OFFSET $3`;

    const result = await this.pool.query(query, [userId, limit, offset]);
    return result.rows;
  }

  /**
   * Get unread notification count for a user
   * @param {number} userId - User ID
   * @returns {Promise<number>} Unread count
   */
  async getUnreadCount(userId) {
    const result = await this.pool.query(
      `SELECT COUNT(*) FROM user_notifications WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    return parseInt(result.rows[0].count) || 0;
  }

  /**
   * Mark a notification as read
   * @param {number} notificationId - Notification ID
   * @param {number} userId - User ID (for security)
   * @returns {Promise<boolean>}
   */
  async markAsRead(notificationId, userId) {
    const result = await this.pool.query(`
      UPDATE user_notifications
      SET is_read = true, read_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [notificationId, userId]);

    return result.rowCount > 0;
  }

  /**
   * Mark all notifications as read for a user
   * @param {number} userId - User ID
   * @returns {Promise<number>} Number of notifications marked
   */
  async markAllAsRead(userId) {
    const result = await this.pool.query(`
      UPDATE user_notifications
      SET is_read = true, read_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND is_read = false
    `, [userId]);

    return result.rowCount;
  }

  /**
   * Delete old notifications
   * @param {number} daysOld - Delete notifications older than this many days
   * @returns {Promise<number>} Number of notifications deleted
   */
  async cleanupOldNotifications(daysOld = 30) {
    const result = await this.pool.query(`
      DELETE FROM user_notifications
      WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'
        AND is_read = true
    `);

    return result.rowCount;
  }

  // ============================================
  // NOTIFICATION TEMPLATES
  // ============================================

  /**
   * Notify supervisors about a new approval request
   */
  async notifyApprovalRequest(quoteId, quoteName, requestedBy) {
    // Get all users who can approve
    const approvers = await this.pool.query(`
      SELECT id FROM users
      WHERE can_approve_quotes = true AND is_active = true
    `);

    const approverIds = approvers.rows.map(u => u.id);
    if (approverIds.length === 0) return 0;

    return this.createBulkNotifications(approverIds, {
      notificationType: 'approval_request',
      title: 'Approval Request',
      message: `${requestedBy} has requested approval for ${quoteName}`,
      icon: 'Request',
      relatedQuoteId: quoteId,
      actionUrl: `/quotes/${quoteId}`,
      priority: 'high'
    });
  }

  /**
   * Notify user about approval decision
   */
  async notifyApprovalDecision(userId, quoteId, quoteName, approved, approverName) {
    return this.createNotification({
      userId,
      notificationType: approved ? 'approval_approved' : 'approval_rejected',
      title: approved ? 'Quote Approved' : 'Quote Rejected',
      message: `${quoteName} was ${approved ? 'approved' : 'rejected'} by ${approverName}`,
      icon: approved ? 'Approved' : 'Rejected',
      relatedQuoteId: quoteId,
      actionUrl: `/quotes/${quoteId}`,
      priority: approved ? 'normal' : 'high'
    });
  }

  /**
   * Notify about new counter-offer
   */
  async notifyCounterOffer(userId, quoteId, quoteName, counterOfferAmount, fromType) {
    return this.createNotification({
      userId,
      notificationType: 'counter_offer',
      title: 'Counter-Offer Received',
      message: `New counter-offer on ${quoteName}: $${(counterOfferAmount / 100).toFixed(2)} from ${fromType}`,
      icon: 'Offer',
      relatedQuoteId: quoteId,
      actionUrl: `/quotes/${quoteId}`,
      priority: 'high'
    });
  }

  /**
   * Notify supervisors about counter-offer needing response
   */
  async notifySupervisorsCounterOffer(quoteId, quoteName, counterOfferAmount, customerName) {
    const approvers = await this.pool.query(`
      SELECT id FROM users
      WHERE can_approve_quotes = true AND is_active = true
    `);

    const approverIds = approvers.rows.map(u => u.id);
    if (approverIds.length === 0) return 0;

    return this.createBulkNotifications(approverIds, {
      notificationType: 'counter_offer_pending',
      title: 'Counter-Offer Needs Review',
      message: `${customerName} has submitted a counter-offer of $${(counterOfferAmount / 100).toFixed(2)} on ${quoteName}`,
      icon: 'Review',
      relatedQuoteId: quoteId,
      actionUrl: `/quotes/${quoteId}`,
      priority: 'high'
    });
  }

  /**
   * Notify about quote status change
   */
  async notifyQuoteStatusChange(userId, quoteId, quoteName, newStatus) {
    const statusMessages = {
      WON: { title: 'Quote Won!', icon: 'Won', priority: 'high' },
      LOST: { title: 'Quote Lost', icon: 'Lost', priority: 'normal' },
      SENT: { title: 'Quote Sent', icon: 'Sent', priority: 'normal' },
      APPROVED: { title: 'Quote Approved', icon: 'Approved', priority: 'normal' }
    };

    const statusInfo = statusMessages[newStatus] || {
      title: 'Quote Updated',
      icon: 'Update',
      priority: 'low'
    };

    return this.createNotification({
      userId,
      notificationType: `quote_${newStatus.toLowerCase()}`,
      title: statusInfo.title,
      message: `${quoteName} is now ${newStatus}`,
      icon: statusInfo.icon,
      relatedQuoteId: quoteId,
      actionUrl: `/quotes/${quoteId}`,
      priority: statusInfo.priority
    });
  }
}

module.exports = NotificationService;
