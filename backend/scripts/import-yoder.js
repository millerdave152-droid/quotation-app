/**
 * Import Yoder Smokers products from Order Form Excel
 * Sheet1: SKU, ITEM, DESCRIPTION, COST, MSRP (Header Row 7)
 * Sheet2: Additional accessories (no header)
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

async function importYoder() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/2024 ORDER FORM - YODER SMOKERS.xlsx';
  const workbook = XLSX.readFile(path);

  console.log('Importing Yoder Smokers products...\n');

  const products = {};
  let currentCategory = 'Smoker';

  // Process Sheet1 (main products)
  const sheet1 = workbook.Sheets['Sheet1'];
  const data1 = XLSX.utils.sheet_to_json(sheet1, { header: 1 });

  console.log('Processing Sheet1...');

  for (let i = 7; i < data1.length; i++) {
    const row = data1[i];
    if (!row || row.length === 0) continue;

    const firstCell = String(row[0] || '').trim();

    // Check if this is a category header row (no SKU pattern, usually all caps)
    if (!row[3] && !row[4] && firstCell && !firstCell.match(/^\d|^[A-Z]\d/)) {
      // Category header row
      if (firstCell.includes('PELLET')) currentCategory = 'Pellet Grill';
      else if (firstCell.includes('OFFSET')) currentCategory = 'Offset Smoker';
      else if (firstCell.includes('ACCESSORY') || firstCell.includes('ACCESSORIES')) currentCategory = 'Accessory';
      else if (firstCell.includes('COVER')) currentCategory = 'Cover';
      else if (firstCell.includes('CHARCOAL')) currentCategory = 'Charcoal Grill';
      continue;
    }

    const sku = firstCell;
    const name = String(row[1] || '').trim();
    const description = String(row[2] || '').trim();
    const cost = row[3];
    const msrp = row[4];

    // Skip invalid rows
    if (!sku || sku.length < 3) continue;
    if (cost === 'CUSTOM' || msrp === 'CUSTOM') continue;
    if (typeof cost !== 'number' || typeof msrp !== 'number') continue;

    products[sku] = {
      model: sku,
      name: name || description,
      description: description || name,
      cost,
      msrp,
      category: currentCategory
    };
  }

  // Process Sheet2 (accessories)
  const sheet2 = workbook.Sheets['Sheet2'];
  if (sheet2) {
    const data2 = XLSX.utils.sheet_to_json(sheet2, { header: 1 });
    console.log('Processing Sheet2 (accessories)...');

    for (const row of data2) {
      if (!row || row.length < 4) continue;

      const sku = String(row[0] || '').trim();
      const name = String(row[1] || '').trim();
      const cost = row[2];
      const msrp = row[3];

      if (!sku || typeof cost !== 'number' || typeof msrp !== 'number') continue;

      products[sku] = {
        model: sku,
        name,
        description: name,
        cost,
        msrp,
        category: 'Accessory'
      };
    }
  }

  const productList = Object.values(products);
  console.log('\nUnique products to import:', productList.length);

  let totalImported = 0;
  let totalUpdated = 0;
  const errors = [];

  for (const product of productList) {
    const model = product.model;

    // Format category
    const category = 'Yoder - ' + product.category;

    // Build description
    const description = product.description || product.name;

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
            manufacturer = 'YODER',
            category = $3,
            name = $4,
            description = $5,
            updated_at = NOW()
          WHERE id = $6`,
          [msrpCents, costCents, category, product.name, description, existing.rows[0].id]
        );
        totalUpdated++;
      } else {
        await pool.query(
          `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, active)
           VALUES ($1, 'YODER', $2, $3, $4, $5, $6, true)`,
          [model, category, product.name, description, costCents, msrpCents]
        );
        totalImported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('Yoder Smokers Import Complete');
  console.log('========================================');
  console.log('  New products imported:', totalImported);
  console.log('  Existing products updated:', totalUpdated);
  console.log('  Errors:', errors.length);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log('  ', e.model, '-', e.error));
  }

  // Show sample
  const sample = await pool.query(`
    SELECT model, name, category, cost_cents, msrp_cents
    FROM products
    WHERE manufacturer = 'YODER'
    ORDER BY category, model
    LIMIT 20
  `);

  console.log('\nYoder products:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model}: Cost=${cost}, MSRP=${msrp} | ${p.category}`);
  });

  // Total count
  const total = await pool.query(`
    SELECT COUNT(*) as count FROM products WHERE manufacturer = 'YODER'
  `);
  console.log('\nTotal Yoder products:', total.rows[0].count);

  await pool.end();
}

importYoder().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
