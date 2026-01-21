/**
 * PredictiveCLVService - Predictive Customer Lifetime Value Analytics
 *
 * Provides:
 * - Historical CLV calculations
 * - Predictive CLV modeling (based on RFM analysis)
 * - Churn risk scoring
 * - Next purchase probability
 * - Customer segmentation recommendations
 * - Retention ROI calculations
 */

const pool = require('../db');

class PredictiveCLVService {
  constructor() {
    // CLV segment thresholds
    this.SEGMENT_THRESHOLDS = {
      platinum: 50000,
      gold: 20000,
      silver: 5000,
      bronze: 0
    };

    // Churn risk thresholds (days since last activity relative to avg interval)
    this.CHURN_THRESHOLDS = {
      low: 1.0,      // < 100% of avg interval
      medium: 1.5,   // 100-150% of avg interval
      high: 2.0      // > 200% of avg interval
    };

    // Default prediction horizon (months)
    this.PREDICTION_HORIZON = 12;
  }

  /**
   * Calculate RFM (Recency, Frequency, Monetary) scores for all customers
   * @returns {Promise<Array>} - Customers with RFM scores
   */
  async calculateRFMScores() {
    const result = await pool.query(`
      WITH customer_metrics AS (
        SELECT
          c.id as customer_id,
          c.name as customer_name,
          c.email,
          c.company,
          c.created_at as customer_since,
          -- Recency: days since last transaction
          COALESCE(
            EXTRACT(DAY FROM (CURRENT_TIMESTAMP - GREATEST(
              COALESCE((SELECT MAX(created_at) FROM orders WHERE customer_id = c.id AND status != 'cancelled'), '1970-01-01'),
              COALESCE((SELECT MAX(created_at) FROM quotations WHERE customer_id = c.id AND status IN ('accepted', 'converted')), '1970-01-01')
            ))),
            9999
          ) as recency_days,
          -- Frequency: number of transactions
          COALESCE(
            (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND status != 'cancelled'),
            0
          ) + COALESCE(
            (SELECT COUNT(*) FROM quotations WHERE customer_id = c.id AND status IN ('accepted', 'converted')),
            0
          ) as frequency,
          -- Monetary: total revenue
          COALESCE(
            (SELECT SUM(total_cents) / 100.0 FROM orders WHERE customer_id = c.id AND status != 'cancelled'),
            0
          ) + COALESCE(
            (SELECT SUM(total_amount) FROM quotations WHERE customer_id = c.id AND status IN ('accepted', 'converted')),
            0
          ) as monetary,
          -- Average order interval
          COALESCE(
            (SELECT AVG(EXTRACT(DAY FROM (lead_date - created_at)))
             FROM (
               SELECT created_at, LEAD(created_at) OVER (ORDER BY created_at) as lead_date
               FROM orders WHERE customer_id = c.id AND status != 'cancelled'
             ) intervals WHERE lead_date IS NOT NULL),
            90
          ) as avg_order_interval,
          -- Customer tenure (months)
          EXTRACT(MONTH FROM AGE(CURRENT_TIMESTAMP, c.created_at)) as tenure_months
        FROM customers c
      )
      SELECT
        customer_id,
        customer_name,
        email,
        company,
        customer_since,
        recency_days,
        frequency,
        monetary,
        avg_order_interval,
        tenure_months,
        -- RFM Scores (1-5 quintiles)
        NTILE(5) OVER (ORDER BY recency_days DESC) as recency_score,
        NTILE(5) OVER (ORDER BY frequency) as frequency_score,
        NTILE(5) OVER (ORDER BY monetary) as monetary_score
      FROM customer_metrics
      WHERE monetary > 0 OR frequency > 0
      ORDER BY monetary DESC
    `);

    return result.rows.map(row => ({
      customerId: row.customer_id,
      customerName: row.customer_name,
      email: row.email,
      company: row.company,
      customerSince: row.customer_since,
      recencyDays: parseFloat(row.recency_days),
      frequency: parseInt(row.frequency),
      monetary: parseFloat(row.monetary),
      avgOrderInterval: parseFloat(row.avg_order_interval),
      tenureMonths: parseInt(row.tenure_months) || 0,
      rfmScores: {
        recency: parseInt(row.recency_score),
        frequency: parseInt(row.frequency_score),
        monetary: parseInt(row.monetary_score),
        combined: parseInt(row.recency_score) + parseInt(row.frequency_score) + parseInt(row.monetary_score)
      }
    }));
  }

  /**
   * Predict future CLV for a customer
   * Uses a simplified BG/NBD-like approach based on historical patterns
   * @param {number} customerId - Customer ID
   * @param {number} horizon - Prediction horizon in months
   * @returns {Promise<object>} - Predicted CLV metrics
   */
  async predictCustomerCLV(customerId, horizon = this.PREDICTION_HORIZON) {
    // Get customer historical data
    const customerData = await pool.query(`
      WITH customer_orders AS (
        SELECT
          created_at,
          total_cents / 100.0 as order_value
        FROM orders
        WHERE customer_id = $1 AND status != 'cancelled'
        ORDER BY created_at
      ),
      customer_quotes AS (
        SELECT
          created_at,
          total_amount as order_value
        FROM quotations
        WHERE customer_id = $1 AND status IN ('accepted', 'converted')
        ORDER BY created_at
      ),
      all_transactions AS (
        SELECT * FROM customer_orders
        UNION ALL
        SELECT * FROM customer_quotes
        ORDER BY created_at
      )
      SELECT
        COUNT(*) as total_transactions,
        COALESCE(SUM(order_value), 0) as total_revenue,
        COALESCE(AVG(order_value), 0) as avg_order_value,
        MIN(created_at) as first_purchase,
        MAX(created_at) as last_purchase,
        EXTRACT(DAY FROM (CURRENT_TIMESTAMP - MAX(created_at))) as days_since_last,
        EXTRACT(MONTH FROM AGE(MAX(created_at), MIN(created_at))) as active_months,
        CASE WHEN COUNT(*) > 1 THEN
          EXTRACT(DAY FROM (MAX(created_at) - MIN(created_at))) / (COUNT(*) - 1)
        ELSE 30 END as avg_days_between_purchases
      FROM all_transactions
    `, [customerId]);

    const data = customerData.rows[0];
    const totalTransactions = parseInt(data.total_transactions) || 0;
    const totalRevenue = parseFloat(data.total_revenue) || 0;
    const avgOrderValue = parseFloat(data.avg_order_value) || 0;
    const daysSinceLast = parseFloat(data.days_since_last) || 0;
    const avgDaysBetween = parseFloat(data.avg_days_between_purchases) || 30;
    const activeMonths = parseInt(data.active_months) || 1;

    // Calculate purchase frequency (purchases per month)
    const purchaseFrequency = activeMonths > 0 ? totalTransactions / activeMonths : 0;

    // Predict future purchases in horizon period
    const expectedPurchases = purchaseFrequency * horizon;

    // Predicted future revenue
    const predictedRevenue = expectedPurchases * avgOrderValue;

    // Calculate probability of being active (simplified)
    // Based on how "overdue" the customer is for their next purchase
    const expectedDaysForNextPurchase = avgDaysBetween;
    const overdueRatio = daysSinceLast / expectedDaysForNextPurchase;
    const activeProb = Math.max(0, Math.min(1, 1 - (overdueRatio - 1) * 0.3));

    // Adjusted predicted CLV
    const adjustedPredictedCLV = predictedRevenue * activeProb;

    // Total CLV (historical + predicted)
    const totalPredictedCLV = totalRevenue + adjustedPredictedCLV;

    // Churn risk calculation
    let churnRisk = 'low';
    let churnProbability = 0;

    if (overdueRatio >= this.CHURN_THRESHOLDS.high) {
      churnRisk = 'high';
      churnProbability = Math.min(95, 50 + (overdueRatio - 2) * 15);
    } else if (overdueRatio >= this.CHURN_THRESHOLDS.medium) {
      churnRisk = 'medium';
      churnProbability = 25 + (overdueRatio - 1.5) * 50;
    } else {
      churnRisk = 'low';
      churnProbability = Math.max(5, overdueRatio * 25);
    }

    // Next purchase probability (within 30 days)
    const nextPurchaseProb = activeProb * Math.min(1, 30 / Math.max(avgDaysBetween, 1));

    // Determine segment
    let segment = 'bronze';
    if (totalPredictedCLV >= this.SEGMENT_THRESHOLDS.platinum) segment = 'platinum';
    else if (totalPredictedCLV >= this.SEGMENT_THRESHOLDS.gold) segment = 'gold';
    else if (totalPredictedCLV >= this.SEGMENT_THRESHOLDS.silver) segment = 'silver';

    return {
      customerId,
      historical: {
        totalTransactions,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        purchaseFrequency: Math.round(purchaseFrequency * 100) / 100,
        firstPurchase: data.first_purchase,
        lastPurchase: data.last_purchase,
        daysSinceLast: Math.round(daysSinceLast),
        avgDaysBetween: Math.round(avgDaysBetween)
      },
      predicted: {
        horizonMonths: horizon,
        expectedPurchases: Math.round(expectedPurchases * 10) / 10,
        predictedRevenue: Math.round(predictedRevenue * 100) / 100,
        activeProbability: Math.round(activeProb * 100),
        adjustedPredictedCLV: Math.round(adjustedPredictedCLV * 100) / 100,
        totalPredictedCLV: Math.round(totalPredictedCLV * 100) / 100
      },
      churn: {
        risk: churnRisk,
        probability: Math.round(churnProbability),
        overdueRatio: Math.round(overdueRatio * 100) / 100
      },
      nextPurchase: {
        probability30Days: Math.round(nextPurchaseProb * 100),
        expectedDays: Math.round(Math.max(0, avgDaysBetween - daysSinceLast))
      },
      segment
    };
  }

  /**
   * Get churn risk analysis for all customers
   * @param {object} options - Query options
   * @returns {Promise<object>} - Churn risk summary and at-risk customers
   */
  async getChurnRiskAnalysis(options = {}) {
    const { limit = 50, minRevenue = 1000 } = options;

    const result = await pool.query(`
      WITH customer_activity AS (
        SELECT
          c.id as customer_id,
          c.name as customer_name,
          c.email,
          c.company,
          GREATEST(
            COALESCE((SELECT MAX(created_at) FROM orders WHERE customer_id = c.id AND status != 'cancelled'), '1970-01-01'),
            COALESCE((SELECT MAX(created_at) FROM quotations WHERE customer_id = c.id AND status IN ('accepted', 'converted')), '1970-01-01')
          ) as last_activity,
          COALESCE(
            (SELECT SUM(total_cents) / 100.0 FROM orders WHERE customer_id = c.id AND status != 'cancelled'),
            0
          ) + COALESCE(
            (SELECT SUM(total_amount) FROM quotations WHERE customer_id = c.id AND status IN ('accepted', 'converted')),
            0
          ) as lifetime_value,
          COALESCE(
            (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND status != 'cancelled'),
            0
          ) as order_count,
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
        company,
        last_activity,
        lifetime_value,
        order_count,
        avg_order_interval,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_activity)) / 86400.0 as days_since_activity,
        CASE
          WHEN last_activity = '1970-01-01' THEN 'unknown'
          WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_activity)) / 86400.0 > avg_order_interval * 2 THEN 'high'
          WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_activity)) / 86400.0 > avg_order_interval * 1.5 THEN 'medium'
          ELSE 'low'
        END as churn_risk,
        CASE
          WHEN lifetime_value >= 50000 THEN 'platinum'
          WHEN lifetime_value >= 20000 THEN 'gold'
          WHEN lifetime_value >= 5000 THEN 'silver'
          ELSE 'bronze'
        END as segment
      FROM customer_activity
      WHERE lifetime_value >= $1
        AND last_activity > '1970-01-01'
      ORDER BY
        CASE
          WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_activity)) / 86400.0 > avg_order_interval * 2 THEN 0
          WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_activity)) / 86400.0 > avg_order_interval * 1.5 THEN 1
          ELSE 2
        END,
        lifetime_value DESC
      LIMIT $2
    `, [minRevenue, limit]);

    // Count by risk level
    const riskCounts = { high: 0, medium: 0, low: 0, unknown: 0 };
    const atRiskRevenue = { high: 0, medium: 0 };

    const customers = result.rows.map(row => {
      const risk = row.churn_risk;
      riskCounts[risk]++;
      if (risk === 'high' || risk === 'medium') {
        atRiskRevenue[risk] += parseFloat(row.lifetime_value);
      }

      return {
        customerId: row.customer_id,
        customerName: row.customer_name,
        email: row.email,
        company: row.company,
        lastActivity: row.last_activity,
        lifetimeValue: parseFloat(row.lifetime_value),
        orderCount: parseInt(row.order_count),
        avgOrderInterval: parseFloat(row.avg_order_interval),
        daysSinceActivity: parseFloat(row.days_since_activity),
        churnRisk: risk,
        segment: row.segment
      };
    });

    return {
      summary: {
        totalAnalyzed: customers.length,
        riskCounts,
        atRiskRevenue: {
          high: Math.round(atRiskRevenue.high * 100) / 100,
          medium: Math.round(atRiskRevenue.medium * 100) / 100,
          total: Math.round((atRiskRevenue.high + atRiskRevenue.medium) * 100) / 100
        }
      },
      customers
    };
  }

  /**
   * Get customer cohort analysis
   * @param {string} cohortType - 'acquisition_month' or 'first_purchase_month'
   * @returns {Promise<Array>} - Cohort retention data
   */
  async getCohortAnalysis(cohortType = 'acquisition_month') {
    const result = await pool.query(`
      WITH customer_cohorts AS (
        SELECT
          c.id as customer_id,
          DATE_TRUNC('month', c.created_at) as cohort_month,
          DATE_TRUNC('month', o.created_at) as activity_month
        FROM customers c
        JOIN orders o ON o.customer_id = c.id
        WHERE o.status != 'cancelled'
      ),
      cohort_data AS (
        SELECT
          cohort_month,
          activity_month,
          EXTRACT(MONTH FROM AGE(activity_month, cohort_month)) as months_since_cohort,
          COUNT(DISTINCT customer_id) as customer_count
        FROM customer_cohorts
        GROUP BY cohort_month, activity_month
      )
      SELECT
        cohort_month,
        months_since_cohort,
        customer_count,
        (SELECT COUNT(DISTINCT customer_id) FROM customer_cohorts cc WHERE cc.cohort_month = cd.cohort_month) as cohort_size
      FROM cohort_data cd
      WHERE months_since_cohort >= 0
      ORDER BY cohort_month, months_since_cohort
    `);

    // Group by cohort month
    const cohorts = {};
    result.rows.forEach(row => {
      const cohortKey = row.cohort_month.toISOString().slice(0, 7);
      if (!cohorts[cohortKey]) {
        cohorts[cohortKey] = {
          cohortMonth: cohortKey,
          cohortSize: parseInt(row.cohort_size),
          retention: {}
        };
      }
      const monthsSince = parseInt(row.months_since_cohort);
      const retentionRate = (parseInt(row.customer_count) / parseInt(row.cohort_size)) * 100;
      cohorts[cohortKey].retention[monthsSince] = Math.round(retentionRate * 10) / 10;
    });

    return Object.values(cohorts);
  }

  /**
   * Calculate retention ROI - cost of retention vs value of retained customers
   * @param {object} options - Calculation options
   * @returns {Promise<object>} - Retention ROI analysis
   */
  async calculateRetentionROI(options = {}) {
    const {
      retentionCostPerCustomer = 50,  // Assumed cost to retain a customer
      acquisitionCostPerCustomer = 200,  // Assumed cost to acquire new customer
      targetChurnReduction = 0.25  // Target 25% reduction in churn
    } = options;

    // Get current churn risk analysis
    const churnAnalysis = await this.getChurnRiskAnalysis({ limit: 1000, minRevenue: 500 });

    const highRiskCount = churnAnalysis.summary.riskCounts.high;
    const mediumRiskCount = churnAnalysis.summary.riskCounts.medium;
    const atRiskRevenue = churnAnalysis.summary.atRiskRevenue.total;

    // Calculate potential saves
    const customersToTarget = highRiskCount + Math.floor(mediumRiskCount * 0.5);
    const retentionCost = customersToTarget * retentionCostPerCustomer;

    // Expected retention success rate
    const expectedRetained = Math.floor(customersToTarget * targetChurnReduction);
    const expectedSavedRevenue = (atRiskRevenue / (highRiskCount + mediumRiskCount)) * expectedRetained;

    // Compare to acquisition cost
    const acquisitionCostForSameRevenue = expectedRetained * acquisitionCostPerCustomer;
    const savings = acquisitionCostForSameRevenue - retentionCost;
    const roi = retentionCost > 0 ? ((expectedSavedRevenue - retentionCost) / retentionCost) * 100 : 0;

    return {
      atRisk: {
        highRiskCustomers: highRiskCount,
        mediumRiskCustomers: mediumRiskCount,
        totalAtRiskRevenue: atRiskRevenue
      },
      retention: {
        customersToTarget,
        retentionCostTotal: retentionCost,
        expectedRetained,
        expectedSavedRevenue: Math.round(expectedSavedRevenue * 100) / 100,
        targetChurnReduction: targetChurnReduction * 100
      },
      comparison: {
        acquisitionCostEquivalent: acquisitionCostForSameRevenue,
        savingsVsAcquisition: savings,
        roiPercentage: Math.round(roi)
      },
      recommendation: roi > 100
        ? 'High ROI - Strongly recommend retention investment'
        : roi > 50
          ? 'Moderate ROI - Consider selective retention campaigns'
          : 'Low ROI - Focus on highest-value at-risk customers only'
    };
  }

  /**
   * Get segment recommendations for targeting
   * @returns {Promise<Array>} - Segment recommendations with actions
   */
  async getSegmentRecommendations() {
    const rfmData = await this.calculateRFMScores();

    // Classify customers into actionable segments
    const segments = {
      champions: [],      // High R, F, M
      loyalCustomers: [], // High F, M; any R
      potentialLoyalists: [], // High R, M; low F
      newCustomers: [],   // High R; low F, M
      needsAttention: [], // Medium R, F, M
      atRisk: [],         // Low R; high F, M
      cantLose: [],       // Low R; very high F, M
      hibernating: [],    // Very low R, F, M
      lost: []            // Very low R; any F, M
    };

    rfmData.forEach(customer => {
      const { recency, frequency, monetary } = customer.rfmScores;

      if (recency >= 4 && frequency >= 4 && monetary >= 4) {
        segments.champions.push(customer);
      } else if (frequency >= 4 && monetary >= 4) {
        if (recency >= 3) {
          segments.loyalCustomers.push(customer);
        } else if (recency <= 2) {
          segments.cantLose.push(customer);
        }
      } else if (recency >= 4 && monetary >= 3 && frequency <= 2) {
        segments.potentialLoyalists.push(customer);
      } else if (recency >= 4 && frequency <= 2 && monetary <= 2) {
        segments.newCustomers.push(customer);
      } else if (recency >= 3 && frequency >= 2 && monetary >= 2) {
        segments.needsAttention.push(customer);
      } else if (recency <= 2 && frequency >= 3) {
        segments.atRisk.push(customer);
      } else if (recency <= 1) {
        segments.lost.push(customer);
      } else {
        segments.hibernating.push(customer);
      }
    });

    return Object.entries(segments).map(([name, customers]) => ({
      segment: name,
      count: customers.length,
      totalValue: Math.round(customers.reduce((sum, c) => sum + c.monetary, 0) * 100) / 100,
      avgValue: customers.length > 0
        ? Math.round((customers.reduce((sum, c) => sum + c.monetary, 0) / customers.length) * 100) / 100
        : 0,
      recommendation: this.getSegmentRecommendation(name),
      customers: customers.slice(0, 10)  // Return top 10 per segment
    }));
  }

  /**
   * Get recommendation for a segment
   * @param {string} segment - Segment name
   * @returns {object} - Recommendation details
   */
  getSegmentRecommendation(segment) {
    const recommendations = {
      champions: {
        action: 'Reward and engage',
        details: 'Offer exclusive benefits, early access, referral programs. These are your best customers.',
        priority: 'high'
      },
      loyalCustomers: {
        action: 'Upsell and cross-sell',
        details: 'Recommend higher-value products, bundles, or premium services.',
        priority: 'high'
      },
      potentialLoyalists: {
        action: 'Convert to loyal',
        details: 'Offer loyalty program, personalized recommendations to increase frequency.',
        priority: 'high'
      },
      newCustomers: {
        action: 'Onboard and nurture',
        details: 'Welcome sequence, product education, second purchase incentive.',
        priority: 'medium'
      },
      needsAttention: {
        action: 'Re-engage',
        details: 'Limited-time offers, personalized outreach to reactivate.',
        priority: 'medium'
      },
      atRisk: {
        action: 'Prevent churn',
        details: 'Urgent outreach, win-back offers, satisfaction survey.',
        priority: 'critical'
      },
      cantLose: {
        action: 'Immediate action',
        details: 'Personal call from sales, special attention, exclusive offers.',
        priority: 'critical'
      },
      hibernating: {
        action: 'Reactivate',
        details: 'Win-back campaign, special discount, product updates.',
        priority: 'low'
      },
      lost: {
        action: 'Reconnect',
        details: 'Survey why they left, major win-back offer, or deprioritize.',
        priority: 'low'
      }
    };

    return recommendations[segment] || {
      action: 'Review',
      details: 'Analyze customer behavior and determine appropriate action.',
      priority: 'medium'
    };
  }
}

// Export singleton instance
module.exports = new PredictiveCLVService();
