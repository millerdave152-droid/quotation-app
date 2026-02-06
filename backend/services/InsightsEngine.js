/**
 * InsightsEngine - AI-Powered Business Insights Generator
 *
 * Proactively identifies actionable business insights by analyzing:
 * - Stale quotes requiring follow-up
 * - Customer behavior changes (churn risk)
 * - Inventory depletion predictions
 * - Quote expiry warnings
 * - Invoice payment patterns
 * - Sales velocity changes
 */

let pool = require('../db');

class InsightsEngine {
  constructor() {
    // Insight priority levels
    this.PRIORITY = {
      CRITICAL: 'critical',  // Immediate action required
      HIGH: 'high',          // Action needed today
      MEDIUM: 'medium',      // Action needed this week
      LOW: 'low'             // Informational
    };

    // Insight types
    this.TYPES = {
      STALE_QUOTE: 'stale_quote',
      QUOTE_EXPIRING: 'quote_expiring',
      CHURN_RISK: 'churn_risk',
      INVENTORY_LOW: 'inventory_low',
      INVOICE_OVERDUE: 'invoice_overdue',
      CUSTOMER_MILESTONE: 'customer_milestone',
      SALES_OPPORTUNITY: 'sales_opportunity',
      REORDER_NEEDED: 'reorder_needed'
    };
  }

  /**
   * Generate all insights for the dashboard
   * @param {object} options - Options for filtering insights
   * @returns {Promise<Array>} - Array of insight objects
   */
  async generateInsights(options = {}) {
    const { limit = 20, priority = null, types = null } = options;

    const allInsights = await Promise.all([
      this.getStaleQuoteInsights(),
      this.getExpiringQuoteInsights(),
      this.getChurnRiskInsights(),
      this.getInventoryInsights(),
      this.getOverdueInvoiceInsights(),
      this.getCustomerMilestoneInsights(),
      this.getSalesOpportunityInsights()
    ]);

    // Flatten and sort by priority and timestamp
    let insights = allInsights.flat();

    // Filter by priority if specified
    if (priority) {
      insights = insights.filter(i => i.priority === priority);
    }

    // Filter by types if specified
    if (types && Array.isArray(types)) {
      insights = insights.filter(i => types.includes(i.type));
    }

    // Sort by priority (critical first) then by timestamp (newest first)
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    insights.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    return insights.slice(0, limit);
  }

  /**
   * Get insights for quotes that haven't been viewed/acted on
   */
  async getStaleQuoteInsights() {
    const result = await pool.query(`
      SELECT
        q.id,
        q.quote_number,
        q.total_amount,
        q.status,
        q.created_at,
        q.sent_at,
        c.name as customer_name,
        c.email as customer_email,
        c.id as customer_id,
        u.name as salesperson_name,
        EXTRACT(DAY FROM (CURRENT_TIMESTAMP - COALESCE(q.sent_at, q.created_at))) as days_since_sent
      FROM quotations q
      JOIN customers c ON q.customer_id = c.id
      LEFT JOIN users u ON q.created_by = u.id
      WHERE q.status IN ('sent', 'pending')
        AND COALESCE(q.sent_at, q.created_at) < CURRENT_TIMESTAMP - INTERVAL '5 days'
        AND (q.expiry_date IS NULL OR q.expiry_date > CURRENT_DATE)
      ORDER BY q.total_amount DESC
      LIMIT 10
    `);

    return result.rows.map(row => ({
      id: `stale-quote-${row.id}`,
      type: this.TYPES.STALE_QUOTE,
      priority: row.days_since_sent >= 10 ? this.PRIORITY.HIGH : this.PRIORITY.MEDIUM,
      title: `Quote #${row.quote_number} needs follow-up`,
      message: `${row.customer_name} hasn't responded to their $${parseFloat(row.total_amount).toLocaleString()} quote in ${Math.round(row.days_since_sent)} days`,
      timestamp: new Date().toISOString(),
      data: {
        quoteId: row.id,
        quoteNumber: row.quote_number,
        customerId: row.customer_id,
        customerName: row.customer_name,
        customerEmail: row.customer_email,
        amount: parseFloat(row.total_amount),
        daysSinceSent: Math.round(row.days_since_sent),
        salesperson: row.salesperson_name
      },
      actions: [
        { label: 'Send Follow-up', action: 'send_followup', primary: true },
        { label: 'View Quote', action: 'view_quote' },
        { label: 'Call Customer', action: 'call_customer' }
      ]
    }));
  }

  /**
   * Get insights for quotes expiring soon
   */
  async getExpiringQuoteInsights() {
    const result = await pool.query(`
      SELECT
        q.id,
        q.quote_number,
        q.total_amount,
        q.expiry_date,
        c.name as customer_name,
        c.id as customer_id,
        EXTRACT(DAY FROM (q.expiry_date - CURRENT_DATE)) as days_until_expiry
      FROM quotations q
      JOIN customers c ON q.customer_id = c.id
      WHERE q.status IN ('sent', 'pending')
        AND q.expiry_date IS NOT NULL
        AND q.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
      ORDER BY q.expiry_date ASC
      LIMIT 10
    `);

    return result.rows.map(row => {
      const daysLeft = Math.round(row.days_until_expiry);
      let priority = this.PRIORITY.MEDIUM;
      if (daysLeft <= 1) priority = this.PRIORITY.CRITICAL;
      else if (daysLeft <= 3) priority = this.PRIORITY.HIGH;

      return {
        id: `expiring-quote-${row.id}`,
        type: this.TYPES.QUOTE_EXPIRING,
        priority,
        title: daysLeft <= 1 ? `Quote #${row.quote_number} expires TODAY!` : `Quote #${row.quote_number} expires in ${daysLeft} days`,
        message: `$${parseFloat(row.total_amount).toLocaleString()} quote for ${row.customer_name} needs attention`,
        timestamp: new Date().toISOString(),
        data: {
          quoteId: row.id,
          quoteNumber: row.quote_number,
          customerId: row.customer_id,
          customerName: row.customer_name,
          amount: parseFloat(row.total_amount),
          expiryDate: row.expiry_date,
          daysUntilExpiry: daysLeft
        },
        actions: [
          { label: 'Extend Quote', action: 'extend_quote', primary: true },
          { label: 'Send Reminder', action: 'send_reminder' },
          { label: 'View Quote', action: 'view_quote' }
        ]
      };
    });
  }

  /**
   * Get insights for customers at churn risk
   */
  async getChurnRiskInsights() {
    const result = await pool.query(`
      WITH customer_activity AS (
        SELECT
          c.id as customer_id,
          c.name as customer_name,
          c.email,
          GREATEST(
            COALESCE((SELECT MAX(created_at) FROM orders WHERE customer_id = c.id), '1970-01-01'),
            COALESCE((SELECT MAX(created_at) FROM quotations WHERE customer_id = c.id), '1970-01-01')
          ) as last_activity,
          COALESCE(
            (SELECT SUM(total_cents) / 100.0 FROM orders WHERE customer_id = c.id AND status != 'cancelled'),
            0
          ) as lifetime_value,
          COALESCE(
            (SELECT AVG(EXTRACT(DAY FROM (lead_date - created_at)))
             FROM (
               SELECT created_at, LEAD(created_at) OVER (ORDER BY created_at) as lead_date
               FROM orders WHERE customer_id = c.id AND status != 'cancelled'
             ) intervals WHERE lead_date IS NOT NULL),
            90
          ) as avg_order_interval
        FROM customers c
      )
      SELECT
        customer_id,
        customer_name,
        email,
        last_activity,
        lifetime_value,
        avg_order_interval,
        EXTRACT(DAY FROM (CURRENT_TIMESTAMP - last_activity)) as days_inactive
      FROM customer_activity
      WHERE last_activity > '1970-01-01'
        AND lifetime_value > 1000
        AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - last_activity)) > avg_order_interval * 1.5
      ORDER BY lifetime_value DESC
      LIMIT 10
    `);

    return result.rows.map(row => {
      const daysInactive = Math.round(row.days_inactive);
      let priority = this.PRIORITY.MEDIUM;
      if (row.lifetime_value > 20000 && daysInactive > 90) priority = this.PRIORITY.CRITICAL;
      else if (row.lifetime_value > 10000 || daysInactive > 120) priority = this.PRIORITY.HIGH;

      return {
        id: `churn-risk-${row.customer_id}`,
        type: this.TYPES.CHURN_RISK,
        priority,
        title: `${row.customer_name} may be at risk`,
        message: `No activity for ${daysInactive} days (normally orders every ${Math.round(row.avg_order_interval)} days). CLV: $${parseFloat(row.lifetime_value).toLocaleString()}`,
        timestamp: new Date().toISOString(),
        data: {
          customerId: row.customer_id,
          customerName: row.customer_name,
          email: row.email,
          lifetimeValue: parseFloat(row.lifetime_value),
          daysInactive,
          avgOrderInterval: Math.round(row.avg_order_interval),
          lastActivity: row.last_activity
        },
        actions: [
          { label: 'Send Re-engagement', action: 'send_reengagement', primary: true },
          { label: 'View Customer', action: 'view_customer' },
          { label: 'Create Quote', action: 'create_quote' }
        ]
      };
    });
  }

  /**
   * Get insights for low inventory items
   */
  async getInventoryInsights() {
    const result = await pool.query(`
      SELECT
        p.id,
        p.name,
        p.sku,
        p.quantity_available,
        p.reorder_point,
        COALESCE(
          (SELECT SUM(quantity) / NULLIF(COUNT(DISTINCT DATE(created_at)), 0)
           FROM order_items oi
           JOIN orders o ON oi.order_id = o.id
           WHERE oi.product_id = p.id
             AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'
             AND o.status != 'cancelled'),
          0
        ) as avg_daily_sales,
        CASE
          WHEN p.quantity_available <= 0 THEN 0
          WHEN COALESCE(
            (SELECT SUM(quantity) / NULLIF(COUNT(DISTINCT DATE(created_at)), 0)
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             WHERE oi.product_id = p.id
               AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'
               AND o.status != 'cancelled'),
            0
          ) > 0 THEN p.quantity_available / (SELECT SUM(quantity) / NULLIF(COUNT(DISTINCT DATE(created_at)), 0)
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             WHERE oi.product_id = p.id
               AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'
               AND o.status != 'cancelled')
          ELSE 999
        END as days_of_stock
      FROM products p
      WHERE p.is_active = true
        AND (p.quantity_available <= p.reorder_point OR p.quantity_available <= 5)
      ORDER BY
        CASE WHEN p.quantity_available <= 0 THEN 0 ELSE 1 END,
        days_of_stock ASC
      LIMIT 10
    `);

    return result.rows.map(row => {
      const daysOfStock = Math.round(row.days_of_stock);
      let priority = this.PRIORITY.LOW;
      let title = `${row.name} running low`;

      if (row.quantity_available <= 0) {
        priority = this.PRIORITY.CRITICAL;
        title = `${row.name} is OUT OF STOCK`;
      } else if (daysOfStock <= 3) {
        priority = this.PRIORITY.HIGH;
        title = `${row.name} will deplete in ${daysOfStock} days`;
      } else if (daysOfStock <= 7) {
        priority = this.PRIORITY.MEDIUM;
      }

      return {
        id: `inventory-${row.id}`,
        type: this.TYPES.INVENTORY_LOW,
        priority,
        title,
        message: `${row.quantity_available} units remaining${row.avg_daily_sales > 0 ? ` (selling ${row.avg_daily_sales.toFixed(1)}/day)` : ''}. Reorder point: ${row.reorder_point}`,
        timestamp: new Date().toISOString(),
        data: {
          productId: row.id,
          productName: row.name,
          sku: row.sku,
          quantityAvailable: row.quantity_available,
          reorderPoint: row.reorder_point,
          avgDailySales: parseFloat(row.avg_daily_sales) || 0,
          daysOfStock
        },
        actions: [
          { label: 'Create PO', action: 'create_po', primary: true },
          { label: 'View Product', action: 'view_product' },
          { label: 'Adjust Reorder', action: 'adjust_reorder' }
        ]
      };
    });
  }

  /**
   * Get insights for overdue invoices
   */
  async getOverdueInvoiceInsights() {
    const result = await pool.query(`
      SELECT
        i.id,
        i.invoice_number,
        i.total_amount,
        i.due_date,
        i.status,
        c.name as customer_name,
        c.id as customer_id,
        c.email as customer_email,
        EXTRACT(DAY FROM (CURRENT_DATE - i.due_date)) as days_overdue
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      WHERE i.status IN ('sent', 'pending', 'overdue')
        AND i.due_date < CURRENT_DATE
      ORDER BY i.total_amount DESC
      LIMIT 10
    `);

    return result.rows.map(row => {
      const daysOverdue = Math.round(row.days_overdue);
      let priority = this.PRIORITY.MEDIUM;
      if (daysOverdue > 30) priority = this.PRIORITY.CRITICAL;
      else if (daysOverdue > 14) priority = this.PRIORITY.HIGH;

      return {
        id: `overdue-invoice-${row.id}`,
        type: this.TYPES.INVOICE_OVERDUE,
        priority,
        title: `Invoice #${row.invoice_number} is ${daysOverdue} days overdue`,
        message: `${row.customer_name} owes $${parseFloat(row.total_amount).toLocaleString()}`,
        timestamp: new Date().toISOString(),
        data: {
          invoiceId: row.id,
          invoiceNumber: row.invoice_number,
          customerId: row.customer_id,
          customerName: row.customer_name,
          customerEmail: row.customer_email,
          amount: parseFloat(row.total_amount),
          dueDate: row.due_date,
          daysOverdue
        },
        actions: [
          { label: 'Send Reminder', action: 'send_payment_reminder', primary: true },
          { label: 'View Invoice', action: 'view_invoice' },
          { label: 'Record Payment', action: 'record_payment' }
        ]
      };
    });
  }

  /**
   * Get insights for customer milestones (anniversaries, order counts)
   */
  async getCustomerMilestoneInsights() {
    const result = await pool.query(`
      SELECT
        c.id as customer_id,
        c.name as customer_name,
        c.created_at as customer_since,
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.created_at)) as years_customer,
        COALESCE((SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND status != 'cancelled'), 0) as order_count,
        COALESCE((SELECT SUM(total_cents) / 100.0 FROM orders WHERE customer_id = c.id AND status != 'cancelled'), 0) as lifetime_value
      FROM customers c
      WHERE
        (EXTRACT(MONTH FROM c.created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
         AND EXTRACT(DAY FROM c.created_at) BETWEEN EXTRACT(DAY FROM CURRENT_DATE) - 7 AND EXTRACT(DAY FROM CURRENT_DATE) + 7
         AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.created_at)) >= 1)
        OR (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND status != 'cancelled') IN (10, 25, 50, 100)
      ORDER BY lifetime_value DESC
      LIMIT 5
    `);

    return result.rows.map(row => {
      const yearsCustomer = Math.round(row.years_customer);
      const isMilestoneOrder = [10, 25, 50, 100].includes(parseInt(row.order_count));

      let title, message;
      if (isMilestoneOrder) {
        title = `${row.customer_name} reached ${row.order_count} orders!`;
        message = `Celebrate this milestone - they've spent $${parseFloat(row.lifetime_value).toLocaleString()} with us`;
      } else {
        title = `${row.customer_name}'s ${yearsCustomer}-year anniversary`;
        message = `Customer since ${new Date(row.customer_since).getFullYear()}. Total orders: ${row.order_count}`;
      }

      return {
        id: `milestone-${row.customer_id}`,
        type: this.TYPES.CUSTOMER_MILESTONE,
        priority: this.PRIORITY.LOW,
        title,
        message,
        timestamp: new Date().toISOString(),
        data: {
          customerId: row.customer_id,
          customerName: row.customer_name,
          yearsCustomer,
          orderCount: parseInt(row.order_count),
          lifetimeValue: parseFloat(row.lifetime_value),
          customerSince: row.customer_since
        },
        actions: [
          { label: 'Send Thank You', action: 'send_thankyou', primary: true },
          { label: 'View Customer', action: 'view_customer' },
          { label: 'Create Special Offer', action: 'create_offer' }
        ]
      };
    });
  }

  /**
   * Get sales opportunity insights based on customer behavior
   */
  async getSalesOpportunityInsights() {
    // Find customers who might be ready to reorder based on patterns
    const result = await pool.query(`
      WITH customer_patterns AS (
        SELECT
          c.id as customer_id,
          c.name as customer_name,
          c.email,
          (SELECT MAX(created_at) FROM orders WHERE customer_id = c.id AND status != 'cancelled') as last_order_date,
          (SELECT AVG(EXTRACT(DAY FROM (lead_date - created_at)))
           FROM (
             SELECT created_at, LEAD(created_at) OVER (ORDER BY created_at) as lead_date
             FROM orders WHERE customer_id = c.id AND status != 'cancelled'
           ) intervals WHERE lead_date IS NOT NULL) as avg_order_interval,
          (SELECT SUM(total_cents) / 100.0 / NULLIF(COUNT(*), 0)
           FROM orders WHERE customer_id = c.id AND status != 'cancelled') as avg_order_value,
          (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND status != 'cancelled') as total_orders
        FROM customers c
      )
      SELECT
        customer_id,
        customer_name,
        email,
        last_order_date,
        avg_order_interval,
        avg_order_value,
        total_orders,
        EXTRACT(DAY FROM (CURRENT_TIMESTAMP - last_order_date)) as days_since_order
      FROM customer_patterns
      WHERE avg_order_interval IS NOT NULL
        AND avg_order_interval > 0
        AND total_orders >= 3
        AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - last_order_date))
            BETWEEN avg_order_interval * 0.8 AND avg_order_interval * 1.2
      ORDER BY avg_order_value DESC
      LIMIT 5
    `);

    return result.rows.map(row => ({
      id: `opportunity-${row.customer_id}`,
      type: this.TYPES.SALES_OPPORTUNITY,
      priority: this.PRIORITY.MEDIUM,
      title: `${row.customer_name} may be ready to reorder`,
      message: `Based on their pattern (every ${Math.round(row.avg_order_interval)} days), they typically order around now. Avg order: $${parseFloat(row.avg_order_value).toLocaleString()}`,
      timestamp: new Date().toISOString(),
      data: {
        customerId: row.customer_id,
        customerName: row.customer_name,
        email: row.email,
        avgOrderInterval: Math.round(row.avg_order_interval),
        avgOrderValue: parseFloat(row.avg_order_value),
        totalOrders: row.total_orders,
        daysSinceOrder: Math.round(row.days_since_order),
        lastOrderDate: row.last_order_date
      },
      actions: [
        { label: 'Create Quote', action: 'create_quote', primary: true },
        { label: 'Send Reminder', action: 'send_reorder_reminder' },
        { label: 'View History', action: 'view_customer' }
      ]
    }));
  }

  /**
   * Get unified activity timeline across all modules
   * @param {object} options - Options for filtering
   * @returns {Promise<Array>} - Array of activity events
   */
  async getUnifiedTimeline(options = {}) {
    const { limit = 50, customerId = null, startDate = null } = options;

    let dateFilter = '';
    const params = [];
    let paramIndex = 1;

    if (startDate) {
      dateFilter = `AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    let customerFilter = '';
    if (customerId) {
      customerFilter = `AND customer_id = $${paramIndex}`;
      params.push(customerId);
      paramIndex++;
    }

    const limitParam = `$${paramIndex}`;
    params.push(limit);

    const result = await pool.query(`
      (
        SELECT
          'quote' as event_type,
          q.id as entity_id,
          q.quote_number as entity_number,
          q.status,
          q.total_amount as amount,
          q.created_at,
          q.customer_id,
          c.name as customer_name,
          'Quote created' as event_description
        FROM quotations q
        JOIN customers c ON q.customer_id = c.id
        WHERE 1=1 ${dateFilter} ${customerFilter}
      )
      UNION ALL
      (
        SELECT
          'order' as event_type,
          o.id as entity_id,
          o.order_number as entity_number,
          o.status,
          o.total_cents / 100.0 as amount,
          o.created_at,
          o.customer_id,
          c.name as customer_name,
          'Order placed' as event_description
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        WHERE 1=1 ${dateFilter} ${customerFilter}
      )
      UNION ALL
      (
        SELECT
          'invoice' as event_type,
          i.id as entity_id,
          i.invoice_number as entity_number,
          i.status,
          i.total_amount as amount,
          i.created_at,
          i.customer_id,
          c.name as customer_name,
          'Invoice created' as event_description
        FROM invoices i
        JOIN customers c ON i.customer_id = c.id
        WHERE 1=1 ${dateFilter} ${customerFilter}
      )
      ORDER BY created_at DESC
      LIMIT ${limitParam}
    `, params);

    return result.rows.map(row => ({
      id: `${row.event_type}-${row.entity_id}`,
      type: row.event_type,
      entityId: row.entity_id,
      entityNumber: row.entity_number,
      status: row.status,
      amount: parseFloat(row.amount) || 0,
      timestamp: row.created_at,
      customerId: row.customer_id,
      customerName: row.customer_name,
      description: row.event_description
    }));
  }

  /**
   * Get quick action counts for dashboard
   * @returns {Promise<object>} - Object with counts for various actionable items
   */
  async getQuickActionCounts() {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM quotations WHERE status IN ('sent', 'pending') AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days') as quotes_expiring_soon,
        (SELECT COUNT(*) FROM quotations WHERE status IN ('sent', 'pending') AND COALESCE(sent_at, created_at) < CURRENT_TIMESTAMP - INTERVAL '7 days') as stale_quotes,
        (SELECT COUNT(*) FROM invoices WHERE status IN ('sent', 'pending', 'overdue') AND due_date < CURRENT_DATE) as overdue_invoices,
        (SELECT COUNT(*) FROM products WHERE is_active = true AND quantity_available <= reorder_point) as low_stock_items,
        (SELECT COUNT(*) FROM products WHERE is_active = true AND quantity_available <= 0) as out_of_stock_items,
        (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders
    `);

    return result.rows[0];
  }

  /**
   * Dismiss an insight for a user
   * @param {string} insightId - The insight ID
   * @param {number} userId - The user ID
   * @returns {Promise<object>}
   */
  async dismissInsight(insightId, userId) {
    // Check if dismissed_insights table exists, create if not
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dismissed_insights (
        id SERIAL PRIMARY KEY,
        insight_id VARCHAR(255) NOT NULL,
        user_id INTEGER NOT NULL,
        dismissed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        UNIQUE(insight_id, user_id)
      )
    `);

    // Dismiss for 24 hours by default
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const result = await pool.query(`
      INSERT INTO dismissed_insights (insight_id, user_id, expires_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (insight_id, user_id)
      DO UPDATE SET dismissed_at = CURRENT_TIMESTAMP, expires_at = $3
      RETURNING *
    `, [insightId, userId, expiresAt]);

    return result.rows[0];
  }

  /**
   * Get list of dismissed insight IDs for a user
   * @param {number} userId - The user ID
   * @returns {Promise<Array<string>>}
   */
  async getDismissedInsightIds(userId) {
    try {
      const result = await pool.query(`
        SELECT insight_id FROM dismissed_insights
        WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      `, [userId]);

      return result.rows.map(r => r.insight_id);
    } catch (err) {
      // Table might not exist yet
      return [];
    }
  }
}

InsightsEngine.prototype._setPool = function(p) { pool = p; };

// Export singleton instance
module.exports = new InsightsEngine();
