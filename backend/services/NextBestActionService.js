/**
 * Next Best Action Service
 * AI-powered recommendations for the best next action on leads and quotes
 */

class NextBestActionService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Action types and their descriptions
   */
  static ACTIONS = {
    CALL_NOW: {
      type: 'call_now',
      label: 'Call Now',
      icon: 'phone',
      description: 'High priority - reach out immediately',
      urgency: 'high'
    },
    SEND_EMAIL: {
      type: 'send_email',
      label: 'Send Email',
      icon: 'email',
      description: 'Follow up with an email',
      urgency: 'medium'
    },
    SEND_QUOTE: {
      type: 'send_quote',
      label: 'Send Quote',
      icon: 'document',
      description: 'Customer is ready - send a quotation',
      urgency: 'high'
    },
    FOLLOW_UP: {
      type: 'follow_up',
      label: 'Schedule Follow-up',
      icon: 'calendar',
      description: 'Set a reminder to follow up later',
      urgency: 'low'
    },
    OFFER_DISCOUNT: {
      type: 'offer_discount',
      label: 'Offer Discount',
      icon: 'tag',
      description: 'Consider offering a discount to close the deal',
      urgency: 'medium'
    },
    ESCALATE: {
      type: 'escalate',
      label: 'Escalate to Manager',
      icon: 'alert',
      description: 'This needs management attention',
      urgency: 'high'
    },
    NURTURE: {
      type: 'nurture',
      label: 'Add to Nurture',
      icon: 'heart',
      description: 'Not ready yet - add to nurture campaign',
      urgency: 'low'
    },
    REQUALIFY: {
      type: 'requalify',
      label: 'Re-qualify Lead',
      icon: 'refresh',
      description: 'Needs re-qualification - priorities may have changed',
      urgency: 'medium'
    },
    SEND_INFO: {
      type: 'send_info',
      label: 'Send Information',
      icon: 'info',
      description: 'Send product information or brochure',
      urgency: 'low'
    },
    CLOSE_DEAL: {
      type: 'close_deal',
      label: 'Close the Deal',
      icon: 'check',
      description: 'Customer is ready - finalize the sale',
      urgency: 'high'
    }
  };

  /**
   * Get next best actions for a lead
   */
  async getLeadActions(leadId) {
    // Get lead with all related data
    const leadQuery = `
      SELECT l.*,
        (SELECT COUNT(*) FROM lead_activities WHERE lead_id = l.id) as activity_count,
        (SELECT MAX(created_at) FROM lead_activities WHERE lead_id = l.id) as last_activity_date,
        (SELECT activity_type FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) as last_activity_type,
        (SELECT COUNT(*) FROM quotations WHERE lead_id = l.id) as quote_count,
        (SELECT status FROM quotations WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) as last_quote_status
      FROM leads l
      WHERE l.id = $1
    `;

    const result = await this.pool.query(leadQuery, [leadId]);
    if (result.rows.length === 0) {
      throw new Error('Lead not found');
    }

    const lead = result.rows[0];

    // Get lead requirements
    const reqResult = await this.pool.query(
      'SELECT * FROM lead_requirements WHERE lead_id = $1',
      [leadId]
    );
    lead.requirements = reqResult.rows;

    // Calculate recommendations
    const recommendations = this.analyzeLeadAndRecommend(lead);

    return {
      leadId,
      leadNumber: lead.lead_number,
      contactName: lead.contact_name,
      currentStatus: lead.status,
      leadScore: lead.lead_score,
      recommendations
    };
  }

  /**
   * Analyze lead data and generate action recommendations
   */
  analyzeLeadAndRecommend(lead) {
    const recommendations = [];
    const now = new Date();

    // Calculate days since last activity
    const lastActivity = lead.last_activity_date ? new Date(lead.last_activity_date) : null;
    const daysSinceActivity = lastActivity
      ? Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24))
      : null;

    // Calculate days until follow-up
    const followUpDate = lead.follow_up_date ? new Date(lead.follow_up_date) : null;
    const daysUntilFollowUp = followUpDate
      ? Math.floor((followUpDate - now) / (1000 * 60 * 60 * 24))
      : null;

    // Determine lead temperature from score
    const isHotLead = lead.lead_score >= 70;
    const isWarmLead = lead.lead_score >= 40 && lead.lead_score < 70;
    const isColdLead = lead.lead_score < 40;

    // Timeline urgency
    const isUrgentTimeline = ['asap', '1_2_weeks'].includes(lead.timeline);
    const isResearching = lead.timeline === 'just_researching';

    // Status-based rules
    switch (lead.status) {
      case 'new':
        // New lead - needs initial contact
        if (isHotLead || isUrgentTimeline || lead.priority === 'hot') {
          recommendations.push({
            ...NextBestActionService.ACTIONS.CALL_NOW,
            priority: 1,
            reason: 'New high-priority lead requires immediate outreach',
            confidence: 95
          });
        } else {
          recommendations.push({
            ...NextBestActionService.ACTIONS.SEND_EMAIL,
            priority: 1,
            reason: 'Introduce yourself and establish contact',
            confidence: 85
          });
          recommendations.push({
            ...NextBestActionService.ACTIONS.CALL_NOW,
            priority: 2,
            reason: 'Follow up with a phone call',
            confidence: 75
          });
        }
        break;

      case 'contacted':
        // Already contacted - what's next?
        if (daysSinceActivity && daysSinceActivity > 5) {
          recommendations.push({
            ...NextBestActionService.ACTIONS.FOLLOW_UP,
            priority: 1,
            reason: `No activity in ${daysSinceActivity} days - follow up`,
            confidence: 90
          });
        }

        if (isHotLead && lead.requirements?.length > 0) {
          recommendations.push({
            ...NextBestActionService.ACTIONS.SEND_QUOTE,
            priority: isUrgentTimeline ? 1 : 2,
            reason: 'Hot lead with clear requirements - send quote',
            confidence: 85
          });
        } else if (isWarmLead) {
          recommendations.push({
            ...NextBestActionService.ACTIONS.SEND_INFO,
            priority: 2,
            reason: 'Send product information to move towards qualification',
            confidence: 75
          });
        }
        break;

      case 'qualified':
        // Qualified - ready for quote
        if (lead.quote_count === 0 || lead.quote_count === null) {
          recommendations.push({
            ...NextBestActionService.ACTIONS.SEND_QUOTE,
            priority: 1,
            reason: 'Qualified lead without a quote - send proposal',
            confidence: 95
          });
        } else if (lead.last_quote_status === 'draft') {
          recommendations.push({
            ...NextBestActionService.ACTIONS.SEND_QUOTE,
            priority: 1,
            reason: 'Finalize and send the draft quote',
            confidence: 90
          });
        } else if (lead.last_quote_status === 'sent') {
          // Quote sent, waiting for response
          if (daysSinceActivity && daysSinceActivity > 3) {
            recommendations.push({
              ...NextBestActionService.ACTIONS.CALL_NOW,
              priority: 1,
              reason: 'Quote sent but no response - follow up by phone',
              confidence: 85
            });
          }
        }
        break;

      default:
        break;
    }

    // Cross-cutting rules

    // Follow-up date rules
    if (daysUntilFollowUp !== null) {
      if (daysUntilFollowUp < 0) {
        recommendations.push({
          ...NextBestActionService.ACTIONS.CALL_NOW,
          priority: 1,
          reason: `Follow-up is ${Math.abs(daysUntilFollowUp)} days overdue!`,
          confidence: 95
        });
      } else if (daysUntilFollowUp === 0) {
        recommendations.push({
          ...NextBestActionService.ACTIONS.CALL_NOW,
          priority: 1,
          reason: 'Follow-up scheduled for today',
          confidence: 90
        });
      }
    }

    // Stale lead detection
    if (daysSinceActivity && daysSinceActivity > 14 && lead.status !== 'converted' && lead.status !== 'lost') {
      recommendations.push({
        ...NextBestActionService.ACTIONS.REQUALIFY,
        priority: 2,
        reason: `No activity in ${daysSinceActivity} days - needs re-qualification`,
        confidence: 80
      });
    }

    // Just researching leads
    if (isResearching && lead.status !== 'new') {
      recommendations.push({
        ...NextBestActionService.ACTIONS.NURTURE,
        priority: 3,
        reason: 'Customer is just researching - add to nurture campaign',
        confidence: 70
      });
    }

    // High-value opportunity escalation
    if (lead.requirements?.length > 2 && isHotLead && isUrgentTimeline) {
      recommendations.push({
        ...NextBestActionService.ACTIONS.ESCALATE,
        priority: 2,
        reason: 'High-value, urgent opportunity - consider manager involvement',
        confidence: 75
      });
    }

    // Remove duplicates and sort by priority and confidence
    const uniqueRecommendations = this.deduplicateAndSort(recommendations);

    return uniqueRecommendations.slice(0, 5); // Return top 5 recommendations
  }

  /**
   * Get next best actions for a quote
   */
  async getQuoteActions(quoteId) {
    const quoteQuery = `
      SELECT q.*,
        c.name as customer_name,
        c.email as customer_email,
        l.contact_name as lead_contact_name,
        l.lead_score,
        l.timeline as lead_timeline,
        l.priority as lead_priority,
        (SELECT COUNT(*) FROM quotation_activities WHERE quotation_id = q.id) as activity_count,
        (SELECT MAX(created_at) FROM quotation_activities WHERE quotation_id = q.id) as last_activity_date
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      LEFT JOIN leads l ON q.lead_id = l.id
      WHERE q.id = $1
    `;

    const result = await this.pool.query(quoteQuery, [quoteId]);
    if (result.rows.length === 0) {
      throw new Error('Quote not found');
    }

    const quote = result.rows[0];
    const recommendations = this.analyzeQuoteAndRecommend(quote);

    return {
      quoteId,
      quoteNumber: quote.quote_number,
      customerName: quote.customer_name || quote.lead_contact_name,
      currentStatus: quote.status,
      totalValue: quote.total_cents / 100,
      recommendations
    };
  }

  /**
   * Analyze quote data and generate action recommendations
   */
  analyzeQuoteAndRecommend(quote) {
    const recommendations = [];
    const now = new Date();

    // Calculate days since last activity
    const lastActivity = quote.last_activity_date ? new Date(quote.last_activity_date) : null;
    const daysSinceActivity = lastActivity
      ? Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24))
      : null;

    // Calculate expiry
    const expiryDate = quote.expires_at ? new Date(quote.expires_at) : null;
    const daysUntilExpiry = expiryDate
      ? Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24))
      : null;

    // Quote value tiers
    const totalValue = quote.total_cents / 100;
    const isHighValue = totalValue > 5000;
    const isMediumValue = totalValue >= 1000 && totalValue <= 5000;

    switch (quote.status) {
      case 'draft':
        recommendations.push({
          ...NextBestActionService.ACTIONS.SEND_QUOTE,
          priority: 1,
          reason: 'Draft quote ready - finalize and send to customer',
          confidence: 95
        });
        break;

      case 'sent':
        // Quote sent, waiting for response
        if (daysSinceActivity && daysSinceActivity > 2) {
          recommendations.push({
            ...NextBestActionService.ACTIONS.CALL_NOW,
            priority: 1,
            reason: `Quote sent ${daysSinceActivity} days ago - follow up`,
            confidence: 90
          });
        }

        // Expiring soon
        if (daysUntilExpiry !== null && daysUntilExpiry <= 3 && daysUntilExpiry >= 0) {
          recommendations.push({
            ...NextBestActionService.ACTIONS.CALL_NOW,
            priority: 1,
            reason: `Quote expires in ${daysUntilExpiry} days - urgent follow-up needed`,
            confidence: 95
          });
        }
        break;

      case 'viewed':
        // Customer viewed the quote - hot!
        recommendations.push({
          ...NextBestActionService.ACTIONS.CALL_NOW,
          priority: 1,
          reason: 'Customer viewed the quote - call to close',
          confidence: 95
        });

        if (daysSinceActivity && daysSinceActivity > 1) {
          recommendations.push({
            ...NextBestActionService.ACTIONS.OFFER_DISCOUNT,
            priority: 2,
            reason: 'Viewed but not accepted - consider discount',
            confidence: 70
          });
        }
        break;

      case 'accepted':
        recommendations.push({
          ...NextBestActionService.ACTIONS.CLOSE_DEAL,
          priority: 1,
          reason: 'Quote accepted - finalize the order',
          confidence: 98
        });
        break;

      case 'negotiating':
        recommendations.push({
          ...NextBestActionService.ACTIONS.CALL_NOW,
          priority: 1,
          reason: 'Customer negotiating - discuss terms',
          confidence: 90
        });
        if (isHighValue) {
          recommendations.push({
            ...NextBestActionService.ACTIONS.ESCALATE,
            priority: 2,
            reason: 'High-value negotiation - involve management',
            confidence: 80
          });
        }
        break;

      case 'expired':
        recommendations.push({
          ...NextBestActionService.ACTIONS.REQUALIFY,
          priority: 1,
          reason: 'Quote expired - check if still interested',
          confidence: 85
        });
        break;

      default:
        break;
    }

    // High value opportunity
    if (isHighValue && quote.status !== 'won' && quote.status !== 'lost') {
      recommendations.push({
        ...NextBestActionService.ACTIONS.ESCALATE,
        priority: 2,
        reason: `High value opportunity ($${totalValue.toLocaleString()}) - ensure priority handling`,
        confidence: 75
      });
    }

    // Stale quote
    if (daysSinceActivity && daysSinceActivity > 7 && !['won', 'lost', 'expired'].includes(quote.status)) {
      recommendations.push({
        ...NextBestActionService.ACTIONS.FOLLOW_UP,
        priority: 2,
        reason: `No activity in ${daysSinceActivity} days`,
        confidence: 80
      });
    }

    return this.deduplicateAndSort(recommendations).slice(0, 5);
  }

  /**
   * Get next best actions for multiple leads (batch)
   */
  async getBatchLeadActions(filters = {}) {
    const { limit = 20, minScore = 0, status = null } = filters;

    let whereClause = 'WHERE l.status NOT IN (\'converted\', \'lost\')';
    const params = [];

    if (minScore > 0) {
      params.push(minScore);
      whereClause += ` AND l.lead_score >= $${params.length}`;
    }

    if (status) {
      params.push(status);
      whereClause += ` AND l.status = $${params.length}`;
    }

    params.push(limit);

    const query = `
      SELECT l.id, l.lead_number, l.contact_name, l.status, l.lead_score,
             l.priority, l.timeline, l.follow_up_date,
        (SELECT MAX(created_at) FROM lead_activities WHERE lead_id = l.id) as last_activity_date,
        (SELECT COUNT(*) FROM quotations WHERE lead_id = l.id) as quote_count
      FROM leads l
      ${whereClause}
      ORDER BY l.lead_score DESC NULLS LAST, l.created_at DESC
      LIMIT $${params.length}
    `;

    const result = await this.pool.query(query, params);

    return Promise.all(result.rows.map(async (lead) => {
      const recommendations = this.analyzeLeadAndRecommend(lead);
      return {
        leadId: lead.id,
        leadNumber: lead.lead_number,
        contactName: lead.contact_name,
        status: lead.status,
        leadScore: lead.lead_score,
        topAction: recommendations[0] || null,
        actionCount: recommendations.length
      };
    }));
  }

  /**
   * Remove duplicate actions and sort by priority
   */
  deduplicateAndSort(recommendations) {
    const seen = new Set();
    const unique = recommendations.filter(rec => {
      if (seen.has(rec.type)) return false;
      seen.add(rec.type);
      return true;
    });

    return unique.sort((a, b) => {
      // First by priority (lower is better)
      if (a.priority !== b.priority) return a.priority - b.priority;
      // Then by confidence (higher is better)
      return b.confidence - a.confidence;
    });
  }
}

module.exports = NextBestActionService;
