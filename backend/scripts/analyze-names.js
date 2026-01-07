/**
 * Analyze product names for unmapped products
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

async function run() {
  console.log('UNMAPPED RANGES WITH NAMES:');
  console.log('-'.repeat(100));
  const ranges = await pool.query(`
    SELECT p.model, p.manufacturer, p.name
    FROM products p
    WHERE p.category_id = (SELECT id FROM categories WHERE slug = 'ranges')
      AND p.subcategory_id IS NULL
      AND p.name IS NOT NULL
    LIMIT 30
  `);
  for (const r of ranges.rows) {
    console.log(`${r.manufacturer || '?'} | ${r.model || '-'} | ${(r.name || '-').substring(0, 80)}`);
  }

  console.log('\nUNMAPPED REFRIGERATORS WITH NAMES:');
  console.log('-'.repeat(100));
  const fridges = await pool.query(`
    SELECT p.model, p.manufacturer, p.name
    FROM products p
    WHERE p.category_id = (SELECT id FROM categories WHERE slug = 'refrigerators')
      AND p.subcategory_id IS NULL
      AND p.name IS NOT NULL
    LIMIT 30
  `);
  for (const r of fridges.rows) {
    console.log(`${r.manufacturer || '?'} | ${r.model || '-'} | ${(r.name || '-').substring(0, 80)}`);
  }

  console.log('\nUNMAPPED RANGE HOODS WITH NAMES:');
  console.log('-'.repeat(100));
  const hoods = await pool.query(`
    SELECT p.model, p.manufacturer, p.name
    FROM products p
    WHERE p.category_id = (SELECT id FROM categories WHERE slug = 'range-hoods')
      AND p.subcategory_id IS NULL
      AND p.name IS NOT NULL
    LIMIT 30
  `);
  for (const r of hoods.rows) {
    console.log(`${r.manufacturer || '?'} | ${r.model || '-'} | ${(r.name || '-').substring(0, 80)}`);
  }

  await pool.end();
}

run().catch(console.error);
