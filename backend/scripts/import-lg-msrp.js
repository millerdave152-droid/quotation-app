/**
 * Import LG products with MSRP from price list
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

async function importLGProducts() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/English Indy_Jan 8 - Apr 1 EDLC 1215 (1).xlsx';
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // Parse with header row 5 (0-indexed = 4)
  const data = XLSX.utils.sheet_to_json(sheet, { range: 4 });

  console.log('Parsed', data.length, 'rows from LG price list');
  console.log('Sample row:', JSON.stringify(data[0], null, 2));

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const row of data) {
    const model = row['Model:'] || row['Model + Suffix:'];
    const msrp = row['MSRP'];
    const cost = row['Q1 Cost'] || row['Regular'];
    const description = row['Short Description:'] || row['DESCRIPTION'];
    const category = row['Division:'];
    const color = row['Colour:'];

    // Skip header rows or empty rows
    if (!model || model === 'Model:' || typeof model !== 'string') continue;

    // Parse MSRP
    let msrpCents = null;
    if (msrp) {
      const parsed = parseFloat(String(msrp).replace(/[$,]/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        msrpCents = Math.round(parsed * 100);
      }
    }

    // Parse Cost
    let costCents = null;
    if (cost) {
      const parsed = parseFloat(String(cost).replace(/[$,]/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        costCents = Math.round(parsed * 100);
      }
    }

    if (!msrpCents && !costCents) {
      skipped++;
      continue;
    }

    try {
      // Check if product exists
      const existing = await pool.query(
        'SELECT id FROM products WHERE model = $1 AND UPPER(manufacturer) = $2',
        [model, 'LG']
      );

      if (existing.rows.length > 0) {
        // Update existing product
        await pool.query(
          `UPDATE products SET
            msrp_cents = COALESCE($1, msrp_cents),
            cost_cents = COALESCE($2, cost_cents),
            category = COALESCE($3, category),
            description = COALESCE($4, description),
            name = COALESCE($4, name),
            color = COALESCE($5, color),
            updated_at = NOW()
          WHERE id = $6`,
          [msrpCents, costCents, category, description, color, existing.rows[0].id]
        );
        updated++;
      } else {
        // Insert new product
        await pool.query(
          `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, color, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
          [model, 'LG', category, description, description, costCents, msrpCents, color]
        );
        imported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('LG Products Import Complete');
  console.log('========================================');
  console.log('  New products imported:', imported);
  console.log('  Existing products updated:', updated);
  console.log('  Skipped (no price):', skipped);
  console.log('  Errors:', errors.length);

  if (errors.length > 0) {
    console.log('\nSample errors:');
    errors.slice(0, 5).forEach(e => console.log('  ', e.model, '-', e.error));
  }

  // Show sample of products
  const sample = await pool.query(
    "SELECT model, category, cost_cents, msrp_cents FROM products WHERE UPPER(manufacturer) = 'LG' AND msrp_cents > 0 LIMIT 15"
  );
  console.log('\nSample LG products with MSRP:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log('  ', p.model, '(' + p.category + ') - Cost:', cost, 'MSRP:', msrp);
  });

  // Get total count
  const total = await pool.query("SELECT COUNT(*) as count FROM products WHERE UPPER(manufacturer) = 'LG'");
  const withMsrp = await pool.query("SELECT COUNT(*) as count FROM products WHERE UPPER(manufacturer) = 'LG' AND msrp_cents > 0");
  console.log('\nTotal LG products:', total.rows[0].count);
  console.log('With MSRP:', withMsrp.rows[0].count);

  await pool.end();
}

importLGProducts().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
