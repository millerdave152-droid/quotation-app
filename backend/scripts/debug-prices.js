require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME, ssl: { rejectUnauthorized: false }
});
(async () => {
  // Samsung Q60CF
  const samsung = await pool.query("SELECT id, name, price, cost, category_id FROM products WHERE name ILIKE '%Q60%' OR name ILIKE '%Samsung%Q-Series%' LIMIT 5");
  console.log('Samsung Q60:', samsung.rows);

  // TVs with prices
  const tvs = await pool.query("SELECT id, name, price, cost, category_id FROM products WHERE category_id = 27 AND price IS NOT NULL AND price > 0 LIMIT 5");
  console.log('\nTVs with prices:', tvs.rows.length);
  tvs.rows.forEach(r => console.log(`  id=${r.id}: ${r.name} price=$${r.price} cost=$${r.cost}`));

  // Danby fridge
  const danby = await pool.query("SELECT id, name, price, cost, category_id FROM products WHERE name ILIKE '%Danby%' AND category_id IN (1,6,7,8,9,10,11,12,13,14,15) LIMIT 5");
  console.log('\nDanby appliances:', danby.rows.length);
  danby.rows.forEach(r => console.log(`  id=${r.id}: ${r.name} price=$${r.price} cost=$${r.cost} cat=${r.category_id}`));

  // How many products have null/0 price?
  const stats = await pool.query("SELECT COUNT(*) as total, COUNT(CASE WHEN price IS NULL OR price = 0 THEN 1 END) as null_price FROM products WHERE is_active = true AND category != 'Warranty'");
  console.log('\nPrice stats:', stats.rows[0]);

  // Check what price column POS is using
  const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'products' AND column_name LIKE '%price%' ORDER BY ordinal_position");
  console.log('\nPrice columns:', cols.rows.map(r => r.column_name));

  await pool.end();
})();
