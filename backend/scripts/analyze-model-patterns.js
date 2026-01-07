/**
 * Analyze model number patterns for subcategory detection
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

async function analyze() {
  console.log('='.repeat(70));
  console.log('MODEL NUMBER PATTERN ANALYSIS');
  console.log('='.repeat(70));

  // Dryers - Check patterns that indicate Electric vs Gas
  console.log('\n=== DRYER MODEL ANALYSIS ===');
  const electricDryers = await pool.query(`
    SELECT model, manufacturer, name, subcategory_id
    FROM products
    WHERE category_id = (SELECT id FROM categories WHERE slug = 'dryers')
      AND subcategory_id = (SELECT id FROM categories WHERE slug = 'electric-dryer')
    LIMIT 20
  `);
  console.log('Electric dryers (already mapped):');
  for (const p of electricDryers.rows) {
    console.log(`  ${p.manufacturer} | ${p.model}`);
  }

  const gasDryers = await pool.query(`
    SELECT model, manufacturer, name, subcategory_id
    FROM products
    WHERE category_id = (SELECT id FROM categories WHERE slug = 'dryers')
      AND subcategory_id = (SELECT id FROM categories WHERE slug = 'gas-dryer')
    LIMIT 20
  `);
  console.log('\nGas dryers (already mapped):');
  for (const p of gasDryers.rows) {
    console.log(`  ${p.manufacturer} | ${p.model}`);
  }

  const unmappedDryers = await pool.query(`
    SELECT model, manufacturer, name, category
    FROM products
    WHERE category_id = (SELECT id FROM categories WHERE slug = 'dryers')
      AND subcategory_id IS NULL
    LIMIT 30
  `);
  console.log('\nUnmapped dryers:');
  for (const p of unmappedDryers.rows) {
    console.log(`  ${p.manufacturer || '?'} | ${p.model || '-'} | cat: ${p.category || '-'}`);
  }

  // Washers - Check FL vs TL patterns
  console.log('\n=== WASHER MODEL ANALYSIS ===');
  const flWashers = await pool.query(`
    SELECT model, manufacturer, name
    FROM products
    WHERE category_id = (SELECT id FROM categories WHERE slug = 'washers')
      AND subcategory_id = (SELECT id FROM categories WHERE slug = 'front-load-washer')
    LIMIT 15
  `);
  console.log('Front load washers (mapped):');
  for (const p of flWashers.rows) {
    console.log(`  ${p.manufacturer} | ${p.model}`);
  }

  const tlWashers = await pool.query(`
    SELECT model, manufacturer, name
    FROM products
    WHERE category_id = (SELECT id FROM categories WHERE slug = 'washers')
      AND subcategory_id = (SELECT id FROM categories WHERE slug = 'top-load-washer')
    LIMIT 15
  `);
  console.log('\nTop load washers (mapped):');
  for (const p of tlWashers.rows) {
    console.log(`  ${p.manufacturer} | ${p.model}`);
  }

  const unmappedWashers = await pool.query(`
    SELECT model, manufacturer, name, category
    FROM products
    WHERE category_id = (SELECT id FROM categories WHERE slug = 'washers')
      AND subcategory_id IS NULL
    LIMIT 30
  `);
  console.log('\nUnmapped washers:');
  for (const p of unmappedWashers.rows) {
    console.log(`  ${p.manufacturer || '?'} | ${p.model || '-'} | cat: ${p.category || '-'}`);
  }

  // Refrigerators - Pattern analysis
  console.log('\n=== REFRIGERATOR MODEL ANALYSIS ===');
  const frenchDoor = await pool.query(`
    SELECT model, manufacturer
    FROM products
    WHERE category_id = (SELECT id FROM categories WHERE slug = 'refrigerators')
      AND subcategory_id = (SELECT id FROM categories WHERE slug = 'french-door')
    LIMIT 15
  `);
  console.log('French door (mapped):');
  for (const p of frenchDoor.rows) {
    console.log(`  ${p.manufacturer} | ${p.model}`);
  }

  const unmappedFridges = await pool.query(`
    SELECT model, manufacturer, name, category
    FROM products
    WHERE category_id = (SELECT id FROM categories WHERE slug = 'refrigerators')
      AND subcategory_id IS NULL
    LIMIT 30
  `);
  console.log('\nUnmapped refrigerators (excluding filters):');
  for (const p of unmappedFridges.rows) {
    const text = [p.name || '', p.category || ''].join(' ').toLowerCase();
    if (!text.includes('filter') && !text.includes('kit') && !text.includes('paint')) {
      console.log(`  ${p.manufacturer || '?'} | ${p.model || '-'} | cat: ${p.category || '-'}`);
    }
  }

  await pool.end();
}

analyze().catch(console.error);
