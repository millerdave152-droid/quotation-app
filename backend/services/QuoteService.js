/**
 * Quote Service
 * Handles all quotation-related business logic and calculations
 */

const ActivityService = require('./ActivityService');
const emailService = require('./EmailService');
const { buildQuoteSnapshot, SnapshotBuildError } = require('./skulytics/SkulyticsSnapshotService');

class QuoteService {
  constructor(pool) {
    this.pool = pool;
    this.activityService = new ActivityService(pool);
  }

  /**
   * Check if a quote requires approval based on user's margin threshold
   * @param {object} quote - Quote object with margin_percent or calculated totals
   * @param {string} userEmail - Email of the user creating/updating the quote
   * @returns {Promise<{requiresApproval: boolean, user: object|null, reason: string}>}
   */
  async checkMarginApproval(quote, userEmail) {
    try {
      // Get user and their approval threshold
      const userResult = await this.pool.query(`
        SELECT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.role,
          u.approval_threshold_percent,
          u.can_approve_quotes,
          u.manager_id,
          m.email as manager_email,
          m.first_name || ' ' || m.last_name as manager_name
        FROM users u
        LEFT JOIN users m ON u.manager_id = m.id
        WHERE u.email = $1 AND u.is_active = true
      `, [userEmail]);

      if (userResult.rows.length === 0) {
        // User not found - no threshold set, no approval required
        return { requiresApproval: false, user: null, reason: 'User not found or inactive' };
      }

      const user = userResult.rows[0];
      const threshold = parseFloat(user.approval_threshold_percent);

      // If no threshold is set, no approval required
      if (!threshold || isNaN(threshold)) {
        return { requiresApproval: false, user, reason: 'No margin threshold configured' };
      }

      // Calculate margin from quote
      const marginPercent = quote.margin_percent ?? quote.marginPercent ?? 0;

      // If margin is below threshold, approval is required
      if (marginPercent < threshold) {
        return {
          requiresApproval: true,
          user,
          marginPercent,
          threshold,
          reason: `Margin ${marginPercent.toFixed(2)}% is below threshold ${threshold.toFixed(2)}%`
        };
      }

      return {
        requiresApproval: false,
        user,
        marginPercent,
        threshold,
        reason: `Margin ${marginPercent.toFixed(2)}% meets threshold ${threshold.toFixed(2)}%`
      };
    } catch (error) {
      console.error('Error checking margin approval:', error);
      return { requiresApproval: false, user: null, reason: 'Error checking approval' };
    }
  }

  /**
   * Auto-create an approval request for a quote
   * @param {object} client - Database client (for transaction) or null
   * @param {number} quoteId - Quote ID
   * @param {object} user - User object from checkMarginApproval
   * @param {number} marginPercent - Current margin percentage
   * @param {number} threshold - User's threshold percentage
   * @returns {Promise<object|null>} Created approval record
   */
  async createAutoApprovalRequest(client, quoteId, user, marginPercent, threshold) {
    const db = client || this.pool;

    try {
      // Check for existing pending approval
      const existing = await db.query(
        `SELECT id FROM quote_approvals WHERE quotation_id = $1 AND status = 'PENDING'`,
        [quoteId]
      );

      if (existing.rows.length > 0) {
        return null;
      }

      // Find an approver (supervisor/manager or anyone with can_approve_quotes)
      let approverEmail = user.manager_email;
      let approverName = user.manager_name;

      // If no manager, find another approver
      if (!approverEmail) {
        const approverResult = await db.query(`
          SELECT email, first_name || ' ' || last_name as name
          FROM users
          WHERE can_approve_quotes = true
            AND is_active = true
            AND email != $1
          ORDER BY role = 'admin' DESC, role = 'manager' DESC
          LIMIT 1
        `, [user.email]);

        if (approverResult.rows.length > 0) {
          approverEmail = approverResult.rows[0].email;
          approverName = approverResult.rows[0].name;
        }
      }

      if (!approverEmail) {
        console.warn('No approvers available for quote', quoteId);
        return null;
      }

      // Create approval request
      const comments = `Auto-triggered: Margin ${marginPercent.toFixed(2)}% is below threshold ${threshold.toFixed(2)}%`;
      const requesterName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;

      const result = await db.query(`
        INSERT INTO quote_approvals (
          quotation_id, requested_by, requested_by_email, requester_user_id,
          approver_name, approver_email, comments, approval_type,
          margin_at_request, threshold_at_request
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'margin_threshold', $8, $9)
        RETURNING *
      `, [quoteId, requesterName, user.email, user.id, approverName, approverEmail, comments, marginPercent, threshold]);

      // Update quote status to PENDING_APPROVAL
      await db.query(
        `UPDATE quotations SET status = 'PENDING_APPROVAL' WHERE id = $1`,
        [quoteId]
      );

      // Add event to timeline
      await db.query(`
        INSERT INTO quote_events (quotation_id, event_type, description, user_name, metadata, activity_category)
        VALUES ($1, 'APPROVAL_REQUESTED', $2, $3, $4, 'approval')
      `, [
        quoteId,
        `Auto-approval requested: ${comments}`,
        requesterName,
        JSON.stringify({
          marginPercent,
          threshold,
          approverEmail,
          autoTriggered: true
        })
      ]);

      return result.rows[0];

    } catch (error) {
      console.error('Error creating auto-approval request:', error);
      throw error;
    }
  }

  /**
   * Get supervisors/managers who can approve quotes
   * @returns {Promise<Array>} List of approvers
   */
  async getApprovers() {
    const result = await this.pool.query(`
      SELECT id, email, first_name, last_name, role, department
      FROM users
      WHERE can_approve_quotes = true AND is_active = true
      ORDER BY role = 'admin' DESC, role = 'manager' DESC, first_name
    `);

    return result.rows.map(u => ({
      id: u.id,
      email: u.email,
      name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
      role: u.role,
      department: u.department
    }));
  }

  /**
   * Calculate quote totals from items
   * @param {Array} items - Quote items
   * @param {number} discountPercent - Discount percentage
   * @param {number} taxRate - Tax rate (as decimal like 0.13 or percentage like 13)
   * @returns {object} Calculated totals
   */
  calculateTotals(items, discountPercent = 0, taxRate = 0.13) {
    // Calculate subtotal from items
    const subtotal_cents = items.reduce((sum, item) => {
      const sell_cents = item.sell_cents || Math.round((item.sell || 0) * 100);
      return sum + (sell_cents * (item.quantity || 1));
    }, 0);

    // Calculate discount
    const discount_cents = Math.round((subtotal_cents * discountPercent) / 100);
    const after_discount = subtotal_cents - discount_cents;

    // Normalize tax rate (convert 0.13 to 13 if needed)
    const tax_rate_percent = taxRate < 1 ? taxRate * 100 : taxRate;
    const tax_cents = Math.round((after_discount * tax_rate_percent) / 100);
    const total_cents = after_discount + tax_cents;

    // Calculate cost and profit
    const total_cost_cents = items.reduce((sum, item) => {
      const cost_cents = item.cost_cents || Math.round((item.cost || 0) * 100);
      return sum + (cost_cents * (item.quantity || 1));
    }, 0);

    const gross_profit_cents = after_discount - total_cost_cents;
    const margin_percent = after_discount > 0
      ? Math.round((gross_profit_cents / after_discount) * 10000) / 100
      : 0;

    return {
      subtotal_cents,
      discount_percent: discountPercent,
      discount_cents,
      tax_rate: tax_rate_percent,
      tax_cents,
      total_cents,
      total_cost_cents,
      gross_profit_cents,
      margin_percent
    };
  }

  /**
   * Generate a unique quote number
   * Uses MAX+1 pattern for thread-safety
   * @param {object} client - Optional database client for transaction
   * @returns {Promise<string>}
   */
  async generateQuoteNumber(client = null) {
    const db = client || this.pool;
    const year = new Date().getFullYear();

    // FIX: Use COALESCE and MAX to get highest number, avoiding race conditions
    const maxNumResult = await db.query(`
      SELECT COALESCE(
        MAX(CAST(SUBSTRING(quote_number FROM 'QT-${year}-(\\d+)') AS INTEGER)),
        0
      ) + 1 as next_num
      FROM quotations
      WHERE quote_number LIKE $1
    `, [`QT-${year}-%`]);

    const nextNum = maxNumResult.rows.length > 0 ? maxNumResult.rows[0].next_num : 1;

    return `QT-${year}-${nextNum.toString().padStart(4, '0')}`;
  }

  /**
   * Get quote statistics summary
   * @returns {Promise<object>}
   */
  async getStatsSummary() {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) as total_quotes,
        COUNT(CASE WHEN status = 'DRAFT' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'WON' THEN 1 END) as won_count,
        COUNT(CASE WHEN status = 'LOST' THEN 1 END) as lost_count,
        COUNT(CASE WHEN status = 'PENDING_APPROVAL' THEN 1 END) as pending_approval_count,

        -- All values in CENTS for frontend compatibility
        COALESCE(SUM(total_cents), 0) as total_value_cents,
        COALESCE(SUM(CASE WHEN status = 'WON' THEN total_cents ELSE 0 END), 0) as won_value_cents,
        COALESCE(SUM(CASE WHEN status IN ('DRAFT', 'SENT', 'PENDING_APPROVAL') THEN total_cents ELSE 0 END), 0) as pipeline_value_cents,
        COALESCE(SUM(CASE WHEN status = 'DRAFT' THEN total_cents ELSE 0 END), 0) as draft_value_cents,
        COALESCE(SUM(CASE WHEN status = 'SENT' THEN total_cents ELSE 0 END), 0) as sent_value_cents,
        COALESCE(SUM(CASE WHEN status = 'LOST' THEN total_cents ELSE 0 END), 0) as lost_value_cents,

        COALESCE(SUM(gross_profit_cents), 0) as total_profit_cents,
        COALESCE(SUM(CASE WHEN status = 'WON' THEN gross_profit_cents ELSE 0 END), 0) as won_profit_cents,

        -- Dollar amounts (for backward compatibility)
        COALESCE(SUM(total_cents), 0) / 100.0 as total_value,
        COALESCE(SUM(CASE WHEN status = 'WON' THEN total_cents ELSE 0 END), 0) / 100.0 as won_value,
        COALESCE(SUM(gross_profit_cents), 0) / 100.0 as total_profit,

        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as last_7_days,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as last_30_days
      FROM quotations
    `);

    const stats = result.rows[0];

    // Parse numeric values to ensure proper types
    stats.total_quotes = parseInt(stats.total_quotes) || 0;
    stats.draft_count = parseInt(stats.draft_count) || 0;
    stats.sent_count = parseInt(stats.sent_count) || 0;
    stats.won_count = parseInt(stats.won_count) || 0;
    stats.lost_count = parseInt(stats.lost_count) || 0;
    stats.pending_approval_count = parseInt(stats.pending_approval_count) || 0;

    stats.total_value_cents = parseInt(stats.total_value_cents) || 0;
    stats.won_value_cents = parseInt(stats.won_value_cents) || 0;
    stats.pipeline_value_cents = parseInt(stats.pipeline_value_cents) || 0;
    stats.draft_value_cents = parseInt(stats.draft_value_cents) || 0;
    stats.sent_value_cents = parseInt(stats.sent_value_cents) || 0;
    stats.lost_value_cents = parseInt(stats.lost_value_cents) || 0;
    stats.total_profit_cents = parseInt(stats.total_profit_cents) || 0;
    stats.won_profit_cents = parseInt(stats.won_profit_cents) || 0;

    stats.total_value = parseFloat(stats.total_value) || 0;
    stats.won_value = parseFloat(stats.won_value) || 0;
    stats.total_profit = parseFloat(stats.total_profit) || 0;

    // Calculate win rate
    const total = stats.total_quotes;
    const won = stats.won_count;
    stats.win_rate = total > 0 ? Math.round((won / total) * 100) : 0;

    // Calculate average quote value
    stats.avg_quote_value_cents = total > 0 ? Math.round(stats.total_value_cents / total) : 0;

    return stats;
  }

  /**
   * Get enhanced dashboard metrics with advanced calculations
   * @returns {Promise<object>}
   */
  async getEnhancedDashboardMetrics() {
    // Run all queries in parallel for performance
    const [
      basicStats,
      conversionStats,
      daysToCloseStats,
      topSalesperson,
      winRateByTier,
      weeklyActivity,
      velocityStats
    ] = await Promise.all([
      // Basic stats (reuse existing)
      this.getStatsSummary(),

      // Conversion rate: Won / (Won + Lost)
      this.pool.query(`
        SELECT
          COUNT(CASE WHEN status = 'WON' THEN 1 END) as won_count,
          COUNT(CASE WHEN status = 'LOST' THEN 1 END) as lost_count,
          COUNT(CASE WHEN status IN ('WON', 'LOST') THEN 1 END) as closed_count
        FROM quotations
      `),

      // Average days to close (Won quotes: won_at - created_at)
      this.pool.query(`
        SELECT
          AVG(EXTRACT(EPOCH FROM (won_at - created_at)) / 86400)::numeric(10,1) as avg_days_to_win,
          MIN(EXTRACT(EPOCH FROM (won_at - created_at)) / 86400)::numeric(10,1) as min_days_to_win,
          MAX(EXTRACT(EPOCH FROM (won_at - created_at)) / 86400)::numeric(10,1) as max_days_to_win,
          COUNT(*) as sample_size
        FROM quotations
        WHERE status = 'WON' AND won_at IS NOT NULL
      `),

      // Top salesperson by quotes and revenue
      this.pool.query(`
        SELECT
          COALESCE(created_by, 'Unknown') as salesperson,
          COUNT(*) as quote_count,
          COUNT(CASE WHEN status = 'WON' THEN 1 END) as won_count,
          COALESCE(SUM(total_cents), 0) as total_value_cents,
          COALESCE(SUM(CASE WHEN status = 'WON' THEN total_cents ELSE 0 END), 0) as won_value_cents
        FROM quotations
        WHERE created_by IS NOT NULL AND created_by != ''
        GROUP BY created_by
        ORDER BY won_value_cents DESC
        LIMIT 5
      `),

      // Win rate by value tier
      this.pool.query(`
        SELECT
          CASE
            WHEN total_cents < 100000 THEN 'under_1k'
            WHEN total_cents >= 100000 AND total_cents < 500000 THEN '1k_to_5k'
            WHEN total_cents >= 500000 AND total_cents < 1000000 THEN '5k_to_10k'
            ELSE 'over_10k'
          END as value_tier,
          COUNT(*) as total_count,
          COUNT(CASE WHEN status = 'WON' THEN 1 END) as won_count,
          COUNT(CASE WHEN status = 'LOST' THEN 1 END) as lost_count,
          COUNT(CASE WHEN status IN ('WON', 'LOST') THEN 1 END) as closed_count,
          COALESCE(SUM(total_cents), 0) as total_value_cents,
          COALESCE(SUM(CASE WHEN status = 'WON' THEN total_cents ELSE 0 END), 0) as won_value_cents
        FROM quotations
        GROUP BY 1
      `),

      // Quote activity this week
      this.pool.query(`
        SELECT
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as created_this_week,
          COUNT(CASE WHEN sent_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as sent_this_week,
          COUNT(CASE WHEN won_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as won_this_week,
          COUNT(CASE WHEN lost_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as lost_this_week,
          COALESCE(SUM(CASE WHEN won_at >= CURRENT_DATE - INTERVAL '7 days' THEN total_cents ELSE 0 END), 0) as won_value_this_week,

          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as created_this_month,
          COUNT(CASE WHEN sent_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as sent_this_month,
          COUNT(CASE WHEN won_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as won_this_month
        FROM quotations
      `),

      // Sales velocity metrics
      this.pool.query(`
        WITH weekly_stats AS (
          SELECT
            DATE_TRUNC('week', created_at) as week_start,
            COUNT(*) as quotes_created
          FROM quotations
          WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
          GROUP BY DATE_TRUNC('week', created_at)
        ),
        time_to_send AS (
          SELECT
            AVG(EXTRACT(EPOCH FROM (sent_at - created_at)) / 86400)::numeric(10,2) as avg_days_to_send
          FROM quotations
          WHERE sent_at IS NOT NULL AND created_at >= CURRENT_DATE - INTERVAL '90 days'
        ),
        time_to_close AS (
          SELECT
            AVG(EXTRACT(EPOCH FROM (
              CASE
                WHEN status = 'WON' THEN won_at
                WHEN status = 'LOST' THEN lost_at
                ELSE NULL
              END - sent_at
            )) / 86400)::numeric(10,2) as avg_days_sent_to_close
          FROM quotations
          WHERE status IN ('WON', 'LOST')
            AND sent_at IS NOT NULL
            AND created_at >= CURRENT_DATE - INTERVAL '90 days'
        )
        SELECT
          COALESCE((SELECT AVG(quotes_created) FROM weekly_stats), 0)::numeric(10,1) as avg_quotes_per_week,
          COALESCE((SELECT avg_days_to_send FROM time_to_send), 0) as avg_days_to_send,
          COALESCE((SELECT avg_days_sent_to_close FROM time_to_close), 0) as avg_days_sent_to_close
      `)
    ]);

    // Calculate conversion rate
    const conversionData = conversionStats.rows[0];
    const closedCount = parseInt(conversionData.closed_count) || 0;
    const wonCount = parseInt(conversionData.won_count) || 0;
    const conversionRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0;

    // Process days to close
    const daysData = daysToCloseStats.rows[0];
    const avgDaysToClose = parseFloat(daysData.avg_days_to_win) || 0;

    // Process win rate by tier
    const tierData = winRateByTier.rows.map(row => ({
      tier: row.value_tier,
      tierLabel: {
        'under_1k': 'Under $1K',
        '1k_to_5k': '$1K - $5K',
        '5k_to_10k': '$5K - $10K',
        'over_10k': 'Over $10K'
      }[row.value_tier] || row.value_tier,
      totalCount: parseInt(row.total_count) || 0,
      wonCount: parseInt(row.won_count) || 0,
      lostCount: parseInt(row.lost_count) || 0,
      closedCount: parseInt(row.closed_count) || 0,
      winRate: parseInt(row.closed_count) > 0
        ? Math.round((parseInt(row.won_count) / parseInt(row.closed_count)) * 100)
        : 0,
      totalValueCents: parseInt(row.total_value_cents) || 0,
      wonValueCents: parseInt(row.won_value_cents) || 0
    }));

    // Process weekly activity
    const activityData = weeklyActivity.rows[0];

    // Process velocity stats
    const velocityData = velocityStats.rows[0];

    return {
      // Basic stats
      ...basicStats,

      // Conversion metrics
      conversionRate,
      closedQuotesCount: closedCount,

      // Time metrics
      avgDaysToClose: Math.round(avgDaysToClose * 10) / 10,
      minDaysToClose: parseFloat(daysData.min_days_to_win) || 0,
      maxDaysToClose: parseFloat(daysData.max_days_to_win) || 0,
      daysToCloseSampleSize: parseInt(daysData.sample_size) || 0,

      // Top salespeople
      topSalespeople: topSalesperson.rows.map(row => ({
        name: row.salesperson,
        quoteCount: parseInt(row.quote_count) || 0,
        wonCount: parseInt(row.won_count) || 0,
        totalValueCents: parseInt(row.total_value_cents) || 0,
        wonValueCents: parseInt(row.won_value_cents) || 0,
        winRate: parseInt(row.quote_count) > 0
          ? Math.round((parseInt(row.won_count) / parseInt(row.quote_count)) * 100)
          : 0
      })),

      // Win rate by value tier
      winRateByTier: tierData,

      // Weekly activity
      weeklyActivity: {
        created: parseInt(activityData.created_this_week) || 0,
        sent: parseInt(activityData.sent_this_week) || 0,
        won: parseInt(activityData.won_this_week) || 0,
        lost: parseInt(activityData.lost_this_week) || 0,
        wonValueCents: parseInt(activityData.won_value_this_week) || 0
      },

      // Monthly activity
      monthlyActivity: {
        created: parseInt(activityData.created_this_month) || 0,
        sent: parseInt(activityData.sent_this_month) || 0,
        won: parseInt(activityData.won_this_month) || 0
      },

      // Sales velocity
      salesVelocity: {
        avgQuotesPerWeek: parseFloat(velocityData.avg_quotes_per_week) || 0,
        avgDaysToSend: parseFloat(velocityData.avg_days_to_send) || 0,
        avgDaysSentToClose: parseFloat(velocityData.avg_days_sent_to_close) || 0
      }
    };
  }

  /**
   * Get quotes with search, filtering, and pagination
   * @param {object} options - Query options
   * @returns {Promise<{quotations: Array, pagination: object}>}
   */
  async getQuotes(options = {}) {
    const {
      search = '',
      status,
      customer_id,
      from_date,
      to_date,
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    const offset = (page - 1) * limit;
    const validSortColumns = ['created_at', 'quotation_number', 'customer_name', 'total_amount', 'status'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Build WHERE clause
    let whereConditions = ['1=1'];
    let queryParams = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(
        q.quotation_number ILIKE $${paramIndex} OR
        q.quote_number ILIKE $${paramIndex} OR
        c.name ILIKE $${paramIndex} OR
        c.email ILIKE $${paramIndex} OR
        c.company ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`q.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (customer_id) {
      whereConditions.push(`q.customer_id = $${paramIndex}`);
      queryParams.push(customer_id);
      paramIndex++;
    }

    if (from_date) {
      whereConditions.push(`q.created_at >= $${paramIndex}`);
      queryParams.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      whereConditions.push(`q.created_at <= $${paramIndex}`);
      queryParams.push(to_date);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(*)
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE ${whereClause}
    `;
    const countResult = await this.pool.query(countQuery, queryParams);
    const totalCount = countResult.rows.length > 0 ? parseInt(countResult.rows[0].count) : 0;

    // Get paginated results
    const dataQuery = `
      SELECT
        q.*,
        c.name as customer_name,
        c.email as customer_email,
        c.company as customer_company,
        COALESCE(ic.item_count, 0) as item_count
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      LEFT JOIN (
        SELECT quotation_id, COUNT(*)::int as item_count
        FROM quotation_items
        GROUP BY quotation_id
      ) ic ON ic.quotation_id = q.id
      WHERE ${whereClause}
      ORDER BY ${sortColumn === 'customer_name' ? 'c.name' : 'q.' + sortColumn} ${order}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const result = await this.pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      quotations: result.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / limit)
      }
    };
  }

  /**
   * Enhanced search across multiple fields
   * Searches: quote numbers, customer info, products/SKUs in line items, internal notes
   * @param {object} options - Search options
   * @returns {Promise<{quotations: Array, pagination: object}>}
   */
  async searchQuotes(options = {}) {
    const {
      search = '',
      status,
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    if (!search || search.trim().length < 2) {
      // If no search term, fall back to regular getQuotes
      return this.getQuotes(options);
    }

    const searchTerm = search.trim().toLowerCase();
    const offset = (page - 1) * limit;
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Build the search query with match type detection
    const searchQuery = `
      WITH matched_quotes AS (
        SELECT
          q.id,
          q.quote_number,
          q.quotation_number,
          q.customer_id,
          q.status,
          q.subtotal_cents,
          q.discount_percent,
          q.discount_cents,
          q.tax_rate,
          q.tax_cents,
          q.total_cents,
          q.gross_profit_cents,
          q.notes,
          q.internal_notes,
          q.terms,
          q.expires_at,
          q.created_at,
          q.updated_at,
          q.created_by,
          q.modified_by,
          q.delivery_address,
          q.delivery_city,
          q.delivery_date,
          q.sales_rep_name,
          q.priority_level,
          c.name as customer_name,
          c.email as customer_email,
          c.phone as customer_phone,
          c.company as customer_company,
          COALESCE(ic.item_count, 0) as item_count,
          -- Determine which field matched
          CASE
            WHEN LOWER(q.quote_number) LIKE $1 THEN 'quote_number'
            WHEN LOWER(q.quotation_number) LIKE $1 THEN 'quote_number'
            WHEN LOWER(c.name) LIKE $1 THEN 'customer_name'
            WHEN LOWER(c.email) LIKE $1 THEN 'customer_email'
            WHEN LOWER(c.phone) LIKE $1 THEN 'customer_phone'
            WHEN LOWER(c.company) LIKE $1 THEN 'customer_company'
            WHEN LOWER(q.internal_notes) LIKE $1 THEN 'internal_notes'
            WHEN LOWER(q.notes) LIKE $1 THEN 'notes'
            WHEN EXISTS (
              SELECT 1 FROM quotation_items qi
              LEFT JOIN products p ON qi.product_id = p.id
              WHERE qi.quotation_id = q.id
              AND (
                LOWER(qi.model) LIKE $1 OR
                LOWER(qi.manufacturer) LIKE $1 OR
                LOWER(qi.description) LIKE $1 OR
                LOWER(p.model) LIKE $1
              )
            ) THEN 'product'
            ELSE 'other'
          END as match_type,
          -- Get the matched product info if applicable
          (
            SELECT json_agg(json_build_object(
              'model', COALESCE(qi.model, p.model),
              'manufacturer', COALESCE(qi.manufacturer, p.manufacturer)
            ))
            FROM quotation_items qi
            LEFT JOIN products p ON qi.product_id = p.id
            WHERE qi.quotation_id = q.id
            AND (
              LOWER(qi.model) LIKE $1 OR
              LOWER(qi.manufacturer) LIKE $1 OR
              LOWER(qi.description) LIKE $1 OR
              LOWER(p.model) LIKE $1
            )
          ) as matched_products
        FROM quotations q
        LEFT JOIN customers c ON q.customer_id = c.id
        LEFT JOIN (
          SELECT quotation_id, COUNT(*)::int as item_count
          FROM quotation_items
          GROUP BY quotation_id
        ) ic ON ic.quotation_id = q.id
        WHERE (
          -- Quote number search (with flexible matching)
          LOWER(q.quote_number) LIKE $1 OR
          LOWER(q.quotation_number) LIKE $1 OR
          -- Customer info search
          LOWER(c.name) LIKE $1 OR
          LOWER(c.email) LIKE $1 OR
          LOWER(c.phone) LIKE $1 OR
          LOWER(c.company) LIKE $1 OR
          -- Internal notes search
          LOWER(q.internal_notes) LIKE $1 OR
          LOWER(q.notes) LIKE $1 OR
          -- Product/model search in line items
          EXISTS (
            SELECT 1 FROM quotation_items qi
            LEFT JOIN products p ON qi.product_id = p.id
            WHERE qi.quotation_id = q.id
            AND (
              LOWER(qi.model) LIKE $1 OR
              LOWER(qi.manufacturer) LIKE $1 OR
              LOWER(qi.description) LIKE $1 OR
              LOWER(p.model) LIKE $1
            )
          )
        )
        ${status ? 'AND q.status = $2' : ''}
      )
      SELECT * FROM matched_quotes
      ORDER BY
        CASE match_type
          WHEN 'quote_number' THEN 1
          WHEN 'customer_name' THEN 2
          WHEN 'product' THEN 3
          ELSE 4
        END,
        created_at ${order}
      LIMIT $${status ? '3' : '2'} OFFSET $${status ? '4' : '3'}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT q.id) as total
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE (
        LOWER(q.quote_number) LIKE $1 OR
        LOWER(q.quotation_number) LIKE $1 OR
        LOWER(c.name) LIKE $1 OR
        LOWER(c.email) LIKE $1 OR
        LOWER(c.phone) LIKE $1 OR
        LOWER(c.company) LIKE $1 OR
        LOWER(q.internal_notes) LIKE $1 OR
        LOWER(q.notes) LIKE $1 OR
        EXISTS (
          SELECT 1 FROM quotation_items qi
          LEFT JOIN products p ON qi.product_id = p.id
          WHERE qi.quotation_id = q.id
          AND (
            LOWER(qi.model) LIKE $1 OR
            LOWER(qi.manufacturer) LIKE $1 OR
            LOWER(qi.description) LIKE $1 OR
            LOWER(p.model) LIKE $1
          )
        )
      )
      ${status ? 'AND q.status = $2' : ''}
    `;

    const searchPattern = `%${searchTerm}%`;
    const searchParams = status
      ? [searchPattern, status, limit, offset]
      : [searchPattern, limit, offset];
    const countParams = status
      ? [searchPattern, status]
      : [searchPattern];

    try {
      const [countResult, searchResult] = await Promise.all([
        this.pool.query(countQuery, countParams),
        this.pool.query(searchQuery, searchParams)
      ]);

      const totalCount = countResult.rows.length > 0 ? parseInt(countResult.rows[0].total) : 0;

      // Format results with match info
      const quotations = searchResult.rows.map(row => ({
        ...row,
        search_match: {
          type: row.match_type,
          field: this.getMatchFieldLabel(row.match_type),
          matched_products: row.matched_products || null
        }
      }));

      return {
        quotations,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalCount / limit)
        },
        search_info: {
          term: search,
          fields_searched: [
            'quote_number', 'customer_name', 'customer_email',
            'customer_phone', 'product_model',
            'internal_notes', 'notes'
          ]
        }
      };
    } catch (error) {
      console.error('Search error:', error);
      throw error;
    }
  }

  /**
   * Get human-readable label for match type
   */
  getMatchFieldLabel(matchType) {
    const labels = {
      'quote_number': 'Quote Number',
      'customer_name': 'Customer Name',
      'customer_email': 'Customer Email',
      'customer_phone': 'Customer Phone',
      'customer_company': 'Company',
      'internal_notes': 'Internal Notes',
      'notes': 'Notes',
      'product': 'Product/SKU',
      'other': 'Other'
    };
    return labels[matchType] || matchType;
  }

  /**
   * Get quote by ID with items and customer info
   * @param {number} id - Quote ID
   * @returns {Promise<object|null>}
   */
  async getQuoteById(id) {
    const quoteResult = await this.pool.query(`
      SELECT
        q.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.address as customer_address,
        c.company as customer_company,
        c.city as customer_city,
        c.province as customer_province,
        c.postal_code as customer_postal_code
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.id = $1
    `, [id]);

    if (quoteResult.rows.length === 0) {
      return null;
    }

    const itemsResult = await this.pool.query(
      'SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY id',
      [id]
    );

    const quote = quoteResult.rows[0];
    quote.items = itemsResult.rows;

    return quote;
  }

  /**
   * Create a new quote with items
   * @param {object} quoteData - Quote data including items
   * @returns {Promise<object>}
   */
  async createQuote(quoteData) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const {
        customer_id,
        discount_percent = 0,
        tax_rate = 13,
        notes,
        internal_notes = '',
        terms,
        status = 'DRAFT',
        items = [],
        expires_at: providedExpiresAt,
        quote_expiry_date,
        // Template flag - templates don't require customer
        is_template = false,
        // Quote protection
        hide_model_numbers = false,
        watermark_text = '',
        watermark_enabled = true,
        // Delivery & Installation
        delivery_address = '',
        delivery_city = '',
        delivery_postal_code = '',
        delivery_date = null,
        delivery_time_slot = '',
        delivery_instructions = '',
        installation_required = false,
        installation_type = '',
        haul_away_required = false,
        haul_away_items = '',
        // Sales & Commission
        sales_rep_name = '',
        commission_percent = 0,
        referral_source = '',
        referral_name = '',
        // Customer Experience
        priority_level = 'standard',
        special_instructions = '',
        payment_method = '',
        deposit_required = false,
        deposit_amount_cents = 0,
        // Created by
        created_by = 'User',
        // Tenant context (for Skulytics override lookups)
        tenant_id = null
      } = quoteData;

      // ============================================
      // VALIDATION: Customer is required for quotes (not templates)
      // ============================================
      if (!is_template && !customer_id) {
        throw new Error('Customer is required. Please select a customer before saving the quote.');
      }

      // Validate customer exists if provided
      if (customer_id) {
        const customerCheck = await client.query(
          'SELECT id FROM customers WHERE id = $1',
          [customer_id]
        );
        if (customerCheck.rows.length === 0) {
          throw new Error('Selected customer not found. Please select a valid customer.');
        }
      }

      // Calculate totals from items (the source of truth)
      const calculatedTotals = this.calculateTotals(items, discount_percent, tax_rate);
      const {
        subtotal_cents,
        discount_cents,
        tax_cents,
        total_cents,
        gross_profit_cents
      } = calculatedTotals;

      // Generate quote number (pass client for transaction safety)
      const quote_number = await this.generateQuoteNumber(client);

      // Set expiration date - use quote_expiry_date, expires_at, or default to 30 days
      let expires_at;
      const expirySource = quote_expiry_date || providedExpiresAt;
      if (expirySource) {
        expires_at = new Date(expirySource);
        // Validate the date is valid
        if (isNaN(expires_at.getTime())) {
          expires_at = new Date();
          expires_at.setDate(expires_at.getDate() + 30);
        }
      } else {
        expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + 30);
      }

      // Calculate commission amount
      const commission_amount_cents = Math.round(total_cents * (commission_percent / 100));

      const quoteResult = await client.query(
        `INSERT INTO quotations (
          quote_number, customer_id, status, subtotal_cents, discount_percent,
          discount_cents, tax_rate, tax_cents, total_cents, gross_profit_cents,
          notes, internal_notes, terms, expires_at,
          hide_model_numbers, watermark_text, watermark_enabled,
          delivery_address, delivery_city, delivery_postal_code, delivery_date,
          delivery_time_slot, delivery_instructions, installation_required,
          installation_type, haul_away_required, haul_away_items,
          sales_rep_name, commission_percent, commission_amount_cents,
          referral_source, referral_name, priority_level, special_instructions,
          payment_method, deposit_required, deposit_amount_cents, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                  $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
                  $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38)
        RETURNING *`,
        [
          quote_number, customer_id, status, subtotal_cents, discount_percent,
          discount_cents, tax_rate, tax_cents, total_cents, gross_profit_cents,
          notes, internal_notes, terms, expires_at,
          hide_model_numbers, watermark_text, watermark_enabled,
          delivery_address || null, delivery_city || null, delivery_postal_code || null, delivery_date || null,
          delivery_time_slot || null, delivery_instructions || null, installation_required,
          installation_type || null, haul_away_required, haul_away_items || null,
          sales_rep_name || null, commission_percent, commission_amount_cents,
          referral_source || null, referral_name || null, priority_level, special_instructions || null,
          payment_method || null, deposit_required, deposit_amount_cents, created_by
        ]
      );

      if (quoteResult.rows.length === 0) {
        throw new Error('Failed to create quotation — INSERT returned no rows');
      }
      const quotation_id = quoteResult.rows[0].id;

      // ── Skulytics enrichment (snapshot at quote time) ──────────
      let skulyticsWarnings = [];
      let skulyticsData = null;
      if (items.length > 0) {
        const productIds = items.filter(i => i.product_id).map(i => i.product_id);
        if (productIds.length > 0) {
          try {
            const enrichment = await this._fetchSkulyticsData(client, productIds, tenant_id);
            skulyticsData = enrichment.snapshots;
            skulyticsWarnings = enrichment.warnings;
          } catch (skulyticsErr) {
            // Log but do not block quote creation
            console.error('[Skulytics] Enrichment failed, continuing without snapshots:', skulyticsErr.message);
          }
        }
      }

      // Insert items using batch INSERT (with Skulytics snapshots when available)
      if (items.length > 0) {
        await this.insertQuoteItems(client, quotation_id, items, skulyticsData);
      }

      // Log creation event with comprehensive metadata
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, description, user_name, metadata, activity_category)
        VALUES ($1, 'CREATED', $2, $3, $4, 'lifecycle')
      `, [
        quotation_id,
        `Quote ${quote_number} created with ${items.length} item(s)`,
        created_by,
        JSON.stringify({
          quoteNumber: quote_number,
          itemCount: items.length,
          totalCents: total_cents,
          customerId: customer_id
        })
      ]);

      await client.query('COMMIT');

      const createdQuote = quoteResult.rows[0];

      // Attach Skulytics warnings (discontinued products, etc.)
      if (skulyticsWarnings.length > 0) {
        createdQuote.warnings = skulyticsWarnings;
      }

      // Check margin and auto-trigger approval if needed (post-commit)
      if (created_by && status === 'DRAFT') {
        try {
          const marginCheck = await this.checkMarginApproval(
            { margin_percent: calculatedTotals.margin_percent },
            created_by
          );

          if (marginCheck.requiresApproval) {
            // Create approval request (this runs outside the main transaction)
            await this.createAutoApprovalRequest(
              null, // Use pool, not transaction client
              createdQuote.id,
              marginCheck.user,
              marginCheck.marginPercent,
              marginCheck.threshold
            );

            // Update the returned quote object to reflect new status
            createdQuote.status = 'PENDING_APPROVAL';
            createdQuote.approval_required = true;
            createdQuote.approval_reason = marginCheck.reason;
          }
        } catch (marginErr) {
          console.error('Error checking margin approval:', marginErr.message);
          // Don't fail the entire operation if margin check fails
        }
      }

      // Send quote created notification (async, don't block)
      if (created_by) {
        // created_by is a name, not an email - try to find the user's email
        let creatorEmail = null;
        if (created_by.includes('@')) {
          // It's already an email
          creatorEmail = created_by;
        } else {
          // Look up email by name
          try {
            const userResult = await this.pool.query(`
              SELECT email FROM users
              WHERE CONCAT(first_name, ' ', last_name) ILIKE $1
                 OR email ILIKE $1
              LIMIT 1
            `, [created_by]);
            if (userResult.rows.length > 0) {
              creatorEmail = userResult.rows[0].email;
            }
          } catch (lookupErr) {
          }
        }

        if (creatorEmail) {
          emailService.sendQuoteCreatedEmail(createdQuote.id, creatorEmail).catch(err => {
            console.error('Failed to send quote created email:', err.message);
          });
        }
      }

      return createdQuote;

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Update an existing quote with items
   * @param {number} id - Quote ID
   * @param {object} quoteData - Updated quote data
   * @returns {Promise<object|null>}
   */
  async updateQuote(id, quoteData) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // ============================================
      // First, get the existing quote to validate customer requirement
      // ============================================
      const existingQuote = await client.query(
        'SELECT customer_id, status FROM quotations WHERE id = $1',
        [id]
      );

      if (existingQuote.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      // ============================================
      // Create version snapshot BEFORE making changes
      // ============================================
      try {
        await this.createVersionSnapshotInTransaction(client, id, 'items_updated', 'Quote updated');
      } catch (versionErr) {
        // Log but don't fail the update if versioning fails
        console.warn('Failed to create version snapshot:', versionErr.message);
      }

      const {
        customer_id: existingCustomerId,
        is_template: existingIsTemplate
      } = existingQuote.rows[0];

      const {
        discount_percent = 0,
        tax_rate = 13,
        notes,
        internal_notes = '',
        terms,
        items = [],
        quote_expiry_date,
        expires_at: providedExpiresAt,
        // Customer ID can be updated
        customer_id,
        // Template flag
        is_template = existingIsTemplate || false,
        // Quote protection
        hide_model_numbers,
        watermark_text,
        watermark_enabled,
        // Delivery & Installation
        delivery_address,
        delivery_city,
        delivery_postal_code,
        delivery_date,
        delivery_time_slot,
        delivery_instructions,
        installation_required,
        installation_type,
        haul_away_required,
        haul_away_items,
        // Sales & Commission
        sales_rep_name,
        commission_percent,
        referral_source,
        referral_name,
        // Customer Experience
        priority_level,
        special_instructions,
        payment_method,
        deposit_required,
        deposit_amount_cents,
        // Modified by
        modified_by = 'User',
        // Tenant context (for Skulytics override lookups)
        tenant_id = null
      } = quoteData;

      // ============================================
      // VALIDATION: Customer is required for quotes (not templates)
      // ============================================
      // Determine the final customer_id (use new value if provided, otherwise existing)
      const finalCustomerId = customer_id !== undefined ? customer_id : existingCustomerId;

      // Validate customer requirement
      if (!is_template && !finalCustomerId) {
        throw new Error('Customer is required. Please select a customer before saving the quote.');
      }

      // Validate customer exists if provided
      if (finalCustomerId) {
        const customerCheck = await client.query(
          'SELECT id FROM customers WHERE id = $1',
          [finalCustomerId]
        );
        if (customerCheck.rows.length === 0) {
          throw new Error('Selected customer not found. Please select a valid customer.');
        }
      }

      // Calculate totals from items (the source of truth)
      const calculatedTotals = this.calculateTotals(items, discount_percent, tax_rate);
      const {
        subtotal_cents,
        discount_cents,
        tax_cents,
        total_cents,
        gross_profit_cents
      } = calculatedTotals;

      // Calculate commission amount
      const commission_amount_cents = Math.round(total_cents * ((commission_percent || 0) / 100));

      // Handle expiry date
      let expires_at = null;
      const expirySource = quote_expiry_date || providedExpiresAt;
      if (expirySource) {
        expires_at = new Date(expirySource);
        if (isNaN(expires_at.getTime())) {
          expires_at = null;
        }
      }

      const result = await client.query(
        `UPDATE quotations SET
          customer_id = COALESCE($1, customer_id),
          subtotal_cents = $2,
          discount_percent = $3,
          discount_cents = $4,
          tax_rate = $5,
          tax_cents = $6,
          total_cents = $7,
          gross_profit_cents = $8,
          notes = $9,
          internal_notes = $10,
          terms = $11,
          updated_at = CURRENT_TIMESTAMP,
          expires_at = COALESCE($12, expires_at),
          hide_model_numbers = COALESCE($13, hide_model_numbers),
          watermark_text = COALESCE($14, watermark_text),
          watermark_enabled = COALESCE($15, watermark_enabled),
          delivery_address = $16,
          delivery_city = $17,
          delivery_postal_code = $18,
          delivery_date = $19,
          delivery_time_slot = $20,
          delivery_instructions = $21,
          installation_required = COALESCE($22, installation_required),
          installation_type = $23,
          haul_away_required = COALESCE($24, haul_away_required),
          haul_away_items = $25,
          sales_rep_name = $26,
          commission_percent = COALESCE($27, commission_percent),
          commission_amount_cents = $28,
          referral_source = $29,
          referral_name = $30,
          priority_level = COALESCE($31, priority_level),
          special_instructions = $32,
          payment_method = $33,
          deposit_required = COALESCE($34, deposit_required),
          deposit_amount_cents = COALESCE($35, deposit_amount_cents),
          modified_by = $36
        WHERE id = $37 RETURNING *`,
        [
          finalCustomerId || null,
          subtotal_cents, discount_percent, discount_cents, tax_rate, tax_cents,
          total_cents, gross_profit_cents, notes, internal_notes, terms,
          expires_at, hide_model_numbers, watermark_text, watermark_enabled,
          delivery_address || null, delivery_city || null, delivery_postal_code || null,
          delivery_date || null, delivery_time_slot || null, delivery_instructions || null,
          installation_required, installation_type || null, haul_away_required, haul_away_items || null,
          sales_rep_name || null, commission_percent, commission_amount_cents,
          referral_source || null, referral_name || null, priority_level, special_instructions || null,
          payment_method || null, deposit_required, deposit_amount_cents, modified_by, id
        ]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      // ── Preserve existing Skulytics snapshots before delete ──
      const { rows: existingItemRows } = await client.query(
        `SELECT product_id, skulytics_id, skulytics_snapshot,
                discontinued_acknowledged_by, discontinued_acknowledged_at
         FROM quotation_items
         WHERE quotation_id = $1 AND skulytics_snapshot IS NOT NULL`,
        [id]
      );
      const preservedSnapshots = new Map();
      for (const row of existingItemRows) {
        preservedSnapshots.set(row.product_id, {
          skulytics_id: row.skulytics_id,
          snapshot: row.skulytics_snapshot,
          discontinued_acknowledged_by: row.discontinued_acknowledged_by,
          discontinued_acknowledged_at: row.discontinued_acknowledged_at,
        });
      }

      // Delete old items and insert new ones
      await client.query('DELETE FROM quotation_items WHERE quotation_id = $1', [id]);

      if (items.length > 0) {
        // For items that already had snapshots, re-use them (write-once rule).
        // For new items whose product has a skulytics_id, build fresh snapshots.
        const newProductIds = items
          .filter(i => i.product_id && !preservedSnapshots.has(i.product_id))
          .map(i => i.product_id);

        let newSkulyticsData = new Map();
        if (newProductIds.length > 0) {
          try {
            const enrichment = await this._fetchSkulyticsData(client, newProductIds, tenant_id);
            newSkulyticsData = enrichment.snapshots;
          } catch (skulyticsErr) {
            console.error('[Skulytics] Enrichment on update failed:', skulyticsErr.message);
          }
        }

        // Merge: preserved snapshots take priority over freshly-built ones
        const mergedData = new Map([...newSkulyticsData, ...preservedSnapshots]);
        await this.insertQuoteItems(client, id, items, mergedData);
      }

      // Log update event with metadata
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, description, user_name, metadata, activity_category)
        VALUES ($1, 'UPDATED', $2, $3, $4, 'lifecycle')
      `, [
        id,
        `Quote updated (${items.length} item(s), total: $${(total_cents / 100).toFixed(2)})`,
        modified_by,
        JSON.stringify({
          itemCount: items.length,
          totalCents: total_cents,
          discountPercent: discount_percent
        })
      ]);

      await client.query('COMMIT');

      const updatedQuote = result.rows[0];

      // Check margin and auto-trigger approval if needed (post-commit)
      // Only check if quote is in DRAFT status (not already pending approval)
      if (modified_by && updatedQuote.status === 'DRAFT') {
        try {
          const marginCheck = await this.checkMarginApproval(
            { margin_percent: calculatedTotals.margin_percent },
            modified_by
          );

          if (marginCheck.requiresApproval) {
            // Create approval request
            await this.createAutoApprovalRequest(
              null,
              id,
              marginCheck.user,
              marginCheck.marginPercent,
              marginCheck.threshold
            );

            // Update the returned quote object
            updatedQuote.status = 'PENDING_APPROVAL';
            updatedQuote.approval_required = true;
            updatedQuote.approval_reason = marginCheck.reason;
          }
        } catch (marginErr) {
          console.error('Error checking margin approval on update:', marginErr.message);
        }
      }

      return updatedQuote;

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Fetch Skulytics global product + tenant override data for a set of product IDs.
   * Returns a Map of product_id -> { skulytics_id, snapshot } plus warnings for discontinued items.
   *
   * @param {object} client   - Transaction-scoped DB client
   * @param {number[]} productIds - Product IDs to look up
   * @param {number|null} tenantId - Tenant ID for override lookups (nullable)
   * @returns {Promise<{snapshots: Map, warnings: Array}>}
   */
  async _fetchSkulyticsData(client, productIds, tenantId) {
    const result = { snapshots: new Map(), warnings: [] };
    if (!productIds || productIds.length === 0) return result;

    // 1. Which products have a skulytics_id?
    const { rows: productRows } = await client.query(
      `SELECT id, skulytics_id FROM products WHERE id = ANY($1) AND skulytics_id IS NOT NULL`,
      [productIds]
    );
    if (productRows.length === 0) return result;

    const skulyticsIds = productRows.map(p => p.skulytics_id);
    const productToSkulytics = new Map(productRows.map(p => [p.id, p.skulytics_id]));

    // 2. Fetch global catalogue rows
    const { rows: globalProducts } = await client.query(
      `SELECT * FROM global_skulytics_products WHERE skulytics_id = ANY($1)`,
      [skulyticsIds]
    );
    const globalMap = new Map(globalProducts.map(g => [g.skulytics_id, g]));

    // 3. Fetch tenant overrides (if tenant context exists)
    let overrideMap = new Map();
    if (tenantId) {
      const { rows: overrides } = await client.query(
        `SELECT * FROM tenant_product_overrides WHERE tenant_id = $1 AND skulytics_id = ANY($2)`,
        [tenantId, skulyticsIds]
      );
      overrideMap = new Map(overrides.map(o => [o.skulytics_id, o]));
    }

    // 4. Build snapshots & collect warnings
    for (const [productId, skulyticsId] of productToSkulytics) {
      const globalProduct = globalMap.get(skulyticsId);
      if (!globalProduct) continue;

      try {
        const override = overrideMap.get(skulyticsId) || null;
        const snapshot = buildQuoteSnapshot(globalProduct, override);
        result.snapshots.set(productId, { skulytics_id: skulyticsId, snapshot });

        if (globalProduct.is_discontinued) {
          result.warnings.push({
            product_id: productId,
            skulytics_id: skulyticsId,
            type: 'DISCONTINUED_PRODUCT',
            message: 'This product has been discontinued by the manufacturer. Manager acknowledgement required.',
            requires_acknowledgement: true,
          });
        }
      } catch (err) {
        if (err instanceof SnapshotBuildError) {
          console.error(`[Skulytics] Snapshot build failed for ${skulyticsId}:`, err.message);
        } else {
          throw err;
        }
      }
    }

    return result;
  }

  /**
   * Insert quote items in batch (with optional Skulytics snapshot data).
   *
   * @param {object} client       - Database client
   * @param {number} quotationId  - Quote ID
   * @param {Array}  items        - Items to insert
   * @param {Map|null} [skulyticsData=null] - Map of product_id -> { skulytics_id, snapshot, ... }
   */
  async insertQuoteItems(client, quotationId, items, skulyticsData = null) {
    const valuesPerRow = 18;
    const placeholders = items.map((_, i) =>
      `(${Array.from({length: valuesPerRow}, (_, j) => `$${i * valuesPerRow + j + 1}`).join(', ')})`
    ).join(', ');

    const values = items.flatMap(item => {
      const skuData = skulyticsData?.get(item.product_id) || null;
      return [
        quotationId,
        item.product_id,
        item.manufacturer || '',
        item.model || item.description,
        item.description,
        item.category || '',
        item.quantity || 1,
        item.cost_cents || Math.round((item.cost || 0) * 100),
        item.msrp_cents || Math.round((item.msrp || 0) * 100),
        item.sell_cents || Math.round((item.sell || 0) * 100),
        item.line_total_cents || Math.round((item.sell || 0) * (item.quantity || 1) * 100),
        item.line_profit_cents || Math.round(((item.sell || 0) - (item.cost || 0)) * (item.quantity || 1) * 100),
        item.margin_bp || 0,
        item.item_notes || item.notes || '',
        // Skulytics columns
        skuData?.skulytics_id || null,
        skuData?.snapshot ? JSON.stringify(skuData.snapshot) : null,
        // Discontinued acknowledgement (preserved from prior version)
        skuData?.discontinued_acknowledged_by || null,
        skuData?.discontinued_acknowledged_at || null,
      ];
    });

    await client.query(
      `INSERT INTO quotation_items (
        quotation_id, product_id, manufacturer, model, description, category,
        quantity, cost_cents, msrp_cents, sell_cents, line_total_cents,
        line_profit_cents, margin_bp, item_notes,
        skulytics_id, skulytics_snapshot,
        discontinued_acknowledged_by, discontinued_acknowledged_at
      ) VALUES ${placeholders}`,
      values
    );
  }

  /**
   * Delete a quote and its items
   * @param {number} id - Quote ID
   * @returns {Promise<object|null>}
   */
  async deleteQuote(id) {
    await this.pool.query('DELETE FROM quotation_items WHERE quotation_id = $1', [id]);
    const result = await this.pool.query(
      'DELETE FROM quotations WHERE id = $1 RETURNING *',
      [id]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Status transition rules
   */
  static STATUS_TRANSITIONS = {
    DRAFT: ['SENT', 'LOST', 'PENDING_APPROVAL'],
    SENT: ['WON', 'LOST', 'DRAFT', 'PENDING_APPROVAL'],
    WON: ['DRAFT'],  // Allow reopening
    LOST: ['DRAFT'], // Allow reopening
    PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'DRAFT'],
    APPROVED: ['SENT', 'DRAFT'],
    REJECTED: ['DRAFT']
  };

  /**
   * Validate status transition
   * @param {string} currentStatus - Current quote status
   * @param {string} newStatus - Desired new status
   * @returns {{valid: boolean, reason?: string}}
   */
  validateStatusTransition(currentStatus, newStatus) {
    const allowedTransitions = QuoteService.STATUS_TRANSITIONS[currentStatus] || [];

    if (!allowedTransitions.includes(newStatus)) {
      return {
        valid: false,
        reason: `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowedTransitions.join(', ') || 'none'}`
      };
    }

    return { valid: true };
  }

  /**
   * Update quote status with validation and date tracking
   * @param {number} id - Quote ID
   * @param {string} newStatus - New status
   * @param {object} options - Additional options
   * @param {string} options.lostReason - Reason for losing quote (if status is LOST)
   * @param {boolean} options.skipValidation - Skip transition validation (for admin use)
   * @returns {Promise<object|null>}
   */
  async updateStatus(id, newStatus, options = {}) {
    const validStatuses = ['DRAFT', 'SENT', 'WON', 'LOST', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'];

    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    // Get current quote to validate transition
    const currentQuote = await this.getQuoteById(id);
    if (!currentQuote) {
      return null;
    }

    const currentStatus = currentQuote.status;

    // Validate transition unless skipped
    if (!options.skipValidation) {
      const validation = this.validateStatusTransition(currentStatus, newStatus);
      if (!validation.valid) {
        throw new Error(validation.reason);
      }

      // Additional validation: Can't mark as SENT without a customer
      if (newStatus === 'SENT' && !currentQuote.customer_id) {
        throw new Error('Cannot mark as Sent without a customer assigned');
      }
    }

    // Build the update query with appropriate date fields
    let updateFields = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    let values = [newStatus];
    let paramIndex = 2;

    // Set appropriate date based on new status
    if (newStatus === 'SENT' && currentStatus !== 'SENT') {
      updateFields.push(`sent_at = CURRENT_TIMESTAMP`);
    } else if (newStatus === 'WON') {
      updateFields.push(`won_at = CURRENT_TIMESTAMP`);
    } else if (newStatus === 'LOST') {
      updateFields.push(`lost_at = CURRENT_TIMESTAMP`);
      if (options.lostReason) {
        updateFields.push(`lost_reason = $${paramIndex}`);
        values.push(options.lostReason);
        paramIndex++;
      }
    } else if (newStatus === 'DRAFT') {
      // Clear status dates when reopening
      updateFields.push(`won_at = NULL`, `lost_at = NULL`);
    }

    values.push(id);

    const result = await this.pool.query(
      `UPDATE quotations SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length > 0) {
      // Create descriptive event message
      let eventDescription = `Status changed from ${currentStatus} to ${newStatus}`;
      if (newStatus === 'LOST' && options.lostReason) {
        eventDescription += `. Reason: ${options.lostReason}`;
      }

      // Log status change event
      await this.pool.query(`
        INSERT INTO quote_events (quotation_id, event_type, description)
        VALUES ($1, $2, $3)
      `, [id, 'STATUS_CHANGED', eventDescription]);

      // Send email notifications for status changes (async, don't block)
      const quote = result.rows[0];
      const recipientEmail = quote.created_by || process.env.EMAIL_FROM;

      if (newStatus === 'WON' && recipientEmail) {
        emailService.sendQuoteWonEmail(id, recipientEmail).catch(err => {
          console.error('Failed to send quote won email:', err.message);
        });

        // Trigger auto-invoice generation (async, don't block status update)
        this.triggerAutoInvoice(id).catch(err => {
          console.error('Auto-invoice trigger failed:', err.message);
        });
      } else if (newStatus === 'LOST' && recipientEmail) {
        emailService.sendQuoteLostEmail(id, recipientEmail, options.lostReason).catch(err => {
          console.error('Failed to send quote lost email:', err.message);
        });
      }
    }

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get allowed status transitions for a quote
   * @param {string} currentStatus - Current status
   * @returns {string[]} Array of allowed next statuses
   */
  getAllowedTransitions(currentStatus) {
    return QuoteService.STATUS_TRANSITIONS[currentStatus] || [];
  }

  /**
   * Get quote events/history with enhanced data
   * @param {number} quoteId - Quote ID
   * @param {object} options - Filter options
   * @returns {Promise<Array>}
   */
  async getQuoteEvents(quoteId, options = {}) {
    const { limit = 100, includeInternal = true } = options;

    let whereClause = 'quotation_id = $1';
    if (!includeInternal) {
      whereClause += ' AND (is_internal = FALSE OR is_internal IS NULL)';
    }

    const result = await this.pool.query(`
      SELECT
        id,
        quotation_id,
        event_type,
        description,
        user_name,
        user_id,
        metadata,
        is_internal,
        activity_category,
        created_at
      FROM quote_events
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $2
    `, [quoteId, limit]);

    // Add icon for each event
    const iconMap = {
      CREATED: '✨',
      UPDATED: '✏️',
      DELETED: '🗑️',
      STATUS_CHANGED: '🔄',
      SENT: '📤',
      WON: '🏆',
      LOST: '❌',
      EMAIL_SENT: '📧',
      CUSTOMER_VIEWED: '👀',
      FOLLOW_UP_SCHEDULED: '📅',
      CUSTOMER_CONTACTED: '📞',
      PRICE_ADJUSTED: '💰',
      DISCOUNT_APPLIED: '🏷️',
      APPROVAL_REQUESTED: '⏳',
      APPROVED: '✅',
      REJECTED: '❌',
      NOTE_ADDED: '📝',
      INTERNAL_NOTE: '🔒',
      PDF_GENERATED: '📄',
      PDF_DOWNLOADED: '⬇️'
    };

    return result.rows.map(row => ({
      ...row,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
      icon: iconMap[row.event_type] || '📌'
    }));
  }

  /**
   * Trigger auto-invoice generation for a won quote
   * Makes HTTP call to invoice API to trigger auto-invoice logic
   * @param {number} quoteId - Quote ID
   */
  async triggerAutoInvoice(quoteId) {
    try {
      const AutoInvoiceService = require('./AutoInvoiceService');
      const InvoiceService = require('./InvoiceService');

      // Get invoice service instance (reuse pool from this service)
      const invoiceService = new InvoiceService(this.pool);
      const autoInvoiceService = new AutoInvoiceService(this.pool, invoiceService);

      const result = await autoInvoiceService.onQuoteWon(quoteId);

      if (result.triggered) {
        // Log the auto-invoice event
        await this.addQuoteEvent(quoteId, 'INVOICE_GENERATED', `Invoice #${result.invoice?.invoice_number || 'N/A'} auto-generated`, {
          metadata: { invoiceId: result.invoice?.id, autoGenerated: true },
          isInternal: false
        });
        console.log(`Auto-invoice generated for quote ${quoteId}: Invoice #${result.invoice?.invoice_number}`);
      } else {
        console.log(`Auto-invoice not triggered for quote ${quoteId}: ${result.reason}`);
      }

      return result;
    } catch (error) {
      console.error(`Auto-invoice failed for quote ${quoteId}:`, error.message);
      // Don't throw - this is a non-critical operation
      return { triggered: false, error: error.message };
    }
  }

  /**
   * Add event to quote history
   * @param {number} quoteId - Quote ID
   * @param {string} eventType - Event type
   * @param {string} description - Event description
   * @param {object} options - Additional options
   * @returns {Promise<object>}
   */
  async addQuoteEvent(quoteId, eventType, description, options = {}) {
    const {
      userName = 'User',
      userId = null,
      metadata = {},
      isInternal = true,
      category = 'general'
    } = options;

    const result = await this.pool.query(`
      INSERT INTO quote_events (
        quotation_id, event_type, description, user_name, user_id,
        metadata, is_internal, activity_category
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      quoteId,
      eventType,
      description,
      userName,
      userId,
      JSON.stringify(metadata),
      isInternal,
      category
    ]);

    return result.rows[0];
  }

  /**
   * Log email sent activity
   */
  async logEmailSent(quoteId, recipientEmail, subject, userName = 'User') {
    return this.addQuoteEvent(quoteId, 'EMAIL_SENT', `Email sent to ${recipientEmail}`, {
      userName,
      metadata: { recipientEmail, subject, sentAt: new Date().toISOString() },
      isInternal: false,
      category: 'communication'
    });
  }

  /**
   * Log follow-up scheduled
   */
  async logFollowUp(quoteId, followUpDate, description, userName = 'User') {
    return this.addQuoteEvent(quoteId, 'FOLLOW_UP_SCHEDULED',
      `Follow-up scheduled for ${new Date(followUpDate).toLocaleDateString()}: ${description}`, {
        userName,
        metadata: { followUpDate, description },
        category: 'communication'
      });
  }

  /**
   * Log customer contacted
   */
  async logCustomerContact(quoteId, method, notes, userName = 'User') {
    return this.addQuoteEvent(quoteId, 'CUSTOMER_CONTACTED',
      `Customer contacted via ${method}${notes ? `: ${notes}` : ''}`, {
        userName,
        metadata: { method, notes },
        category: 'communication'
      });
  }

  /**
   * Clone a quote
   * Creates a new quote with copied line items and settings
   * @param {number} sourceQuoteId - ID of quote to clone
   * @param {object} options - Clone options
   * @param {number} options.newCustomerId - Customer ID for cloned quote (null = same customer)
   * @param {boolean} options.includeInternalNotes - Include internal notes in clone
   * @param {string} options.clonedBy - User who initiated the clone
   * @returns {Promise<object>} The newly created quote
   */
  async cloneQuote(sourceQuoteId, options = {}) {
    const {
      newCustomerId = null,
      includeInternalNotes = false,
      clonedBy = 'User'
    } = options;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Fetch source quote with all details
      const sourceQuote = await this.getQuoteById(sourceQuoteId);
      if (!sourceQuote) {
        throw new Error('Source quote not found');
      }

      // 2. Determine customer for new quote
      const customerId = newCustomerId !== null ? newCustomerId : sourceQuote.customer_id;

      // Validate customer exists if specified
      if (customerId) {
        const customerCheck = await client.query(
          'SELECT id, name FROM customers WHERE id = $1',
          [customerId]
        );
        if (customerCheck.rows.length === 0) {
          throw new Error('Selected customer not found');
        }
      }

      // 3. Generate new quote number (pass client for transaction safety)
      const quote_number = await this.generateQuoteNumber(client);

      // 4. Calculate new expiry date (30 days from now)
      const expires_at = new Date();
      expires_at.setDate(expires_at.getDate() + 30);

      // 5. Prepare items for new quote (copy from source)
      const items = (sourceQuote.items || []).map(item => ({
        product_id: item.product_id,
        sku: item.sku,
        manufacturer: item.manufacturer,
        model: item.model,
        description: item.description,
        quantity: item.quantity,
        cost_cents: item.cost_cents,
        sell_cents: item.unit_price_cents || item.sell_cents,
        unit_price_cents: item.unit_price_cents,
        cost: item.cost_cents ? item.cost_cents / 100 : item.cost,
        sell: item.unit_price_cents ? item.unit_price_cents / 100 : item.sell
      }));

      // 6. Calculate totals from items
      const calculatedTotals = this.calculateTotals(
        items,
        sourceQuote.discount_percent || 0,
        sourceQuote.tax_rate || 13
      );

      // 7. Create the new quote
      const quoteResult = await client.query(
        `INSERT INTO quotations (
          quote_number, customer_id, status, subtotal_cents, discount_percent,
          discount_cents, tax_rate, tax_cents, total_cents, gross_profit_cents,
          notes, internal_notes, terms, expires_at,
          hide_model_numbers, watermark_text, watermark_enabled,
          delivery_address, delivery_city, delivery_postal_code,
          delivery_time_slot, delivery_instructions, installation_required,
          installation_type, haul_away_required, haul_away_items,
          sales_rep_name, commission_percent, referral_source, referral_name,
          priority_level, special_instructions, payment_method,
          deposit_required, deposit_amount_cents, created_by
        ) VALUES (
          $1, $2, 'DRAFT', $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
          $30, $31, $32, $33, $34, $35
        )
        RETURNING *`,
        [
          quote_number,
          customerId,
          calculatedTotals.subtotal_cents,
          sourceQuote.discount_percent || 0,
          calculatedTotals.discount_cents,
          sourceQuote.tax_rate || 13,
          calculatedTotals.tax_cents,
          calculatedTotals.total_cents,
          calculatedTotals.gross_profit_cents,
          sourceQuote.notes || '',
          includeInternalNotes ? (sourceQuote.internal_notes || '') : '',
          sourceQuote.terms || '',
          expires_at,
          sourceQuote.hide_model_numbers || false,
          sourceQuote.watermark_text || '',
          sourceQuote.watermark_enabled !== false,
          sourceQuote.delivery_address || null,
          sourceQuote.delivery_city || null,
          sourceQuote.delivery_postal_code || null,
          sourceQuote.delivery_time_slot || null,
          sourceQuote.delivery_instructions || null,
          sourceQuote.installation_required || false,
          sourceQuote.installation_type || null,
          sourceQuote.haul_away_required || false,
          sourceQuote.haul_away_items || null,
          sourceQuote.sales_rep_name || null,
          sourceQuote.commission_percent || 0,
          sourceQuote.referral_source || null,
          sourceQuote.referral_name || null,
          sourceQuote.priority_level || 'standard',
          sourceQuote.special_instructions || null,
          sourceQuote.payment_method || null,
          sourceQuote.deposit_required || false,
          sourceQuote.deposit_amount_cents || 0,
          clonedBy
        ]
      );

      const newQuote = quoteResult.rows[0];
      const newQuoteId = newQuote.id;

      // 8. Copy quote items
      if (items.length > 0) {
        await this.insertQuoteItems(client, newQuoteId, items);
      }

      // 9. Log clone event on new quote
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, description, user_name, metadata, activity_category)
        VALUES ($1, 'CREATED', $2, $3, $4, 'lifecycle')
      `, [
        newQuoteId,
        `Quote ${quote_number} cloned from ${sourceQuote.quote_number || sourceQuote.quotation_number}`,
        clonedBy,
        JSON.stringify({
          source_quote_id: sourceQuoteId,
          source_quote_number: sourceQuote.quote_number || sourceQuote.quotation_number,
          items_count: items.length,
          total_cents: calculatedTotals.total_cents,
          customer_changed: newCustomerId !== null && newCustomerId !== sourceQuote.customer_id
        })
      ]);

      // 10. Log clone event on source quote
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, description, user_name, metadata, activity_category)
        VALUES ($1, 'NOTE_ADDED', $2, $3, $4, 'general')
      `, [
        sourceQuoteId,
        `Quote cloned as ${quote_number}`,
        clonedBy,
        JSON.stringify({
          cloned_quote_id: newQuoteId,
          cloned_quote_number: quote_number
        })
      ]);

      await client.query('COMMIT');

      // 11. Fetch complete new quote with customer info
      const completeQuote = await this.getQuoteById(newQuoteId);

      return {
        ...completeQuote,
        source_quote_number: sourceQuote.quote_number || sourceQuote.quotation_number
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // VERSION HISTORY METHODS
  // ============================================

  /**
   * Create a version snapshot before updating a quote
   * @param {number} quoteId - Quote ID
   * @param {string} changeType - Type of change (e.g., 'items_updated', 'customer_changed', 'price_adjusted')
   * @param {string} changeSummary - Human-readable summary of changes
   * @param {object} options - Additional options
   * @returns {Promise<object>} The created version record
   */
  async createVersionSnapshot(quoteId, changeType, changeSummary, options = {}) {
    // Use standalone pool queries (not in a transaction)
    return this.createVersionSnapshotInTransaction(null, quoteId, changeType, changeSummary, options);
  }

  /**
   * Create a version snapshot within an existing transaction
   * @param {object|null} client - Database client (null for standalone)
   * @param {number} quoteId - Quote ID
   * @param {string} changeType - Type of change
   * @param {string} changeSummary - Human-readable summary
   * @param {object} options - Additional options
   * @returns {Promise<object>} The created version record
   */
  async createVersionSnapshotInTransaction(client, quoteId, changeType, changeSummary, options = {}) {
    const { changedBy = 'User', changes = {} } = options;
    const db = client || this.pool; // Use client if in transaction, otherwise use pool

    // Get current quote state with items
    const quoteResult = await db.query(`
      SELECT q.*, c.name as customer_name
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.id = $1
    `, [quoteId]);

    if (quoteResult.rows.length === 0) {
      throw new Error('Quote not found');
    }
    const quote = quoteResult.rows[0];

    // Get items
    const itemsResult = await db.query(`
      SELECT * FROM quotation_items WHERE quotation_id = $1
    `, [quoteId]);
    quote.items = itemsResult.rows;

    // Get current version number
    const versionResult = await db.query(
      'SELECT COALESCE(MAX(version_number), 0) + 1 as next_version FROM quote_versions WHERE quotation_id = $1',
      [quoteId]
    );
    const versionNumber = versionResult.rows[0].next_version;

    // Create items snapshot
    const itemsSnapshot = (quote.items || []).map(item => ({
      product_id: item.product_id,
      sku: item.sku || item.model,
      manufacturer: item.manufacturer,
      model: item.model,
      description: item.description,
      quantity: item.quantity,
      cost_cents: item.cost_cents,
      unit_price_cents: item.sell_cents || item.unit_price_cents,
      line_total_cents: item.line_total_cents
    }));

    // Insert version record
    const result = await db.query(`
      INSERT INTO quote_versions (
        quotation_id, version_number, customer_id, customer_name, status,
        subtotal_cents, discount_percent, discount_cents, tax_rate, tax_cents,
        total_cents, gross_profit_cents, notes, terms, expires_at,
        delivery_address, delivery_city, delivery_postal_code, delivery_date,
        delivery_instructions, installation_required, items_snapshot,
        change_summary, change_type, changed_by, changes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
      )
      RETURNING *
    `, [
      quoteId,
      versionNumber,
      quote.customer_id,
      quote.customer_name,
      quote.status,
      quote.subtotal_cents,
      quote.discount_percent,
      quote.discount_cents,
      quote.tax_rate,
      quote.tax_cents,
      quote.total_cents,
      quote.gross_profit_cents,
      quote.notes,
      quote.terms,
      quote.expires_at,
      quote.delivery_address,
      quote.delivery_city,
      quote.delivery_postal_code,
      quote.delivery_date,
      quote.delivery_instructions,
      quote.installation_required,
      JSON.stringify(itemsSnapshot),
      changeSummary,
      changeType,
      changedBy,
      JSON.stringify(changes)
    ]);

    // Update quote's current version
    await db.query(
      'UPDATE quotations SET current_version = $1 WHERE id = $2',
      [versionNumber, quoteId]
    );

    return result.rows[0];
  }

  /**
   * Get version history for a quote
   * @param {number} quoteId - Quote ID
   * @param {object} options - Query options
   * @returns {Promise<Array>} List of version records
   */
  async getVersionHistory(quoteId, options = {}) {
    const { limit = 50 } = options;

    const result = await this.pool.query(`
      SELECT
        id,
        quotation_id,
        version_number,
        customer_id,
        customer_name,
        status,
        subtotal_cents,
        discount_percent,
        total_cents,
        gross_profit_cents,
        change_summary,
        change_type,
        changed_by,
        changed_at,
        changes,
        (SELECT COUNT(*) FROM jsonb_array_elements(items_snapshot)) as items_count
      FROM quote_versions
      WHERE quotation_id = $1
      ORDER BY version_number DESC
      LIMIT $2
    `, [quoteId, limit]);

    return result.rows.map(row => ({
      ...row,
      changes: typeof row.changes === 'string' ? JSON.parse(row.changes) : (row.changes || {}),
      items_count: parseInt(row.items_count) || 0
    }));
  }

  /**
   * Get a specific version of a quote
   * @param {number} quoteId - Quote ID
   * @param {number} versionNumber - Version number
   * @returns {Promise<object|null>} Version record with items
   */
  async getQuoteVersion(quoteId, versionNumber) {
    const result = await this.pool.query(`
      SELECT *
      FROM quote_versions
      WHERE quotation_id = $1 AND version_number = $2
    `, [quoteId, versionNumber]);

    if (result.rows.length === 0) {
      return null;
    }

    const version = result.rows[0];
    return {
      ...version,
      items_snapshot: typeof version.items_snapshot === 'string'
        ? JSON.parse(version.items_snapshot)
        : (version.items_snapshot || []),
      changes: typeof version.changes === 'string'
        ? JSON.parse(version.changes)
        : (version.changes || {})
    };
  }

  /**
   * Compare two versions of a quote
   * @param {number} quoteId - Quote ID
   * @param {number} version1 - First version number
   * @param {number} version2 - Second version number
   * @returns {Promise<object>} Comparison result with differences
   */
  async compareVersions(quoteId, version1, version2) {
    const [v1, v2] = await Promise.all([
      this.getQuoteVersion(quoteId, version1),
      this.getQuoteVersion(quoteId, version2)
    ]);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    const differences = {
      financial: [],
      items: [],
      details: []
    };

    // Compare financial fields
    if (v1.subtotal_cents !== v2.subtotal_cents) {
      differences.financial.push({
        field: 'subtotal',
        from: v1.subtotal_cents,
        to: v2.subtotal_cents,
        change: v2.subtotal_cents - v1.subtotal_cents
      });
    }

    if (v1.discount_percent !== v2.discount_percent) {
      differences.financial.push({
        field: 'discount_percent',
        from: v1.discount_percent,
        to: v2.discount_percent
      });
    }

    if (v1.total_cents !== v2.total_cents) {
      differences.financial.push({
        field: 'total',
        from: v1.total_cents,
        to: v2.total_cents,
        change: v2.total_cents - v1.total_cents
      });
    }

    // Compare items
    const v1Items = v1.items_snapshot || [];
    const v2Items = v2.items_snapshot || [];

    // Find added items
    v2Items.forEach(item => {
      const existsInV1 = v1Items.find(i =>
        i.product_id === item.product_id && i.sku === item.sku
      );
      if (!existsInV1) {
        differences.items.push({
          type: 'added',
          item: item
        });
      }
    });

    // Find removed items
    v1Items.forEach(item => {
      const existsInV2 = v2Items.find(i =>
        i.product_id === item.product_id && i.sku === item.sku
      );
      if (!existsInV2) {
        differences.items.push({
          type: 'removed',
          item: item
        });
      }
    });

    // Find modified items
    v1Items.forEach(v1Item => {
      const v2Item = v2Items.find(i =>
        i.product_id === v1Item.product_id && i.sku === v1Item.sku
      );
      if (v2Item) {
        const itemChanges = [];
        if (v1Item.quantity !== v2Item.quantity) {
          itemChanges.push({ field: 'quantity', from: v1Item.quantity, to: v2Item.quantity });
        }
        if (v1Item.unit_price_cents !== v2Item.unit_price_cents) {
          itemChanges.push({ field: 'price', from: v1Item.unit_price_cents, to: v2Item.unit_price_cents });
        }
        if (itemChanges.length > 0) {
          differences.items.push({
            type: 'modified',
            item: v1Item,
            changes: itemChanges
          });
        }
      }
    });

    // Compare other details
    if (v1.customer_id !== v2.customer_id) {
      differences.details.push({
        field: 'customer',
        from: v1.customer_name,
        to: v2.customer_name
      });
    }

    if (v1.status !== v2.status) {
      differences.details.push({
        field: 'status',
        from: v1.status,
        to: v2.status
      });
    }

    return {
      version1: v1,
      version2: v2,
      differences,
      summary: {
        total_change: (v2.total_cents || 0) - (v1.total_cents || 0),
        items_added: differences.items.filter(i => i.type === 'added').length,
        items_removed: differences.items.filter(i => i.type === 'removed').length,
        items_modified: differences.items.filter(i => i.type === 'modified').length
      }
    };
  }

  /**
   * Restore a quote to a previous version
   * @param {number} quoteId - Quote ID
   * @param {number} versionNumber - Version to restore
   * @param {string} restoredBy - User performing the restore
   * @returns {Promise<object>} The restored quote
   */
  async restoreVersion(quoteId, versionNumber, restoredBy = 'User') {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get the version to restore
      const version = await this.getQuoteVersion(quoteId, versionNumber);
      if (!version) {
        throw new Error('Version not found');
      }

      // Create a snapshot of current state before restoring
      await this.createVersionSnapshot(
        quoteId,
        'restored',
        `Restored to version ${versionNumber}`,
        { changedBy: restoredBy }
      );

      // Update quote with version data
      await client.query(`
        UPDATE quotations SET
          customer_id = $1,
          subtotal_cents = $2,
          discount_percent = $3,
          discount_cents = $4,
          tax_rate = $5,
          tax_cents = $6,
          total_cents = $7,
          gross_profit_cents = $8,
          notes = $9,
          terms = $10,
          expires_at = $11,
          delivery_address = $12,
          delivery_city = $13,
          delivery_postal_code = $14,
          delivery_instructions = $15,
          installation_required = $16,
          updated_at = CURRENT_TIMESTAMP,
          modified_by = $17
        WHERE id = $18
      `, [
        version.customer_id,
        version.subtotal_cents,
        version.discount_percent,
        version.discount_cents,
        version.tax_rate,
        version.tax_cents,
        version.total_cents,
        version.gross_profit_cents,
        version.notes,
        version.terms,
        version.expires_at,
        version.delivery_address,
        version.delivery_city,
        version.delivery_postal_code,
        version.delivery_instructions,
        version.installation_required,
        restoredBy,
        quoteId
      ]);

      // Delete current items
      await client.query('DELETE FROM quotation_items WHERE quotation_id = $1', [quoteId]);

      // Restore items from snapshot
      const items = version.items_snapshot || [];
      if (items.length > 0) {
        await this.insertQuoteItems(client, quoteId, items);
      }

      // Log the restore event
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, description, user_name, metadata, activity_category)
        VALUES ($1, 'UPDATED', $2, $3, $4, 'lifecycle')
      `, [
        quoteId,
        `Quote restored to version ${versionNumber}`,
        restoredBy,
        JSON.stringify({
          restored_version: versionNumber,
          items_count: items.length,
          total_cents: version.total_cents
        })
      ]);

      await client.query('COMMIT');

      return await this.getQuoteById(quoteId);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = QuoteService;
