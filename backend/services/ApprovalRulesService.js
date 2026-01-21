/**
 * ApprovalRulesService
 * Centralized approval rules and threshold management
 * Week 1.2 of 4-week sprint
 */

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
   * Get the appropriate approver for a quote
   * @param {Object} pool - Database pool
   * @param {Object} quote - Quote object
   * @param {Object} requestingUser - User requesting approval
   * @returns {Object|null} Approver user or null
   */
  static async findApprover(pool, quote, requestingUser) {
    const totalCents = parseInt(quote.total_cents) || 0;

    // First try: User's manager
    if (requestingUser.manager_id) {
      const managerResult = await pool.query(
        `SELECT * FROM users WHERE id = $1 AND is_active = true`,
        [requestingUser.manager_id]
      );
      if (managerResult.rows.length > 0) {
        const manager = managerResult.rows[0];
        // Check if manager can approve this amount
        if (!manager.max_approval_amount_cents || manager.max_approval_amount_cents >= totalCents) {
          return manager;
        }
      }
    }

    // Second try: Any user with approval permission for this amount
    const approverResult = await pool.query(`
      SELECT * FROM users
      WHERE is_active = true
        AND can_approve_quotes = true
        AND (max_approval_amount_cents IS NULL OR max_approval_amount_cents >= $1)
        AND id != $2
      ORDER BY
        CASE role
          WHEN 'admin' THEN 1
          WHEN 'manager' THEN 2
          WHEN 'supervisor' THEN 3
          ELSE 4
        END
      LIMIT 1
    `, [totalCents, requestingUser.id]);

    return approverResult.rows[0] || null;
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
