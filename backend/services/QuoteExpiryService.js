/**
 * Quote Expiry Service
 * Handles quote expiration automation and renewals
 */

class QuoteExpiryService {
  constructor(pool, cache, inventoryService, notificationService) {
    this.pool = pool;
    this.cache = cache;
    this.inventoryService = inventoryService;
    this.notificationService = notificationService;
  }

  /**
   * Get expiry rules
   */
  async getExpiryRules(channel = null) {
    let query = 'SELECT * FROM quote_expiry_rules WHERE 1=1';
    const params = [];

    if (channel) {
      query += ' AND (channel = $1 OR channel = \'default\')';
      params.push(channel);
    }

    query += ' ORDER BY is_default DESC, channel';
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get default expiry rule
   */
  async getDefaultExpiryRule(channel = 'default') {
    const result = await this.pool.query(
      `SELECT * FROM quote_expiry_rules
       WHERE channel = $1 OR is_default = true
       ORDER BY CASE WHEN channel = $1 THEN 0 ELSE 1 END, is_default DESC
       LIMIT 1`,
      [channel]
    );
    return result.rows[0];
  }

  /**
   * Create expiry rule
   */
  async createExpiryRule(ruleData) {
    const {
      ruleName, channel = 'default', daysValid = 30,
      reminderDaysBefore = [7, 3, 1], autoExpire = true,
      allowRenewal = true, renewalExtendsDays = 14, isDefault = false
    } = ruleData;

    // If setting as default, unset other defaults
    if (isDefault) {
      await this.pool.query('UPDATE quote_expiry_rules SET is_default = false');
    }

    const result = await this.pool.query(
      `INSERT INTO quote_expiry_rules (
        rule_name, channel, days_valid, reminder_days_before,
        auto_expire, allow_renewal, renewal_extends_days, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [ruleName, channel, daysValid, reminderDaysBefore, autoExpire, allowRenewal, renewalExtendsDays, isDefault]
    );

    return result.rows[0];
  }

  /**
   * Process expired quotes - run hourly
   */
  async processExpiredQuotes() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Find quotes that have passed their expiry date
      const expiredQuery = `
        SELECT q.id, q.quote_number, q.customer_id, q.expires_at,
               c.email as customer_email, c.name as customer_name
        FROM quotations q
        LEFT JOIN customers c ON q.customer_id = c.id
        WHERE q.expires_at IS NOT NULL
          AND q.expires_at < NOW()
          AND q.status IN ('DRAFT', 'SENT', 'VIEWED')
          AND q.expired_at IS NULL
      `;
      const expiredResult = await client.query(expiredQuery);
      const expiredQuotes = expiredResult.rows;

      const results = {
        processed: 0,
        errors: []
      };

      for (const quote of expiredQuotes) {
        try {
          // Mark as expired
          await client.query(
            `UPDATE quotations
             SET status = 'EXPIRED', expired_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [quote.id]
          );

          // Release inventory reservations
          if (this.inventoryService) {
            await this.inventoryService.releaseReservation(quote.id, 'quote_expired');
          }

          // Log activity
          await client.query(
            `INSERT INTO quote_events (quotation_id, event_type, event_data, created_at)
             VALUES ($1, 'expired', $2, NOW())`,
            [quote.id, JSON.stringify({ expiredAt: quote.expires_at })]
          );

          // Send expiry notification
          if (this.notificationService && quote.customer_email) {
            try {
              await this.notificationService.sendQuoteExpiredNotification(quote);
            } catch (notifError) {
              console.error(`Failed to send expiry notification for quote ${quote.id}:`, notifError);
            }
          }

          results.processed++;
        } catch (error) {
          results.errors.push({ quoteId: quote.id, error: error.message });
        }
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Send expiry reminders - run daily
   */
  async sendExpiryReminders() {
    const client = await this.pool.connect();
    try {
      // Get all active quotes with expiry dates
      const quotesQuery = `
        SELECT q.id, q.quote_number, q.customer_id, q.expires_at,
               q.expiry_rule_id, q.total_amount,
               c.email as customer_email, c.name as customer_name,
               r.reminder_days_before
        FROM quotations q
        LEFT JOIN customers c ON q.customer_id = c.id
        LEFT JOIN quote_expiry_rules r ON q.expiry_rule_id = r.id
        WHERE q.expires_at IS NOT NULL
          AND q.status IN ('SENT', 'VIEWED')
          AND q.expires_at > NOW()
      `;
      const quotesResult = await client.query(quotesQuery);

      const results = {
        sent: 0,
        skipped: 0,
        errors: []
      };

      const defaultReminders = [7, 3, 1];

      for (const quote of quotesResult.rows) {
        const reminderDays = quote.reminder_days_before || defaultReminders;
        const daysUntilExpiry = Math.ceil(
          (new Date(quote.expires_at) - new Date()) / (1000 * 60 * 60 * 24)
        );

        // Check if we should send a reminder today
        if (!reminderDays.includes(daysUntilExpiry)) {
          results.skipped++;
          continue;
        }

        // Check if reminder already sent for this day
        const alreadySentQuery = `
          SELECT id FROM notification_log
          WHERE quotation_id = $1
            AND notification_type = 'expiry_reminder'
            AND metadata->>'daysRemaining' = $2
        `;
        const alreadySent = await client.query(alreadySentQuery, [quote.id, daysUntilExpiry.toString()]);

        if (alreadySent.rows.length > 0) {
          results.skipped++;
          continue;
        }

        try {
          // Send reminder
          if (this.notificationService && quote.customer_email) {
            await this.notificationService.sendExpiryReminderNotification({
              ...quote,
              daysRemaining: daysUntilExpiry
            });

            // Log notification
            await client.query(
              `INSERT INTO notification_log (quotation_id, notification_type, recipient_email, metadata, sent_at)
               VALUES ($1, 'expiry_reminder', $2, $3, NOW())`,
              [quote.id, quote.customer_email, JSON.stringify({ daysRemaining: daysUntilExpiry })]
            );

            results.sent++;
          }
        } catch (error) {
          results.errors.push({ quoteId: quote.id, error: error.message });
        }
      }

      return results;
    } finally {
      client.release();
    }
  }

  /**
   * Renew a quote
   */
  async renewQuote(quotationId, options = {}) {
    const { extendDays, userId } = options;
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get quote and its expiry rule
      const quoteQuery = `
        SELECT q.*, r.renewal_extends_days, r.allow_renewal
        FROM quotations q
        LEFT JOIN quote_expiry_rules r ON q.expiry_rule_id = r.id
        WHERE q.id = $1
      `;
      const quoteResult = await client.query(quoteQuery, [quotationId]);

      if (quoteResult.rows.length === 0) {
        throw new Error('Quote not found');
      }

      const quote = quoteResult.rows[0];

      // Check if renewal is allowed
      if (quote.allow_renewal === false) {
        throw new Error('Renewal is not allowed for this quote');
      }

      // Calculate new expiry date
      const daysToExtend = extendDays || quote.renewal_extends_days || 14;
      const baseDate = quote.status === 'EXPIRED' ? new Date() : new Date(quote.expires_at);
      const newExpiryDate = new Date(baseDate.getTime() + daysToExtend * 24 * 60 * 60 * 1000);

      // Update quote
      const updateQuery = `
        UPDATE quotations SET
          expires_at = $1,
          expired_at = NULL,
          status = CASE WHEN status = 'EXPIRED' THEN 'SENT' ELSE status END,
          renewal_count = COALESCE(renewal_count, 0) + 1,
          updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      const updateResult = await client.query(updateQuery, [newExpiryDate, quotationId]);

      // Log renewal
      await client.query(
        `INSERT INTO quote_events (quotation_id, event_type, event_data, created_by, created_at)
         VALUES ($1, 'renewed', $2, $3, NOW())`,
        [quotationId, JSON.stringify({
          previousExpiry: quote.expires_at,
          newExpiry: newExpiryDate,
          extendedDays: daysToExtend,
          renewalCount: (quote.renewal_count || 0) + 1
        }), userId]
      );

      // Restore inventory reservations if was expired
      if (quote.status === 'EXPIRED' && this.inventoryService) {
        // Get quote items
        const itemsResult = await client.query(
          'SELECT product_id, quantity FROM quotation_items WHERE quotation_id = $1',
          [quotationId]
        );
        const items = itemsResult.rows.map(r => ({
          productId: r.product_id,
          quantity: r.quantity
        }));

        if (items.length > 0) {
          await this.inventoryService.reserveStock(quotationId, items);
        }
      }

      await client.query('COMMIT');
      return updateResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get expiring quotes
   */
  async getExpiringQuotes(options = {}) {
    const { daysAhead = 7, status, customerId, limit = 50 } = options;

    let query = `
      SELECT q.id, q.quote_number, q.customer_id, q.expires_at, q.status,
             q.total_amount, q.renewal_count,
             c.name as customer_name, c.email as customer_email,
             EXTRACT(DAY FROM (q.expires_at - NOW())) as days_remaining
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.expires_at IS NOT NULL
        AND q.expires_at <= NOW() + INTERVAL '1 day' * $1
        AND q.expires_at > NOW()
    `;
    const params = [daysAhead];
    let paramIndex = 2;

    if (status) {
      query += ` AND q.status = $${paramIndex++}`;
      params.push(status);
    } else {
      query += ` AND q.status IN ('DRAFT', 'SENT', 'VIEWED')`;
    }

    if (customerId) {
      query += ` AND q.customer_id = $${paramIndex++}`;
      params.push(customerId);
    }

    query += ` ORDER BY q.expires_at ASC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get expired quotes
   */
  async getExpiredQuotes(options = {}) {
    const { daysBack = 30, limit = 50 } = options;

    const query = `
      SELECT q.id, q.quote_number, q.customer_id, q.expires_at, q.expired_at,
             q.total_amount, q.renewal_count,
             c.name as customer_name, c.email as customer_email
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.status = 'EXPIRED'
        AND q.expired_at >= NOW() - INTERVAL '1 day' * $1
      ORDER BY q.expired_at DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [daysBack, limit]);
    return result.rows;
  }

  /**
   * Bulk renew quotes
   */
  async bulkRenewQuotes(quotationIds, options = {}) {
    const results = {
      success: [],
      failed: []
    };

    for (const quotationId of quotationIds) {
      try {
        const renewed = await this.renewQuote(quotationId, options);
        results.success.push({ id: quotationId, newExpiry: renewed.expires_at });
      } catch (error) {
        results.failed.push({ id: quotationId, error: error.message });
      }
    }

    return results;
  }

  /**
   * Update expiry rule
   */
  async updateExpiryRule(ruleId, updates) {
    const allowedFields = [
      'rule_name', 'channel', 'days_valid', 'reminder_days_before',
      'auto_expire', 'allow_renewal', 'renewal_extends_days', 'is_default'
    ];

    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        setClauses.push(`${snakeKey} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Handle is_default
    if (updates.isDefault) {
      await this.pool.query('UPDATE quote_expiry_rules SET is_default = false');
    }

    params.push(ruleId);
    const query = `
      UPDATE quote_expiry_rules
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, params);
    return result.rows[0];
  }

  /**
   * Delete expiry rule
   */
  async deleteExpiryRule(ruleId) {
    // Check if rule is in use
    const inUseResult = await this.pool.query(
      'SELECT COUNT(*) as count FROM quotations WHERE expiry_rule_id = $1',
      [ruleId]
    );

    if (parseInt(inUseResult.rows[0].count) > 0) {
      throw new Error('Cannot delete rule that is in use by quotes');
    }

    await this.pool.query('DELETE FROM quote_expiry_rules WHERE id = $1', [ruleId]);
    return { deleted: true };
  }

  /**
   * Set quote expiry
   */
  async setQuoteExpiry(quotationId, expiresAt, ruleId = null) {
    const result = await this.pool.query(
      `UPDATE quotations
       SET expires_at = $1, expiry_rule_id = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [expiresAt, ruleId, quotationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Quote not found');
    }

    return result.rows[0];
  }
}

module.exports = QuoteExpiryService;
