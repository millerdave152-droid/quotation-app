/**
 * Import Hisense products from Teletime Roadmap
 * Uses Previous MSRP and Invoiced Cost
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

async function importHisenseProducts() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/TELTEIME HISENSE- ROAD MAP 2026.xlsx';
  const workbook = XLSX.readFile(path);

  console.log('Importing Hisense products...\n');
  console.log('Sheets found:', workbook.SheetNames.join(', '));

  const sheetName = 'Price List';
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  console.log(`Processing sheet: ${sheetName}`);

  // Headers at row 3 (index 2)
  const colIndex = {
    category: 0,      // Category
    model: 1,         // MODEL
    description: 3,   // DESCRIPTION
    msrp: 4,          // Previous MSRP
    cost: 10          // Invoiced Cost
  };

  let totalImported = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const errors = [];

  // Data starts at row 4 (index 3)
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    let model = row[colIndex.model];
    const category = row[colIndex.category];
    const description = row[colIndex.description];
    const msrp = row[colIndex.msrp];

    // Find Invoiced Cost and STA - actual cost = Invoiced Cost - STA
    // Scan all week columns (Invoiced Cost at col 10, STA at col 11, repeating every 7 cols)
    let invoicedCost = row[10];
    let sta = row[11];

    if (!invoicedCost) {
      for (let c = 10; c < row.length; c += 7) {
        if (row[c] && parseFloat(row[c]) > 0) {
          invoicedCost = row[c];
          sta = row[c + 1] || 0;  // STA is next column
          break;
        }
      }
    }

    // Calculate actual cost = Invoiced Cost - STA
    const invoicedVal = parseFloat(invoicedCost) || 0;
    const staVal = parseFloat(sta) || 0;
    const cost = invoicedVal > 0 ? invoicedVal - staVal : 0;

    // Skip empty rows
    if (!model) continue;

    // Convert model to string and trim
    model = String(model).trim();

    // Parse prices (convert to cents)
    const parseCents = (val) => {
      if (!val) return null;
      const parsed = parseFloat(String(val).replace(/[$,]/g, ''));
      return !isNaN(parsed) && parsed > 0 ? Math.round(parsed * 100) : null;
    };

    const costCents = parseCents(cost);
    const msrpCents = parseCents(msrp);

    if (!costCents && !msrpCents) {
      totalSkipped++;
      continue;
    }

    // Build category string
    const fullCategory = category ? `Hisense - ${category}` : 'Hisense';

    // Truncate long fields
    const truncate = (str, maxLen) => {
      if (!str) return '';
      const s = str.toString().trim();
      return s.length > maxLen ? s.substring(0, maxLen - 3) + '...' : s;
    };

    const productName = truncate(description || model, 450);
    const truncatedDesc = truncate(description, 500);

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
            msrp_cents = $1,
            cost_cents = $2,
            manufacturer = $3,
            category = $4,
            name = $5,
            description = $6,
            updated_at = NOW()
          WHERE id = $7`,
          [msrpCents || 0, costCents || 0, 'HISENSE', fullCategory, productName, truncatedDesc, existing.rows[0].id]
        );
        totalUpdated++;
      } else {
        // Insert new product
        await pool.query(
          `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
          [model, 'HISENSE', fullCategory, productName, truncatedDesc, costCents, msrpCents]
        );
        totalImported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('Hisense Import Complete');
  console.log('========================================');
  console.log('  New products imported:', totalImported);
  console.log('  Existing products updated:', totalUpdated);
  console.log('  Skipped (no price):', totalSkipped);
  console.log('  Errors:', errors.length);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.slice(0, 5).forEach(e => console.log('  ', e.model, '-', e.error));
  }

  // Show sample products
  const sample = await pool.query(`
    SELECT model, name, category, cost_cents, msrp_cents
    FROM products
    WHERE manufacturer = 'HISENSE'
    ORDER BY updated_at DESC
    LIMIT 15
  `);

  console.log('\nSample Hisense products:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model}: Cost=${cost}, MSRP=${msrp}`);
  });

  // Get total count
  const total = await pool.query(`
    SELECT COUNT(*) as count FROM products WHERE manufacturer = 'HISENSE'
  `);
  console.log('\nTotal Hisense products:', total.rows[0].count);

  await pool.end();
}

importHisenseProducts().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
