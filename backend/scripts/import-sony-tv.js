/**
 * Import Sony TV products from Promo Loadsheet Excel
 * Uses Selling Price for MSRP, Selling Price after IR for reference
 * Note: Dealer cost not available in this file - using estimated margin
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

async function importSonyTV() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/PROMO_CA_HES-TV_Fulfillment Distribution_WK50_2025_12-16-2025 Sony.xlsx';
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets['Loadsheet - Direct'];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  console.log('Importing Sony TV products...\n');
  console.log('Total rows in sheet:', data.length);

  // Header is row 7 (index 6)
  const headerRow = data[6];
  console.log('Header row:', headerRow);

  // Get unique models with pricing
  const products = {};

  for (let i = 7; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[4]) continue;

    const model = String(row[4]).trim();
    const priceType = String(row[5] || '').trim();
    const sellingPrice = parseFloat(row[6]) || 0;
    const instantRebate = parseFloat(row[7]) || 0;
    const sellingAfterIR = parseFloat(row[9]) || sellingPrice;

    // Skip empty models
    if (!model || model.length < 3 || sellingPrice <= 0) continue;

    // Only use first occurrence (latest week data)
    if (!products[model]) {
      products[model] = {
        model,
        priceType,
        msrp: sellingPrice,
        streetPrice: sellingAfterIR,
        instantRebate
      };
    }
  }

  const productList = Object.values(products);
  console.log('\nUnique products:', productList.length);

  let totalImported = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const errors = [];

  for (const product of productList) {
    const model = product.model;

    // Determine category from model prefix
    let category = 'TV';
    if (model.startsWith('VPL')) category = 'Projector';
    else if (model.startsWith('LMP')) category = 'Projector Lamp';
    else if (model.includes('A90') || model.includes('A80') || model.includes('A75')) category = 'BRAVIA XR OLED TV';
    else if (model.includes('XR') || model.includes('X90') || model.includes('X85')) category = 'BRAVIA XR LED TV';
    else if (model.startsWith('K') || model.startsWith('XR')) category = 'BRAVIA TV';
    else if (model.startsWith('KD')) category = 'BRAVIA 4K TV';

    // Extract size from model
    let size = '';
    const sizeMatch = model.match(/(\d{2})/);
    if (sizeMatch && parseInt(sizeMatch[1]) >= 32 && parseInt(sizeMatch[1]) <= 98) {
      size = sizeMatch[1] + '"';
    }

    // Build description
    const description = `Sony ${size} ${category}`.trim();

    // Parse prices to cents
    const msrpCents = Math.round(product.msrp * 100);
    // Estimate dealer cost at ~70% of MSRP (typical for Sony)
    const estimatedCostCents = Math.round(product.msrp * 0.70 * 100);

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
            manufacturer = 'SONY',
            category = $3,
            name = $4,
            description = $5,
            updated_at = NOW()
          WHERE id = $6`,
          [msrpCents, estimatedCostCents, category, description, description, existing.rows[0].id]
        );
        totalUpdated++;
      } else {
        await pool.query(
          `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, active)
           VALUES ($1, 'SONY', $2, $3, $4, $5, $6, true)`,
          [model, category, description, description, estimatedCostCents, msrpCents]
        );
        totalImported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('Sony TV Import Complete');
  console.log('========================================');
  console.log('  New products imported:', totalImported);
  console.log('  Existing products updated:', totalUpdated);
  console.log('  Skipped:', totalSkipped);
  console.log('  Errors:', errors.length);
  console.log('  NOTE: Cost estimated at 70% of MSRP');

  if (errors.length > 0) {
    console.log('\nFirst 5 errors:');
    errors.slice(0, 5).forEach(e => console.log('  ', e.model, '-', e.error));
  }

  // Show sample
  const sample = await pool.query(`
    SELECT model, name, category, cost_cents, msrp_cents
    FROM products
    WHERE manufacturer = 'SONY'
    ORDER BY updated_at DESC
    LIMIT 15
  `);

  console.log('\nSample Sony products:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model}: Cost=${cost}, MSRP=${msrp} | ${p.category}`);
  });

  // Total count
  const total = await pool.query(`
    SELECT COUNT(*) as count FROM products WHERE manufacturer = 'SONY'
  `);
  console.log('\nTotal Sony products:', total.rows[0].count);

  await pool.end();
}

importSonyTV().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
