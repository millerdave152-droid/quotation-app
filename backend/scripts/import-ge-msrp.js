/**
 * Import GE/Café/Haier products with MSRP from price list
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

async function importGEProducts() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/Independent Price List Dec 11 Jan 07 (English version) (1).xlsx';
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // Parse with header row 7 (0-indexed = 6)
  const data = XLSX.utils.sheet_to_json(sheet, { range: 6 });

  console.log('Parsed', data.length, 'rows from GE price list');
  console.log('Sample row:', JSON.stringify(data[0], null, 2));

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];
  const brandCounts = {};

  for (const row of data) {
    // Handle columns with spaces (GE file has " MSRP " instead of "MSRP")
    const getVal = (keys) => {
      for (const key of keys) {
        if (row[key] !== undefined && row[key] !== '') return row[key];
        if (row[' ' + key + ' '] !== undefined && row[' ' + key + ' '] !== '') return row[' ' + key + ' '];
        if (row[key + ' '] !== undefined && row[key + ' '] !== '') return row[key + ' '];
        if (row[' ' + key] !== undefined && row[' ' + key] !== '') return row[' ' + key];
      }
      return null;
    };

    const model = row['MATERIAL'];
    const brand = row['BRAND'] || 'GE';
    const msrp = getVal(['MSRP']);
    const cost = getVal(['DEALER COST', 'REGULAR COST']);
    const promoCost = getVal(['PROMO COST']);
    const mapPrice = getVal(['MAP']);
    const description = row['DESCRIPTION'];
    const category = row['MG DESC'] || row['MG4 DESC'];
    const color = row['COLOR'];

    // Skip header rows or empty rows
    if (!model || model === 'MATERIAL' || typeof model !== 'string') continue;

    // Track brand counts
    brandCounts[brand] = (brandCounts[brand] || 0) + 1;

    // Parse prices
    const parseCents = (val) => {
      if (!val) return null;
      const parsed = parseFloat(String(val).replace(/[$,]/g, ''));
      return !isNaN(parsed) && parsed > 0 ? Math.round(parsed * 100) : null;
    };

    const msrpCents = parseCents(msrp);
    const costCents = parseCents(cost);
    const promoCostCents = parseCents(promoCost);
    const mapCents = parseCents(mapPrice);

    if (!msrpCents && !costCents) {
      skipped++;
      continue;
    }

    // Normalize brand name
    const normalizedBrand = brand.toString().trim().toUpperCase();

    try {
      // Check if product exists
      const existing = await pool.query(
        'SELECT id FROM products WHERE model = $1',
        [model]
      );

      if (existing.rows.length > 0) {
        // Update existing product
        await pool.query(
          `UPDATE products SET
            msrp_cents = COALESCE($1, msrp_cents),
            cost_cents = COALESCE($2, cost_cents),
            promo_cost_cents = COALESCE($3, promo_cost_cents),
            map_price_cents = COALESCE($4, map_price_cents),
            manufacturer = COALESCE($5, manufacturer),
            category = COALESCE($6, category),
            description = COALESCE($7, description),
            name = COALESCE($7, name),
            color = COALESCE($8, color),
            updated_at = NOW()
          WHERE id = $9`,
          [msrpCents, costCents, promoCostCents, mapCents, normalizedBrand, category, description, color, existing.rows[0].id]
        );
        updated++;
      } else {
        // Insert new product
        await pool.query(
          `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, promo_cost_cents, map_price_cents, color, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)`,
          [model, normalizedBrand, category, description, description, costCents, msrpCents, promoCostCents, mapCents, color]
        );
        imported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('GE Products Import Complete');
  console.log('========================================');
  console.log('  New products imported:', imported);
  console.log('  Existing products updated:', updated);
  console.log('  Skipped (no price):', skipped);
  console.log('  Errors:', errors.length);

  console.log('\nProducts by brand:');
  Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).forEach(([brand, count]) => {
    console.log('  ', brand + ':', count);
  });

  if (errors.length > 0) {
    console.log('\nSample errors:');
    errors.slice(0, 5).forEach(e => console.log('  ', e.model, '-', e.error));
  }

  // Show sample of products
  const sample = await pool.query(`
    SELECT model, manufacturer, category, cost_cents, msrp_cents
    FROM products
    WHERE manufacturer IN ('GE', 'CAFÉ', 'CAFE', 'GE PROFILE', 'HAIER', 'HOTPOINT', 'MONOGRAM')
    AND msrp_cents > 0
    LIMIT 15
  `);
  console.log('\nSample GE/Café products with MSRP:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log('  ', p.model, '(' + p.manufacturer + ' - ' + p.category + ') - Cost:', cost, 'MSRP:', msrp);
  });

  // Get total counts
  const totals = await pool.query(`
    SELECT manufacturer, COUNT(*) as count, COUNT(CASE WHEN msrp_cents > 0 THEN 1 END) as with_msrp
    FROM products
    WHERE manufacturer IN ('GE', 'CAFÉ', 'CAFE', 'GE PROFILE', 'HAIER', 'HOTPOINT', 'MONOGRAM')
    GROUP BY manufacturer
  `);
  console.log('\nTotal products by brand:');
  totals.rows.forEach(r => console.log('  ', r.manufacturer + ':', r.count, '(with MSRP:', r.with_msrp + ')'));

  await pool.end();
}

importGEProducts().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
