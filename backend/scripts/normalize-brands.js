/**
 * Normalize manufacturer brand codes to full names
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

async function normalize() {
  const mappings = [
    ['WHR', 'WHIRLPOOL'],
    ['MAY', 'MAYTAG'],
    ['KAD BI', 'KITCHENAID'],
    ['KAD FS', 'KITCHENAID'],
    ['KAD', 'KITCHENAID'],
    ['AMA', 'AMANA'],
    ['GDR', 'GLADIATOR'],
    ['EDR', 'EVERYDROP'],
    ['UNB', 'WHIRLPOOL']
  ];

  console.log('Normalizing manufacturer names...');
  let totalUpdated = 0;

  for (const [code, name] of mappings) {
    const result = await pool.query(
      'UPDATE products SET manufacturer = $1 WHERE manufacturer = $2',
      [name, code]
    );
    if (result.rowCount > 0) {
      console.log('  ' + code + ' -> ' + name + ': ' + result.rowCount + ' rows');
      totalUpdated += result.rowCount;
    }
  }

  console.log('\nTotal updated:', totalUpdated);

  // Show final counts
  const counts = await pool.query(`
    SELECT manufacturer, COUNT(*) as count, COUNT(CASE WHEN msrp_cents > 0 THEN 1 END) as with_msrp
    FROM products
    WHERE manufacturer IN ('WHIRLPOOL', 'MAYTAG', 'KITCHENAID', 'AMANA', 'GLADIATOR', 'EVERYDROP')
    GROUP BY manufacturer
    ORDER BY count DESC
  `);

  console.log('\nFinal product counts:');
  counts.rows.forEach(r => {
    console.log('  ' + r.manufacturer + ': ' + r.count + ' products (' + r.with_msrp + ' with MSRP)');
  });

  await pool.end();
}

normalize().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
