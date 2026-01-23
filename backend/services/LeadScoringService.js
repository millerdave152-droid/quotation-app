/**
 * Lead Scoring Service
 * Auto-scores leads 1-100 based on multiple factors:
 * - Timeline urgency (25 points)
 * - Budget range (25 points)
 * - Lead source quality (15 points)
 * - Engagement level (20 points)
 * - Data completeness (15 points)
 */

class LeadScoringService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Score weights for each factor
   */
  static WEIGHTS = {
    timeline: 25,
    budget: 25,
    source: 15,
    engagement: 20,
    completeness: 15
  };

  /**
   * Timeline scoring matrix
   */
  static TIMELINE_SCORES = {
    asap: 100,
    '1_2_weeks': 85,
    '1_3_months': 60,
    '3_6_months': 40,
    just_researching: 20
  };

  /**
   * Lead source quality scores
   */
  static SOURCE_SCORES = {
    referral: 100,
    repeat_customer: 95,
    website_inquiry: 80,
    phone_call: 75,
    walk_in: 70,
    trade_show: 65,
    social_media: 55,
    online_ad: 50,
    cold_outreach: 30,
    unknown: 40
  };

  /**
   * Calculate timeline score (0-100)
   */
  calculateTimelineScore(timeline) {
    if (!timeline) return 50; // Default middle score
    return LeadScoringService.TIMELINE_SCORES[timeline] || 50;
  }

  /**
   * Calculate budget score based on value range
   * Higher budgets and wider ranges score higher
   */
  calculateBudgetScore(requirements) {
    if (!requirements || requirements.length === 0) return 50;

    let maxBudget = 0;
    let hasBudget = false;

    for (const req of requirements) {
      if (req.budget_max_cents > 0) {
        hasBudget = true;
        maxBudget = Math.max(maxBudget, req.budget_max_cents);
      } else if (req.budget_min_cents > 0) {
        hasBudget = true;
        maxBudget = Math.max(maxBudget, req.budget_min_cents);
      }
    }

    if (!hasBudget) return 40; // No budget specified

    // Score based on budget tier
    const budgetDollars = maxBudget / 100;
    if (budgetDollars >= 10000) return 100;
    if (budgetDollars >= 5000) return 85;
    if (budgetDollars >= 3000) return 70;
    if (budgetDollars >= 1500) return 55;
    if (budgetDollars >= 500) return 40;
    return 25;
  }

  /**
   * Calculate source quality score
   */
  calculateSourceScore(leadSource) {
    if (!leadSource) return 40;
    const source = leadSource.toLowerCase().replace(/[\s-]/g, '_');
    return LeadScoringService.SOURCE_SCORES[source] ||
      LeadScoringService.SOURCE_SCORES.unknown;
  }

  /**
   * Calculate engagement score based on activities
   */
  calculateEngagementScore(activities, daysSinceCreated) {
    if (!activities || activities.length === 0) return 30;

    let score = 30; // Base score

    // Points for activity count
    const activityCount = activities.length;
    if (activityCount >= 10) score += 25;
    else if (activityCount >= 5) score += 20;
    else if (activityCount >= 3) score += 15;
    else if (activityCount >= 1) score += 10;

    // Points for recent activity (last 7 days)
    const recentActivities = activities.filter(a => {
      const activityDate = new Date(a.created_at);
      const now = new Date();
      const diffDays = (now - activityDate) / (1000 * 60 * 60 * 24);
      return diffDays <= 7;
    });

    if (recentActivities.length >= 3) score += 25;
    else if (recentActivities.length >= 1) score += 15;
    else if (daysSinceCreated > 14) score -= 15; // Penalty for inactivity

    // Points for specific activity types
    const hasCall = activities.some(a => a.activity_type === 'call');
    const hasMeeting = activities.some(a => a.activity_type === 'meeting');
    const hasQuoteRequest = activities.some(a => a.activity_type === 'quote_requested');

    if (hasMeeting) score += 15;
    if (hasCall) score += 10;
    if (hasQuoteRequest) score += 10;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Calculate data completeness score
   */
  calculateCompletenessScore(lead, requirements) {
    let score = 0;
    let totalFields = 0;
    let filledFields = 0;

    // Contact info (40%)
    const contactFields = ['contact_name', 'contact_email', 'contact_phone'];
    for (const field of contactFields) {
      totalFields++;
      if (lead[field] && lead[field].trim()) filledFields++;
    }

    // Context fields (30%)
    const contextFields = ['inquiry_reason', 'timeline', 'lead_source'];
    for (const field of contextFields) {
      totalFields++;
      if (lead[field] && lead[field].trim()) filledFields++;
    }

    // Requirements (30%)
    if (requirements && requirements.length > 0) {
      filledFields += 2;
      totalFields += 2;

      // Check if requirements have details
      const hasDetailedReqs = requirements.some(r =>
        (r.budget_min_cents > 0 || r.budget_max_cents > 0) &&
        r.category
      );
      if (hasDetailedReqs) {
        filledFields++;
      }
      totalFields++;
    } else {
      totalFields += 3;
    }

    score = Math.round((filledFields / totalFields) * 100);
    return score;
  }

  /**
   * Calculate the overall lead score
   * Returns an object with total score and breakdown
   */
  async calculateScore(lead, requirements = null, activities = null) {
    // Fetch requirements and activities if not provided
    if (!requirements) {
      const reqResult = await this.pool.query(
        'SELECT * FROM lead_requirements WHERE lead_id = $1',
        [lead.id]
      );
      requirements = reqResult.rows;
    }

    if (!activities) {
      const actResult = await this.pool.query(
        'SELECT * FROM lead_activities WHERE lead_id = $1 ORDER BY created_at DESC',
        [lead.id]
      );
      activities = actResult.rows;
    }

    // Calculate individual scores
    const daysSinceCreated = lead.created_at
      ? (new Date() - new Date(lead.created_at)) / (1000 * 60 * 60 * 24)
      : 0;

    const breakdown = {
      timeline: {
        score: this.calculateTimelineScore(lead.timeline),
        weight: LeadScoringService.WEIGHTS.timeline,
        weighted: 0
      },
      budget: {
        score: this.calculateBudgetScore(requirements),
        weight: LeadScoringService.WEIGHTS.budget,
        weighted: 0
      },
      source: {
        score: this.calculateSourceScore(lead.lead_source),
        weight: LeadScoringService.WEIGHTS.source,
        weighted: 0
      },
      engagement: {
        score: this.calculateEngagementScore(activities, daysSinceCreated),
        weight: LeadScoringService.WEIGHTS.engagement,
        weighted: 0
      },
      completeness: {
        score: this.calculateCompletenessScore(lead, requirements),
        weight: LeadScoringService.WEIGHTS.completeness,
        weighted: 0
      }
    };

    // Calculate weighted scores
    let totalScore = 0;
    for (const key of Object.keys(breakdown)) {
      breakdown[key].weighted = Math.round(
        (breakdown[key].score / 100) * breakdown[key].weight
      );
      totalScore += breakdown[key].weighted;
    }

    // Determine grade
    let grade = 'D';
    if (totalScore >= 80) grade = 'A';
    else if (totalScore >= 60) grade = 'B';
    else if (totalScore >= 40) grade = 'C';

    return {
      score: totalScore,
      maxScore: 100,
      grade,
      breakdown,
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * Calculate and save score for a lead
   */
  async scoreAndSave(leadId) {
    const leadResult = await this.pool.query(
      'SELECT * FROM leads WHERE id = $1',
      [leadId]
    );

    if (leadResult.rows.length === 0) {
      throw new Error('Lead not found');
    }

    const lead = leadResult.rows[0];
    const scoreData = await this.calculateScore(lead);

    // Update lead with score
    await this.pool.query(`
      UPDATE leads
      SET lead_score = $1,
          lead_score_breakdown = $2,
          lead_score_updated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [scoreData.score, JSON.stringify(scoreData.breakdown), leadId]);

    // Invalidate cache
    if (this.cache) {
      this.cache.invalidatePattern('leads:');
    }

    return scoreData;
  }

  /**
   * Batch score all leads
   * Useful for initial scoring or periodic recalculation
   */
  async scoreAllLeads() {
    const result = await this.pool.query(`
      SELECT id FROM leads
      WHERE status NOT IN ('converted', 'lost')
      ORDER BY created_at DESC
    `);

    const scores = [];
    for (const row of result.rows) {
      try {
        const score = await this.scoreAndSave(row.id);
        scores.push({ leadId: row.id, ...score });
      } catch (error) {
        console.error(`Error scoring lead ${row.id}:`, error.message);
        scores.push({ leadId: row.id, error: error.message });
      }
    }

    return {
      totalProcessed: result.rows.length,
      scores
    };
  }

  /**
   * Get leads ranked by score
   */
  async getLeadsByScore(options = {}) {
    const { limit = 20, minScore = 0 } = options;

    const result = await this.pool.query(`
      SELECT
        l.*,
        NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') as assigned_to_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE l.status NOT IN ('converted', 'lost')
        AND COALESCE(l.lead_score, 0) >= $1
      ORDER BY l.lead_score DESC NULLS LAST
      LIMIT $2
    `, [minScore, limit]);

    return result.rows;
  }

  /**
   * Get score distribution for analytics
   */
  async getScoreDistribution() {
    const result = await this.pool.query(`
      SELECT
        CASE
          WHEN lead_score >= 80 THEN 'A (80-100)'
          WHEN lead_score >= 60 THEN 'B (60-79)'
          WHEN lead_score >= 40 THEN 'C (40-59)'
          WHEN lead_score >= 20 THEN 'D (20-39)'
          ELSE 'F (0-19)'
        END as grade,
        COUNT(*) as count,
        AVG(lead_score) as avg_score
      FROM leads
      WHERE status NOT IN ('converted', 'lost')
      GROUP BY
        CASE
          WHEN lead_score >= 80 THEN 'A (80-100)'
          WHEN lead_score >= 60 THEN 'B (60-79)'
          WHEN lead_score >= 40 THEN 'C (40-59)'
          WHEN lead_score >= 20 THEN 'D (20-39)'
          ELSE 'F (0-19)'
        END
      ORDER BY
        CASE
          WHEN grade = 'A (80-100)' THEN 1
          WHEN grade = 'B (60-79)' THEN 2
          WHEN grade = 'C (40-59)' THEN 3
          WHEN grade = 'D (20-39)' THEN 4
          ELSE 5
        END
    `);

    return result.rows;
  }
}

module.exports = LeadScoringService;
