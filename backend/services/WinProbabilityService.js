/**
 * Win Probability Service
 * Calculates quote win probability based on multiple factors:
 * - Customer tier and history
 * - Quote value vs customer's average
 * - Product mix analysis
 * - Salesperson's historical win rate
 * - Days since quote created
 * - Quote complexity
 */

class WinProbabilityService {
  constructor(pool) {
    this.pool = pool;

    // Win probability weights for each factor
    this.weights = {
      customerTier: 0.20,        // Customer segment/tier
      customerHistory: 0.15,     // Past purchase history
      quoteValue: 0.10,          // Quote value vs average
      salespersonRate: 0.20,     // Salesperson's win rate
      quoteAge: 0.15,            // Days since creation
      productMix: 0.10,          // Product categories
      engagement: 0.10           // Customer engagement signals
    };

    // Stage-based base probabilities
    this.stageProbabilities = {
      'DRAFT': 0.10,
      'SENT': 0.25,
      'VIEWED': 0.35,
      'PENDING_APPROVAL': 0.50,
      'APPROVED': 0.70,
      'COUNTER_OFFER': 0.40,
      'NEGOTIATING': 0.45,
      'WON': 1.0,
      'LOST': 0.0,
      'EXPIRED': 0.0
    };
  }

  /**
   * Calculate win probability for a quote
   * @param {number} quoteId - The quote ID
   * @returns {object} Detailed probability analysis
   */
  async calculateWinProbability(quoteId) {
    // Get quote details
    const quoteResult = await this.pool.query(`
      SELECT q.*,
             c.id as customer_id,
             c.clv_segment,
             c.clv_score,
             c.total_transactions,
             c.total_spent_cents
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.id = $1
    `, [quoteId]);

    if (quoteResult.rows.length === 0) {
      throw new Error('Quote not found');
    }

    const quote = quoteResult.rows[0];

    // Calculate each factor
    const factors = await Promise.all([
      this.calculateCustomerTierFactor(quote),
      this.calculateCustomerHistoryFactor(quote),
      this.calculateQuoteValueFactor(quote),
      this.calculateSalespersonFactor(quote),
      this.calculateQuoteAgeFactor(quote),
      this.calculateProductMixFactor(quoteId),
      this.calculateEngagementFactor(quoteId)
    ]);

    const [
      customerTierFactor,
      customerHistoryFactor,
      quoteValueFactor,
      salespersonFactor,
      quoteAgeFactor,
      productMixFactor,
      engagementFactor
    ] = factors;

    // Get base probability from stage
    const baseProbability = this.stageProbabilities[quote.status] || 0.25;

    // Calculate weighted score
    const weightedScore =
      (customerTierFactor.score * this.weights.customerTier) +
      (customerHistoryFactor.score * this.weights.customerHistory) +
      (quoteValueFactor.score * this.weights.quoteValue) +
      (salespersonFactor.score * this.weights.salespersonRate) +
      (quoteAgeFactor.score * this.weights.quoteAge) +
      (productMixFactor.score * this.weights.productMix) +
      (engagementFactor.score * this.weights.engagement);

    // Combine base probability with weighted factors
    // Use a formula that allows factors to adjust base probability
    const adjustedProbability = baseProbability * (0.5 + weightedScore * 0.5);
    const finalProbability = Math.min(Math.max(adjustedProbability, 0), 1);

    // Determine confidence level
    const confidence = this.calculateConfidence(factors);

    // Generate recommendations
    const recommendations = this.generateRecommendations(factors, quote);

    return {
      quoteId,
      quoteNumber: quote.quotation_number,
      status: quote.status,
      baseProbability: Math.round(baseProbability * 100),
      winProbability: Math.round(finalProbability * 100),
      confidence,
      factors: {
        customerTier: customerTierFactor,
        customerHistory: customerHistoryFactor,
        quoteValue: quoteValueFactor,
        salesperson: salespersonFactor,
        quoteAge: quoteAgeFactor,
        productMix: productMixFactor,
        engagement: engagementFactor
      },
      recommendations,
      riskLevel: this.getRiskLevel(finalProbability),
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * Customer tier factor - Higher tier = higher probability
   */
  async calculateCustomerTierFactor(quote) {
    const tierScores = {
      'platinum': 1.0,
      'gold': 0.8,
      'silver': 0.6,
      'bronze': 0.4,
      'new': 0.5
    };

    const tier = quote.clv_segment || 'new';
    const score = tierScores[tier] || 0.5;

    return {
      factor: 'customerTier',
      score,
      tier,
      clvScore: quote.clv_score,
      description: `${tier.charAt(0).toUpperCase() + tier.slice(1)} tier customer`
    };
  }

  /**
   * Customer history factor - Past wins increase probability
   */
  async calculateCustomerHistoryFactor(quote) {
    if (!quote.customer_id) {
      return { factor: 'customerHistory', score: 0.5, description: 'No customer linked' };
    }

    const historyResult = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'WON') as won_count,
        COUNT(*) FILTER (WHERE status = 'LOST') as lost_count,
        COUNT(*) as total_quotes,
        AVG(total_cents) FILTER (WHERE status = 'WON') as avg_won_value
      FROM quotations
      WHERE customer_id = $1 AND id != $2
    `, [quote.customer_id, quote.id]);

    const history = historyResult.rows[0];
    const wonCount = parseInt(history.won_count) || 0;
    const lostCount = parseInt(history.lost_count) || 0;
    const totalQuotes = parseInt(history.total_quotes) || 0;

    let score = 0.5; // Default for no history
    if (totalQuotes > 0) {
      const winRate = wonCount / totalQuotes;
      score = Math.min(winRate + 0.3, 1); // Boost for existing relationship
    }

    return {
      factor: 'customerHistory',
      score,
      wonQuotes: wonCount,
      lostQuotes: lostCount,
      totalQuotes,
      description: totalQuotes > 0
        ? `${wonCount} won, ${lostCount} lost (${Math.round(score * 100)}% adjusted)`
        : 'New customer, no history'
    };
  }

  /**
   * Quote value factor - Quotes near customer's typical value perform better
   */
  async calculateQuoteValueFactor(quote) {
    const quoteValue = quote.total_cents || 0;

    if (!quote.customer_id) {
      return { factor: 'quoteValue', score: 0.5, description: 'No customer baseline' };
    }

    // Get customer's average order value
    const avgResult = await this.pool.query(`
      SELECT AVG(total_cents) as avg_value
      FROM quotations
      WHERE customer_id = $1 AND status = 'WON'
    `, [quote.customer_id]);

    const avgValue = parseFloat(avgResult.rows[0].avg_value) || quoteValue;

    // Calculate deviation from average
    const ratio = avgValue > 0 ? quoteValue / avgValue : 1;

    let score;
    if (ratio >= 0.8 && ratio <= 1.5) {
      score = 0.8; // Within normal range
    } else if (ratio > 1.5 && ratio <= 2.0) {
      score = 0.6; // Somewhat higher
    } else if (ratio > 2.0) {
      score = 0.4; // Much higher than usual
    } else {
      score = 0.7; // Lower than usual (could be easier to close)
    }

    return {
      factor: 'quoteValue',
      score,
      quoteValue: quoteValue / 100,
      avgCustomerValue: avgValue / 100,
      ratio: Math.round(ratio * 100) / 100,
      description: ratio > 1.5
        ? `${Math.round((ratio - 1) * 100)}% above customer average`
        : 'Within typical range'
    };
  }

  /**
   * Salesperson win rate factor
   */
  async calculateSalespersonFactor(quote) {
    if (!quote.created_by) {
      return { factor: 'salesperson', score: 0.5, description: 'No salesperson assigned' };
    }

    const rateResult = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'WON') as won,
        COUNT(*) FILTER (WHERE status IN ('WON', 'LOST')) as total
      FROM quotations
      WHERE created_by = $1
        AND created_at > NOW() - INTERVAL '90 days'
        AND id != $2
    `, [quote.created_by, quote.id]);

    const { won, total } = rateResult.rows[0];
    const wonCount = parseInt(won) || 0;
    const totalCount = parseInt(total) || 0;

    let score = 0.5;
    let winRate = 0;

    if (totalCount >= 5) {
      winRate = wonCount / totalCount;
      score = Math.min(winRate * 1.2, 1); // Slight boost for strong performers
    }

    return {
      factor: 'salesperson',
      score,
      salesperson: quote.created_by,
      recentWins: wonCount,
      recentTotal: totalCount,
      winRate: Math.round(winRate * 100),
      description: totalCount >= 5
        ? `${Math.round(winRate * 100)}% win rate (last 90 days)`
        : 'Insufficient data for win rate'
    };
  }

  /**
   * Quote age factor - Older quotes less likely to close
   */
  async calculateQuoteAgeFactor(quote) {
    const createdAt = new Date(quote.created_at);
    const now = new Date();
    const daysOld = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

    let score;
    if (daysOld <= 7) {
      score = 1.0; // Fresh quote
    } else if (daysOld <= 14) {
      score = 0.85;
    } else if (daysOld <= 30) {
      score = 0.7;
    } else if (daysOld <= 60) {
      score = 0.5;
    } else if (daysOld <= 90) {
      score = 0.3;
    } else {
      score = 0.15; // Very old quote
    }

    return {
      factor: 'quoteAge',
      score,
      daysOld,
      expiresAt: quote.expires_at,
      description: daysOld <= 7
        ? 'Fresh quote (high urgency)'
        : daysOld > 30
          ? `${daysOld} days old (follow-up needed)`
          : `${daysOld} days since creation`
    };
  }

  /**
   * Product mix factor - Certain categories close better
   */
  async calculateProductMixFactor(quoteId) {
    // Get product categories in quote and their historical win rates
    const mixResult = await this.pool.query(`
      WITH quote_products AS (
        SELECT DISTINCT p.master_category
        FROM quote_items qi
        JOIN products p ON qi.product_id = p.id
        WHERE qi.quotation_id = $1
      ),
      category_rates AS (
        SELECT
          p.master_category,
          COUNT(*) FILTER (WHERE q.status = 'WON') as won,
          COUNT(*) FILTER (WHERE q.status IN ('WON', 'LOST')) as total
        FROM quote_items qi
        JOIN products p ON qi.product_id = p.id
        JOIN quotations q ON qi.quotation_id = q.id
        WHERE p.master_category IN (SELECT master_category FROM quote_products)
          AND q.status IN ('WON', 'LOST')
        GROUP BY p.master_category
      )
      SELECT
        qp.master_category,
        COALESCE(cr.won, 0) as won,
        COALESCE(cr.total, 0) as total
      FROM quote_products qp
      LEFT JOIN category_rates cr ON qp.master_category = cr.master_category
    `, [quoteId]);

    if (mixResult.rows.length === 0) {
      return { factor: 'productMix', score: 0.5, description: 'No products in quote' };
    }

    // Calculate average win rate across categories
    let totalWon = 0;
    let totalDeals = 0;
    const categories = [];

    for (const row of mixResult.rows) {
      totalWon += parseInt(row.won) || 0;
      totalDeals += parseInt(row.total) || 0;
      categories.push(row.master_category);
    }

    const avgWinRate = totalDeals > 0 ? totalWon / totalDeals : 0.5;
    const score = Math.min(avgWinRate + 0.2, 1); // Slight baseline boost

    return {
      factor: 'productMix',
      score,
      categories,
      categoryWinRate: Math.round(avgWinRate * 100),
      description: `Products from ${categories.length} categories`
    };
  }

  /**
   * Engagement factor - Customer interactions signal interest
   */
  async calculateEngagementFactor(quoteId) {
    // Check for activity events related to the quote
    const activityResult = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'QUOTE_VIEWED') as views,
        COUNT(*) FILTER (WHERE event_type LIKE '%EMAIL%') as emails,
        COUNT(*) FILTER (WHERE event_type = 'COUNTER_OFFER') as counter_offers,
        COUNT(*) as total_events
      FROM activity_events
      WHERE reference_type = 'quotation' AND reference_id = $1
    `, [quoteId]);

    const activity = activityResult.rows[0];
    const views = parseInt(activity.views) || 0;
    const emails = parseInt(activity.emails) || 0;
    const counterOffers = parseInt(activity.counter_offers) || 0;
    const totalEvents = parseInt(activity.total_events) || 0;

    let score = 0.3; // Base score for no engagement

    if (views > 0) score += 0.2;
    if (views > 2) score += 0.1;
    if (counterOffers > 0) score += 0.2; // Counter offers show serious interest
    if (totalEvents > 5) score += 0.1;

    score = Math.min(score, 1);

    return {
      factor: 'engagement',
      score,
      views,
      emailsSent: emails,
      counterOffers,
      totalEvents,
      description: totalEvents > 0
        ? `${views} views, ${counterOffers} counter-offers`
        : 'No engagement recorded'
    };
  }

  /**
   * Calculate confidence in the prediction
   */
  calculateConfidence(factors) {
    // Higher confidence when we have more data
    let dataPoints = 0;

    for (const factor of factors) {
      if (factor.totalQuotes > 5) dataPoints++;
      if (factor.recentTotal >= 5) dataPoints++;
      if (factor.totalEvents > 0) dataPoints++;
    }

    if (dataPoints >= 5) return 'high';
    if (dataPoints >= 3) return 'medium';
    return 'low';
  }

  /**
   * Get risk level based on probability
   */
  getRiskLevel(probability) {
    if (probability >= 0.7) return 'low';
    if (probability >= 0.4) return 'medium';
    return 'high';
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(factors, quote) {
    const recommendations = [];

    // Check quote age
    const ageFactor = factors.find(f => f.factor === 'quoteAge');
    if (ageFactor && ageFactor.daysOld > 14) {
      recommendations.push({
        priority: 'high',
        action: 'follow_up',
        message: `Quote is ${ageFactor.daysOld} days old. Schedule immediate follow-up.`
      });
    }

    // Check engagement
    const engagementFactor = factors.find(f => f.factor === 'engagement');
    if (engagementFactor && engagementFactor.views === 0) {
      recommendations.push({
        priority: 'high',
        action: 'resend',
        message: 'Quote has not been viewed. Consider resending or calling customer.'
      });
    }

    // Check value vs average
    const valueFactor = factors.find(f => f.factor === 'quoteValue');
    if (valueFactor && valueFactor.ratio > 1.5) {
      recommendations.push({
        priority: 'medium',
        action: 'discount',
        message: 'Quote is above customer\'s typical value. Consider offering discount or payment terms.'
      });
    }

    // Check salesperson performance
    const spFactor = factors.find(f => f.factor === 'salesperson');
    if (spFactor && spFactor.winRate < 30 && spFactor.recentTotal >= 5) {
      recommendations.push({
        priority: 'medium',
        action: 'coaching',
        message: 'Salesperson has low win rate. Consider involving senior team member.'
      });
    }

    // Check customer tier
    const tierFactor = factors.find(f => f.factor === 'customerTier');
    if (tierFactor && (tierFactor.tier === 'platinum' || tierFactor.tier === 'gold')) {
      recommendations.push({
        priority: 'high',
        action: 'prioritize',
        message: `${tierFactor.tier.charAt(0).toUpperCase() + tierFactor.tier.slice(1)} customer - prioritize this quote.`
      });
    }

    return recommendations;
  }

  /**
   * Get win probability for multiple quotes (bulk)
   */
  async getBulkWinProbability(quoteIds) {
    const results = await Promise.all(
      quoteIds.map(id => this.calculateWinProbability(id).catch(err => ({
        quoteId: id,
        error: err.message
      })))
    );
    return results;
  }

  /**
   * Get pipeline win rates by stage
   */
  async getPipelineWinRates() {
    const result = await this.pool.query(`
      WITH stage_stats AS (
        SELECT
          status,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'WON') as won,
          SUM(total_cents) as value
        FROM quotations
        WHERE created_at > NOW() - INTERVAL '90 days'
        GROUP BY status
      )
      SELECT
        status,
        total,
        won,
        value,
        CASE WHEN total > 0 THEN ROUND(won::numeric / total * 100, 1) ELSE 0 END as win_rate
      FROM stage_stats
      ORDER BY
        CASE status
          WHEN 'DRAFT' THEN 1
          WHEN 'SENT' THEN 2
          WHEN 'VIEWED' THEN 3
          WHEN 'PENDING_APPROVAL' THEN 4
          WHEN 'APPROVED' THEN 5
          WHEN 'COUNTER_OFFER' THEN 6
          WHEN 'NEGOTIATING' THEN 7
          WHEN 'WON' THEN 8
          WHEN 'LOST' THEN 9
          WHEN 'EXPIRED' THEN 10
        END
    `);

    return {
      stages: result.rows.map(row => ({
        stage: row.status,
        count: parseInt(row.total),
        value: parseInt(row.value) || 0,
        expectedProbability: Math.round(this.stageProbabilities[row.status] * 100),
        actualWinRate: parseFloat(row.win_rate) || 0
      })),
      period: '90 days'
    };
  }

  /**
   * Get at-risk quotes (low probability, need attention)
   */
  async getAtRiskQuotes(limit = 20) {
    // Get open quotes
    const quotesResult = await this.pool.query(`
      SELECT id
      FROM quotations
      WHERE status NOT IN ('WON', 'LOST', 'EXPIRED')
      ORDER BY total_cents DESC
      LIMIT $1
    `, [limit * 2]); // Get more to filter

    const probabilities = await this.getBulkWinProbability(
      quotesResult.rows.map(r => r.id)
    );

    // Filter to at-risk and sort by value
    return probabilities
      .filter(p => !p.error && p.winProbability < 40)
      .sort((a, b) => b.factors?.quoteValue?.quoteValue - a.factors?.quoteValue?.quoteValue)
      .slice(0, limit);
  }
}

module.exports = WinProbabilityService;
