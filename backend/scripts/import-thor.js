/**
 * Import Thor Kitchen products with MSRP and cost
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

async function importThorProducts() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/Thor Thanksgiving Promo Oct 5-15 2025.xlsx';
  const workbook = XLSX.readFile(path);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  console.log('Importing Thor Kitchen products...\n');

  // Headers at row 5 (index 4)
  const headers = data[4];
  console.log('Headers:', headers.filter(h => h).join(', '));

  // Find column indices
  const colIndex = {
    model: headers.findIndex(h => h && h.toString().toUpperCase().includes('MODEL')),
    colour: headers.findIndex(h => h && h.toString().toUpperCase().includes('COLOUR')),
    description: headers.findIndex(h => h && h.toString().toUpperCase().includes('DESCRIPTION')),
    cost: headers.findIndex(h => h && h.toString().toUpperCase() === 'DEALER COST'),
    msrp: headers.findIndex(h => h && h.toString().toUpperCase() === 'MSRP'),
    promoCost: headers.findIndex(h => h && h.toString().toUpperCase().includes('PROMO DEALER'))
  };

  console.log('Column indices:', colIndex);

  let totalImported = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let currentCategory = '';
  const errors = [];

  // Data starts at row 7 (index 6), but row 6 (index 5) might be category
  for (let i = 5; i < data.length; i++) {
    const row = data[i];
    const model = row[colIndex.model];
    const description = row[colIndex.description];
    const colour = row[colIndex.colour];
    const dealerCost = row[colIndex.cost];
    const promoCost = row[colIndex.promoCost];
    const msrp = row[colIndex.msrp];

    // Use Promo Dealer Cost if available, otherwise use Dealer Cost
    const cost = promoCost || dealerCost;

    // Skip empty rows
    if (!model) continue;

    // Check if this is a category header (no price data)
    if (!cost && !msrp) {
      currentCategory = model;
      console.log(`\nCategory: ${currentCategory}`);
      continue;
    }

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

    // Build full name with colour
    const fullName = colour ? `${description} (${colour})` : description;
    const fullCategory = currentCategory ? `Thor Kitchen - ${currentCategory}` : 'Thor Kitchen';

    try {
      // Check if product exists
      const existing = await pool.query(
        'SELECT id FROM products WHERE model = $1',
        [model]
      );

      if (existing.rows.length > 0) {
        // Update existing product - always update cost and msrp when we have values
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
          [msrpCents || 0, costCents || 0, 'THOR KITCHEN', fullCategory, fullName, fullName, existing.rows[0].id]
        );
        totalUpdated++;
      } else {
        // Insert new product
        await pool.query(
          `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
          [model, 'THOR KITCHEN', fullCategory, fullName, fullName, costCents, msrpCents]
        );
        totalImported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('Thor Kitchen Import Complete');
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
    WHERE manufacturer = 'THOR KITCHEN'
    ORDER BY updated_at DESC
    LIMIT 15
  `);

  console.log('\nSample Thor Kitchen products:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model} - Cost: ${cost}, MSRP: ${msrp}`);
  });

  // Get total count
  const total = await pool.query(`
    SELECT COUNT(*) as count FROM products WHERE manufacturer = 'THOR KITCHEN'
  `);
  console.log('\nTotal Thor Kitchen products:', total.rows[0].count);

  await pool.end();
}

importThorProducts().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
