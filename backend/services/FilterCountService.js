/**
 * FilterCountService
 * Computes filter counts for the faceted filtering Package Builder V2
 * Shows how many products match each filter option
 */

const { Pool } = require('pg');

class FilterCountService {
  constructor(pool) {
    this.pool = pool;

    // Category patterns for appliance detection (same as PackageSelectionEngine)
    this.CATEGORY_PATTERNS = {
      refrigerator: [
        'refrigerator', 'fridge', 'refrig', 'ref',
        'fdr', 'sxs', 'tmf', 'bmf',
        'refrigeration', '4dflex', '4dr'
      ],
      range: [
        'range', 'stove', 'ranges',
        'slide-in', 'slide in', 'slidein',
        'freestanding', 'cooking - range',
        'front control', 'dual fuel', 'commercial range'
      ],
      dishwasher: [
        'dishwasher', 'dish washer', 'dishwashers',
        'dw rotary', 'dw aquablast',
        'cleaning - dishwasher', 'dish care'
      ],
      washer: [
        'washer', 'washing machine', 'laundry - washer',
        'clothes washer', 'front load washer', 'top load washer',
        'laundry-washer', 'wf', 'ww'
      ],
      dryer: [
        'dryer', 'drying machine', 'laundry - dryer',
        'clothes dryer', 'laundry-dryer', 'df', 'dv'
      ]
    };

    this.CATEGORY_EXCLUSIONS = {
      refrigerator: ['wine', 'beverage', 'cooler', 'ice maker', 'water filter', 'accessory'],
      range: ['range hood', 'hood', 'wall oven', 'cooktop', 'microwave', 'grill', 'accessory'],
      dishwasher: ['clothes washer', 'laundry', 'washing machine', 'accessory'],
      washer: ['dishwasher', 'dish washer', 'dryer', 'pressure washer', 'power washer', 'accessory', 'pedestal'],
      dryer: ['hair dryer', 'hand dryer', 'blow dryer', 'accessory', 'pedestal']
    };
  }

  /**
   * Get filter definitions for a package type
   */
  async getFilterDefinitions(packageType) {
    const result = await this.pool.query(`
      SELECT
        appliance_category,
        filter_key,
        filter_label,
        filter_type,
        display_order,
        options
      FROM filter_definitions
      WHERE package_type = $1 AND is_active = true
      ORDER BY appliance_category, display_order
    `, [packageType]);

    // Group by category
    const filters = {};
    for (const row of result.rows) {
      if (!filters[row.appliance_category]) {
        filters[row.appliance_category] = [];
      }
      filters[row.appliance_category].push({
        key: row.filter_key,
        label: row.filter_label,
        type: row.filter_type,
        options: typeof row.options === 'string' ? JSON.parse(row.options) : row.options
      });
    }

    return filters;
  }

  /**
   * Check if a product matches an appliance category
   */
  matchesCategory(product, category) {
    const categoryStr = (product.category || '').toLowerCase();
    const modelStr = (product.model || '').toLowerCase();
    const nameStr = (product.name || '').toLowerCase();
    const combined = `${categoryStr} ${modelStr} ${nameStr}`;

    // Check exclusions first
    const exclusions = this.CATEGORY_EXCLUSIONS[category] || [];
    for (const exc of exclusions) {
      if (combined.includes(exc.toLowerCase())) {
        return false;
      }
    }

    // Check patterns
    const patterns = this.CATEGORY_PATTERNS[category] || [];
    for (const pattern of patterns) {
      if (combined.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect filter values from product data
   */
  detectFilterValues(product, applianceCategory) {
    const values = {};
    const model = (product.model || '').toUpperCase();
    const category = (product.category || '').toLowerCase();
    const name = (product.name || '').toLowerCase();
    const manufacturer = (product.manufacturer || '').toLowerCase();

    // Brand detection
    values.brand = product.manufacturer;

    // Finish detection
    if (category.includes('black stainless') || model.includes('BSS') || name.includes('black stainless')) {
      values.finish = 'black_stainless';
    } else if (category.includes('stainless') || model.includes('SS') || name.includes('stainless')) {
      values.finish = 'stainless';
    } else if (category.includes('white') || name.includes('white')) {
      values.finish = 'white';
    } else if (category.includes('black') || name.includes('black')) {
      values.finish = 'black';
    }

    // Smart/WiFi detection
    if (name.includes('wifi') || name.includes('smart') || model.includes('SMART') || name.includes('connected')) {
      values.smart = 'wifi';
    }

    // Category-specific detection
    if (applianceCategory === 'refrigerator') {
      // Width detection from category (e.g., "36 FDR", "33 SxS")
      const widthMatch = category.match(/(\d{2})\s*(fdr|sxs|bmf|tmf|4dr|4dflex)/i);
      if (widthMatch) {
        values.width = widthMatch[1];
      } else {
        // Model-based width detection for Samsung, LG, etc.
        if (/^RF\d{2}/.test(model)) {
          const sizeDigits = parseInt(model.substring(2, 4));
          if (sizeDigits >= 28 && sizeDigits <= 32) values.width = '36';
          else if (sizeDigits >= 22 && sizeDigits <= 27) values.width = '33';
          else if (sizeDigits >= 15 && sizeDigits <= 21) values.width = '30';
        }
      }

      // Style detection
      if (category.includes('fdr') || category.includes('french door') || name.includes('french door')) {
        values.style = 'french_door';
      } else if (category.includes('sxs') || category.includes('side by side') || category.includes('side-by-side')) {
        values.style = 'side_by_side';
      } else if (category.includes('tmf') || category.includes('top freezer') || category.includes('top mount')) {
        values.style = 'top_freezer';
      } else if (category.includes('bmf') || category.includes('bottom freezer') || category.includes('bottom mount')) {
        values.style = 'bottom_freezer';
      }

      // Depth detection
      if (category.includes('counter') || name.includes('counter-depth') || name.includes('counter depth')) {
        values.depth = 'counter_depth';
      } else {
        values.depth = 'standard';
      }

      // Ice & Water detection
      if (name.includes('dispenser') || name.includes('ice and water')) {
        values.ice_water = 'door';
      } else if (name.includes('ice maker')) {
        values.ice_water = 'inside';
      }

    } else if (applianceCategory === 'range') {
      // Fuel type detection
      if (category.includes('gas') || name.includes('gas')) {
        values.fuel_type = 'gas';
      } else if (category.includes('induction') || name.includes('induction')) {
        values.fuel_type = 'induction';
      } else if (category.includes('dual fuel') || name.includes('dual fuel')) {
        values.fuel_type = 'dual_fuel';
      } else if (category.includes('electric') || name.includes('electric')) {
        values.fuel_type = 'electric';
      }

      // Width detection
      const rangeWidthMatch = category.match(/(\d{2})["\']?\s*(range|slide|freestanding)/i);
      if (rangeWidthMatch) {
        values.width = rangeWidthMatch[1];
      } else {
        // Model pattern detection
        if (/NX60|NE60|NZ60/.test(model)) values.width = '30';
        else if (/NX36|NE36|NZ36|36/.test(model)) values.width = '36';
        else if (/48/.test(model)) values.width = '48';
      }

      // Configuration detection
      if (category.includes('slide') || name.includes('slide-in') || name.includes('slide in')) {
        values.configuration = 'slide_in';
      } else if (category.includes('front control') || name.includes('front control')) {
        values.configuration = 'front_control';
      } else if (category.includes('freestanding') || name.includes('freestanding')) {
        values.configuration = 'freestanding';
      }

      // Features detection
      const features = [];
      if (name.includes('convection') || name.includes('true convection')) features.push('convection');
      if (name.includes('air fry') || name.includes('airfry')) features.push('air_fry');
      if (name.includes('steam clean')) features.push('steam_clean');
      if (name.includes('self clean') || name.includes('self-clean')) features.push('self_clean');
      if (features.length > 0) values.features = features.join(',');

    } else if (applianceCategory === 'dishwasher') {
      // Noise level detection (from specs if available)
      if (product.noise_level_db) {
        if (product.noise_level_db < 44) values.noise_level = 'ultra_quiet';
        else if (product.noise_level_db < 50) values.noise_level = 'quiet';
        else values.noise_level = 'standard';
      } else if (name.includes('ultra quiet') || name.includes('42db') || name.includes('40db')) {
        values.noise_level = 'ultra_quiet';
      } else if (name.includes('quiet') || name.includes('44db') || name.includes('46db')) {
        values.noise_level = 'quiet';
      }

      // Tub material
      if (name.includes('stainless tub') || name.includes('stainless steel tub')) {
        values.tub_material = 'stainless';
      } else if (name.includes('plastic tub')) {
        values.tub_material = 'plastic';
      }

      // Rack configuration
      if (name.includes('3rd rack') || name.includes('third rack') || name.includes('3 rack')) {
        values.rack_config = '3_rack';
      } else {
        values.rack_config = '2_rack';
      }

    } else if (applianceCategory === 'washer') {
      // Type detection
      if (category.includes('front load') || name.includes('front load') || /^WF/.test(model)) {
        values.type = 'front_load';
      } else if (category.includes('top load') || name.includes('top load') || /^WA|^WT/.test(model)) {
        values.type = 'top_load';
      }

      // Capacity detection (from specs if available)
      if (product.capacity_cu_ft) {
        if (product.capacity_cu_ft < 5) values.capacity = 'standard';
        else if (product.capacity_cu_ft < 6) values.capacity = 'large';
        else values.capacity = 'xl';
      }

      // Steam detection
      if (name.includes('steam') || name.includes('steam wash')) {
        values.steam = 'steam';
      }

      // Stackable detection
      if (name.includes('stackable') || category.includes('front load')) {
        values.stackable = 'stackable';
      }

    } else if (applianceCategory === 'dryer') {
      // Fuel type detection
      if (category.includes('gas') || name.includes('gas') || /^DV.*G/.test(model)) {
        values.fuel_type = 'gas';
      } else {
        values.fuel_type = 'electric';
      }

      // Capacity detection
      if (product.capacity_cu_ft) {
        if (product.capacity_cu_ft < 8) values.capacity = 'standard';
        else if (product.capacity_cu_ft < 9) values.capacity = 'large';
        else values.capacity = 'xl';
      }

      // Steam detection
      if (name.includes('steam')) {
        values.steam = 'steam';
      }

      // Sensor dry detection
      if (name.includes('sensor') || name.includes('moisture')) {
        values.sensor_dry = 'sensor';
      }
    }

    return values;
  }

  /**
   * Get filter options with counts for a package type
   * This is the main method called by the API
   */
  async getFilterOptionsWithCounts(packageType, currentFilters = {}) {
    const definitions = await this.getFilterDefinitions(packageType);

    // Determine which categories to query based on package type
    const categories = packageType === 'kitchen'
      ? ['refrigerator', 'range', 'dishwasher']
      : ['washer', 'dryer'];

    // Base query to get all active products
    let baseQuery = `
      SELECT
        p.id,
        p.model,
        p.manufacturer,
        p.category,
        p.name,
        p.msrp_cents
      FROM products p
      WHERE p.active = true
    `;

    // Apply global brand filter if set
    if (currentFilters.brand && currentFilters.brand.length > 0) {
      baseQuery += ` AND LOWER(p.manufacturer) IN (${currentFilters.brand.map(b => `'${b.toLowerCase()}'`).join(',')})`;
    }

    const products = await this.pool.query(baseQuery);

    // Organize products by appliance category
    const productsByCategory = {};
    for (const category of categories) {
      productsByCategory[category] = products.rows.filter(p => this.matchesCategory(p, category));
    }

    // Build filter options with counts
    const result = {
      global: {},
      ...Object.fromEntries(categories.map(c => [c, {}]))
    };

    // Process global filters
    if (definitions.global) {
      for (const filter of definitions.global) {
        const counts = await this.computeFilterCounts(
          filter,
          products.rows, // All products for global counts
          'global',
          currentFilters
        );
        result.global[filter.key] = {
          label: filter.label,
          type: filter.type,
          options: counts
        };
      }
    }

    // Process category-specific filters
    for (const category of categories) {
      const categoryDefs = definitions[category] || [];
      const categoryProducts = productsByCategory[category];

      for (const filter of categoryDefs) {
        const counts = await this.computeFilterCounts(
          filter,
          categoryProducts,
          category,
          currentFilters
        );
        result[category][filter.key] = {
          label: filter.label,
          type: filter.type,
          options: counts
        };
      }
    }

    return result;
  }

  /**
   * Compute counts for a specific filter
   */
  async computeFilterCounts(filterDef, products, applianceCategory, currentFilters) {
    const options = filterDef.options || [];
    const counts = [];

    // Handle brand filter specially
    if (filterDef.key === 'brand') {
      const brandCounts = {};
      for (const product of products) {
        const brand = product.manufacturer;
        if (brand) {
          brandCounts[brand] = (brandCounts[brand] || 0) + 1;
        }
      }

      // Return top brands sorted by count
      const sortedBrands = Object.entries(brandCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);

      for (const [brand, count] of sortedBrands) {
        const isSelected = currentFilters.brand &&
          currentFilters.brand.some(b => b.toLowerCase() === brand.toLowerCase());
        counts.push({
          value: brand,
          label: brand,
          count: count,
          selected: isSelected
        });
      }

      return counts;
    }

    // For other filters, compute counts based on detected values
    for (const option of options) {
      const optValue = typeof option === 'string' ? option : option.value;
      const optLabel = typeof option === 'string' ? option : option.label;

      let matchCount = 0;
      for (const product of products) {
        const detected = this.detectFilterValues(product, applianceCategory);
        const detectedValue = detected[filterDef.key];

        if (filterDef.type === 'multi' && detectedValue) {
          // For multi-select, check if the option is in the comma-separated list
          const detectedValues = detectedValue.split(',');
          if (detectedValues.includes(optValue)) {
            matchCount++;
          }
        } else if (detectedValue === optValue) {
          matchCount++;
        }
      }

      // Check if currently selected
      const categoryFilters = currentFilters[applianceCategory] || {};
      const isSelected = categoryFilters[filterDef.key] === optValue ||
        (Array.isArray(categoryFilters[filterDef.key]) && categoryFilters[filterDef.key].includes(optValue));

      counts.push({
        value: optValue,
        label: optLabel,
        count: matchCount,
        selected: isSelected
      });
    }

    return counts;
  }

  /**
   * Get products matching all applied filters for a category
   */
  async getFilteredProducts(applianceCategory, filters, globalFilters = {}) {
    let query = `
      SELECT
        p.id,
        p.model,
        p.manufacturer,
        p.category,
        p.name,
        p.msrp_cents,
        p.cost_cents
      FROM products p
      WHERE p.active = true
    `;

    // Apply brand filter
    if (globalFilters.brand && globalFilters.brand.length > 0) {
      query += ` AND LOWER(p.manufacturer) IN (${globalFilters.brand.map(b => `'${b.toLowerCase()}'`).join(',')})`;
    }

    const products = await this.pool.query(query);

    // Filter by category match
    let filtered = products.rows.filter(p => this.matchesCategory(p, applianceCategory));

    // Apply category-specific filters
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;

      filtered = filtered.filter(product => {
        const detected = this.detectFilterValues(product, applianceCategory);
        const detectedValue = detected[key];

        if (Array.isArray(value)) {
          // Multi-select: product must have at least one of the selected values
          if (detectedValue) {
            const detectedValues = detectedValue.split(',');
            return value.some(v => detectedValues.includes(v));
          }
          return false;
        } else {
          // Single-select: must match exactly
          return detectedValue === value;
        }
      });
    }

    return filtered;
  }
}

module.exports = FilterCountService;
