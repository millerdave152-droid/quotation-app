/**
 * Verify cost calculation: Actual Cost = 40+ UNITS - SELL THROUGH
 */
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

async function verify() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/Independent December Boxing Week 2025 - All Brands.xlsx';
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets['WHR'];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headers = data[4];

  const modelIdx = headers.indexOf('MODEL');
  const fortyPlusIdx = headers.indexOf('40+ UNITS');
  const sellThruIdx = headers.indexOf('SELL THROUGH');

  console.log('VERIFICATION: Actual Cost = 40+ UNITS - SELL THROUGH');
  console.log('='.repeat(90));
  console.log('Model'.padEnd(20) + ' | Excel 40+'.padEnd(12) + ' | Excel Sell'.padEnd(12) + ' | Expected'.padEnd(12) + ' | DB Cost'.padEnd(12) + ' | Match');
  console.log('-'.repeat(90));

  let matches = 0;
  let mismatches = 0;

  // Check first 15 products
  for (let i = 5; i < 20 && i < data.length; i++) {
    const row = data[i];
    const model = row[modelIdx];
    const fortyPlus = parseFloat(String(row[fortyPlusIdx]).replace(/[$,]/g, '')) || 0;
    const sellThru = parseFloat(String(row[sellThruIdx]).replace(/[$,]/g, '')) || 0;
    const expectedCost = fortyPlus - sellThru;

    if (!model || model === 'MODEL') continue;

    // Get from database
    const result = await pool.query('SELECT cost_cents FROM products WHERE model = $1', [model]);
    if (result.rows.length > 0) {
      const dbCost = result.rows[0].cost_cents / 100;
      const isMatch = Math.abs(dbCost - expectedCost) < 0.01;

      console.log(
        model.padEnd(20) + ' | ' +
        ('$' + fortyPlus.toFixed(2)).padEnd(11) + ' | ' +
        ('$' + sellThru.toFixed(2)).padEnd(11) + ' | ' +
        ('$' + expectedCost.toFixed(2)).padEnd(11) + ' | ' +
        ('$' + dbCost.toFixed(2)).padEnd(11) + ' | ' +
        (isMatch ? '✓ YES' : '✗ NO')
      );

      if (isMatch) matches++;
      else mismatches++;
    }
  }

  console.log('='.repeat(90));
  console.log(`Results: ${matches} matches, ${mismatches} mismatches`);

  await pool.end();
}

verify().catch(console.error);
