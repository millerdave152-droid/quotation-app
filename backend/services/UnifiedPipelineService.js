/**
 * Unified Pipeline Service
 * Aggregates data from leads, quotes, and customers to provide
 * a complete view of the sales funnel with real-time metrics.
 */

class UnifiedPipelineService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Get unified sales pipeline overview
   * Shows the complete funnel: Leads -> Qualified -> Quotes -> Won
   */
  async getPipelineOverview() {
    const cacheKey = 'pipeline:overview';

    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    // Lead funnel stages
    const leadStats = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'new') as new_leads,
        COUNT(*) FILTER (WHERE status = 'contacted') as contacted_leads,
        COUNT(*) FILTER (WHERE status = 'qualified') as qualified_leads,
        COUNT(*) FILTER (WHERE status = 'quote_created') as quote_created_leads,
        COUNT(*) FILTER (WHERE status = 'converted') as converted_leads,
        COUNT(*) FILTER (WHERE status = 'lost') as lost_leads,
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as leads_this_week,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as leads_this_month,
        COUNT(*) FILTER (WHERE priority = 'hot') as hot_leads,
        COUNT(*) FILTER (WHERE priority = 'warm') as warm_leads,
        COUNT(*) FILTER (WHERE priority = 'cold') as cold_leads,
        COUNT(*) FILTER (WHERE follow_up_date <= CURRENT_DATE AND status NOT IN ('converted', 'lost')) as overdue_follow_ups
      FROM leads
    `);

    // Quote funnel stages
    const quoteStats = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'draft') as draft_quotes,
        COUNT(*) FILTER (WHERE status = 'sent') as sent_quotes,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_quotes,
        COUNT(*) FILTER (WHERE status = 'won') as won_quotes,
        COUNT(*) FILTER (WHERE status = 'lost') as lost_quotes,
        COUNT(*) as total_quotes,
        COALESCE(SUM(total_cents) FILTER (WHERE status IN ('draft', 'sent', 'pending')), 0) as pipeline_value_cents,
        COALESCE(SUM(total_cents) FILTER (WHERE status = 'won'), 0) as won_value_cents,
        COALESCE(SUM(total_cents) FILTER (WHERE status = 'lost'), 0) as lost_value_cents,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as quotes_this_week,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as quotes_this_month,
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400) FILTER (WHERE status = 'won') as avg_days_to_close
      FROM quotations
    `);

    // Customer stats
    const customerStats = await this.pool.query(`
      SELECT
        COUNT(*) as total_customers,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as new_customers_this_month,
        COUNT(*) FILTER (WHERE churn_risk = 'high') as at_risk_customers,
        COUNT(*) FILTER (WHERE clv_segment = 'platinum') as platinum_customers,
        COUNT(*) FILTER (WHERE clv_segment = 'gold') as gold_customers,
        COALESCE(SUM(clv_score), 0) as total_clv
      FROM customers
    `);

    // Conversion rates
    const leads = leadStats.rows[0];
    const quotes = quoteStats.rows[0];
    const customers = customerStats.rows[0];

    const leadToQuoteRate = leads.total_leads > 0
      ? ((parseInt(leads.quote_created_leads) + parseInt(leads.converted_leads)) / parseInt(leads.total_leads) * 100).toFixed(1)
      : 0;

    const quoteToWonRate = quotes.total_quotes > 0
      ? (parseInt(quotes.won_quotes) / parseInt(quotes.total_quotes) * 100).toFixed(1)
      : 0;

    const closedQuotes = parseInt(quotes.won_quotes) + parseInt(quotes.lost_quotes);
    const winRate = closedQuotes > 0
      ? (parseInt(quotes.won_quotes) / closedQuotes * 100).toFixed(1)
      : 0;

    const result = {
      leads: {
        new: parseInt(leads.new_leads),
        contacted: parseInt(leads.contacted_leads),
        qualified: parseInt(leads.qualified_leads),
        quoteCreated: parseInt(leads.quote_created_leads),
        converted: parseInt(leads.converted_leads),
        lost: parseInt(leads.lost_leads),
        total: parseInt(leads.total_leads),
        thisWeek: parseInt(leads.leads_this_week),
        thisMonth: parseInt(leads.leads_this_month),
        hot: parseInt(leads.hot_leads),
        warm: parseInt(leads.warm_leads),
        cold: parseInt(leads.cold_leads),
        overdueFollowUps: parseInt(leads.overdue_follow_ups)
      },
      quotes: {
        draft: parseInt(quotes.draft_quotes),
        sent: parseInt(quotes.sent_quotes),
        pending: parseInt(quotes.pending_quotes),
        won: parseInt(quotes.won_quotes),
        lost: parseInt(quotes.lost_quotes),
        total: parseInt(quotes.total_quotes),
        pipelineValueCents: parseInt(quotes.pipeline_value_cents),
        wonValueCents: parseInt(quotes.won_value_cents),
        lostValueCents: parseInt(quotes.lost_value_cents),
        thisWeek: parseInt(quotes.quotes_this_week),
        thisMonth: parseInt(quotes.quotes_this_month),
        avgDaysToClose: quotes.avg_days_to_close ? parseFloat(quotes.avg_days_to_close).toFixed(1) : 0
      },
      customers: {
        total: parseInt(customers.total_customers),
        newThisMonth: parseInt(customers.new_customers_this_month),
        atRisk: parseInt(customers.at_risk_customers),
        platinum: parseInt(customers.platinum_customers),
        gold: parseInt(customers.gold_customers),
        totalClvCents: parseInt(customers.total_clv)
      },
      conversionRates: {
        leadToQuote: parseFloat(leadToQuoteRate),
        quoteToWon: parseFloat(quoteToWonRate),
        winRate: parseFloat(winRate)
      },
      funnel: [
        { stage: 'New Leads', count: parseInt(leads.new_leads), color: '#6366f1' },
        { stage: 'Contacted', count: parseInt(leads.contacted_leads), color: '#8b5cf6' },
        { stage: 'Qualified', count: parseInt(leads.qualified_leads), color: '#a855f7' },
        { stage: 'Quote Created', count: parseInt(quotes.draft_quotes) + parseInt(quotes.sent_quotes), color: '#3b82f6' },
        { stage: 'Quote Sent', count: parseInt(quotes.sent_quotes), color: '#0ea5e9' },
        { stage: 'Won', count: parseInt(quotes.won_quotes), color: '#22c55e' }
      ]
    };

    if (this.cache) {
      this.cache.set(cacheKey, result, 300); // 5 minute cache
    }

    return result;
  }

  /**
   * Get pipeline stage breakdown with value
   */
  async getPipelineStages() {
    const result = await this.pool.query(`
      WITH lead_stages AS (
        SELECT
          status as stage,
          COUNT(*) as count,
          0 as value_cents
        FROM leads
        WHERE status NOT IN ('converted', 'lost')
        GROUP BY status
      ),
      quote_stages AS (
        SELECT
          status as stage,
          COUNT(*) as count,
          COALESCE(SUM(total_cents), 0) as value_cents
        FROM quotations
        WHERE status NOT IN ('won', 'lost')
        GROUP BY status
      )
      SELECT * FROM lead_stages
      UNION ALL
      SELECT * FROM quote_stages
      ORDER BY
        CASE stage
          WHEN 'new' THEN 1
          WHEN 'contacted' THEN 2
          WHEN 'qualified' THEN 3
          WHEN 'quote_created' THEN 4
          WHEN 'draft' THEN 5
          WHEN 'sent' THEN 6
          WHEN 'pending' THEN 7
          ELSE 10
        END
    `);

    return result.rows.map(row => ({
      stage: row.stage,
      count: parseInt(row.count),
      valueCents: parseInt(row.value_cents)
    }));
  }

  /**
   * Get pipeline velocity metrics
   * Measures how fast deals move through stages
   */
  async getPipelineVelocity(days = 30) {
    const result = await this.pool.query(`
      WITH stage_times AS (
        -- Lead stage transitions
        SELECT
          l.id,
          'lead' as type,
          l.status,
          EXTRACT(EPOCH FROM (l.updated_at - l.created_at)) / 86400 as days_in_stage
        FROM leads l
        WHERE l.created_at >= CURRENT_DATE - $1::int
      ),
      quote_times AS (
        -- Quote stage transitions
        SELECT
          q.id,
          'quote' as type,
          q.status,
          EXTRACT(EPOCH FROM (q.updated_at - q.created_at)) / 86400 as days_in_stage
        FROM quotations q
        WHERE q.created_at >= CURRENT_DATE - $1::int
      )
      SELECT
        type,
        status,
        COUNT(*) as count,
        AVG(days_in_stage) as avg_days,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_in_stage) as median_days
      FROM (SELECT * FROM stage_times UNION ALL SELECT * FROM quote_times) combined
      GROUP BY type, status
      ORDER BY type,
        CASE status
          WHEN 'new' THEN 1
          WHEN 'contacted' THEN 2
          WHEN 'qualified' THEN 3
          WHEN 'quote_created' THEN 4
          WHEN 'draft' THEN 5
          WHEN 'sent' THEN 6
          WHEN 'pending' THEN 7
          WHEN 'won' THEN 8
          WHEN 'lost' THEN 9
          ELSE 10
        END
    `, [days]);

    return result.rows.map(row => ({
      type: row.type,
      status: row.status,
      count: parseInt(row.count),
      avgDays: row.avg_days ? parseFloat(row.avg_days).toFixed(1) : 0,
      medianDays: row.median_days ? parseFloat(row.median_days).toFixed(1) : 0
    }));
  }

  /**
   * Get top opportunities in the pipeline
   * Ordered by value and win probability
   */
  async getTopOpportunities(limit = 10) {
    const result = await this.pool.query(`
      SELECT
        q.id,
        q.quote_number,
        q.status,
        q.total_cents,
        q.margin_percent,
        q.created_at,
        q.updated_at,
        c.name as customer_name,
        c.company as customer_company,
        c.clv_segment,
        c.churn_risk,
        l.lead_number,
        l.priority as lead_priority,
        NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') as assigned_to
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      LEFT JOIN leads l ON l.quotation_id = q.id
      LEFT JOIN users u ON q.created_by = u.id
      WHERE q.status IN ('draft', 'sent', 'pending')
      ORDER BY q.total_cents DESC, q.created_at ASC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
      id: row.id,
      quoteNumber: row.quote_number,
      status: row.status,
      totalCents: parseInt(row.total_cents),
      marginPercent: row.margin_percent ? parseFloat(row.margin_percent) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      customer: {
        name: row.customer_name,
        company: row.customer_company,
        clvSegment: row.clv_segment,
        churnRisk: row.churn_risk
      },
      lead: row.lead_number ? {
        leadNumber: row.lead_number,
        priority: row.lead_priority
      } : null,
      assignedTo: row.assigned_to
    }));
  }

  /**
   * Get pipeline trends over time
   */
  async getPipelineTrends(days = 30) {
    const result = await this.pool.query(`
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - $1::int + 1,
          CURRENT_DATE,
          '1 day'::interval
        )::date as date
      ),
      daily_leads AS (
        SELECT
          DATE(created_at) as date,
          COUNT(*) as leads_created,
          COUNT(*) FILTER (WHERE status = 'converted') as leads_converted
        FROM leads
        WHERE created_at >= CURRENT_DATE - $1::int
        GROUP BY DATE(created_at)
      ),
      daily_quotes AS (
        SELECT
          DATE(created_at) as date,
          COUNT(*) as quotes_created,
          COALESCE(SUM(total_cents), 0) as quotes_value_cents,
          COUNT(*) FILTER (WHERE status = 'won') as quotes_won,
          COALESCE(SUM(total_cents) FILTER (WHERE status = 'won'), 0) as won_value_cents
        FROM quotations
        WHERE created_at >= CURRENT_DATE - $1::int
        GROUP BY DATE(created_at)
      )
      SELECT
        d.date,
        COALESCE(l.leads_created, 0) as leads_created,
        COALESCE(l.leads_converted, 0) as leads_converted,
        COALESCE(q.quotes_created, 0) as quotes_created,
        COALESCE(q.quotes_value_cents, 0) as quotes_value_cents,
        COALESCE(q.quotes_won, 0) as quotes_won,
        COALESCE(q.won_value_cents, 0) as won_value_cents
      FROM date_series d
      LEFT JOIN daily_leads l ON d.date = l.date
      LEFT JOIN daily_quotes q ON d.date = q.date
      ORDER BY d.date
    `, [days]);

    return result.rows.map(row => ({
      date: row.date,
      leadsCreated: parseInt(row.leads_created),
      leadsConverted: parseInt(row.leads_converted),
      quotesCreated: parseInt(row.quotes_created),
      quotesValueCents: parseInt(row.quotes_value_cents),
      quotesWon: parseInt(row.quotes_won),
      wonValueCents: parseInt(row.won_value_cents)
    }));
  }

  /**
   * Get sales performance by source
   */
  async getPerformanceBySource() {
    const result = await this.pool.query(`
      SELECT
        COALESCE(l.lead_source, 'Direct') as source,
        COUNT(DISTINCT l.id) as leads_count,
        COUNT(DISTINCT CASE WHEN l.status IN ('quote_created', 'converted') THEN l.id END) as converted_leads,
        COUNT(DISTINCT q.id) as quotes_count,
        COUNT(DISTINCT CASE WHEN q.status = 'won' THEN q.id END) as won_quotes,
        COALESCE(SUM(q.total_cents) FILTER (WHERE q.status = 'won'), 0) as won_value_cents,
        CASE
          WHEN COUNT(DISTINCT l.id) > 0
          THEN (COUNT(DISTINCT CASE WHEN l.status IN ('quote_created', 'converted') THEN l.id END)::float / COUNT(DISTINCT l.id) * 100)
          ELSE 0
        END as lead_conversion_rate,
        CASE
          WHEN COUNT(DISTINCT q.id) > 0
          THEN (COUNT(DISTINCT CASE WHEN q.status = 'won' THEN q.id END)::float / COUNT(DISTINCT q.id) * 100)
          ELSE 0
        END as quote_win_rate
      FROM leads l
      LEFT JOIN quotations q ON l.quotation_id = q.id
      GROUP BY COALESCE(l.lead_source, 'Direct')
      ORDER BY won_value_cents DESC
    `);

    return result.rows.map(row => ({
      source: row.source,
      leadsCount: parseInt(row.leads_count),
      convertedLeads: parseInt(row.converted_leads),
      quotesCount: parseInt(row.quotes_count),
      wonQuotes: parseInt(row.won_quotes),
      wonValueCents: parseInt(row.won_value_cents),
      leadConversionRate: parseFloat(row.lead_conversion_rate).toFixed(1),
      quoteWinRate: parseFloat(row.quote_win_rate).toFixed(1)
    }));
  }

  /**
   * Get team performance summary
   */
  async getTeamPerformance(days = 30) {
    const result = await this.pool.query(`
      SELECT
        u.id as user_id,
        NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') as name,
        u.role,
        COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= CURRENT_DATE - $1::int) as leads_assigned,
        COUNT(DISTINCT l.id) FILTER (WHERE l.status IN ('quote_created', 'converted') AND l.created_at >= CURRENT_DATE - $1::int) as leads_converted,
        COUNT(DISTINCT q.id) FILTER (WHERE q.created_at >= CURRENT_DATE - $1::int) as quotes_created,
        COUNT(DISTINCT q.id) FILTER (WHERE q.status = 'won' AND q.created_at >= CURRENT_DATE - $1::int) as quotes_won,
        COALESCE(SUM(q.total_cents) FILTER (WHERE q.status = 'won' AND q.created_at >= CURRENT_DATE - $1::int), 0) as won_value_cents,
        AVG(EXTRACT(EPOCH FROM (q.updated_at - q.created_at)) / 86400) FILTER (WHERE q.status = 'won' AND q.created_at >= CURRENT_DATE - $1::int) as avg_days_to_close
      FROM users u
      LEFT JOIN leads l ON l.assigned_to = u.id
      LEFT JOIN quotations q ON q.created_by = u.id
      WHERE u.is_active = true OR u.is_active IS NULL
      GROUP BY u.id, u.first_name, u.last_name, u.role
      HAVING COUNT(DISTINCT l.id) > 0 OR COUNT(DISTINCT q.id) > 0
      ORDER BY won_value_cents DESC
    `, [days]);

    return result.rows.map(row => ({
      userId: row.user_id,
      name: row.name || 'Unknown',
      role: row.role,
      leadsAssigned: parseInt(row.leads_assigned),
      leadsConverted: parseInt(row.leads_converted),
      quotesCreated: parseInt(row.quotes_created),
      quotesWon: parseInt(row.quotes_won),
      wonValueCents: parseInt(row.won_value_cents),
      avgDaysToClose: row.avg_days_to_close ? parseFloat(row.avg_days_to_close).toFixed(1) : null,
      conversionRate: row.leads_assigned > 0
        ? (parseInt(row.leads_converted) / parseInt(row.leads_assigned) * 100).toFixed(1)
        : 0
    }));
  }

  /**
   * Get action items that need attention
   */
  async getActionItems() {
    const [overdueFollowUps, stalledQuotes, atRiskCustomers, hotLeads] = await Promise.all([
      // Overdue follow-ups
      this.pool.query(`
        SELECT
          l.id,
          l.lead_number,
          l.contact_name,
          l.follow_up_date,
          l.priority,
          (CURRENT_DATE - l.follow_up_date::date) as days_overdue,
          NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') as assigned_to
        FROM leads l
        LEFT JOIN users u ON l.assigned_to = u.id
        WHERE l.follow_up_date < CURRENT_DATE
          AND l.status NOT IN ('converted', 'lost')
        ORDER BY l.follow_up_date ASC
        LIMIT 10
      `),

      // Stalled quotes (no activity for 7+ days)
      this.pool.query(`
        SELECT
          q.id,
          q.quote_number,
          q.status,
          q.total_cents,
          q.updated_at,
          EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - q.updated_at)) / 86400 as days_stalled,
          c.name as customer_name
        FROM quotations q
        LEFT JOIN customers c ON q.customer_id = c.id
        WHERE q.status IN ('sent', 'pending')
          AND q.updated_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
        ORDER BY q.total_cents DESC
        LIMIT 10
      `),

      // At-risk customers with open quotes
      this.pool.query(`
        SELECT
          c.id as customer_id,
          c.name,
          c.churn_risk,
          c.clv_score,
          c.days_since_last_activity,
          COUNT(q.id) as open_quotes,
          COALESCE(SUM(q.total_cents), 0) as open_quote_value_cents
        FROM customers c
        JOIN quotations q ON q.customer_id = c.id AND q.status IN ('draft', 'sent', 'pending')
        WHERE c.churn_risk = 'high'
        GROUP BY c.id, c.name, c.churn_risk, c.clv_score, c.days_since_last_activity
        ORDER BY c.clv_score DESC
        LIMIT 10
      `),

      // Hot leads requiring immediate action
      this.pool.query(`
        SELECT
          l.id,
          l.lead_number,
          l.contact_name,
          l.contact_email,
          l.status,
          l.created_at,
          NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') as assigned_to
        FROM leads l
        LEFT JOIN users u ON l.assigned_to = u.id
        WHERE l.priority = 'hot'
          AND l.status NOT IN ('converted', 'lost')
        ORDER BY l.created_at ASC
        LIMIT 10
      `)
    ]);

    return {
      overdueFollowUps: overdueFollowUps.rows.map(row => ({
        id: row.id,
        leadNumber: row.lead_number,
        contactName: row.contact_name,
        followUpDate: row.follow_up_date,
        priority: row.priority,
        daysOverdue: Math.floor(row.days_overdue),
        assignedTo: row.assigned_to
      })),
      stalledQuotes: stalledQuotes.rows.map(row => ({
        id: row.id,
        quoteNumber: row.quote_number,
        status: row.status,
        totalCents: parseInt(row.total_cents),
        updatedAt: row.updated_at,
        daysStalled: Math.floor(row.days_stalled),
        customerName: row.customer_name
      })),
      atRiskCustomers: atRiskCustomers.rows.map(row => ({
        customerId: row.customer_id,
        name: row.name,
        churnRisk: row.churn_risk,
        clvScore: parseInt(row.clv_score),
        daysSinceLastActivity: row.days_since_last_activity,
        openQuotes: parseInt(row.open_quotes),
        openQuoteValueCents: parseInt(row.open_quote_value_cents)
      })),
      hotLeads: hotLeads.rows.map(row => ({
        id: row.id,
        leadNumber: row.lead_number,
        contactName: row.contact_name,
        contactEmail: row.contact_email,
        status: row.status,
        createdAt: row.created_at,
        assignedTo: row.assigned_to
      }))
    };
  }
}

module.exports = UnifiedPipelineService;
