/**
 * Lead Source Analytics Service
 * Tracks ROI and performance metrics by lead source
 */

class LeadSourceAnalyticsService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Get comprehensive lead source analytics
   */
  async getSourceAnalytics(days = 90) {
    const [sources, trends, performance, topPerformers] = await Promise.all([
      this.getSourceBreakdown(days),
      this.getSourceTrends(days),
      this.getSourcePerformance(days),
      this.getTopPerformingSources(days)
    ]);

    return {
      period: `${days}_days`,
      sources,
      trends,
      performance,
      topPerformers,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get breakdown by source
   */
  async getSourceBreakdown(days = 90) {
    const result = await this.pool.query(`
      SELECT
        COALESCE(l.lead_source, 'Unknown') as source,
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE l.status = 'new') as new_count,
        COUNT(*) FILTER (WHERE l.status = 'contacted') as contacted_count,
        COUNT(*) FILTER (WHERE l.status = 'qualified') as qualified_count,
        COUNT(*) FILTER (WHERE l.status = 'converted') as converted_count,
        COUNT(*) FILTER (WHERE l.status = 'lost') as lost_count,
        AVG(l.lead_score) FILTER (WHERE l.lead_score IS NOT NULL) as avg_lead_score,
        COUNT(*) FILTER (WHERE l.priority = 'hot') as hot_leads,
        AVG(EXTRACT(hours FROM (l.updated_at - l.created_at)) / 24)
          FILTER (WHERE l.status = 'converted') as avg_days_to_convert
      FROM leads l
      WHERE l.created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY l.lead_source
      ORDER BY total_leads DESC
    `);

    const total = result.rows.reduce((sum, r) => sum + parseInt(r.total_leads), 0);

    return result.rows.map(row => ({
      source: row.source,
      totalLeads: parseInt(row.total_leads),
      percentage: total > 0 ? Math.round((parseInt(row.total_leads) / total) * 100) : 0,
      breakdown: {
        new: parseInt(row.new_count) || 0,
        contacted: parseInt(row.contacted_count) || 0,
        qualified: parseInt(row.qualified_count) || 0,
        converted: parseInt(row.converted_count) || 0,
        lost: parseInt(row.lost_count) || 0
      },
      metrics: {
        conversionRate: parseInt(row.total_leads) > 0
          ? Math.round((parseInt(row.converted_count) / parseInt(row.total_leads)) * 100)
          : 0,
        avgLeadScore: Math.round(parseFloat(row.avg_lead_score) || 0),
        hotLeads: parseInt(row.hot_leads) || 0,
        avgDaysToConvert: Math.round(parseFloat(row.avg_days_to_convert) || 0)
      }
    }));
  }

  /**
   * Get source performance with revenue
   */
  async getSourcePerformance(days = 90) {
    const result = await this.pool.query(`
      WITH lead_revenue AS (
        SELECT
          l.lead_source,
          l.id as lead_id,
          COALESCE(SUM(q.total_cents) FILTER (WHERE q.status = 'WON'), 0) as revenue
        FROM leads l
        LEFT JOIN quotations q ON q.lead_id = l.id
        WHERE l.created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY l.lead_source, l.id
      )
      SELECT
        COALESCE(lead_source, 'Unknown') as source,
        COUNT(DISTINCT lead_id) as total_leads,
        COUNT(DISTINCT lead_id) FILTER (WHERE revenue > 0) as leads_with_revenue,
        SUM(revenue) as total_revenue,
        AVG(revenue) FILTER (WHERE revenue > 0) as avg_revenue_per_conversion
      FROM lead_revenue
      GROUP BY lead_source
      ORDER BY total_revenue DESC
    `);

    return result.rows.map(row => ({
      source: row.source,
      totalLeads: parseInt(row.total_leads),
      leadsWithRevenue: parseInt(row.leads_with_revenue) || 0,
      totalRevenue: parseInt(row.total_revenue) || 0,
      avgRevenuePerConversion: Math.round(parseFloat(row.avg_revenue_per_conversion) || 0),
      revenuePerLead: parseInt(row.total_leads) > 0
        ? Math.round(parseInt(row.total_revenue) / parseInt(row.total_leads))
        : 0
    }));
  }

  /**
   * Get source trends over time
   */
  async getSourceTrends(days = 90) {
    const result = await this.pool.query(`
      SELECT
        DATE_TRUNC('week', created_at) as week,
        COALESCE(lead_source, 'Unknown') as source,
        COUNT(*) as lead_count
      FROM leads
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE_TRUNC('week', created_at), lead_source
      ORDER BY week, lead_count DESC
    `);

    // Group by week
    const weeklyData = {};
    result.rows.forEach(row => {
      const weekKey = row.week.toISOString().split('T')[0];
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = {};
      }
      weeklyData[weekKey][row.source] = parseInt(row.lead_count);
    });

    return Object.entries(weeklyData).map(([week, sources]) => ({
      week,
      sources,
      total: Object.values(sources).reduce((sum, count) => sum + count, 0)
    }));
  }

  /**
   * Get top performing sources
   */
  async getTopPerformingSources(days = 90) {
    const result = await this.pool.query(`
      WITH source_metrics AS (
        SELECT
          COALESCE(l.lead_source, 'Unknown') as source,
          COUNT(*) as total_leads,
          COUNT(*) FILTER (WHERE l.status = 'converted') as converted,
          AVG(l.lead_score) as avg_score,
          COALESCE(SUM(q.total_cents) FILTER (WHERE q.status = 'WON'), 0) as revenue
        FROM leads l
        LEFT JOIN quotations q ON q.lead_id = l.id
        WHERE l.created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY l.lead_source
        HAVING COUNT(*) >= 5
      )
      SELECT
        source,
        total_leads,
        converted,
        CASE WHEN total_leads > 0 THEN ROUND((converted::numeric / total_leads) * 100, 1) ELSE 0 END as conversion_rate,
        ROUND(avg_score, 0) as avg_score,
        revenue,
        CASE WHEN total_leads > 0 THEN ROUND(revenue::numeric / total_leads, 0) ELSE 0 END as revenue_per_lead
      FROM source_metrics
      ORDER BY conversion_rate DESC, revenue_per_lead DESC
      LIMIT 5
    `);

    return result.rows.map(row => ({
      source: row.source,
      totalLeads: parseInt(row.total_leads),
      converted: parseInt(row.converted),
      conversionRate: parseFloat(row.conversion_rate),
      avgScore: parseInt(row.avg_score) || 0,
      revenue: parseInt(row.revenue),
      revenuePerLead: parseInt(row.revenue_per_lead)
    }));
  }

  /**
   * Get source comparison (for A/B analysis)
   */
  async compareSourcees(source1, source2, days = 90) {
    const result = await this.pool.query(`
      SELECT
        COALESCE(l.lead_source, 'Unknown') as source,
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE l.status = 'converted') as converted,
        AVG(l.lead_score) as avg_score,
        AVG(EXTRACT(hours FROM (l.updated_at - l.created_at)) / 24)
          FILTER (WHERE l.status = 'converted') as avg_days_to_convert,
        COALESCE(SUM(q.total_cents) FILTER (WHERE q.status = 'WON'), 0) as revenue
      FROM leads l
      LEFT JOIN quotations q ON q.lead_id = l.id
      WHERE l.created_at >= NOW() - INTERVAL '${days} days'
        AND l.lead_source IN ($1, $2)
      GROUP BY l.lead_source
    `, [source1, source2]);

    return result.rows.map(row => ({
      source: row.source,
      totalLeads: parseInt(row.total_leads),
      converted: parseInt(row.converted),
      conversionRate: parseInt(row.total_leads) > 0
        ? Math.round((parseInt(row.converted) / parseInt(row.total_leads)) * 100)
        : 0,
      avgScore: Math.round(parseFloat(row.avg_score) || 0),
      avgDaysToConvert: Math.round(parseFloat(row.avg_days_to_convert) || 0),
      revenue: parseInt(row.revenue)
    }));
  }
}

module.exports = LeadSourceAnalyticsService;
