/**
 * Subcategory Mapping Migration
 * Maps products to their correct subcategories based on:
 * - Raw category text patterns
 * - Product name patterns
 * - Extended attributes (fuel_type, subtype, depth_type)
 * - Model number patterns
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

// Subcategory mapping rules
// Each rule has: parentSlug, subcategorySlug, patterns (in category, name, or model)
const SUBCATEGORY_RULES = {
  // ========== REFRIGERATORS ==========
  refrigerators: [
    {
      slug: 'french-door',
      patterns: [
        'french door', 'french-door', 'frenchdoor', '4-door', '4 door', 'four door',
        'multidoor', 'multi-door', 'multi door', '3-door', '3 door', 'three door',
        'bottom mount 3 door', 'bottom mount 4 door', 'fdr', '4dflex'
      ]
    },
    {
      slug: 'side-by-side',
      patterns: [
        'side-by-side', 'side by side', 'sidebyside', 'sxs'
      ]
    },
    {
      slug: 'top-freezer',
      patterns: [
        'top freezer', 'top-freezer', 'topfreezer', 'top mount', 'top-mount', 'tmf'
      ]
    },
    {
      slug: 'bottom-freezer',
      patterns: [
        'bottom freezer', 'bottom-freezer', 'bottomfreezer', 'bottom mount 2 door', 'bmf'
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
        'front load', 'front-load', 'frontload', 'fl washer', 'fl compact washer'
      ]
    },
    {
      slug: 'top-load-washer',
      patterns: [
        'top load', 'top-load', 'topload', 'tl washer', 'vertical axis'
      ]
    }
  ],

  // ========== DRYERS ==========
  dryers: [
    {
      slug: 'electric-dryer',
      patterns: [
        'electric dryer', 'dryer electric', 'fl dryer, electric', 'tl dryer electric'
      ],
      fuelType: 'electric'
    },
    {
      slug: 'gas-dryer',
      patterns: [
        'gas dryer', 'dryer gas', 'fl dryer, gas', 'tl dryer gas', 'natural gas'
      ],
      fuelType: 'gas'
    },
    {
      slug: 'heat-pump-dryer',
      patterns: [
        'heat pump', 'heat-pump', 'heatpump', 'ventless'
      ]
    }
  ],

  // ========== RANGES ==========
  ranges: [
    {
      slug: 'electric-range',
      patterns: [
        'electric range', 'range electric', 'electric radiant'
      ],
      fuelType: 'electric'
    },
    {
      slug: 'gas-range',
      patterns: [
        'gas range', 'range gas', 'natural gas range', 'range natural gas'
      ],
      fuelType: 'gas'
    },
    {
      slug: 'dual-fuel',
      patterns: [
        'dual fuel', 'dual-fuel', 'dualfuel'
      ],
      fuelType: 'dual_fuel'
    },
    {
      slug: 'induction-range',
      patterns: [
        'induction range', 'range induction', 'electric induction'
      ],
      fuelType: 'induction'
    },
    {
      slug: 'slide-in-range',
      patterns: [
        'slide-in', 'slide in', 'slidein'
      ],
      subtype: 'slide_in'
    },
    {
      slug: 'freestanding-range',
      patterns: [
        'freestanding', 'free standing', 'free-standing'
      ],
      subtype: 'freestanding'
    }
  ],

  // ========== COOKTOPS ==========
  cooktops: [
    {
      slug: 'gas-cooktop',
      patterns: [
        'gas cooktop', 'cooktop gas', 'cooktop natural gas', 'burner'
      ],
      fuelType: 'gas'
    },
    {
      slug: 'electric-cooktop',
      patterns: [
        'electric cooktop', 'cooktop electric', 'electric radiant', 'radiant cooktop'
      ],
      fuelType: 'electric'
    },
    {
      slug: 'induction-cooktop',
      patterns: [
        'induction cooktop', 'cooktop induction', 'electric induction'
      ],
      fuelType: 'induction'
    }
  ],

  // ========== WALL OVENS ==========
  'wall-ovens': [
    {
      slug: 'single-wall-oven',
      patterns: [
        'single wall oven', 'wall oven single', 'single oven', '30" single', '27" single', '24" single'
      ],
      subtype: 'single'
    },
    {
      slug: 'double-wall-oven',
      patterns: [
        'double wall oven', 'wall oven double', 'double oven'
      ],
      subtype: 'double'
    },
    {
      slug: 'combination-oven',
      patterns: [
        'combination', 'combo', 'micro-combo', 'microwave combo', 'steam-combo'
      ],
      subtype: 'combination'
    }
  ],

  // ========== MICROWAVES ==========
  microwaves: [
    {
      slug: 'countertop-microwave',
      patterns: [
        'countertop', 'counter top', 'counter-top'
      ],
      subtype: 'countertop'
    },
    {
      slug: 'over-the-range-microwave',
      patterns: [
        'over-the-range', 'over the range', 'otr', 'microwave hood', 'hood flush',
        'hood low profile', 'hood full size'
      ],
      subtype: 'over_the_range'
    },
    {
      slug: 'built-in-microwave',
      patterns: [
        'built-in microwave', 'built in microwave', 'builtin microwave'
      ],
      subtype: 'built_in'
    },
    {
      slug: 'drawer-microwave',
      patterns: [
        'drawer microwave', 'microwave drawer'
      ],
      subtype: 'drawer'
    }
  ],

  // ========== RANGE HOODS ==========
  'range-hoods': [
    {
      slug: 'under-cabinet-hood',
      patterns: [
        'under cabinet', 'under-cabinet', 'undercabinet'
      ],
      subtype: 'under_cabinet'
    },
    {
      slug: 'wall-mount-hood',
      patterns: [
        'wall mount', 'wall-mount', 'wallmount', 'chimney', 'canopy'
      ],
      subtype: 'wall_mount'
    },
    {
      slug: 'island-hood',
      patterns: [
        'island mount', 'island-mount', 'islandmount', 'ceiling'
      ],
      subtype: 'island'
    },
    {
      slug: 'downdraft',
      patterns: [
        'downdraft', 'down draft', 'down-draft'
      ],
      subtype: 'downdraft'
    }
  ],

  // ========== TELEVISIONS ==========
  televisions: [
    {
      slug: 'oled-tv',
      patterns: [
        'oled tv', 'oled', 'bravia xr oled'
      ]
    },
    {
      slug: 'qled-tv',
      patterns: [
        'qled tv', 'qled', 'qned', 'neo qled'
      ]
    },
    {
      slug: 'mini-led-tv',
      patterns: [
        'mini led', 'mini-led', 'miniled', 'uled'
      ]
    },
    {
      slug: 'led-lcd-tv',
      patterns: [
        'led tv', 'lcd tv', 'bravia tv', 'bravia xr led', 'nanocell', 'smart tv'
      ]
    },
    {
      slug: 'projectors',
      patterns: [
        'projector', 'premiere', 'lifestyle projector'
      ]
    }
  ],

  // ========== GRILLS ==========
  grills: [
    {
      slug: 'gas-grills',
      patterns: [
        'gas grill', 'grill gas', 'built-in grill'
      ],
      fuelType: 'gas'
    },
    {
      slug: 'charcoal-grills',
      patterns: [
        'charcoal grill', 'grill charcoal'
      ],
      fuelType: 'charcoal'
    },
    {
      slug: 'pellet-grills',
      patterns: [
        'pellet grill', 'grill pellet'
      ],
      fuelType: 'pellet'
    },
    {
      slug: 'griddles',
      patterns: [
        'griddle'
      ]
    }
  ],

  // ========== FIREPLACES ==========
  fireplaces: [
    {
      slug: 'gas-fireplaces',
      patterns: [
        'gas fireplace', 'fireplace gas', 'gas log'
      ],
      fuelType: 'gas'
    },
    {
      slug: 'electric-fireplaces',
      patterns: [
        'electric fireplace', 'fireplace electric', 'built-in electric', 'wall hanging electric'
      ],
      fuelType: 'electric'
    },
    {
      slug: 'wood-fireplaces',
      patterns: [
        'wood fireplace', 'fireplace wood', 'wood burning'
      ],
      fuelType: 'wood'
    }
  ]
};

async function mapSubcategories() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('  SUBCATEGORY MAPPING MIGRATION');
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
    stats.byCategory[parentSlug] = { total: 0, mapped: 0, subcats: {} };

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
      const searchText = [
        product.category || '',
        product.name || '',
        product.model || ''
      ].join(' ').toLowerCase();

      let matchedSubcat = null;

      // Try to match subcategory
      for (const rule of rules) {
        const subcat = categoryBySlug[rule.slug];
        if (!subcat) continue;

        // Check pattern match
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
    console.log(`   Total: ${catStats.total}, Mapped: ${catStats.mapped}`);
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
  console.log(`  Success rate: ${((stats.mapped / stats.total) * 100).toFixed(1)}%`);
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
