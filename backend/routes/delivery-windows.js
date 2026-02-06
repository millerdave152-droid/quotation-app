/**
 * TeleTime - Delivery Window Scheduling Routes
 * API endpoints for delivery window availability, scheduling, and dispatch
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const DeliveryWindowService = require('../services/DeliveryWindowService');

let windowService = null;

// ============================================================================
// VALIDATION
// ============================================================================

const POSTAL_CODE_REGEX = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

const availableWindowsSchema = Joi.object({
  postalCode: Joi.string().pattern(POSTAL_CODE_REGEX).required()
    .messages({ 'string.pattern.base': 'Postal code must be in A1A 1A1 format' }),
  date: Joi.string().isoDate().required(),
});

const scheduleDeliverySchema = Joi.object({
  windowId: Joi.number().integer().required(),
  deliveryDate: Joi.string().isoDate().required(),
  notes: Joi.string().optional().allow('', null),
});

const updateStatusSchema = Joi.object({
  status: Joi.string().valid(
    'scheduled', 'confirmed', 'out_for_delivery', 'delivered', 'failed', 'rescheduled'
  ).required(),
  driverId: Joi.number().integer().optional().allow(null),
  routeSequence: Joi.number().integer().optional().allow(null),
  estimatedArrival: Joi.string().optional().allow('', null),
  notes: Joi.string().optional().allow('', null),
});

function validate(schema, data) {
  const { error, value } = schema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    const details = error.details.map(d => ({ field: d.path.join('.'), message: d.message }));
    throw ApiError.badRequest('Validation failed', details);
  }
  return value;
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/delivery-windows/available
 * Get available delivery windows for a postal code and date
 * Query: ?postalCode=M5V1A1&date=2026-02-15
 */
router.get('/available', authenticate, asyncHandler(async (req, res) => {
  const data = validate(availableWindowsSchema, req.query);
  const result = await windowService.getAvailableWindows(data.postalCode, data.date);

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * GET /api/delivery-windows/zones
 * Get all active delivery zones
 */
router.get('/zones', authenticate, asyncHandler(async (req, res) => {
  const zones = await windowService.getZones();

  res.json({
    success: true,
    data: zones,
  });
}));

/**
 * GET /api/delivery-windows/zones/:zoneId/configs
 * Get window configurations for a zone
 */
router.get('/zones/:zoneId/configs', authenticate, asyncHandler(async (req, res) => {
  const zoneId = parseInt(req.params.zoneId);
  if (isNaN(zoneId)) throw ApiError.badRequest('Invalid zone ID');

  const configs = await windowService.getWindowConfigs(zoneId);

  res.json({
    success: true,
    data: configs,
  });
}));

/**
 * GET /api/delivery-windows/schedule
 * Get delivery schedule for dispatch view
 * Query: ?date=2026-02-15&zoneId=1&driverId=5&status=scheduled
 */
router.get('/schedule', authenticate, asyncHandler(async (req, res) => {
  const filters = {};
  if (req.query.date) filters.date = req.query.date;
  if (req.query.zoneId) filters.zoneId = parseInt(req.query.zoneId);
  if (req.query.driverId) filters.driverId = parseInt(req.query.driverId);
  if (req.query.status) filters.status = req.query.status;

  const schedule = await windowService.getSchedule(filters);

  res.json({
    success: true,
    data: schedule,
    count: schedule.length,
  });
}));

/**
 * POST /api/delivery-windows/schedule/:id/status
 * Update a scheduled delivery status
 */
router.post('/schedule/:id/status', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid scheduled delivery ID');

  const data = validate(updateStatusSchema, req.body);
  const { status, ...options } = data;
  const result = await windowService.updateStatus(id, status, options);

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * POST /api/delivery-windows/schedule/:id/assign-driver
 * Assign a driver to a scheduled delivery
 */
router.post('/schedule/:id/assign-driver', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid scheduled delivery ID');

  const { driverId, routeSequence } = req.body;
  if (!driverId) throw ApiError.badRequest('driverId is required');

  const result = await windowService.assignDriver(id, driverId, routeSequence || null);

  res.json({
    success: true,
    data: result,
  });
}));

// ============================================================================
// INITIALIZATION
// ============================================================================

const init = (deps) => {
  windowService = new DeliveryWindowService(deps.pool);
  return router;
};

module.exports = { init };
