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
  // Check active status
  const active = await pool.query(`
    SELECT active, COUNT(*) as cnt
    FROM products
    WHERE manufacturer = 'HISENSE'
    GROUP BY active
  `);
  console.log('HISENSE by active status:');
  active.rows.forEach(r => console.log('  active=' + r.active + ':', r.cnt));

  // Check TV products active status
  const tvActive = await pool.query(`
    SELECT active, COUNT(*) as cnt
    FROM products
    WHERE manufacturer = 'HISENSE' AND category LIKE '%TV%'
    GROUP BY active
  `);
  console.log('\nHISENSE TV by active status:');
  tvActive.rows.forEach(r => console.log('  active=' + r.active + ':', r.cnt));

  await pool.end();
}

check().catch(console.error);
