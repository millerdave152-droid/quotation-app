/**
 * Enhanced Subcategory Mapping Migration v2
 *
 * Improvements over v1:
 * - More comprehensive name-based pattern matching
 * - Exclusion patterns for accessories/parts
 * - Better handling of edge cases
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Patterns to EXCLUDE (accessories, parts, filters)
const EXCLUDE_PATTERNS = [
  'handle', 'knob', 'kit', 'filter', 'toe kick', 'drawer handle',
  'paint-pen', 'waterline', 'duct', 'flue extension', 'recirculation',
  'accessory', 'accessories', 'trim', 'filler', 'panel', 'replacement',
  'grate', 'burner cap', 'drip pan', 'rack', 'shelf', 'bin', 'crisper'
];

// Enhanced subcategory rules with name-based patterns
const SUBCATEGORY_RULES = {
  // ========== REFRIGERATORS ==========
  refrigerators: [
    {
      slug: 'french-door',
      patterns: [
        'french door', 'french-door', 'frenchdoor', '4-door', '4 door', 'four door',
        'multidoor', 'multi-door', 'multi door', '3-door', '3 door', 'three door',
        'bottom mount 3 door', 'bottom mount 4 door', 'fdr', '4dflex', 'quad door',
        'french door refrigerator', 'counter-depth french'
      ]
    },
    {
      slug: 'side-by-side',
      patterns: [
        'side-by-side', 'side by side', 'sidebyside', 'sxs', 'side x side'
      ]
    },
    {
      slug: 'top-freezer',
      patterns: [
        'top freezer', 'top-freezer', 'topfreezer', 'top mount', 'top-mount', 'tmf',
        'top mount refrigerator', 'top freezer refrigerator'
      ]
    },
    {
      slug: 'bottom-freezer',
      patterns: [
        'bottom freezer', 'bottom-freezer', 'bottomfreezer', 'bottom mount 2 door', 'bmf',
        'bottom mount refrigerator', 'bottom freezer refrigerator'
      ]
    },
    {
      slug: 'counter-depth',
      patterns: [
        'counter depth', 'counter-depth', 'counterdepth'
      ],
      depthType: 'counter_depth'
    }
  ],

  // ========== WASHERS ==========
  washers: [
    {
      slug: 'front-load-washer',
      patterns: [
        'front load', 'front-load', 'frontload', 'fl washer', 'fl compact washer',
        'front load washer', 'front loading'
      ]
    },
    {
      slug: 'top-load-washer',
      patterns: [
        'top load', 'top-load', 'topload', 'tl washer', 'vertical axis',
        'top load washer', 'top loading'
      ]
    }
  ],

  // ========== DRYERS ==========
  dryers: [
    {
      slug: 'electric-dryer',
      patterns: [
        'electric dryer', 'dryer electric', 'fl dryer, electric', 'tl dryer electric',
        'electric', '240v'
      ],
      fuelType: 'electric'
    },
    {
      slug: 'gas-dryer',
      patterns: [
        'gas dryer', 'dryer gas', 'fl dryer, gas', 'tl dryer gas', 'natural gas dryer',
        'gas', 'lp dryer', 'propane'
      ],
      fuelType: 'gas'
    },
    {
      slug: 'heat-pump-dryer',
      patterns: [
        'heat pump', 'heat-pump', 'heatpump', 'ventless dryer', 'ventless'
      ]
    }
  ],

  // ========== RANGES ==========
  ranges: [
    {
      slug: 'induction-range',
      patterns: [
        'induction range', 'range induction', 'electric induction', 'induction slide',
        'induction freestanding'
      ],
      fuelType: 'induction',
      priority: 1  // Check induction first
    },
    {
      slug: 'dual-fuel',
      patterns: [
        'dual fuel', 'dual-fuel', 'dualfuel', 'dual fuel range', 'gas & electric'
      ],
      fuelType: 'dual_fuel',
      priority: 2
    },
    {
      slug: 'gas-range',
      patterns: [
        'gas range', 'range gas', 'natural gas range', 'range natural gas',
        'all gas', 'all-gas', 'gas burner', '6 burners', '5 burners', '4 burners',
        'sealed burner', 'open burner'
      ],
      fuelType: 'gas',
      priority: 3
    },
    {
      slug: 'electric-range',
      patterns: [
        'electric range', 'range electric', 'electric radiant', 'radiant range',
        'smoothtop', 'glass top', 'ceramic', 'coil element'
      ],
      fuelType: 'electric',
      priority: 4
    },
    {
      slug: 'slide-in-range',
      patterns: [
        'slide-in', 'slide in', 'slidein', 'front control'
      ],
      subtype: 'slide_in',
      priority: 10  // Check after fuel type
    },
    {
      slug: 'freestanding-range',
      patterns: [
        'freestanding', 'free standing', 'free-standing', 'back control'
      ],
      subtype: 'freestanding',
      priority: 11
    }
  ],

  // ========== COOKTOPS ==========
  cooktops: [
    {
      slug: 'induction-cooktop',
      patterns: [
        'induction cooktop', 'cooktop induction', 'electric induction', 'induction',
        'induction element'
      ],
      fuelType: 'induction',
      priority: 1
    },
    {
      slug: 'gas-cooktop',
      patterns: [
        'gas cooktop', 'cooktop gas', 'cooktop natural gas', 'burner', 'sealed burner',
        'gas rangetop', 'rangetop', '5 burners', '6 burners'
      ],
      fuelType: 'gas',
      priority: 2
    },
    {
      slug: 'electric-cooktop',
      patterns: [
        'electric cooktop', 'cooktop electric', 'electric radiant', 'radiant cooktop',
        'smoothtop', 'glass cooktop', 'ceramic cooktop', 'coil cooktop'
      ],
      fuelType: 'electric',
      priority: 3
    }
  ],

  // ========== WALL OVENS ==========
  'wall-ovens': [
    {
      slug: 'combination-oven',
      patterns: [
        'combination', 'combo', 'micro-combo', 'microwave combo', 'steam-combo',
        'speed oven', 'advantium', 'microwave/oven', 'oven combo'
      ],
      subtype: 'combination',
      priority: 1
    },
    {
      slug: 'double-wall-oven',
      patterns: [
        'double wall oven', 'wall oven double', 'double oven', 'built-in double',
        'double convection'
      ],
      subtype: 'double',
      priority: 2
    },
    {
      slug: 'single-wall-oven',
      patterns: [
        'single wall oven', 'wall oven single', 'single oven', '30" single', '27" single',
        '24" single', 'built-in single', 'single convection', 'single built-in'
      ],
      subtype: 'single',
      priority: 3
    }
  ],

  // ========== MICROWAVES ==========
  microwaves: [
    {
      slug: 'drawer-microwave',
      patterns: [
        'drawer microwave', 'microwave drawer'
      ],
      subtype: 'drawer',
      priority: 1
    },
    {
      slug: 'over-the-range-microwave',
      patterns: [
        'over-the-range', 'over the range', 'otr', 'microwave hood', 'hood flush',
        'hood low profile', 'hood full size', 'spacemaker'
      ],
      subtype: 'over_the_range',
      priority: 2
    },
    {
      slug: 'built-in-microwave',
      patterns: [
        'built-in microwave', 'built in microwave', 'builtin microwave', 'trim kit'
      ],
      subtype: 'built_in',
      priority: 3
    },
    {
      slug: 'countertop-microwave',
      patterns: [
        'countertop', 'counter top', 'counter-top', 'portable microwave'
      ],
      subtype: 'countertop',
      priority: 4
    }
  ],

  // ========== RANGE HOODS ==========
  'range-hoods': [
    {
      slug: 'island-hood',
      patterns: [
        'island mount', 'island-mount', 'islandmount', 'ceiling mount', 'island hood',
        'island', 'ceiling', 'suspended'
      ],
      subtype: 'island',
      priority: 1
    },
    {
      slug: 'downdraft',
      patterns: [
        'downdraft', 'down draft', 'down-draft', 'pop-up', 'retractable'
      ],
      subtype: 'downdraft',
      priority: 2
    },
    {
      slug: 'wall-mount-hood',
      patterns: [
        'wall mount', 'wall-mount', 'wallmount', 'chimney', 'canopy', 'pyramid',
        'wall hood', 't-shape', 'professional hood'
      ],
      subtype: 'wall_mount',
      priority: 3
    },
    {
      slug: 'under-cabinet-hood',
      patterns: [
        'under cabinet', 'under-cabinet', 'undercabinet', 'range hood', 'liner',
        'insert', 'built-in', 'slide-out', 'power pack'
      ],
      subtype: 'under_cabinet',
      priority: 4
    }
  ],

  // ========== TELEVISIONS ==========
  televisions: [
    {
      slug: 'projectors',
      patterns: [
        'projector', 'premiere', 'lifestyle projector', 'laser projector'
      ],
      priority: 1
    },
    {
      slug: 'oled-tv',
      patterns: [
        'oled tv', 'oled', 'bravia xr oled', 'lg oled', 'sony oled'
      ],
      priority: 2
    },
    {
      slug: 'qled-tv',
      patterns: [
        'qled tv', 'qled', 'qned', 'neo qled', 'samsung neo', 'quantum dot'
      ],
      priority: 3
    },
    {
      slug: 'mini-led-tv',
      patterns: [
        'mini led', 'mini-led', 'miniled', 'uled', 'local dimming'
      ],
      priority: 4
    },
    {
      slug: 'led-lcd-tv',
      patterns: [
        'led tv', 'lcd tv', 'bravia tv', 'bravia xr led', 'nanocell', 'smart tv',
        'crystal uhd', '4k tv', '8k tv', 'uhd tv', 'full hd'
      ],
      priority: 5
    }
  ],

  // ========== GRILLS ==========
  grills: [
    {
      slug: 'pellet-grills',
      patterns: [
        'pellet grill', 'grill pellet', 'pellet smoker', 'wood pellet'
      ],
      fuelType: 'pellet',
      priority: 1
    },
    {
      slug: 'charcoal-grills',
      patterns: [
        'charcoal grill', 'grill charcoal', 'kamado', 'ceramic grill'
      ],
      fuelType: 'charcoal',
      priority: 2
    },
    {
      slug: 'griddles',
      patterns: [
        'griddle', 'flat top', 'blackstone'
      ],
      priority: 3
    },
    {
      slug: 'gas-grills',
      patterns: [
        'gas grill', 'grill gas', 'built-in grill', 'propane grill', 'natural gas grill',
        'burner', 'bbq'
      ],
      fuelType: 'gas',
      priority: 4
    }
  ],

  // ========== FIREPLACES ==========
  fireplaces: [
    {
      slug: 'electric-fireplaces',
      patterns: [
        'electric fireplace', 'fireplace electric', 'built-in electric', 'wall hanging electric',
        'linear electric', 'electric insert'
      ],
      fuelType: 'electric',
      priority: 1
    },
    {
      slug: 'wood-fireplaces',
      patterns: [
        'wood fireplace', 'fireplace wood', 'wood burning', 'wood insert', 'woodburning'
      ],
      fuelType: 'wood',
      priority: 2
    },
    {
      slug: 'gas-fireplaces',
      patterns: [
        'gas fireplace', 'fireplace gas', 'gas log', 'gas insert', 'direct vent',
        'vent-free', 'ventless fireplace'
      ],
      fuelType: 'gas',
      priority: 3
    }
  ],

  // ========== DISHWASHERS ==========
  dishwashers: [
    {
      slug: 'built-in-dishwasher',
      patterns: [
        'built-in', 'built in', 'builtin', 'tall tub', '24"', '24 inch', 'undercounter'
      ],
      priority: 1
    },
    {
      slug: 'drawer-dishwasher',
      patterns: [
        'drawer', 'dishdrawer', 'single drawer', 'double drawer'
      ],
      priority: 2
    },
    {
      slug: 'portable-dishwasher',
      patterns: [
        'portable', 'countertop dishwasher', 'compact dishwasher'
      ],
      priority: 3
    }
  ]
};

// Check if product should be excluded (is an accessory)
function isAccessory(product) {
  const searchText = [
    product.category || '',
    product.name || '',
    product.model || ''
  ].join(' ').toLowerCase();

  return EXCLUDE_PATTERNS.some(p => searchText.includes(p.toLowerCase()));
}

async function mapSubcategories() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('  ENHANCED SUBCATEGORY MAPPING MIGRATION v2');
  console.log('═'.repeat(70));
  console.log('');

  // Load category IDs
  const categoriesResult = await pool.query(`
    SELECT id, slug, parent_id, level, name
    FROM categories
    WHERE is_active = true
  `);

  const categoryById = {};
  const categoryBySlug = {};
  for (const cat of categoriesResult.rows) {
    categoryById[cat.id] = cat;
    categoryBySlug[cat.slug] = cat;
  }

  const stats = {
    total: 0,
    mapped: 0,
    excluded: 0,
    byCategory: {}
  };

  // Process each main category
  for (const [parentSlug, rules] of Object.entries(SUBCATEGORY_RULES)) {
    const parentCat = categoryBySlug[parentSlug];
    if (!parentCat) {
      console.log(`⚠️  Parent category not found: ${parentSlug}`);
      continue;
    }

    console.log(`\n📁 Processing ${parentCat.name}...`);
    stats.byCategory[parentSlug] = { total: 0, mapped: 0, excluded: 0, subcats: {} };

    // Sort rules by priority if specified
    const sortedRules = [...rules].sort((a, b) => (a.priority || 99) - (b.priority || 99));

    // Get products in this category without subcategory
    const products = await pool.query(`
      SELECT p.id, p.model, p.name, p.category, p.manufacturer,
             pea.fuel_type, pea.subtype, pea.depth_type
      FROM products p
      LEFT JOIN product_extended_attributes pea ON p.id = pea.product_id
      WHERE p.category_id = $1 AND p.subcategory_id IS NULL
    `, [parentCat.id]);

    stats.byCategory[parentSlug].total = products.rows.length;
    stats.total += products.rows.length;

    for (const product of products.rows) {
      // Skip accessories
      if (isAccessory(product)) {
        stats.excluded++;
        stats.byCategory[parentSlug].excluded++;
        continue;
      }

      const searchText = [
        product.category || '',
        product.name || '',
        product.model || ''
      ].join(' ').toLowerCase();

      let matchedSubcat = null;

      // Try to match subcategory
      for (const rule of sortedRules) {
        const subcat = categoryBySlug[rule.slug];
        if (!subcat) continue;

        // Check pattern match in combined search text
        const patternMatch = rule.patterns.some(p => searchText.includes(p.toLowerCase()));

        // Check attribute match
        let attrMatch = false;
        if (rule.fuelType && product.fuel_type) {
          attrMatch = product.fuel_type.toLowerCase().includes(rule.fuelType.toLowerCase());
        }
        if (rule.subtype && product.subtype) {
          attrMatch = attrMatch || product.subtype.toLowerCase().includes(rule.subtype.toLowerCase());
        }
        if (rule.depthType && product.depth_type) {
          attrMatch = attrMatch || product.depth_type.toLowerCase().includes(rule.depthType.toLowerCase());
        }

        if (patternMatch || attrMatch) {
          matchedSubcat = subcat;
          break;
        }
      }

      if (matchedSubcat) {
        // Update product with subcategory
        await pool.query(`
          UPDATE products SET subcategory_id = $1 WHERE id = $2
        `, [matchedSubcat.id, product.id]);

        stats.mapped++;
        stats.byCategory[parentSlug].mapped++;
        stats.byCategory[parentSlug].subcats[matchedSubcat.name] =
          (stats.byCategory[parentSlug].subcats[matchedSubcat.name] || 0) + 1;
      }
    }

    // Print category results
    const catStats = stats.byCategory[parentSlug];
    console.log(`   Total: ${catStats.total}, Mapped: ${catStats.mapped}, Excluded (accessories): ${catStats.excluded}`);
    for (const [subName, count] of Object.entries(catStats.subcats)) {
      console.log(`     - ${subName}: ${count}`);
    }
  }

  // Final summary
  console.log('');
  console.log('═'.repeat(70));
  console.log('  MIGRATION SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  Products processed: ${stats.total}`);
  console.log(`  Products mapped: ${stats.mapped}`);
  console.log(`  Excluded (accessories): ${stats.excluded}`);
  console.log(`  Success rate: ${((stats.mapped / (stats.total - stats.excluded)) * 100).toFixed(1)}%`);
  console.log('');

  // Verify final counts
  const finalStatus = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(category_id) as with_category,
      COUNT(subcategory_id) as with_subcategory
    FROM products
  `);

  console.log('Final Database Status:');
  console.log(`  Total products: ${finalStatus.rows[0].total}`);
  console.log(`  With category: ${finalStatus.rows[0].with_category}`);
  console.log(`  With subcategory: ${finalStatus.rows[0].with_subcategory}`);
  console.log('═'.repeat(70));
  console.log('');

  await pool.end();
}

mapSubcategories().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
