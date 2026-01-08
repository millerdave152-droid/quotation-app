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
    SELECT model, manufacturer,
           cost_cents/100.0 as cost,
           msrp_cents/100.0 as msrp,
           ROUND((msrp_cents - cost_cents) * 100.0 / msrp_cents, 1) as margin_pct
    FROM products
    WHERE manufacturer IN ('WHIRLPOOL', 'MAYTAG', 'KITCHENAID', 'AMANA', 'GLADIATOR')
    AND cost_cents > 0 AND msrp_cents > 0
    ORDER BY manufacturer, model
    LIMIT 20
  `);

  console.log('Sample products with 40+ UNITS cost (minus SELL THROUGH):');
  console.log('Model                | Brand      | Cost     | MSRP     | Margin');
  console.log('---------------------|------------|----------|----------|-------');
  result.rows.forEach(r => {
    const cost = '$' + Number(r.cost).toFixed(2).padStart(7);
    const msrp = '$' + Number(r.msrp).toFixed(2).padStart(7);
    console.log(r.model.padEnd(20) + ' | ' + r.manufacturer.padEnd(10) + ' | ' + cost + ' | ' + msrp + ' | ' + r.margin_pct + '%');
  });

  // Summary
  const summary = await pool.query(`
    SELECT manufacturer,
           COUNT(*) as total,
           COUNT(CASE WHEN cost_cents > 0 THEN 1 END) as with_cost,
           COUNT(CASE WHEN msrp_cents > 0 THEN 1 END) as with_msrp
    FROM products
    WHERE manufacturer IN ('WHIRLPOOL', 'MAYTAG', 'KITCHENAID', 'AMANA', 'GLADIATOR', 'EVERYDROP')
    GROUP BY manufacturer
    ORDER BY total DESC
  `);

  console.log('\nSummary:');
  summary.rows.forEach(r => console.log('  ' + r.manufacturer + ': ' + r.total + ' total, ' + r.with_cost + ' with cost, ' + r.with_msrp + ' with MSRP'));

  await pool.end();
}

check().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
