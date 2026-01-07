/**
 * Analyze unmapped products to improve subcategory rules
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
  console.log('ANALYZING UNMAPPED PRODUCTS');
  console.log('='.repeat(70));

  // Sample unmapped RANGES
  console.log('\n=== UNMAPPED RANGES (sample) ===');
  const ranges = await pool.query(`
    SELECT p.model, p.manufacturer, p.category, p.name,
           pea.fuel_type, pea.subtype
    FROM products p
    LEFT JOIN product_extended_attributes pea ON p.id = pea.product_id
    WHERE p.category_id = (SELECT id FROM categories WHERE slug = 'ranges')
      AND p.subcategory_id IS NULL
    LIMIT 20
  `);
  for (const r of ranges.rows) {
    console.log(`  ${r.manufacturer || '?'} | ${r.model} | cat: ${r.category || '-'} | fuel: ${r.fuel_type || '-'} | sub: ${r.subtype || '-'}`);
  }

  // Get unique category values for unmapped ranges
  console.log('\n=== UNIQUE CATEGORY VALUES (unmapped ranges) ===');
  const rangeCats = await pool.query(`
    SELECT DISTINCT p.category, COUNT(*) as cnt
    FROM products p
    WHERE p.category_id = (SELECT id FROM categories WHERE slug = 'ranges')
      AND p.subcategory_id IS NULL
      AND p.category IS NOT NULL
    GROUP BY p.category
    ORDER BY cnt DESC
    LIMIT 20
  `);
  for (const r of rangeCats.rows) {
    console.log(`  [${r.cnt}] ${r.category}`);
  }

  // Sample unmapped REFRIGERATORS
  console.log('\n=== UNMAPPED REFRIGERATORS (sample) ===');
  const fridges = await pool.query(`
    SELECT p.model, p.manufacturer, p.category, p.name,
           pea.depth_type, pea.subtype
    FROM products p
    LEFT JOIN product_extended_attributes pea ON p.id = pea.product_id
    WHERE p.category_id = (SELECT id FROM categories WHERE slug = 'refrigerators')
      AND p.subcategory_id IS NULL
    LIMIT 20
  `);
  for (const r of fridges.rows) {
    console.log(`  ${r.manufacturer || '?'} | ${r.model} | cat: ${r.category || '-'} | depth: ${r.depth_type || '-'}`);
  }

  // Get unique category values for unmapped refrigerators
  console.log('\n=== UNIQUE CATEGORY VALUES (unmapped refrigerators) ===');
  const fridgeCats = await pool.query(`
    SELECT DISTINCT p.category, COUNT(*) as cnt
    FROM products p
    WHERE p.category_id = (SELECT id FROM categories WHERE slug = 'refrigerators')
      AND p.subcategory_id IS NULL
      AND p.category IS NOT NULL
    GROUP BY p.category
    ORDER BY cnt DESC
    LIMIT 20
  `);
  for (const r of fridgeCats.rows) {
    console.log(`  [${r.cnt}] ${r.category}`);
  }

  // Sample unmapped RANGE HOODS
  console.log('\n=== UNMAPPED RANGE HOODS (sample) ===');
  const hoods = await pool.query(`
    SELECT p.model, p.manufacturer, p.category, p.name,
           pea.subtype
    FROM products p
    LEFT JOIN product_extended_attributes pea ON p.id = pea.product_id
    WHERE p.category_id = (SELECT id FROM categories WHERE slug = 'range-hoods')
      AND p.subcategory_id IS NULL
    LIMIT 20
  `);
  for (const r of hoods.rows) {
    console.log(`  ${r.manufacturer || '?'} | ${r.model} | cat: ${r.category || '-'} | sub: ${r.subtype || '-'}`);
  }

  // Get unique category values for unmapped range hoods
  console.log('\n=== UNIQUE CATEGORY VALUES (unmapped range hoods) ===');
  const hoodCats = await pool.query(`
    SELECT DISTINCT p.category, COUNT(*) as cnt
    FROM products p
    WHERE p.category_id = (SELECT id FROM categories WHERE slug = 'range-hoods')
      AND p.subcategory_id IS NULL
      AND p.category IS NOT NULL
    GROUP BY p.category
    ORDER BY cnt DESC
    LIMIT 20
  `);
  for (const r of hoodCats.rows) {
    console.log(`  [${r.cnt}] ${r.category}`);
  }

  // Check extended attributes for unmapped
  console.log('\n=== EXTENDED ATTRIBUTES FOR UNMAPPED ===');
  const attrs = await pool.query(`
    SELECT
      c.name as category,
      COUNT(*) as total_unmapped,
      COUNT(pea.fuel_type) as with_fuel,
      COUNT(pea.subtype) as with_subtype
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN product_extended_attributes pea ON p.id = pea.product_id
    WHERE p.subcategory_id IS NULL
    GROUP BY c.name
    ORDER BY total_unmapped DESC
    LIMIT 10
  `);
  console.log('Category | Unmapped | Has Fuel | Has Subtype');
  for (const r of attrs.rows) {
    console.log(`  ${r.category} | ${r.total_unmapped} | ${r.with_fuel} | ${r.with_subtype}`);
  }

  await pool.end();
  console.log('\n' + '='.repeat(70));
}

analyze().catch(console.error);
