/**
 * TeleTime POS - Discount Escalation Routes
 *
 * API endpoints for submitting, reviewing, approving,
 * and denying discount escalation requests.
 * Includes audit logging for all escalation actions.
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

/**
 * Initialize routes with services
 * @param {DiscountAuthorityService} discountAuthorityService
 * @param {FraudDetectionService} [fraudService] - Optional fraud detection service for audit logging
 */
module.exports = function (discountAuthorityService, fraudService) {
  router.use(authenticate);

  // ============================================================================
  // STAFF: Submit escalation
  // ============================================================================

  /**
   * POST /api/discount-escalations
   * Staff submits an escalation request for a discount beyond their tier
   */
  router.post('/', asyncHandler(async (req, res) => {
    const { productId, discountPct, reason, marginAfter, commissionImpact } = req.body;

    if (productId == null || discountPct == null) {
      throw ApiError.badRequest('productId and discountPct are required');
    }

    const escalation = await discountAuthorityService.createEscalation({
      employeeId: req.user.id,
      productId,
      discountPct: parseFloat(discountPct),
      reason: reason || null,
      marginAfter: marginAfter != null ? parseFloat(marginAfter) : 0,
      commissionImpact: commissionImpact != null ? parseFloat(commissionImpact) : 0,
    });

    // Audit: escalation submitted
    if (fraudService) {
      await fraudService.logAuditEntry(
        req.user.id, 'discount_escalation_submit', 'discount_escalation', escalation.id,
        {
          product_id: productId,
          requested_discount_pct: discountPct,
          reason: reason || null,
          margin_after: marginAfter,
          commission_impact: commissionImpact,
        }, req
      );
    }

    res.json({
      success: true,
      data: escalation,
    });
  }));

  // ============================================================================
  // MANAGER+: View & resolve escalations
  // ============================================================================

  /**
   * GET /api/discount-escalations/pending
   * List all pending escalation requests (manager+ only)
   */
  router.get('/pending', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
    const escalations = await discountAuthorityService.getPendingEscalations();

    res.json({
      success: true,
      data: escalations,
    });
  }));

  /**
   * PUT /api/discount-escalations/:id/approve
   * Approve an escalation with optional notes (manager+ only)
   */
  router.put('/:id/approve', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
    const escalationId = parseInt(req.params.id, 10);
    const { notes } = req.body;

    const result = await discountAuthorityService.approveEscalation(
      escalationId,
      req.user.id,
      notes || null
    );

    if (!result) {
      throw ApiError.notFound('Escalation not found or already resolved');
    }

    // Audit: escalation approved
    if (fraudService) {
      await fraudService.logAuditEntry(
        req.user.id, 'discount_escalation_approve', 'discount_escalation', escalationId,
        {
          requesting_employee_id: result.requesting_employee_id,
          product_id: result.product_id,
          requested_discount_pct: result.requested_discount_pct,
          notes: notes || null,
        }, req
      );
    }

    res.json({
      success: true,
      data: result,
    });
  }));

  /**
   * PUT /api/discount-escalations/:id/deny
   * Deny an escalation with a required reason (manager+ only)
   */
  router.put('/:id/deny', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
    const escalationId = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      throw ApiError.badRequest('A reason is required when denying an escalation');
    }

    const result = await discountAuthorityService.denyEscalation(
      escalationId,
      req.user.id,
      reason.trim()
    );

    if (!result) {
      throw ApiError.notFound('Escalation not found or already resolved');
    }

    // Audit: escalation denied
    if (fraudService) {
      await fraudService.logAuditEntry(
        req.user.id, 'discount_escalation_deny', 'discount_escalation', escalationId,
        {
          requesting_employee_id: result.requesting_employee_id,
          product_id: result.product_id,
          requested_discount_pct: result.requested_discount_pct,
          deny_reason: reason.trim(),
        }, req
      );
    }

    res.json({
      success: true,
      data: result,
    });
  }));

  return router;
};
