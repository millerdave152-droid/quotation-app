/**
 * Samsung Pricelist Import Script
 *
 * Imports Samsung product data from Excel pricelist into the products table.
 *
 * Usage:
 *   node scripts/import-samsung-pricelist.js <path-to-excel-file>
 *   node scripts/import-samsung-pricelist.js --dry-run <path-to-excel-file>
 *
 * Excel Format Expected:
 *   - Header at row 4 (0-indexed row 3)
 *   - Columns: Category, Model, SET/ACC, Color, Availability, Handle,
 *              Replacement For, MTO, Description, EMP, Go To, Go To Margin,
 *              Q3 AVG Promo, Q3 Promo Margin, Q3 Promo Cost
 */

const XLSX = require('xlsx');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Column mapping from Excel to database
const COLUMN_MAP = {
  'Category': 'samsung_category',
  'Model': 'model',
  'SET/ACC': 'set_or_accessory',
  'Color': 'color',
  'Availability': 'availability',
  'Handle': 'handle_type',
  'Replacement For': 'replacement_for',
  'MTO': 'is_mto',
  'Description': 'description',
  'EMP': 'emp_price_cents',
  'Go To': 'retail_price_cents',
  'Go To Margin': 'go_to_margin',
  'Q3 AVG Promo': 'promo_price_cents',
  'Q3 Promo Margin': 'promo_margin',
  'Q3 Promo Cost': 'cost_cents'
};

// Price columns that need conversion to cents
const PRICE_COLUMNS = ['EMP', 'Go To', 'Q3 AVG Promo', 'Q3 Promo Cost'];

// Percentage columns
const PERCENT_COLUMNS = ['Go To Margin', 'Q3 Promo Margin'];

/**
 * Clean and validate model number
 */
function cleanModel(model) {
  if (!model || model === 'NaN' || typeof model !== 'string') return null;
  return model.toString().trim();
}

/**
 * Convert dollar amount to cents
 */
function toCents(value) {
  if (value === null || value === undefined || value === '' || isNaN(value)) return null;
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}

/**
 * Clean percentage value
 */
function cleanPercent(value) {
  if (value === null || value === undefined || value === '' || isNaN(value)) return null;
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  // If it's already a decimal (e.g., 0.25), convert to percentage
  if (num > 0 && num < 1) return Math.round(num * 10000) / 100;
  return Math.round(num * 100) / 100;
}

/**
 * Parse MTO field to boolean
 */
function parseMTO(value) {
  if (!value) return false;
  const str = value.toString().toLowerCase().trim();
  return str === 'yes' || str === 'y' || str === 'true' || str === '1' || str === 'mto';
}

/**
 * Read and parse Excel file
 */
function readExcelFile(filePath) {
  console.log(`\nReading Excel file: ${filePath}`);

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  console.log(`Using sheet: ${sheetName}`);

  const worksheet = workbook.Sheets[sheetName];

  // Read all rows as arrays
  const rawData = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null
  });

  // Get headers from row 4 (0-indexed row 3)
  const headers = rawData[3];
  console.log(`\nHeaders found: ${headers.filter(h => h).join(', ')}`);

  // Parse data starting from row 5 (index 4)
  const products = [];
  let skipped = 0;

  for (let i = 4; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    // Create object from row
    const product = {};
    headers.forEach((header, idx) => {
      if (header) {
        product[header] = row[idx];
      }
    });

    // Skip if model is empty or NaN
    const model = cleanModel(product['Model']);
    if (!model) {
      skipped++;
      continue;
    }

    products.push(product);
  }

  console.log(`\nParsed ${products.length} products (skipped ${skipped} rows with empty/invalid model)`);
  return products;
}

/**
 * Transform Excel row to database record
 */
function transformProduct(excelRow) {
  const dbRecord = {
    manufacturer: 'Samsung',
    active: true,
    import_source: 'samsung_pricelist',
    import_date: new Date(),
    import_file_name: null // Will be set later
  };

  // Map each Excel column to database column
  for (const [excelCol, dbCol] of Object.entries(COLUMN_MAP)) {
    let value = excelRow[excelCol];

    // Handle price columns (convert to cents)
    if (PRICE_COLUMNS.includes(excelCol)) {
      value = toCents(value);
    }
    // Handle percentage columns
    else if (PERCENT_COLUMNS.includes(excelCol)) {
      value = cleanPercent(value);
    }
    // Handle MTO boolean
    else if (excelCol === 'MTO') {
      value = parseMTO(value);
    }
    // Handle model (clean spaces)
    else if (excelCol === 'Model') {
      value = cleanModel(value);
    }
    // Handle other string fields
    else if (typeof value === 'string') {
      value = value.trim() || null;
    }

    dbRecord[dbCol] = value;
  }

  // Map samsung_category to main category as well
  if (dbRecord.samsung_category) {
    dbRecord.category = dbRecord.samsung_category;
  }

  return dbRecord;
}

/**
 * Upsert product into database
 */
async function upsertProduct(client, product) {
  // Check if product exists by model and manufacturer
  const existing = await client.query(
    `SELECT id FROM products WHERE model = $1 AND manufacturer ILIKE $2`,
    [product.model, 'Samsung']
  );

  if (existing.rows.length > 0) {
    // Update existing product
    const id = existing.rows[0].id;
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    const fieldsToUpdate = [
      'description', 'color', 'samsung_category', 'category',
      'retail_price_cents', 'promo_price_cents', 'cost_cents',
      'go_to_margin', 'promo_margin', 'emp_price_cents',
      'availability', 'handle_type', 'replacement_for', 'is_mto',
      'set_or_accessory', 'import_source', 'import_date', 'import_file_name',
      'updated_at'
    ];

    for (const field of fieldsToUpdate) {
      if (product[field] !== undefined) {
        updateFields.push(`${field} = $${paramIndex}`);
        updateValues.push(field === 'updated_at' ? new Date() : product[field]);
        paramIndex++;
      }
    }

    if (updateFields.length > 0) {
      updateValues.push(id);
      await client.query(
        `UPDATE products SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
        updateValues
      );
    }

    return { action: 'updated', id };
  } else {
    // Insert new product
    const fields = Object.keys(product).filter(k => product[k] !== undefined);
    const values = fields.map(f => product[f]);
    const placeholders = fields.map((_, i) => `$${i + 1}`);

    const result = await client.query(
      `INSERT INTO products (${fields.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
      values
    );

    return { action: 'inserted', id: result.rows[0].id };
  }
}

/**
 * Main import function
 */
async function importSamsungPricelist(filePath, dryRun = false) {
  const startTime = Date.now();
  const fileName = path.basename(filePath);

  console.log('='.repeat(60));
  console.log('Samsung Pricelist Import');
  console.log('='.repeat(60));
  console.log(`File: ${fileName}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Started: ${new Date().toISOString()}`);

  // Read Excel file
  const excelProducts = readExcelFile(filePath);

  if (excelProducts.length === 0) {
    console.log('\nNo products to import. Exiting.');
    return;
  }

  // Transform products
  console.log('\nTransforming products...');
  const products = excelProducts.map(p => {
    const transformed = transformProduct(p);
    transformed.import_file_name = fileName;
    return transformed;
  });

  // Show sample
  console.log('\nSample transformed product:');
  console.log(JSON.stringify(products[0], null, 2));

  if (dryRun) {
    console.log('\n' + '='.repeat(60));
    console.log('DRY RUN SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total products to process: ${products.length}`);

    // Show price statistics
    const withCost = products.filter(p => p.cost_cents > 0).length;
    const withRetail = products.filter(p => p.retail_price_cents > 0).length;
    const withPromo = products.filter(p => p.promo_price_cents > 0).length;

    console.log(`\nPrice data coverage:`);
    console.log(`  - With cost (Q3 Promo Cost): ${withCost} (${Math.round(withCost/products.length*100)}%)`);
    console.log(`  - With retail price (Go To): ${withRetail} (${Math.round(withRetail/products.length*100)}%)`);
    console.log(`  - With promo price (Q3 AVG Promo): ${withPromo} (${Math.round(withPromo/products.length*100)}%)`);

    // Show categories
    const categories = [...new Set(products.map(p => p.samsung_category).filter(Boolean))];
    console.log(`\nCategories found (${categories.length}):`);
    categories.forEach(cat => {
      const count = products.filter(p => p.samsung_category === cat).length;
      console.log(`  - ${cat}: ${count}`);
    });

    console.log('\nNo changes made (dry run).');
    return;
  }

  // Import to database
  console.log('\nImporting to database...');
  const client = await pool.connect();

  const stats = {
    inserted: 0,
    updated: 0,
    errors: 0,
    errorDetails: []
  };

  try {
    await client.query('BEGIN');

    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      try {
        const result = await upsertProduct(client, product);
        if (result.action === 'inserted') {
          stats.inserted++;
        } else {
          stats.updated++;
        }

        // Progress indicator
        if ((i + 1) % 50 === 0 || i === products.length - 1) {
          process.stdout.write(`\rProcessed ${i + 1}/${products.length} products...`);
        }
      } catch (err) {
        stats.errors++;
        stats.errorDetails.push({
          model: product.model,
          error: err.message
        });

        if (stats.errors <= 5) {
          console.log(`\nError importing ${product.model}: ${err.message}`);
        }
      }
    }

    await client.query('COMMIT');
    console.log('\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nTransaction rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }

  // Print summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('='.repeat(60));
  console.log('IMPORT COMPLETE');
  console.log('='.repeat(60));
  console.log(`Time elapsed: ${elapsed}s`);
  console.log(`Products inserted: ${stats.inserted}`);
  console.log(`Products updated: ${stats.updated}`);
  console.log(`Errors: ${stats.errors}`);

  if (stats.errorDetails.length > 0 && stats.errorDetails.length <= 10) {
    console.log('\nError details:');
    stats.errorDetails.forEach(e => {
      console.log(`  - ${e.model}: ${e.error}`);
    });
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node import-samsung-pricelist.js [--dry-run] <excel-file>');
    console.log('\nOptions:');
    console.log('  --dry-run    Preview import without making changes');
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  const filePath = args.find(a => !a.startsWith('--'));

  if (!filePath) {
    console.error('Error: No file path provided');
    process.exit(1);
  }

  try {
    await importSamsungPricelist(filePath, dryRun);
  } catch (err) {
    console.error('\nFatal error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
