/**
 * TeleTime POS - Manager Override Routes
 *
 * API endpoints for manager approval workflows
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

/**
 * Initialize routes with service
 * @param {ManagerOverrideService} overrideService
 */
module.exports = function (overrideService) {
  // Apply authentication to all routes
  router.use(authenticate);
  // ============================================================================
  // THRESHOLD CHECKING
  // ============================================================================

  /**
   * POST /api/manager-overrides/check
   * Check if an action requires manager approval
   */
  router.post('/check', asyncHandler(async (req, res) => {
    const { overrideType, value, context } = req.body;

    if (!overrideType) {
      throw ApiError.badRequest('Override type is required');
    }

    const result = await overrideService.checkRequiresApproval(
      overrideType,
      parseFloat(value) || 0,
      context || {}
    );

    res.json({
      success: true,
      data: result,
    });
  }));

  /**
   * POST /api/manager-overrides/check-discount
   * Comprehensive discount check (percentage, amount, margin)
   */
  router.post('/check-discount', asyncHandler(async (req, res) => {
    const {
      originalPrice,
      discountedPrice,
      quantity = 1,
      cost = null,
      context = {},
    } = req.body;

    if (originalPrice === undefined || discountedPrice === undefined) {
      throw ApiError.badRequest('originalPrice and discountedPrice are required');
    }

    const result = await overrideService.checkDiscountApproval(
      parseFloat(originalPrice),
      parseFloat(discountedPrice),
      parseInt(quantity, 10),
      cost !== null ? parseFloat(cost) : null,
      context
    );

    res.json({
      success: true,
      data: result,
    });
  }));

  // ============================================================================
  // PIN VERIFICATION
  // ============================================================================

  // Rate limiting for PIN verification
  const pinAttempts = new Map(); // ip -> { count, resetAt }
  const PIN_MAX_ATTEMPTS = 5;
  const PIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

  /**
   * POST /api/manager-overrides/verify-pin
   * Validate manager PIN
   */
  router.post('/verify-pin', asyncHandler(async (req, res) => {
    // Rate limit by IP
    const ip = req.ip;
    const now = Date.now();
    const attempt = pinAttempts.get(ip);
    if (attempt && now < attempt.resetAt) {
      if (attempt.count >= PIN_MAX_ATTEMPTS) {
        throw new ApiError('RATE_LIMITED', 'Too many PIN attempts. Please wait before trying again.');
      }
    } else if (attempt && now >= attempt.resetAt) {
      pinAttempts.delete(ip);
    }

    const { pin, requiredLevel = 'manager', userId = null } = req.body;

    if (!pin) {
      throw ApiError.badRequest('PIN is required');
    }

    const result = await overrideService.validateManagerPin(
      pin,
      requiredLevel,
      userId
    );

    // Don't expose internal error details for security
    if (!result.valid) {
      // Track failed attempt for rate limiting
      const existing = pinAttempts.get(ip) || { count: 0, resetAt: now + PIN_LOCKOUT_MS };
      existing.count++;
      pinAttempts.set(ip, existing);

      throw ApiError.unauthorized(result.error);
    }

    // Clear attempts on success
    pinAttempts.delete(ip);

    res.json({
      success: true,
      valid: true,
      data: {
        managerId: result.managerId,
        managerName: result.managerName,
        approvalLevel: result.approvalLevel,
        remainingOverrides: result.remainingOverrides,
      },
    });
  }));

  /**
   * POST /api/manager-overrides/set-pin
   * Set or update a manager's PIN (admin only)
   */
  router.post('/set-pin', requireRole(['admin']), asyncHandler(async (req, res) => {
    const {
      userId,
      pin,
      approvalLevel = 'manager',
      maxDailyOverrides = null,
      validUntil = null,
    } = req.body;

    if (!userId || !pin) {
      throw ApiError.badRequest('userId and pin are required');
    }

    const result = await overrideService.setManagerPin(
      parseInt(userId, 10),
      pin,
      approvalLevel,
      {
        maxDailyOverrides,
        validUntil,
        createdBy: req.user?.id,
      }
    );

    if (!result.success) {
      throw ApiError.badRequest(result.error);
    }

    res.json({
      success: true,
      data: {
        pinId: result.pinId,
        message: 'PIN set successfully',
      },
    });
  }));

  /**
   * GET /api/manager-overrides/check-access/:userId
   * Check if a user has manager access
   */
  router.get('/check-access/:userId', asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const result = await overrideService.hasManagerAccess(parseInt(userId, 10));

    res.json({
      success: true,
      data: result,
    });
  }));

  // ============================================================================
  // OVERRIDE LOGGING
  // ============================================================================

  /**
   * POST /api/manager-overrides/log
   * Log an override action
   */
  router.post('/log', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
    const details = {
      ...req.body,
      approvedBy: req.user.id, // Use authenticated user, not client-supplied value
      ipAddress: req.ip,
    };

    if (!details.overrideType) {
      throw ApiError.badRequest('overrideType is required');
    }

    const result = await overrideService.logOverride(details);

    if (!result.success) {
      throw ApiError.internal(result.error || 'Operation failed');
    }

    res.json({
      success: true,
      data: {
        logId: result.logId,
      },
    });
  }));

  /**
   * POST /api/manager-overrides/approve
   * Approve an action with PIN verification and logging in one call
   */
  router.post('/approve', asyncHandler(async (req, res) => {
    const {
      pin,
      overrideType,
      thresholdId = null,
      transactionId = null,
      quotationId = null,
      shiftId = null,
      cashierId = null,
      originalValue,
      overrideValue,
      reason = null,
      productId = null,
      productName = null,
      quantity = null,
      requiredLevel = 'manager',
    } = req.body;

    if (!pin || !overrideType) {
      throw ApiError.badRequest('pin and overrideType are required');
    }

    // Verify PIN
    const pinResult = await overrideService.validateManagerPin(pin, requiredLevel);

    if (!pinResult.valid) {
      // Log the denied attempt
      await overrideService.logOverride({
        overrideType,
        thresholdId,
        transactionId,
        quotationId,
        shiftId,
        cashierId,
        approvedBy: pinResult.managerId || null,
        originalValue: parseFloat(originalValue) || 0,
        overrideValue: parseFloat(overrideValue) || 0,
        wasApproved: false,
        denialReason: pinResult.error,
        productId,
        productName,
        quantity,
        ipAddress: req.ip,
      });

      throw ApiError.unauthorized(pinResult.error);
    }

    // Log the approved override
    const logResult = await overrideService.logOverride({
      overrideType,
      thresholdId,
      transactionId,
      quotationId,
      shiftId,
      cashierId,
      approvedBy: pinResult.managerId,
      originalValue: parseFloat(originalValue) || 0,
      overrideValue: parseFloat(overrideValue) || 0,
      wasApproved: true,
      reason,
      productId,
      productName,
      quantity,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      approved: true,
      data: {
        logId: logResult.logId,
        managerId: pinResult.managerId,
        managerName: pinResult.managerName,
        approvalLevel: pinResult.approvalLevel,
      },
    });
  }));

  // ============================================================================
  // OVERRIDE REQUESTS (Async Approval Flow)
  // ============================================================================

  /**
   * POST /api/manager-overrides/requests
   * Create a new override request
   */
  router.post('/requests', asyncHandler(async (req, res) => {
    const result = await overrideService.createOverrideRequest({
      ...req.body,
      requestedBy: req.body.requestedBy || req.user?.id,
    });

    if (!result.success) {
      throw ApiError.internal(result.error || 'Operation failed');
    }

    res.status(201).json({
      success: true,
      data: {
        requestId: result.requestId,
        requestCode: result.requestCode,
        expiresAt: result.expiresAt,
      },
    });
  }));

  /**
   * GET /api/manager-overrides/requests/pending
   * Get pending override requests
   */
  router.get('/requests/pending', asyncHandler(async (req, res) => {
    const { shiftId, registerId, limit } = req.query;

    const result = await overrideService.getPendingRequests({
      shiftId: shiftId ? parseInt(shiftId, 10) : null,
      registerId: registerId ? parseInt(registerId, 10) : null,
      limit: limit ? parseInt(limit, 10) : 50,
    });

    res.json({
      success: true,
      data: result.requests,
    });
  }));

  /**
   * POST /api/manager-overrides/requests/:id/resolve
   * Approve or deny a pending request
   */
  router.post('/requests/:id/resolve', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { pin, approved, reason } = req.body;

    if (!pin || approved === undefined) {
      throw ApiError.badRequest('pin and approved are required');
    }

    const result = await overrideService.resolveRequest(
      parseInt(id, 10),
      pin,
      approved,
      reason
    );

    if (!result.success) {
      if (result.lockedUntil) {
        throw ApiError.unauthorized(result.error);
      }
      throw ApiError.badRequest(result.error);
    }

    res.json({
      success: true,
      data: {
        approved: result.approved,
        logId: result.logId,
        managerId: result.managerId,
        managerName: result.managerName,
      },
    });
  }));

  // ============================================================================
  // THRESHOLDS
  // ============================================================================

  /**
   * GET /api/manager-overrides/thresholds
   * Get all override thresholds
   */
  router.get('/thresholds', asyncHandler(async (req, res) => {
    const result = await overrideService.getOverrideThresholds();

    res.json({
      success: true,
      data: result.thresholds,
    });
  }));

  /**
   * GET /api/manager-overrides/thresholds/config
   * Get all thresholds with full configuration including approval levels (admin UI)
   */
  router.get('/thresholds/config', asyncHandler(async (req, res) => {
    const { channel, includeInactive, categoryId } = req.query;

    const result = await overrideService.getThresholdsWithConfig({
      channel,
      includeInactive: includeInactive === 'true',
      categoryId: categoryId ? parseInt(categoryId, 10) : null,
    });

    if (!result.success) {
      throw ApiError.internal(result.error || 'Operation failed');
    }

    res.json({
      success: true,
      data: result.thresholds,
    });
  }));

  /**
   * POST /api/manager-overrides/thresholds
   * Create a new threshold (admin only)
   */
  router.post('/thresholds', requireRole(['admin']), asyncHandler(async (req, res) => {
    const result = await overrideService.createThreshold({
      ...req.body,
      createdBy: req.user?.id,
    });

    if (!result.success) {
      throw ApiError.badRequest(result.error);
    }

    res.status(201).json({
      success: true,
      data: result.threshold,
    });
  }));

  /**
   * PUT /api/manager-overrides/thresholds/:id
   * Update a threshold (admin only)
   */
  router.put('/thresholds/:id', requireRole(['admin']), asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await overrideService.updateThreshold(
      parseInt(id, 10),
      req.body
    );

    if (!result.success) {
      throw ApiError.badRequest(result.error);
    }

    res.json({
      success: true,
      data: result.threshold,
    });
  }));

  // ============================================================================
  // APPROVAL LEVELS (Tiered Approvals)
  // ============================================================================

  /**
   * GET /api/manager-overrides/thresholds/:id/approval-levels
   * Get approval levels for a threshold
   */
  router.get('/thresholds/:id/approval-levels', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await overrideService.getThresholdApprovalLevels(
      parseInt(id, 10)
    );

    if (!result.success) {
      throw ApiError.internal(result.error || 'Operation failed');
    }

    res.json({
      success: true,
      data: result.levels,
    });
  }));

  /**
   * PUT /api/manager-overrides/thresholds/:id/approval-levels/:level
   * Set/update an approval level for a threshold (admin only)
   */
  router.put('/thresholds/:id/approval-levels/:level', requireRole(['admin']), asyncHandler(async (req, res) => {
    const { id, level } = req.params;
    const { maxValue, maxValueCents, isUnlimited, description } = req.body;

    if (maxValue === undefined && !isUnlimited) {
      throw ApiError.badRequest('maxValue is required unless isUnlimited is true');
    }

    const validLevels = ['shift_lead', 'manager', 'area_manager', 'admin'];
    if (!validLevels.includes(level)) {
      throw ApiError.badRequest(`Invalid approval level. Must be one of: ${validLevels.join(', ')}`);
    }

    const result = await overrideService.setThresholdApprovalLevel(
      parseInt(id, 10),
      level,
      parseFloat(maxValue) || 0,
      { maxValueCents, isUnlimited, description }
    );

    if (!result.success) {
      throw ApiError.badRequest(result.error);
    }

    res.json({
      success: true,
      data: result.level,
    });
  }));

  /**
   * DELETE /api/manager-overrides/thresholds/:id/approval-levels/:level
   * Remove an approval level from a threshold (admin only)
   */
  router.delete('/thresholds/:id/approval-levels/:level', requireRole(['admin']), asyncHandler(async (req, res) => {
    const { id, level } = req.params;

    const result = await overrideService.deleteThresholdApprovalLevel(
      parseInt(id, 10),
      level
    );

    if (!result.success) {
      throw ApiError.badRequest(result.error);
    }

    res.json({
      success: true,
      message: 'Approval level removed',
    });
  }));

  /**
   * POST /api/manager-overrides/check-user-can-approve
   * Check if a user at a given level can approve a specific value
   */
  router.post('/check-user-can-approve', asyncHandler(async (req, res) => {
    const { userApprovalLevel, thresholdId, value } = req.body;

    if (!userApprovalLevel || !thresholdId || value === undefined) {
      throw ApiError.badRequest('userApprovalLevel, thresholdId, and value are required');
    }

    const result = await overrideService.canUserApproveValue(
      userApprovalLevel,
      parseInt(thresholdId, 10),
      parseFloat(value)
    );

    res.json({
      success: true,
      data: result,
    });
  }));

  /**
   * GET /api/manager-overrides/required-level
   * Get the required approval level for a threshold and value
   */
  router.get('/required-level', asyncHandler(async (req, res) => {
    const { thresholdId, value } = req.query;

    if (!thresholdId || value === undefined) {
      throw ApiError.badRequest('thresholdId and value query parameters are required');
    }

    const result = await overrideService.getRequiredApprovalLevel(
      parseInt(thresholdId, 10),
      parseFloat(value)
    );

    res.json({
      success: true,
      data: result,
    });
  }));

  // ============================================================================
  // AUDIT & HISTORY
  // ============================================================================

  /**
   * GET /api/manager-overrides/history
   * Get override history
   */
  router.get('/history', asyncHandler(async (req, res) => {
    const {
      startDate,
      endDate,
      overrideType,
      managerId,
      cashierId,
      wasApproved,
      limit,
      offset,
    } = req.query;

    const result = await overrideService.getOverrideHistory({
      startDate,
      endDate,
      overrideType,
      managerId: managerId ? parseInt(managerId, 10) : null,
      cashierId: cashierId ? parseInt(cashierId, 10) : null,
      wasApproved: wasApproved !== undefined ? wasApproved === 'true' : undefined,
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    res.json({
      success: true,
      data: result.overrides,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  }));

  /**
   * GET /api/manager-overrides/summary
   * Get override summary statistics
   */
  router.get('/summary', asyncHandler(async (req, res) => {
    const { startDate, endDate, groupBy } = req.query;

    const result = await overrideService.getOverrideSummary({
      startDate,
      endDate,
      groupBy: groupBy || 'day',
    });

    res.json({
      success: true,
      data: result.summary,
    });
  }));

  return router;
};
