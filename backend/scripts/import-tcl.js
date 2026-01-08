/**
 * Import TCL products from Part Search Result Excel
 * Columns: SKU, SYNX P/N, Mfr., Mfr. P/N, UPC Code, Weight, Avail., MSRP
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

async function importTCL() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/TCL Products.xlsx';
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets['Part Search Result'];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  console.log('Importing TCL products...\n');
  console.log('Total rows in sheet:', data.length);

  // Header is row 1 (index 0)
  // Columns: SKU, SYNX P/N, Mfr., Mfr. P/N, UPC Code, Weight, Avail., MSRP
  const products = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[3]) continue; // Mfr. P/N is the model

    const model = String(row[3]).trim();
    let msrpStr = String(row[7] || '').replace(/[$,]/g, '');
    const msrp = parseFloat(msrpStr) || 0;

    if (!model || msrp <= 0) continue;

    products.push({
      model,
      msrp,
      upc: String(row[4] || '').trim()
    });
  }

  console.log('Products to import:', products.length);

  let totalImported = 0;
  let totalUpdated = 0;
  const errors = [];

  for (const product of products) {
    const model = product.model;

    // Determine category from model
    let category = 'TV';
    if (model.includes('Q6') || model.includes('Q7')) category = 'QLED TV';
    else if (model.includes('S4') || model.includes('S3')) category = 'Smart TV';
    else if (model.includes('S5')) category = 'Smart TV';

    // Extract size from model
    let size = '';
    const sizeMatch = model.match(/^(\d{2})/);
    if (sizeMatch) {
      size = sizeMatch[1] + '"';
    }

    // Build description
    const description = `TCL ${size} ${category}`.trim();

    // Parse prices to cents
    const msrpCents = Math.round(product.msrp * 100);
    // Estimate cost at 65% of MSRP
    const costCents = Math.round(product.msrp * 0.65 * 100);

    try {
      const existing = await pool.query(
        'SELECT id FROM products WHERE model = $1',
        [model]
      );

      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE products SET
            msrp_cents = $1,
            cost_cents = $2,
            manufacturer = 'TCL',
            category = $3,
            name = $4,
            description = $5,
            updated_at = NOW()
          WHERE id = $6`,
          [msrpCents, costCents, category, description, description, existing.rows[0].id]
        );
        totalUpdated++;
      } else {
        await pool.query(
          `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, active)
           VALUES ($1, 'TCL', $2, $3, $4, $5, $6, true)`,
          [model, category, description, description, costCents, msrpCents]
        );
        totalImported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('TCL Import Complete');
  console.log('========================================');
  console.log('  New products imported:', totalImported);
  console.log('  Existing products updated:', totalUpdated);
  console.log('  Errors:', errors.length);
  console.log('  NOTE: Cost estimated at 65% of MSRP');

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log('  ', e.model, '-', e.error));
  }

  // Show all imported
  const sample = await pool.query(`
    SELECT model, name, category, cost_cents, msrp_cents
    FROM products
    WHERE manufacturer = 'TCL'
    ORDER BY updated_at DESC
    LIMIT 20
  `);

  console.log('\nTCL products:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model}: Cost=${cost}, MSRP=${msrp} | ${p.category}`);
  });

  // Total count
  const total = await pool.query(`
    SELECT COUNT(*) as count FROM products WHERE manufacturer = 'TCL'
  `);
  console.log('\nTotal TCL products:', total.rows[0].count);

  await pool.end();
}

importTCL().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
