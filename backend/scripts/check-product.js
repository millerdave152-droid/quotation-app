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
  const result = await pool.query(`
    SELECT model, manufacturer, cost_cents, msrp_cents
    FROM products
    WHERE model = 'UCIG245KBL'
  `);

  if (result.rows.length > 0) {
    const p = result.rows[0];
    console.log('Product:', p.model);
    console.log('Manufacturer:', p.manufacturer);
    console.log('Cost (cents):', p.cost_cents);
    console.log('Cost ($):', (p.cost_cents / 100).toFixed(2));
    console.log('MSRP ($):', (p.msrp_cents / 100).toFixed(2));
    console.log('');
    console.log('Expected Cost: $1040 (40+ UNITS $1232 - SELL THROUGH $192)');
    console.log('Actual in DB: $' + (p.cost_cents / 100).toFixed(2));
    console.log('Match:', p.cost_cents === 104000 ? 'YES ✓' : 'NO ✗');
  }

  await pool.end();
}

check();
