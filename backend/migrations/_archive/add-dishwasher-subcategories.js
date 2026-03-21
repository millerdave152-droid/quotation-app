/**
 * Add missing subcategories for dishwashers
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

async function addSubcategories() {
  console.log('Adding dishwasher subcategories...');

  // Get dishwashers parent category
  const parent = await pool.query("SELECT id FROM categories WHERE slug = 'dishwashers'");
  const parentId = parent.rows[0]?.id;

  if (!parentId) {
    console.log('Error: Dishwashers category not found');
    return;
  }

  const subcategories = [
    { slug: 'built-in-dishwasher', name: 'Built-In', display_name: 'Built-In Dishwashers' },
    { slug: 'drawer-dishwasher', name: 'Drawer', display_name: 'Drawer Dishwashers' },
    { slug: 'portable-dishwasher', name: 'Portable', display_name: 'Portable Dishwashers' }
  ];

  for (const sub of subcategories) {
    // Check if already exists
    const exists = await pool.query('SELECT id FROM categories WHERE slug = $1', [sub.slug]);
    if (exists.rows.length > 0) {
      console.log(`  ✓ ${sub.name} already exists`);
      continue;
    }

    await pool.query(`
      INSERT INTO categories (parent_id, name, slug, display_name, level, display_order)
      VALUES ($1, $2, $3, $4, 3, 0)
    `, [parentId, sub.name, sub.slug, sub.display_name]);
    console.log(`  + Added ${sub.name}`);
  }

  console.log('Done!');
  await pool.end();
}

addSubcategories().catch(console.error);
