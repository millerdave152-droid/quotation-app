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

/**
 * GET /api/lookup/cities
 * Search Canadian cities for autocomplete
 *
 * Query params:
 * - q: Search query (min 2 chars)
 * - province: Optional province filter (ON, QC, BC, etc.)
 * - limit: Max results (default 10, max 50)
 */
router.get('/cities', authenticate, async (req, res) => {
  try {
    const { q, province, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return res.json([]);
    }

    const maxLimit = Math.min(parseInt(limit) || 10, 50);
    const cities = await LookupService.searchCities(q, province, maxLimit);

    res.json(cities);
  } catch (err) {
    console.error('Error searching cities:', err);
    res.status(500).json({ error: 'Failed to search cities' });
  }
});

/**
 * GET /api/lookup/provinces
 * Get list of all provinces
 */
router.get('/provinces', authenticate, async (req, res) => {
  try {
    const provinces = await LookupService.getProvinces();
    res.json(provinces);
  } catch (err) {
    console.error('Error fetching provinces:', err);
    res.status(500).json({ error: 'Failed to fetch provinces' });
  }
});

/**
 * GET /api/lookup/postal-code/:code
 * Lookup postal code details (with caching)
 *
 * Returns city, province, lat/lng from cache or Geocoder.ca API
 */
router.get('/postal-code/:code', authenticate, async (req, res) => {
  try {
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({ error: 'Postal code is required' });
    }

    const result = await LookupService.lookupPostalCode(code);

    if (!result) {
      return res.status(404).json({ error: 'Postal code not found' });
    }

    res.json(result);
  } catch (err) {
    console.error('Error looking up postal code:', err);
    res.status(500).json({ error: 'Failed to lookup postal code' });
  }
});

/**
 * GET /api/lookup/names
 * Search common Canadian names for autocomplete
 *
 * Query params:
 * - q: Search query (min 2 chars)
 * - type: 'first', 'last', or omit for both
 * - limit: Max results (default 10, max 50)
 */
router.get('/names', authenticate, async (req, res) => {
  try {
    const { q, type, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return res.json([]);
    }

    const maxLimit = Math.min(parseInt(limit) || 10, 50);
    const names = await LookupService.searchNames(q, type, maxLimit);

    res.json(names);
  } catch (err) {
    console.error('Error searching names:', err);
    res.status(500).json({ error: 'Failed to search names' });
  }
});

/**
 * GET /api/lookup/frequent-postal-codes
 * Get frequently used postal codes (for quick selection)
 *
 * Query params:
 * - limit: Max results (default 10)
 */
router.get('/frequent-postal-codes', authenticate, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const postalCodes = await LookupService.getFrequentPostalCodes(parseInt(limit) || 10);
    res.json(postalCodes);
  } catch (err) {
    console.error('Error fetching frequent postal codes:', err);
    res.status(500).json({ error: 'Failed to fetch postal codes' });
  }
});

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
router.get('/names/fuzzy', authenticate, async (req, res) => {
  try {
    const { q, type, limit = 15 } = req.query;

    if (!q || q.length < 1) {
      return res.json([]);
    }

    const maxLimit = Math.min(parseInt(limit) || 15, 50);
    const names = await LookupService.fuzzySearchNames(q, type, maxLimit);

    res.json(names);
  } catch (err) {
    console.error('Error fuzzy searching names:', err);
    res.status(500).json({ error: 'Failed to search names' });
  }
});

/**
 * GET /api/lookup/names/popular
 * Get popular names for quick pick buttons
 *
 * Query params:
 * - type: 'first' or 'last' (required)
 * - limit: Number of names (default 5, max 20)
 */
router.get('/names/popular', authenticate, async (req, res) => {
  try {
    const { type, limit = 5 } = req.query;

    if (!type || (type !== 'first' && type !== 'last')) {
      return res.status(400).json({ error: 'type must be "first" or "last"' });
    }

    const maxLimit = Math.min(parseInt(limit) || 5, 20);

    let names;
    if (type === 'first') {
      names = await LookupService.getPopularFirstNames(maxLimit);
    } else {
      names = await LookupService.getPopularLastNames(maxLimit);
    }

    res.json(names);
  } catch (err) {
    console.error('Error fetching popular names:', err);
    res.status(500).json({ error: 'Failed to fetch popular names' });
  }
});

/**
 * GET /api/lookup/companies
 * Search company names from existing customers
 *
 * Query params:
 * - q: Search query (min 2 chars)
 * - limit: Max results (default 10, max 50)
 */
router.get('/companies', authenticate, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return res.json([]);
    }

    const maxLimit = Math.min(parseInt(limit) || 10, 50);
    const companies = await LookupService.searchCompanies(q, maxLimit);

    res.json(companies);
  } catch (err) {
    console.error('Error searching companies:', err);
    res.status(500).json({ error: 'Failed to search companies' });
  }
});

module.exports = router;
