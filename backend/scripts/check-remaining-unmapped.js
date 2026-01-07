require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  // Ranges
  console.log('=== RANGES (remaining) ===');
  const ranges = await pool.query(`
    SELECT manufacturer, category, COUNT(*) as cnt
    FROM products
    WHERE category_id = 10 AND subcategory_id IS NULL
    GROUP BY manufacturer, category
    ORDER BY cnt DESC
    LIMIT 15
  `);
  ranges.rows.forEach(r => console.log(`[${r.cnt}] ${r.manufacturer} | ${r.category}`));

  // Refrigerators
  console.log('\n=== REFRIGERATORS (remaining) ===');
  const fridges = await pool.query(`
    SELECT manufacturer, category, COUNT(*) as cnt
    FROM products
    WHERE category_id = 6 AND subcategory_id IS NULL
    GROUP BY manufacturer, category
    ORDER BY cnt DESC
    LIMIT 15
  `);
  fridges.rows.forEach(r => console.log(`[${r.cnt}] ${r.manufacturer} | ${r.category}`));

  // Washers
  console.log('\n=== WASHERS (remaining) ===');
  const washers = await pool.query(`
    SELECT manufacturer, category, COUNT(*) as cnt
    FROM products
    WHERE category_id = 7 AND subcategory_id IS NULL
    GROUP BY manufacturer, category
    ORDER BY cnt DESC
    LIMIT 15
  `);
  washers.rows.forEach(r => console.log(`[${r.cnt}] ${r.manufacturer} | ${r.category}`));

  // Range Hoods
  console.log('\n=== RANGE HOODS (remaining) ===');
  const hoods = await pool.query(`
    SELECT manufacturer, category, COUNT(*) as cnt
    FROM products
    WHERE category_id = 14 AND subcategory_id IS NULL
    GROUP BY manufacturer, category
    ORDER BY cnt DESC
    LIMIT 10
  `);
  hoods.rows.forEach(r => console.log(`[${r.cnt}] ${r.manufacturer} | ${r.category}`));

  // Microwaves
  console.log('\n=== MICROWAVES (remaining) ===');
  const mw = await pool.query(`
    SELECT manufacturer, category, name, model
    FROM products
    WHERE category_id = 13 AND subcategory_id IS NULL
    LIMIT 10
  `);
  mw.rows.forEach(r => console.log(`${r.manufacturer} | ${r.model} | ${r.name?.substring(0, 40)}`));

  await pool.end();
}
check();
