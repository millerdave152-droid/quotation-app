/**
 * Migration: Consolidate Categories to Tags
 * Maps 644 existing category strings to standardized tags
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Category to tags mapping rules
// Each rule maps category patterns to one or more tag names
const CATEGORY_RULES = [
  // === REFRIGERATORS ===
  { pattern: /refrigerat|fridge|refrig|^ref$/i, tags: ['Refrigerators'] },
  { pattern: /french.?door/i, tags: ['Refrigerators', 'French Door'] },
  { pattern: /side.?by.?side/i, tags: ['Refrigerators', 'Side-by-Side'] },
  { pattern: /top.?(freezer|mount)/i, tags: ['Refrigerators', 'Top Freezer'] },
  { pattern: /bottom.?(freezer|mount)/i, tags: ['Refrigerators', 'Bottom Freezer'] },
  { pattern: /wine.?(cooler|fridge|cellar)/i, tags: ['Refrigerators', 'Wine Cooler'] },
  { pattern: /beverage/i, tags: ['Refrigerators', 'Beverage Center'] },
  { pattern: /freezer/i, tags: ['Freezers'] },

  // === RANGES & COOKING ===
  { pattern: /\brange\b|cooking/i, tags: ['Ranges'] },
  { pattern: /cooktop/i, tags: ['Cooktops'] },
  { pattern: /wall.?oven/i, tags: ['Wall Ovens'] },
  { pattern: /gas.?(range|cooktop|grill)/i, tags: ['Gas'] },
  { pattern: /electric.?(range|cooktop)/i, tags: ['Electric'] },
  { pattern: /induction/i, tags: ['Cooktops', 'Induction'] },
  { pattern: /dual.?fuel/i, tags: ['Ranges', 'Dual Fuel'] },
  { pattern: /slide.?in/i, tags: ['Ranges', 'Slide-In'] },
  { pattern: /freestanding/i, tags: ['Freestanding'] },
  { pattern: /front.?control/i, tags: ['Ranges'] },
  { pattern: /commercial.?range/i, tags: ['Ranges', 'Commercial Grade'] },

  // === DISHWASHERS ===
  { pattern: /dishwasher|cleaning.*dishwasher/i, tags: ['Dishwashers'] },
  { pattern: /built.?in.*dishwasher/i, tags: ['Dishwashers', 'Built-In'] },

  // === MICROWAVES ===
  { pattern: /microwave/i, tags: ['Microwaves'] },
  { pattern: /over.?range.*microwave|microwave.*hood/i, tags: ['Microwaves', 'Built-In'] },
  { pattern: /countertop.*microwave/i, tags: ['Microwaves', 'Countertop'] },
  { pattern: /built.?in.*microwave/i, tags: ['Microwaves', 'Built-In'] },

  // === VENTILATION ===
  { pattern: /hood|vent|ventilation/i, tags: ['Ventilation'] },
  { pattern: /range.?hood/i, tags: ['Ventilation'] },
  { pattern: /downdraft/i, tags: ['Ventilation'] },

  // === LAUNDRY ===
  { pattern: /washer|laundry|w\/m/i, tags: ['Laundry', 'Washer'] },
  { pattern: /dryer/i, tags: ['Laundry', 'Dryer'] },
  { pattern: /washer.*dryer|laundry.*pair/i, tags: ['Laundry', 'Washer/Dryer Combo'] },

  // === TVs ===
  { pattern: /\btv\b|television/i, tags: ['TVs'] },
  { pattern: /oled/i, tags: ['TVs', 'OLED'] },
  { pattern: /qled/i, tags: ['TVs', 'QLED'] },
  { pattern: /qned/i, tags: ['TVs', 'QNED'] },
  { pattern: /led.?tv|lcd/i, tags: ['TVs', 'LED'] },
  { pattern: /uled/i, tags: ['TVs', 'LED'] },
  { pattern: /bravia/i, tags: ['TVs'] },
  { pattern: /nanocell/i, tags: ['TVs', 'LED'] },
  { pattern: /standbyme/i, tags: ['TVs'] },

  // === AUDIO ===
  { pattern: /soundbar|speaker|audio|receiver|amplifier|home.?theatre/i, tags: ['Audio'] },

  // === GRILLS ===
  { pattern: /\bgrill\b/i, tags: ['Grills'] },
  { pattern: /gas.?grill|propane/i, tags: ['Grills', 'Propane'] },
  { pattern: /natural.?gas/i, tags: ['Natural Gas'] },
  { pattern: /charcoal/i, tags: ['Grills', 'Charcoal'] },
  { pattern: /pellet/i, tags: ['Grills', 'Pellet'] },
  { pattern: /infrared/i, tags: ['Grills'] },
  { pattern: /built.?in.*grill/i, tags: ['Grills', 'Built-In'] },
  { pattern: /portable.*grill/i, tags: ['Grills', 'Portable'] },
  { pattern: /griddle/i, tags: ['Grills'] },

  // === SMOKERS ===
  { pattern: /smoker/i, tags: ['Smokers'] },
  { pattern: /offset/i, tags: ['Smokers'] },

  // === FIREPLACES ===
  { pattern: /fireplace/i, tags: ['Fireplaces'] },
  { pattern: /electric.*fireplace/i, tags: ['Fireplaces', 'Electric'] },

  // === SMALL APPLIANCES ===
  { pattern: /mixer|stand.?mixer/i, tags: ['Small Appliances', 'Stand Mixer'] },
  { pattern: /coffee|espresso/i, tags: ['Small Appliances', 'Coffee Maker'] },
  { pattern: /blender/i, tags: ['Small Appliances', 'Blender'] },
  { pattern: /toaster/i, tags: ['Small Appliances', 'Toaster'] },
  { pattern: /food.?processor/i, tags: ['Small Appliances', 'Food Processor'] },
  { pattern: /kettle/i, tags: ['Small Appliances'] },
  { pattern: /cordless/i, tags: ['Small Appliances'] },
  { pattern: /immersion/i, tags: ['Small Appliances', 'Blender'] },
  { pattern: /chopper/i, tags: ['Small Appliances', 'Food Processor'] },

  // === ACCESSORIES ===
  { pattern: /accessor|cover|tool|grate|rotisserie|burner|thermometer|attachment/i, tags: ['Accessories'] },
  { pattern: /grill.*accessor|grilling.*tool/i, tags: ['Accessories'] },
  { pattern: /panel|bespoke/i, tags: ['Accessories'] },

  // === FURNITURE ===
  { pattern: /furniture|sofa|chair|table|desk|bed|mattress|dresser|cabinet|shelf|storage/i, tags: ['Furniture'] },
  { pattern: /living.?room/i, tags: ['Furniture'] },
  { pattern: /bedroom/i, tags: ['Furniture'] },
  { pattern: /dining/i, tags: ['Furniture'] },
  { pattern: /office/i, tags: ['Furniture'] },
  { pattern: /entertainment|tv.?stand/i, tags: ['Furniture'] },

  // === TYPES (applied after main categories) ===
  { pattern: /built.?in/i, tags: ['Built-In'] },
  { pattern: /countertop/i, tags: ['Countertop'] },
  { pattern: /portable/i, tags: ['Portable'] },
  { pattern: /wall.?mount/i, tags: ['Wall Mount'] },
  { pattern: /under.?counter/i, tags: ['Under Counter'] },

  // === FEATURES ===
  { pattern: /smart|wifi|wi-fi|connected/i, tags: ['Smart/WiFi'] },
  { pattern: /energy.?star/i, tags: ['Energy Star'] },
  { pattern: /pro.?style|professional/i, tags: ['Pro Style'] },
  { pattern: /stainless/i, tags: ['Stainless Steel'] },
  { pattern: /commercial/i, tags: ['Commercial Grade'] },
];

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Starting category consolidation...\n');

    // Get all tags from database
    const tagsResult = await client.query('SELECT id, name, tag_type FROM product_tags');
    const tagMap = {};
    tagsResult.rows.forEach(tag => {
      tagMap[tag.name.toLowerCase()] = tag.id;
    });
    console.log(`Loaded ${Object.keys(tagMap).length} tags from database`);

    // Get all unique categories and their product counts
    const categoriesResult = await client.query(`
      SELECT category, COUNT(*) as count
      FROM products
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY count DESC
    `);
    console.log(`Found ${categoriesResult.rows.length} unique categories\n`);

    // Track statistics
    let totalMapped = 0;
    let totalUnmapped = 0;
    const unmappedCategories = [];
    const tagUsage = {};

    // Process each category
    for (const row of categoriesResult.rows) {
      const category = row.category;
      const productCount = parseInt(row.count);

      // Find matching tags
      const matchedTags = new Set();

      // First, strip manufacturer prefixes
      let cleanCategory = category;
      const prefixMatch = category.match(/^([\w\-]+)\s*-\s*(.+)$/);
      if (prefixMatch) {
        cleanCategory = prefixMatch[2]; // Use the part after the dash
      }

      // Apply rules
      for (const rule of CATEGORY_RULES) {
        if (rule.pattern.test(category) || rule.pattern.test(cleanCategory)) {
          rule.tags.forEach(tagName => {
            const tagId = tagMap[tagName.toLowerCase()];
            if (tagId) {
              matchedTags.add(tagId);
              tagUsage[tagName] = (tagUsage[tagName] || 0) + productCount;
            }
          });
        }
      }

      if (matchedTags.size > 0) {
        // Get products with this category
        const productsResult = await client.query(
          'SELECT id FROM products WHERE category = $1',
          [category]
        );

        // Insert mappings for each product
        for (const product of productsResult.rows) {
          for (const tagId of matchedTags) {
            await client.query(`
              INSERT INTO product_tag_mappings (product_id, tag_id)
              VALUES ($1, $2)
              ON CONFLICT (product_id, tag_id) DO NOTHING
            `, [product.id, tagId]);
          }
        }

        totalMapped += productCount;
      } else {
        totalUnmapped += productCount;
        if (productCount >= 5) {
          unmappedCategories.push({ category, count: productCount });
        }
      }
    }

    // Show results
    console.log('========================================');
    console.log('Category Consolidation Complete!');
    console.log('========================================');
    console.log(`Products tagged: ${totalMapped}`);
    console.log(`Products without tags: ${totalUnmapped}`);

    // Show tag usage
    console.log('\nTop tag assignments:');
    const sortedTags = Object.entries(tagUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    sortedTags.forEach(([tag, count]) => {
      console.log(`  ${tag}: ${count} products`);
    });

    // Show unmapped categories
    if (unmappedCategories.length > 0) {
      console.log('\nUnmapped categories (5+ products):');
      unmappedCategories.slice(0, 20).forEach(({ category, count }) => {
        console.log(`  "${category}": ${count} products`);
      });
      if (unmappedCategories.length > 20) {
        console.log(`  ... and ${unmappedCategories.length - 20} more`);
      }
    }

    // Verify mappings
    const mappingCount = await client.query('SELECT COUNT(*) as count FROM product_tag_mappings');
    console.log(`\nTotal tag mappings created: ${mappingCount.rows[0].count}`);

    const productsWithTags = await client.query(`
      SELECT COUNT(DISTINCT product_id) as count FROM product_tag_mappings
    `);
    console.log(`Products with at least one tag: ${productsWithTags.rows[0].count}`);

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
