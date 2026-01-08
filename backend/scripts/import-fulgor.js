/**
 * Import Fulgor Milano products with MSRP and cost
 * Uses Promo Dealer Cost if available, otherwise Dealer Cost
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

async function importFulgorProducts() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/20250417_Fulgor Milano_Price List_May 1 2025.xlsx';
  const workbook = XLSX.readFile(path);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  console.log('Importing Fulgor Milano products...\n');

  // Headers at row 4 (index 3)
  const headers = data[3];
  console.log('Headers:', headers.slice(0, 10).filter(h => h).join(', '));

  // Column indices based on the file structure
  const colIndex = {
    model: 0,         // # Modèle / Model #
    category: 2,      // Catégorie de produit / Product Category
    description: 4,   // English Description
    dealerCost: 5,    // Marchand / Dealer
    map: 6,           // MAP
    msrp: 7,          // PDSM / MSRP
    promoCost: 8      // Promo Marchand / Dealer Promo
  };

  console.log('Column indices:', colIndex);

  let totalImported = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const errors = [];

  // Data starts at row 5 (index 4)
  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    const model = row[colIndex.model];
    const category = row[colIndex.category];
    const description = row[colIndex.description];
    const dealerCost = row[colIndex.dealerCost];
    const promoCost = row[colIndex.promoCost];
    const msrp = row[colIndex.msrp];
    const map = row[colIndex.map];

    // Skip empty rows
    if (!model) continue;

    // Use Promo Dealer Cost if available, otherwise use Dealer Cost
    const cost = promoCost || dealerCost;

    // Parse prices (convert to cents)
    const parseCents = (val) => {
      if (!val) return null;
      const parsed = parseFloat(String(val).replace(/[$,]/g, ''));
      return !isNaN(parsed) && parsed > 0 ? Math.round(parsed * 100) : null;
    };

    const costCents = parseCents(cost);
    const msrpCents = parseCents(msrp);
    const mapCents = parseCents(map);

    if (!costCents && !msrpCents) {
      totalSkipped++;
      continue;
    }

    // Build category string
    const fullCategory = category ? `Fulgor Milano - ${category}` : 'Fulgor Milano';

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
            map_price_cents = $7,
            updated_at = NOW()
          WHERE id = $8`,
          [msrpCents || 0, costCents || 0, 'FULGOR MILANO', fullCategory, description, description, mapCents || 0, existing.rows[0].id]
        );
        totalUpdated++;
      } else {
        // Insert new product
        await pool.query(
          `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, map_price_cents, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
          [model, 'FULGOR MILANO', fullCategory, description, description, costCents, msrpCents, mapCents]
        );
        totalImported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('Fulgor Milano Import Complete');
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
    WHERE manufacturer = 'FULGOR MILANO'
    ORDER BY updated_at DESC
    LIMIT 15
  `);

  console.log('\nSample Fulgor Milano products:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model} - Cost: ${cost}, MSRP: ${msrp}`);
  });

  // Get total count
  const total = await pool.query(`
    SELECT COUNT(*) as count FROM products WHERE manufacturer = 'FULGOR MILANO'
  `);
  console.log('\nTotal Fulgor Milano products:', total.rows[0].count);

  await pool.end();
}

importFulgorProducts().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
