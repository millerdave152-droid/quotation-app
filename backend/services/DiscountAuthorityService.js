/**
 * TeleTime POS - Discount Authority Service
 *
 * Enforces tier-based discount limits, tracks budget usage,
 * and handles escalations to managers.
 */

class DiscountAuthorityService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Get the discount authority tier for a user based on role
   * Maps 'user' → 'staff', 'admin' → 'master'
   */
  async getEmployeeTier(userId, role) {
    const roleName = this._mapRole(role);

    const result = await this.pool.query(
      'SELECT * FROM discount_authority_tiers WHERE role_name = $1',
      [roleName]
    );

    return result.rows[0] || null;
  }

  /**
   * Get current-week budget for an employee
   */
  async getEmployeeBudget(employeeId) {
    const result = await this.pool.query(
      `SELECT * FROM discount_budgets
       WHERE employee_id = $1
         AND budget_period_start <= CURRENT_DATE
         AND budget_period_end >= CURRENT_DATE
       ORDER BY budget_period_start DESC
       LIMIT 1`,
      [employeeId]
    );

    return result.rows[0] || null;
  }

  /**
   * Validate a proposed discount against tier rules
   * Returns approval status, reasons, and margin info
   */
  async validateDiscount({ productId, originalPrice, cost, discountPct, employeeId, role }) {
    const tier = await this.getEmployeeTier(employeeId, role);

    if (!tier) {
      return {
        approved: false,
        requiresManagerApproval: true,
        reason: 'No discount authority tier found for role',
        marginBefore: null,
        marginAfter: null,
        maxAllowed: 0,
      };
    }

    // Unrestricted tiers (e.g. master/admin) bypass all checks
    if (tier.is_unrestricted) {
      const marginBefore = originalPrice > 0 ? ((originalPrice - cost) / originalPrice) * 100 : 0;
      const discountedPrice = originalPrice * (1 - discountPct / 100);
      const marginAfter = originalPrice > 0 ? ((discountedPrice - cost) / originalPrice) * 100 : 0;

      return {
        approved: true,
        requiresManagerApproval: false,
        reason: null,
        marginBefore: +marginBefore.toFixed(2),
        marginAfter: +marginAfter.toFixed(2),
        maxAllowed: null,
      };
    }

    const marginBefore = originalPrice > 0 ? ((originalPrice - cost) / originalPrice) * 100 : 0;
    const discountedPrice = originalPrice * (1 - discountPct / 100);
    const marginAfter = originalPrice > 0 ? ((discountedPrice - cost) / originalPrice) * 100 : 0;

    // Determine if product is high-margin
    const highMarginThreshold = parseFloat(tier.high_margin_threshold) || 30;
    const isHighMargin = marginBefore >= highMarginThreshold;

    // Check discount % against tier limit
    const maxAllowed = isHighMargin
      ? parseFloat(tier.max_discount_pct_high_margin)
      : parseFloat(tier.max_discount_pct_standard);

    if (discountPct > maxAllowed) {
      return {
        approved: false,
        requiresManagerApproval: true,
        reason: `Discount ${discountPct}% exceeds ${isHighMargin ? 'high-margin' : 'standard'} limit of ${maxAllowed}%`,
        marginBefore: +marginBefore.toFixed(2),
        marginAfter: +marginAfter.toFixed(2),
        maxAllowed,
      };
    }

    // Check margin floor
    const minMarginFloor = parseFloat(tier.min_margin_floor_pct);
    if (minMarginFloor != null && marginAfter < minMarginFloor) {
      return {
        approved: false,
        requiresManagerApproval: true,
        reason: `Post-discount margin ${marginAfter.toFixed(2)}% falls below minimum floor of ${minMarginFloor}%`,
        marginBefore: +marginBefore.toFixed(2),
        marginAfter: +marginAfter.toFixed(2),
        maxAllowed,
      };
    }

    // Check if margin falls below approval threshold
    const approvalThreshold = tier.requires_approval_below_margin != null
      ? parseFloat(tier.requires_approval_below_margin)
      : null;

    if (approvalThreshold != null && marginAfter < approvalThreshold) {
      return {
        approved: false,
        requiresManagerApproval: true,
        reason: `Post-discount margin ${marginAfter.toFixed(2)}% below approval threshold of ${approvalThreshold}%`,
        marginBefore: +marginBefore.toFixed(2),
        marginAfter: +marginAfter.toFixed(2),
        maxAllowed,
      };
    }

    return {
      approved: true,
      requiresManagerApproval: false,
      reason: null,
      marginBefore: +marginBefore.toFixed(2),
      marginAfter: +marginAfter.toFixed(2),
      maxAllowed,
    };
  }

  /**
   * Full validation with rich calculations response.
   * Looks up product price/cost and commission rate from DB.
   */
  async validateDiscountFull({ productId, proposedDiscountPct, employeeId, role }) {
    // Look up product (include cents-based pricing columns as fallback)
    const prodResult = await this.pool.query(
      'SELECT id, name, price, cost, cost_cents, msrp_cents, retail_price_cents, category FROM products WHERE id = $1',
      [productId]
    );
    if (!prodResult.rows[0]) {
      return { allowed: false, reason: 'Product not found', calculations: null, escalation_required: false, escalation_reason: null };
    }
    const product = prodResult.rows[0];
    // Resolve price: prefer dollars column, fallback to cents conversion
    const originalPrice = product.price ? parseFloat(product.price)
      : product.msrp_cents ? parseFloat(product.msrp_cents) / 100
      : product.retail_price_cents ? parseFloat(product.retail_price_cents) / 100
      : 0;
    // Resolve cost: prefer dollars column, fallback to cents conversion
    const productCost = product.cost ? parseFloat(product.cost)
      : product.cost_cents ? parseFloat(product.cost_cents) / 100
      : 0;
    const discountPct = parseFloat(proposedDiscountPct);

    // Look up commission rate for this product's category
    let commissionRate = 0.05; // default 5%
    const ruleResult = await this.pool.query(
      `SELECT commission_percent FROM commission_rules
       WHERE (product_category = $1 OR product_category IS NULL) AND is_active = true
       ORDER BY CASE WHEN product_category = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [product.category]
    );
    if (ruleResult.rows[0]) {
      commissionRate = parseFloat(ruleResult.rows[0].commission_percent) / 100;
    }

    // Get tier
    const tier = await this.getEmployeeTier(employeeId, role);

    // Get budget
    const budget = await this.getEmployeeBudget(employeeId);

    // --- Calculations ---
    const marginBeforePct = originalPrice > 0 ? ((originalPrice - productCost) / originalPrice) * 100 : 0;
    const marginBeforeDollars = originalPrice - productCost;
    const discountAmount = +(originalPrice * discountPct / 100).toFixed(2);
    const priceAfterDiscount = +(originalPrice - discountAmount).toFixed(2);
    const marginAfterPct = originalPrice > 0 ? ((priceAfterDiscount - productCost) / originalPrice) * 100 : 0;
    const marginAfterDollars = +(priceAfterDiscount - productCost).toFixed(2);

    const commissionBefore = +(originalPrice * commissionRate).toFixed(2);
    const commissionAfter = +(priceAfterDiscount * commissionRate).toFixed(2);
    const commissionImpact = +(commissionAfter - commissionBefore).toFixed(2);

    const budgetRemainingBefore = budget
      ? +(parseFloat(budget.total_budget_dollars) - parseFloat(budget.used_dollars)).toFixed(2)
      : null;
    const budgetRemainingAfter = budgetRemainingBefore != null
      ? +(budgetRemainingBefore - discountAmount).toFixed(2)
      : null;

    // --- Tier-based limits ---
    let maxAllowedPct = null;
    let minMarginFloor = null;
    let costFloorPrice = null;

    if (tier && !tier.is_unrestricted) {
      const highMarginThreshold = parseFloat(tier.high_margin_threshold) || 30;
      const isHighMargin = marginBeforePct >= highMarginThreshold;
      maxAllowedPct = isHighMargin
        ? parseFloat(tier.max_discount_pct_high_margin)
        : parseFloat(tier.max_discount_pct_standard);
      minMarginFloor = parseFloat(tier.min_margin_floor_pct) || 0;
      costFloorPrice = +(productCost * (1 + minMarginFloor / 100)).toFixed(2);
    }

    const maxAllowedDollars = maxAllowedPct != null
      ? +(originalPrice * maxAllowedPct / 100).toFixed(2)
      : null;

    const calculations = {
      original_price: +originalPrice.toFixed(2),
      product_cost: +productCost.toFixed(2),
      margin_before_discount_pct: +marginBeforePct.toFixed(1),
      margin_before_discount_dollars: +marginBeforeDollars.toFixed(2),
      discount_amount: discountAmount,
      price_after_discount: priceAfterDiscount,
      margin_after_discount_pct: +marginAfterPct.toFixed(1),
      margin_after_discount_dollars: marginAfterDollars,
      cost_floor_price: costFloorPrice,
      max_allowed_discount_pct: maxAllowedPct,
      max_allowed_discount_dollars: maxAllowedDollars,
      commission_before_discount: commissionBefore,
      commission_after_discount: commissionAfter,
      commission_impact: commissionImpact,
      budget_remaining_before: budgetRemainingBefore,
      budget_remaining_after: budgetRemainingAfter,
    };

    // --- Decision logic ---
    let allowed = true;
    let reason = 'Within authority';
    let escalationRequired = false;
    let escalationReason = null;

    if (!tier) {
      return { allowed: false, reason: 'No discount authority tier found', calculations, escalation_required: true, escalation_reason: 'No tier configured for role' };
    }

    // Unrestricted tier (master/admin) — always allowed
    if (tier.is_unrestricted) {
      return { allowed: true, reason: 'Within authority', calculations, escalation_required: false, escalation_reason: null };
    }

    // Budget exhausted check
    if (budgetRemainingBefore != null && discountAmount > budgetRemainingBefore) {
      allowed = false;
      reason = 'Budget exhausted';
      escalationRequired = true;
      escalationReason = `Discount $${discountAmount} exceeds remaining budget $${budgetRemainingBefore}`;
      return { allowed, reason, calculations, escalation_required: escalationRequired, escalation_reason: escalationReason };
    }

    // Below cost floor check
    if (costFloorPrice != null && priceAfterDiscount < costFloorPrice) {
      allowed = false;
      reason = 'Below cost floor';
      escalationRequired = true;
      escalationReason = `Price $${priceAfterDiscount} falls below cost floor $${costFloorPrice}`;
      return { allowed, reason, calculations, escalation_required: escalationRequired, escalation_reason: escalationReason };
    }

    // Exceeds tier limit check
    if (maxAllowedPct != null && discountPct > maxAllowedPct) {
      allowed = false;
      reason = 'Exceeds tier limit';
      escalationRequired = true;
      escalationReason = `${discountPct}% exceeds max allowed ${maxAllowedPct}%`;
      return { allowed, reason, calculations, escalation_required: escalationRequired, escalation_reason: escalationReason };
    }

    // Low margin approval threshold check
    const approvalThreshold = tier.requires_approval_below_margin != null
      ? parseFloat(tier.requires_approval_below_margin)
      : null;
    if (approvalThreshold != null && marginAfterPct < approvalThreshold) {
      allowed = false;
      reason = 'Low margin - escalation required';
      escalationRequired = true;
      escalationReason = `Post-discount margin ${marginAfterPct.toFixed(1)}% below threshold ${approvalThreshold}%`;
      return { allowed, reason, calculations, escalation_required: escalationRequired, escalation_reason: escalationReason };
    }

    return { allowed, reason, calculations, escalation_required: false, escalation_reason: null };
  }

  /**
   * Apply a discount — validate, record transaction, debit budget.
   * Uses a DB transaction with SELECT FOR UPDATE to prevent budget race conditions.
   * @param {object} opts
   * @param {number|null} opts.approvedBy - Manager ID if applying via approved escalation
   */
  async applyDiscount({ productId, originalPrice, cost, discountPct, employeeId, role, saleId, saleItemId, reason, approvedBy }) {
    const validation = await this.validateDiscount({ productId, originalPrice, cost, discountPct, employeeId, role });

    if (!validation.approved) {
      // Not approved — create escalation if manager approval is possible
      if (validation.requiresManagerApproval) {
        const discountedPrice = originalPrice * (1 - discountPct / 100);
        const commissionImpact = originalPrice * (discountPct / 100) * 0.05; // rough 5% commission rate
        const escalation = await this.createEscalation({
          employeeId,
          productId,
          discountPct,
          reason: reason || validation.reason,
          marginAfter: validation.marginAfter,
          commissionImpact: +commissionImpact.toFixed(2),
        });

        return {
          approved: false,
          escalationId: escalation.id,
          requiresManagerApproval: true,
          reason: validation.reason,
          marginBefore: validation.marginBefore,
          marginAfter: validation.marginAfter,
        };
      }

      return {
        approved: false,
        requiresManagerApproval: false,
        reason: validation.reason,
      };
    }

    // Record the discount transaction inside a DB transaction
    const discountAmount = originalPrice * (discountPct / 100);
    const priceAfterDiscount = originalPrice - discountAmount;
    const commissionImpact = discountAmount * 0.05;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the budget row with FOR UPDATE to prevent concurrent discount race conditions
      let budgetRow = null;
      const budgetResult = await client.query(
        `SELECT * FROM discount_budgets
         WHERE employee_id = $1
           AND budget_period_start <= CURRENT_DATE
           AND budget_period_end >= CURRENT_DATE
         ORDER BY budget_period_start DESC
         LIMIT 1
         FOR UPDATE`,
        [employeeId]
      );
      budgetRow = budgetResult.rows[0] || null;

      const txResult = await client.query(
        `INSERT INTO discount_transactions
          (sale_id, sale_item_id, employee_id, product_id, original_price,
           discount_pct, discount_amount, price_after_discount, product_cost,
           margin_before_discount, margin_after_discount, commission_impact,
           was_auto_approved, required_manager_approval, approval_reason,
           budget_period_id, approved_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING id`,
        [
          saleId || null,
          saleItemId || null,
          employeeId,
          productId,
          originalPrice,
          discountPct,
          +discountAmount.toFixed(2),
          +priceAfterDiscount.toFixed(2),
          cost,
          validation.marginBefore,
          validation.marginAfter,
          +commissionImpact.toFixed(2),
          !approvedBy, // auto-approved if no manager involved
          !!approvedBy, // required_manager_approval if manager approved
          reason || null,
          budgetRow ? budgetRow.id : null,
          approvedBy || null,
        ]
      );

      // Debit budget if one exists
      if (budgetRow) {
        await client.query(
          `UPDATE discount_budgets
           SET used_dollars = used_dollars + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [+discountAmount.toFixed(2), budgetRow.id]
        );
      }

      await client.query('COMMIT');

      return {
        approved: true,
        transactionId: txResult.rows[0].id,
        discountAmount: +discountAmount.toFixed(2),
        priceAfterDiscount: +priceAfterDiscount.toFixed(2),
        marginBefore: validation.marginBefore,
        marginAfter: validation.marginAfter,
        budgetRemaining: budgetRow
          ? +(parseFloat(budgetRow.total_budget_dollars) - parseFloat(budgetRow.used_dollars) - discountAmount).toFixed(2)
          : null,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Initialize a weekly budget for an employee
   * Uses ON CONFLICT to avoid duplicates
   */
  async initializeBudget(employeeId, totalBudget) {
    // If no budget provided, look up the tier default or use 500
    if (totalBudget == null) {
      const userResult = await this.pool.query('SELECT role FROM users WHERE id = $1', [employeeId]);
      if (userResult.rows[0]) {
        const tier = await this.getEmployeeTier(employeeId, userResult.rows[0].role);
        // No tier-level budget column exists, so use sensible default
        totalBudget = 500.00;
      } else {
        totalBudget = 500.00;
      }
    }

    // Calculate current week boundaries (Monday-Sunday)
    const result = await this.pool.query(
      `INSERT INTO discount_budgets (employee_id, budget_period_start, budget_period_end, total_budget_dollars)
       VALUES (
         $1,
         date_trunc('week', CURRENT_DATE)::date,
         (date_trunc('week', CURRENT_DATE) + interval '6 days')::date,
         $2
       )
       ON CONFLICT (employee_id, budget_period_start) DO NOTHING
       RETURNING *`,
      [employeeId, totalBudget]
    );

    // If ON CONFLICT hit, fetch the existing row
    if (result.rows.length === 0) {
      const existing = await this.getEmployeeBudget(employeeId);
      return { created: false, budget: existing };
    }

    return { created: true, budget: result.rows[0] };
  }

  /**
   * Create an escalation request for manager approval
   */
  async createEscalation({ employeeId, productId, discountPct, reason, marginAfter, commissionImpact }) {
    const result = await this.pool.query(
      `INSERT INTO discount_escalations
        (requesting_employee_id, product_id, requested_discount_pct, reason,
         margin_after_discount, commission_impact)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [employeeId, productId, discountPct, reason || null, marginAfter, commissionImpact]
    );

    return result.rows[0];
  }

  /**
   * Update a discount authority tier config
   */
  async updateTier(roleName, updates) {
    const allowedCols = [
      'max_discount_pct_standard',
      'max_discount_pct_high_margin',
      'high_margin_threshold',
      'min_margin_floor_pct',
      'requires_approval_below_margin',
      'is_unrestricted',
    ];

    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedCols.includes(key)) {
        setClauses.push(`${key} = $${idx}`);
        values.push(value);
        idx++;
      }
    }

    if (setClauses.length === 0) {
      return null;
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(roleName);

    const result = await this.pool.query(
      `UPDATE discount_authority_tiers
       SET ${setClauses.join(', ')}
       WHERE role_name = $${idx}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  /**
   * Get pending escalations for manager review
   */
  async getPendingEscalations() {
    const result = await this.pool.query(
      `SELECT de.*,
              u.first_name || ' ' || u.last_name AS employee_name,
              p.name AS product_name, p.sku AS product_sku
       FROM discount_escalations de
       JOIN users u ON u.id = de.requesting_employee_id
       LEFT JOIN products p ON p.id = de.product_id
       WHERE de.status = 'pending'
       ORDER BY de.created_at ASC`
    );
    return result.rows;
  }

  /**
   * Get escalation by ID with employee + product info
   */
  async getEscalationById(id) {
    const result = await this.pool.query(
      `SELECT de.*,
              u.first_name || ' ' || u.last_name AS employee_name,
              p.name AS product_name, p.sku AS product_sku
       FROM discount_escalations de
       JOIN users u ON u.id = de.requesting_employee_id
       LEFT JOIN products p ON p.id = de.product_id
       WHERE de.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Approve an escalation
   */
  async approveEscalation(escalationId, managerId, notes) {
    const result = await this.pool.query(
      `UPDATE discount_escalations
       SET status = 'approved',
           reviewed_by = $1,
           review_notes = $2,
           reviewed_at = NOW()
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [managerId, notes || null, escalationId]
    );
    return result.rows[0] || null;
  }

  /**
   * Deny an escalation
   */
  async denyEscalation(escalationId, managerId, reason) {
    const result = await this.pool.query(
      `UPDATE discount_escalations
       SET status = 'denied',
           reviewed_by = $1,
           review_notes = $2,
           reviewed_at = NOW()
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [managerId, reason, escalationId]
    );
    return result.rows[0] || null;
  }

  /**
   * Map user-facing role to tier role_name
   */
  _mapRole(role) {
    const normalized = (role || '').toLowerCase();
    if (normalized === 'user') return 'staff';
    if (normalized === 'admin') return 'master';
    return normalized; // 'staff', 'manager', 'master' pass through
  }
}

module.exports = DiscountAuthorityService;
