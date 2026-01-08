/**
 * Fix manufacturer assignments for Whirlpool family products
 * Assigns manufacturer based on which sheet the model came from
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

// Map sheet names to correct manufacturer
const SHEET_TO_MANUFACTURER = {
  'WHR': 'WHIRLPOOL',
  'MAY': 'MAYTAG',
  'KAD': 'KITCHENAID',
  'AMA': 'AMANA',
  'GDR': 'GLADIATOR',
  'EDR': 'EVERYDROP'
};

async function fixManufacturers() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/Independent December Boxing Week 2025 - All Brands.xlsx';
  const workbook = XLSX.readFile(path);

  console.log('Fixing manufacturer assignments...\n');

  let totalFixed = 0;

  // Process each sheet and collect models
  for (const sheetName of workbook.SheetNames) {
    const correctManufacturer = SHEET_TO_MANUFACTURER[sheetName];
    if (!correctManufacturer) {
      console.log(`Skipping unknown sheet: ${sheetName}`);
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Headers at row 5 (index 4)
    const headers = data[4];
    const modelIdx = headers.indexOf('MODEL');

    if (modelIdx === -1) {
      console.log(`No MODEL column in sheet: ${sheetName}`);
      continue;
    }

    // Get all models from this sheet
    const models = [];
    for (let i = 5; i < data.length; i++) {
      const model = data[i][modelIdx];
      if (model && typeof model === 'string' && model !== 'MODEL') {
        models.push(model);
      }
    }

    console.log(`${sheetName} -> ${correctManufacturer}: ${models.length} models`);

    // Update all products with these models to have the correct manufacturer
    if (models.length > 0) {
      // Update in batches
      const batchSize = 100;
      for (let i = 0; i < models.length; i += batchSize) {
        const batch = models.slice(i, i + batchSize);
        const placeholders = batch.map((_, idx) => `$${idx + 2}`).join(', ');

        const result = await pool.query(
          `UPDATE products SET manufacturer = $1, updated_at = NOW()
           WHERE model IN (${placeholders}) AND manufacturer != $1`,
          [correctManufacturer, ...batch]
        );

        totalFixed += result.rowCount;
      }
    }
  }

  console.log(`\nTotal products fixed: ${totalFixed}`);

  // Show final counts
  const counts = await pool.query(`
    SELECT manufacturer, COUNT(*) as count
    FROM products
    WHERE manufacturer IN ('WHIRLPOOL', 'MAYTAG', 'KITCHENAID', 'AMANA', 'GLADIATOR', 'EVERYDROP')
    GROUP BY manufacturer
    ORDER BY count DESC
  `);

  console.log('\nFinal product counts:');
  counts.rows.forEach(r => {
    console.log(`  ${r.manufacturer}: ${r.count} products`);
  });

  // Verify by showing sample models for each manufacturer
  console.log('\nSample models per manufacturer:');
  for (const mfr of ['WHIRLPOOL', 'MAYTAG', 'KITCHENAID', 'AMANA', 'GLADIATOR', 'EVERYDROP']) {
    const sample = await pool.query(
      `SELECT model FROM products WHERE manufacturer = $1 LIMIT 5`,
      [mfr]
    );
    if (sample.rows.length > 0) {
      console.log(`  ${mfr}: ${sample.rows.map(r => r.model).join(', ')}`);
    }
  }

  await pool.end();
}

fixManufacturers().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
