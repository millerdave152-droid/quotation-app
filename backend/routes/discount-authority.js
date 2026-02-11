/**
 * TeleTime POS - Discount Authority Routes
 *
 * API endpoints for tier-based discount permissions,
 * budget tracking, and escalation workflows.
 * Includes fraud detection integration and audit logging.
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

/**
 * Initialize routes with services
 * @param {DiscountAuthorityService} discountAuthorityService
 * @param {FraudDetectionService} [fraudService] - Optional fraud detection service
 */
module.exports = function (discountAuthorityService, fraudService) {
  // Apply authentication to all routes
  router.use(authenticate);

  // ============================================================================
  // TIER LOOKUP
  // ============================================================================

  /**
   * GET /api/discount-authority/my-tier
   * Get the current user's tier config + active budget
   */
  router.get('/my-tier', asyncHandler(async (req, res) => {
    const tier = await discountAuthorityService.getEmployeeTier(req.user.id, req.user.role);
    const budget = await discountAuthorityService.getEmployeeBudget(req.user.id);

    res.json({
      success: true,
      data: { tier, budget },
    });
  }));

  /**
   * GET /api/discount-authority/tiers
   * List all tier configurations (manager+ only)
   */
  router.get('/tiers', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
    const result = await discountAuthorityService.pool.query(
      'SELECT * FROM discount_authority_tiers ORDER BY id'
    );

    res.json({
      success: true,
      data: result.rows,
    });
  }));

  /**
   * PUT /api/discount-authority/tiers/:role
   * Update a tier configuration (admin only)
   */
  router.put('/tiers/:role', requireRole('admin'), asyncHandler(async (req, res) => {
    const { role } = req.params;
    const updated = await discountAuthorityService.updateTier(role, req.body);

    if (!updated) {
      throw ApiError.notFound('Tier');
    }

    // Audit: tier configuration change
    if (fraudService) {
      await fraudService.logAuditEntry(
        req.user.id, 'discount_tier_update', 'discount_authority_tier', updated.id,
        { role_name: role, changes: req.body }, req
      );
    }

    res.json({
      success: true,
      data: updated,
    });
  }));

  // ============================================================================
  // DISCOUNT VALIDATION & APPLICATION
  // ============================================================================

  /**
   * POST /api/discount-authority/validate
   * Validate a proposed discount with full calculations
   * Body: { product_id, proposed_discount_pct, employee_id? }
   */
  router.post('/validate', asyncHandler(async (req, res) => {
    const { product_id, proposed_discount_pct, employee_id } = req.body;

    if (product_id == null || proposed_discount_pct == null) {
      throw ApiError.badRequest('product_id and proposed_discount_pct are required');
    }

    const targetEmployeeId = employee_id || req.user.id;

    // If looking up another employee, need manager+ role
    if (employee_id && employee_id !== req.user.id) {
      const userRole = req.user.role?.toLowerCase();
      if (!['manager', 'admin'].includes(userRole)) {
        throw ApiError.forbidden('Only managers can validate discounts for other employees');
      }
    }

    // Look up the target employee's role
    let targetRole = req.user.role;
    if (employee_id && employee_id !== req.user.id) {
      const empResult = await discountAuthorityService.pool.query(
        'SELECT role FROM users WHERE id = $1', [employee_id]
      );
      if (!empResult.rows[0]) {
        throw ApiError.notFound('Employee');
      }
      targetRole = empResult.rows[0].role;
    }

    const result = await discountAuthorityService.validateDiscountFull({
      productId: parseInt(product_id, 10),
      proposedDiscountPct: parseFloat(proposed_discount_pct),
      employeeId: targetEmployeeId,
      role: targetRole,
    });

    res.json(result);
  }));

  /**
   * POST /api/discount-authority/apply
   * Apply a discount: validate, record transaction, debit budget.
   * Includes fraud risk assessment and audit logging.
   */
  router.post('/apply', asyncHandler(async (req, res) => {
    const { productId, originalPrice, cost, discountPct, saleId, saleItemId, reason, approvedBy } = req.body;

    if (originalPrice == null || cost == null || discountPct == null) {
      throw ApiError.badRequest('originalPrice, cost, and discountPct are required');
    }

    // Fraud risk assessment before applying
    let fraudResult = null;
    if (fraudService) {
      fraudResult = await fraudService.assessDiscount(
        {
          employee_id: req.user.id,
          product_id: productId,
          discount_pct: parseFloat(discountPct),
          discount_amount: parseFloat(originalPrice) * parseFloat(discountPct) / 100,
          original_price: parseFloat(originalPrice),
        },
        req.user.id
      );

      // Block if fraud score is too high
      if (fraudResult.action === 'block') {
        // Audit the blocked attempt
        await fraudService.logAuditEntry(
          req.user.id, 'discount_blocked_fraud', 'discount_transaction', null,
          {
            product_id: productId, discount_pct: discountPct,
            risk_score: fraudResult.riskScore, alert_id: fraudResult.alertId,
            triggered_rules: fraudResult.triggeredRules.map(tr => tr.rule.rule_code),
          }, req
        );

        return res.status(403).json({
          success: false,
          error: 'Discount blocked by fraud detection',
          fraud: {
            riskScore: fraudResult.riskScore,
            action: fraudResult.action,
            alertId: fraudResult.alertId,
          },
        });
      }
    }

    const result = await discountAuthorityService.applyDiscount({
      productId: productId || null,
      originalPrice: parseFloat(originalPrice),
      cost: parseFloat(cost),
      discountPct: parseFloat(discountPct),
      employeeId: req.user.id,
      role: req.user.role,
      saleId: saleId || null,
      saleItemId: saleItemId || null,
      reason: reason || null,
      approvedBy: approvedBy || null,
    });

    // Audit logging for applied discounts
    if (fraudService && result.approved) {
      await fraudService.logAuditEntry(
        req.user.id, 'discount_apply', 'discount_transaction', result.transactionId,
        {
          product_id: productId,
          discount_pct: discountPct,
          discount_amount: result.discountAmount,
          original_price: originalPrice,
          price_after: result.priceAfterDiscount,
          margin_before: result.marginBefore,
          margin_after: result.marginAfter,
          budget_remaining: result.budgetRemaining,
          approved_by: approvedBy || null,
          risk_score: fraudResult?.riskScore || 0,
          fraud_alert_id: fraudResult?.alertId || null,
        }, req
      );
    }

    // Include fraud info in response if there were triggered rules (but not blocked)
    const responseData = { ...result };
    if (fraudResult && fraudResult.triggeredRules.length > 0) {
      responseData.fraud = {
        riskScore: fraudResult.riskScore,
        action: fraudResult.action,
        alertId: fraudResult.alertId,
      };
    }

    res.json({
      success: true,
      data: responseData,
    });
  }));

  // ============================================================================
  // BUDGET MANAGEMENT
  // ============================================================================

  /**
   * GET /api/discount-authority/budget/:employeeId
   * Get budget for an employee (self or manager+ can view any)
   */
  router.get('/budget/:employeeId', asyncHandler(async (req, res) => {
    const employeeId = parseInt(req.params.employeeId, 10);
    const userRole = req.user.role?.toLowerCase();
    const isSelf = req.user.id === employeeId;
    const isManagerOrAbove = ['manager', 'admin'].includes(userRole);

    if (!isSelf && !isManagerOrAbove) {
      throw ApiError.forbidden('You can only view your own budget');
    }

    const budget = await discountAuthorityService.getEmployeeBudget(employeeId);

    res.json({
      success: true,
      data: budget,
    });
  }));

  /**
   * POST /api/discount-authority/budget/initialize
   * Create a weekly budget for the current user if one doesn't exist
   */
  router.post('/budget/initialize', asyncHandler(async (req, res) => {
    const { totalBudget } = req.body;

    const result = await discountAuthorityService.initializeBudget(
      req.user.id,
      totalBudget != null ? parseFloat(totalBudget) : undefined
    );

    res.json({
      success: true,
      data: result,
    });
  }));

  return router;
};
