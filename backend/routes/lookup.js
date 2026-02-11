/**
 * Lookup API Routes
 *
 * Provides autocomplete endpoints for:
 * - Canadian cities
 * - Postal codes
 * - Common names
 */

const express = require('express');
const router = express.Router();
const LookupService = require('../services/LookupService');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

/**
 * GET /api/lookup/cities
 * Search Canadian cities for autocomplete
 *
 * Query params:
 * - q: Search query (min 2 chars)
 * - province: Optional province filter (ON, QC, BC, etc.)
 * - limit: Max results (default 10, max 50)
 */
router.get('/cities', authenticate, asyncHandler(async (req, res) => {
  const { q, province, limit = 10 } = req.query;

  if (!q || q.length < 2) {
    return res.json([]);
  }

  const maxLimit = Math.min(parseInt(limit) || 10, 50);
  const cities = await LookupService.searchCities(q, province, maxLimit);

  res.json(cities);
}));

/**
 * GET /api/lookup/provinces
 * Get list of all provinces
 */
router.get('/provinces', authenticate, asyncHandler(async (req, res) => {
  const provinces = await LookupService.getProvinces();
  res.json(provinces);
}));

/**
 * GET /api/lookup/postal-code/:code
 * Lookup postal code details (with caching)
 *
 * Returns city, province, lat/lng from cache or Geocoder.ca API
 */
router.get('/postal-code/:code', authenticate, asyncHandler(async (req, res) => {
  const { code } = req.params;

  if (!code) {
    throw ApiError.badRequest('Postal code is required');
  }

  const result = await LookupService.lookupPostalCode(code);

  if (!result) {
    throw ApiError.notFound('Postal code');
  }

  res.json(result);
}));

/**
 * GET /api/lookup/names
 * Search common Canadian names for autocomplete
 *
 * Query params:
 * - q: Search query (min 2 chars)
 * - type: 'first', 'last', or omit for both
 * - limit: Max results (default 10, max 50)
 */
router.get('/names', authenticate, asyncHandler(async (req, res) => {
  const { q, type, limit = 10 } = req.query;

  if (!q || q.length < 2) {
    return res.json([]);
  }

  const maxLimit = Math.min(parseInt(limit) || 10, 50);
  const names = await LookupService.searchNames(q, type, maxLimit);

  res.json(names);
}));

/**
 * GET /api/lookup/frequent-postal-codes
 * Get frequently used postal codes (for quick selection)
 *
 * Query params:
 * - limit: Max results (default 10)
 */
router.get('/frequent-postal-codes', authenticate, asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const postalCodes = await LookupService.getFrequentPostalCodes(parseInt(limit) || 10);
  res.json(postalCodes);
}));

/**
 * GET /api/lookup/names/fuzzy
 * Fuzzy search names with phonetic matching
 * Finds names that sound similar (e.g., "Jon" finds "John")
 *
 * Query params:
 * - q: Search query (min 1 char)
 * - type: 'first', 'last', or omit for both
 * - limit: Max results (default 15, max 50)
 */
router.get('/names/fuzzy', authenticate, asyncHandler(async (req, res) => {
  const { q, type, limit = 15 } = req.query;

  if (!q || q.length < 1) {
    return res.json([]);
  }

  const maxLimit = Math.min(parseInt(limit) || 15, 50);
  const names = await LookupService.fuzzySearchNames(q, type, maxLimit);

  res.json(names);
}));

/**
 * GET /api/lookup/names/popular
 * Get popular names for quick pick buttons
 *
 * Query params:
 * - type: 'first' or 'last' (required)
 * - limit: Number of names (default 5, max 20)
 */
router.get('/names/popular', authenticate, asyncHandler(async (req, res) => {
  const { type, limit = 5 } = req.query;

  if (!type || (type !== 'first' && type !== 'last')) {
    throw ApiError.badRequest('type must be "first" or "last"');
  }

  const maxLimit = Math.min(parseInt(limit) || 5, 20);

  let names;
  if (type === 'first') {
    names = await LookupService.getPopularFirstNames(maxLimit);
  } else {
    names = await LookupService.getPopularLastNames(maxLimit);
  }

  res.json(names);
}));

/**
 * GET /api/lookup/companies
 * Search company names from existing customers
 *
 * Query params:
 * - q: Search query (min 2 chars)
 * - limit: Max results (default 10, max 50)
 */
router.get('/companies', authenticate, asyncHandler(async (req, res) => {
  const { q, limit = 10 } = req.query;

  if (!q || q.length < 2) {
    return res.json([]);
  }

  const maxLimit = Math.min(parseInt(limit) || 10, 50);
  const companies = await LookupService.searchCompanies(q, maxLimit);

  res.json(companies);
}));

module.exports = router;
