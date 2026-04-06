/**
 * ApprovalRulesService
 * Centralized approval rules and threshold management
 * Week 1.2 of 4-week sprint
 */

const {
  ROLE_CHAIN,
  normaliseRole,
  isDenialFinal,
  findNextApprover,
  logEscalationStep,
} = require('../utils/escalationChain');

class ApprovalRulesService {
  /**
   * Default approval thresholds
   * Can be overridden via environment variables
   */
  static RULES = {
    // Discount threshold - requires approval if discount > this %
    DISCOUNT_THRESHOLD: parseInt(process.env.APPROVAL_DISCOUNT_THRESHOLD) || 15,

    // Amount threshold - requires manager approval if total > this (in cents)
    AMOUNT_THRESHOLD: parseInt(process.env.APPROVAL_AMOUNT_THRESHOLD) || 1000000, // $10,000

    // Margin threshold - requires approval if margin < this %
    MARGIN_THRESHOLD: parseInt(process.env.APPROVAL_MARGIN_THRESHOLD) || 20,

    // Admin roles that can always approve
    ADMIN_ROLES: ['admin', 'manager', 'supervisor'],
  };

  /**
   * Check if a quote requires approval based on various thresholds
   * @param {Object} quote - Quote object with discount_percent, total_cents, gross_profit_cents
   * @param {Object} user - User object with approval_threshold_percent
   * @returns {Object} { required: boolean, reasons: string[] }
   */
  static requiresApproval(quote, user = {}) {
    const reasons = [];

    // Check discount threshold
    const discountPercent = parseFloat(quote.discount_percent) || 0;
    if (discountPercent > this.RULES.DISCOUNT_THRESHOLD) {
      reasons.push(`Discount ${discountPercent}% exceeds threshold ${this.RULES.DISCOUNT_THRESHOLD}%`);
    }

    // Check amount threshold
    const totalCents = parseInt(quote.total_cents) || 0;
    if (totalCents > this.RULES.AMOUNT_THRESHOLD) {
      reasons.push(`Amount $${(totalCents / 100).toFixed(2)} exceeds threshold $${(this.RULES.AMOUNT_THRESHOLD / 100).toFixed(2)}`);
    }

    // Check margin threshold (if user has one configured)
    if (user.approval_threshold_percent) {
      const marginPercent = this.calculateMarginPercent(quote);
      if (marginPercent < user.approval_threshold_percent) {
        reasons.push(`Margin ${marginPercent.toFixed(1)}% below user threshold ${user.approval_threshold_percent}%`);
      }
    } else {
      // Use default margin threshold
      const marginPercent = this.calculateMarginPercent(quote);
      if (marginPercent < this.RULES.MARGIN_THRESHOLD) {
        reasons.push(`Margin ${marginPercent.toFixed(1)}% below default threshold ${this.RULES.MARGIN_THRESHOLD}%`);
      }
    }

    return {
      required: reasons.length > 0,
      reasons,
      primaryReason: reasons[0] || null
    };
  }

  /**
   * Calculate margin percentage from quote
   * @param {Object} quote - Quote with gross_profit_cents and total_cents
   * @returns {number} Margin percentage
   */
  static calculateMarginPercent(quote) {
    const grossProfit = parseInt(quote.gross_profit_cents) || 0;
    const total = parseInt(quote.total_cents) || 0;

    if (total === 0) return 0;
    return (grossProfit / total) * 100;
  }

  /**
   * Check if a user can approve a specific quote
   * @param {Object} user - User with can_approve_quotes, max_approval_amount_cents, role
   * @param {Object} quote - Quote with total_cents
   * @returns {Object} { canApprove: boolean, reason?: string }
   */
  static canApprove(user, quote) {
    // Admin roles can always approve
    if (this.RULES.ADMIN_ROLES.includes(user.role)) {
      return { canApprove: true };
    }

    // Check if user has approval permission
    if (!user.can_approve_quotes) {
      return {
        canApprove: false,
        reason: 'User does not have quote approval permission'
      };
    }

    // Check if quote exceeds user's max approval amount
    if (user.max_approval_amount_cents) {
      const totalCents = parseInt(quote.total_cents) || 0;
      if (totalCents > user.max_approval_amount_cents) {
        return {
          canApprove: false,
          reason: `Quote amount $${(totalCents / 100).toFixed(2)} exceeds user's approval limit $${(user.max_approval_amount_cents / 100).toFixed(2)}`
        };
      }
    }

    return { canApprove: true };
  }

  /**
   * Check if a user can reject a quote
   * @param {Object} user - User with can_approve_quotes, role
   * @returns {Object} { canReject: boolean, reason?: string }
   */
  static canReject(user) {
    // Admin roles can always reject
    if (this.RULES.ADMIN_ROLES.includes(user.role)) {
      return { canReject: true };
    }

    // Check if user has approval permission (same permission covers rejection)
    if (!user.can_approve_quotes) {
      return {
        canReject: false,
        reason: 'User does not have quote approval/rejection permission'
      };
    }

    return { canReject: true };
  }

  /**
   * DB-verified version of requiresApproval.
   * Cross-checks quote item costs against actual product costs in the DB
   * to prevent margin inflation via cost manipulation.
   * @param {Object} pool - Database pool
   * @param {number} quoteId - Quote ID
   * @param {Object} user - User object with approval_threshold_percent
   * @returns {Promise<Object>} { required, reasons, costManipulated, manipulatedItems }
   */
  static async requiresApprovalVerified(pool, quoteId, user = {}) {
    const reasons = [];
    let costManipulated = false;
    const manipulatedItems = [];

    // Fetch quote header
    const { rows: [quote] } = await pool.query(
      'SELECT id, total_cents, discount_percent FROM quotations WHERE id = $1',
      [quoteId]
    );
    if (!quote) return { required: false, reasons: [], costManipulated: false, manipulatedItems: [] };

    // Check discount threshold
    const discountPercent = parseFloat(quote.discount_percent) || 0;
    if (discountPercent > this.RULES.DISCOUNT_THRESHOLD) {
      reasons.push(`Discount ${discountPercent}% exceeds threshold ${this.RULES.DISCOUNT_THRESHOLD}%`);
    }

    // Check amount threshold
    const totalCents = parseInt(quote.total_cents) || 0;
    if (totalCents > this.RULES.AMOUNT_THRESHOLD) {
      reasons.push(`Amount $${(totalCents / 100).toFixed(2)} exceeds threshold $${(this.RULES.AMOUNT_THRESHOLD / 100).toFixed(2)}`);
    }

    // Fetch line items with DB product costs for cross-check
    const { rows: items } = await pool.query(
      `SELECT qi.product_id, qi.cost_cents AS quote_cost, qi.sell_cents, qi.quantity,
              p.cost_cents AS db_cost, p.name AS product_name
       FROM quotation_items qi
       JOIN products p ON qi.product_id = p.id
       WHERE qi.quotation_id = $1`,
      [quoteId]
    );

    let dbTotalCost = 0;
    let dbTotalRevenue = 0;

    for (const item of items) {
      const qty = parseInt(item.quantity) || 1;
      const dbCost = parseInt(item.db_cost) || 0;
      const quoteCost = parseInt(item.quote_cost) || 0;
      const sell = parseInt(item.sell_cents) || 0;

      dbTotalCost += dbCost * qty;
      dbTotalRevenue += sell * qty;

      if (quoteCost < dbCost) {
        costManipulated = true;
        manipulatedItems.push({
          product_id: item.product_id,
          product_name: item.product_name,
          quote_cost_cents: quoteCost,
          db_cost_cents: dbCost
        });
      }
    }

    // Calculate margin using DB-verified cost
    let marginPercent = 0;
    if (dbTotalRevenue > 0) {
      marginPercent = ((dbTotalRevenue - dbTotalCost) / dbTotalRevenue) * 100;
    }

    // Check margin threshold using DB-verified cost
    const marginThreshold = user.approval_threshold_percent || this.RULES.MARGIN_THRESHOLD;
    if (marginPercent < marginThreshold) {
      reasons.push(`Margin ${marginPercent.toFixed(1)}% below threshold ${marginThreshold}% (DB-verified cost)`);
    }

    // Force approval on cost manipulation
    if (costManipulated) {
      reasons.push(`Cost manipulation: ${manipulatedItems.length} item(s) have quote cost below DB cost`);
    }

    return {
      required: reasons.length > 0,
      reasons,
      primaryReason: reasons[0] || null,
      costManipulated,
      manipulatedItems,
      dbVerifiedMargin: marginPercent
    };
  }

  /**
   * Get the appropriate approver for a quote, walking the role chain upward.
   * Starts from the requesting user's role level and finds the next higher role.
   *
   * @param {Object} pool - Database pool
   * @param {Object} quote - Quote object
   * @param {Object} requestingUser - User requesting approval
   * @param {string} [startAboveRole] - If provided, find an approver above THIS role
   *                                    (used during auto-escalation after denial)
   * @returns {Object|null} Approver user or null
   */
  static async findApprover(pool, quote, requestingUser, startAboveRole = null) {
    const totalCents = parseInt(quote.total_cents) || 0;
    const startRole = startAboveRole || normaliseRole(requestingUser.role);

    // Walk the chain: find next approver above startRole
    const result = await findNextApprover(pool, startRole, requestingUser.id, totalCents);
    if (result) return result.user;

    // Fallback: any active user with can_approve_quotes for this amount
    const approverResult = await pool.query(`
      SELECT * FROM users
      WHERE is_active = true
        AND can_approve_quotes = true
        AND (max_approval_amount_cents IS NULL OR max_approval_amount_cents >= $1)
        AND id != $2
      ORDER BY
        CASE LOWER(role)
          WHEN 'admin' THEN 1
          WHEN 'senior_manager' THEN 2
          WHEN 'manager' THEN 3
          WHEN 'supervisor' THEN 4
          ELSE 5
        END
      LIMIT 1
    `, [totalCents, requestingUser.id]);

    return approverResult.rows[0] || null;
  }

  /**
   * Auto-escalate a denied CRM quote approval to the next role in the chain.
   * Creates a new quote_approvals row linked to the denied one.
   *
   * @param {Object} pool              DB pool
   * @param {Object} deniedApproval    The denied quote_approvals row
   * @param {Object} denier            The user who denied { id, role, firstName, lastName, email }
   * @param {string} denyReason        Reason for denial
   * @param {Object} [auditLogService] For audit logging
   * @param {Object} [req]             Express request
   * @returns {Object|null} New escalated approval row, or null if denial is final
   */
  static async escalateOnDenial(pool, deniedApproval, denier, denyReason, auditLogService = null, req = null) {
    const denierRole = normaliseRole(denier.role);

    // If denier is at final authority, denial is terminal
    if (isDenialFinal(denierRole)) {
      return null;
    }

    // Find next approver above the denier's role
    const totalCents = parseInt(deniedApproval.total_cents) || 0;
    const next = await findNextApprover(pool, denierRole, deniedApproval.requested_by_user_id || 0, totalCents);
    if (!next) return null;

    // Create new escalated approval request
    const { rows: [escalated] } = await pool.query(
      `INSERT INTO quote_approvals
        (quotation_id, requested_by, requested_by_email, approver_name, approver_email,
         comments, escalation_level, escalated_from_id, current_approver_role,
         escalation_reason, escalated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'denied', NOW())
       RETURNING *`,
      [
        deniedApproval.quotation_id,
        deniedApproval.requested_by,
        deniedApproval.requested_by_email,
        `${next.user.first_name} ${next.user.last_name}`,
        next.user.email,
        `Auto-escalated: denied by ${denier.firstName || ''} ${denier.lastName || ''} (${denierRole}). Reason: ${denyReason}`,
        (deniedApproval.escalation_level || 0) + 1,
        deniedApproval.id,
        next.role,
      ]
    );

    // Reset quote status back to PENDING_APPROVAL
    await pool.query(
      "UPDATE quotations SET status = 'PENDING_APPROVAL' WHERE id = $1",
      [deniedApproval.quotation_id]
    );

    // Timeline event
    await pool.query(
      `INSERT INTO quote_events (quotation_id, event_type, description)
       VALUES ($1, 'ESCALATED', $2)`,
      [
        deniedApproval.quotation_id,
        `Auto-escalated to ${next.user.first_name} ${next.user.last_name} (${next.role}) after denial by ${denier.firstName || ''} ${denier.lastName || ''}`
      ]
    );

    // Audit log
    logEscalationStep(auditLogService, {
      userId: denier.id,
      entityType: 'quote_approval',
      entityId: escalated.id,
      fromRole: denierRole,
      toRole: next.role,
      reason: 'denied',
      originalRequestId: deniedApproval.escalated_from_id || deniedApproval.id,
      locationId: req?.body?.location_id || null,
      req,
    });

    return escalated;
  }

  /**
   * Auto-escalate timed-out CRM quote approvals.
   * Called by cron job every minute.
   *
   * @param {Object} pool
   * @param {Object} [auditLogService]
   * @returns {Promise<number>} Number of escalations processed
   */
  static async escalateTimedOutQuoteApprovals(pool, auditLogService = null) {
    // Find pending approvals older than 10 minutes
    const { rows: expired } = await pool.query(
      `SELECT qa.*, q.total_cents
       FROM quote_approvals qa
       LEFT JOIN quotations q ON qa.quotation_id = q.id
       WHERE qa.status = 'PENDING'
         AND qa.requested_at <= NOW() - INTERVAL '10 minutes'`
    );

    let processed = 0;
    for (const approval of expired) {
      const currentRole = normaliseRole(approval.current_approver_role || 'supervisor');

      // If at final level, mark as rejected due to timeout
      if (isDenialFinal(currentRole)) {
        await pool.query(
          `UPDATE quote_approvals SET status = 'REJECTED', comments = 'Auto-rejected: timeout at final authority', reviewed_at = NOW()
           WHERE id = $1`,
          [approval.id]
        );
        await pool.query(
          "UPDATE quotations SET status = 'REJECTED', rejected_reason = 'Approval timeout at final authority' WHERE id = $1",
          [approval.quotation_id]
        );
        processed++;
        continue;
      }

      const totalCents = parseInt(approval.total_cents) || 0;
      const next = await findNextApprover(pool, currentRole, 0, totalCents);
      if (!next) {
        await pool.query(
          `UPDATE quote_approvals SET status = 'REJECTED', comments = 'Auto-rejected: no higher approver', reviewed_at = NOW()
           WHERE id = $1`,
          [approval.id]
        );
        processed++;
        continue;
      }

      // Mark current as escalated
      await pool.query(
        `UPDATE quote_approvals SET status = 'ESCALATED', comments = 'Auto-escalated: timeout', reviewed_at = NOW()
         WHERE id = $1`,
        [approval.id]
      );

      // Create escalated row
      const { rows: [escalated] } = await pool.query(
        `INSERT INTO quote_approvals
          (quotation_id, requested_by, requested_by_email, approver_name, approver_email,
           comments, escalation_level, escalated_from_id, current_approver_role,
           escalation_reason, escalated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'timeout', NOW())
         RETURNING *`,
        [
          approval.quotation_id,
          approval.requested_by,
          approval.requested_by_email,
          `${next.user.first_name} ${next.user.last_name}`,
          next.user.email,
          `Auto-escalated: previous approver timed out after 10 minutes`,
          (approval.escalation_level || 0) + 1,
          approval.id,
          next.role,
        ]
      );

      // Timeline event
      await pool.query(
        `INSERT INTO quote_events (quotation_id, event_type, description)
         VALUES ($1, 'ESCALATED', $2)`,
        [
          approval.quotation_id,
          `Auto-escalated to ${next.user.first_name} ${next.user.last_name} (${next.role}) after 10-minute timeout`
        ]
      );

      logEscalationStep(auditLogService, {
        userId: 0,
        entityType: 'quote_approval',
        entityId: escalated.id,
        fromRole: currentRole,
        toRole: next.role,
        reason: 'timeout',
        originalRequestId: approval.escalated_from_id || approval.id,
      });

      processed++;
    }

    return processed;
  }

  /**
   * Get approval summary for a quote
   * @param {Object} quote - Quote object
   * @param {Object} user - Current user
   * @returns {Object} Summary with all approval info
   */
  static getApprovalSummary(quote, user) {
    const approvalCheck = this.requiresApproval(quote, user);
    const canApprove = this.canApprove(user, quote);
    const marginPercent = this.calculateMarginPercent(quote);

    return {
      quote_id: quote.id,
      total_cents: quote.total_cents,
      discount_percent: quote.discount_percent,
      margin_percent: marginPercent.toFixed(1),
      approval_required: approvalCheck.required,
      approval_reasons: approvalCheck.reasons,
      user_can_approve: canApprove.canApprove,
      user_cannot_approve_reason: canApprove.reason || null,
      thresholds: {
        discount: this.RULES.DISCOUNT_THRESHOLD,
        amount: this.RULES.AMOUNT_THRESHOLD,
        margin: user.approval_threshold_percent || this.RULES.MARGIN_THRESHOLD
      }
    };
  }
}

module.exports = ApprovalRulesService;
