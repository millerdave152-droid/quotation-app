/**
 * Import Inventory from POS Excel File
 *
 * Reads an Excel file and updates stock_quantity for matching models.
 * Skips models not found in the database.
 */

const { Pool } = require('pg');
const XLSX = require('xlsx');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function importInventory(filePath) {
  console.log('\n=== POS Inventory Import ===\n');
  console.log('Reading file:', filePath);

  // Read Excel file
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);

  console.log('Sheet name:', sheetName);
  console.log('Total rows:', data.length);

  // Show first few rows to understand structure
  console.log('\nFirst 3 rows of data:');
  console.log(JSON.stringify(data.slice(0, 3), null, 2));

  // Try to identify the model and quantity columns
  if (data.length === 0) {
    console.log('No data found in file!');
    return;
  }

  const columns = Object.keys(data[0]);
  console.log('\nAvailable columns:', columns);

  // Look for exact column names first, then patterns
  let modelCol = null;
  let qtyCol = null;

  // Check for exact "Model" column first
  if (columns.includes('Model')) {
    modelCol = 'Model';
  } else if (columns.includes('model')) {
    modelCol = 'model';
  }

  // Check for quantity column
  if (columns.includes('Qty in Hand')) {
    qtyCol = 'Qty in Hand';
  } else if (columns.includes('Qty')) {
    qtyCol = 'Qty';
  }

  // Fallback to pattern matching if not found
  if (!modelCol) {
    const modelColPatterns = ['model', 'sku', 'item number', 'part', 'code'];
    for (const col of columns) {
      const colLower = col.toLowerCase();
      if (modelColPatterns.some(p => colLower === p || colLower.startsWith(p))) {
        modelCol = col;
        break;
      }
    }
  }

  if (!qtyCol) {
    const qtyColPatterns = ['qty', 'quantity', 'stock', 'on hand', 'in hand'];
    for (const col of columns) {
      const colLower = col.toLowerCase();
      if (qtyColPatterns.some(p => colLower.includes(p))) {
        qtyCol = col;
        break;
      }
    }
  }

  // If still not found, error out
  if (!modelCol || !qtyCol) {
    console.error('Could not identify Model or Quantity columns!');
    console.log('Please ensure the file has "Model" and "Qty in Hand" columns');
    return;
  }

  console.log('\nUsing columns:');
  console.log('  Model column:', modelCol);
  console.log('  Quantity column:', qtyCol);

  // Process updates
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const notFound = [];

  console.log('\nProcessing updates...\n');

  for (const row of data) {
    const model = row[modelCol];
    const qty = parseInt(row[qtyCol]) || 0;

    if (!model || model === '') {
      skipped++;
      continue;
    }

    try {
      // Try exact match first
      let result = await pool.query(
        'UPDATE products SET stock_quantity = $1 WHERE UPPER(TRIM(model)) = UPPER(TRIM($2)) RETURNING id, model',
        [qty, String(model).trim()]
      );

      if (result.rowCount === 0) {
        // Try partial match (model contains the value)
        result = await pool.query(
          'UPDATE products SET stock_quantity = $1 WHERE UPPER(model) LIKE UPPER($2) RETURNING id, model',
          [qty, '%' + String(model).trim() + '%']
        );
      }

      if (result.rowCount > 0) {
        updated += result.rowCount;
        console.log(`✓ Updated: ${model} -> ${qty} (${result.rowCount} product(s))`);
      } else {
        notFound.push(model);
        skipped++;
      }
    } catch (err) {
      console.error(`✗ Error updating ${model}:`, err.message);
      errors++;
    }
  }

  console.log('\n=== Import Summary ===');
  console.log('Updated:', updated, 'products');
  console.log('Skipped:', skipped, '(not found or empty)');
  console.log('Errors:', errors);

  if (notFound.length > 0 && notFound.length <= 50) {
    console.log('\nModels not found in database:');
    notFound.forEach(m => console.log('  -', m));
  } else if (notFound.length > 50) {
    console.log('\nModels not found:', notFound.length, '(too many to list)');
    console.log('First 20:', notFound.slice(0, 20).join(', '));
  }

  await pool.end();
  console.log('\nDone!');
}

// Get file path from command line or use default
const filePath = process.argv[2] || 'C:\\Users\\WD-PC1\\OneDrive\\Desktop\\UPDATE INVENTORY 0120.xlsx';

importInventory(filePath).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
