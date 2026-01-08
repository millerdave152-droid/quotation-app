const XLSX = require('xlsx');
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

async function test() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/Thor Thanksgiving Promo Oct 5-15 2025.xlsx';
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Test with LRG2401 (row 7, index 6)
  const row = data[6];
  const model = row[1];
  const dealerCost = row[4];
  const promoCost = row[7];
  const cost = promoCost || dealerCost;

  console.log('Model:', model);
  console.log('Dealer Cost:', dealerCost);
  console.log('Promo Cost:', promoCost);
  console.log('Using cost:', cost);

  const parseCents = (val) => {
    if (!val) return null;
    const parsed = parseFloat(String(val).replace(/[$,]/g, ''));
    return !isNaN(parsed) && parsed > 0 ? Math.round(parsed * 100) : null;
  };

  const costCents = parseCents(cost);
  console.log('Cost in cents:', costCents);
  console.log('Cost in dollars:', costCents / 100);

  // Check current value
  const current = await pool.query('SELECT cost_cents FROM products WHERE model = $1', [model]);
  console.log('\nCurrent DB cost_cents:', current.rows[0]?.cost_cents);

  // Now update directly (force update, no COALESCE)
  console.log('\nUpdating database with direct SET...');
  const result = await pool.query(
    'UPDATE products SET cost_cents = $1, updated_at = NOW() WHERE model = $2 RETURNING cost_cents',
    [costCents, model]
  );

  if (result.rows.length > 0) {
    console.log('Updated! New cost_cents:', result.rows[0].cost_cents);
    console.log('New cost in dollars:', result.rows[0].cost_cents / 100);
  }

  await pool.end();
}
test();
