/**
 * Analyze subcategory mapping status and product data patterns
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
  console.log('DEEP DIVE: SUBCATEGORY MAPPING ANALYSIS');
  console.log('='.repeat(70));

  // 1. Check current subcategory mapping status
  const subcatStatus = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(subcategory_id) as with_subcategory,
      COUNT(category_id) as with_category
    FROM products
  `);

  console.log('\n1. CURRENT MAPPING STATUS');
  console.log('-'.repeat(40));
  console.log('Total products:', subcatStatus.rows[0].total);
  console.log('With category_id:', subcatStatus.rows[0].with_category);
  console.log('With subcategory_id:', subcatStatus.rows[0].with_subcategory);
  console.log('Missing subcategory:', subcatStatus.rows[0].with_category - subcatStatus.rows[0].with_subcategory);

  // 2. List all subcategories
  const subcats = await pool.query(`
    SELECT c.id, c.name, c.slug, parent.id as parent_id, parent.name as parent_name
    FROM categories c
    JOIN categories parent ON c.parent_id = parent.id
    WHERE c.level = 3
    ORDER BY parent.display_order, c.display_order
  `);

  console.log('\n2. AVAILABLE SUBCATEGORIES (' + subcats.rows.length + ')');
  console.log('-'.repeat(40));
  let currentParent = '';
  for (const s of subcats.rows) {
    if (s.parent_name !== currentParent) {
      currentParent = s.parent_name;
      console.log(`\n  ${s.parent_name}:`);
    }
    console.log(`    - ${s.name} (id: ${s.id}, slug: ${s.slug})`);
  }

  // 3. Analyze product data patterns for each main category
  console.log('\n3. PRODUCT DATA PATTERNS BY CATEGORY');
  console.log('-'.repeat(40));

  const mainCats = await pool.query(`
    SELECT id, name, slug FROM categories WHERE level = 2 AND is_active = true ORDER BY display_order
  `);

  for (const cat of mainCats.rows) {
    const count = await pool.query(`
      SELECT COUNT(*) FROM products WHERE category_id = $1
    `, [cat.id]);

    if (parseInt(count.rows[0].count) === 0) continue;

    console.log(`\n  === ${cat.name.toUpperCase()} (${count.rows[0].count} products) ===`);

    // Get unique raw category values
    const rawCats = await pool.query(`
      SELECT DISTINCT category, COUNT(*) as cnt
      FROM products
      WHERE category_id = $1
      GROUP BY category
      ORDER BY cnt DESC
      LIMIT 15
    `, [cat.id]);

    console.log('  Raw category values:');
    for (const r of rawCats.rows) {
      console.log(`    [${r.cnt}] ${r.category}`);
    }

    // Get extended attributes summary
    const attrs = await pool.query(`
      SELECT
        COUNT(DISTINCT pea.subtype) as subtypes,
        COUNT(DISTINCT pea.fuel_type) as fuel_types,
        COUNT(DISTINCT pea.depth_type) as depth_types
      FROM products p
      LEFT JOIN product_extended_attributes pea ON p.id = pea.product_id
      WHERE p.category_id = $1
    `, [cat.id]);

    if (attrs.rows[0].subtypes > 0 || attrs.rows[0].fuel_types > 0) {
      console.log('  Extended attributes:');

      if (attrs.rows[0].subtypes > 0) {
        const subtypes = await pool.query(`
          SELECT DISTINCT pea.subtype, COUNT(*) as cnt
          FROM products p
          JOIN product_extended_attributes pea ON p.id = pea.product_id
          WHERE p.category_id = $1 AND pea.subtype IS NOT NULL
          GROUP BY pea.subtype ORDER BY cnt DESC
        `, [cat.id]);
        console.log('    Subtypes:', subtypes.rows.map(s => `${s.subtype}(${s.cnt})`).join(', '));
      }

      if (attrs.rows[0].fuel_types > 0) {
        const fuelTypes = await pool.query(`
          SELECT DISTINCT pea.fuel_type, COUNT(*) as cnt
          FROM products p
          JOIN product_extended_attributes pea ON p.id = pea.product_id
          WHERE p.category_id = $1 AND pea.fuel_type IS NOT NULL
          GROUP BY pea.fuel_type ORDER BY cnt DESC
        `, [cat.id]);
        console.log('    Fuel types:', fuelTypes.rows.map(f => `${f.fuel_type}(${f.cnt})`).join(', '));
      }

      if (attrs.rows[0].depth_types > 0) {
        const depthTypes = await pool.query(`
          SELECT DISTINCT pea.depth_type, COUNT(*) as cnt
          FROM products p
          JOIN product_extended_attributes pea ON p.id = pea.product_id
          WHERE p.category_id = $1 AND pea.depth_type IS NOT NULL
          GROUP BY pea.depth_type ORDER BY cnt DESC
        `, [cat.id]);
        console.log('    Depth types:', depthTypes.rows.map(d => `${d.depth_type}(${d.cnt})`).join(', '));
      }
    }

    // Sample products
    const samples = await pool.query(`
      SELECT p.model, p.manufacturer, p.name, p.category
      FROM products p
      WHERE p.category_id = $1
      LIMIT 5
    `, [cat.id]);

    console.log('  Sample products:');
    for (const p of samples.rows) {
      console.log(`    ${p.model} | ${p.manufacturer} | ${(p.name || '').substring(0, 50)}`);
    }
  }

  // 4. Manufacturer analysis
  console.log('\n4. MANUFACTURER ANALYSIS');
  console.log('-'.repeat(40));

  const mfrs = await pool.query(`
    SELECT manufacturer, COUNT(*) as cnt
    FROM products
    WHERE manufacturer IS NOT NULL
    GROUP BY manufacturer
    ORDER BY cnt DESC
    LIMIT 20
  `);

  console.log('Top 20 manufacturers:');
  for (const m of mfrs.rows) {
    console.log(`  [${m.cnt}] ${m.manufacturer}`);
  }

  // 5. Unique manufacturer count
  const mfrCount = await pool.query(`
    SELECT COUNT(DISTINCT manufacturer) as cnt FROM products WHERE manufacturer IS NOT NULL
  `);
  console.log(`\nTotal unique manufacturers: ${mfrCount.rows[0].cnt}`);

  await pool.end();
  console.log('\n' + '='.repeat(70));
  console.log('ANALYSIS COMPLETE');
  console.log('='.repeat(70));
}

analyze().catch(console.error);
