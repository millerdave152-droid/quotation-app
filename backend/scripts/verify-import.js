const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

async function verify() {
  const result = await pool.query(`
    SELECT model, color, samsung_category,
           retail_price_cents/100.0 as retail_price,
           promo_price_cents/100.0 as promo_price,
           cost_cents/100.0 as cost,
           promo_margin
    FROM products
    WHERE manufacturer ILIKE '%samsung%'
      AND import_source = 'samsung_pricelist'
    ORDER BY updated_at DESC
    LIMIT 10
  `);

  console.log('Sample updated Samsung products:');
  console.table(result.rows);
  await pool.end();
}

verify().catch(console.error);
