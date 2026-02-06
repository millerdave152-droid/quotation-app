/**
 * TeleTime - Locations API Routes
 * Store/warehouse location management and pickup availability
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const LocationService = require('../services/LocationService');

let locationService = null;

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/locations
 * List locations with optional filters
 * Query: ?type=store|warehouse|both&pickup_enabled=true&delivery_origin=true&active=true
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const filters = {};

  if (req.query.type) {
    if (!['store', 'warehouse', 'both'].includes(req.query.type)) {
      throw ApiError.badRequest('type must be store, warehouse, or both');
    }
    filters.type = req.query.type;
  }
  if (req.query.pickup_enabled !== undefined) {
    filters.pickupEnabled = req.query.pickup_enabled === 'true';
  }
  if (req.query.delivery_origin !== undefined) {
    filters.deliveryOrigin = req.query.delivery_origin === 'true';
  }
  if (req.query.active !== undefined) {
    filters.active = req.query.active === 'true';
  }

  const locations = await locationService.list(filters);

  res.json({
    success: true,
    data: locations,
    count: locations.length,
  });
}));

/**
 * GET /api/locations/:id
 * Get a single location with full details
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid location ID');

  const location = await locationService.getById(id);
  if (!location) {
    throw ApiError.notFound('Location');
  }

  res.json({
    success: true,
    data: location,
  });
}));

/**
 * GET /api/locations/:id/pickup-availability
 * Check pickup availability for a specific date
 * Query: ?date=2026-02-15
 */
router.get('/:id/pickup-availability', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid location ID');

  const { error, value } = Joi.object({
    date: Joi.string().isoDate().required(),
  }).validate(req.query);

  if (error) {
    throw ApiError.badRequest('date query parameter is required in YYYY-MM-DD format');
  }

  const availability = await locationService.getPickupAvailability(id, value.date);

  res.json({
    success: true,
    data: availability,
  });
}));

// ============================================================================
// INITIALIZATION
// ============================================================================

const init = (deps) => {
  locationService = new LocationService(deps.pool);
  return router;
};

module.exports = { init };
