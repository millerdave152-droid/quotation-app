/**
 * ReminderService
 * Generates and manages in-app reminders for the lead pipeline.
 *
 * Trigger rules:
 *   state_stale  — lead in 'new'/'quoted' > 3 days, no completed follow-up
 *   quote_expiry — primary quote expires within 3 days, lead not terminal
 *   no_contact   — lead in 'quoted' > 2 days, zero follow-up records
 *   manual       — created by staff action
 */

const logger = require('../utils/logger');

class ReminderService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Evaluate a single lead and insert any missing in_app reminders.
   * @param {number} leadId
   * @returns {{ evaluated: boolean, created: number }}
   */
  async generateRemindersForLead(leadId) {
    const leadResult = await this.pool.query(`
      SELECT
        l.id, l.status, l.assigned_to, l.created_at,
        (SELECT COUNT(*) FROM lead_followups WHERE lead_id = l.id) AS followup_count,
        (SELECT COUNT(*) FROM lead_followups WHERE lead_id = l.id AND completed_at IS NOT NULL) AS completed_followup_count,
        (
          SELECT q.expires_at
          FROM lead_quotes lq
          JOIN quotations q ON lq.quote_id = q.id
          WHERE lq.lead_id = l.id AND lq.is_primary = true
          ORDER BY lq.linked_at DESC
          LIMIT 1
        ) AS primary_quote_expires_at
      FROM leads l
      WHERE l.id = $1
    `, [leadId]);

    if (leadResult.rows.length === 0) return { evaluated: false, created: 0 };

    const lead = leadResult.rows[0];
    const terminalStatuses = ['won', 'lost', 'expired', 'converted'];
    if (terminalStatuses.includes(lead.status)) return { evaluated: true, created: 0 };

    let created = 0;

    // Rule 1: state_stale — in 'new' or 'quoted' for > 3 days with no completed follow-up
    if (['new', 'quoted'].includes(lead.status)) {
      const ageMs = Date.now() - new Date(lead.created_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays > 3 && parseInt(lead.completed_followup_count) === 0) {
        const inserted = await this._insertIfNotDuplicate(leadId, 'state_stale', lead.assigned_to,
          `Lead has been in "${lead.status}" status for ${Math.floor(ageDays)} days with no completed follow-up`);
        if (inserted) created++;
      }
    }

    // Rule 2: quote_expiry — primary quote expires within 3 days
    if (lead.primary_quote_expires_at) {
      const expiresAt = new Date(lead.primary_quote_expires_at);
      const daysUntilExpiry = (expiresAt - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysUntilExpiry <= 3 && daysUntilExpiry > -30) {
        const label = daysUntilExpiry < 0
          ? `Quote expired ${Math.abs(Math.floor(daysUntilExpiry))} day(s) ago`
          : daysUntilExpiry < 1
            ? 'Quote expires today'
            : `Quote expires in ${Math.ceil(daysUntilExpiry)} day(s)`;
        const inserted = await this._insertIfNotDuplicate(leadId, 'quote_expiry', lead.assigned_to, label);
        if (inserted) {
          created++;
          // Queue expiry-warning email for staff + store manager
          await this._queueEmailReminder(leadId, 'quote_expiry', lead.assigned_to, label);
          // Push notification
          this._sendPush('expiry-warning', leadId, lead.assigned_to, {
            customerName: lead.contact_name, daysLeft: Math.ceil(daysUntilExpiry)
          });
        }
      }
    }

    // Rule 3: no_contact — in 'quoted' for > 2 days with zero follow-up records
    if (lead.status === 'quoted') {
      const ageMs = Date.now() - new Date(lead.created_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays > 2 && parseInt(lead.followup_count) === 0) {
        const inserted = await this._insertIfNotDuplicate(leadId, 'no_contact', lead.assigned_to,
          `Lead has been quoted for ${Math.floor(ageDays)} days with no follow-up scheduled`);
        if (inserted) {
          created++;
          // Queue no-followup-nudge email
          await this._queueEmailReminder(leadId, 'no_contact', lead.assigned_to,
            `Lead has been quoted for ${Math.floor(ageDays)} days with no follow-up scheduled`);
          // Push notification
          this._sendPush('no-followup-nudge', leadId, lead.assigned_to, {
            customerName: lead.contact_name
          });
        }
      }
    }

    return { evaluated: true, created };
  }

  /**
   * Insert a reminder only if no unacknowledged reminder of the same trigger_type exists.
   * @returns {boolean} true if inserted
   */
  async _insertIfNotDuplicate(leadId, triggerType, recipientUserId, messageBody) {
    // Check for existing unacknowledged reminder of same type
    const existing = await this.pool.query(`
      SELECT id FROM lead_reminders
      WHERE lead_id = $1 AND trigger_type = $2 AND acknowledged_at IS NULL
      LIMIT 1
    `, [leadId, triggerType]);

    if (existing.rows.length > 0) return false;

    await this.pool.query(`
      INSERT INTO lead_reminders (lead_id, reminder_type, trigger_type, scheduled_at, recipient_user_id, message_body)
      VALUES ($1, 'in_app', $2, NOW(), $3, $4)
    `, [leadId, triggerType, recipientUserId || null, messageBody || null]);

    return true;
  }

  /**
   * Queue an email-type reminder for later processing by processEmailQueue.
   * Fire-and-forget — errors are logged, not thrown.
   */
  async _queueEmailReminder(leadId, triggerType, recipientUserId, messageBody) {
    try {
      // Check for existing unsent email reminder of same type
      const existing = await this.pool.query(`
        SELECT id FROM lead_reminders
        WHERE lead_id = $1 AND trigger_type = $2 AND reminder_type = 'email' AND sent_at IS NULL
        LIMIT 1
      `, [leadId, triggerType]);

      if (existing.rows.length > 0) return;

      await this.pool.query(`
        INSERT INTO lead_reminders (lead_id, reminder_type, trigger_type, scheduled_at, recipient_user_id, message_body)
        VALUES ($1, 'email', $2, NOW(), $3, $4)
      `, [leadId, triggerType, recipientUserId || null, messageBody || null]);
    } catch (err) {
      logger.error({ err, leadId, triggerType }, '[ReminderService] Failed to queue email reminder');
    }
  }

  /**
   * Fire-and-forget push notification via LeadPushService.
   */
  _sendPush(templateId, leadId, recipientUserId, context) {
    try {
      const LeadPushService = require('./LeadPushService');
      const pushSvc = new LeadPushService(this.pool);
      const payload = pushSvc.buildPayload(templateId, { id: leadId, ...context });
      pushSvc.sendToUser(recipientUserId, payload)
        .catch(err => logger.error({ err, templateId, leadId }, '[ReminderService] Push failed'));
    } catch (err) {
      logger.error({ err, templateId, leadId }, '[ReminderService] Push init failed');
    }
  }

  /**
   * Generate reminders for all open leads in a store.
   * @param {number} storeLocationId
   * @returns {{ evaluated: number, created: number }}
   */
  async generateStoreReminders(storeLocationId) {
    const result = await this.pool.query(`
      SELECT id FROM leads
      WHERE store_location_id = $1
        AND status NOT IN ('won', 'lost', 'expired', 'converted')
    `, [storeLocationId]);

    let evaluated = 0;
    let created = 0;

    for (const row of result.rows) {
      const r = await this.generateRemindersForLead(row.id);
      if (r.evaluated) evaluated++;
      created += r.created;
    }

    return { evaluated, created };
  }

  /**
   * Generate reminders for ALL active stores.
   * @returns {{ stores: number, evaluated: number, created: number }}
   */
  async generateAllStoreReminders() {
    const storesResult = await this.pool.query(
      "SELECT id FROM locations WHERE is_active = true"
    );

    let totalEvaluated = 0;
    let totalCreated = 0;

    for (const store of storesResult.rows) {
      try {
        const r = await this.generateStoreReminders(store.id);
        totalEvaluated += r.evaluated;
        totalCreated += r.created;
      } catch (err) {
        logger.error({ err, storeId: store.id }, '[ReminderService] Failed for store');
      }
    }

    return { stores: storesResult.rows.length, evaluated: totalEvaluated, created: totalCreated };
  }

  /**
   * Acknowledge a reminder.
   * @param {number} reminderId
   * @param {number} userId
   * @returns {object} Updated reminder
   */
  async acknowledgeReminder(reminderId, userId) {
    // Verify the reminder exists and belongs to this user
    const check = await this.pool.query(
      'SELECT id, recipient_user_id FROM lead_reminders WHERE id = $1',
      [reminderId]
    );

    if (check.rows.length === 0) {
      throw new Error('Reminder not found');
    }

    if (check.rows[0].recipient_user_id && check.rows[0].recipient_user_id !== userId) {
      throw new Error('Forbidden');
    }

    const result = await this.pool.query(`
      UPDATE lead_reminders
      SET acknowledged_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [reminderId]);

    return result.rows[0];
  }

  /**
   * Get all unacknowledged in_app reminders for a user.
   * Includes lead summary (customer name, status, store) and linked quote info.
   * @param {number} userId
   * @returns {Array}
   */
  async getUnacknowledgedRemindersForUser(userId) {
    const result = await this.pool.query(`
      SELECT
        r.id, r.lead_id, r.reminder_type, r.trigger_type,
        r.scheduled_at, r.message_body, r.created_at,
        l.status AS lead_status,
        l.contact_name AS customer_name,
        l.contact_phone AS customer_phone,
        loc.name AS store_location_name,
        (
          SELECT json_build_object(
            'id', q.id,
            'quote_number', q.quote_number,
            'total_cents', q.total_cents,
            'expires_at', q.expires_at
          )
          FROM lead_quotes lq
          JOIN quotations q ON lq.quote_id = q.id
          WHERE lq.lead_id = l.id AND lq.is_primary = true
          LIMIT 1
        ) AS primary_quote
      FROM lead_reminders r
      JOIN leads l ON r.lead_id = l.id
      LEFT JOIN locations loc ON l.store_location_id = loc.id
      WHERE r.recipient_user_id = $1
        AND r.acknowledged_at IS NULL
        AND r.reminder_type = 'in_app'
        AND r.scheduled_at <= NOW()
      ORDER BY r.scheduled_at ASC
    `, [userId]);

    return result.rows;
  }

  /**
   * Manager view: all unacknowledged reminders for a store.
   * @param {number} storeLocationId
   * @returns {Array}
   */
  async getUnacknowledgedRemindersForStore(storeLocationId) {
    const result = await this.pool.query(`
      SELECT
        r.id, r.lead_id, r.reminder_type, r.trigger_type,
        r.scheduled_at, r.message_body, r.created_at,
        r.recipient_user_id,
        l.status AS lead_status,
        l.contact_name AS customer_name,
        l.contact_phone AS customer_phone,
        NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS assigned_staff_name,
        loc.name AS store_location_name,
        (
          SELECT json_build_object(
            'id', q.id,
            'quote_number', q.quote_number,
            'total_cents', q.total_cents,
            'expires_at', q.expires_at
          )
          FROM lead_quotes lq
          JOIN quotations q ON lq.quote_id = q.id
          WHERE lq.lead_id = l.id AND lq.is_primary = true
          LIMIT 1
        ) AS primary_quote
      FROM lead_reminders r
      JOIN leads l ON r.lead_id = l.id
      LEFT JOIN users u ON r.recipient_user_id = u.id
      LEFT JOIN locations loc ON l.store_location_id = loc.id
      WHERE l.store_location_id = $1
        AND r.acknowledged_at IS NULL
        AND r.reminder_type = 'in_app'
        AND r.scheduled_at <= NOW()
      ORDER BY r.scheduled_at ASC
    `, [storeLocationId]);

    return result.rows;
  }
}

module.exports = ReminderService;
