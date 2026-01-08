/**
 * Update Samsung products with MSRP from price list
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

async function updateSamsungMSRP() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/2025_12_15 - Q4 Samsung DA Regional Master Pricelist - Effective Sep 26 to Dec 31 2025 v5.xlsx';
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // Parse with header row 4 (0-indexed = 3)
  const data = XLSX.utils.sheet_to_json(sheet, { range: 3 });

  console.log('Parsed', data.length, 'rows from Samsung price list');
  console.log('Sample row:', JSON.stringify(data[0], null, 2));

  let updated = 0;
  let notFound = 0;
  let noMsrp = 0;
  const notFoundModels = [];

  for (const row of data) {
    const model = row['Model'];
    const goTo = row['Go To'];

    // Skip header rows or empty rows
    if (!model || model === 'Model' || typeof model !== 'string') continue;

    // Parse MSRP (Go To price)
    let msrpCents = null;
    if (goTo) {
      const parsed = parseFloat(String(goTo).replace(/[$,]/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        msrpCents = Math.round(parsed * 100);
      }
    }

    if (!msrpCents) {
      noMsrp++;
      continue;
    }

    // Update product
    const result = await pool.query(
      'UPDATE products SET msrp_cents = $1, updated_at = NOW() WHERE model = $2 AND manufacturer = $3 RETURNING id',
      [msrpCents, model, 'SAMSUNG']
    );

    if (result.rowCount > 0) {
      updated++;
    } else {
      notFound++;
      if (notFoundModels.length < 10) {
        notFoundModels.push(model);
      }
    }
  }

  console.log('\n========================================');
  console.log('Samsung MSRP Update Complete');
  console.log('========================================');
  console.log('  Updated:', updated);
  console.log('  Not Found in DB:', notFound);
  console.log('  No MSRP Value:', noMsrp);

  if (notFoundModels.length > 0) {
    console.log('\nSample models not found:', notFoundModels.join(', '));
  }

  // Show sample of updated products
  const sample = await pool.query(
    "SELECT model, msrp_cents FROM products WHERE manufacturer = 'SAMSUNG' AND msrp_cents > 0 LIMIT 10"
  );
  console.log('\nSample updated products:');
  sample.rows.forEach(p => {
    console.log('  ', p.model, '- MSRP: $' + (p.msrp_cents / 100).toFixed(2));
  });

  await pool.end();
}

updateSamsungMSRP().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
