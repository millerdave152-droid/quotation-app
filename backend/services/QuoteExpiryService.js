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

  // ===========================================================================
  // POS INTEGRATION METHODS (uses unified_orders table)
  // ===========================================================================

  /**
   * Get quotes expiring within the specified window (for POS)
   * @param {number} daysAhead - Days to look ahead (default: 7)
   * @param {number|null} salesRepId - Filter by assigned sales rep
   * @param {object} options - Additional options
   * @returns {Promise<{quotes: Array, stats: object}>}
   */
  async getPOSExpiringQuotes(daysAhead = 7, salesRepId = null, options = {}) {
    const {
      includeExpired = false,
      limit = 100,
      offset = 0,
      sortBy = 'priority', // priority, expiry, value
    } = options;

    let query = `
      SELECT
        uo.id AS quote_id,
        uo.order_number AS quote_number,
        uo.customer_id,
        uo.customer_name,
        uo.customer_phone,
        uo.customer_email,
        uo.total_cents AS total_value_cents,
        uo.quote_expiry_date AS expires_at,
        uo.quote_expiry_date - CURRENT_DATE AS days_until_expiry,
        uo.salesperson_id AS assigned_rep_id,
        CONCAT(u.first_name, ' ', u.last_name) AS assigned_rep_name,
        uo.status,
        uo.created_at,
        uo.quote_sent_at,
        uo.quote_viewed_at,
        -- Item count
        (SELECT COUNT(*) FROM unified_order_items WHERE order_id = uo.id) AS item_count,
        -- Last follow-up info (if table exists)
        (SELECT MAX(created_at) FROM quote_follow_ups WHERE quote_id = uo.id) AS last_contacted_at,
        (SELECT outcome FROM quote_follow_ups WHERE quote_id = uo.id ORDER BY created_at DESC LIMIT 1) AS last_contact_outcome,
        (SELECT COUNT(*) FROM quote_follow_ups WHERE quote_id = uo.id) AS follow_up_count,
        -- Customer info (tier/lifetime_value columns may not exist)
        NULL AS customer_tier,
        NULL AS customer_lifetime_value,
        NULL AS customer_credit_limit
      FROM unified_orders uo
      LEFT JOIN users u ON u.id = uo.salesperson_id
      LEFT JOIN customers c ON c.id = uo.customer_id
      WHERE uo.source = 'quote'
        AND uo.status IN ('draft', 'quote_sent', 'quote_viewed')
        AND uo.quote_expiry_date IS NOT NULL
    `;

    const params = [];
    let paramIdx = 1;

    // Filter by expiry window
    if (includeExpired) {
      query += ` AND uo.quote_expiry_date >= CURRENT_DATE - INTERVAL '7 days'`;
    } else {
      query += ` AND uo.quote_expiry_date >= CURRENT_DATE`;
    }

    query += ` AND uo.quote_expiry_date <= CURRENT_DATE + $${paramIdx++} * INTERVAL '1 day'`;
    params.push(daysAhead);

    // Filter by sales rep
    if (salesRepId) {
      query += ` AND uo.salesperson_id = $${paramIdx++}`;
      params.push(salesRepId);
    }

    // Sorting
    switch (sortBy) {
      case 'expiry':
        query += ` ORDER BY uo.quote_expiry_date ASC, uo.total_cents DESC`;
        break;
      case 'value':
        query += ` ORDER BY uo.total_cents DESC, uo.quote_expiry_date ASC`;
        break;
      case 'priority':
      default:
        query += `
          ORDER BY
            CASE WHEN uo.quote_expiry_date <= CURRENT_DATE THEN 0 ELSE uo.quote_expiry_date - CURRENT_DATE END ASC,
            uo.total_cents DESC,
            4 ASC
        `;
        break;
    }

    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    let rows;
    try {
      const result = await this.pool.query(query, params);
      rows = result.rows;
    } catch (error) {
      // If quote_follow_ups table doesn't exist, try without it
      if (error.message.includes('quote_follow_ups') || error.message.includes('"outcome" does not exist')) {
        const fallbackQuery = query
          .replace(/\(SELECT MAX\(created_at\) FROM quote_follow_ups WHERE quote_id = uo\.id\)/g, 'NULL')
          .replace(/\(SELECT outcome FROM quote_follow_ups WHERE quote_id = uo\.id ORDER BY created_at DESC LIMIT 1\)/g, 'NULL')
          .replace(/\(SELECT COUNT\(\*\) FROM quote_follow_ups WHERE quote_id = uo\.id\)/g, '0');
        const result = await this.pool.query(fallbackQuery, params);
        rows = result.rows;
      } else {
        throw error;
      }
    }

    // Format the response
    const quotes = rows.map(row => ({
      quoteId: row.quote_id,
      quoteNumber: row.quote_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      customerEmail: row.customer_email,
      totalValue: (row.total_value_cents || 0) / 100,
      totalValueCents: row.total_value_cents || 0,
      expiresAt: row.expires_at,
      daysUntilExpiry: parseInt(row.days_until_expiry) || 0,
      isExpired: parseInt(row.days_until_expiry) < 0,
      isExpiringToday: parseInt(row.days_until_expiry) === 0,
      isUrgent: parseInt(row.days_until_expiry) <= 3,
      assignedRep: row.assigned_rep_name || 'Unassigned',
      assignedRepId: row.assigned_rep_id,
      status: row.status,
      itemCount: parseInt(row.item_count) || 0,
      lastContactedAt: row.last_contacted_at,
      lastContactOutcome: row.last_contact_outcome,
      followUpCount: parseInt(row.follow_up_count) || 0,
      needsFollowUp: !row.last_contacted_at ||
        new Date(row.last_contacted_at) < new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      customerTier: row.customer_tier,
      quoteSentAt: row.quote_sent_at,
      quoteViewedAt: row.quote_viewed_at,
      createdAt: row.created_at,
    }));

    // Get stats for this result set
    const stats = await this.getPOSQuoteExpiryStats(salesRepId);

    return {
      quotes,
      stats,
      pagination: {
        limit,
        offset,
        count: quotes.length,
      },
    };
  }

  /**
   * Get aggregate statistics on expiring quotes (for POS)
   * @param {number|null} salesRepId - Filter by sales rep
   * @returns {Promise<object>}
   */
  async getPOSQuoteExpiryStats(salesRepId = null) {
    let query = `
      SELECT
        COUNT(*) FILTER (WHERE quote_expiry_date = CURRENT_DATE) AS expiring_today,
        COUNT(*) FILTER (WHERE quote_expiry_date <= CURRENT_DATE + INTERVAL '3 days' AND quote_expiry_date >= CURRENT_DATE) AS expiring_in_3_days,
        COUNT(*) FILTER (WHERE quote_expiry_date <= CURRENT_DATE + INTERVAL '7 days' AND quote_expiry_date >= CURRENT_DATE) AS expiring_in_7_days,
        COUNT(*) FILTER (WHERE quote_expiry_date < CURRENT_DATE AND quote_expiry_date >= CURRENT_DATE - INTERVAL '7 days') AS expired_last_7_days,
        COALESCE(SUM(total_cents) FILTER (WHERE quote_expiry_date <= CURRENT_DATE + INTERVAL '7 days' AND quote_expiry_date >= CURRENT_DATE), 0) AS total_at_risk_cents,
        COALESCE(AVG(total_cents) FILTER (WHERE quote_expiry_date <= CURRENT_DATE + INTERVAL '7 days' AND quote_expiry_date >= CURRENT_DATE), 0) AS avg_quote_value_cents,
        COUNT(*) AS total_active_quotes
      FROM unified_orders
      WHERE source = 'quote'
        AND status IN ('draft', 'quote_sent', 'quote_viewed')
        AND quote_expiry_date IS NOT NULL
        AND quote_expiry_date >= CURRENT_DATE - INTERVAL '7 days'
    `;

    const params = [];
    if (salesRepId) {
      query += ` AND salesperson_id = $1`;
      params.push(salesRepId);
    }

    const { rows } = await this.pool.query(query, params);
    const row = rows[0];

    return {
      expiringToday: parseInt(row.expiring_today) || 0,
      expiringIn3Days: parseInt(row.expiring_in_3_days) || 0,
      expiringIn7Days: parseInt(row.expiring_in_7_days) || 0,
      expiredLast7Days: parseInt(row.expired_last_7_days) || 0,
      totalAtRiskValue: (parseInt(row.total_at_risk_cents) || 0) / 100,
      totalAtRiskCents: parseInt(row.total_at_risk_cents) || 0,
      avgQuoteValue: (parseInt(row.avg_quote_value_cents) || 0) / 100,
      avgQuoteValueCents: parseInt(row.avg_quote_value_cents) || 0,
      totalActiveQuotes: parseInt(row.total_active_quotes) || 0,
    };
  }

  /**
   * Mark a quote as followed up (for POS)
   * @param {number} quoteId - Quote ID
   * @param {object} followUpData - Follow-up details
   * @returns {Promise<object>}
   */
  async markPOSQuoteFollowedUp(quoteId, followUpData = {}) {
    const {
      userId = null,
      contactMethod = 'phone',
      notes = null,
      outcome = null,
      callbackDate = null,
    } = followUpData;

    // Verify the quote exists
    const { rows: quoteRows } = await this.pool.query(
      `SELECT id, order_number, customer_name FROM unified_orders WHERE id = $1 AND source = 'quote'`,
      [quoteId]
    );

    if (quoteRows.length === 0) {
      throw new Error('Quote not found');
    }

    // Check if table exists, create if not
    try {
      await this.pool.query(`SELECT 1 FROM quote_follow_ups LIMIT 1`);
    } catch (error) {
      if (error.message.includes('does not exist')) {
        // Create the table
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS quote_follow_ups (
            id SERIAL PRIMARY KEY,
            quote_id INTEGER NOT NULL,
            user_id INTEGER,
            contact_method VARCHAR(20) DEFAULT 'phone',
            notes TEXT,
            outcome VARCHAR(50),
            callback_date DATE,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_quote_follow_ups_quote ON quote_follow_ups(quote_id)`);
      } else {
        throw error;
      }
    }

    // Insert follow-up record
    const { rows } = await this.pool.query(`
      INSERT INTO quote_follow_ups (quote_id, user_id, contact_method, notes, outcome, callback_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [quoteId, userId, contactMethod, notes, outcome, callbackDate]);

    const followUp = rows[0];

    // Get updated follow-up count
    const { rows: countRows } = await this.pool.query(
      `SELECT COUNT(*) AS count FROM quote_follow_ups WHERE quote_id = $1`,
      [quoteId]
    );

    return {
      followUpId: followUp.id,
      quoteId: followUp.quote_id,
      quoteNumber: quoteRows[0].order_number,
      customerName: quoteRows[0].customer_name,
      contactMethod: followUp.contact_method,
      notes: followUp.notes,
      outcome: followUp.outcome,
      callbackDate: followUp.callback_date,
      createdAt: followUp.created_at,
      totalFollowUps: parseInt(countRows[0].count),
    };
  }

  /**
   * Get follow-up history for a quote (for POS)
   * @param {number} quoteId - Quote ID
   * @returns {Promise<Array>}
   */
  async getPOSQuoteFollowUpHistory(quoteId) {
    try {
      const { rows } = await this.pool.query(`
        SELECT
          qf.*,
          CONCAT(u.first_name, ' ', u.last_name) AS user_name
        FROM quote_follow_ups qf
        LEFT JOIN users u ON u.id = qf.user_id
        WHERE qf.quote_id = $1
        ORDER BY qf.created_at DESC
      `, [quoteId]);

      return rows.map(row => ({
        id: row.id,
        quoteId: row.quote_id,
        userId: row.user_id,
        userName: row.user_name,
        contactMethod: row.contact_method,
        notes: row.notes,
        outcome: row.outcome,
        callbackDate: row.callback_date,
        createdAt: row.created_at,
      }));
    } catch (error) {
      if (error.message.includes('does not exist')) {
        return [];
      }
      throw error;
    }
  }
}

module.exports = QuoteExpiryService;
