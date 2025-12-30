/**
 * Package Selection Engine v3
 * Generates Good/Better/Best package recommendations with:
 * - Full catalog usage - queries same product source as product/quote screens
 * - Algorithmic tier assignment based on actual price distribution
 * - Progressive filter relaxation when no results found
 * - Brand awareness and cohesion scoring
 * - Appliance-aware dimension rules
 */

class PackageSelectionEngine {
  constructor(pool) {
    this.pool = pool;

    // Define category patterns for matching (flexible matching)
    // IMPORTANT: Patterns are case-insensitive and used with LIKE %pattern%
    // Updated to match actual database category names from all manufacturers
    this.CATEGORY_PATTERNS = {
      refrigerator: [
        'refrigerator', 'fridge', 'refrig', 'ref',
        'fdr',           // French Door Refrigerator (36 FDR, 33 FDR, etc.)
        'sxs',           // Side by Side
        'tmf', 'bmf',    // Top/Bottom Mount Freezer
        'refrigeration', // Bosch, LG patterns
        '4dflex', '4dr', // Samsung Bespoke patterns
        // Frigidaire/Electrolux patterns (Food Preservation categories)
        'preservation - freestanding side by side',
        'preservation - freestanding multidoor',
        'preservation - freestanding top freezer',
        'preservation - freestanding bottom freezer',
        'preservation - freestanding refrigerator',
        'side by side',   // Generic side by side
        'multidoor',      // Generic multidoor
        'top freezer',    // Generic top freezer
        'bottom freezer', // Generic bottom freezer
        'bottom mount'    // Bottom mount variations
      ],
      freezer: ['freezer', 'chest freezer', 'upright freezer'],
      range: [
        'range', 'stove', 'ranges',
        'slide-in', 'slide in', 'slidein',  // Samsung, LG, GE patterns
        'freestanding',                      // Freestanding ranges
        'cooking - range',                   // Full category path
        'front control',                     // Front control ranges
        'dual fuel', 'commercial range',     // Specialty ranges
        'cooking'                            // Bertazzoni/Fulgor Milano (filtered by exclusions)
      ],
      dishwasher: [
        'dishwasher', 'dish washer', 'dishwashers',
        'dw rotary', 'dw aquablast',         // Samsung patterns
        'cleaning - dishwasher',             // Full category path
        'dish care',                         // Electrolux pattern
        'cleanup',                           // Bertazzoni pattern
        'bi fullsize dish washer',           // Frigidaire pattern
        'bi compact dish washer'             // Frigidaire compact
      ],
      microwave: [
        'microwave', 'microwaves',
        'otr', 'over the range', 'over-the-range',
        'cooking - microwave'                // Full category path
      ],
      cooktop: [
        'cooktop', 'cooktops', 'cook top',
        'burner', 'induction',
        'cooking - built-in cooking - cooktop',
        'cooking - built-in cooking cooktop',
        'gas cooktop', 'electric cooktop'
      ],
      wall_oven: [
        'wall oven', 'wall ovens',
        'built-in oven', 'built in oven',
        'double oven', 'single oven',
        'cooking - built-in cooking - wall oven',
        'combo oven', 'steam oven'
      ],
      hood: [
        'range hood', 'range hoods', 'hood', 'hoods',
        'ventilation', 'vent hood', 'vent',
        'cooking - hood'
      ],
      washer: [
        'washer', 'washers', 'washing machine',
        'w/m',                               // Category shorthand
        'tl washer', 'fl washer',           // Samsung Top Load/Front Load
        'laundry - washer',                  // Full category path
        'fabric care - fl washer', 'fabric care - tl washer'
      ],
      dryer: [
        'dryer', 'dryers',
        'tl dryer', 'fl dryer',             // Samsung patterns
        'laundry - dryer',                   // Full category path
        'fabric care - fl dryer', 'fabric care - tl dryer'
      ],
      laundry_combo: [
        'washer dryer combo', 'all-in-one', 'washer/dryer',
        'laundry center', 'laundry hub',
        'combination washer dryer', 'vented combo', 'heat pump combo'
      ]
    };

    // Category exclusion patterns - prevent cross-category contamination
    // IMPORTANT: These patterns exclude products that match inclusion patterns but are wrong category
    this.CATEGORY_EXCLUSIONS = {
      refrigerator: ['wine', 'beverage', 'cooler', 'ice maker', 'water filter', 'accessory'],
      freezer: ['refrigerator', 'fridge', 'fdr', 'french door'],
      range: [
        'range hood', 'hood', 'wall oven', 'cooktop', 'microwave', 'grill', 'accessory',
        'rangetop', 'speed oven', 'steam oven', 'warming drawer', 'coffee',
        'single convection oven', 'double convection oven',
        'drop-in', 'drop in',  // Drop-in cooktops
        'cooker rear control'   // Rear control cookers (different from ranges)
      ],
      dishwasher: ['clothes washer', 'laundry', 'washing machine', 'accessory'],
      microwave: ['hood', 'accessory'],  // Note: OTR microwaves are OK
      cooktop: ['range hood', 'accessory'],  // Note: Keep separate from ranges
      wall_oven: ['microwave', 'cooktop', 'range hood', 'accessory'],  // Note: Combo ovens are OK
      hood: ['microwave', 'accessory'],  // Range hoods only
      washer: ['dishwasher', 'dish washer', 'dryer', 'pressure washer', 'power washer', 'accessory', 'pedestal'],
      dryer: ['hair dryer', 'hand dryer', 'blow dryer', 'accessory', 'pedestal'],
      laundry_combo: ['accessory', 'pedestal']
    };

    // Size class definitions for matching washer-dryer pairs
    this.SIZE_CLASSES = {
      compact: {
        max_width_x10: 250,  // 25 inches or less
        max_capacity_x10: 35 // 3.5 cu ft or less
      },
      standard: {
        min_width_x10: 250,  // More than 25 inches
        min_capacity_x10: 35 // More than 3.5 cu ft
      }
    };

    // Define allowed slot types per flow type
    this.FLOW_TYPE_SLOTS = {
      kitchen: ['refrigerator', 'range', 'dishwasher', 'microwave', 'cooktop', 'wall_oven', 'hood', 'freezer'],
      laundry: ['washer', 'dryer', 'laundry_combo'],
      fridge_only: ['refrigerator'],
      cooking: ['range', 'cooktop', 'wall_oven', 'microwave', 'hood'],
      cold_storage: ['refrigerator', 'freezer']
    };

    // Brand tiers (for Good/Better/Best assignment)
    this.BRAND_TIERS = {
      premium: ['Sub-Zero', 'Wolf', 'Thermador', 'Miele', 'Viking', 'JennAir', 'Monogram', 'Cove'],
      better: ['KitchenAid', 'Bosch', 'Electrolux', 'Café', 'GE Profile', 'Samsung', 'LG'],
      good: ['Whirlpool', 'GE', 'Maytag', 'Frigidaire', 'Amana', 'Hotpoint', 'Haier']
    };

    // Default scoring weights (out of 100)
    this.defaultWeights = {
      price_band: 25,
      brand_cohesion: 20,
      finish_match: 15,
      reliability: 15,
      stock_status: 10,
      bundle_discount: 10,
      smart_level: 5
    };

    // Dimension constraints per appliance type (in inches * 10 for precision)
    this.DIMENSION_RULES = {
      refrigerator: {
        counter_depth: { max_depth: 300 }, // 30 inches max
        standard: { max_depth: 360 }, // 36 inches max
        width_30: { min_width: 290, max_width: 310 },
        width_33: { min_width: 320, max_width: 340 },
        width_36: { min_width: 350, max_width: 370 }
      },
      range: {
        width_30: { min_width: 290, max_width: 310 },
        width_36: { min_width: 350, max_width: 370 },
        width_48: { min_width: 470, max_width: 490 }
      },
      dishwasher: {
        standard: { min_width: 230, max_width: 250 }, // ~24 inches
        compact: { min_width: 170, max_width: 190 } // ~18 inches
      },
      washer: {
        standard: { max_depth: 340, max_width: 300 },
        compact: { max_depth: 280, max_width: 250 }
      },
      dryer: {
        standard: { max_depth: 340, max_width: 300 },
        compact: { max_depth: 280, max_width: 250 }
      }
    };

    // Brand name normalization
    this.brandMap = {
      'samsung': 'Samsung',
      'lg': 'LG',
      'ge': 'GE',
      'ge profile': 'GE Profile',
      'ge cafe': 'Café',
      'cafe': 'Café',
      'whirlpool': 'Whirlpool',
      'kitchenaid': 'KitchenAid',
      'bosch': 'Bosch',
      'maytag': 'Maytag',
      'frigidaire': 'Frigidaire',
      'electrolux': 'Electrolux',
      'thor': 'THOR KITCHEN',
      'thor kitchen': 'THOR KITCHEN',
      'miele': 'Miele',
      'jenn-air': 'JennAir',
      'jennair': 'JennAir',
      'thermador': 'Thermador',
      'sub-zero': 'Sub-Zero',
      'subzero': 'Sub-Zero',
      'wolf': 'Wolf',
      'viking': 'Viking',
      'monogram': 'Monogram'
    };
  }

  /**
   * Generate packages for all three tiers
   * @param {object} answers - Questionnaire answers (may include mode: 'requirement' or 'preference')
   * @param {object} template - Package template with slots
   * @returns {Promise<object>} Good/Better/Best packages with errors if any
   */
  async generatePackages(answers, template) {
    const flowType = template.package_type || 'kitchen';
    console.log(`🔧 Generating ${flowType} packages (v3 - full catalog + dynamic tiers)`);
    console.log('📋 Answers:', JSON.stringify(answers).substring(0, 200) + '...');

    // Parse answers into requirements and preferences
    const { requirements, preferences } = this.parseAnswerModes(answers);
    console.log(`   Requirements: ${Object.keys(requirements).length}, Preferences: ${Object.keys(preferences).length}`);

    const slots = typeof template.slots === 'string'
      ? JSON.parse(template.slots)
      : template.slots;

    // STEP 1: Fetch full catalog for all slot categories and compute dynamic price tiers
    console.log('📦 Step 1: Fetching full catalog and computing price tiers...');
    const catalogBySlot = {};
    const tierRangesBySlot = {};

    for (const [slotKey, slotConfig] of Object.entries(slots)) {
      const slotType = this.normalizeSlotType(slotKey);
      const allowedSlots = this.FLOW_TYPE_SLOTS[flowType] || [];

      if (!allowedSlots.includes(slotType)) {
        console.log(`⛔ Skipping slot ${slotKey} - not allowed for ${flowType} flow`);
        continue;
      }

      // Fetch ALL products for this category (same query as product page)
      const products = await this.fetchCatalogForSlot(slotConfig.category, slotType);
      catalogBySlot[slotKey] = products;

      // Compute dynamic tier ranges from actual price distribution
      tierRangesBySlot[slotKey] = this.computeDynamicTiers(products);

      console.log(`   ${slotKey}: ${products.length} products, tiers: $${(tierRangesBySlot[slotKey].good.max/100).toFixed(0)}/$${(tierRangesBySlot[slotKey].better.max/100).toFixed(0)}/$${(tierRangesBySlot[slotKey].best.max/100).toFixed(0)}`);
    }

    // STEP 2: Build packages for each tier with progressive filter relaxation
    console.log('🔨 Step 2: Building packages with progressive filtering...');
    const tiers = ['good', 'better', 'best'];
    const packages = {};
    const errors = [];
    const warnings = [];

    for (const tier of tiers) {
      const result = await this.buildPackageForTier(
        requirements,
        preferences,
        template,
        tier,
        flowType,
        catalogBySlot,
        tierRangesBySlot
      );

      packages[tier] = result.package;

      if (result.emptySlots.length > 0) {
        errors.push({
          tier,
          slots: result.emptySlots,
          reason: 'No products match your requirements',
          suggestions: result.suggestions,
          relaxationAttempts: result.relaxationAttempts || 0
        });
      }

      if (result.warnings.length > 0) {
        warnings.push(...result.warnings.map(w => ({ tier, ...w })));
      }
    }

    // Calculate brand cohesion scores
    for (const tier of tiers) {
      if (packages[tier] && packages[tier].items) {
        packages[tier].brand_cohesion_score = this.calculateBrandCohesion(packages[tier].items);
      }
    }

    // VALIDATION: For laundry packages, verify washer-dryer pair matching
    if (flowType === 'laundry') {
      for (const tier of tiers) {
        const pkg = packages[tier];
        if (pkg && pkg.items && pkg.items.length >= 2) {
          const validationResult = this.validateLaundryPair(pkg.items);
          if (!validationResult.valid) {
            warnings.push({
              tier,
              type: 'pair_validation',
              message: validationResult.message,
              washer: validationResult.washer,
              dryer: validationResult.dryer
            });
            console.log(`⚠️ ${tier} tier laundry pair validation: ${validationResult.message}`);
          } else {
            console.log(`✓ ${tier} tier: ${validationResult.message}`);
          }
          // Add pair info to package for UI display
          pkg.pairInfo = validationResult;
        }
      }
    }

    console.log('✅ Generated packages:', {
      good: (packages.good?.items?.length || 0) + ' items, $' + ((packages.good?.total_msrp_cents || 0) / 100).toFixed(2),
      better: (packages.better?.items?.length || 0) + ' items, $' + ((packages.better?.total_msrp_cents || 0) / 100).toFixed(2),
      best: (packages.best?.items?.length || 0) + ' items, $' + ((packages.best?.total_msrp_cents || 0) / 100).toFixed(2)
    });

    return {
      packages,
      errors,
      warnings,
      hasIssues: errors.length > 0,
      catalogStats: Object.fromEntries(
        Object.entries(catalogBySlot).map(([k, v]) => [k, v.length])
      ),
      suggestion: errors.length > 0
        ? 'Consider relaxing some requirements (marked with "Must be") to see more options'
        : null
    };
  }

  /**
   * Normalize slot key to standard slot type
   */
  normalizeSlotType(slotKey) {
    const key = slotKey.toLowerCase();
    if (key.includes('fridge') || key.includes('refrigerator')) return 'refrigerator';
    if (key.includes('range') || key.includes('stove')) return 'range';
    if (key.includes('dishwasher')) return 'dishwasher';
    if (key.includes('microwave')) return 'microwave';
    if (key.includes('cooktop')) return 'cooktop';
    if (key.includes('wall') && key.includes('oven')) return 'wall_oven';
    if (key.includes('washer') && !key.includes('dish')) return 'washer';
    if (key.includes('dryer')) return 'dryer';
    if (key.includes('combo') || key.includes('laundry_combo')) return 'laundry_combo';
    return slotKey;
  }

  /**
   * Fetch full catalog for a slot category - same data source as product pages
   * Applies category exclusion patterns to prevent cross-contamination (e.g., dishwashers in washer slot)
   */
  async fetchCatalogForSlot(category, slotType) {
    // Build category patterns for flexible matching
    const patterns = this.CATEGORY_PATTERNS[slotType] || [category.toLowerCase()];
    const exclusions = this.CATEGORY_EXCLUSIONS[slotType] || [];

    let paramIndex = 1;
    const patternConditions = patterns.map(() => `LOWER(p.category) LIKE $${paramIndex++}`).join(' OR ');
    const patternParams = patterns.map(p => `%${p}%`);

    // Build exclusion conditions
    let exclusionConditions = '';
    const exclusionParams = [];
    if (exclusions.length > 0) {
      const exclusionParts = exclusions.map(() => `LOWER(p.category) NOT LIKE $${paramIndex++}`);
      exclusionConditions = ' AND ' + exclusionParts.join(' AND ');
      exclusionParams.push(...exclusions.map(e => `%${e}%`));

      // Also exclude by name for extra safety
      const nameExclusionParts = exclusions.map(() => `LOWER(p.name) NOT LIKE $${paramIndex++}`);
      exclusionConditions += ' AND ' + nameExclusionParts.join(' AND ');
      exclusionParams.push(...exclusions.map(e => `%${e}%`));
    }

    const query = `
      SELECT
        p.id, p.model, p.manufacturer, p.name, p.description, p.category,
        p.msrp_cents, p.cost_cents, p.active, p.color,
        p.paired_product_id,
        pea.width_inches_x10, pea.height_inches_x10, pea.depth_inches_x10,
        pea.depth_type, pea.subtype, pea.capacity_cubic_ft_x10, pea.capacity_band,
        pea.fuel_type, pea.db_level, pea.noise_band, pea.smart_level, pea.finish,
        pea.has_ice_water, pea.has_air_fry, pea.has_convection, pea.has_steam_feature,
        pea.is_stackable, pea.is_vented, pea.voltage, pea.reliability_tier,
        pea.quiet_tier, pea.package_tier, pea.bundle_sku, pea.bundle_discount_percent
      FROM products p
      LEFT JOIN product_extended_attributes pea ON p.id = pea.product_id
      WHERE (p.active = true OR p.active IS NULL)
        AND p.msrp_cents > 0
        AND (${patternConditions})
        ${exclusionConditions}
      ORDER BY p.msrp_cents ASC
    `;

    const allParams = [...patternParams, ...exclusionParams];

    try {
      const result = await this.pool.query(query, allParams);
      console.log(`   Fetched ${result.rows.length} products for ${slotType} (patterns: ${patterns.join(', ')}, exclusions: ${exclusions.join(', ') || 'none'})`);
      return result.rows;
    } catch (err) {
      console.error(`Error fetching catalog for ${slotType}:`, err.message);
      return [];
    }
  }

  /**
   * Compute dynamic Good/Better/Best price tiers from actual product data
   * Uses percentile-based distribution for natural tier breaks
   */
  computeDynamicTiers(products) {
    if (products.length === 0) {
      // Fallback to reasonable defaults if no products
      return {
        good: { min: 0, max: 100000 },
        better: { min: 100000, max: 200000 },
        best: { min: 200000, max: 1000000 }
      };
    }

    // Get prices sorted ascending
    const prices = products
      .map(p => parseInt(p.msrp_cents) || 0)
      .filter(p => p > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) {
      return {
        good: { min: 0, max: 100000 },
        better: { min: 100000, max: 200000 },
        best: { min: 200000, max: 1000000 }
      };
    }

    // Calculate percentile-based breakpoints
    // Good: 0-33rd percentile, Better: 33-66th, Best: 66-100th
    const p33 = prices[Math.floor(prices.length * 0.33)] || prices[0];
    const p66 = prices[Math.floor(prices.length * 0.66)] || prices[prices.length - 1];
    const minPrice = prices[0];
    const maxPrice = prices[prices.length - 1];

    return {
      good: { min: minPrice, max: p33 },
      better: { min: p33, max: p66 },
      best: { min: p66, max: maxPrice }
    };
  }

  /**
   * Parse answers into requirements (hard filters) and preferences (soft scoring)
   * @param {object} answers - Raw answers object
   * @returns {object} { requirements, preferences }
   */
  parseAnswerModes(answers) {
    const requirements = {};
    const preferences = {};

    for (const [key, answer] of Object.entries(answers)) {
      if (answer === null || answer === undefined) continue;

      // Check if answer has mode specified
      if (typeof answer === 'object' && answer.value !== undefined) {
        const { value, mode } = answer;
        if (mode === 'requirement') {
          requirements[key] = value;
        } else {
          preferences[key] = value;
        }
      } else {
        // Legacy format - treat as preference by default
        // Exception: some answers are always requirements (hard filters)
        const alwaysRequired = [
          'range_fuel', 'dryer_fuel', 'laundry_type', 'washer_type',
          'fridge_style', 'fridge_depth', 'fridge_width', 'ice_water',
          'range_width', 'dishwasher_width',
          'brand_preference'
        ];
        if (alwaysRequired.includes(key)) {
          requirements[key] = answer;
        } else {
          preferences[key] = answer;
        }
      }
    }

    return { requirements, preferences };
  }

  /**
   * Determine size class of a laundry appliance (compact vs standard)
   * @param {object} product - Product with width_inches_x10 and capacity_cubic_ft_x10
   * @returns {string} 'compact' or 'standard'
   */
  getSizeClass(product) {
    const width = product.width_inches_x10 || 0;
    const capacity = product.capacity_cubic_ft_x10 || 0;

    // Compact: <= 25" width OR <= 3.5 cu ft capacity
    if (width > 0 && width <= this.SIZE_CLASSES.compact.max_width_x10) {
      return 'compact';
    }
    if (capacity > 0 && capacity <= this.SIZE_CLASSES.compact.max_capacity_x10) {
      return 'compact';
    }

    // Standard if width > 25" or capacity > 3.5 cu ft
    if (width > this.SIZE_CLASSES.standard.min_width_x10 || capacity > this.SIZE_CLASSES.standard.min_capacity_x10) {
      return 'standard';
    }

    // Default to standard if no dimensions available
    return 'standard';
  }

  /**
   * Extract series from product model number or name
   * @param {object} product - Product with model and name
   * @returns {string|null} Series identifier or null
   */
  extractSeries(product) {
    if (!product) return null;

    const model = product.model || '';
    const name = product.name || '';

    // Common series patterns in model numbers (first 3-4 alphanumeric chars often indicate series)
    const modelMatch = model.match(/^([A-Z]{2,4}\d{2,4})/i);
    if (modelMatch) {
      return modelMatch[1].toUpperCase();
    }

    // Look for series keywords in name
    const seriesKeywords = ['series', 'collection', 'signature', 'profile', 'cafe'];
    for (const keyword of seriesKeywords) {
      const idx = name.toLowerCase().indexOf(keyword);
      if (idx >= 0) {
        // Extract the word before the keyword as series name
        const words = name.substring(0, idx).trim().split(/\s+/);
        if (words.length > 0) {
          return words[words.length - 1];
        }
      }
    }

    return null;
  }

  /**
   * Build a package for a specific tier with progressive filter relaxation
   * For laundry packages: enforces brand/series/size matching between washer and dryer
   * @param {object} requirements - Hard filter requirements
   * @param {object} preferences - Soft scoring preferences
   * @param {object} template - Package template
   * @param {string} tier - 'good', 'better', or 'best'
   * @param {string} flowType - 'kitchen', 'laundry', or 'fridge_only'
   * @param {object} catalogBySlot - Pre-fetched catalog data by slot
   * @param {object} tierRangesBySlot - Dynamic tier ranges by slot
   * @returns {Promise<object>} Package result with any errors
   */
  async buildPackageForTier(requirements, preferences, template, tier, flowType, catalogBySlot, tierRangesBySlot) {
    const pkg = {
      tier,
      items: [],
      total_msrp_cents: 0,
      total_cost_cents: 0,
      bundle_savings_cents: 0,
      brand_cohesion_score: 0
    };

    const emptySlots = [];
    const warnings = [];
    const suggestions = [];
    let totalRelaxationAttempts = 0;

    const slots = typeof template.slots === 'string'
      ? JSON.parse(template.slots)
      : template.slots;

    // Determine preferred brand from first slot (for cohesion)
    let preferredBrand = null;

    // LAUNDRY PAIR MATCHING: Track dryer selection to match washer
    let laundryPairConstraints = null;

    // For laundry flow: process dryer first to establish brand/series/size constraints
    if (flowType === 'laundry') {
      const slotEntries = Object.entries(slots);
      // Sort so dryer comes first
      slotEntries.sort(([keyA], [keyB]) => {
        const typeA = this.normalizeSlotType(keyA);
        const typeB = this.normalizeSlotType(keyB);
        if (typeA === 'dryer') return -1;
        if (typeB === 'dryer') return 1;
        return 0;
      });

      // Process dryer first to establish constraints
      // PRIORITY: Select dryers that have official paired washers matching washer_type requirement
      for (const [slotKey, slotConfig] of slotEntries) {
        const slotType = this.normalizeSlotType(slotKey);
        if (slotType === 'dryer' && catalogBySlot[slotKey]) {
          // Get washer catalog to check for official pairs
          const washerSlotKey = Object.keys(slots).find(k => this.normalizeSlotType(k) === 'washer');
          const washerCatalog = washerSlotKey ? catalogBySlot[washerSlotKey] : [];

          // Build washer lookup by ID for quick access
          const washerById = new Map(washerCatalog.map(w => [w.id, w]));
          const washerIds = new Set(washerCatalog.map(w => w.id));

          // STRICT PAIRING: Only select dryers that have official paired washers when available
          let dryerCatalog = [...catalogBySlot[slotKey]];

          // Filter to only dryers with official pairs in the washer catalog
          let pairedDryers = dryerCatalog.filter(d =>
            d.paired_product_id && washerIds.has(d.paired_product_id)
          );

          // WASHER TYPE VALIDATION: If washer_type is required, filter to dryers whose paired washer matches
          if (requirements.washer_type && pairedDryers.length > 0) {
            const typeMatchedDryers = pairedDryers.filter(d => {
              const pairedWasher = washerById.get(d.paired_product_id);
              if (!pairedWasher) return false;

              const washerType = this.detectWasherType(pairedWasher);
              return washerType === requirements.washer_type || washerType === 'unknown';
            });

            if (typeMatchedDryers.length > 0) {
              pairedDryers = typeMatchedDryers;
              console.log(`   🔗 Found ${pairedDryers.length} dryers with ${requirements.washer_type} paired washers for ${tier} tier`);
            } else {
              console.log(`   ⚠️ No dryers with ${requirements.washer_type} paired washers for ${tier} tier, using all paired dryers`);
            }
          }

          // If we have paired dryers, use ONLY those for selection
          if (pairedDryers.length > 0) {
            dryerCatalog = pairedDryers;
            if (!requirements.washer_type) {
              console.log(`   🔗 Found ${pairedDryers.length} dryers with official pairs for ${tier} tier`);
            }
          } else {
            console.log(`   ⚠️ No paired dryers available for ${tier} tier, using brand matching`);
          }

          const result = await this.selectProductForSlot(
            slotKey, slotConfig, dryerCatalog, tierRangesBySlot[slotKey],
            requirements, preferences, tier, preferredBrand, null, flowType
          );

          if (result.selected) {
            pkg.items.push(result.item);
            pkg.total_msrp_cents += parseInt(result.selected.msrp_cents) || 0;
            pkg.total_cost_cents += parseInt(result.selected.cost_cents) || 0;

            // Set pair constraints for washer - include official paired_product_id if available
            laundryPairConstraints = {
              brand: result.selected.manufacturer,
              series: this.extractSeries(result.selected),
              sizeClass: this.getSizeClass(result.selected),
              pairedProductId: result.selected.paired_product_id || null,
              dryerId: result.selected.id
            };
            preferredBrand = result.selected.manufacturer;

            const pairNote = laundryPairConstraints.pairedProductId
              ? `, paired with washer ID ${laundryPairConstraints.pairedProductId}`
              : '';
            console.log(`   🧺 Dryer selected: ${result.selected.manufacturer} ${result.selected.model} (${laundryPairConstraints.sizeClass}${pairNote})`);
          } else {
            emptySlots.push(result.emptySlot);
            suggestions.push(...result.suggestions);
          }
          totalRelaxationAttempts += result.relaxationAttempts;
          warnings.push(...result.warnings);
        }
      }
    }

    for (const [slotKey, slotConfig] of Object.entries(slots)) {
      // Skip if we didn't fetch catalog for this slot (flow type mismatch)
      if (!catalogBySlot[slotKey]) {
        continue;
      }

      const slotType = this.normalizeSlotType(slotKey);

      // For laundry flow: skip dryer (already processed) and skip combos if we have separate washer/dryer
      if (flowType === 'laundry') {
        if (slotType === 'dryer') {
          // Already processed above to establish pair constraints
          continue;
        }
      }

      let catalog = catalogBySlot[slotKey];
      const tierRanges = tierRangesBySlot[slotKey];

      if (catalog.length === 0) {
        console.log(`⚠️ No catalog data for slot ${slotKey}`);
        emptySlots.push({
          slot: slotKey,
          label: slotConfig.label,
          category: slotConfig.category,
          reason: 'No products in catalog for this category'
        });
        continue;
      }

      // LAUNDRY PAIR MATCHING: Apply constraints for washer based on selected dryer
      if (flowType === 'laundry' && slotType === 'washer' && laundryPairConstraints) {
        const beforeCount = catalog.length;

        // PRIORITY 1: Use official paired_product_id if available (manufacturer-defined pair)
        // BUT validate it matches the washer_type requirement first
        if (laundryPairConstraints.pairedProductId) {
          const officialPair = catalog.find(p => p.id === laundryPairConstraints.pairedProductId);
          if (officialPair) {
            // Validate washer type if required
            if (requirements.washer_type) {
              const pairWasherType = this.detectWasherType(officialPair);
              if (pairWasherType === requirements.washer_type || pairWasherType === 'unknown') {
                catalog = [officialPair];
                console.log(`   ✅ OFFICIAL PAIR: Using manufacturer-matched ${requirements.washer_type} washer ${officialPair.model}`);
              } else {
                console.log(`   ⚠️ Official pair ${officialPair.model} is ${pairWasherType}, but ${requirements.washer_type} required - falling back to matching`);
                // Don't use this pair, let the brand/size matching take over
              }
            } else {
              catalog = [officialPair];
              console.log(`   ✅ OFFICIAL PAIR: Using manufacturer-matched washer ${officialPair.model}`);
            }
          } else {
            // Paired product exists in DB but not in our filtered catalog - fetch it directly
            console.log(`   ⚠️ Official pair ID ${laundryPairConstraints.pairedProductId} not in catalog, falling back to matching`);
          }
        }

        // PRIORITY 2: Brand + Size + Series matching (if no official pair found)
        if (catalog.length > 1 || !laundryPairConstraints.pairedProductId) {
          // Step 1: Filter by brand (required for matched set)
          let matchedCatalog = catalog.filter(p =>
            p.manufacturer?.toLowerCase() === laundryPairConstraints.brand?.toLowerCase()
          );

          // Step 2: Filter by size class (compact with compact, standard with standard)
          if (matchedCatalog.length > 0) {
            const sizeMatched = matchedCatalog.filter(p =>
              this.getSizeClass(p) === laundryPairConstraints.sizeClass
            );
            if (sizeMatched.length > 0) {
              matchedCatalog = sizeMatched;
            } else {
              console.log(`   ⚠️ No ${laundryPairConstraints.sizeClass} washers from ${laundryPairConstraints.brand}, using any size`);
            }
          }

          // Step 3: Prioritize products that have THIS dryer as their paired product
          if (matchedCatalog.length > 1 && laundryPairConstraints.dryerId) {
            const reverseMatched = matchedCatalog.filter(p => p.paired_product_id === laundryPairConstraints.dryerId);
            if (reverseMatched.length > 0) {
              matchedCatalog = reverseMatched;
              console.log(`   ✅ Found ${reverseMatched.length} washer(s) with reverse pair link to this dryer`);
            }
          }

          // Step 4: Try to match series if available
          if (matchedCatalog.length > 1 && laundryPairConstraints.series) {
            const seriesMatched = matchedCatalog.filter(p => {
              const productSeries = this.extractSeries(p);
              return productSeries === laundryPairConstraints.series;
            });
            if (seriesMatched.length > 0) {
              matchedCatalog = seriesMatched;
              console.log(`   ✓ Found ${seriesMatched.length} series-matched washers`);
            }
          }

          // Fallback: if no brand match, relax to just same tier brands
          if (matchedCatalog.length === 0) {
            console.log(`   ⚠️ No ${laundryPairConstraints.brand} washers found, relaxing to same-tier brands`);
            const dryerBrandTier = this.getBrandTier(laundryPairConstraints.brand);
            matchedCatalog = catalog.filter(p => {
              const washerBrandTier = this.getBrandTier(p.manufacturer);
              return washerBrandTier === dryerBrandTier;
            });

            if (matchedCatalog.length > 0) {
              warnings.push({
                slot: slotKey,
                message: `No ${laundryPairConstraints.brand} washers available, using ${matchedCatalog[0].manufacturer} from same tier`,
                originalBrand: laundryPairConstraints.brand
              });
            }
          }

          if (matchedCatalog.length > 0) {
            catalog = matchedCatalog;
            console.log(`   🧺 Washer candidates: ${beforeCount} → ${catalog.length} (matched to ${laundryPairConstraints.brand} ${laundryPairConstraints.sizeClass})`);
          } else {
            // Last resort: use original catalog but add warning
            warnings.push({
              slot: slotKey,
              message: `Could not find matching washer for ${laundryPairConstraints.brand} dryer`,
              severity: 'high'
            });
          }
        }
      }

      // PROGRESSIVE FILTER RELAXATION
      // Start with strictest filters, progressively relax until we get results
      // IMPORTANT: Never relax brand filter when user explicitly specified a brand
      const hasBrandRequirement = requirements.brand_preference && requirements.brand_preference !== 'any';

      const filterLevels = hasBrandRequirement ? [
        // When brand is specified, NEVER relax it - only relax price, finish, dimensions
        { name: 'strict', relaxations: [] },
        { name: 'relax_price', relaxations: ['price'] },
        { name: 'relax_price_finish', relaxations: ['price', 'finish'] },
        { name: 'relax_price_finish_dimensions', relaxations: ['price', 'finish', 'dimensions'] }
      ] : [
        // When no brand specified, can relax all filters
        { name: 'strict', relaxations: [] },
        { name: 'relax_price', relaxations: ['price'] },
        { name: 'relax_price_brand', relaxations: ['price', 'brand'] },
        { name: 'relax_price_brand_finish', relaxations: ['price', 'brand', 'finish'] },
        { name: 'relax_all', relaxations: ['price', 'brand', 'finish', 'dimensions'] }
      ];

      let filteredCandidates = [];
      let appliedLevel = filterLevels[0];

      for (const level of filterLevels) {
        filteredCandidates = this.applyFilters(
          catalog,
          requirements,
          preferences,
          tier,
          tierRanges,
          slotKey,
          level.relaxations
        );

        if (filteredCandidates.length > 0) {
          appliedLevel = level;
          break;
        }
        totalRelaxationAttempts++;
      }

      if (filteredCandidates.length === 0) {
        console.log(`⚠️ No candidates found for slot ${slotKey} in ${tier} tier after all relaxations`);
        emptySlots.push({
          slot: slotKey,
          label: slotConfig.label,
          category: slotConfig.category,
          totalInCatalog: catalog.length
        });

        // Generate helpful suggestions
        const suggestionList = this.generateSuggestions(requirements, slotKey, catalog);
        suggestions.push(...suggestionList);
        continue;
      }

      if (appliedLevel.name !== 'strict') {
        warnings.push({
          slot: slotKey,
          message: `Relaxed filters to find matches (level: ${appliedLevel.name})`,
          relaxations: appliedLevel.relaxations
        });
      }

      // Score and rank candidates using preferences
      const scored = this.scoreProducts(
        filteredCandidates,
        preferences,
        slotConfig,
        tier,
        tierRanges,
        preferredBrand
      );

      // Select best match
      if (scored.length > 0) {
        const selected = scored[0];

        pkg.items.push({
          slot: slotKey,
          slot_label: slotConfig.label,
          product: selected.product,
          score: selected.score,
          scoreBreakdown: selected.breakdown,
          filterLevel: appliedLevel.name
        });

        // Set preferred brand from first item (for brand cohesion)
        if (!preferredBrand && preferences.brand_preference !== 'any') {
          preferredBrand = selected.product.manufacturer;
        }

        pkg.total_msrp_cents += parseInt(selected.product.msrp_cents) || 0;
        pkg.total_cost_cents += parseInt(selected.product.cost_cents) || 0;
      }
    }

    // Calculate bundle savings if applicable
    pkg.bundle_savings_cents = await this.calculateBundleSavings(pkg, template);
    pkg.hasEmptySlots = emptySlots.length > 0;

    return {
      package: pkg,
      emptySlots,
      warnings,
      suggestions,
      relaxationAttempts: totalRelaxationAttempts
    };
  }

  /**
   * Apply filters to catalog with optional relaxations
   * @param {Array} catalog - Full product catalog
   * @param {object} requirements - Hard requirements
   * @param {object} preferences - Soft preferences
   * @param {string} tier - 'good', 'better', or 'best'
   * @param {object} tierRanges - Dynamic tier ranges
   * @param {string} slotKey - Slot key for dimension rules
   * @param {Array} relaxations - Which filters to relax
   * @returns {Array} Filtered products
   */
  applyFilters(catalog, requirements, preferences, tier, tierRanges, slotKey, relaxations = []) {
    let filtered = [...catalog];
    const slotType = this.normalizeSlotType(slotKey);

    // 1. PRICE TIER FILTER (core to Good/Better/Best)
    if (!relaxations.includes('price')) {
      const priceRange = tierRanges[tier];
      // Allow some flexibility: 0.8x min to 1.2x max
      const minPrice = priceRange.min * 0.8;
      const maxPrice = priceRange.max * 1.2;
      filtered = filtered.filter(p => {
        const price = parseInt(p.msrp_cents) || 0;
        return price >= minPrice && price <= maxPrice;
      });
    }

    // 2. BRAND FILTER (if required, not just preferred)
    if (!relaxations.includes('brand')) {
      if (requirements.brand_preference && requirements.brand_preference !== 'any') {
        const originalBrand = requirements.brand_preference.toLowerCase();
        const normalizedBrand = this.normalizeBrandName(requirements.brand_preference).toLowerCase();
        // Check both original and normalized (e.g., "jenn-air" vs "jennair")
        filtered = filtered.filter(p => {
          const mfr = p.manufacturer?.toLowerCase() || '';
          return mfr.includes(originalBrand) || mfr.includes(normalizedBrand);
        });
      }

      // Brands to avoid (always apply unless fully relaxed)
      if (requirements.brands_to_avoid && Array.isArray(requirements.brands_to_avoid)) {
        const avoidBrands = requirements.brands_to_avoid.map(b =>
          this.normalizeBrandName(b).toLowerCase()
        );
        filtered = filtered.filter(p =>
          !avoidBrands.some(avoid => p.manufacturer?.toLowerCase().includes(avoid))
        );
      }
    }

    // 3. FINISH FILTER
    if (!relaxations.includes('finish')) {
      if (requirements.finish && requirements.finish !== 'any') {
        filtered = filtered.filter(p =>
          !p.finish || p.finish === requirements.finish ||
          p.color?.toLowerCase().includes(requirements.finish.toLowerCase())
        );
      }
    }

    // 4. FUEL TYPE FILTER (always required for ranges, cooktops, and dryers)
    // STRICT: Must match exactly - use detection methods for reliable matching
    if ((slotType === 'range' || slotType === 'cooktop') && requirements.range_fuel) {
      filtered = filtered.filter(p => {
        const detectedFuel = this.detectRangeFuelType(p);

        // Handle dual fuel option
        if (requirements.range_fuel === 'dual_fuel') {
          return detectedFuel === 'dual_fuel';
        }

        // Handle induction option - must match induction specifically
        if (requirements.range_fuel === 'induction') {
          return detectedFuel === 'induction';
        }

        if (requirements.range_fuel === 'gas') {
          return detectedFuel === 'gas' || detectedFuel === 'dual_fuel';
        } else if (requirements.range_fuel === 'electric') {
          // Electric filter should NOT include induction (induction is separate)
          return detectedFuel === 'electric' || detectedFuel === 'unknown';
        }

        return true;
      });
    }
    if (slotType === 'dryer' && requirements.dryer_fuel) {
      filtered = filtered.filter(p => {
        const detectedFuel = this.detectDryerFuelType(p);

        if (requirements.dryer_fuel === 'gas') {
          return detectedFuel === 'gas';
        } else if (requirements.dryer_fuel === 'electric') {
          return detectedFuel === 'electric' || detectedFuel === 'unknown'; // Allow unknown for electric (most common)
        }

        return true;
      });
    }

    // 5. DIMENSION RULES (appliance-specific)
    if (!relaxations.includes('dimensions')) {
      // Fridge depth type
      if (slotType === 'refrigerator' && requirements.fridge_depth) {
        if (requirements.fridge_depth === 'counter_depth') {
          filtered = filtered.filter(p =>
            p.depth_type === 'counter_depth' ||
            (p.depth_inches_x10 && p.depth_inches_x10 <= 300)
          );
        }
      }

      // Fridge style - use detection method for reliable matching
      if (slotType === 'refrigerator' && requirements.fridge_style) {
        filtered = filtered.filter(p => {
          const detectedStyle = this.detectFridgeStyle(p);
          // Match if detected style equals required, or if unknown (allow flexibility)
          return detectedStyle === requirements.fridge_style || detectedStyle === 'unknown';
        });
      }

      // Fridge width - filter by width in inches
      if (slotType === 'refrigerator' && requirements.fridge_width) {
        filtered = filtered.filter(p => {
          const detectedWidth = this.detectFridgeWidth(p);
          const requiredWidth = parseInt(requirements.fridge_width) || 0;

          if (requiredWidth === 0) return true; // No width requirement

          // Allow within 2 inches tolerance (e.g., 35" to 37" for 36" requirement)
          if (detectedWidth > 0) {
            return Math.abs(detectedWidth - requiredWidth) <= 2;
          }

          // Unknown width - allow if no better match found
          return true;
        });
      }

      // Range width - filter by width in inches
      if (slotType === 'range' && requirements.range_width) {
        filtered = filtered.filter(p => {
          const detectedWidth = this.detectRangeWidth(p);
          const requiredWidth = parseInt(requirements.range_width) || 0;

          if (requiredWidth === 0) return true;

          // Allow within 1 inch tolerance
          if (detectedWidth > 0) {
            return Math.abs(detectedWidth - requiredWidth) <= 1;
          }

          return true;
        });
      }

      // Washer type - STRICT: Must match front_load or top_load
      if (slotType === 'washer' && requirements.washer_type) {
        filtered = filtered.filter(p => {
          const detectedType = this.detectWasherType(p);

          if (requirements.washer_type === 'front_load') {
            // Require front load - exclude anything detected as top_load
            return detectedType === 'front_load' || detectedType === 'unknown';
          } else if (requirements.washer_type === 'top_load') {
            // Require top load - exclude anything detected as front_load
            return detectedType === 'top_load' || detectedType === 'unknown';
          }

          return true; // No type restriction
        });
      }

      // Stackable requirement
      if ((slotType === 'washer' || slotType === 'dryer') && requirements.space_layout === 'stackable') {
        filtered = filtered.filter(p => p.is_stackable !== false);
      }
    }

    // 6. ICE/WATER FILTER (NEVER RELAXED - customer explicit requirement)
    // This is outside the dimensions block so it's always applied
    if (slotType === 'refrigerator' && requirements.ice_water) {
      filtered = filtered.filter(p => {
        const detectedIceWater = this.detectFridgeIceWater(p);

        if (requirements.ice_water === 'door') {
          // Door dispenser required - must have external dispenser
          return detectedIceWater === 'door';
        } else if (requirements.ice_water === 'inside') {
          // Internal ice maker - no external dispenser
          return detectedIceWater === 'inside' || detectedIceWater === 'door';
        } else if (requirements.ice_water === 'none') {
          // No ice/water preference - allow any
          return true;
        }

        return true; // No restriction
      });

      // Log ice_water filter results
      console.log(`[Ice/Water Filter] Required: ${requirements.ice_water}, filtered to ${filtered.length} products`);
    }

    // 7. DISHWASHER NOISE LEVEL
    if (slotType === 'dishwasher' && requirements.dishwasher_quiet) {
      if (requirements.dishwasher_quiet === 'very_quiet') {
        filtered = filtered.filter(p => !p.db_level || p.db_level <= 44);
      } else if (requirements.dishwasher_quiet === 'quiet') {
        filtered = filtered.filter(p => !p.db_level || p.db_level <= 49);
      }
    }

    return filtered;
  }

  /**
   * Score products based on soft preferences with dynamic tier ranges
   */
  scoreProducts(products, preferences, slotConfig, tier, tierRanges, preferredBrand) {
    return products.map(product => {
      const breakdown = {};
      let totalScore = 0;

      // 1. Price band score (25%) - using dynamic tier ranges
      const priceScore = this.scorePriceBandDynamic(product, tier, tierRanges);
      breakdown.price_band = priceScore;
      totalScore += priceScore * (this.defaultWeights.price_band / 100);

      // 2. Brand cohesion + Brand tier match (20%)
      let brandScore = 70; // Neutral default
      if (preferredBrand) {
        // Match with package's preferred brand (for cohesion)
        brandScore = product.manufacturer?.toLowerCase() === preferredBrand.toLowerCase() ? 100 : 40;
      } else if (preferences.brand_preference && preferences.brand_preference !== 'any') {
        // Soft brand preference - boost matching brand
        const prefBrand = this.normalizeBrandName(preferences.brand_preference);
        brandScore = product.manufacturer?.toLowerCase().includes(prefBrand.toLowerCase()) ? 90 : 60;
      } else {
        // No brand preference - score based on brand tier alignment with package tier
        brandScore = this.scoreBrandTierAlignment(product.manufacturer, tier);
      }
      breakdown.brand_cohesion = brandScore;
      totalScore += brandScore * (this.defaultWeights.brand_cohesion / 100);

      // 3. Finish match (15%)
      let finishScore = 80;
      if (preferences.finish && preferences.finish !== 'any') {
        finishScore = this.scoreFinishMatch(product.finish || product.color, preferences.finish);
      }
      breakdown.finish_match = finishScore;
      totalScore += finishScore * (this.defaultWeights.finish_match / 100);

      // 4. Reliability tier (15%)
      let reliabilityScore = 70;
      if (preferences.priority?.includes('reliability')) {
        reliabilityScore = this.scoreReliability(product, tier);
      } else {
        // Default reliability scoring based on tier
        reliabilityScore = this.scoreReliability(product, tier);
      }
      breakdown.reliability = reliabilityScore;
      totalScore += reliabilityScore * (this.defaultWeights.reliability / 100);

      // 5. Stock status (10%)
      const stockScore = product.active !== false ? 100 : 30;
      breakdown.stock_status = stockScore;
      totalScore += stockScore * (this.defaultWeights.stock_status / 100);

      // 6. Bundle discount availability (10%)
      const bundleScore = product.bundle_sku ? 100 : 50;
      breakdown.bundle_discount = bundleScore;
      totalScore += bundleScore * (this.defaultWeights.bundle_discount / 100);

      // 7. Smart level match (5%)
      let smartScore = 70;
      if (preferences.smart_features === 'yes') {
        smartScore = (product.smart_level || 0) >= 1 ? 100 : 30;
      } else if (preferences.smart_features === 'no') {
        smartScore = (product.smart_level || 0) === 0 ? 100 : 60;
      }
      breakdown.smart_level = smartScore;
      totalScore += smartScore * (this.defaultWeights.smart_level / 100);

      return {
        product,
        score: Math.round(totalScore),
        breakdown
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Score price band using dynamic tier ranges
   */
  scorePriceBandDynamic(product, tier, tierRanges) {
    const price = parseInt(product.msrp_cents) || 0;
    const range = tierRanges[tier];

    if (price >= range.min && price <= range.max) {
      // Perfect fit - score based on distance from tier center
      const midpoint = (range.min + range.max) / 2;
      const distance = Math.abs(price - midpoint);
      const maxDistance = (range.max - range.min) / 2;
      return Math.round(100 - (distance / maxDistance) * 15); // 85-100 range
    } else if (price < range.min) {
      // Below tier range - slightly penalize
      const distance = range.min - price;
      return Math.max(50, Math.round(80 - (distance / range.min) * 30));
    } else {
      // Above tier range - slightly penalize
      const distance = price - range.max;
      return Math.max(50, Math.round(80 - (distance / range.max) * 30));
    }
  }

  /**
   * Score brand alignment with package tier
   * Premium brands score better in 'best' tier, value brands in 'good' tier
   */
  scoreBrandTierAlignment(manufacturer, tier) {
    if (!manufacturer) return 70;

    const mfg = manufacturer.toLowerCase();

    // Check which tier the brand falls into
    const isPremium = this.BRAND_TIERS.premium.some(b => mfg.includes(b.toLowerCase()));
    const isBetter = this.BRAND_TIERS.better.some(b => mfg.includes(b.toLowerCase()));
    const isGood = this.BRAND_TIERS.good.some(b => mfg.includes(b.toLowerCase()));

    if (tier === 'best') {
      if (isPremium) return 100;
      if (isBetter) return 80;
      if (isGood) return 60;
    } else if (tier === 'better') {
      if (isBetter) return 100;
      if (isPremium) return 80;
      if (isGood) return 70;
    } else { // good
      if (isGood) return 100;
      if (isBetter) return 80;
      if (isPremium) return 60; // Premium brands in 'good' tier is a mismatch
    }

    return 70; // Unknown brand - neutral score
  }

  /**
   * Generate helpful suggestions when no products match
   * @param {object} requirements - Current requirements
   * @param {string} slotKey - Slot key
   * @param {Array} catalog - Full catalog for this slot (for analysis)
   */
  generateSuggestions(requirements, slotKey, catalog = []) {
    const suggestions = [];

    // Analyze catalog to provide data-driven suggestions
    const catalogStats = this.analyzeCatalog(catalog);

    if (requirements.brand_preference && requirements.brand_preference !== 'any') {
      const brandCount = catalog.filter(p =>
        p.manufacturer?.toLowerCase().includes(requirements.brand_preference.toLowerCase())
      ).length;
      suggestions.push({
        field: 'brand_preference',
        current: requirements.brand_preference,
        availableCount: brandCount,
        suggestion: brandCount === 0
          ? `No ${requirements.brand_preference} products found in this category. Try "Any brand" to see ${catalog.length} options.`
          : `Only ${brandCount} ${requirements.brand_preference} products available. Consider "Any brand" for more options.`,
        availableBrands: catalogStats.topBrands
      });
    }

    if (requirements.fridge_depth === 'counter_depth') {
      const counterDepthCount = catalog.filter(p =>
        p.depth_type === 'counter_depth' || (p.depth_inches_x10 && p.depth_inches_x10 <= 300)
      ).length;
      suggestions.push({
        field: 'fridge_depth',
        current: 'counter_depth',
        availableCount: counterDepthCount,
        suggestion: counterDepthCount === 0
          ? 'No counter-depth refrigerators found. Consider standard depth.'
          : `${counterDepthCount} counter-depth options available.`
      });
    }

    if (requirements.fridge_style) {
      const styleCount = catalog.filter(p =>
        p.subtype === requirements.fridge_style ||
        p.name?.toLowerCase().includes(requirements.fridge_style.replace('_', ' '))
      ).length;
      suggestions.push({
        field: 'fridge_style',
        current: requirements.fridge_style,
        availableCount: styleCount,
        suggestion: styleCount === 0
          ? `No ${requirements.fridge_style.replace('_', ' ')} refrigerators found. Try "Any style".`
          : `${styleCount} ${requirements.fridge_style.replace('_', ' ')} options available.`,
        availableStyles: catalogStats.subtypes
      });
    }

    // Suggest if catalog itself is empty
    if (catalog.length === 0) {
      suggestions.push({
        field: 'category',
        current: slotKey,
        suggestion: 'No products found for this category. Check that products are imported with correct categories.'
      });
    }

    return suggestions;
  }

  /**
   * Analyze catalog to provide data-driven suggestions
   */
  analyzeCatalog(catalog) {
    if (catalog.length === 0) return { topBrands: [], subtypes: [], priceRange: null };

    // Get brand distribution
    const brandCounts = {};
    catalog.forEach(p => {
      if (p.manufacturer) {
        brandCounts[p.manufacturer] = (brandCounts[p.manufacturer] || 0) + 1;
      }
    });
    const topBrands = Object.entries(brandCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([brand, count]) => ({ brand, count }));

    // Get subtype distribution
    const subtypeCounts = {};
    catalog.forEach(p => {
      if (p.subtype) {
        subtypeCounts[p.subtype] = (subtypeCounts[p.subtype] || 0) + 1;
      }
    });
    const subtypes = Object.entries(subtypeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([subtype, count]) => ({ subtype, count }));

    // Get price range
    const prices = catalog.map(p => parseInt(p.msrp_cents) || 0).filter(p => p > 0);
    const priceRange = prices.length > 0 ? {
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    } : null;

    return { topBrands, subtypes, priceRange };
  }

  // Scoring helper methods
  scoreFinishMatch(productFinish, preferredFinish) {
    if (!productFinish) return 50;
    if (productFinish === preferredFinish) return 100;

    const similarFinishes = {
      'stainless': ['black_stainless', 'chrome'],
      'black_stainless': ['stainless', 'black'],
      'black': ['black_stainless', 'graphite'],
      'white': [],
      'graphite': ['black', 'black_stainless']
    };

    if (similarFinishes[preferredFinish]?.includes(productFinish)) {
      return 60;
    }
    return 30;
  }

  scoreReliability(product, tier) {
    const reliabilityTier = product.reliability_tier || 3;
    const expectedReliability = { good: 2, better: 3, best: 4 };
    const expected = expectedReliability[tier];

    if (reliabilityTier >= expected) {
      return 100;
    }
    return Math.max(0, 100 - (expected - reliabilityTier) * 25);
  }

  calculateBrandCohesion(items) {
    if (items.length === 0) return 0;

    const brands = items.map(item => item.product.manufacturer);
    const uniqueBrands = [...new Set(brands)];

    if (uniqueBrands.length === 1) return 100;

    const brandCounts = {};
    brands.forEach(b => { brandCounts[b] = (brandCounts[b] || 0) + 1; });
    const maxCount = Math.max(...Object.values(brandCounts));

    return Math.round((maxCount / items.length) * 100);
  }

  async calculateBundleSavings(pkg, template) {
    if (pkg.items.length < 3) return 0;

    const cohesion = this.calculateBrandCohesion(pkg.items);

    if (cohesion >= 100) {
      const discountPercent = parseFloat(template.bundle_discount_percent) || 5;
      return Math.round(pkg.total_msrp_cents * (discountPercent / 100));
    }

    return 0;
  }

  normalizeBrandName(brand) {
    if (!brand) return '';
    return this.brandMap[brand.toLowerCase()] || brand;
  }

  /**
   * Detect refrigerator width in inches from product data
   * @param {object} product - Product with model, category, name, width_inches_x10
   * @returns {number} Width in inches, or 0 if unknown
   */
  detectFridgeWidth(product) {
    if (!product) return 0;

    // Check explicit width field first (stored as inches * 10)
    if (product.width_inches_x10 && product.width_inches_x10 > 0) {
      return Math.round(product.width_inches_x10 / 10);
    }

    const category = (product.category || '').toLowerCase();
    const model = (product.model || '').toUpperCase();
    const name = (product.name || '').toLowerCase();

    // Check category for width indicators (e.g., "36 FDR", "33 FDR", "30 FDR")
    const categoryWidthMatch = category.match(/(\d{2})\s*(fdr|sxs|bmf|tmf|4dr|4dflex)/i);
    if (categoryWidthMatch) {
      return parseInt(categoryWidthMatch[1]);
    }

    // Check for explicit width in name (e.g., "36 inch", "36-inch", "36\"")
    const nameWidthMatch = name.match(/(\d{2})[\s-]*(inch|"|in\b)/i);
    if (nameWidthMatch) {
      return parseInt(nameWidthMatch[1]);
    }

    // Samsung model patterns (RF28, RF23, etc. - first 2 digits after RF often indicate size class)
    if (/^RF\d{2}/.test(model)) {
      const sizeDigits = parseInt(model.substring(2, 4));
      if (sizeDigits >= 28 && sizeDigits <= 32) return 36; // Large French Door
      if (sizeDigits >= 22 && sizeDigits <= 27) return 33; // Medium French Door
      if (sizeDigits >= 15 && sizeDigits <= 21) return 30; // Compact
    }

    // LG model patterns (LRF, LRMV, etc.)
    if (/^LRF/.test(model) || /^LRMV/.test(model)) {
      return 36; // Most LG French doors are 36"
    }

    // Check for size in category/name text
    if (category.includes('36') || name.includes('36')) return 36;
    if (category.includes('33') || name.includes('33')) return 33;
    if (category.includes('30') || name.includes('30')) return 30;
    if (category.includes('42') || name.includes('42')) return 42;
    if (category.includes('48') || name.includes('48')) return 48;

    return 0; // Unknown
  }

  /**
   * Detect range width in inches from product data
   * @param {object} product - Product with model, category, name, width_inches_x10
   * @returns {number} Width in inches, or 0 if unknown
   */
  detectRangeWidth(product) {
    if (!product) return 0;

    // Check explicit width field first
    if (product.width_inches_x10 && product.width_inches_x10 > 0) {
      return Math.round(product.width_inches_x10 / 10);
    }

    const category = (product.category || '').toLowerCase();
    const model = (product.model || '').toUpperCase();
    const name = (product.name || '').toLowerCase();

    // Check for explicit width in name
    const nameWidthMatch = name.match(/(\d{2})[\s-]*(inch|"|in\b)/i);
    if (nameWidthMatch) {
      const width = parseInt(nameWidthMatch[1]);
      if ([24, 30, 36, 48, 60].includes(width)) return width;
    }

    // Most residential ranges are 30"
    // Check for indicators of other sizes
    if (name.includes('36') || category.includes('36')) return 36;
    if (name.includes('48') || category.includes('48')) return 48;
    if (name.includes('24') || category.includes('24')) return 24;
    if (name.includes('commercial') || category.includes('commercial')) return 48;

    // Default assumption for standard residential range
    return 30;
  }

  /**
   * Detect range/cooktop fuel type (gas, electric, induction, or dual_fuel) from product model/name
   * @param {object} product - Product with model and name
   * @returns {string} 'gas', 'electric', 'induction', 'dual_fuel', or 'unknown'
   */
  detectRangeFuelType(product) {
    if (!product) return 'unknown';

    const model = (product.model || '').toUpperCase();
    const name = (product.name || '').toLowerCase();
    const category = (product.category || '').toLowerCase();

    // Check explicit fuel_type field first
    if (product.fuel_type) {
      const fuel = product.fuel_type.toLowerCase();
      if (fuel.includes('induction')) return 'induction';
      if (fuel.includes('gas') || fuel === 'propane' || fuel === 'lp') return 'gas';
      if (fuel.includes('dual')) return 'dual_fuel';
      if (fuel.includes('electric')) return 'electric';
    }

    // Check category for explicit fuel type
    // Category patterns: "Slide-in Induction", "Freestanding Gas", "Commercial Range Natural Gas", etc.
    if (category.includes('induction')) return 'induction';
    if (category.includes('dual fuel') || category.includes('dual-fuel')) return 'dual_fuel';
    if (category.includes('natural gas') || category.includes('gas range') ||
        (category.includes('gas') && !category.includes('dual'))) return 'gas';
    if (category.includes('electric') && !category.includes('induction')) return 'electric';

    // Check for dual fuel first (before gas/electric) in name
    if (name.includes('dual fuel') || name.includes('dual-fuel')) return 'dual_fuel';

    // Check for induction in name or model - BEFORE checking electric
    const inductionPatterns = [
      /^NZ\d/.test(model),            // Samsung induction NZ60, NZ36
      /^NSI\d/.test(model),           // Samsung NSI induction
      /^NE\d+.*I[A-Z]*$/.test(model), // Samsung with I suffix
      /^LSI[A-Z]*\d/.test(model),     // LG LSI = induction
      /^PHI\d/.test(model),           // GE Profile PHI = induction
      /^PHS\d/.test(model),           // GE Profile PHS induction
      /^JI\d/.test(model),            // GE JI = induction
      /^CCHS9[89]/.test(model),       // Café CCHS98, CCHS99 = induction
      /^CHP9[05]/.test(model),        // Café CHP90, CHP95 = induction cooktop
      /^KSI[A-Z]*\d/.test(model),     // KitchenAid KSI = induction
      /^KFID\d/.test(model),          // KitchenAid KFID = induction
      /^WEI\d/.test(model),           // Whirlpool WEI = induction
      /^WSIS\d/.test(model),          // Whirlpool WSIS = induction slide-in
      /^HII\d/.test(model),           // Bosch HII = induction
      /^HIIP\d/.test(model),          // Bosch HIIP = induction
      /^B36I/.test(model),            // Bosch B36I = induction
      /^F[46]IT\d/.test(model),       // Fulgor Milano F4IT, F6IT = induction
      /^F6IRT\d/.test(model),         // Fulgor Milano F6IRT = induction
      /^JPIFC\d/.test(model),         // Jenn-Air JPIFC = induction
      /^JIS\d/.test(model),           // Jenn-Air JIS = induction
      /^HER.*I/.test(model),          // Bertazzoni HER...I = induction (HER365ICFEP)
      /^PCFI\d/.test(model),          // Frigidaire Pro PCFI = induction
      /^FCFI\d/.test(model),          // Frigidaire FCFI = induction
      /^GCFI\d/.test(model),          // Frigidaire Gallery GCFI = induction
      /^GCRI\d/.test(model),          // Frigidaire Gallery GCRI = induction
      /^FCRI\d/.test(model),          // Frigidaire FCRI = induction
      /^ECFI\d/.test(model),          // Electrolux ECFI = induction
      /^ECCI\d/.test(model),          // Electrolux ECCI = induction cooktop
      /^DIRC\d/.test(model),          // Danby DIRC = induction
    ];

    if (name.includes('induction') || model.includes('INDUCTION') || inductionPatterns.some(p => p)) {
      return 'induction';
    }

    // Gas indicators in model numbers
    const gasPatterns = [
      /^[A-Z]*G[A-Z]*\d/,      // G near start (JGS, CGS, WFG, MFGS, etc.)
      /GAS/,                    // Explicit "GAS"
      /^N[GX]\d/,              // NG (natural gas) or NX (Samsung gas)
      /^JGRP\d/.test(model),   // Jenn-Air JGRP = gas pro
      /^JDRP\d/.test(model),   // Jenn-Air JDRP = dual fuel pro (has gas)
      /^ECFG\d/.test(model),   // Electrolux ECFG = gas
      /^PCFG\d/.test(model),   // Frigidaire Pro PCFG = gas
      /^GCFG\d/.test(model),   // Frigidaire Gallery GCFG = gas
      /^GCRG\d/.test(model),   // Frigidaire Gallery GCRG = gas
      /^HRG\d/.test(model),    // Thor Kitchen HRG = gas
      /^ARG\d/.test(model),    // Thor Kitchen ARG = gas
    ];

    // Electric indicators (NOT including induction)
    const electricPatterns = [
      /^[A-Z]*E[A-Z]*\d/,      // E near start (JES, CES, WFE, etc.)
      /ELEC/,                   // Explicit "ELEC"
      /^NE\d/,                 // Samsung electric (NE63, NE60)
      /^FCFE\d/.test(model),   // Frigidaire FCFE = electric
      /^FCRE\d/.test(model),   // Frigidaire FCRE = electric
      /^GCFE\d/.test(model),   // Frigidaire Gallery GCFE = electric
      /^GCRE\d/.test(model),   // Frigidaire Gallery GCRE = electric
      /^PCFE\d/.test(model),   // Frigidaire Pro PCFE = electric
      /^HRE\d/.test(model),    // Thor Kitchen HRE = electric
      /^ARE\d/.test(model),    // Thor Kitchen ARE = electric
      /^F[14]M[ST]M?\d/.test(model), // Fulgor Milano F1MSM, F4MT = electric oven
    ];

    // Check model patterns and name/category
    const isGas = gasPatterns.some(p => typeof p === 'boolean' ? p : p.test(model)) ||
                  name.includes(' gas ') || name.includes(' gas,') || name.includes('gas range') ||
                  name.includes('propane') || name.includes('natural gas');

    const isElectric = electricPatterns.some(p => typeof p === 'boolean' ? p : p.test(model)) ||
                       name.includes('electric') || name.includes('radiant') ||
                       name.includes('smooth') || name.includes('coil');

    // Dual fuel detection from model
    const isDualFuel = /^JDRP\d/.test(model) ||  // Jenn-Air dual fuel pro
                       /^ECFD\d/.test(model) ||  // Electrolux ECFD = dual fuel
                       /^PCFD\d/.test(model) ||  // Frigidaire Pro PCFD = dual fuel
                       /^C2Y\d/.test(model) ||   // Café C2Y = dual fuel commercial
                       /^HRD\d/.test(model) ||   // Thor Kitchen HRD = dual fuel
                       name.includes('dual fuel') || name.includes('dual-fuel');

    if (isDualFuel) return 'dual_fuel';
    if (isGas) return 'gas';
    if (isElectric) return 'electric';

    // Default for generic "Cooking" or "Range" categories - check for electric indicators
    // Most freestanding ranges without explicit fuel are electric
    if (category.includes('range') || category.includes('cooking') || category.includes('cooker')) {
      // If no fuel indicator found, default to electric (most common)
      return 'electric';
    }

    return 'unknown';
  }

  /**
   * Detect dryer fuel type (gas or electric) from product model/name
   * @param {object} product - Product with model and name
   * @returns {string} 'gas', 'electric', or 'unknown'
   */
  detectDryerFuelType(product) {
    if (!product) return 'unknown';

    // Check explicit fuel_type field first
    if (product.fuel_type) {
      const fuel = product.fuel_type.toLowerCase();
      if (fuel.includes('gas') || fuel === 'propane' || fuel === 'lp') return 'gas';
      if (fuel.includes('electric')) return 'electric';
    }

    const model = (product.model || '').toUpperCase();
    const name = (product.name || '').toLowerCase();

    // Gas dryer indicators in model numbers
    // Gas dryers typically have 'G' in model (e.g., MGD vs MED, DV45G vs DV45E)
    const gasPatterns = [
      /^[MY]*[A-Z]*GD\d/,     // MGD, YMGD (Maytag gas dryers)
      /^[MY]*[A-Z]*G[A-Z]*\d/,// G near start after prefix
      /GAS/,                   // Explicit "GAS" in model
      /DV\d+G/,               // Samsung DVxxG = gas
      /GTD\d/,                // GE GTD = gas
      /G[TDFW]\d/,            // GT, GD, GF, GW followed by number
    ];

    // Electric dryer indicators
    const electricPatterns = [
      /^[MY]*[A-Z]*ED\d/,     // MED, YMED (Maytag electric dryers)
      /DV\d+E/,               // Samsung DVxxE = electric
      /^[A-Z]*E[TD]\d/,       // ETD, etc.
    ];

    const isGas = gasPatterns.some(pattern => pattern.test(model)) ||
                  name.includes('gas') || name.includes('propane');

    const isElectric = electricPatterns.some(pattern => pattern.test(model)) ||
                       name.includes('electric');

    if (isGas && !isElectric) return 'gas';
    if (isElectric && !isGas) return 'electric';

    // Default: most dryers are electric
    return 'unknown';
  }

  /**
   * Detect refrigerator style from product model/name
   * @param {object} product - Product with model and name
   * @returns {string} 'french_door', 'side_by_side', 'top_freezer', 'bottom_freezer', or 'unknown'
   */
  detectFridgeStyle(product) {
    if (!product) return 'unknown';

    // Check explicit subtype field first
    if (product.subtype) {
      const subtype = product.subtype.toLowerCase().replace(/[_\s-]/g, '');
      if (subtype.includes('frenchdoor') || subtype.includes('french')) return 'french_door';
      if (subtype.includes('sidebyside') || subtype.includes('sxs')) return 'side_by_side';
      if (subtype.includes('topfreezer') || subtype.includes('topmount')) return 'top_freezer';
      if (subtype.includes('bottomfreezer') || subtype.includes('bottommount')) return 'bottom_freezer';
    }

    const model = (product.model || '').toUpperCase();
    const name = (product.name || '').toLowerCase();
    const category = (product.category || '').toLowerCase();

    // Category-based detection first (most reliable)
    // FDR = French Door, SxS = Side by Side, TMF = Top Mount Freezer, BMF = Bottom Mount Freezer
    if (category.includes('french door') || category.includes('fdr') ||
        category.includes('multidoor') || category.includes('3 door') ||
        category.includes('4 door') || category.includes('5 door')) {
      return 'french_door';
    }
    if (category.includes('side by side') || category.includes('side-by-side') ||
        category.includes('sxs') || category.includes('sbs')) {
      return 'side_by_side';
    }
    if (category.includes('top mount') || category.includes('top freezer') ||
        category.includes('tmf')) {
      return 'top_freezer';
    }
    if (category.includes('bottom mount') || category.includes('bottom freezer') ||
        category.includes('bmf') || category.includes('bottom 2 door')) {
      return 'bottom_freezer';
    }

    // French door patterns - name and model
    const frenchDoorPatterns = [
      /^RF\d/.test(model),             // Samsung RF = French Door
      /^LF[A-Z]*\d/.test(model),       // LG LF = French Door
      /^LR[FX][A-Z]*\d/.test(model),   // LG LRF, LRX = French Door
      /^GFE\d/.test(model),            // GE GFE = French Door
      /^GYE\d/.test(model),            // GE GYE = French Door Counter Depth
      /^GWE\d/.test(model),            // GE GWE = French Door
      /^CJE\d/.test(model),            // Café CJE = French Door
      /^CVE\d/.test(model),            // Café CVE = French Door
      /^WRF\d/.test(model),            // Whirlpool WRF = French Door
      /^WRMF\d/.test(model),           // Whirlpool WRMF = French Door
      /^KRFF\d/.test(model),           // KitchenAid KRFF = French Door
      /^KRMF\d/.test(model),           // KitchenAid KRMF = French Door
      /^FRFG\d/.test(model),           // Frigidaire FRFG = French Door
      /^FRFN\d/.test(model),           // Frigidaire FRFN = French Door
      /^GRFC\d/.test(model),           // Frigidaire Gallery GRFC = French Door
      /^GRFG\d/.test(model),           // Frigidaire Gallery GRFG = French Door
      /^GRFN\d/.test(model),           // Frigidaire Gallery GRFN = French Door
      /^PRFC\d/.test(model),           // Frigidaire Pro PRFC = French Door
      /^PRFG\d/.test(model),           // Frigidaire Pro PRFG = French Door
      /^PRFS\d/.test(model),           // Frigidaire Pro PRFS = French Door
      /^PRMC\d/.test(model),           // Frigidaire Pro PRMC = French Door
      /^ERFC\d/.test(model),           // Electrolux ERFC = French Door
      /^ERFG\d/.test(model),           // Electrolux ERFG = French Door
      /^ERMC\d/.test(model),           // Electrolux ERMC = French Door
      /^B36[CF]/.test(model),          // Bosch B36C, B36F = French Door
      /^RF30\d/.test(model),           // Thor Kitchen RF30 = French Door
      /^RF36\d/.test(model),           // Thor Kitchen RF36 = French Door
      /^F7IBM\d/.test(model),          // Fulgor Milano F7IBM = French Door
    ];

    if (name.includes('french door') || name.includes('french-door') ||
        name.includes('4-door') || name.includes('4 door') ||
        frenchDoorPatterns.some(p => p)) {
      return 'french_door';
    }

    // Side by side patterns
    const sxsPatterns = [
      /^RS\d/.test(model),             // Samsung RS = Side by Side
      /^LSX\d/.test(model),            // LG LSX = Side by Side
      /^LS\d{2}/.test(model),          // LG LS = Side by Side
      /^LL\d{2}/.test(model),          // LG LL = Side by Side
      /^GSS\d/.test(model),            // GE GSS = Side by Side
      /^GSE\d/.test(model),            // GE GSE = Side by Side
      /^CSB\d/.test(model),            // Café CSB = Side by Side
      /^WRS\d/.test(model),            // Whirlpool WRS = Side by Side
      /^WRSC\d/.test(model),           // Whirlpool WRSC = Side by Side
      /^KRSC\d/.test(model),           // KitchenAid KRSC = Side by Side
      /^KRSF\d/.test(model),           // KitchenAid KRSF = Side by Side
      /^FRSS\d/.test(model),           // Frigidaire FRSS = Side by Side
      /^FRSN\d/.test(model),           // Frigidaire FRSN = Side by Side
      /^FRSG\d/.test(model),           // Frigidaire FRSG = Side by Side
      /^GRSS\d/.test(model),           // Frigidaire Gallery GRSS = Side by Side
      /^GRSC\d/.test(model),           // Frigidaire Gallery GRSC = Side by Side
      /^GRSN\d/.test(model),           // Frigidaire Gallery GRSN = Side by Side
      /^PRSC\d/.test(model),           // Frigidaire Pro PRSC = Side by Side
    ];

    if (name.includes('side by side') || name.includes('side-by-side') ||
        sxsPatterns.some(p => p)) {
      return 'side_by_side';
    }

    // Top freezer patterns
    const topFreezerPatterns = [
      /^RT\d/.test(model),             // Samsung RT = Top Freezer
      /^LT[A-Z]*\d/.test(model),       // LG LT = Top Freezer
      /^GTE\d/.test(model),            // GE GTE = Top Freezer
      /^WRT\d/.test(model),            // Whirlpool WRT = Top Freezer
      /^FFET\d/.test(model),           // Frigidaire FFET = Top Freezer
      /^FFHT\d/.test(model),           // Frigidaire FFHT = Top Freezer
      /^GRTE\d/.test(model),           // Frigidaire Gallery GRTE = Top Freezer
    ];

    if (name.includes('top freezer') || name.includes('top-freezer') ||
        name.includes('top mount') || topFreezerPatterns.some(p => p)) {
      return 'top_freezer';
    }

    // Bottom freezer patterns
    const bottomFreezerPatterns = [
      /^RB\d/.test(model),             // Samsung RB = Bottom Freezer
      /^LB[A-Z]*\d/.test(model),       // LG LB = Bottom Freezer
      /^LRDN\d/.test(model),           // LG LRDN = Bottom Freezer
      /^LRDC\d/.test(model),           // LG LRDC = Bottom Freezer
      /^GBE\d/.test(model),            // GE GBE = Bottom Freezer
      /^WRB\d/.test(model),            // Whirlpool WRB = Bottom Freezer
      /^FRBG\d/.test(model),           // Frigidaire FRBG = Bottom Freezer
      /^GRBN\d/.test(model),           // Frigidaire Gallery GRBN = Bottom Freezer
      /^B24C/.test(model),             // Bosch B24C = Bottom Freezer
    ];

    if (name.includes('bottom freezer') || name.includes('bottom-freezer') ||
        name.includes('bottom mount') || bottomFreezerPatterns.some(p => p)) {
      return 'bottom_freezer';
    }

    // Single door / All Refrigerator patterns
    if (name.includes('all refrigerator') || name.includes('single door') ||
        /^FRAE\d/.test(model) ||       // Frigidaire FRAE = Single door
        /^GRDA\d/.test(model) ||       // Frigidaire Gallery GRDA = Single door
        /^FPRU\d/.test(model)) {       // Frigidaire Pro FPRU = Single door
      return 'bottom_freezer'; // Treat as bottom freezer for package purposes
    }

    return 'unknown';
  }

  /**
   * Detect if refrigerator has ice and water dispenser
   * @param {object} product - Product with model and name
   * @returns {string} 'door' (external dispenser), 'inside' (internal ice maker), or 'none'
   */
  detectFridgeIceWater(product) {
    if (!product) return 'none';

    const model = (product.model || '').toUpperCase();
    const name = (product.name || '').toLowerCase();
    const category = (product.category || '').toLowerCase();

    // Check explicit fields first
    if (product.has_ice_water === true || product.has_dispenser === true) {
      return 'door';
    }
    if (product.has_ice_maker === true && product.has_ice_water !== true) {
      return 'inside';
    }

    // Name-based detection for door dispenser
    const doorDispenserKeywords = [
      'door dispenser',
      'external dispenser',
      'water dispenser',
      'ice and water',
      'ice & water',
      'water & ice',
      'dispenser',
      'through-the-door',
      'in-door'
    ];

    for (const keyword of doorDispenserKeywords) {
      if (name.includes(keyword)) {
        return 'door';
      }
    }

    // Model number patterns for door dispensers (Samsung, LG, GE, Whirlpool)
    // Samsung RF models: RF28R/RF32N etc - models with 'R' after size often have dispenser
    if (/^RF\d{2}[A-Z]/.test(model)) {
      // Most Samsung French Door RF models have external dispenser
      // RF28R7551SR, RF28K9580SG etc.
      return 'door';
    }

    // Samsung RS models: RS22T, RS28A etc - Side-by-Side typically have dispenser
    if (/^RS\d{2}/.test(model)) {
      return 'door';
    }

    // LG models with dispenser - LRMVS3006S, LRFXS2503S, etc.
    if (/^LR[A-Z]{2}[SV]/.test(model) || /^LF[A-Z]{2}S/.test(model)) {
      return 'door';
    }

    // GE models with dispenser - typically have 'S' in certain position
    if (/^GFE\d{2}/.test(model) || /^GSS\d{2}/.test(model)) {
      // Most GE French Door and Side-by-Side have dispenser
      return 'door';
    }

    // Whirlpool models with dispenser
    if (/^WRF\d{3}S/.test(model) || /^WRS\d{3}/.test(model)) {
      return 'door';
    }

    // KitchenAid models with dispenser - KRFF, KRSC, KRSF series
    if (/^KR[SF][CF]\d/.test(model) || /^KRMF\d/.test(model)) {
      return 'door';
    }

    // Frigidaire models with dispenser - FRSS, FRSC, GRSS, GRSC series (side-by-side)
    if (/^FR[SC]S\d/.test(model) || /^GR[SC]S\d/.test(model) || /^PR[SC]S\d/.test(model)) {
      return 'door';
    }
    // Frigidaire French Door with dispenser - FRFC, GRFC, PRFC series
    if (/^[FGP]RFC\d/.test(model) || /^[FGP]RFG\d/.test(model)) {
      return 'door';
    }

    // Bosch models with dispenser - B36 series French Door
    if (/^B36[A-Z]{2}\d/.test(model)) {
      return 'door';
    }

    // Café models with dispenser - CWE, CVE, CJE, CSB series
    if (/^C[WVJ]E\d/.test(model) || /^CYE\d/.test(model) || /^CSB\d/.test(model)) {
      return 'door';
    }

    // Electrolux models with dispenser - ERFC, ERMC series
    if (/^ER[FM]C\d/.test(model) || /^E[WI]2[35]\d/.test(model)) {
      return 'door';
    }

    // Jenn-Air models - most built-in have dispenser
    if (/^J[UBS][BCS]F\d/.test(model)) {
      return 'door';
    }

    // Thor Kitchen French Door - typically have dispenser
    if (/^RF3[06]\d/.test(model) || /^TRF\d/.test(model)) {
      return 'door';
    }

    // Check for internal ice maker mentions
    if (name.includes('ice maker') || name.includes('icemaker') ||
        name.includes('internal water') || name.includes('internal ice')) {
      return 'inside';
    }

    // Category-based detection
    // Side-by-side fridges typically have door dispensers
    if (category.includes('side') || category.includes('sxs') ||
        name.includes('side by side') || name.includes('side-by-side')) {
      return 'door';
    }

    // French door category often has dispensers
    if (category.includes('french') || category.includes('fdr') ||
        category.includes('multidoor')) {
      return 'door';
    }

    // French door in name often has dispensers
    if (name.includes('french door') || name.includes('4-door') || name.includes('4 door')) {
      return 'door';
    }

    // Top mount / Top freezer typically don't have door dispenser
    if (category.includes('top mount') || category.includes('tmf') ||
        name.includes('top freezer') || name.includes('top mount')) {
      return 'inside';
    }

    // Bottom mount / Bottom freezer - typically inside only
    if (category.includes('bottom mount') || category.includes('bmf') ||
        name.includes('bottom freezer') || name.includes('bottom mount')) {
      return 'inside';
    }

    // Single door refrigerators - no dispenser
    if (name.includes('single door') || name.includes('all refrigerator') ||
        /^FRAE\d/.test(model) || /^GRDA\d/.test(model)) {
      return 'none';
    }

    return 'none';
  }

  /**
   * Detect washer type (front_load or top_load) from product model/name
   * @param {object} product - Product with model and name
   * @returns {string} 'front_load', 'top_load', or 'unknown'
   */
  detectWasherType(product) {
    if (!product) return 'unknown';

    // Check explicit subtype field first
    if (product.subtype) {
      const subtype = product.subtype.toLowerCase().replace(/[_\s-]/g, '');
      if (subtype.includes('frontload') || subtype === 'front_load') return 'front_load';
      if (subtype.includes('topload') || subtype === 'top_load') return 'top_load';
    }

    const model = (product.model || '').toUpperCase();
    const name = (product.name || '').toLowerCase();

    // Top load patterns
    const topLoadPatterns = [
      /^[A-Z]TW\d/,           // GTW, WTW, MTW, NTW (GE, Whirlpool, Maytag)
      /^WA\d/,                // Samsung WA series = top load
      /^NTW\d/,               // Amana NTW
    ];

    // Front load patterns
    const frontLoadPatterns = [
      /^[A-Z]FW\d/,           // WFW, GFW, MFW (Whirlpool, GE, Maytag)
      /^MHW\d/,               // Maytag MHW = front load
      /^WF\d/,                // Samsung WF series = front load
      /^WM\d/,                // LG WM series = front load
      /^ELF[WS]\d/,           // Electrolux ELFW/ELFS = front load
      /^EFLS\d/,              // Electrolux EFLS = front load
    ];

    if (topLoadPatterns.some(p => p.test(model)) || name.includes('top load') || name.includes('top-load')) {
      return 'top_load';
    }
    if (frontLoadPatterns.some(p => p.test(model)) || name.includes('front load') || name.includes('front-load')) {
      return 'front_load';
    }

    return 'unknown';
  }

  /**
   * Get the tier (premium/better/good) for a brand
   * @param {string} manufacturer - Brand name
   * @returns {string} 'premium', 'better', 'good', or 'unknown'
   */
  getBrandTier(manufacturer) {
    if (!manufacturer) return 'unknown';
    const mfg = manufacturer.toLowerCase();

    if (this.BRAND_TIERS.premium.some(b => mfg.includes(b.toLowerCase()))) {
      return 'premium';
    }
    if (this.BRAND_TIERS.better.some(b => mfg.includes(b.toLowerCase()))) {
      return 'better';
    }
    if (this.BRAND_TIERS.good.some(b => mfg.includes(b.toLowerCase()))) {
      return 'good';
    }
    return 'unknown';
  }

  /**
   * Validate that a laundry package has properly matched washer-dryer pair
   * @param {Array} items - Package items
   * @returns {object} Validation result with details
   */
  validateLaundryPair(items) {
    const washerItem = items.find(i => this.normalizeSlotType(i.slot) === 'washer');
    const dryerItem = items.find(i => this.normalizeSlotType(i.slot) === 'dryer');

    if (!washerItem || !dryerItem) {
      return {
        valid: false,
        message: 'Missing washer or dryer in package',
        washer: washerItem?.product?.manufacturer || null,
        dryer: dryerItem?.product?.manufacturer || null
      };
    }

    const washer = washerItem.product;
    const dryer = dryerItem.product;

    const washerBrand = washer.manufacturer?.toLowerCase() || '';
    const dryerBrand = dryer.manufacturer?.toLowerCase() || '';
    const washerSize = this.getSizeClass(washer);
    const dryerSize = this.getSizeClass(dryer);
    const washerSeries = this.extractSeries(washer);
    const dryerSeries = this.extractSeries(dryer);

    const brandMatch = washerBrand === dryerBrand;
    const sizeMatch = washerSize === dryerSize;
    const seriesMatch = washerSeries && dryerSeries ? washerSeries === dryerSeries : true;

    // Check if this is an official manufacturer-defined pair
    const isOfficialPair = washer.paired_product_id === dryer.id || dryer.paired_product_id === washer.id;

    // Build validation result
    const result = {
      valid: brandMatch && sizeMatch,
      isOfficialPair,
      brandMatch,
      sizeMatch,
      seriesMatch,
      washer: {
        brand: washer.manufacturer,
        model: washer.model,
        sizeClass: washerSize,
        series: washerSeries
      },
      dryer: {
        brand: dryer.manufacturer,
        model: dryer.model,
        sizeClass: dryerSize,
        series: dryerSeries
      }
    };

    // Build descriptive message
    if (result.valid) {
      if (isOfficialPair) {
        result.message = `Official ${washer.manufacturer} matched set: ${washer.model} + ${dryer.model}`;
      } else if (seriesMatch && washerSeries) {
        result.message = `Matched ${washer.manufacturer} pair (${washerSeries} series, ${washerSize})`;
      } else {
        result.message = `Matched ${washer.manufacturer} pair (${washerSize})`;
      }
    } else {
      const issues = [];
      if (!brandMatch) {
        issues.push(`brand mismatch: ${washer.manufacturer} washer / ${dryer.manufacturer} dryer`);
      }
      if (!sizeMatch) {
        issues.push(`size mismatch: ${washerSize} washer / ${dryerSize} dryer`);
      }
      result.message = `Pair validation failed: ${issues.join(', ')}`;
    }

    return result;
  }

  /**
   * Select a product for a slot with progressive filter relaxation
   * Used for laundry flow to process dryer first
   */
  async selectProductForSlot(slotKey, slotConfig, catalog, tierRanges, requirements, preferences, tier, preferredBrand, pairConstraints, flowType) {
    const result = {
      selected: null,
      item: null,
      emptySlot: null,
      suggestions: [],
      warnings: [],
      relaxationAttempts: 0
    };

    if (catalog.length === 0) {
      result.emptySlot = {
        slot: slotKey,
        label: slotConfig.label,
        category: slotConfig.category,
        reason: 'No products in catalog for this category'
      };
      return result;
    }

    // Apply progressive filter relaxation
    // IMPORTANT: Never relax brand filter when user explicitly specified a brand
    const hasBrandRequirement = requirements.brand_preference && requirements.brand_preference !== 'any';

    const filterLevels = hasBrandRequirement ? [
      // When brand is specified, NEVER relax it
      { name: 'strict', relaxations: [] },
      { name: 'relax_price', relaxations: ['price'] },
      { name: 'relax_price_finish', relaxations: ['price', 'finish'] },
      { name: 'relax_price_finish_dimensions', relaxations: ['price', 'finish', 'dimensions'] }
    ] : [
      { name: 'strict', relaxations: [] },
      { name: 'relax_price', relaxations: ['price'] },
      { name: 'relax_price_brand', relaxations: ['price', 'brand'] },
      { name: 'relax_price_brand_finish', relaxations: ['price', 'brand', 'finish'] },
      { name: 'relax_all', relaxations: ['price', 'brand', 'finish', 'dimensions'] }
    ];

    let filteredCandidates = [];
    let appliedLevel = filterLevels[0];

    for (const level of filterLevels) {
      filteredCandidates = this.applyFilters(
        catalog,
        requirements,
        preferences,
        tier,
        tierRanges,
        slotKey,
        level.relaxations
      );

      if (filteredCandidates.length > 0) {
        appliedLevel = level;
        break;
      }
      result.relaxationAttempts++;
    }

    if (filteredCandidates.length === 0) {
      result.emptySlot = {
        slot: slotKey,
        label: slotConfig.label,
        category: slotConfig.category,
        totalInCatalog: catalog.length,
        reason: hasBrandRequirement ? `No ${requirements.brand_preference} products found in this category` : undefined
      };
      result.suggestions = this.generateSuggestions(requirements, slotKey, catalog);
      return result;
    }

    if (appliedLevel.name !== 'strict') {
      result.warnings.push({
        slot: slotKey,
        message: `Relaxed filters to find matches (level: ${appliedLevel.name})`,
        relaxations: appliedLevel.relaxations
      });
    }

    // Score and rank candidates
    const scored = this.scoreProducts(
      filteredCandidates,
      preferences,
      slotConfig,
      tier,
      tierRanges,
      preferredBrand
    );

    if (scored.length > 0) {
      result.selected = scored[0].product;
      result.item = {
        slot: slotKey,
        slot_label: slotConfig.label,
        product: scored[0].product,
        score: scored[0].score,
        scoreBreakdown: scored[0].breakdown,
        filterLevel: appliedLevel.name
      };
    }

    return result;
  }

  /**
   * Find alternative products for swapping within same category and tier
   */
  async findAlternatives(productId, category, tier, answers, flowType = 'kitchen') {
    const { requirements, preferences } = this.parseAnswerModes(answers);

    // Determine the slot type from category
    const slotType = this.getCategorySlotType(category);

    // Fetch full catalog for this category
    const catalog = await this.fetchCatalogForSlot(category, slotType);

    if (catalog.length === 0) {
      return [];
    }

    // Compute dynamic tier ranges
    const tierRanges = this.computeDynamicTiers(catalog);

    // Apply relaxed filters (allow some flexibility for alternatives)
    const filtered = this.applyFilters(
      catalog,
      requirements,
      preferences,
      tier,
      tierRanges,
      slotType,
      ['price'] // Relax price to show nearby options
    );

    // Remove current product and score
    const others = filtered.filter(p => p.id !== productId);
    const scored = this.scoreProducts(others, preferences, { category }, tier, tierRanges, null);

    return scored.slice(0, 5).map(s => ({
      product: s.product,
      score: s.score
    }));
  }

  /**
   * Get slot type from category name
   */
  getCategorySlotType(category) {
    const cat = category.toLowerCase();
    for (const [slotType, patterns] of Object.entries(this.CATEGORY_PATTERNS)) {
      if (patterns.some(p => cat.includes(p))) {
        return slotType;
      }
    }
    return 'refrigerator'; // default
  }
}

module.exports = PackageSelectionEngine;
