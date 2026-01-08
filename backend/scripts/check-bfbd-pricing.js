/**
 * Check BFBD pricing in database
 */
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
  // Check Frigidaire products
  const frig = await pool.query(`
    SELECT model, name, cost_cents, msrp_cents, promo_cost_cents
    FROM products
    WHERE manufacturer = 'FRIGIDAIRE'
    ORDER BY updated_at DESC
    LIMIT 15
  `);

  console.log('=== FRIGIDAIRE Products ===');
  frig.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    const promo = p.promo_cost_cents ? '$' + (p.promo_cost_cents / 100).toFixed(2) : '-';
    console.log(`  ${p.model}: Cost=${cost}, MSRP=${msrp}, Promo=${promo}`);
  });

  // Check Electrolux products
  const elux = await pool.query(`
    SELECT model, name, cost_cents, msrp_cents, promo_cost_cents
    FROM products
    WHERE manufacturer = 'ELECTROLUX'
    ORDER BY updated_at DESC
    LIMIT 10
  `);

  console.log('\n=== ELECTROLUX Products ===');
  elux.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model}: Cost=${cost}, MSRP=${msrp}`);
  });

  // Check specific models from the file - comparing expected vs actual
  console.log('\n=== Specific Models Verification ===');
  console.log('Expected from file (Nov 20 - Jan 14 promo pricing):');
  console.log('  FFET1022UW: Cost=$655, MSRP=$799');
  console.log('  FFET1022UV: Cost=$680, MSRP=$829');
  console.log('  FRBG1224AV: Cost=$819, MSRP=$999');
  console.log('  FFHT1425VW: Cost=$655, MSRP=$799');

  console.log('\nActual in database:');
  const specific = await pool.query(`
    SELECT model, cost_cents, msrp_cents
    FROM products
    WHERE model IN ('FFET1022UW', 'FFET1022UV', 'FRBG1224AV', 'FFHT1425VW')
    ORDER BY model
  `);
  specific.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model}: Cost=${cost}, MSRP=${msrp}`);
  });

  await pool.end();
}

check().catch(console.error);
