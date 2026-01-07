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
  const categories = [
    { name: 'Refrigerators', id: 6 },
    { name: 'Washers', id: 7 },
    { name: 'Dryers', id: 8 },
    { name: 'Ranges', id: 10 },
    { name: 'Cooktops', id: 11 },
    { name: 'Wall Ovens', id: 12 },
    { name: 'Microwaves', id: 13 },
    { name: 'Range Hoods', id: 14 },
    { name: 'Grills', id: 16 },
    { name: 'Televisions', id: 27 }
  ];

  console.log('=== PRODUCTS MISSING SUBCATEGORY_ID ===\n');

  for (const cat of categories) {
    // Get products with category_id but no subcategory_id
    const missing = await pool.query(`
      SELECT p.id, p.model, p.manufacturer, p.name, p.category,
             pea.fuel_type, pea.subtype, pea.depth_type
      FROM products p
      LEFT JOIN product_extended_attributes pea ON p.id = pea.product_id
      WHERE p.category_id = $1
        AND p.subcategory_id IS NULL
      ORDER BY p.manufacturer, p.model
      LIMIT 15
    `, [cat.id]);

    const totalMissing = await pool.query(`
      SELECT COUNT(*) FROM products
      WHERE category_id = $1 AND subcategory_id IS NULL
    `, [cat.id]);

    if (parseInt(totalMissing.rows[0].count) > 0) {
      console.log(`\n${cat.name} (${totalMissing.rows[0].count} missing subcategory):`);
      console.log('-'.repeat(80));

      for (const p of missing.rows) {
        const attrs = [];
        if (p.fuel_type) attrs.push(`fuel=${p.fuel_type}`);
        if (p.subtype) attrs.push(`subtype=${p.subtype}`);
        if (p.depth_type) attrs.push(`depth=${p.depth_type}`);

        console.log(`  ${p.manufacturer || 'N/A'} | ${p.model} | ${p.name?.substring(0, 40) || 'N/A'}`);
        console.log(`    raw category: ${p.category}`);
        if (attrs.length > 0) console.log(`    attributes: ${attrs.join(', ')}`);
      }
    }
  }

  // Get subcategories for reference
  console.log('\n\n=== AVAILABLE SUBCATEGORIES ===\n');
  for (const cat of categories) {
    const subcats = await pool.query(`
      SELECT id, name, slug FROM categories
      WHERE parent_id = $1
      ORDER BY name
    `, [cat.id]);

    console.log(`${cat.name}: ${subcats.rows.map(s => `${s.name}(${s.id})`).join(', ')}`);
  }

  await pool.end();
}

analyze().catch(e => { console.error(e); process.exit(1); });
