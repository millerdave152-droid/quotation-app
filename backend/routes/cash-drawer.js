/**
 * Cash Drawer Routes
 * API endpoints for cash drawer management
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

// Module state
let cashDrawerService = null;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const denominationsSchema = Joi.object({
  bills_100: Joi.number().integer().min(0).default(0),
  bills_50: Joi.number().integer().min(0).default(0),
  bills_20: Joi.number().integer().min(0).default(0),
  bills_10: Joi.number().integer().min(0).default(0),
  bills_5: Joi.number().integer().min(0).default(0),
  coins_200: Joi.number().integer().min(0).default(0),
  coins_100: Joi.number().integer().min(0).default(0),
  coins_25: Joi.number().integer().min(0).default(0),
  coins_10: Joi.number().integer().min(0).default(0),
  coins_5: Joi.number().integer().min(0).default(0),
  rolls_200: Joi.number().integer().min(0).default(0),
  rolls_100: Joi.number().integer().min(0).default(0),
  rolls_25: Joi.number().integer().min(0).default(0),
  rolls_10: Joi.number().integer().min(0).default(0),
  rolls_5: Joi.number().integer().min(0).default(0)
}).optional();

const openDrawerSchema = Joi.object({
  registerId: Joi.number().integer().positive().required(),
  openingCash: Joi.number().precision(2).min(0).required(),
  denominations: denominationsSchema,
  notes: Joi.string().max(500).optional().allow('')
});

const closeDrawerSchema = Joi.object({
  shiftId: Joi.number().integer().positive().required(),
  closingCash: Joi.number().precision(2).min(0).required(),
  denominations: denominationsSchema,
  blindClose: Joi.boolean().default(false),
  notes: Joi.string().max(500).optional().allow('')
});

const cashMovementSchema = Joi.object({
  shiftId: Joi.number().integer().positive().required(),
  movementType: Joi.string().valid(
    'paid_out', 'drop', 'pickup', 'add', 'float_adjust', 'refund', 'correction'
  ).required(),
  amount: Joi.number().precision(2).positive().required(),
  reason: Joi.string().min(1).max(255).required(),
  referenceNumber: Joi.string().max(50).optional().allow('', null),
  approvedBy: Joi.number().integer().positive().optional(),
  notes: Joi.string().max(500).optional().allow('')
});

const noSaleSchema = Joi.object({
  shiftId: Joi.number().integer().positive().required(),
  reason: Joi.string().max(255).default('No Sale')
});

// ============================================================================
// DRAWER OPERATIONS
// ============================================================================

/**
 * POST /api/cash-drawer/open
 * Open a cash drawer (start shift)
 */
router.post('/open', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = openDrawerSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const result = await cashDrawerService.openDrawer({
    ...value,
    userId: req.user.id
  });

  res.status(201).json({
    success: true,
    data: result
  });
}));

/**
 * POST /api/cash-drawer/close
 * Close a cash drawer (end shift)
 */
router.post('/close', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = closeDrawerSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const result = await cashDrawerService.closeDrawer({
    ...value,
    userId: req.user.id
  });

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /api/cash-drawer/no-sale
 * Open drawer without a sale (for change, etc.)
 */
router.post('/no-sale', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = noSaleSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const result = await cashDrawerService.noSaleOpen(
    value.shiftId,
    req.user.id,
    value.reason
  );

  res.json({
    success: true,
    data: result
  });
}));

// ============================================================================
// CASH MOVEMENTS
// ============================================================================

/**
 * POST /api/cash-drawer/movement
 * Record a cash movement (paid-out, drop, add)
 */
router.post('/movement', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = cashMovementSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  // Require manager approval for paid-outs over $100
  if (value.movementType === 'paid_out' && value.amount > 100 && !value.approvedBy) {
    if (!['admin', 'manager'].includes(req.user.role)) {
      throw ApiError.forbidden('Paid-outs over $100 require manager approval');
    }
    value.approvedBy = req.user.id;
  }

  const result = await cashDrawerService.recordCashMovement({
    ...value,
    userId: req.user.id
  });

  res.status(201).json({
    success: true,
    data: result
  });
}));

/**
 * GET /api/cash-drawer/movements/:shiftId
 * Get all movements for a shift
 */
router.get('/movements/:shiftId', authenticate, asyncHandler(async (req, res) => {
  const shiftId = parseInt(req.params.shiftId, 10);
  if (isNaN(shiftId)) {
    throw ApiError.badRequest('Invalid shift ID');
  }

  const movements = await cashDrawerService.getShiftMovements(shiftId);

  res.json({
    success: true,
    data: movements
  });
}));

// ============================================================================
// SHIFT & REPORTS
// ============================================================================

/**
 * GET /api/cash-drawer/shift/:shiftId
 * Get detailed shift summary
 */
router.get('/shift/:shiftId', authenticate, asyncHandler(async (req, res) => {
  const shiftId = parseInt(req.params.shiftId, 10);
  if (isNaN(shiftId)) {
    throw ApiError.badRequest('Invalid shift ID');
  }

  const summary = await cashDrawerService.getShiftSummary(shiftId);

  res.json({
    success: true,
    data: summary
  });
}));

/**
 * GET /api/cash-drawer/register/:registerId/current
 * Get current open shift for a register
 */
router.get('/register/:registerId/current', authenticate, asyncHandler(async (req, res) => {
  const registerId = parseInt(req.params.registerId, 10);
  if (isNaN(registerId)) {
    throw ApiError.badRequest('Invalid register ID');
  }

  const shift = await cashDrawerService.getOpenShift(registerId);

  res.json({
    success: true,
    data: shift
  });
}));

/**
 * GET /api/cash-drawer/daily-summary
 * Get daily summary report
 */
router.get('/daily-summary', authenticate, asyncHandler(async (req, res) => {
  const { date, registerId } = req.query;

  if (!date) {
    throw ApiError.badRequest('Date parameter is required');
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw ApiError.badRequest('Invalid date format. Use YYYY-MM-DD');
  }

  const regId = registerId ? parseInt(registerId, 10) : null;

  const summary = await cashDrawerService.getDailySummary(date, regId);

  res.json({
    success: true,
    data: summary
  });
}));

/**
 * GET /api/cash-drawer/safe-drops
 * Get safe drops for a date range
 */
router.get('/safe-drops', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    throw ApiError.badRequest('startDate and endDate are required');
  }

  const drops = await cashDrawerService.getSafeDrops(startDate, endDate);

  res.json({
    success: true,
    data: drops
  });
}));

/**
 * GET /api/cash-drawer/eod-report
 * Generate end-of-day closing report
 */
router.get('/eod-report', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const { date } = req.query;

  if (!date) {
    throw ApiError.badRequest('Date parameter is required');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw ApiError.badRequest('Invalid date format. Use YYYY-MM-DD');
  }

  const report = await cashDrawerService.generateEODReport(date);

  res.json({
    success: true,
    data: report
  });
}));

/**
 * GET /api/cash-drawer/calculate-denominations
 * Calculate total from denomination counts (utility endpoint)
 */
router.post('/calculate-denominations', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = denominationsSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const total = cashDrawerService.calculateDenominationTotal(value || {});

  res.json({
    success: true,
    data: {
      denominations: value,
      total
    }
  });
}));

// ============================================================================
// INITIALIZATION
// ============================================================================

const init = (deps) => {
  cashDrawerService = deps.cashDrawerService;
  return router;
};

module.exports = { init };
