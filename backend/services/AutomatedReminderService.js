/**
 * Automated Reminder Service
 * Auto-creates follow-up reminders based on:
 * - Lead status and inactivity
 * - Quote expiry and view status
 * - Customer at-risk status
 */

class AutomatedReminderService {
  constructor(pool, cache, taskService) {
    this.pool = pool;
    this.cache = cache;
    this.taskService = taskService;
  }

  /**
   * Run all automated reminder checks
   */
  async runAllChecks() {
    const results = await Promise.all([
      this.checkInactiveContactedLeads(),
      this.checkUnviewedQuotes(),
      this.checkExpiringQuotes(),
      this.checkAtRiskCustomers(),
      this.checkStaleLeads(),
      this.checkHighValuePendingQuotes()
    ]);

    const summary = {
      inactiveLeads: results[0],
      unviewedQuotes: results[1],
      expiringQuotes: results[2],
      atRiskCustomers: results[3],
      staleLeads: results[4],
      highValueQuotes: results[5],
      totalRemindersCreated: results.reduce((sum, r) => sum + (r.created || 0), 0),
      runAt: new Date().toISOString()
    };

    console.log('Automated reminders check completed:', summary);
    return summary;
  }

  /**
   * Check for leads that were contacted but have no activity for 3+ days
   */
  async checkInactiveContactedLeads() {
    const result = await this.pool.query(`
      SELECT
        l.id,
        l.name,
        l.email,
        l.company,
        l.assigned_to,
        l.updated_at,
        EXTRACT(days FROM NOW() - l.updated_at) as days_inactive
      FROM leads l
      WHERE l.status = 'contacted'
        AND l.updated_at < NOW() - INTERVAL '3 days'
        AND NOT EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.related_type = 'lead'
            AND t.related_id = l.id
            AND t.task_type = 'follow_up'
            AND t.status = 'pending'
            AND t.created_at > NOW() - INTERVAL '1 day'
        )
      LIMIT 50
    `);

    let created = 0;
    for (const lead of result.rows) {
      try {
        await this.taskService.createTask({
          title: `Follow up with ${lead.name || lead.company || 'lead'}`,
          description: `This lead was contacted ${Math.floor(lead.days_inactive)} days ago but has had no activity since. Consider reaching out again.`,
          task_type: 'follow_up',
          priority: lead.days_inactive > 5 ? 'high' : 'normal',
          due_date: this.getNextBusinessDay(),
          assigned_to: lead.assigned_to,
          related_type: 'lead',
          related_id: lead.id,
          metadata: {
            auto_generated: true,
            trigger: 'inactive_contacted_lead',
            days_inactive: Math.floor(lead.days_inactive)
          }
        });
        created++;
      } catch (error) {
        console.error(`Failed to create reminder for lead ${lead.id}:`, error.message);
      }
    }

    return { checked: result.rows.length, created };
  }

  /**
   * Check for quotes sent but not viewed for 2+ days
   */
  async checkUnviewedQuotes() {
    const result = await this.pool.query(`
      SELECT
        q.id,
        q.quote_number,
        q.total_cents,
        q.created_at,
        c.name as customer_name,
        c.email as customer_email,
        u.id as created_by_id,
        EXTRACT(days FROM NOW() - q.created_at) as days_since_sent
      FROM quotations q
      JOIN customers c ON q.customer_id = c.id
      LEFT JOIN users u ON q.created_by = u.id
      WHERE q.status = 'SENT'
        AND q.viewed_at IS NULL
        AND q.created_at < NOW() - INTERVAL '2 days'
        AND q.created_at > NOW() - INTERVAL '14 days'
        AND NOT EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.related_type = 'quote'
            AND t.related_id = q.id
            AND t.task_type = 'follow_up'
            AND t.status = 'pending'
            AND t.created_at > NOW() - INTERVAL '1 day'
        )
      LIMIT 50
    `);

    let created = 0;
    for (const quote of result.rows) {
      try {
        await this.taskService.createTask({
          title: `Quote ${quote.quote_number} hasn't been viewed`,
          description: `Quote sent to ${quote.customer_name} ${Math.floor(quote.days_since_sent)} days ago hasn't been opened. Consider following up to ensure they received it.`,
          task_type: 'follow_up',
          priority: quote.total_cents > 100000 ? 'high' : 'normal',
          due_date: this.getNextBusinessDay(),
          assigned_to: quote.created_by_id,
          related_type: 'quote',
          related_id: quote.id,
          metadata: {
            auto_generated: true,
            trigger: 'unviewed_quote',
            days_since_sent: Math.floor(quote.days_since_sent),
            quote_value: quote.total_cents
          }
        });
        created++;
      } catch (error) {
        console.error(`Failed to create reminder for quote ${quote.id}:`, error.message);
      }
    }

    return { checked: result.rows.length, created };
  }

  /**
   * Check for quotes expiring in next 3 days
   */
  async checkExpiringQuotes() {
    const result = await this.pool.query(`
      SELECT
        q.id,
        q.quote_number,
        q.total_cents,
        q.valid_until,
        c.name as customer_name,
        c.email as customer_email,
        u.id as created_by_id,
        EXTRACT(days FROM q.valid_until - NOW()) as days_until_expiry
      FROM quotations q
      JOIN customers c ON q.customer_id = c.id
      LEFT JOIN users u ON q.created_by = u.id
      WHERE q.status IN ('SENT', 'DRAFT')
        AND q.valid_until IS NOT NULL
        AND q.valid_until > NOW()
        AND q.valid_until < NOW() + INTERVAL '3 days'
        AND NOT EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.related_type = 'quote'
            AND t.related_id = q.id
            AND t.task_type = 'urgent'
            AND t.status = 'pending'
            AND t.created_at > NOW() - INTERVAL '1 day'
        )
      LIMIT 50
    `);

    let created = 0;
    for (const quote of result.rows) {
      const daysLeft = Math.ceil(quote.days_until_expiry);
      try {
        await this.taskService.createTask({
          title: `Quote ${quote.quote_number} expires ${daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`}`,
          description: `Quote for ${quote.customer_name} is about to expire. Contact them to finalize before it expires.`,
          task_type: 'urgent',
          priority: 'high',
          due_date: new Date(),
          assigned_to: quote.created_by_id,
          related_type: 'quote',
          related_id: quote.id,
          metadata: {
            auto_generated: true,
            trigger: 'expiring_quote',
            days_until_expiry: daysLeft,
            quote_value: quote.total_cents,
            expiry_date: quote.valid_until
          }
        });
        created++;
      } catch (error) {
        console.error(`Failed to create reminder for expiring quote ${quote.id}:`, error.message);
      }
    }

    return { checked: result.rows.length, created };
  }

  /**
   * Check for customers marked as high churn risk
   */
  async checkAtRiskCustomers() {
    const result = await this.pool.query(`
      SELECT
        c.id,
        c.name,
        c.email,
        c.company,
        c.clv_score,
        c.churn_risk,
        c.days_since_last_activity,
        c.total_transactions
      FROM customers c
      WHERE c.churn_risk = 'high'
        AND (c.active = true OR c.active IS NULL)
        AND c.clv_score > 0
        AND NOT EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.related_type = 'customer'
            AND t.related_id = c.id
            AND t.task_type = 'retention'
            AND t.status = 'pending'
            AND t.created_at > NOW() - INTERVAL '7 days'
        )
      ORDER BY c.clv_score DESC
      LIMIT 20
    `);

    let created = 0;
    for (const customer of result.rows) {
      try {
        await this.taskService.createTask({
          title: `Retention: ${customer.name || customer.company} at risk of churn`,
          description: `High-value customer (CLV: $${(customer.clv_score / 100).toFixed(0)}) showing signs of churn. Last activity: ${customer.days_since_last_activity || 'unknown'} days ago. Consider a retention outreach.`,
          task_type: 'retention',
          priority: customer.clv_score > 100000 ? 'high' : 'normal',
          due_date: this.getNextBusinessDay(),
          related_type: 'customer',
          related_id: customer.id,
          metadata: {
            auto_generated: true,
            trigger: 'at_risk_customer',
            clv_score: customer.clv_score,
            days_inactive: customer.days_since_last_activity,
            total_transactions: customer.total_transactions
          }
        });
        created++;
      } catch (error) {
        console.error(`Failed to create reminder for at-risk customer ${customer.id}:`, error.message);
      }
    }

    return { checked: result.rows.length, created };
  }

  /**
   * Check for stale leads (new status for 7+ days)
   */
  async checkStaleLeads() {
    const result = await this.pool.query(`
      SELECT
        l.id,
        l.name,
        l.email,
        l.company,
        l.lead_score,
        l.assigned_to,
        l.created_at,
        EXTRACT(days FROM NOW() - l.created_at) as days_old
      FROM leads l
      WHERE l.status = 'new'
        AND l.created_at < NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.related_type = 'lead'
            AND t.related_id = l.id
            AND t.task_type = 'initial_contact'
            AND t.status = 'pending'
            AND t.created_at > NOW() - INTERVAL '3 days'
        )
      ORDER BY l.lead_score DESC NULLS LAST
      LIMIT 30
    `);

    let created = 0;
    for (const lead of result.rows) {
      try {
        await this.taskService.createTask({
          title: `Initial contact needed: ${lead.name || lead.company || 'New lead'}`,
          description: `This lead has been waiting ${Math.floor(lead.days_old)} days without being contacted. ${lead.lead_score > 70 ? 'High score - prioritize!' : 'Make initial contact soon.'}`,
          task_type: 'initial_contact',
          priority: lead.lead_score > 70 ? 'high' : (lead.days_old > 10 ? 'high' : 'normal'),
          due_date: new Date(),
          assigned_to: lead.assigned_to,
          related_type: 'lead',
          related_id: lead.id,
          metadata: {
            auto_generated: true,
            trigger: 'stale_new_lead',
            days_old: Math.floor(lead.days_old),
            lead_score: lead.lead_score
          }
        });
        created++;
      } catch (error) {
        console.error(`Failed to create reminder for stale lead ${lead.id}:`, error.message);
      }
    }

    return { checked: result.rows.length, created };
  }

  /**
   * Check for high-value quotes that need attention
   */
  async checkHighValuePendingQuotes() {
    const result = await this.pool.query(`
      SELECT
        q.id,
        q.quote_number,
        q.total_cents,
        q.status,
        q.created_at,
        q.updated_at,
        c.name as customer_name,
        u.id as created_by_id,
        EXTRACT(days FROM NOW() - q.updated_at) as days_since_update
      FROM quotations q
      JOIN customers c ON q.customer_id = c.id
      LEFT JOIN users u ON q.created_by = u.id
      WHERE q.status IN ('SENT', 'VIEWED')
        AND q.total_cents > 200000
        AND q.updated_at < NOW() - INTERVAL '5 days'
        AND NOT EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.related_type = 'quote'
            AND t.related_id = q.id
            AND t.task_type = 'high_value'
            AND t.status = 'pending'
            AND t.created_at > NOW() - INTERVAL '3 days'
        )
      ORDER BY q.total_cents DESC
      LIMIT 20
    `);

    let created = 0;
    for (const quote of result.rows) {
      try {
        await this.taskService.createTask({
          title: `High-value quote needs attention: ${quote.quote_number}`,
          description: `$${(quote.total_cents / 100).toLocaleString()} quote for ${quote.customer_name} has been ${quote.status.toLowerCase()} for ${Math.floor(quote.days_since_update)} days. Follow up to close the deal.`,
          task_type: 'high_value',
          priority: 'high',
          due_date: new Date(),
          assigned_to: quote.created_by_id,
          related_type: 'quote',
          related_id: quote.id,
          metadata: {
            auto_generated: true,
            trigger: 'high_value_pending_quote',
            quote_value: quote.total_cents,
            days_since_update: Math.floor(quote.days_since_update),
            quote_status: quote.status
          }
        });
        created++;
      } catch (error) {
        console.error(`Failed to create reminder for high-value quote ${quote.id}:`, error.message);
      }
    }

    return { checked: result.rows.length, created };
  }

  /**
   * Get the next business day (skip weekends)
   */
  getNextBusinessDay(date = new Date()) {
    const result = new Date(date);
    result.setDate(result.getDate() + 1);

    // Skip to Monday if Saturday or Sunday
    const day = result.getDay();
    if (day === 0) result.setDate(result.getDate() + 1); // Sunday -> Monday
    if (day === 6) result.setDate(result.getDate() + 2); // Saturday -> Monday

    // Set to 9 AM
    result.setHours(9, 0, 0, 0);

    return result;
  }

  /**
   * Get reminder statistics
   */
  async getStats() {
    const result = await this.pool.query(`
      SELECT
        task_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE metadata->>'auto_generated' = 'true') as auto_generated
      FROM tasks
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY task_type
      ORDER BY total DESC
    `);

    const triggerStats = await this.pool.query(`
      SELECT
        metadata->>'trigger' as trigger,
        COUNT(*) as count
      FROM tasks
      WHERE metadata->>'auto_generated' = 'true'
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY metadata->>'trigger'
      ORDER BY count DESC
    `);

    return {
      byType: result.rows,
      byTrigger: triggerStats.rows
    };
  }
}

module.exports = AutomatedReminderService;
