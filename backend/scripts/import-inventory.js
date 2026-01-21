/**
 * Inventory Import Script
 * Imports stock quantities from POS Excel file into the database
 */

const XLSX = require('xlsx');
const path = require('path');
const pool = require('../db');

const EXCEL_PATH = 'C:\\Users\\WD-PC1\\OneDrive\\Desktop\\inventory20260114.xlsx';

async function importInventory() {
  console.log('=== Inventory Import Script ===\n');

  // Step 1: Read Excel file
  console.log('Reading Excel file...');
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);

  console.log(`Found ${data.length} rows in Excel file\n`);

  // Step 2: Get all models from database for matching
  console.log('Fetching models from database...');
  const dbResult = await pool.query(`
    SELECT id, model, name, manufacturer
    FROM products
    WHERE model IS NOT NULL AND model != ''
  `);

  const dbProducts = dbResult.rows;
  console.log(`Found ${dbProducts.length} products with models in database\n`);

  // Create lookup maps (case-insensitive)
  const modelToProduct = new Map();
  for (const product of dbProducts) {
    if (product.model) {
      // Store both original and uppercase for matching
      modelToProduct.set(product.model.toUpperCase().trim(), product);
    }
  }

  // Step 3: Match and prepare updates
  console.log('Matching inventory to database products...');

  const matches = [];
  const noMatch = [];

  for (const row of data) {
    const excelModel = row.Model;
    const qty = parseInt(row['Qty in Hand']) || 0;

    if (!excelModel) {
      continue; // Skip rows without model
    }

    const normalizedModel = excelModel.toString().toUpperCase().trim();
    const dbProduct = modelToProduct.get(normalizedModel);

    if (dbProduct) {
      matches.push({
        id: dbProduct.id,
        model: dbProduct.model,
        name: dbProduct.name,
        manufacturer: dbProduct.manufacturer,
        excelModel: excelModel,
        excelBrand: row.Brand,
        qty: qty
      });
    } else {
      noMatch.push({
        model: excelModel,
        brand: row.Brand,
        product: row.Product,
        qty: qty
      });
    }
  }

  console.log(`\n=== Matching Results ===`);
  console.log(`Matched: ${matches.length} products`);
  console.log(`Not matched: ${noMatch.length} products`);
  console.log(`Match rate: ${((matches.length / data.length) * 100).toFixed(1)}%\n`);

  // Step 4: Update database with matched quantities
  if (matches.length > 0) {
    console.log('Updating database with stock quantities...');

    let updated = 0;
    let errors = 0;

    for (const match of matches) {
      try {
        await pool.query(`
          UPDATE products
          SET
            qty_on_hand = $1,
            in_stock = $2,
            stock_status = $3,
            last_stock_sync = NOW(),
            stock_sync_source = 'POS Excel Import'
          WHERE id = $4
        `, [
          match.qty,
          match.qty > 0,
          match.qty > 0 ? 'in_stock' : 'out_of_stock',
          match.id
        ]);
        updated++;
      } catch (err) {
        console.error(`Error updating product ${match.id} (${match.model}):`, err.message);
        errors++;
      }
    }

    console.log(`\n=== Update Results ===`);
    console.log(`Successfully updated: ${updated} products`);
    console.log(`Errors: ${errors}`);

    // Show sample of updates
    console.log(`\n=== Sample of Updated Products ===`);
    const sampleMatches = matches.slice(0, 10);
    for (const m of sampleMatches) {
      console.log(`  ${m.model} (${m.manufacturer || m.excelBrand}): ${m.qty} units`);
    }
    if (matches.length > 10) {
      console.log(`  ... and ${matches.length - 10} more`);
    }
  }

  // Step 5: Show sample of non-matched products
  if (noMatch.length > 0) {
    console.log(`\n=== Sample of Non-Matched Products (first 20) ===`);
    const sampleNoMatch = noMatch.slice(0, 20);
    for (const nm of sampleNoMatch) {
      console.log(`  ${nm.model} (${nm.brand}): ${nm.qty} units`);
    }
  }

  // Summary by brand
  console.log(`\n=== Match Summary by Brand ===`);
  const brandStats = {};
  for (const m of matches) {
    const brand = m.excelBrand || 'Unknown';
    brandStats[brand] = (brandStats[brand] || 0) + 1;
  }
  const sortedBrands = Object.entries(brandStats).sort((a, b) => b[1] - a[1]);
  for (const [brand, count] of sortedBrands.slice(0, 15)) {
    console.log(`  ${brand}: ${count} products matched`);
  }

  console.log('\n=== Import Complete ===');

  return {
    total: data.length,
    matched: matches.length,
    notMatched: noMatch.length,
    matchRate: ((matches.length / data.length) * 100).toFixed(1)
  };
}

// Run the import
importInventory()
  .then(result => {
    console.log('\nFinal Stats:', result);
    process.exit(0);
  })
  .catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
  });
