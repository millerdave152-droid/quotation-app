/**
 * Add more category patterns for unmapped categories
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

async function addPatterns() {
  console.log('Adding more category patterns...\n');

  // Add 'vent' to range-hoods patterns
  await pool.query(`
    UPDATE categories SET legacy_patterns = legacy_patterns || '["vent", "falmec", "ventilation"]'::jsonb
    WHERE slug = 'range-hoods'
  `);
  console.log('  Added vent patterns to range-hoods');

  // Add 'cooking' to ranges (generic cooking = range)
  await pool.query(`
    UPDATE categories SET legacy_patterns = legacy_patterns || '["cooking"]'::jsonb
    WHERE slug = 'ranges'
  `);
  console.log('  Added cooking pattern to ranges');

  // Add 'panel' 'bespoke' 'pedestal' to accessories
  await pool.query(`
    UPDATE categories SET legacy_patterns = legacy_patterns || '["panel", "bespoke", "pedestal"]'::jsonb
    WHERE slug = 'appliance-accessories'
  `);
  console.log('  Added panel/bespoke/pedestal to accessories');

  // Add 'laundry' as pattern for washers
  await pool.query(`
    UPDATE categories SET legacy_patterns = legacy_patterns || '["laundry"]'::jsonb
    WHERE slug = 'washers'
  `);
  console.log('  Added laundry pattern to washers');

  // Add general patterns to accessories
  await pool.query(`
    UPDATE categories SET legacy_patterns = legacy_patterns || '["appliance", "global products", "storage", "cabinets", "rotisserie", "cooking grate", "thermometer", "grill cover", "grilling tools"]'::jsonb
    WHERE slug = 'appliance-accessories'
  `);
  console.log('  Added general patterns to accessories');

  // Add 'air care', 'comfort', 'cleaner' to specialty
  await pool.query(`
    UPDATE categories SET legacy_patterns = legacy_patterns || '["air care", "home comfort", "cleaner", "air conditioner", "dehumidifier"]'::jsonb
    WHERE slug = 'specialty'
  `);
  console.log('  Added air care patterns to specialty');

  // Add kettles category
  const kettleResult = await pool.query(`
    INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, legacy_patterns)
    SELECT 'Kettles', 'kettles', 'Kettles', 2, id, 8, '["kettle", "kettles", "cordless"]'::jsonb
    FROM categories WHERE slug = 'small-appliances'
    ON CONFLICT (slug) DO UPDATE SET legacy_patterns = '["kettle", "kettles", "cordless"]'::jsonb
    RETURNING id
  `);
  console.log('  Added kettles category');

  // Add 'uncategorized', 'jenn-air', generic brand names to ranges (these are mostly ranges)
  await pool.query(`
    UPDATE categories SET legacy_patterns = legacy_patterns || '["jenn-air", "jennair"]'::jsonb
    WHERE slug = 'ranges'
  `);
  console.log('  Added jenn-air pattern to ranges');

  console.log('\nPatterns added successfully!\n');
  await pool.end();
}

addPatterns().catch(console.error);
