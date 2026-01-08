/**
 * Import Vesta products from extracted Excel
 * Manufacturer: VESTA
 * Category: Range Hoods
 * Cost: Wholesale/Cost column
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

async function importVestaProducts() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/VESTA_extracted.xlsx';
  const workbook = XLSX.readFile(path);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);

  console.log('Importing VESTA products...\n');
  console.log('Total rows in file:', data.length);

  let totalImported = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const errors = [];

  for (const row of data) {
    const model = row['Model'];
    const productName = row['Product Name'] || '';
    const size = row['Size'] || '';
    const color = row['Color'] || '';
    const msrp = row['MSRP'];
    const wholesale = row['Wholesale/Cost'];

    if (!model) {
      totalSkipped++;
      continue;
    }

    // Parse prices to cents
    const parseCents = (val) => {
      if (!val) return null;
      const parsed = parseFloat(String(val).replace(/[$,]/g, ''));
      return !isNaN(parsed) && parsed > 0 ? Math.round(parsed * 100) : null;
    };

    const costCents = parseCents(wholesale);
    const msrpCents = parseCents(msrp);

    if (!costCents && !msrpCents) {
      totalSkipped++;
      continue;
    }

    // Build description with product name, size, and color
    const description = [productName, size ? `${size}"` : '', color].filter(Boolean).join(' ');

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
            manufacturer = 'VESTA',
            category = 'Range Hoods',
            name = $3,
            description = $4,
            updated_at = NOW()
          WHERE id = $5`,
          [msrpCents || 0, costCents || 0, description, description, existing.rows[0].id]
        );
        totalUpdated++;
      } else {
        await pool.query(
          `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, active)
           VALUES ($1, 'VESTA', 'Range Hoods', $2, $3, $4, $5, true)`,
          [model, description, description, costCents, msrpCents]
        );
        totalImported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('Vesta Import Complete');
  console.log('========================================');
  console.log('  New products imported:', totalImported);
  console.log('  Existing products updated:', totalUpdated);
  console.log('  Skipped:', totalSkipped);
  console.log('  Errors:', errors.length);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.slice(0, 5).forEach(e => console.log('  ', e.model, '-', e.error));
  }

  // Show sample
  const sample = await pool.query(`
    SELECT model, name, category, manufacturer, cost_cents, msrp_cents
    FROM products
    WHERE manufacturer = 'VESTA'
    ORDER BY updated_at DESC
    LIMIT 15
  `);

  console.log('\nSample Vesta products:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model}: Cost=${cost}, MSRP=${msrp} | ${p.manufacturer} - ${p.category}`);
  });

  // Total count
  const total = await pool.query(`
    SELECT COUNT(*) as count FROM products WHERE manufacturer = 'VESTA'
  `);
  console.log('\nTotal Vesta products:', total.rows[0].count);

  await pool.end();
}

importVestaProducts().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
