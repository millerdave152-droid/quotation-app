/**
 * Import Samsung AV (Audio/Video) products from PG-SD Roadmap Excel
 * Structure: Multiple rows per product with different TYPE values
 * Uses Invoice for Cost, MSRP for retail price
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

async function importSamsungAV() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/PG-SD Roadmap 2025-12-19 AV Samsung.xlsx';
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets['PG'];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  console.log('Importing Samsung AV products...\n');
  console.log('Total rows in PG sheet:', data.length);

  // Header is row 5 (index 4)
  const headerRow = data[4];
  console.log('Header row:', headerRow.slice(0, 10));

  // Group rows by SKU and extract price types
  // Check ALL week columns (8 onwards) for pricing
  const products = {};

  for (let i = 5; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[5]) continue;

    const sku = String(row[5]).trim();
    const type = String(row[7] || '').trim();

    if (!products[sku]) {
      products[sku] = {
        upc: String(row[0] || '').trim(),
        category: String(row[1] || '').trim(),
        series: String(row[2] || '').trim(),
        size: String(row[3] || '').trim(),
        year: String(row[4] || '').trim(),
        sku: sku,
        msrp: null,
        invoice: null,
        street: null
      };
    }

    // Check ALL week columns (8 onwards) for pricing - use first valid value found
    for (let col = 8; col < row.length; col++) {
      const priceValue = row[col];
      if (priceValue && typeof priceValue === 'number' && priceValue > 0) {
        if (type === 'MSRP' && !products[sku].msrp) {
          products[sku].msrp = priceValue;
        } else if (type === 'Invoice' && !products[sku].invoice) {
          products[sku].invoice = priceValue;
        } else if (type === 'Street' && !products[sku].street) {
          products[sku].street = priceValue;
        }
        break; // Use first valid price found
      }
    }
  }

  const productList = Object.values(products).filter(p => p.sku && (p.msrp || p.invoice));
  console.log('\nUnique products with pricing:', productList.length);

  let totalImported = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const errors = [];

  for (const product of productList) {
    const model = product.sku;

    // Build category from Category + Series
    const category = [product.category, product.series].filter(Boolean).join(' ') || 'Audio';

    // Build description
    const description = `Samsung ${product.series || ''} ${product.category || ''} ${product.year || ''}`.trim();

    // Parse prices to cents
    const costCents = product.invoice ? Math.round(product.invoice * 100) : null;
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
            manufacturer = 'SAMSUNG',
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
           VALUES ($1, 'SAMSUNG', $2, $3, $4, $5, $6, true)`,
          [model, category, description, description, costCents, msrpCents]
        );
        totalImported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('Samsung AV Import Complete');
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
    WHERE manufacturer = 'SAMSUNG' AND (category LIKE '%Series%' OR category LIKE '%Audio%' OR category LIKE '%Soundbar%' OR model LIKE 'HW-%' OR model LIKE 'SP-%')
    ORDER BY updated_at DESC
    LIMIT 15
  `);

  console.log('\nSample Samsung AV products:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model}: Cost=${cost}, MSRP=${msrp} | ${p.category}`);
  });

  // Total count
  const total = await pool.query(`
    SELECT COUNT(*) as count FROM products WHERE manufacturer = 'SAMSUNG'
  `);
  console.log('\nTotal Samsung products:', total.rows[0].count);

  await pool.end();
}

importSamsungAV().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
