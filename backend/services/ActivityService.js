/**
 * Activity Service
 *
 * Comprehensive activity tracking for quotes.
 * Handles logging, retrieval, and analytics for all quote-related activities.
 */

class ActivityService {
  constructor(pool) {
    this.pool = pool;
  }

  // Activity type constants
  static TYPES = {
    // Quote lifecycle
    CREATED: 'CREATED',
    UPDATED: 'UPDATED',
    DELETED: 'DELETED',
    DUPLICATED: 'DUPLICATED',

    // Status changes
    STATUS_CHANGED: 'STATUS_CHANGED',
    SENT: 'SENT',
    WON: 'WON',
    LOST: 'LOST',

    // Communication
    EMAIL_SENT: 'EMAIL_SENT',
    EMAIL_OPENED: 'EMAIL_OPENED',
    CUSTOMER_VIEWED: 'CUSTOMER_VIEWED',
    FOLLOW_UP_SCHEDULED: 'FOLLOW_UP_SCHEDULED',
    FOLLOW_UP_COMPLETED: 'FOLLOW_UP_COMPLETED',
    CUSTOMER_CONTACTED: 'CUSTOMER_CONTACTED',

    // Editing
    ITEMS_ADDED: 'ITEMS_ADDED',
    ITEMS_REMOVED: 'ITEMS_REMOVED',
    PRICE_ADJUSTED: 'PRICE_ADJUSTED',
    DISCOUNT_APPLIED: 'DISCOUNT_APPLIED',
    TERMS_UPDATED: 'TERMS_UPDATED',

    // Approvals
    APPROVAL_REQUESTED: 'APPROVAL_REQUESTED',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',

    // Notes & Comments
    NOTE_ADDED: 'NOTE_ADDED',
    INTERNAL_NOTE: 'INTERNAL_NOTE',
    COMMENT: 'COMMENT',

    // Documents
    PDF_GENERATED: 'PDF_GENERATED',
    PDF_DOWNLOADED: 'PDF_DOWNLOADED',
    DOCUMENT_ATTACHED: 'DOCUMENT_ATTACHED',

    // Other
    CUSTOMER_ASSIGNED: 'CUSTOMER_ASSIGNED',
    EXPIRY_WARNING: 'EXPIRY_WARNING',
    RECALCULATED: 'RECALCULATED'
  };

  // Activity categories
  static CATEGORIES = {
    LIFECYCLE: 'lifecycle',
    STATUS: 'status',
    COMMUNICATION: 'communication',
    EDITING: 'editing',
    APPROVAL: 'approval',
    NOTES: 'notes',
    DOCUMENTS: 'documents',
    SYSTEM: 'system'
  };

  // Get category for event type
  static getCategoryForType(eventType) {
    const typeToCategory = {
      CREATED: 'lifecycle',
      UPDATED: 'lifecycle',
      DELETED: 'lifecycle',
      DUPLICATED: 'lifecycle',
      STATUS_CHANGED: 'status',
      SENT: 'status',
      WON: 'status',
      LOST: 'status',
      EMAIL_SENT: 'communication',
      EMAIL_OPENED: 'communication',
      CUSTOMER_VIEWED: 'communication',
      FOLLOW_UP_SCHEDULED: 'communication',
      FOLLOW_UP_COMPLETED: 'communication',
      CUSTOMER_CONTACTED: 'communication',
      ITEMS_ADDED: 'editing',
      ITEMS_REMOVED: 'editing',
      PRICE_ADJUSTED: 'editing',
      DISCOUNT_APPLIED: 'editing',
      TERMS_UPDATED: 'editing',
      APPROVAL_REQUESTED: 'approval',
      APPROVED: 'approval',
      REJECTED: 'approval',
      NOTE_ADDED: 'notes',
      INTERNAL_NOTE: 'notes',
      COMMENT: 'notes',
      PDF_GENERATED: 'documents',
      PDF_DOWNLOADED: 'documents',
      DOCUMENT_ATTACHED: 'documents',
      CUSTOMER_ASSIGNED: 'lifecycle',
      EXPIRY_WARNING: 'system',
      RECALCULATED: 'system'
    };
    return typeToCategory[eventType] || 'general';
  }

  // Icon mapping for event types
  static getIconForType(eventType) {
    const icons = {
      CREATED: '✨',
      UPDATED: '✏️',
      DELETED: '🗑️',
      DUPLICATED: '📋',
      STATUS_CHANGED: '🔄',
      SENT: '📤',
      WON: '🏆',
      LOST: '❌',
      EMAIL_SENT: '📧',
      EMAIL_OPENED: '👁️',
      CUSTOMER_VIEWED: '👀',
      FOLLOW_UP_SCHEDULED: '📅',
      FOLLOW_UP_COMPLETED: '✅',
      CUSTOMER_CONTACTED: '📞',
      ITEMS_ADDED: '➕',
      ITEMS_REMOVED: '➖',
      PRICE_ADJUSTED: '💰',
      DISCOUNT_APPLIED: '🏷️',
      TERMS_UPDATED: '📝',
      APPROVAL_REQUESTED: '⏳',
      APPROVED: '✅',
      REJECTED: '❌',
      NOTE_ADDED: '📝',
      INTERNAL_NOTE: '🔒',
      COMMENT: '💬',
      PDF_GENERATED: '📄',
      PDF_DOWNLOADED: '⬇️',
      DOCUMENT_ATTACHED: '📎',
      CUSTOMER_ASSIGNED: '👤',
      EXPIRY_WARNING: '⚠️',
      RECALCULATED: '🔢'
    };
    return icons[eventType] || '📌';
  }

  /**
   * Log an activity
   * @param {object} params - Activity parameters
   * @returns {Promise<object>}
   */
  async logActivity({
    quoteId,
    eventType,
    description,
    userName = 'System',
    userId = null,
    metadata = {},
    isInternal = true,
    ipAddress = null
  }) {
    const category = ActivityService.getCategoryForType(eventType);

    const result = await this.pool.query(`
      INSERT INTO quote_events (
        quotation_id, event_type, description, user_name, user_id,
        metadata, is_internal, ip_address, activity_category
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      quoteId,
      eventType,
      description,
      userName,
      userId,
      JSON.stringify(metadata),
      isInternal,
      ipAddress,
      category
    ]);

    return result.rows[0];
  }

  /**
   * Log quote creation
   */
  async logQuoteCreated(quoteId, quoteNumber, userName = 'User', metadata = {}) {
    return this.logActivity({
      quoteId,
      eventType: ActivityService.TYPES.CREATED,
      description: `Quote ${quoteNumber} created`,
      userName,
      metadata: { quoteNumber, ...metadata }
    });
  }

  /**
   * Log quote update
   */
  async logQuoteUpdated(quoteId, userName = 'User', changes = {}) {
    const changeDescriptions = [];

    if (changes.itemsAdded) changeDescriptions.push(`${changes.itemsAdded} item(s) added`);
    if (changes.itemsRemoved) changeDescriptions.push(`${changes.itemsRemoved} item(s) removed`);
    if (changes.discountChanged) changeDescriptions.push(`Discount updated to ${changes.discountChanged}%`);
    if (changes.notesChanged) changeDescriptions.push('Notes updated');
    if (changes.termsChanged) changeDescriptions.push('Terms updated');
    if (changes.customerChanged) changeDescriptions.push('Customer changed');

    const description = changeDescriptions.length > 0
      ? `Quote updated: ${changeDescriptions.join(', ')}`
      : 'Quote updated';

    return this.logActivity({
      quoteId,
      eventType: ActivityService.TYPES.UPDATED,
      description,
      userName,
      metadata: changes
    });
  }

  /**
   * Log status change
   */
  async logStatusChange(quoteId, oldStatus, newStatus, userName = 'User', reason = null) {
    let description = `Status changed from ${oldStatus} to ${newStatus}`;
    if (reason) description += `. Reason: ${reason}`;

    return this.logActivity({
      quoteId,
      eventType: ActivityService.TYPES.STATUS_CHANGED,
      description,
      userName,
      metadata: { oldStatus, newStatus, reason }
    });
  }

  /**
   * Log email sent
   */
  async logEmailSent(quoteId, recipientEmail, subject, userName = 'User') {
    return this.logActivity({
      quoteId,
      eventType: ActivityService.TYPES.EMAIL_SENT,
      description: `Email sent to ${recipientEmail}`,
      userName,
      metadata: { recipientEmail, subject },
      isInternal: false
    });
  }

  /**
   * Log customer viewed quote
   */
  async logCustomerViewed(quoteId, customerName = 'Customer', ipAddress = null) {
    return this.logActivity({
      quoteId,
      eventType: ActivityService.TYPES.CUSTOMER_VIEWED,
      description: `Quote viewed by ${customerName}`,
      userName: customerName,
      ipAddress,
      isInternal: false,
      metadata: { viewedAt: new Date().toISOString() }
    });
  }

  /**
   * Log follow-up scheduled
   */
  async logFollowUpScheduled(quoteId, followUpDate, description, userName = 'User') {
    return this.logActivity({
      quoteId,
      eventType: ActivityService.TYPES.FOLLOW_UP_SCHEDULED,
      description: `Follow-up scheduled for ${new Date(followUpDate).toLocaleDateString()}: ${description}`,
      userName,
      metadata: { followUpDate, description }
    });
  }

  /**
   * Log customer contacted
   */
  async logCustomerContacted(quoteId, contactMethod, notes, userName = 'User') {
    return this.logActivity({
      quoteId,
      eventType: ActivityService.TYPES.CUSTOMER_CONTACTED,
      description: `Customer contacted via ${contactMethod}${notes ? `: ${notes}` : ''}`,
      userName,
      metadata: { contactMethod, notes }
    });
  }

  /**
   * Log price adjustment
   */
  async logPriceAdjusted(quoteId, itemModel, oldPrice, newPrice, reason, userName = 'User') {
    const oldPriceStr = `$${(oldPrice / 100).toFixed(2)}`;
    const newPriceStr = `$${(newPrice / 100).toFixed(2)}`;

    return this.logActivity({
      quoteId,
      eventType: ActivityService.TYPES.PRICE_ADJUSTED,
      description: `Price adjusted for ${itemModel}: ${oldPriceStr} → ${newPriceStr}${reason ? ` (${reason})` : ''}`,
      userName,
      metadata: { itemModel, oldPriceCents: oldPrice, newPriceCents: newPrice, reason }
    });
  }

  /**
   * Log note added
   */
  async logNoteAdded(quoteId, note, isInternal = true, userName = 'User') {
    return this.logActivity({
      quoteId,
      eventType: isInternal ? ActivityService.TYPES.INTERNAL_NOTE : ActivityService.TYPES.NOTE_ADDED,
      description: note,
      userName,
      isInternal,
      metadata: { noteType: isInternal ? 'internal' : 'general' }
    });
  }

  /**
   * Log approval request
   */
  async logApprovalRequested(quoteId, approverName, reason, userName = 'User') {
    return this.logActivity({
      quoteId,
      eventType: ActivityService.TYPES.APPROVAL_REQUESTED,
      description: `Approval requested from ${approverName}. Reason: ${reason}`,
      userName,
      metadata: { approverName, reason }
    });
  }

  /**
   * Log approval decision
   */
  async logApprovalDecision(quoteId, approved, approverName, comments = '') {
    const eventType = approved ? ActivityService.TYPES.APPROVED : ActivityService.TYPES.REJECTED;
    const description = approved
      ? `Approved by ${approverName}${comments ? `: ${comments}` : ''}`
      : `Rejected by ${approverName}${comments ? `: ${comments}` : ''}`;

    return this.logActivity({
      quoteId,
      eventType,
      description,
      userName: approverName,
      metadata: { approved, approverName, comments }
    });
  }

  /**
   * Log PDF generated/downloaded
   */
  async logPdfAction(quoteId, action, pdfType = 'customer', userName = 'User') {
    const eventType = action === 'downloaded'
      ? ActivityService.TYPES.PDF_DOWNLOADED
      : ActivityService.TYPES.PDF_GENERATED;

    return this.logActivity({
      quoteId,
      eventType,
      description: `${pdfType.charAt(0).toUpperCase() + pdfType.slice(1)} PDF ${action}`,
      userName,
      metadata: { pdfType, action }
    });
  }

  /**
   * Get activities for a quote
   * @param {number} quoteId - Quote ID
   * @param {object} options - Filter options
   * @returns {Promise<Array>}
   */
  async getActivities(quoteId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      category = null,
      eventType = null,
      includeInternal = true,
      startDate = null,
      endDate = null
    } = options;

    let whereConditions = ['quotation_id = $1'];
    let params = [quoteId];
    let paramIndex = 2;

    if (category) {
      whereConditions.push(`activity_category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    if (eventType) {
      whereConditions.push(`event_type = $${paramIndex}`);
      params.push(eventType);
      paramIndex++;
    }

    if (!includeInternal) {
      whereConditions.push('is_internal = FALSE');
    }

    if (startDate) {
      whereConditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereConditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const result = await this.pool.query(`
      SELECT
        id,
        quotation_id,
        event_type,
        description,
        user_name,
        user_id,
        metadata,
        is_internal,
        ip_address,
        activity_category,
        created_at
      FROM quote_events
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    // Parse metadata and add icon
    return result.rows.map(row => ({
      ...row,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      icon: ActivityService.getIconForType(row.event_type)
    }));
  }

  /**
   * Get activity count for a quote
   */
  async getActivityCount(quoteId) {
    const result = await this.pool.query(`
      SELECT COUNT(*) as count FROM quote_events WHERE quotation_id = $1
    `, [quoteId]);

    return parseInt(result.rows[0].count);
  }

  /**
   * Get activity summary for a quote
   */
  async getActivitySummary(quoteId) {
    const result = await this.pool.query(`
      SELECT
        activity_category,
        COUNT(*) as count
      FROM quote_events
      WHERE quotation_id = $1
      GROUP BY activity_category
      ORDER BY count DESC
    `, [quoteId]);

    const summary = {
      total: 0,
      byCategory: {}
    };

    result.rows.forEach(row => {
      summary.byCategory[row.activity_category] = parseInt(row.count);
      summary.total += parseInt(row.count);
    });

    return summary;
  }

  /**
   * Get recent activities across all quotes
   */
  async getRecentActivities(limit = 20, options = {}) {
    const { userId = null, category = null } = options;

    let whereConditions = ['1=1'];
    let params = [];
    let paramIndex = 1;

    if (userId) {
      whereConditions.push(`user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    if (category) {
      whereConditions.push(`activity_category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    const result = await this.pool.query(`
      SELECT
        qe.*,
        q.quote_number,
        c.name as customer_name
      FROM quote_events qe
      LEFT JOIN quotations q ON qe.quotation_id = q.id
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY qe.created_at DESC
      LIMIT $${paramIndex}
    `, [...params, limit]);

    return result.rows.map(row => ({
      ...row,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      icon: ActivityService.getIconForType(row.event_type)
    }));
  }

  /**
   * Delete old activities (for cleanup)
   */
  async deleteOldActivities(olderThanDays = 365) {
    // SECURITY FIX: Use parameterized query to prevent SQL injection
    // Validate input is a positive integer
    const days = parseInt(olderThanDays, 10);
    if (isNaN(days) || days < 1) {
      throw new Error('olderThanDays must be a positive integer');
    }

    const result = await this.pool.query(`
      DELETE FROM quote_events
      WHERE created_at < NOW() - INTERVAL '1 day' * $1
      AND event_type NOT IN ('CREATED', 'STATUS_CHANGED', 'WON', 'LOST')
      RETURNING id
    `, [days]);

    return result.rowCount;
  }
}

module.exports = ActivityService;
