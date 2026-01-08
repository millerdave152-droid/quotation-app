const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function check() {
  // Check Vesta products
  const vesta = await pool.query("SELECT COUNT(*) as count FROM products WHERE manufacturer = 'VESTA'");
  console.log('Products with manufacturer VESTA:', vesta.rows[0].count);

  // Check products with VRH model prefix
  const vrh = await pool.query("SELECT model, manufacturer, category, cost_cents FROM products WHERE model LIKE 'VRH-%' OR model LIKE 'VRG-%' OR model LIKE 'VCE-%' LIMIT 10");
  console.log('\nVesta model products:');
  vrh.rows.forEach(r => console.log('  ' + r.model + ' | ' + r.manufacturer + ' | ' + r.category + ' | Cost: ' + r.cost_cents));

  // Check all distinct manufacturers
  const mfrs = await pool.query('SELECT DISTINCT manufacturer FROM products ORDER BY manufacturer');
  console.log('\nAll manufacturers in database:');
  mfrs.rows.forEach(r => console.log('  ' + r.manufacturer));

  await pool.end();
}
check().catch(console.error);
