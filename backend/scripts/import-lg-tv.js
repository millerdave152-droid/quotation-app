/**
 * Import LG TV products from Sales Planner Excel
 * Structure: Multiple rows per product with different Values types
 * Uses Cost (Invoice Price) for Cost, GOTO Price (MAP) for MSRP
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

async function importLGTV() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/20251218 - PG - Sales Planner LG TV.xlsx';
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets['Regional STA (TV. Audio)'];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  console.log('Importing LG TV products...\n');
  console.log('Total rows in sheet:', data.length);

  // Header is row 24 (index 23): Division, Model, Values, [Week columns]
  const headerRow = data[23];
  console.log('Header row:', headerRow ? headerRow.slice(0, 10) : 'Not found');

  // Group rows by Model and extract price types
  const products = {};

  for (let i = 24; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[2]) continue;

    const division = String(row[1] || '').trim();
    const model = String(row[2]).trim();
    const valueType = String(row[3] || '').trim();

    // Skip non-product rows
    if (!model || model === 'Model' || model.length < 3) continue;

    if (!products[model]) {
      products[model] = {
        division: division,
        model: model,
        cost: null,
        msrp: null
      };
    }

    // Check ALL week columns (4 onwards) for pricing - use first valid value found
    for (let col = 4; col < row.length; col++) {
      const priceValue = row[col];
      if (priceValue && typeof priceValue === 'number' && priceValue > 0) {
        if (valueType === 'Cost (Invoice Price)' && !products[model].cost) {
          products[model].cost = priceValue;
        } else if (valueType === 'GOTO Price (MAP)' && !products[model].msrp) {
          products[model].msrp = priceValue;
        }
        break;
      }
    }
  }

  const productList = Object.values(products).filter(p => p.model && (p.msrp || p.cost));
  console.log('\nUnique products with pricing:', productList.length);

  let totalImported = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const errors = [];

  for (const product of productList) {
    const model = product.model;

    // Determine category from model prefix and division
    let category = 'TV';
    if (model.includes('OLED')) category = 'OLED TV';
    else if (model.includes('QNED')) category = 'QNED TV';
    else if (model.includes('NANO')) category = 'NanoCell TV';
    else if (model.includes('LX')) category = 'OLED TV';
    else if (model.includes('ART')) category = 'StanbyME';
    else if (product.division === 'LTV') category = 'TV';

    // Extract size from model (first 2-3 digits)
    const sizeMatch = model.match(/^(\d{2,3})/);
    const size = sizeMatch ? sizeMatch[1] + '"' : '';

    // Build description
    const description = `LG ${size} ${category}`.trim();

    // Parse prices to cents
    const costCents = product.cost ? Math.round(product.cost * 100) : null;
    const msrpCents = product.msrp ? Math.round(product.msrp * 100) : null;

    if (!costCents && !msrpCents) {
      totalSkipped++;
      continue;
    }

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
            manufacturer = 'LG',
            category = $3,
            name = $4,
            description = $5,
            updated_at = NOW()
          WHERE id = $6`,
          [msrpCents || 0, costCents || 0, category, description, description, existing.rows[0].id]
        );
        totalUpdated++;
      } else {
        await pool.query(
          `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, active)
           VALUES ($1, 'LG', $2, $3, $4, $5, $6, true)`,
          [model, category, description, description, costCents, msrpCents]
        );
        totalImported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('LG TV Import Complete');
  console.log('========================================');
  console.log('  New products imported:', totalImported);
  console.log('  Existing products updated:', totalUpdated);
  console.log('  Skipped (no pricing):', totalSkipped);
  console.log('  Errors:', errors.length);

  if (errors.length > 0) {
    console.log('\nFirst 5 errors:');
    errors.slice(0, 5).forEach(e => console.log('  ', e.model, '-', e.error));
  }

  // Show sample
  const sample = await pool.query(`
    SELECT model, name, category, cost_cents, msrp_cents
    FROM products
    WHERE manufacturer = 'LG' AND (category LIKE '%TV%' OR category LIKE '%OLED%' OR category LIKE '%QNED%')
    ORDER BY updated_at DESC
    LIMIT 15
  `);

  console.log('\nSample LG TV products:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model}: Cost=${cost}, MSRP=${msrp} | ${p.category}`);
  });

  // Total count
  const total = await pool.query(`
    SELECT COUNT(*) as count FROM products WHERE manufacturer = 'LG'
  `);
  console.log('\nTotal LG products:', total.rows[0].count);

  await pool.end();
}

importLGTV().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
