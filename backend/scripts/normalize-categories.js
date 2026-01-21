/**
 * Normalize Product Categories
 * Maps 646 unique categories into 9 master categories using keyword matching
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

// Master categories with keyword arrays (order matters - first match wins)
const CATEGORY_KEYWORDS = {
  'Refrigerators': [
    'refrigerator', 'fridge', 'freezer', 'french door', 'side-by-side',
    'top freezer', 'bottom freezer', 'wine cooler', 'beverage center',
    'wine cellar', 'ice maker', 'compact refrigerator', 'mini fridge'
  ],
  'Ranges & Cooking': [
    'range', 'oven', 'stove', 'cooktop', 'microwave', 'hood', 'ventilation',
    'warming drawer', 'wall oven', 'induction', 'gas range', 'electric range',
    'convection', 'rangehood', 'over-the-range'
  ],
  'Dishwashers': [
    'dishwasher', 'dish washer'
  ],
  'Laundry': [
    'washer', 'dryer', 'laundry', 'washing machine', 'pedestal', 'combo washer',
    'front load', 'top load', 'stackable', 'laundry pair', 'washer dryer'
  ],
  'TVs': [
    'tv', 'television', 'oled', 'qled', 'led tv', 'smart tv', 'uhd', '4k tv',
    '8k', 'plasma', 'lcd tv', 'hdtv', 'flat screen', 'curved tv'
  ],
  'Audio': [
    'audio', 'speaker', 'soundbar', 'sound bar', 'receiver', 'subwoofer',
    'headphone', 'earbuds', 'home theater', 'amplifier', 'stereo', 'turntable',
    'wireless speaker', 'bluetooth speaker', 'av receiver'
  ],
  'Furniture': [
    'furniture', 'sofa', 'couch', 'chair', 'table', 'desk', 'bed', 'mattress',
    'cabinet', 'shelf', 'ottoman', 'dresser', 'stand', 'bench', 'bookcase',
    'entertainment center', 'tv stand', 'media console'
  ],
  'Barbecues': [
    'bbq', 'barbecue', 'grill', 'smoker', 'outdoor cooking', 'charcoal grill',
    'gas grill', 'pellet grill', 'griddle', 'fire pit'
  ],
  'Misc. Appliances': [
    // Default catch-all - empty array means this is the fallback
  ]
};

// Additional specific keywords for products that might not have clear category
const ADDITIONAL_KEYWORDS = {
  'Refrigerators': ['rf', 'rs', 'wr', 'french', 'bev', 'wine'],
  'Ranges & Cooking': ['ne', 'nx', 'jgs', 'jgb', 'jem', 'wfe', 'wfg', 'wmh'],
  'Dishwashers': ['dw', 'wdt', 'wdf'],
  'Laundry': ['wt', 'dv', 'wm', 'wf', 'mvw', 'med', 'mgd'],
  'TVs': ['un', 'qn', 'xr', 'lg'],
  'Audio': ['hw', 'sl', 'sb'],
  'Furniture': [],
  'Barbecues': [],
  'Misc. Appliances': []
};

function classifyProduct(product) {
  const textToCheck = [
    product.category || '',
    product.name || '',
    product.model || ''
  ].join(' ').toLowerCase();

  // Check each category's keywords
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.length === 0) continue; // Skip Misc (it's the fallback)

    for (const keyword of keywords) {
      if (textToCheck.includes(keyword.toLowerCase())) {
        return category;
      }
    }
  }

  // Try additional model-based keywords
  const model = (product.model || '').toUpperCase();
  for (const [category, prefixes] of Object.entries(ADDITIONAL_KEYWORDS)) {
    for (const prefix of prefixes) {
      if (model.startsWith(prefix.toUpperCase())) {
        return category;
      }
    }
  }

  // Default to Misc. Appliances
  return 'Misc. Appliances';
}

async function normalizeCategories() {
  const client = await pool.connect();

  try {
    console.log('Starting category normalization...\n');

    // Get all products
    const result = await client.query(`
      SELECT id, model, name, category
      FROM products
      WHERE active = true
    `);

    console.log(`Found ${result.rows.length} active products to classify\n`);

    // Classify each product
    const categoryCounts = {};
    const updates = [];

    for (const product of result.rows) {
      const masterCategory = classifyProduct(product);

      categoryCounts[masterCategory] = (categoryCounts[masterCategory] || 0) + 1;
      updates.push({ id: product.id, masterCategory });
    }

    // Show distribution before updating
    console.log('Category distribution:');
    console.log('------------------------');
    for (const [cat, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`${cat.padEnd(20)} ${count}`);
    }
    console.log('------------------------');
    console.log(`Total: ${result.rows.length}\n`);

    // Update products in batches
    console.log('Updating products...');

    let updated = 0;
    for (const { id, masterCategory } of updates) {
      await client.query(
        'UPDATE products SET master_category = $1 WHERE id = $2',
        [masterCategory, id]
      );
      updated++;

      if (updated % 500 === 0) {
        console.log(`  Updated ${updated}/${result.rows.length} products...`);
      }
    }

    console.log(`\nCompleted! Updated ${updated} products.`);

    // Verify update
    const verification = await client.query(`
      SELECT master_category, COUNT(*) as count
      FROM products
      WHERE active = true AND master_category IS NOT NULL
      GROUP BY master_category
      ORDER BY count DESC
    `);

    console.log('\nVerification - Products per master category:');
    for (const row of verification.rows) {
      console.log(`  ${row.master_category}: ${row.count}`);
    }

  } catch (error) {
    console.error('Normalization failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

normalizeCategories().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
