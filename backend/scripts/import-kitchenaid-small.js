/**
 * Import KitchenAid Small Appliances from Promo Calendar Excel
 * Columns: Model, Cost, MSRP, Category
 * Header Row: 3, Data starts Row 4
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

async function importKitchenAid() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/small appliance KitchenAid Promo Calendar - Q1 2026.xlsx';
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets['Sheet 1'];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  console.log('Importing KitchenAid Small Appliances...\n');
  console.log('Total rows in sheet:', data.length);

  // Header is row 3 (index 2): Model, Cost, MSRP, Category
  // Data starts at row 4 (index 3)
  const products = {};

  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    const model = String(row[0]).trim();
    const cost = parseFloat(row[1]) || 0;
    const msrp = parseFloat(row[2]) || 0;
    const category = String(row[3] || 'Small Appliance').trim();

    // Skip invalid rows
    if (!model || model.length < 3 || (cost <= 0 && msrp <= 0)) continue;

    // Only keep first occurrence of each model
    if (!products[model]) {
      products[model] = { model, cost, msrp, category };
    }
  }

  const productList = Object.values(products);
  console.log('Unique products to import:', productList.length);

  let totalImported = 0;
  let totalUpdated = 0;
  const errors = [];

  for (const product of productList) {
    const model = product.model;

    // Format category for KitchenAid
    let category = 'KitchenAid - ' + product.category;

    // Build description
    const description = `KitchenAid ${product.category}`;

    // Parse prices to cents
    const msrpCents = Math.round(product.msrp * 100);
    const costCents = Math.round(product.cost * 100);

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
            manufacturer = 'KITCHENAID',
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
           VALUES ($1, 'KITCHENAID', $2, $3, $4, $5, $6, true)`,
          [model, category, description, description, costCents, msrpCents]
        );
        totalImported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('KitchenAid Small Appliances Import Complete');
  console.log('========================================');
  console.log('  New products imported:', totalImported);
  console.log('  Existing products updated:', totalUpdated);
  console.log('  Errors:', errors.length);

  if (errors.length > 0) {
    console.log('\nFirst 5 errors:');
    errors.slice(0, 5).forEach(e => console.log('  ', e.model, '-', e.error));
  }

  // Show sample by category
  const sample = await pool.query(`
    SELECT model, name, category, cost_cents, msrp_cents
    FROM products
    WHERE manufacturer = 'KITCHENAID'
    ORDER BY category, model
    LIMIT 25
  `);

  console.log('\nSample KitchenAid products:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model}: Cost=${cost}, MSRP=${msrp} | ${p.category}`);
  });

  // Category breakdown
  const categories = await pool.query(`
    SELECT category, COUNT(*) as count
    FROM products
    WHERE manufacturer = 'KITCHENAID'
    GROUP BY category
    ORDER BY count DESC
  `);
  console.log('\nProducts by category:');
  categories.rows.forEach(c => console.log(`  ${c.category}: ${c.count}`));

  // Total count
  const total = await pool.query(`
    SELECT COUNT(*) as count FROM products WHERE manufacturer = 'KITCHENAID'
  `);
  console.log('\nTotal KitchenAid products:', total.rows[0].count);

  await pool.end();
}

importKitchenAid().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
