/**
 * Import Napoleon Electric Fireplaces from Price List Excel
 * Columns: Part ID, Product Full Name, Product Type, Product Series, UPC, MSRP - CA
 * Header Row: 2, Data starts Row 3
 * Note: No dealer cost in file - estimating at 55% of MSRP
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

async function importNapoleonFireplaces() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/Napoleon Fireplaces etc.xlsx';
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets['Sheet1'];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  console.log('Importing Napoleon Electric Fireplaces...\n');
  console.log('Total rows in sheet:', data.length);

  // Header is row 2 (index 1): Part ID, Product Full Name, Product Type, Product Series, UPC, MSRP - CA
  // Data starts at row 3 (index 2)
  const products = {};

  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    const model = String(row[0]).trim();
    const name = String(row[1] || '').trim();
    const productType = String(row[2] || '').trim();
    const series = String(row[3] || '').trim();
    const msrp = parseFloat(row[5]) || 0;

    // Skip invalid rows
    if (!model || model.length < 2 || msrp <= 0) continue;

    // Use Product Type as category, fallback to series
    let category = productType || series || 'Electric Fireplace';

    products[model] = {
      model,
      name,
      msrp,
      category
    };
  }

  const productList = Object.values(products);
  console.log('Unique products to import:', productList.length);

  let totalImported = 0;
  let totalUpdated = 0;
  const errors = [];

  for (const product of productList) {
    const model = product.model;

    // Format category
    const category = 'Napoleon - ' + product.category;

    // Parse prices to cents - estimate cost at 55% of MSRP
    const msrpCents = Math.round(product.msrp * 100);
    const costCents = Math.round(product.msrp * 0.55 * 100);

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
            manufacturer = 'NAPOLEON',
            category = $3,
            name = $4,
            description = $5,
            updated_at = NOW()
          WHERE id = $6`,
          [msrpCents, costCents, category, product.name, product.name, existing.rows[0].id]
        );
        totalUpdated++;
      } else {
        await pool.query(
          `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, active)
           VALUES ($1, 'NAPOLEON', $2, $3, $4, $5, $6, true)`,
          [model, category, product.name, product.name, costCents, msrpCents]
        );
        totalImported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('Napoleon Electric Fireplaces Import Complete');
  console.log('========================================');
  console.log('  New products imported:', totalImported);
  console.log('  Existing products updated:', totalUpdated);
  console.log('  Errors:', errors.length);
  console.log('  NOTE: Cost estimated at 55% of MSRP');

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log('  ', e.model, '-', e.error));
  }

  // Show all products
  const sample = await pool.query(`
    SELECT model, name, category, cost_cents, msrp_cents
    FROM products
    WHERE manufacturer = 'NAPOLEON' AND category LIKE '%Fireplace%'
    ORDER BY model
  `);

  console.log('\nNapoleon Fireplace products:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model}: Cost=${cost}, MSRP=${msrp} | ${p.category}`);
  });

  // Total Napoleon count
  const total = await pool.query(`
    SELECT COUNT(*) as count FROM products WHERE manufacturer = 'NAPOLEON'
  `);
  console.log('\nTotal Napoleon products:', total.rows[0].count);

  await pool.end();
}

importNapoleonFireplaces().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
