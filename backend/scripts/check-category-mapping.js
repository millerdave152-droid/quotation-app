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
    'Refrigerators', 'Washers', 'Dryers', 'Ranges', 'Cooktops',
    'Wall Ovens', 'Microwaves', 'Range Hoods', 'Grills', 'Televisions'
  ];

  console.log('=== CATEGORY MAPPING STATUS ===\n');

  for (const catName of categories) {
    // Get category ID
    const catResult = await pool.query(
      `SELECT id, slug FROM categories WHERE name = $1 AND level = 2`,
      [catName]
    );

    if (catResult.rows.length === 0) {
      console.log(`${catName}: CATEGORY NOT FOUND IN DATABASE`);
      continue;
    }

    const catId = catResult.rows[0].id;
    const slug = catResult.rows[0].slug;

    // Count products with this category_id
    const withCatId = await pool.query(
      'SELECT COUNT(*) FROM products WHERE category_id = $1',
      [catId]
    );

    // Count products with subcategory_id (children of this category)
    const withSubcatId = await pool.query(
      `SELECT COUNT(*) FROM products p
       JOIN categories c ON p.subcategory_id = c.id
       WHERE c.parent_id = $1`,
      [catId]
    );

    // Get subcategories for this category
    const subcats = await pool.query(
      'SELECT id, name, slug FROM categories WHERE parent_id = $1 ORDER BY name',
      [catId]
    );

    // Get sample products WITHOUT category_id but matching raw category
    const rawMatches = await pool.query(`
      SELECT COUNT(*) FROM products
      WHERE category_id IS NULL
      AND LOWER(category) LIKE $1
    `, [`%${catName.toLowerCase().replace(/s$/, '')}%`]);

    console.log(`${catName} (id=${catId}, slug=${slug}):`);
    console.log(`  Products with category_id: ${withCatId.rows[0].count}`);
    console.log(`  Products with subcategory_id: ${withSubcatId.rows[0].count}`);
    console.log(`  Unmapped (raw category match): ${rawMatches.rows[0].count}`);
    console.log(`  Subcategories: ${subcats.rows.map(s => `${s.name}(${s.id})`).join(', ')}`);
    console.log('');
  }

  // Also check total unmapped
  const totalUnmapped = await pool.query('SELECT COUNT(*) FROM products WHERE category_id IS NULL');
  console.log(`\nTOTAL PRODUCTS WITHOUT category_id: ${totalUnmapped.rows[0].count}`);

  await pool.end();
}

analyze().catch(e => { console.error(e); process.exit(1); });
