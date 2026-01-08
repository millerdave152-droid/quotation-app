/**
 * Import Whirlpool/Maytag/KitchenAid/Amana products with MSRP
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

// Map sheet names to manufacturer names
const SHEET_TO_MANUFACTURER = {
  'WHR': 'WHIRLPOOL',
  'MAY': 'MAYTAG',
  'KAD': 'KITCHENAID',
  'AMA': 'AMANA',
  'GDR': 'GLADIATOR',
  'EDR': 'EVERYDROP'
};

async function importWhirlpoolProducts() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/Independent December Boxing Week 2025 - All Brands.xlsx';
  const workbook = XLSX.readFile(path);

  let totalImported = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const errors = [];
  const brandCounts = {};

  // Process each sheet
  for (const sheetName of workbook.SheetNames) {
    const manufacturer = SHEET_TO_MANUFACTURER[sheetName] || sheetName;
    console.log(`\nProcessing sheet: ${sheetName} (${manufacturer})`);

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Headers at row 5 (index 4)
    const headers = data[4];
    const dataRows = data.slice(5); // Data starts at row 6

    // Find column indices
    const colIndex = {
      brand: headers.indexOf('BRAND'),
      model: headers.indexOf('MODEL'),
      msrp: headers.indexOf('MSRP'),
      cost: headers.indexOf('40+ UNITS'),
      sellThrough: headers.indexOf('SELL THROUGH'),
      category: headers.indexOf('CATEGORY STAGING'),
      subcategory: headers.indexOf('SUBCATEGORY STAGING'),
      detail: headers.indexOf('DETAIL STAGING')
    };

    let sheetImported = 0;
    let sheetUpdated = 0;

    for (const row of dataRows) {
      const model = row[colIndex.model];
      const brand = row[colIndex.brand] || manufacturer;
      const msrp = row[colIndex.msrp];
      const cost = row[colIndex.cost];
      const sellThrough = row[colIndex.sellThrough];
      const category = row[colIndex.category];
      const subcategory = row[colIndex.subcategory];
      const detail = row[colIndex.detail];

      // Skip empty rows
      if (!model || typeof model !== 'string' || model === 'MODEL') continue;

      // Parse prices
      const parseCents = (val) => {
        if (!val) return null;
        const parsed = parseFloat(String(val).replace(/[$,]/g, ''));
        return !isNaN(parsed) && parsed > 0 ? Math.round(parsed * 100) : null;
      };

      const msrpCents = parseCents(msrp);
      let costCents = parseCents(cost);
      const sellThroughCents = parseCents(sellThrough);

      // Subtract SELL THROUGH rebate from cost to get actual cost
      if (costCents && sellThroughCents) {
        costCents = costCents - sellThroughCents;
      }

      if (!msrpCents && !costCents) {
        totalSkipped++;
        continue;
      }

      // Build category string
      const fullCategory = [category, subcategory, detail].filter(c => c).join(' - ') || 'Uncategorized';

      // Normalize brand
      const normalizedBrand = (brand === 'UNB' ? manufacturer : brand).toString().trim().toUpperCase();
      brandCounts[normalizedBrand] = (brandCounts[normalizedBrand] || 0) + 1;

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
              manufacturer = COALESCE($3, manufacturer),
              category = COALESCE($4, category),
              updated_at = NOW()
            WHERE id = $5`,
            [msrpCents, costCents, normalizedBrand, fullCategory, existing.rows[0].id]
          );
          sheetUpdated++;
          totalUpdated++;
        } else {
          // Insert new product
          await pool.query(
            `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
            [model, normalizedBrand, fullCategory, detail || model, detail || model, costCents, msrpCents]
          );
          sheetImported++;
          totalImported++;
        }
      } catch (err) {
        errors.push({ model, sheet: sheetName, error: err.message });
      }
    }

    console.log(`  Imported: ${sheetImported}, Updated: ${sheetUpdated}`);
  }

  console.log('\n========================================');
  console.log('Whirlpool Family Import Complete');
  console.log('========================================');
  console.log('  New products imported:', totalImported);
  console.log('  Existing products updated:', totalUpdated);
  console.log('  Skipped (no price):', totalSkipped);
  console.log('  Errors:', errors.length);

  console.log('\nProducts by brand:');
  Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).forEach(([brand, count]) => {
    console.log('  ', brand + ':', count);
  });

  if (errors.length > 0) {
    console.log('\nSample errors:');
    errors.slice(0, 5).forEach(e => console.log('  ', e.model, '(' + e.sheet + ') -', e.error));
  }

  // Show sample products
  const sample = await pool.query(`
    SELECT model, manufacturer, category, cost_cents, msrp_cents
    FROM products
    WHERE manufacturer IN ('WHIRLPOOL', 'MAYTAG', 'KITCHENAID', 'AMANA')
    AND msrp_cents > 0
    ORDER BY updated_at DESC
    LIMIT 15
  `);
  console.log('\nSample products with MSRP:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log('  ', p.model, '(' + p.manufacturer + ') - Cost:', cost, 'MSRP:', msrp);
  });

  // Get total counts
  const totals = await pool.query(`
    SELECT manufacturer, COUNT(*) as count, COUNT(CASE WHEN msrp_cents > 0 THEN 1 END) as with_msrp
    FROM products
    WHERE manufacturer IN ('WHIRLPOOL', 'MAYTAG', 'KITCHENAID', 'AMANA', 'GLADIATOR', 'EVERYDROP')
    GROUP BY manufacturer
    ORDER BY count DESC
  `);
  console.log('\nTotal products by brand:');
  totals.rows.forEach(r => console.log('  ', r.manufacturer + ':', r.count, '(with MSRP:', r.with_msrp + ')'));

  await pool.end();
}

importWhirlpoolProducts().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
