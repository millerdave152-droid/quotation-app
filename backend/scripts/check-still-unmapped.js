/**
 * Check products still unmapped after v2 migration
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

// Accessory exclusion patterns
const EXCLUDE_PATTERNS = [
  'handle', 'knob', 'kit', 'filter', 'toe kick', 'drawer handle',
  'paint-pen', 'waterline', 'duct', 'flue extension', 'recirculation',
  'accessory', 'accessories', 'trim', 'filler', 'panel', 'replacement',
  'grate', 'burner cap', 'drip pan', 'rack', 'shelf', 'bin', 'crisper'
];

function isAccessory(text) {
  const lower = text.toLowerCase();
  return EXCLUDE_PATTERNS.some(p => lower.includes(p));
}

async function check() {
  console.log('='.repeat(70));
  console.log('STILL UNMAPPED PRODUCTS (not accessories)');
  console.log('='.repeat(70));

  const categories = ['refrigerators', 'washers', 'dryers', 'ranges', 'dishwashers'];

  for (const catSlug of categories) {
    console.log(`\n=== ${catSlug.toUpperCase()} ===`);

    const products = await pool.query(`
      SELECT p.model, p.manufacturer, p.name, p.category
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE c.slug = $1 AND p.subcategory_id IS NULL
      LIMIT 20
    `, [catSlug]);

    let count = 0;
    for (const p of products.rows) {
      const text = [p.category || '', p.name || '', p.model || ''].join(' ');
      if (!isAccessory(text)) {
        console.log(`  ${p.manufacturer || '?'} | ${p.model || '-'} | ${(p.name || '-').substring(0, 60)}`);
        count++;
        if (count >= 10) break;
      }
    }

    if (count === 0) {
      console.log('  All unmapped products are accessories');
    }
  }

  await pool.end();
}

check().catch(console.error);
