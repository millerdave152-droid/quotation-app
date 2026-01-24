/**
 * Conversion Analytics Service
 * Analyzes conversion rates at each stage of the sales funnel
 * - Lead -> Qualified -> Quote -> Won conversion rates
 * - Bottleneck identification
 * - Time in stage analysis
 * - Drop-off point detection
 */

class ConversionAnalyticsService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Get full funnel analysis
   */
  async getFunnelAnalysis(days = 90) {
    const [stages, timing, dropoffs, trends, bySource] = await Promise.all([
      this.getStageConversions(days),
      this.getStageTiming(days),
      this.getDropoffAnalysis(days),
      this.getConversionTrends(days),
      this.getConversionBySource(days)
    ]);

    const bottlenecks = this.identifyBottlenecks(stages, timing, dropoffs);

    return {
      period: `${days}_days`,
      stages,
      timing,
      dropoffs,
      trends,
      bySource,
      bottlenecks,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get conversion rates at each funnel stage
   */
  async getStageConversions(days = 90) {
    // Lead funnel stages
    const leadResult = await this.pool.query(`
      WITH lead_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '${days} days') as total_leads,
          COUNT(*) FILTER (WHERE status = 'contacted' AND created_at >= NOW() - INTERVAL '${days} days') as contacted,
          COUNT(*) FILTER (WHERE status = 'qualified' AND created_at >= NOW() - INTERVAL '${days} days') as qualified,
          COUNT(*) FILTER (WHERE status = 'converted' AND created_at >= NOW() - INTERVAL '${days} days') as converted,
          COUNT(*) FILTER (WHERE status = 'lost' AND created_at >= NOW() - INTERVAL '${days} days') as lost
        FROM leads
      )
      SELECT * FROM lead_stats
    `);

    // Quote funnel stages
    const quoteResult = await this.pool.query(`
      WITH quote_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '${days} days') as total_quotes,
          COUNT(*) FILTER (WHERE status IN ('SENT', 'PENDING_APPROVAL', 'APPROVED', 'WON', 'LOST') AND created_at >= NOW() - INTERVAL '${days} days') as sent,
          COUNT(*) FILTER (WHERE status IN ('APPROVED', 'WON', 'LOST') AND created_at >= NOW() - INTERVAL '${days} days') as approved,
          COUNT(*) FILTER (WHERE status = 'WON' AND created_at >= NOW() - INTERVAL '${days} days') as won,
          COUNT(*) FILTER (WHERE status = 'LOST' AND created_at >= NOW() - INTERVAL '${days} days') as lost,
          SUM(total_cents) FILTER (WHERE status = 'WON' AND created_at >= NOW() - INTERVAL '${days} days') as won_value
        FROM quotations
      )
      SELECT * FROM quote_stats
    `);

    const leads = leadResult.rows[0];
    const quotes = quoteResult.rows[0];

    const totalLeads = parseInt(leads.total_leads) || 0;
    const contacted = parseInt(leads.contacted) || 0;
    const qualified = parseInt(leads.qualified) || 0;
    const converted = parseInt(leads.converted) || 0;
    const leadLost = parseInt(leads.lost) || 0;

    const totalQuotes = parseInt(quotes.total_quotes) || 0;
    const sent = parseInt(quotes.sent) || 0;
    const approved = parseInt(quotes.approved) || 0;
    const won = parseInt(quotes.won) || 0;
    const quoteLost = parseInt(quotes.lost) || 0;
    const wonValue = parseInt(quotes.won_value) || 0;

    return {
      leadFunnel: [
        {
          stage: 'New Leads',
          count: totalLeads,
          percentage: 100,
          dropoff: 0
        },
        {
          stage: 'Contacted',
          count: contacted,
          percentage: totalLeads > 0 ? Math.round((contacted / totalLeads) * 100) : 0,
          dropoff: totalLeads > 0 ? Math.round(((totalLeads - contacted) / totalLeads) * 100) : 0
        },
        {
          stage: 'Qualified',
          count: qualified,
          percentage: totalLeads > 0 ? Math.round((qualified / totalLeads) * 100) : 0,
          dropoff: contacted > 0 ? Math.round(((contacted - qualified) / contacted) * 100) : 0
        },
        {
          stage: 'Converted',
          count: converted,
          percentage: totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0,
          dropoff: qualified > 0 ? Math.round(((qualified - converted) / qualified) * 100) : 0
        }
      ],
      quoteFunnel: [
        {
          stage: 'Quotes Created',
          count: totalQuotes,
          percentage: 100,
          dropoff: 0
        },
        {
          stage: 'Quotes Sent',
          count: sent,
          percentage: totalQuotes > 0 ? Math.round((sent / totalQuotes) * 100) : 0,
          dropoff: totalQuotes > 0 ? Math.round(((totalQuotes - sent) / totalQuotes) * 100) : 0
        },
        {
          stage: 'Approved',
          count: approved,
          percentage: totalQuotes > 0 ? Math.round((approved / totalQuotes) * 100) : 0,
          dropoff: sent > 0 ? Math.round(((sent - approved) / sent) * 100) : 0
        },
        {
          stage: 'Won',
          count: won,
          percentage: totalQuotes > 0 ? Math.round((won / totalQuotes) * 100) : 0,
          dropoff: approved > 0 ? Math.round(((approved - won) / approved) * 100) : 0,
          value: wonValue
        }
      ],
      summary: {
        leadToQuoteRate: converted > 0 && totalLeads > 0
          ? Math.round((converted / totalLeads) * 100)
          : 0,
        quoteWinRate: won > 0 && totalQuotes > 0
          ? Math.round((won / totalQuotes) * 100)
          : 0,
        overallConversion: won > 0 && totalLeads > 0
          ? Math.round((won / totalLeads) * 100)
          : 0,
        totalWonValue: wonValue,
        lostLeads: leadLost,
        lostQuotes: quoteLost
      }
    };
  }

  /**
   * Get average time spent in each stage
   */
  async getStageTiming(days = 90) {
    // Lead stage timing
    const leadTimingResult = await this.pool.query(`
      WITH lead_timing AS (
        SELECT
          AVG(EXTRACT(hours FROM (
            COALESCE(
              (SELECT MIN(created_at) FROM lead_activities WHERE lead_id = l.id AND activity_type = 'status_change'),
              CURRENT_TIMESTAMP
            ) - l.created_at
          )) / 24) as avg_time_to_contact,
          AVG(CASE WHEN status IN ('qualified', 'converted')
            THEN EXTRACT(hours FROM (updated_at - created_at)) / 24
            ELSE NULL
          END) as avg_time_to_qualify,
          AVG(CASE WHEN status = 'converted'
            THEN EXTRACT(hours FROM (updated_at - created_at)) / 24
            ELSE NULL
          END) as avg_time_to_convert
        FROM leads l
        WHERE created_at >= NOW() - INTERVAL '${days} days'
      )
      SELECT * FROM lead_timing
    `);

    // Quote stage timing
    const quoteTimingResult = await this.pool.query(`
      SELECT
        AVG(EXTRACT(hours FROM (sent_at - created_at)) / 24) FILTER (WHERE sent_at IS NOT NULL) as avg_time_to_send,
        AVG(EXTRACT(hours FROM (won_at - created_at)) / 24) FILTER (WHERE status = 'WON') as avg_sales_cycle,
        AVG(EXTRACT(hours FROM (CURRENT_TIMESTAMP - created_at)) / 24) FILTER (WHERE status IN ('DRAFT', 'SENT', 'PENDING_APPROVAL')) as avg_open_age
      FROM quotations
      WHERE created_at >= NOW() - INTERVAL '${days} days'
    `);

    const leadTiming = leadTimingResult.rows[0];
    const quoteTiming = quoteTimingResult.rows[0];

    return {
      leadStages: {
        newToContacted: Math.round(parseFloat(leadTiming.avg_time_to_contact) || 0),
        contactedToQualified: Math.round(parseFloat(leadTiming.avg_time_to_qualify) || 0),
        qualifiedToConverted: Math.round(parseFloat(leadTiming.avg_time_to_convert) || 0)
      },
      quoteStages: {
        draftToSent: Math.round(parseFloat(quoteTiming.avg_time_to_send) || 0),
        sentToWon: Math.round(parseFloat(quoteTiming.avg_sales_cycle) || 0),
        avgOpenAge: Math.round(parseFloat(quoteTiming.avg_open_age) || 0)
      }
    };
  }

  /**
   * Analyze drop-off points
   */
  async getDropoffAnalysis(days = 90) {
    // Lost lead reasons
    const lostLeadsResult = await this.pool.query(`
      SELECT
        lost_reason,
        COUNT(*) as count
      FROM leads
      WHERE status = 'lost'
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY lost_reason
      ORDER BY count DESC
      LIMIT 10
    `);

    // Lost quote reasons (from events if tracked)
    const lostQuotesResult = await this.pool.query(`
      SELECT
        COALESCE(
          (SELECT description FROM quotation_events
           WHERE quotation_id = q.id AND event_type = 'STATUS_CHANGED' AND new_status = 'LOST'
           LIMIT 1),
          'Not specified'
        ) as reason,
        COUNT(*) as count
      FROM quotations q
      WHERE q.status = 'LOST'
        AND q.created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY reason
      ORDER BY count DESC
      LIMIT 10
    `);

    // Stage where leads are lost most
    const stageDropoffResult = await this.pool.query(`
      SELECT
        status as last_status,
        COUNT(*) as count
      FROM leads
      WHERE status = 'lost'
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY status
    `);

    return {
      lostLeadReasons: lostLeadsResult.rows.map(r => ({
        reason: r.lost_reason || 'Not specified',
        count: parseInt(r.count)
      })),
      lostQuoteReasons: lostQuotesResult.rows.map(r => ({
        reason: r.reason,
        count: parseInt(r.count)
      })),
      stageDropoffs: stageDropoffResult.rows.map(r => ({
        stage: r.last_status,
        count: parseInt(r.count)
      }))
    };
  }

  /**
   * Get conversion trends over time
   */
  async getConversionTrends(days = 90) {
    // Weekly conversion rates
    const result = await this.pool.query(`
      WITH weekly_stats AS (
        SELECT
          DATE_TRUNC('week', created_at) as week,
          COUNT(*) FILTER (WHERE status = 'converted') as converted,
          COUNT(*) as total
        FROM leads
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week
      )
      SELECT
        week,
        converted,
        total,
        CASE WHEN total > 0 THEN ROUND((converted::numeric / total) * 100, 1) ELSE 0 END as conversion_rate
      FROM weekly_stats
    `);

    // Quote win rate trends
    const quoteResult = await this.pool.query(`
      WITH weekly_stats AS (
        SELECT
          DATE_TRUNC('week', created_at) as week,
          COUNT(*) FILTER (WHERE status = 'WON') as won,
          COUNT(*) FILTER (WHERE status IN ('WON', 'LOST')) as closed
        FROM quotations
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week
      )
      SELECT
        week,
        won,
        closed,
        CASE WHEN closed > 0 THEN ROUND((won::numeric / closed) * 100, 1) ELSE 0 END as win_rate
      FROM weekly_stats
    `);

    return {
      leadConversion: result.rows.map(r => ({
        week: r.week,
        converted: parseInt(r.converted),
        total: parseInt(r.total),
        rate: parseFloat(r.conversion_rate)
      })),
      quoteWinRate: quoteResult.rows.map(r => ({
        week: r.week,
        won: parseInt(r.won),
        closed: parseInt(r.closed),
        rate: parseFloat(r.win_rate)
      }))
    };
  }

  /**
   * Get conversion rates by lead source
   */
  async getConversionBySource(days = 90) {
    const result = await this.pool.query(`
      SELECT
        COALESCE(lead_source, 'Unknown') as source,
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE status = 'converted') as converted,
        COUNT(*) FILTER (WHERE status = 'lost') as lost,
        COUNT(*) FILTER (WHERE status IN ('new', 'contacted', 'qualified')) as in_progress,
        CASE
          WHEN COUNT(*) > 0
          THEN ROUND((COUNT(*) FILTER (WHERE status = 'converted')::numeric / COUNT(*)) * 100, 1)
          ELSE 0
        END as conversion_rate
      FROM leads
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY lead_source
      ORDER BY total_leads DESC
    `);

    return result.rows.map(r => ({
      source: r.source,
      totalLeads: parseInt(r.total_leads),
      converted: parseInt(r.converted),
      lost: parseInt(r.lost),
      inProgress: parseInt(r.in_progress),
      conversionRate: parseFloat(r.conversion_rate)
    }));
  }

  /**
   * Identify bottlenecks in the funnel
   */
  identifyBottlenecks(stages, timing, dropoffs) {
    const bottlenecks = [];

    // Check lead funnel dropoffs
    const leadFunnel = stages.leadFunnel || [];
    for (let i = 1; i < leadFunnel.length; i++) {
      if (leadFunnel[i].dropoff > 50) {
        bottlenecks.push({
          stage: `${leadFunnel[i-1].stage} → ${leadFunnel[i].stage}`,
          type: 'high_dropoff',
          severity: leadFunnel[i].dropoff > 70 ? 'critical' : 'warning',
          dropoffRate: leadFunnel[i].dropoff,
          suggestion: this.getSuggestionForDropoff(leadFunnel[i-1].stage, leadFunnel[i].dropoff)
        });
      }
    }

    // Check quote funnel dropoffs
    const quoteFunnel = stages.quoteFunnel || [];
    for (let i = 1; i < quoteFunnel.length; i++) {
      if (quoteFunnel[i].dropoff > 40) {
        bottlenecks.push({
          stage: `${quoteFunnel[i-1].stage} → ${quoteFunnel[i].stage}`,
          type: 'high_dropoff',
          severity: quoteFunnel[i].dropoff > 60 ? 'critical' : 'warning',
          dropoffRate: quoteFunnel[i].dropoff,
          suggestion: this.getSuggestionForDropoff(quoteFunnel[i-1].stage, quoteFunnel[i].dropoff)
        });
      }
    }

    // Check timing issues
    if (timing?.leadStages?.newToContacted > 2) {
      bottlenecks.push({
        stage: 'New Leads',
        type: 'slow_response',
        severity: timing.leadStages.newToContacted > 5 ? 'critical' : 'warning',
        metric: `${timing.leadStages.newToContacted} days avg response time`,
        suggestion: 'Improve lead response time - aim for < 24 hours'
      });
    }

    if (timing?.quoteStages?.draftToSent > 3) {
      bottlenecks.push({
        stage: 'Draft Quotes',
        type: 'slow_sending',
        severity: timing.quoteStages.draftToSent > 7 ? 'critical' : 'warning',
        metric: `${timing.quoteStages.draftToSent} days avg to send`,
        suggestion: 'Reduce time to send quotes - consider templates or automation'
      });
    }

    return bottlenecks.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Get suggestion based on dropoff stage
   */
  getSuggestionForDropoff(stage, rate) {
    const suggestions = {
      'New Leads': 'Improve initial outreach - try different channels or faster response',
      'Contacted': 'Enhance qualification process - better discovery questions',
      'Qualified': 'Focus on value proposition and quote timing',
      'Quotes Created': 'Send quotes faster - reduce draft time',
      'Quotes Sent': 'Improve follow-up cadence - call within 48 hours',
      'Approved': 'Streamline closing process - reduce friction'
    };

    return suggestions[stage] || `Investigate ${stage} stage for improvement opportunities`;
  }
}

module.exports = ConversionAnalyticsService;
