/**
 * FilterCountService
 * Computes filter counts for the faceted filtering Package Builder V2
 * Shows how many products match each filter option
 */

const { Pool } = require('pg');

class FilterCountService {
  constructor(pool) {
    this.pool = pool;

    // Category patterns for appliance detection (synced with PackageSelectionEngine)
    this.CATEGORY_PATTERNS = {
      refrigerator: [
        'refrigerator', 'fridge', 'refrig', 'ref',
        'fdr', 'sxs', 'tmf', 'bmf',
        'refrigeration', '4dflex', '4dr',
        // Specific sub-categories found in database
        'french door', 'side by side', 'top freezer', 'bottom freezer',
        'bottom mount', 'top mount', 'multidoor',
        // Brand-specific patterns
        'fulgor milano - refrig',
        'built-in refrigeration',
        'refrigeration - refrigerator',
        'refrigeration - built-in refrigeration',
        // Electrolux/Frigidaire patterns
        'preservation - freestanding',
        'food preservation'
      ],
      range: [
        'range', 'stove', 'ranges',
        'slide-in', 'slide in', 'slidein',
        'freestanding', 'front control',
        'dual fuel', 'commercial range',
        // Specific sub-categories
        'cooking - range',
        'cooking - built-in cooking',
        // Brand-specific patterns
        'fulgor milano - cooking',
        'bertazzoni - cooking',
        // Just "Cooking" category (Electrolux ranges)
        'cooking'
      ],
      dishwasher: [
        'dishwasher', 'dish washer', 'dishwashers',
        'dw rotary', 'dw aquablast',
        'dish care',
        // Specific sub-categories
        'cleaning - dishwasher',
        'cleaning - built-in',
        // Brand-specific
        'fulgor milano - dishwasher',
        'bertazzoni - dishwasher',
        'cleanup'
      ],
      washer: [
        'washer', 'washing machine',
        'clothes washer', 'front load washer', 'top load washer',
        // Specific sub-categories
        'laundry - washer',
        'laundry-washer',
        // Model prefixes
        'wf', 'ww'
      ],
      dryer: [
        'dryer', 'drying machine',
        'clothes dryer',
        // Specific sub-categories
        'laundry - dryer',
        'laundry-dryer',
        // LG uses W/M category for dryers (detected by DL* model prefix)
        'w/m',
        // Model prefixes
        'df', 'dv'
      ]
    };

    this.CATEGORY_EXCLUSIONS = {
      refrigerator: ['wine', 'beverage', 'cooler', 'ice maker', 'water filter', 'accessory', 'undercounter', 'column',
                     'chest', 'upright', 'sidekick', 'freezer only', 'stand alone freezer'],
      range: ['range hood', 'hood', 'wall oven', 'cooktop', 'microwave', 'grill', 'accessory',
              'rangetop', 'speed oven', 'steam oven', 'warming drawer', 'coffee',
              'single convection oven', 'double convection oven', 'built-in cooking cooktop',
              'combination oven', 'drop-in', 'drop in', 'vent', 'ventilation',
              // LG cooktops have name "Built-In" with category "Cooking" - exclude them
              'radiant cooktop', 'wall mount', 'chimney hood',
              // LG cooktop model prefixes (CB* = Cooktop Built-in)
              'cbew', 'cbgj', 'cbih', 'cbis', 'lsce',
              // LG wall oven model prefixes
              'wcep', 'wces', 'wceg'],
      dishwasher: ['clothes washer', 'laundry', 'washing machine', 'accessory'],
      washer: ['dishwasher', 'dish washer', 'dryer', 'pressure washer', 'power washer', 'accessory', 'pedestal'],
      dryer: ['hair dryer', 'hand dryer', 'blow dryer', 'accessory', 'pedestal', 'stacking kit', 'accessory & parts']
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
      // WIDTH DETECTION - Multiple sources for better coverage
      // 1. Category pattern: "36 FDR", "33 SxS", "30 BMF"
      let widthMatch = category.match(/(\d{2})\s*(fdr|sxs|bmf|tmf|4dr|4dflex|french|side|top|bottom)/i);

      // 2. Name pattern: "36-inch", '36"', "36 inch Wide", "36in"
      if (!widthMatch) {
        widthMatch = name.match(/(\d{2})[\-\s]?(inch|"|in|''|")\s*(wide)?/i);
      }

      // 3. Category with explicit width: '36"', "36 inch"
      if (!widthMatch) {
        widthMatch = category.match(/(\d{2})[\s"']/);
      }

      // 4. Model-based width detection by brand
      if (widthMatch) {
        values.width = widthMatch[1];
      } else {
        // Samsung: RF28 = 36", RF24 = 33", RF18 = 30"
        if (/^RF(\d{2})/.test(model)) {
          const digits = parseInt(model.substring(2, 4));
          if (digits >= 28) values.width = '36';
          else if (digits >= 22) values.width = '33';
          else values.width = '30';
        }
        // LG: LF/LR patterns
        else if (/^L[FR][A-Z]*(\d{2})/.test(model)) {
          const match = model.match(/^L[FR][A-Z]*(\d{2})/);
          if (match) {
            const digits = parseInt(match[1]);
            if (digits >= 28) values.width = '36';
            else if (digits >= 22) values.width = '33';
            else values.width = '30';
          }
        }
        // GE: GFE, GSS, GNE patterns
        else if (/^G[FSEN][ES](\d{2})/.test(model)) {
          const match = model.match(/^G[FSEN][ES](\d{2})/);
          if (match) {
            const digits = parseInt(match[1]);
            if (digits >= 28) values.width = '36';
            else if (digits >= 22) values.width = '33';
            else values.width = '30';
          }
        }
        // Whirlpool: WRF, WRS patterns
        else if (/^WR[FS](\d{2})/.test(model)) {
          const match = model.match(/^WR[FS](\d{2})/);
          if (match) {
            const digits = parseInt(match[1]);
            if (digits >= 28) values.width = '36';
            else if (digits >= 22) values.width = '33';
            else values.width = '30';
          }
        }
        // KitchenAid: KRMF, KRFC, KRFF patterns
        else if (/^KR[MFC][FC](\d{2})/.test(model)) {
          const match = model.match(/^KR[MFC][FC](\d{2})/);
          if (match) {
            const digits = parseInt(match[1]);
            if (digits >= 28) values.width = '36';
            else if (digits >= 22) values.width = '33';
            else values.width = '30';
          }
        }
      }

      // CAPACITY DETECTION - Parse from product name "XX cu.ft", "XX Cu. Ft."
      const capacityMatch = name.match(/(\d+\.?\d*)\s*cu\.?\s*ft/i);
      if (capacityMatch) {
        const cuFt = parseFloat(capacityMatch[1]);
        if (cuFt < 20) values.capacity = 'small';
        else if (cuFt < 25) values.capacity = 'medium';
        else values.capacity = 'large';
      }

      // Style detection
      if (category.includes('fdr') || category.includes('french door') || category.includes('french') ||
          name.includes('french door') || category.includes('multidoor') || category.includes('4dr')) {
        values.style = 'french_door';
      } else if (category.includes('sxs') || category.includes('side by side') || category.includes('side-by-side') ||
                 name.includes('side by side') || name.includes('side-by-side')) {
        values.style = 'side_by_side';
      } else if (category.includes('tmf') || category.includes('top freezer') || category.includes('top mount') ||
                 name.includes('top mount') || name.includes('top freezer')) {
        values.style = 'top_freezer';
      } else if (category.includes('bmf') || category.includes('bottom freezer') || category.includes('bottom mount') ||
                 name.includes('bottom mount') || name.includes('bottom freezer')) {
        values.style = 'bottom_freezer';
      }

      // Depth detection
      if (category.includes('counter') || name.includes('counter-depth') || name.includes('counter depth')) {
        values.depth = 'counter_depth';
      } else {
        values.depth = 'standard';
      }

      // Ice & Water detection - enhanced patterns
      if (name.includes('dispenser') || name.includes('ice and water') || name.includes('ice & water') ||
          name.includes('external ice') || name.includes('door dispenser') || name.includes('through-the-door')) {
        values.ice_water = 'door';
      } else if (name.includes('ice maker') || name.includes('internal ice')) {
        values.ice_water = 'inside';
      }

    } else if (applianceCategory === 'range') {
      // Fuel type detection - enhanced patterns
      if (category.includes('induction') || name.includes('induction')) {
        values.fuel_type = 'induction';
      } else if (category.includes('dual fuel') || name.includes('dual fuel')) {
        values.fuel_type = 'dual_fuel';
      } else if (category.includes('gas') || name.includes(' gas') || name.includes('gas ') ||
                 category.includes('natural gas') || name.includes('propane')) {
        values.fuel_type = 'gas';
      } else if (category.includes('electric') || name.includes('electric') || name.includes('radiant')) {
        values.fuel_type = 'electric';
      }

      // WIDTH DETECTION - Multiple sources for better coverage
      // 1. Category pattern: "30\" Range", "36 Slide-In", "48 Freestanding"
      let rangeWidthMatch = category.match(/(\d{2})["\'\s]*(range|slide|freestanding|induction|gas|electric|dual)/i);

      // 2. Name pattern: "30-inch", '30"', "30 inch Wide"
      if (!rangeWidthMatch) {
        rangeWidthMatch = name.match(/(\d{2})[\-\s]?(inch|"|in|''|")\s*(wide)?/i);
      }

      // 3. Category with just width
      if (!rangeWidthMatch) {
        rangeWidthMatch = category.match(/^(\d{2})\s/);
      }

      if (rangeWidthMatch) {
        values.width = rangeWidthMatch[1];
      } else {
        // Model pattern detection by brand
        // Samsung: NX60 = 30", NX36 = 36"
        if (/NX60|NE60|NZ60|NY60/.test(model)) values.width = '30';
        else if (/NX36|NE36|NZ36|NY36/.test(model)) values.width = '36';
        // GE/Café patterns
        else if (/^C[GC]S\d{3}|^JGS\d{3}/.test(model)) values.width = '30';
        else if (/^CGY\d{3}|^C2S\d{3}/.test(model)) values.width = '30';
        // LG patterns
        else if (/^L[RS][GES]\d{4}/.test(model)) values.width = '30';
        // Whirlpool/KitchenAid
        else if (/^W[EG][EG]\d{3}|^K[SFG][EIG][BGS]\d/.test(model)) values.width = '30';
        // Bertazzoni/Fulgor Milano - often have width in model
        else if (/36/.test(model)) values.width = '36';
        else if (/48/.test(model)) values.width = '48';
        else if (/60/.test(model)) values.width = '60';
        else if (/30/.test(model)) values.width = '30';
        // Default to 30" (most common size) if no pattern matches
        else values.width = '30';
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

      // Capacity detection - Parse from product name (e.g., "5.2 cu.ft", "5.8 Cu. Ft.")
      const washerCapacityMatch = name.match(/(\d+\.?\d*)\s*cu\.?\s*ft/i);
      if (washerCapacityMatch) {
        const cuFt = parseFloat(washerCapacityMatch[1]);
        if (cuFt < 5) values.capacity = 'standard';
        else if (cuFt < 6) values.capacity = 'large';
        else values.capacity = 'xl';
      } else {
        // Try model-based detection for Samsung, LG
        // Samsung: WF45 = 4.5 cu.ft, WF50 = 5.0 cu.ft, WF53 = 5.3 cu.ft
        const samsungWasherMatch = model.match(/^WF(\d{2})/);
        if (samsungWasherMatch) {
          const capacity = parseInt(samsungWasherMatch[1]) / 10;
          if (capacity < 5) values.capacity = 'standard';
          else if (capacity < 6) values.capacity = 'large';
          else values.capacity = 'xl';
        }
        // LG: WM4000 = 4.5, WM5000 = 5.0, etc.
        const lgWasherMatch = model.match(/^WM(\d)(\d)/);
        if (lgWasherMatch) {
          const capacity = parseInt(lgWasherMatch[1]) + parseInt(lgWasherMatch[2]) / 10;
          if (capacity < 5) values.capacity = 'standard';
          else if (capacity < 6) values.capacity = 'large';
          else values.capacity = 'xl';
        }
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

      // Capacity detection - Parse from product name (e.g., "7.4 cu.ft", "9.0 Cu. Ft.")
      const dryerCapacityMatch = name.match(/(\d+\.?\d*)\s*cu\.?\s*ft/i);
      if (dryerCapacityMatch) {
        const cuFt = parseFloat(dryerCapacityMatch[1]);
        if (cuFt < 8) values.capacity = 'standard';
        else if (cuFt < 9) values.capacity = 'large';
        else values.capacity = 'xl';
      } else {
        // Try model-based detection for Samsung, LG
        // Samsung: DVE45 = 7.5 cu.ft, DVE50 = 7.5, DVE55 = 7.8, DVE60 = 9.5
        const samsungDryerMatch = model.match(/^DV[EG](\d{2})/);
        if (samsungDryerMatch) {
          const modelNum = parseInt(samsungDryerMatch[1]);
          if (modelNum < 55) values.capacity = 'standard';
          else if (modelNum < 60) values.capacity = 'large';
          else values.capacity = 'xl';
        }
        // LG: DLEX/DLGX patterns - capacity often in name
        const lgDryerMatch = model.match(/^DL[EG]X?(\d)/);
        if (lgDryerMatch) {
          const series = parseInt(lgDryerMatch[1]);
          if (series < 5) values.capacity = 'standard';
          else if (series < 8) values.capacity = 'large';
          else values.capacity = 'xl';
        }
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
