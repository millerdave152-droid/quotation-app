/**
 * Import Hisense TV products from Key Account RM Excel
 * Combines cost data from "20251024 Cost Down Models" sheet
 * and MAP prices from "MAP only" sheet
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

async function importHisenseTV() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/Dec 02__2025__Key__Account__RM-Hisense__TV (1).xlsx';
  const workbook = XLSX.readFile(path);

  console.log('Importing Hisense TV products...\n');

  // Get cost data from Cost Down sheets
  const costs = {};

  // Latest cost down sheet
  const costSheet1 = workbook.Sheets['20251024 Cost Down Models'];
  if (costSheet1) {
    const costData1 = XLSX.utils.sheet_to_json(costSheet1, { header: 1 });
    for (let i = 1; i < costData1.length; i++) {
      const row = costData1[i];
      if (row && row[0]) {
        costs[row[0]] = parseFloat(row[2]) || parseFloat(row[1]) || 0;
      }
    }
  }

  // Earlier cost down sheet (for models not in latest)
  const costSheet2 = workbook.Sheets['20250829 Cost Down Models'];
  if (costSheet2) {
    const costData2 = XLSX.utils.sheet_to_json(costSheet2, { header: 1 });
    for (let i = 1; i < costData2.length; i++) {
      const row = costData2[i];
      if (row && row[0] && !costs[row[0]]) {
        costs[row[0]] = parseFloat(row[2]) || parseFloat(row[1]) || 0;
      }
    }
  }

  console.log('Models with cost data:', Object.keys(costs).length);

  // Get MAP data from MAP only sheet
  const mapSheet = workbook.Sheets['MAP only'];
  const mapData = XLSX.utils.sheet_to_json(mapSheet, { header: 1 });

  const products = {};

  for (let i = 2; i < mapData.length; i++) {
    const row = mapData[i];
    if (!row || !row[0]) continue;

    const model = String(row[0]).trim();

    // Get latest MAP price (last non-empty column)
    let mapPrice = 0;
    for (let c = row.length - 1; c >= 1; c--) {
      if (row[c] && typeof row[c] === 'number') {
        mapPrice = row[c];
        break;
      }
    }

    if (model && mapPrice > 0) {
      products[model] = {
        model,
        mapPrice,
        cost: costs[model] || Math.round(mapPrice * 0.65) // Estimate 65% if no cost data
      };
    }
  }

  console.log('Total products to import:', Object.keys(products).length);

  let totalImported = 0;
  let totalUpdated = 0;
  const errors = [];

  for (const product of Object.values(products)) {
    const model = product.model;

    // Determine category from model
    let category = 'TV';
    if (model.includes('OLED') || model.includes('A9')) category = 'OLED TV';
    else if (model.includes('U8') || model.includes('S7')) category = 'ULED TV';
    else if (model.includes('U7') || model.includes('U6')) category = 'ULED TV';
    else if (model.includes('QD')) category = 'QLED TV';
    else if (model.includes('A6') || model.includes('A4')) category = 'LED TV';

    // Extract size from model
    let size = '';
    const sizeMatch = model.match(/^(\d{2})/);
    if (sizeMatch) {
      size = sizeMatch[1] + '"';
    }

    // Build description
    const description = `Hisense ${size} ${category}`.trim();

    // Parse prices to cents
    const msrpCents = Math.round(product.mapPrice * 100);
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
            manufacturer = 'HISENSE',
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
           VALUES ($1, 'HISENSE', $2, $3, $4, $5, $6, true)`,
          [model, category, description, description, costCents, msrpCents]
        );
        totalImported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('Hisense TV Import Complete');
  console.log('========================================');
  console.log('  New products imported:', totalImported);
  console.log('  Existing products updated:', totalUpdated);
  console.log('  Errors:', errors.length);

  if (errors.length > 0) {
    console.log('\nFirst 5 errors:');
    errors.slice(0, 5).forEach(e => console.log('  ', e.model, '-', e.error));
  }

  // Show sample
  const sample = await pool.query(`
    SELECT model, name, category, cost_cents, msrp_cents
    FROM products
    WHERE manufacturer = 'HISENSE' AND category LIKE '%TV%'
    ORDER BY updated_at DESC
    LIMIT 15
  `);

  console.log('\nSample Hisense TV products:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model}: Cost=${cost}, MSRP=${msrp} | ${p.category}`);
  });

  // Total count
  const total = await pool.query(`
    SELECT COUNT(*) as count FROM products WHERE manufacturer = 'HISENSE'
  `);
  console.log('\nTotal Hisense products:', total.rows[0].count);

  await pool.end();
}

importHisenseTV().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
