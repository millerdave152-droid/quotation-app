/**
 * Package Builder V2 Routes
 * Faceted filtering system for appliance packages
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const FilterCountService = require('../services/FilterCountService');
const PackageSelectionEngine = require('../services/PackageSelectionEngine');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

const filterService = new FilterCountService(pool);
const packageEngine = new PackageSelectionEngine(pool);

/**
 * GET /api/package-builder-v2/filter-options
 * Get all filter options with counts for a package type
 *
 * Query params:
 * - package_type: 'kitchen' or 'laundry'
 * - brand: comma-separated list of brands (optional)
 * - Other filters as query params
 */
router.get('/filter-options', authenticate, asyncHandler(async (req, res) => {
  const { package_type = 'kitchen', ...filters } = req.query;

  // Parse brand filter if provided
  const currentFilters = {};
  if (filters.brand) {
    currentFilters.brand = filters.brand.split(',').map(b => b.trim());
  }

  // Parse category-specific filters
  for (const [key, value] of Object.entries(filters)) {
    if (key === 'brand' || key === 'package_type') continue;

    // Check if key has category prefix (e.g., refrigerator_width)
    const parts = key.split('_');
    if (parts.length >= 2) {
      const category = parts[0];
      const filterKey = parts.slice(1).join('_');

      if (['refrigerator', 'range', 'dishwasher', 'washer', 'dryer'].includes(category)) {
        if (!currentFilters[category]) currentFilters[category] = {};
        currentFilters[category][filterKey] = value;
      }
    }
  }

  const options = await filterService.getFilterOptionsWithCounts(package_type, currentFilters);

  res.json({
    success: true,
    package_type,
    filters: options,
    applied_filters: currentFilters
  });
}));

/**
 * POST /api/package-builder-v2/generate
 * Generate Good/Better/Best packages based on applied filters
 *
 * Body:
 * {
 *   package_type: 'kitchen' | 'laundry',
 *   filters: {
 *     brand: ['Samsung'],
 *     finish: 'stainless',
 *     refrigerator: { width: '36', style: 'french_door' },
 *     range: { fuel_type: 'gas', width: '30' },
 *     dishwasher: { noise_level: 'quiet' }
 *   }
 * }
 */
router.post('/generate', authenticate, asyncHandler(async (req, res) => {
  const { package_type = 'kitchen', filters = {} } = req.body;

  // Get the template for this package type
  const templateResult = await pool.query(`
    SELECT * FROM package_templates
    WHERE package_type = $1 AND is_active = true
    ORDER BY use_count DESC LIMIT 1
  `, [package_type]);

  const template = templateResult.rows[0];
  if (!template) {
    throw ApiError.notFound(`Template for package type: ${package_type}`);
  }

  // Convert filters to the format expected by PackageSelectionEngine
  const answers = convertFiltersToAnswers(filters, package_type);

  // Generate packages using existing engine (answers, template)
  const packages = await packageEngine.generatePackages(answers, template);

  // Get updated filter counts based on current filters
  const updatedFilterCounts = await filterService.getFilterOptionsWithCounts(package_type, filters);

  res.json({
    success: true,
    package_type,
    packages,
    applied_filters: filters,
    filter_counts: updatedFilterCounts
  });
}));

/**
 * GET /api/package-builder-v2/categories/:packageType
 * Get the appliance categories for a package type
 */
router.get('/categories/:packageType', authenticate, asyncHandler(async (req, res) => {
  const { packageType } = req.params;

  const categories = packageType === 'kitchen'
    ? [
        { key: 'refrigerator', label: 'Refrigerator', icon: 'fridge' },
        { key: 'range', label: 'Range / Stove', icon: 'cooking' },
        { key: 'dishwasher', label: 'Dishwasher', icon: 'dishwasher' }
      ]
    : [
        { key: 'washer', label: 'Washer', icon: 'washer' },
        { key: 'dryer', label: 'Dryer', icon: 'dryer' }
      ];

  res.json({
    success: true,
    package_type: packageType,
    categories
  });
}));

/**
 * GET /api/package-builder-v2/brands/:packageType
 * Get available brands with counts for a package type
 */
router.get('/brands/:packageType', authenticate, asyncHandler(async (req, res) => {
  const { packageType } = req.params;

  const categories = packageType === 'kitchen'
    ? ['refrigerator', 'range', 'dishwasher']
    : ['washer', 'dryer'];

  // Get all products for the categories
  const query = `
    SELECT DISTINCT p.manufacturer, COUNT(*) as count
    FROM products p
    WHERE p.active = true
    GROUP BY p.manufacturer
    ORDER BY count DESC
  `;

  const result = await pool.query(query);

  const brands = result.rows.map(row => ({
    value: row.manufacturer,
    label: row.manufacturer,
    count: parseInt(row.count)
  }));

  res.json({
    success: true,
    package_type: packageType,
    brands
  });
}));

/**
 * POST /api/package-builder-v2/preview
 * Get a quick preview of product counts for current filters
 * (Used for real-time updates without full package generation)
 */
router.post('/preview', authenticate, asyncHandler(async (req, res) => {
  const { package_type = 'kitchen', filters = {} } = req.body;

  const categories = package_type === 'kitchen'
    ? ['refrigerator', 'range', 'dishwasher']
    : ['washer', 'dryer'];

  const preview = {};
  let totalProducts = 0;

  // Get product counts for each category with current filters
  for (const category of categories) {
    const categoryFilters = filters[category] || {};
    const products = await filterService.getFilteredProducts(
      category,
      categoryFilters,
      { brand: filters.brand }
    );

    preview[category] = {
      count: products.length,
      available: products.length > 0
    };
    totalProducts += products.length;
  }

  // Determine if we can generate packages
  const canGenerate = categories.every(c => preview[c].count > 0);

  res.json({
    success: true,
    package_type,
    preview,
    total_products: totalProducts,
    can_generate: canGenerate,
    message: canGenerate
      ? 'Ready to generate packages'
      : 'Some categories have no matching products. Try adjusting filters.'
  });
}));

/**
 * Convert faceted filters to the answers format expected by PackageSelectionEngine
 */
function convertFiltersToAnswers(filters, packageType) {
  const answers = {};

  // Global filters
  if (filters.brand && filters.brand.length > 0) {
    answers.brand_preference = filters.brand[0]; // Engine expects single brand
  }

  if (filters.finish) {
    answers.finish = filters.finish;
  }

  // Refrigerator filters
  if (filters.refrigerator) {
    const rf = filters.refrigerator;
    if (rf.width) answers.fridge_width = rf.width;  // Just the number, e.g., "36"
    if (rf.style) answers.fridge_style = rf.style;
    if (rf.depth) answers.fridge_depth = rf.depth;
    if (rf.ice_water) answers.ice_water = rf.ice_water;
  }

  // Range filters
  if (filters.range) {
    const rg = filters.range;
    if (rg.fuel_type) answers.range_fuel = rg.fuel_type;
    if (rg.width) answers.range_width = rg.width;
    if (rg.configuration) answers.range_config = rg.configuration;
    if (rg.features) answers.cooking_features = rg.features;
  }

  // Dishwasher filters
  if (filters.dishwasher) {
    const dw = filters.dishwasher;
    if (dw.noise_level) answers.dishwasher_quiet = dw.noise_level === 'ultra_quiet' || dw.noise_level === 'quiet';
    if (dw.rack_config) answers.dishwasher_racks = dw.rack_config;
  }

  // Washer filters
  if (filters.washer) {
    const ws = filters.washer;
    if (ws.type) answers.washer_type = ws.type;
    if (ws.capacity) answers.washer_capacity = ws.capacity;
    if (ws.steam) answers.washer_steam = true;
    if (ws.stackable) answers.stackable = true;
  }

  // Dryer filters
  if (filters.dryer) {
    const dr = filters.dryer;
    if (dr.fuel_type) answers.dryer_fuel = dr.fuel_type;
    if (dr.capacity) answers.dryer_capacity = dr.capacity;
    if (dr.steam) answers.dryer_steam = true;
    if (dr.sensor_dry) answers.dryer_sensor = true;
  }

  // Set package-specific defaults
  if (packageType === 'laundry') {
    answers.laundry_type = 'washer_dryer';
  }

  return answers;
}

module.exports = router;
