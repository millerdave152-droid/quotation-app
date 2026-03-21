/**
 * TeleTime POS — Employee Monitor Service
 *
 * Statistical behavioral analysis of employees for internal fraud detection.
 * Uses a materialized view (mv_employee_fraud_metrics) for 30-day rolling
 * metrics with peer-comparison z-scores, then applies composite risk scoring
 * and pattern detection to flag anomalous behavior.
 *
 * Key design decisions:
 *  - REFRESH MATERIALIZED VIEW CONCURRENTLY for zero-downtime hourly refresh
 *  - Z-scores computed in PostgreSQL via STDDEV_POP window functions
 *  - Composite risk score (0-100) based on weighted thresholds
 *  - Pattern detection queries run post-refresh for behavioral fraud signals
 *  - WebSocket alerts on risk level transitions (normal→watch→elevated→critical)
 *  - Audit log entries for all risk level changes
 */

const logger = require('../utils/logger');

class EmployeeMonitorService {
  /**
   * @param {import('pg').Pool} pool
   * @param {object} deps
   * @param {object|null} deps.wsService - WebSocketService for real-time alerts
   * @param {object|null} deps.auditLogService - AuditLogService for logging risk changes
   */
  constructor(pool, { wsService = null, auditLogService = null } = {}) {
    this.pool = pool;
    this.wsService = wsService;
    this.auditLogService = auditLogService;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Refresh the materialized view and process results into employee_risk_profiles.
   * Called hourly by cron and on-demand via POST /api/fraud/employees/refresh.
   */
  async refreshMetrics() {
    const start = Date.now();

    // Step 1: Refresh the materialized view (CONCURRENTLY = non-blocking)
    try {
      await this.pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_employee_fraud_metrics');
    } catch (err) {
      // First refresh after CREATE cannot use CONCURRENTLY (no data yet)
      if (err.message && err.message.includes('has not been populated')) {
        await this.pool.query('REFRESH MATERIALIZED VIEW mv_employee_fraud_metrics');
      } else {
        throw err;
      }
    }

    // Step 2: Read the refreshed metrics
    const { rows: metrics } = await this.pool.query(`
      SELECT mv.*,
             u.first_name || ' ' || u.last_name AS employee_name,
             u.email AS employee_email,
             u.role AS employee_role
      FROM mv_employee_fraud_metrics mv
      JOIN users u ON u.id = mv.user_id
    `);

    if (metrics.length === 0) {
      logger.info('[EmployeeMonitor] No employees meet the 20-transaction threshold');
      return { processed: 0, flagged: 0 };
    }

    // Step 3: For each employee, calculate risk score + detect patterns + upsert profile
    const now = new Date();
    const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    let flagged = 0;

    for (const m of metrics) {
      const riskScore = this.calculateRiskScore(m);
      const patterns = await this.detectPatterns(m);
      const maxZ = Math.max(
        Math.abs(parseFloat(m.void_rate_zscore) || 0),
        Math.abs(parseFloat(m.refund_rate_zscore) || 0),
        Math.abs(parseFloat(m.discount_rate_zscore) || 0)
      );

      let riskLevel = 'normal';
      if (riskScore >= 70 || maxZ > 3.0) riskLevel = 'critical';
      else if (riskScore >= 50 || maxZ > 2.5) riskLevel = 'elevated';
      else if (riskScore >= 30 || maxZ > 2.0) riskLevel = 'watch';

      // Read current level before update (for change detection)
      const { rows: current } = await this.pool.query(
        'SELECT risk_level FROM employee_risk_profiles WHERE user_id = $1',
        [m.user_id]
      );
      const prevLevel = current[0]?.risk_level || 'normal';

      // Upsert the profile
      await this.pool.query(`
        INSERT INTO employee_risk_profiles (
          user_id, period_start, period_end,
          total_transactions, total_sales_amount, avg_transaction_amount,
          void_count, void_rate, refund_count, refund_rate, refund_total,
          discount_count, discount_rate, avg_discount_percent, max_discount_percent,
          manual_entry_count, no_sale_drawer_opens, price_override_count,
          void_rate_zscore, refund_rate_zscore, discount_rate_zscore,
          risk_score, risk_level, flagged_patterns, updated_at
        ) VALUES (
          $1, $2, $3,
          $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15,
          $16, $17, $18,
          $19, $20, $21,
          $22, $23, $24, NOW()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          period_start = EXCLUDED.period_start,
          period_end = EXCLUDED.period_end,
          total_transactions = EXCLUDED.total_transactions,
          total_sales_amount = EXCLUDED.total_sales_amount,
          avg_transaction_amount = EXCLUDED.avg_transaction_amount,
          void_count = EXCLUDED.void_count,
          void_rate = EXCLUDED.void_rate,
          refund_count = EXCLUDED.refund_count,
          refund_rate = EXCLUDED.refund_rate,
          refund_total = EXCLUDED.refund_total,
          discount_count = EXCLUDED.discount_count,
          discount_rate = EXCLUDED.discount_rate,
          avg_discount_percent = EXCLUDED.avg_discount_percent,
          max_discount_percent = EXCLUDED.max_discount_percent,
          manual_entry_count = EXCLUDED.manual_entry_count,
          no_sale_drawer_opens = EXCLUDED.no_sale_drawer_opens,
          price_override_count = EXCLUDED.price_override_count,
          void_rate_zscore = EXCLUDED.void_rate_zscore,
          refund_rate_zscore = EXCLUDED.refund_rate_zscore,
          discount_rate_zscore = EXCLUDED.discount_rate_zscore,
          risk_score = EXCLUDED.risk_score,
          risk_level = EXCLUDED.risk_level,
          flagged_patterns = EXCLUDED.flagged_patterns,
          updated_at = NOW()
      `, [
        m.user_id, periodStart, now,
        m.total_transactions, m.total_sales_amount, m.avg_transaction_amount,
        m.void_count, m.void_rate, m.refund_count, m.refund_rate, m.refund_total,
        m.discount_count, m.discount_rate, m.avg_discount_percent, m.max_discount_percent,
        m.manual_entry_count, m.no_sale_drawer_opens, m.price_override_count,
        parseFloat(m.void_rate_zscore) || 0,
        parseFloat(m.refund_rate_zscore) || 0,
        parseFloat(m.discount_rate_zscore) || 0,
        riskScore, riskLevel,
        JSON.stringify(patterns),
      ]);

      // Generate alerts on risk level transitions
      if (riskLevel !== prevLevel && riskLevel !== 'normal') {
        flagged++;
        this.generateAlerts({
          userId: m.user_id,
          employeeName: m.employee_name,
          prevLevel,
          newLevel: riskLevel,
          riskScore,
          patterns,
          metrics: {
            void_rate_zscore: parseFloat(m.void_rate_zscore) || 0,
            refund_rate_zscore: parseFloat(m.refund_rate_zscore) || 0,
            discount_rate_zscore: parseFloat(m.discount_rate_zscore) || 0,
          },
        });
      }
    }

    // Reset employees that fell below all thresholds
    await this.pool.query(`
      UPDATE employee_risk_profiles
      SET risk_level = 'normal', flagged_patterns = '{}'
      WHERE risk_level != 'normal'
        AND user_id IN (
          SELECT user_id FROM mv_employee_fraud_metrics
          WHERE ABS(void_rate_zscore) <= 2.0
            AND ABS(refund_rate_zscore) <= 2.0
            AND ABS(discount_rate_zscore) <= 2.0
        )
        AND risk_score < 30
    `);

    const durationMs = Date.now() - start;
    logger.info(
      { processed: metrics.length, flagged, durationMs },
      `[EmployeeMonitor] Refresh complete: ${metrics.length} employees, ${flagged} newly flagged`
    );

    return { processed: metrics.length, flagged };
  }

  // ============================================================================
  // RISK SCORING
  // ============================================================================

  /**
   * Composite risk score (0-100) based on z-scores and behavioral thresholds.
   * @param {object} m - Row from mv_employee_fraud_metrics
   * @returns {number} Score 0-100
   */
  calculateRiskScore(m) {
    let score = 0;

    // Void rate z-score
    const voidZ = Math.abs(parseFloat(m.void_rate_zscore) || 0);
    if (voidZ > 2.5) score += 30;
    else if (voidZ > 2.0) score += 20;

    // Refund rate z-score
    const refundZ = Math.abs(parseFloat(m.refund_rate_zscore) || 0);
    if (refundZ > 2.5) score += 30;
    else if (refundZ > 2.0) score += 20;

    // Discount rate z-score
    const discountZ = Math.abs(parseFloat(m.discount_rate_zscore) || 0);
    if (discountZ > 2.5) score += 25;
    else if (discountZ > 2.0) score += 15;

    // No-sale drawer opens (normalized by 30-day period)
    const drawerOpens = parseInt(m.no_sale_drawer_opens) || 0;
    const dailyDrawerOpens = drawerOpens / 30;
    if (dailyDrawerOpens > 5) score += 20;
    else if (dailyDrawerOpens > 3) score += 10;

    // Manual entry count (normalized by 30-day period)
    const manualEntries = parseInt(m.manual_entry_count) || 0;
    const dailyManual = manualEntries / 30;
    if (dailyManual > 4) score += 20;
    else if (dailyManual > 2) score += 10;

    // Max discount percent
    const maxDiscount = parseFloat(m.max_discount_percent) || 0;
    if (maxDiscount > 30) score += 15;

    // Price overrides (any is suspicious)
    const priceOverrides = parseInt(m.price_override_count) || 0;
    score += Math.min(50, priceOverrides * 25); // 25 each, capped contribution

    return Math.min(100, score);
  }

  // ============================================================================
  // PATTERN DETECTION
  // ============================================================================

  /**
   * Detect specific fraud patterns for an employee.
   * @param {object} m - Row from mv_employee_fraud_metrics
   * @returns {Promise<object>} Detected patterns with evidence
   */
  async detectPatterns(m) {
    const patterns = {};
    const userId = m.user_id;

    // Pattern 1: Delayed voids (>5 minutes after original sale)
    try {
      const { rows: delayedVoids } = await this.pool.query(`
        SELECT t.transaction_id, t.transaction_number, t.total_amount,
               t.created_at AS sale_time,
               al.created_at AS void_time,
               EXTRACT(EPOCH FROM (al.created_at - t.created_at)) / 60 AS delay_minutes
        FROM transactions t
        JOIN audit_log al ON al.entity_id = t.transaction_id
          AND al.entity_type = 'transaction'
          AND al.action ILIKE '%void%'
        WHERE t.voided_by = $1
          AND t.status = 'voided'
          AND t.created_at >= NOW() - INTERVAL '30 days'
          AND EXTRACT(EPOCH FROM (al.created_at - t.created_at)) > 300
        ORDER BY al.created_at DESC
        LIMIT 10
      `, [userId]);

      if (delayedVoids.length > 0) {
        patterns.delayed_voids = {
          count: delayedVoids.length,
          description: `${delayedVoids.length} void(s) processed >5 minutes after original sale`,
          evidence: delayedVoids.map(v => ({
            transaction_id: v.transaction_id,
            transaction_number: v.transaction_number,
            amount: parseFloat(v.total_amount),
            delay_minutes: Math.round(parseFloat(v.delay_minutes)),
          })),
        };
      }
    } catch (err) {
      logger.warn({ err, userId }, '[EmployeeMonitor] Delayed void check failed');
    }

    // Pattern 2: Discount usage significantly above threshold (>30%)
    try {
      const { rows: highDiscounts } = await this.pool.query(`
        SELECT t.transaction_id, t.transaction_number, t.total_amount, t.discount_amount,
               CASE WHEN t.total_amount > 0
                 THEN ROUND((t.discount_amount / t.total_amount * 100)::NUMERIC, 1)
                 ELSE 0
               END AS discount_pct
        FROM transactions t
        WHERE t.user_id = $1
          AND t.discount_amount > 0
          AND t.created_at >= NOW() - INTERVAL '30 days'
          AND t.total_amount > 0
          AND (t.discount_amount / t.total_amount * 100) > 30
        ORDER BY t.discount_amount DESC
        LIMIT 10
      `, [userId]);

      if (highDiscounts.length > 0) {
        patterns.excessive_discounts = {
          count: highDiscounts.length,
          description: `${highDiscounts.length} transaction(s) with >30% discount`,
          evidence: highDiscounts.map(d => ({
            transaction_id: d.transaction_id,
            transaction_number: d.transaction_number,
            amount: parseFloat(d.total_amount),
            discount_amount: parseFloat(d.discount_amount),
            discount_pct: parseFloat(d.discount_pct),
          })),
        };
      }
    } catch (err) {
      logger.warn({ err, userId }, '[EmployeeMonitor] Excessive discount check failed');
    }

    // Pattern 3: Returns without corresponding original sales by this employee
    // (employee processes return for a sale they didn't ring up — possible collusion)
    try {
      const { rows: suspiciousReturns } = await this.pool.query(`
        SELECT pr.id AS return_id, pr.return_number, pr.total_refund_amount,
               pr.created_at AS return_date,
               t.user_id AS original_cashier_id,
               u.first_name || ' ' || u.last_name AS original_cashier_name
        FROM pos_returns pr
        JOIN transactions t ON t.transaction_id = pr.original_transaction_id
        JOIN users u ON u.id = t.user_id
        WHERE pr.processed_by = $1
          AND t.user_id != $1
          AND pr.created_at >= NOW() - INTERVAL '30 days'
        ORDER BY pr.total_refund_amount DESC
        LIMIT 10
      `, [userId]);

      // Only flag if there are more than 3 cross-employee returns
      if (suspiciousReturns.length > 3) {
        patterns.cross_employee_returns = {
          count: suspiciousReturns.length,
          description: `${suspiciousReturns.length} return(s) processed for other employees' sales`,
          evidence: suspiciousReturns.map(r => ({
            return_id: r.return_id,
            return_number: r.return_number,
            refund_amount: parseFloat(r.total_refund_amount),
            original_cashier: r.original_cashier_name,
          })),
        };
      }
    } catch (err) {
      logger.warn({ err, userId }, '[EmployeeMonitor] Cross-employee return check failed');
    }

    // Pattern 4: Refunds to the same card used by this employee
    // (checks if the refund card last-four matches cards from the employee's own purchases, if trackable)
    try {
      const { rows: selfRefunds } = await this.pool.query(`
        SELECT fs.id AS score_id, fs.transaction_id, fs.card_last_four, fs.amount,
               fs.created_at
        FROM fraud_scores fs
        WHERE fs.employee_id = $1
          AND fs.action_taken IN ('approved', 'flagged')
          AND fs.card_last_four IS NOT NULL
          AND fs.created_at >= NOW() - INTERVAL '30 days'
          AND EXISTS (
            SELECT 1 FROM pos_returns pr
            JOIN transactions t ON t.transaction_id = pr.original_transaction_id
            WHERE pr.processed_by = $1
              AND pr.created_at >= NOW() - INTERVAL '30 days'
          )
        ORDER BY fs.created_at DESC
        LIMIT 5
      `, [userId]);

      // This is a heuristic — only flag if there are repeated card last-fours
      const cardCounts = {};
      for (const r of selfRefunds) {
        cardCounts[r.card_last_four] = (cardCounts[r.card_last_four] || 0) + 1;
      }
      const repeatedCards = Object.entries(cardCounts).filter(([, cnt]) => cnt >= 3);
      if (repeatedCards.length > 0) {
        patterns.repeated_card_usage = {
          count: repeatedCards.length,
          description: `${repeatedCards.length} card(s) used 3+ times in transactions processed by this employee`,
          evidence: repeatedCards.map(([lastFour, count]) => ({ lastFour, count })),
        };
      }
    } catch (err) {
      logger.warn({ err, userId }, '[EmployeeMonitor] Self-refund check failed');
    }

    return patterns;
  }

  // ============================================================================
  // ALERT GENERATION
  // ============================================================================

  /**
   * Generate alerts when an employee's risk level changes.
   * Emits WebSocket alert to manager room and creates audit log entry.
   * @param {object} change
   */
  generateAlerts(change) {
    const { userId, employeeName, prevLevel, newLevel, riskScore, patterns, metrics } = change;

    // WebSocket alert (fire-and-forget)
    if (this.wsService) {
      try {
        this.wsService.broadcastToRoles(['admin', 'manager'], 'fraud:employee_risk_change', {
          userId,
          employeeName,
          previousRiskLevel: prevLevel,
          newRiskLevel: newLevel,
          riskScore,
          patterns: Object.keys(patterns),
          zScores: metrics,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        logger.warn({ err }, '[EmployeeMonitor] WebSocket broadcast failed');
      }
    }

    // Audit log entry (fire-and-forget)
    if (this.auditLogService) {
      try {
        this.auditLogService.log(
          null, // system-initiated, no user_id
          'fraud.employee_risk_change',
          'employee_risk_profile',
          userId,
          {
            event_category: 'fraud',
            severity: newLevel === 'critical' ? 'critical' : newLevel === 'elevated' ? 'warning' : 'info',
            previous_risk_level: prevLevel,
            new_risk_level: newLevel,
            risk_score: riskScore,
            pattern_count: Object.keys(patterns).length,
          }
        );
      } catch (err) {
        logger.warn({ err }, '[EmployeeMonitor] Audit log entry failed');
      }
    }

    logger.warn(
      { userId, employeeName, prevLevel, newLevel, riskScore },
      `[EmployeeMonitor] Risk level change: ${employeeName} (${prevLevel} → ${newLevel}, score: ${riskScore})`
    );
  }

  // ============================================================================
  // QUERY API
  // ============================================================================

  /**
   * Get all employee risk profiles with pagination, sorting, and filtering.
   * @param {object} filters - { risk_level, location_id, min_score }
   * @param {object} pagination - { page, limit, sort_by, sort_dir }
   */
  async getAllProfiles(filters = {}, pagination = {}) {
    const { risk_level, location_id, min_score } = filters;
    const page = parseInt(pagination.page) || 1;
    const limit = Math.min(parseInt(pagination.limit) || 25, 100);
    const allowedSorts = [
      'risk_score', 'void_rate_zscore', 'refund_rate_zscore', 'discount_rate_zscore',
      'total_transactions', 'updated_at', 'employee_name',
    ];
    const sortBy = allowedSorts.includes(pagination.sort_by) ? pagination.sort_by : 'risk_score';
    const sortDir = pagination.sort_dir === 'ASC' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (risk_level) {
      conditions.push(`erp.risk_level = $${idx++}`);
      params.push(risk_level);
    }
    if (location_id) {
      conditions.push(`erp.location_id = $${idx++}`);
      params.push(parseInt(location_id));
    }
    if (min_score !== undefined && min_score !== null) {
      conditions.push(`erp.risk_score >= $${idx++}`);
      params.push(parseInt(min_score));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM employee_risk_profiles erp
       JOIN users u ON u.id = erp.user_id ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Use a sort expression that handles the employee_name join alias
    const sortExpr = sortBy === 'employee_name'
      ? `u.first_name ${sortDir}, u.last_name`
      : `erp.${sortBy}`;

    const dataParams = [...params, limit, offset];
    const { rows } = await this.pool.query(`
      SELECT erp.*,
             u.first_name || ' ' || u.last_name AS employee_name,
             u.email AS employee_email,
             u.role AS employee_role
      FROM employee_risk_profiles erp
      JOIN users u ON u.id = erp.user_id
      ${whereClause}
      ORDER BY ${sortExpr} ${sortDir}
      LIMIT $${idx++} OFFSET $${idx++}
    `, dataParams);

    return { rows, total, page, limit };
  }

  /**
   * Get a single employee's risk profile with full metrics and peer comparison.
   * @param {number} userId
   */
  async getProfile(userId) {
    const { rows } = await this.pool.query(`
      SELECT erp.*,
             u.first_name || ' ' || u.last_name AS employee_name,
             u.email AS employee_email,
             u.role AS employee_role
      FROM employee_risk_profiles erp
      JOIN users u ON u.id = erp.user_id
      WHERE erp.user_id = $1
    `, [userId]);

    if (!rows[0]) return null;

    const profile = rows[0];

    // Add peer comparison from the materialized view
    try {
      const { rows: peerData } = await this.pool.query(`
        SELECT peer_avg_void_rate, peer_avg_refund_rate, peer_avg_discount_rate
        FROM mv_employee_fraud_metrics
        WHERE user_id = $1
      `, [userId]);

      if (peerData[0]) {
        profile.peer_comparison = {
          avg_void_rate: parseFloat(peerData[0].peer_avg_void_rate) || 0,
          avg_refund_rate: parseFloat(peerData[0].peer_avg_refund_rate) || 0,
          avg_discount_rate: parseFloat(peerData[0].peer_avg_discount_rate) || 0,
        };
      }
    } catch {
      // MV may not be populated yet
    }

    return profile;
  }

  /**
   * Get an employee's transactions with fraud scores, filterable by type.
   * @param {number} userId
   * @param {object} filters - { type: 'voids'|'refunds'|'discounts', page, limit }
   */
  async getEmployeeTransactions(userId, filters = {}) {
    const page = parseInt(filters.page) || 1;
    const limit = Math.min(parseInt(filters.limit) || 25, 100);
    const offset = (page - 1) * limit;
    const type = filters.type; // 'voids', 'refunds', 'discounts'

    const conditions = ['t.user_id = $1', "t.created_at >= NOW() - INTERVAL '30 days'"];
    const params = [userId];
    let idx = 2;

    if (type === 'voids') {
      conditions.push("t.status = 'voided'");
    } else if (type === 'discounts') {
      conditions.push('t.discount_amount > 0');
    }

    const whereClause = conditions.join(' AND ');

    if (type === 'refunds') {
      // Refunds come from pos_returns, not transactions
      const countResult = await this.pool.query(
        `SELECT COUNT(*) FROM pos_returns pr
         WHERE pr.processed_by = $1
           AND pr.created_at >= NOW() - INTERVAL '30 days'`,
        [userId]
      );
      const total = parseInt(countResult.rows[0].count);

      const { rows } = await this.pool.query(`
        SELECT pr.id AS return_id, pr.return_number, pr.total_refund_amount,
               pr.refund_method, pr.status, pr.created_at,
               t.transaction_number AS original_transaction_number,
               t.total_amount AS original_amount
        FROM pos_returns pr
        LEFT JOIN transactions t ON t.transaction_id = pr.original_transaction_id
        WHERE pr.processed_by = $1
          AND pr.created_at >= NOW() - INTERVAL '30 days'
        ORDER BY pr.created_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, limit, offset]);

      return { rows, total, page, limit, type: 'refunds' };
    }

    // Regular transactions (all, voids, or discounts)
    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM transactions t WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const { rows } = await this.pool.query(`
      SELECT t.transaction_id, t.transaction_number, t.total_amount,
             t.discount_amount, t.discount_reason, t.status, t.void_reason,
             t.created_at,
             fs.score AS fraud_score, fs.risk_level AS fraud_risk_level,
             fs.action_taken AS fraud_action, fs.signals AS fraud_signals
      FROM transactions t
      LEFT JOIN fraud_scores fs ON fs.transaction_id = t.transaction_id
      WHERE ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, limit, offset]);

    return { rows, total, page, limit, type: type || 'all' };
  }

  // ============================================================================
  // MAINTENANCE CRON HELPERS
  // ============================================================================

  /**
   * Clean up velocity_events older than 30 days.
   * Called by daily 4am cron job.
   */
  async cleanupVelocityEvents() {
    const { rowCount } = await this.pool.query(
      "DELETE FROM velocity_events WHERE created_at < NOW() - INTERVAL '30 days'"
    );
    logger.info({ deleted: rowCount }, '[EmployeeMonitor] Velocity events cleanup complete');
    return rowCount;
  }

  /**
   * Clean up expired bin_cache entries.
   * Called by weekly Sunday 5am cron job.
   */
  async cleanupExpiredBinCache() {
    const { rowCount } = await this.pool.query(
      'DELETE FROM bin_cache WHERE expires_at IS NOT NULL AND expires_at < NOW()'
    );
    logger.info({ deleted: rowCount }, '[EmployeeMonitor] Expired BIN cache cleanup complete');
    return rowCount;
  }
}

module.exports = EmployeeMonitorService;
