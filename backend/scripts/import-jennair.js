/**
 * Import ONLY Jenn-Air products from extracted Excel
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

async function importJennAirProducts() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/JENN-AIR_extracted.xlsx';
  const workbook = XLSX.readFile(path);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);

  console.log('Importing JENN-AIR products ONLY...\n');
  console.log('Total rows in file:', data.length);

  // Filter for Jenn-Air only
  const jennAirRows = data.filter(row => {
    const brand = (row['Brand'] || '').toUpperCase();
    return brand === 'JENN-AIR' || brand === 'JEN';
  });

  console.log('Jenn-Air products found:', jennAirRows.length);

  let totalImported = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const errors = [];

  for (const row of jennAirRows) {
    const model = row['Model'];
    const category = row['Main Category'] || '';
    const subcategory = row['Subcategory'] || '';
    const type = row['Type'] || '';
    const cost = row['Cost'];
    const msrp = row['MSRP'];
    const colour = row['Colour'] || '';

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

    const costCents = parseCents(cost);
    const msrpCents = parseCents(msrp);

    if (!costCents && !msrpCents) {
      totalSkipped++;
      continue;
    }

    // Build category and description
    const fullCategory = [category, subcategory, type].filter(Boolean).join(' - ') || 'Jenn-Air';
    const description = [subcategory, type, colour].filter(Boolean).join(' - ');

    // Truncate long fields
    const truncate = (str, maxLen) => {
      if (!str) return '';
      return str.length > maxLen ? str.substring(0, maxLen - 3) + '...' : str;
    };

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
            manufacturer = $3,
            category = $4,
            name = $5,
            description = $6,
            updated_at = NOW()
          WHERE id = $7`,
          [msrpCents || 0, costCents || 0, 'JENN-AIR', truncate(fullCategory, 255), truncate(description, 450), truncate(description, 500), existing.rows[0].id]
        );
        totalUpdated++;
      } else {
        await pool.query(
          `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
          [model, 'JENN-AIR', truncate(fullCategory, 255), truncate(description, 450), truncate(description, 500), costCents, msrpCents]
        );
        totalImported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('Jenn-Air Import Complete');
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
    SELECT model, name, category, cost_cents, msrp_cents
    FROM products
    WHERE manufacturer = 'JENN-AIR'
    ORDER BY updated_at DESC
    LIMIT 15
  `);

  console.log('\nSample Jenn-Air products:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model}: Cost=${cost}, MSRP=${msrp}`);
  });

  // Total count
  const total = await pool.query(`
    SELECT COUNT(*) as count FROM products WHERE manufacturer = 'JENN-AIR'
  `);
  console.log('\nTotal Jenn-Air products:', total.rows[0].count);

  await pool.end();
}

importJennAirProducts().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
