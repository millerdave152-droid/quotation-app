/**
 * RebateFollowUpService - Rebate Reminder and Follow-up System
 * Sends reminders for pending rebate claims and tracks submissions
 */

class RebateFollowUpService {
  constructor(pool, emailService = null) {
    this.pool = pool;
    this.emailService = emailService;

    // Reminder schedule: days after purchase to send reminder
    this.postPurchaseReminders = [7, 14, 21]; // 7, 14, 21 days after purchase
  }

  // ============================================================================
  // GET PENDING REMINDERS
  // Find rebate claims that need reminder emails
  // ============================================================================

  async getPendingReminders(options = {}) {
    const {
      daysBeforeDeadline = [14, 7, 3, 1], // Days before deadline to send reminders
      excludeSubmitted = true,
      limit = 100,
    } = options;

    const query = `
      SELECT
        rc.id as claim_id,
        rc.rebate_id,
        rc.order_id,
        rc.customer_id,
        rc.claim_status,
        rc.rebate_amount,
        rc.customer_name,
        rc.customer_email,
        rc.created_at as claim_created_at,
        r.name as rebate_name,
        r.manufacturer,
        r.rebate_type,
        r.submission_url,
        r.terms_url,
        r.claim_deadline_days,
        r.requires_upc,
        r.requires_receipt,
        o.created_at as order_date,
        (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) as deadline,
        EXTRACT(DAY FROM (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) - NOW())::INTEGER as days_remaining,
        -- Check what reminders have been sent
        (
          SELECT json_agg(json_build_object(
            'sentAt', rr.sent_at,
            'reminderType', rr.reminder_type,
            'daysBeforeDeadline', rr.days_before_deadline
          ))
          FROM rebate_reminders rr
          WHERE rr.claim_id = rc.id
        ) as reminders_sent,
        -- Get product info
        (
          SELECT json_agg(json_build_object(
            'productId', oi.product_id,
            'productName', p.name,
            'quantity', oi.quantity
          ))
          FROM order_items oi
          JOIN products p ON oi.product_id = p.id
          JOIN rebate_products rp ON (
            rp.rebate_id = r.id
            AND (rp.product_id = oi.product_id OR rp.category_id = p.category_id)
          )
          WHERE oi.order_id = o.id
        ) as products
      FROM rebate_claims rc
      JOIN rebates r ON rc.rebate_id = r.id
      JOIN orders o ON rc.order_id = o.id
      WHERE rc.claim_status = 'pending'
        AND rc.customer_email IS NOT NULL
        AND (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) > NOW()
        AND EXTRACT(DAY FROM (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) - NOW())::INTEGER = ANY($1)
      ORDER BY days_remaining ASC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [daysBeforeDeadline, limit]);

    // Filter out claims that have already received a reminder for this interval
    return result.rows.filter(row => {
      const remindersSent = row.reminders_sent || [];
      const alreadySent = remindersSent.some(
        r => r.daysBeforeDeadline === row.days_remaining
      );
      return !alreadySent;
    }).map(row => this._formatReminderData(row));
  }

  // ============================================================================
  // SEND REMINDER EMAIL
  // Send a rebate deadline reminder to a customer
  // ============================================================================

  async sendReminderEmail(claimId, options = {}) {
    const { reminderType = 'deadline', customMessage = null } = options;

    // Get claim details
    const claimQuery = `
      SELECT
        rc.*,
        r.name as rebate_name,
        r.manufacturer,
        r.rebate_type,
        r.submission_url,
        r.terms_url,
        r.claim_deadline_days,
        r.requires_upc,
        r.requires_receipt,
        o.created_at as order_date,
        (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) as deadline,
        EXTRACT(DAY FROM (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) - NOW())::INTEGER as days_remaining,
        c.name as customer_name_from_db,
        c.email as customer_email_from_db
      FROM rebate_claims rc
      JOIN rebates r ON rc.rebate_id = r.id
      JOIN orders o ON rc.order_id = o.id
      LEFT JOIN customers c ON rc.customer_id = c.id
      WHERE rc.id = $1
    `;

    const claimResult = await this.pool.query(claimQuery, [claimId]);

    if (claimResult.rows.length === 0) {
      throw new Error('Rebate claim not found');
    }

    const claim = claimResult.rows[0];
    const email = claim.customer_email || claim.customer_email_from_db;

    if (!email) {
      throw new Error('No email address for this claim');
    }

    // Build email content
    const emailContent = this._buildReminderEmail(claim, reminderType, customMessage);

    // Send email (via email service if available)
    let emailSent = false;
    if (this.emailService) {
      try {
        await this.emailService.sendEmail({
          to: email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });
        emailSent = true;
      } catch (err) {
        console.error('[RebateFollowUpService] Email send error:', err);
        throw new Error('Failed to send reminder email');
      }
    }

    // Record the reminder
    const recordQuery = `
      INSERT INTO rebate_reminders (
        claim_id, reminder_type, days_before_deadline,
        sent_to_email, sent_at, email_sent_successfully
      ) VALUES ($1, $2, $3, $4, NOW(), $5)
      RETURNING *
    `;

    const recordResult = await this.pool.query(recordQuery, [
      claimId,
      reminderType,
      claim.days_remaining,
      email,
      emailSent,
    ]);

    return {
      success: true,
      reminderId: recordResult.rows[0].id,
      claimId,
      sentTo: email,
      reminderType,
      daysRemaining: claim.days_remaining,
      emailSent,
    };
  }

  // ============================================================================
  // PROCESS ALL PENDING REMINDERS
  // Batch process reminders for approaching deadlines
  // ============================================================================

  async processReminders(options = {}) {
    const { dryRun = false, limit = 50 } = options;

    const pendingReminders = await this.getPendingReminders({ limit });

    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      details: [],
    };

    for (const reminder of pendingReminders) {
      try {
        if (dryRun) {
          results.skipped++;
          results.details.push({
            claimId: reminder.claimId,
            email: reminder.customerEmail,
            daysRemaining: reminder.daysRemaining,
            status: 'dry_run',
          });
          continue;
        }

        const result = await this.sendReminderEmail(reminder.claimId, {
          reminderType: this._getReminderType(reminder.daysRemaining),
        });

        results.processed++;
        if (result.emailSent) {
          results.sent++;
        }

        results.details.push({
          claimId: reminder.claimId,
          email: reminder.customerEmail,
          daysRemaining: reminder.daysRemaining,
          status: 'sent',
        });
      } catch (err) {
        results.failed++;
        results.details.push({
          claimId: reminder.claimId,
          email: reminder.customerEmail,
          daysRemaining: reminder.daysRemaining,
          status: 'failed',
          error: err.message,
        });
      }
    }

    return results;
  }

  // ============================================================================
  // GET EXPIRING CLAIMS
  // Get claims that are about to expire
  // ============================================================================

  async getExpiringClaims(daysThreshold = 7) {
    const query = `
      SELECT
        rc.id as claim_id,
        rc.rebate_id,
        rc.order_id,
        rc.customer_id,
        rc.claim_status,
        rc.rebate_amount,
        rc.customer_name,
        rc.customer_email,
        r.name as rebate_name,
        r.manufacturer,
        r.rebate_type,
        r.submission_url,
        o.created_at as order_date,
        (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) as deadline,
        EXTRACT(DAY FROM (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) - NOW())::INTEGER as days_remaining
      FROM rebate_claims rc
      JOIN rebates r ON rc.rebate_id = r.id
      JOIN orders o ON rc.order_id = o.id
      WHERE rc.claim_status = 'pending'
        AND (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) > NOW()
        AND EXTRACT(DAY FROM (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) - NOW())::INTEGER <= $1
      ORDER BY days_remaining ASC
    `;

    const result = await this.pool.query(query, [daysThreshold]);

    return result.rows.map(row => ({
      claimId: row.claim_id,
      rebateId: row.rebate_id,
      orderId: row.order_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      rebateName: row.rebate_name,
      manufacturer: row.manufacturer,
      rebateType: row.rebate_type,
      amount: parseFloat(row.rebate_amount),
      deadline: row.deadline,
      daysRemaining: row.days_remaining,
      submissionUrl: row.submission_url,
      isUrgent: row.days_remaining <= 3,
    }));
  }

  // ============================================================================
  // GET POST-PURCHASE REMINDERS (7 days after purchase)
  // Find customers who purchased items with rebates but haven't submitted
  // ============================================================================

  async getPostPurchaseReminders(options = {}) {
    const {
      daysAfterPurchase = this.postPurchaseReminders,
      limit = 100,
    } = options;

    const query = `
      SELECT
        rc.id as claim_id,
        rc.rebate_id,
        rc.order_id,
        rc.customer_id,
        rc.claim_status,
        rc.rebate_amount,
        rc.customer_name,
        rc.customer_email,
        rc.created_at as claim_created_at,
        r.name as rebate_name,
        r.manufacturer,
        r.rebate_type,
        r.submission_url,
        r.terms_url,
        r.claim_deadline_days,
        r.requires_upc,
        r.requires_receipt,
        o.created_at as order_date,
        (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) as deadline,
        EXTRACT(DAY FROM NOW() - o.created_at)::INTEGER as days_since_purchase,
        EXTRACT(DAY FROM (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) - NOW())::INTEGER as days_remaining,
        -- Check what reminders have been sent
        (
          SELECT json_agg(json_build_object(
            'sentAt', rr.sent_at,
            'reminderType', rr.reminder_type,
            'daysSincePurchase', rr.days_since_purchase
          ))
          FROM rebate_reminders rr
          WHERE rr.claim_id = rc.id
        ) as reminders_sent,
        -- Get product info
        (
          SELECT json_agg(json_build_object(
            'productId', oi.product_id,
            'productName', p.name,
            'quantity', oi.quantity,
            'price', oi.price
          ))
          FROM order_items oi
          JOIN products p ON oi.product_id = p.id
          JOIN rebate_products rp ON (
            rp.rebate_id = r.id
            AND (rp.product_id = oi.product_id OR rp.category_id = p.category_id)
          )
          WHERE oi.order_id = o.id
        ) as products
      FROM rebate_claims rc
      JOIN rebates r ON rc.rebate_id = r.id
      JOIN orders o ON rc.order_id = o.id
      WHERE rc.claim_status = 'pending'
        AND rc.customer_email IS NOT NULL
        AND rc.customer_email != ''
        AND (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) > NOW()
        AND EXTRACT(DAY FROM NOW() - o.created_at)::INTEGER = ANY($1)
      ORDER BY days_since_purchase DESC, rc.rebate_amount DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [daysAfterPurchase, limit]);

    // Filter out claims that have already received a reminder for this interval
    return result.rows.filter(row => {
      const remindersSent = row.reminders_sent || [];
      const alreadySent = remindersSent.some(
        r => r.daysSincePurchase === row.days_since_purchase
      );
      return !alreadySent;
    }).map(row => ({
      claimId: row.claim_id,
      rebateId: row.rebate_id,
      orderId: row.order_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      rebateName: row.rebate_name,
      manufacturer: row.manufacturer,
      rebateType: row.rebate_type,
      amount: parseFloat(row.rebate_amount),
      orderDate: row.order_date,
      deadline: row.deadline,
      daysSincePurchase: row.days_since_purchase,
      daysRemaining: row.days_remaining,
      submissionUrl: row.submission_url,
      termsUrl: row.terms_url,
      requiresUpc: row.requires_upc,
      requiresReceipt: row.requires_receipt,
      products: row.products || [],
      remindersSent: row.reminders_sent || [],
    }));
  }

  // ============================================================================
  // SEND POST-PURCHASE REMINDER EMAIL
  // Send 7-day reminder to customer about unsubmitted rebates
  // ============================================================================

  async sendPostPurchaseReminder(claimId, options = {}) {
    const { daysSincePurchase = 7 } = options;

    // Get claim details
    const claimQuery = `
      SELECT
        rc.*,
        r.name as rebate_name,
        r.manufacturer,
        r.rebate_type,
        r.submission_url,
        r.terms_url,
        r.claim_deadline_days,
        r.requires_upc,
        r.requires_receipt,
        o.created_at as order_date,
        (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) as deadline,
        EXTRACT(DAY FROM (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) - NOW())::INTEGER as days_remaining,
        EXTRACT(DAY FROM NOW() - o.created_at)::INTEGER as actual_days_since_purchase,
        c.name as customer_name_from_db,
        c.email as customer_email_from_db,
        (
          SELECT json_agg(json_build_object(
            'productName', p.name,
            'quantity', oi.quantity,
            'price', oi.price
          ))
          FROM order_items oi
          JOIN products p ON oi.product_id = p.id
          JOIN rebate_products rp ON (
            rp.rebate_id = r.id
            AND (rp.product_id = oi.product_id OR rp.category_id = p.category_id)
          )
          WHERE oi.order_id = o.id
        ) as products
      FROM rebate_claims rc
      JOIN rebates r ON rc.rebate_id = r.id
      JOIN orders o ON rc.order_id = o.id
      LEFT JOIN customers c ON rc.customer_id = c.id
      WHERE rc.id = $1
    `;

    const claimResult = await this.pool.query(claimQuery, [claimId]);

    if (claimResult.rows.length === 0) {
      throw new Error('Rebate claim not found');
    }

    const claim = claimResult.rows[0];
    const email = claim.customer_email || claim.customer_email_from_db;

    if (!email) {
      throw new Error('No email address for this claim');
    }

    // Build email content
    const emailContent = this._buildPostPurchaseReminderEmail(claim);

    // Send email
    let emailSent = false;
    if (this.emailService) {
      try {
        await this.emailService.sendEmail({
          to: email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });
        emailSent = true;
      } catch (err) {
        console.error('[RebateFollowUpService] Post-purchase email error:', err);
        throw new Error('Failed to send post-purchase reminder email');
      }
    }

    // Record the reminder with days_since_purchase
    const recordQuery = `
      INSERT INTO rebate_reminders (
        claim_id, reminder_type, days_before_deadline, days_since_purchase,
        sent_to_email, sent_at, email_sent_successfully
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      RETURNING *
    `;

    const recordResult = await this.pool.query(recordQuery, [
      claimId,
      'post_purchase',
      claim.days_remaining,
      daysSincePurchase,
      email,
      emailSent,
    ]);

    return {
      success: true,
      reminderId: recordResult.rows[0].id,
      claimId,
      sentTo: email,
      reminderType: 'post_purchase',
      daysSincePurchase,
      daysRemaining: claim.days_remaining,
      emailSent,
    };
  }

  // ============================================================================
  // PROCESS POST-PURCHASE REMINDERS
  // Batch process 7-day (and other) post-purchase reminders
  // ============================================================================

  async processPostPurchaseReminders(options = {}) {
    const { dryRun = false, limit = 50 } = options;

    const pendingReminders = await this.getPostPurchaseReminders({ limit });

    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      details: [],
    };

    for (const reminder of pendingReminders) {
      try {
        if (dryRun) {
          results.skipped++;
          results.details.push({
            claimId: reminder.claimId,
            email: reminder.customerEmail,
            daysSincePurchase: reminder.daysSincePurchase,
            daysRemaining: reminder.daysRemaining,
            status: 'dry_run',
          });
          continue;
        }

        const result = await this.sendPostPurchaseReminder(reminder.claimId, {
          daysSincePurchase: reminder.daysSincePurchase,
        });

        results.processed++;
        if (result.emailSent) {
          results.sent++;
        }

        results.details.push({
          claimId: reminder.claimId,
          email: reminder.customerEmail,
          daysSincePurchase: reminder.daysSincePurchase,
          daysRemaining: reminder.daysRemaining,
          status: 'sent',
        });
      } catch (err) {
        results.failed++;
        results.details.push({
          claimId: reminder.claimId,
          email: reminder.customerEmail,
          daysSincePurchase: reminder.daysSincePurchase,
          status: 'failed',
          error: err.message,
        });
      }
    }

    return results;
  }

  // ============================================================================
  // MARK EXPIRED CLAIMS
  // Update status of claims past their deadline
  // ============================================================================

  async markExpiredClaims() {
    const query = `
      UPDATE rebate_claims rc
      SET
        claim_status = 'expired',
        updated_at = NOW(),
        internal_notes = COALESCE(internal_notes || E'\\n', '') ||
          '[' || NOW()::TEXT || '] Auto-expired: deadline passed without submission'
      FROM rebates r, orders o
      WHERE rc.rebate_id = r.id
        AND rc.order_id = o.id
        AND rc.claim_status = 'pending'
        AND (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) < NOW()
      RETURNING rc.id, rc.customer_email, r.name as rebate_name
    `;

    const result = await this.pool.query(query);

    return {
      expiredCount: result.rowCount,
      expiredClaims: result.rows,
    };
  }

  // ============================================================================
  // GET REMINDER HISTORY
  // Get reminder history for a claim or customer
  // ============================================================================

  async getReminderHistory(options = {}) {
    const { claimId, customerId, limit = 50 } = options;

    let whereClause = '';
    const params = [];
    let paramIndex = 1;

    if (claimId) {
      whereClause = `WHERE rr.claim_id = $${paramIndex++}`;
      params.push(claimId);
    } else if (customerId) {
      whereClause = `WHERE rc.customer_id = $${paramIndex++}`;
      params.push(customerId);
    }

    params.push(limit);

    const query = `
      SELECT
        rr.*,
        rc.rebate_amount,
        r.name as rebate_name,
        r.manufacturer
      FROM rebate_reminders rr
      JOIN rebate_claims rc ON rr.claim_id = rc.id
      JOIN rebates r ON rc.rebate_id = r.id
      ${whereClause}
      ORDER BY rr.sent_at DESC
      LIMIT $${paramIndex}
    `;

    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      reminderId: row.id,
      claimId: row.claim_id,
      reminderType: row.reminder_type,
      daysBeforeDeadline: row.days_before_deadline,
      sentTo: row.sent_to_email,
      sentAt: row.sent_at,
      emailSent: row.email_sent_successfully,
      rebateName: row.rebate_name,
      manufacturer: row.manufacturer,
      amount: parseFloat(row.rebate_amount),
    }));
  }

  // ============================================================================
  // SEND REBATE INFO EMAIL
  // Send rebate details to customer (called from POS)
  // ============================================================================

  async sendRebateInfoEmail(email, orderId, rebateIds) {
    // Get order and rebate details
    const query = `
      SELECT
        r.id as rebate_id,
        r.name as rebate_name,
        r.manufacturer,
        r.rebate_type,
        r.amount,
        r.amount_type,
        r.submission_url,
        r.terms_url,
        r.requires_upc,
        r.requires_receipt,
        r.requires_registration,
        r.claim_deadline_days,
        o.id as order_id,
        o.created_at as order_date,
        (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) as deadline,
        (
          SELECT json_agg(json_build_object(
            'name', p.name,
            'quantity', oi.quantity
          ))
          FROM order_items oi
          JOIN products p ON oi.product_id = p.id
          JOIN rebate_products rp ON (
            rp.rebate_id = r.id
            AND (rp.product_id = oi.product_id OR rp.category_id = p.category_id)
          )
          WHERE oi.order_id = o.id
        ) as products
      FROM rebates r
      CROSS JOIN orders o
      WHERE r.id = ANY($1)
        AND o.id = $2
    `;

    const result = await this.pool.query(query, [rebateIds, orderId]);

    if (result.rows.length === 0) {
      throw new Error('No rebates found for this order');
    }

    // Build email content
    const emailContent = this._buildRebateInfoEmail(result.rows, email);

    // Send email
    if (this.emailService) {
      await this.emailService.sendEmail({
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
    }

    return {
      success: true,
      sentTo: email,
      rebateCount: result.rows.length,
    };
  }

  // ============================================================================
  // GET FOLLOW-UP DASHBOARD DATA
  // Summary for admin dashboard
  // ============================================================================

  async getDashboardData() {
    const queries = await Promise.all([
      // Pending claims by urgency
      this.pool.query(`
        SELECT
          CASE
            WHEN EXTRACT(DAY FROM (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) - NOW()) <= 3 THEN 'critical'
            WHEN EXTRACT(DAY FROM (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) - NOW()) <= 7 THEN 'urgent'
            WHEN EXTRACT(DAY FROM (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) - NOW()) <= 14 THEN 'upcoming'
            ELSE 'normal'
          END as urgency,
          COUNT(*) as count,
          SUM(rc.rebate_amount) as total_amount
        FROM rebate_claims rc
        JOIN rebates r ON rc.rebate_id = r.id
        JOIN orders o ON rc.order_id = o.id
        WHERE rc.claim_status = 'pending'
          AND (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) > NOW()
        GROUP BY urgency
      `),

      // Claims by status
      this.pool.query(`
        SELECT
          claim_status,
          COUNT(*) as count,
          SUM(rebate_amount) as total_amount
        FROM rebate_claims
        GROUP BY claim_status
      `),

      // Reminders sent today
      this.pool.query(`
        SELECT COUNT(*) as count
        FROM rebate_reminders
        WHERE sent_at >= CURRENT_DATE
      `),

      // Claims expiring today
      this.pool.query(`
        SELECT COUNT(*) as count
        FROM rebate_claims rc
        JOIN rebates r ON rc.rebate_id = r.id
        JOIN orders o ON rc.order_id = o.id
        WHERE rc.claim_status = 'pending'
          AND DATE(o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) = CURRENT_DATE
      `),
    ]);

    const [urgencyResult, statusResult, remindersResult, expiringResult] = queries;

    // Format urgency data
    const urgencyMap = { critical: 0, urgent: 0, upcoming: 0, normal: 0 };
    urgencyResult.rows.forEach(row => {
      urgencyMap[row.urgency] = {
        count: parseInt(row.count),
        amount: parseFloat(row.total_amount || 0),
      };
    });

    // Format status data
    const statusMap = {};
    statusResult.rows.forEach(row => {
      statusMap[row.claim_status] = {
        count: parseInt(row.count),
        amount: parseFloat(row.total_amount || 0),
      };
    });

    return {
      pendingByUrgency: urgencyMap,
      claimsByStatus: statusMap,
      remindersSentToday: parseInt(remindersResult.rows[0]?.count || 0),
      expiringToday: parseInt(expiringResult.rows[0]?.count || 0),
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  _formatReminderData(row) {
    return {
      claimId: row.claim_id,
      rebateId: row.rebate_id,
      orderId: row.order_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      rebateName: row.rebate_name,
      manufacturer: row.manufacturer,
      rebateType: row.rebate_type,
      amount: parseFloat(row.rebate_amount),
      deadline: row.deadline,
      daysRemaining: row.days_remaining,
      submissionUrl: row.submission_url,
      termsUrl: row.terms_url,
      requiresUpc: row.requires_upc,
      requiresReceipt: row.requires_receipt,
      products: row.products || [],
      remindersSent: row.reminders_sent || [],
    };
  }

  _getReminderType(daysRemaining) {
    if (daysRemaining <= 1) return 'final_warning';
    if (daysRemaining <= 3) return 'urgent';
    if (daysRemaining <= 7) return 'reminder';
    return 'notice';
  }

  _buildReminderEmail(claim, reminderType, customMessage) {
    const urgencyText = {
      final_warning: 'FINAL REMINDER - Expires Tomorrow!',
      urgent: 'URGENT - Only a few days left!',
      reminder: 'Reminder: Don\'t miss your rebate',
      notice: 'Rebate deadline approaching',
    };

    const subject = `${urgencyText[reminderType] || 'Rebate Reminder'} - ${claim.manufacturer} ${claim.rebate_name}`;

    const formatDate = (date) => {
      return new Date(date).toLocaleDateString('en-CA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    };

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${reminderType === 'final_warning' ? '#DC2626' : '#2563EB'}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .rebate-box { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2563EB; }
          .deadline { background: ${claim.days_remaining <= 3 ? '#FEF3C7' : '#E0F2FE'}; padding: 12px; border-radius: 6px; text-align: center; margin: 16px 0; }
          .btn { display: inline-block; background: #2563EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">${reminderType === 'final_warning' ? '\u26A0\uFE0F' : '\u{1F4EC}'} Rebate Reminder</h1>
          </div>
          <div class="content">
            <p>Hi ${claim.customer_name || 'Valued Customer'},</p>

            ${customMessage ? `<p>${customMessage}</p>` : ''}

            <p>This is a reminder about your pending manufacturer rebate:</p>

            <div class="rebate-box">
              <h3 style="margin:0 0 8px 0;">${claim.rebate_name}</h3>
              <p style="margin:0;color:#6b7280;">${claim.manufacturer}</p>
              <p style="margin:12px 0 0 0;font-size:24px;font-weight:bold;color:#2563EB;">
                $${parseFloat(claim.rebate_amount).toFixed(2)}
              </p>
            </div>

            <div class="deadline">
              <strong>Deadline: ${formatDate(claim.deadline)}</strong>
              <br>
              <span style="color:${claim.days_remaining <= 3 ? '#D97706' : '#0369A1'};">
                ${claim.days_remaining} day${claim.days_remaining !== 1 ? 's' : ''} remaining
              </span>
            </div>

            <h3>How to Submit:</h3>
            <ol>
              <li>Visit the rebate submission website</li>
              ${claim.requires_receipt ? '<li>Have your receipt ready</li>' : ''}
              ${claim.requires_upc ? '<li>Have the UPC barcode from the product packaging</li>' : ''}
              <li>Complete the online form or mail your documents</li>
            </ol>

            ${claim.submission_url ? `
              <p style="text-align:center;margin:24px 0;">
                <a href="${claim.submission_url}" class="btn">Submit Your Rebate Now</a>
              </p>
            ` : ''}

            <p>Don't let this money go to waste!</p>
          </div>
          <div class="footer">
            <p>This is an automated reminder from TeleTime.</p>
            <p>If you've already submitted your rebate, please disregard this message.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
REBATE REMINDER

Hi ${claim.customer_name || 'Valued Customer'},

This is a reminder about your pending manufacturer rebate:

${claim.rebate_name}
${claim.manufacturer}
Amount: $${parseFloat(claim.rebate_amount).toFixed(2)}

DEADLINE: ${formatDate(claim.deadline)} (${claim.days_remaining} days remaining)

How to Submit:
1. Visit the rebate submission website
${claim.requires_receipt ? '2. Have your receipt ready\n' : ''}${claim.requires_upc ? '3. Have the UPC barcode from the product packaging\n' : ''}
4. Complete the online form or mail your documents

${claim.submission_url ? `Submit here: ${claim.submission_url}` : ''}

Don't let this money go to waste!

---
This is an automated reminder from TeleTime.
If you've already submitted your rebate, please disregard this message.
    `;

    return { subject, html, text };
  }

  _buildPostPurchaseReminderEmail(claim) {
    const subject = `Don't Forget Your $${parseFloat(claim.rebate_amount).toFixed(2)} Rebate! - ${claim.manufacturer}`;

    const formatDate = (date) => {
      return new Date(date).toLocaleDateString('en-CA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    };

    const customerName = claim.customer_name || claim.customer_name_from_db || 'Valued Customer';
    const products = claim.products || [];

    const productListHtml = products.map(p => `
      <li style="margin-bottom: 8px;">
        <strong>${p.productName}</strong>
        ${p.quantity > 1 ? ` (qty: ${p.quantity})` : ''}
      </li>
    `).join('');

    const productListText = products.map(p =>
      `- ${p.productName}${p.quantity > 1 ? ` (qty: ${p.quantity})` : ''}`
    ).join('\n');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10B981; color: white; padding: 25px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 25px; border: 1px solid #e5e7eb; }
          .rebate-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #10B981; }
          .amount { font-size: 36px; font-weight: bold; color: #10B981; text-align: center; margin: 10px 0; }
          .deadline-box { background: #FEF3C7; padding: 15px; border-radius: 6px; text-align: center; margin: 20px 0; border-left: 4px solid #F59E0B; }
          .btn { display: inline-block; background: #10B981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; }
          .steps { background: #EFF6FF; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .steps ol { margin: 0; padding-left: 20px; }
          .steps li { margin-bottom: 10px; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
          .products { background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">💰 Your Rebate is Waiting!</h1>
            <p style="margin:10px 0 0 0;opacity:0.9;">It's been a week since your purchase</p>
          </div>
          <div class="content">
            <p>Hi ${customerName},</p>

            <p>A week ago, you purchased products that qualify for a manufacturer rebate.
            <strong>Don't let this free money slip away!</strong></p>

            <div class="rebate-box">
              <h3 style="margin:0 0 5px 0;text-align:center;">${claim.rebate_name}</h3>
              <p style="margin:0;text-align:center;color:#6b7280;">${claim.manufacturer}</p>
              <div class="amount">$${parseFloat(claim.rebate_amount).toFixed(2)}</div>
            </div>

            ${products.length > 0 ? `
            <div class="products">
              <strong>Qualifying Products:</strong>
              <ul style="margin:10px 0 0 0;padding-left:20px;">
                ${productListHtml}
              </ul>
            </div>
            ` : ''}

            <div class="deadline-box">
              <strong>⏰ Deadline: ${formatDate(claim.deadline)}</strong>
              <br>
              <span style="color:#D97706;">Only ${claim.days_remaining} days remaining to submit!</span>
            </div>

            <div class="steps">
              <h3 style="margin:0 0 15px 0;">📝 How to Submit:</h3>
              <ol>
                <li>Click the button below to go to the rebate submission page</li>
                ${claim.requires_receipt ? '<li><strong>Have your receipt ready</strong> - you\'ll need to upload it</li>' : ''}
                ${claim.requires_upc ? '<li><strong>Keep the UPC barcode</strong> from the product packaging</li>' : ''}
                <li>Complete the online form with your information</li>
                <li>Submit and wait 6-8 weeks for your rebate check or card</li>
              </ol>
            </div>

            ${claim.submission_url ? `
              <p style="text-align:center;margin:30px 0;">
                <a href="${claim.submission_url}" class="btn">Submit Your Rebate Now →</a>
              </p>
            ` : ''}

            <p style="text-align:center;color:#6b7280;font-size:14px;">
              It only takes a few minutes to claim your ${this.formatCurrency(claim.rebate_amount)}!
            </p>
          </div>
          <div class="footer">
            <p>This is a friendly reminder from TeleTime.</p>
            <p>If you've already submitted your rebate, please disregard this message.</p>
            ${claim.terms_url ? `<p><a href="${claim.terms_url}" style="color:#6b7280;">View full rebate terms and conditions</a></p>` : ''}
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
YOUR REBATE IS WAITING!

Hi ${customerName},

It's been a week since your purchase, and you have a rebate waiting to be claimed!

${claim.rebate_name}
${claim.manufacturer}
Amount: $${parseFloat(claim.rebate_amount).toFixed(2)}

${products.length > 0 ? `Qualifying Products:
${productListText}
` : ''}
DEADLINE: ${formatDate(claim.deadline)} (${claim.days_remaining} days remaining)

How to Submit:
1. Visit the rebate submission website
${claim.requires_receipt ? '2. Have your receipt ready\n' : ''}${claim.requires_upc ? '3. Keep the UPC barcode from packaging\n' : ''}
4. Complete the online form
5. Submit and wait 6-8 weeks

${claim.submission_url ? `Submit here: ${claim.submission_url}` : ''}

It only takes a few minutes to claim your money!

---
This is a friendly reminder from TeleTime.
If you've already submitted your rebate, please disregard this message.
    `;

    return { subject, html, text };
  }

  formatCurrency(amount) {
    return `$${parseFloat(amount || 0).toFixed(2)}`;
  }

  _buildRebateInfoEmail(rebates, email) {
    const totalAmount = rebates.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    const subject = `Your Rebate Information - Save $${totalAmount.toFixed(2)}!`;

    const formatDate = (date) => {
      return new Date(date).toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    };

    const rebateHtml = rebates.map(r => `
      <div style="background:white;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #e5e7eb;">
        <h3 style="margin:0 0 8px 0;">${r.rebate_name}</h3>
        <p style="margin:0;color:#6b7280;">${r.manufacturer}</p>
        <p style="margin:12px 0;font-size:20px;font-weight:bold;color:#2563EB;">
          $${parseFloat(r.amount).toFixed(2)}
        </p>
        <p style="margin:8px 0;padding:8px;background:#FEF3C7;border-radius:4px;">
          <strong>Deadline:</strong> ${formatDate(r.deadline)}
        </p>
        ${r.submission_url ? `
          <a href="${r.submission_url}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#2563EB;color:white;text-decoration:none;border-radius:6px;">
            Submit Rebate
          </a>
        ` : ''}
      </div>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563EB; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">\u{1F4EC} Your Rebate Information</h1>
            <p style="margin:8px 0 0 0;font-size:18px;">Save $${totalAmount.toFixed(2)}!</p>
          </div>
          <div class="content">
            <p>Thank you for your purchase! Here are the manufacturer rebates available on your order:</p>

            ${rebateHtml}

            <h3>Important Tips:</h3>
            <ul>
              <li>Keep your original receipt</li>
              <li>Submit before the deadline</li>
              <li>Allow 6-8 weeks for processing</li>
            </ul>
          </div>
          <div class="footer">
            <p>This email was sent from TeleTime POS.</p>
            <p>Rebate offers are subject to manufacturer terms and conditions.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = rebates.map(r => `
${r.rebate_name}
${r.manufacturer}
Amount: $${parseFloat(r.amount).toFixed(2)}
Deadline: ${formatDate(r.deadline)}
${r.submission_url ? `Submit: ${r.submission_url}` : ''}
---
    `).join('\n');

    return { subject, html, text: `Your Rebate Information\n\n${text}` };
  }
}

module.exports = RebateFollowUpService;
