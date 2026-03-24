#!/usr/bin/env node
'use strict';

/**
 * Import Inventory from WD_Inventory_Cleaned.xlsx into the products table.
 *
 * Usage:
 *   node scripts/import-inventory.js <path-to-xlsx> [--dry-run]
 *
 * Options:
 *   --dry-run    Audit only — no inserts, just report what would happen
 *
 * Column mapping:
 *   Brand             → manufacturer
 *   Product Description → name
 *   Model / SKU       → sku, model
 *   Qty In Hand       → qty_on_hand
 *   Qty for RA        → qty_reserved (reserved for Return Authorization)
 *   List Cost         → cost_cents (× 100)
 */

const XLSX = require('xlsx');
const path = require('path');
const { Pool } = require('pg');

// ── Config ──────────────────────────────────────────────────────

const BATCH_SIZE = 100;
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000000';
const DEFAULT_CATEGORY = 'Uncategorized';
const SHEET_NAME = 'Cleaned Inventory';

// ── Args ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const filePath = args.find(a => !a.startsWith('--'));

if (!filePath) {
  console.error('Usage: node scripts/import-inventory.js <path-to-xlsx> [--dry-run]');
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────

function toCents(value) {
  if (value == null || value === '') return 0;
  const num = parseFloat(value);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

function toInt(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const num = parseInt(value, 10);
  return isNaN(num) ? fallback : num;
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(dryRun ? '  INVENTORY IMPORT — DRY RUN (no changes)' : '  INVENTORY IMPORT — LIVE RUN');
  console.log(`${'='.repeat(60)}\n`);

  // 1. Read Excel
  console.log(`Reading: ${filePath}`);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[SHEET_NAME] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    console.error(`Sheet "${SHEET_NAME}" not found. Available: ${wb.SheetNames.join(', ')}`);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  console.log(`Found ${rows.length} rows on "${SHEET_NAME}" sheet\n`);

  // 2. Parse and validate rows
  const products = [];
  const issues = [];
  const skusSeen = new Set();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // Excel row (1-indexed + header)

    const brand = (r['Brand'] || '').toString().trim();
    const desc = (r['Product Description'] || '').toString().trim();
    const sku = (r['Model / SKU'] || '').toString().trim();

    // Skip blank rows
    if (!brand && !desc && !sku) continue;

    // Validate required fields
    if (!sku) {
      issues.push(`Row ${rowNum}: Missing Model/SKU`);
      continue;
    }
    if (!brand) {
      issues.push(`Row ${rowNum}: Missing Brand (SKU: ${sku})`);
    }
    if (!desc) {
      issues.push(`Row ${rowNum}: Missing Product Description (SKU: ${sku})`);
    }

    // Check for duplicate SKUs within the file
    if (skusSeen.has(sku)) {
      issues.push(`Row ${rowNum}: Duplicate SKU in file: ${sku}`);
      continue;
    }
    skusSeen.add(sku);

    const name = desc
      ? `${brand} ${desc}`.trim()
      : brand || sku;

    products.push({
      name,
      sku,
      model: sku,
      manufacturer: brand || 'Unknown',
      category: DEFAULT_CATEGORY,
      cost_cents: toCents(r['List Cost']),
      qty_on_hand: toInt(r['Qty In Hand'], 0),
      qty_reserved: toInt(r['Qty for RA'], 0),
      import_source: 'WD_Inventory_Cleaned.xlsx',
      import_date: new Date(),
      tenant_id: DEFAULT_TENANT_ID,
    });
  }

  console.log(`Parsed: ${products.length} valid products`);
  if (issues.length > 0) {
    console.log(`\nData issues (${issues.length}):`);
    issues.slice(0, 20).forEach(msg => console.log(`  ! ${msg}`));
    if (issues.length > 20) console.log(`  ... and ${issues.length - 20} more`);
  }

  // 3. Connect to database
  let pool;
  try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    pool = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_ADMIN_USER || process.env.DB_USER,
      password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    // Test connection
    await pool.query('SELECT 1');
    console.log('\nDatabase connected.');
  } catch (err) {
    console.error('\nFailed to connect to database:', err.message);
    process.exit(1);
  }

  // 4. Check for existing SKUs in the database
  console.log('Checking for existing SKUs in database...');
  const existingResult = await pool.query(
    'SELECT sku FROM products WHERE sku = ANY($1::text[])',
    [products.map(p => p.sku)]
  );
  const existingSkus = new Set(existingResult.rows.map(r => r.sku));
  console.log(`  Existing in DB: ${existingSkus.size}`);

  const toInsert = products.filter(p => !existingSkus.has(p.sku));
  const toSkip = products.filter(p => existingSkus.has(p.sku));

  console.log(`  New (to insert): ${toInsert.length}`);
  console.log(`  Duplicates (to skip): ${toSkip.length}`);

  // ── DRY RUN REPORT ──────────────────────────────────────────

  if (dryRun) {
    console.log(`\n${'_'.repeat(60)}`);
    console.log('  DRY RUN SUMMARY');
    console.log(`${'_'.repeat(60)}`);
    console.log(`  Total rows in file:      ${rows.length}`);
    console.log(`  Valid products parsed:    ${products.length}`);
    console.log(`  Already in database:      ${existingSkus.size}`);
    console.log(`  Would be inserted:        ${toInsert.length}`);
    console.log(`  Would be skipped (dupes): ${toSkip.length}`);
    console.log(`  Data issues found:        ${issues.length}`);
    console.log(`  Brands in file:           ${new Set(products.map(p => p.manufacturer)).size}`);
    console.log(`  Products with zero cost:  ${products.filter(p => p.cost_cents === 0).length}`);
    console.log(`  Products with stock > 0:  ${products.filter(p => p.qty_on_hand > 0).length}`);

    if (toSkip.length > 0 && toSkip.length <= 30) {
      console.log('\n  Existing SKUs that would be skipped:');
      toSkip.forEach(p => console.log(`    ${p.sku} -- ${p.name}`));
    } else if (toSkip.length > 30) {
      console.log(`\n  First 30 existing SKUs that would be skipped:`);
      toSkip.slice(0, 30).forEach(p => console.log(`    ${p.sku} -- ${p.name}`));
      console.log(`    ... and ${toSkip.length - 30} more`);
    }

    console.log(`\n  No changes were made to the database.`);
    console.log(`  Remove --dry-run to perform the actual import.\n`);
    await pool.end();
    process.exit(0);
  }

  // ── LIVE INSERT ─────────────────────────────────────────────

  if (toInsert.length === 0) {
    console.log('\nNothing to insert -- all SKUs already exist.');
    await pool.end();
    process.exit(0);
  }

  const totalBatches = Math.ceil(toInsert.length / BATCH_SIZE);
  let inserted = 0;
  let errors = 0;

  console.log(`\nInserting ${toInsert.length} products in ${totalBatches} batches of ${BATCH_SIZE}...\n`);

  for (let b = 0; b < totalBatches; b++) {
    const batch = toInsert.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    console.log(`Importing batch ${b + 1} of ${totalBatches}... (${batch.length} products)`);

    for (const p of batch) {
      try {
        await pool.query(`
          INSERT INTO products (
            name, sku, model, manufacturer, category,
            cost_cents, msrp_cents, sell_cents, price,
            qty_on_hand, qty_reserved,
            active, discontinued, data_source,
            import_source, import_date,
            tenant_id
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11,
            true, false, 'manual',
            $12, $13,
            $14
          )
        `, [
          p.name,
          p.sku,
          p.model,
          p.manufacturer,
          p.category,
          p.cost_cents,
          p.cost_cents,  // msrp_cents = cost for now
          p.cost_cents,  // sell_cents = cost for now
          p.cost_cents,  // price = cost for now
          p.qty_on_hand,
          p.qty_reserved,
          p.import_source,
          p.import_date,
          p.tenant_id,
        ]);
        inserted++;
      } catch (err) {
        errors++;
        if (errors <= 10) {
          console.error(`  ERROR on SKU ${p.sku}: ${err.message}`);
        }
      }
    }
  }

  // ── FINAL REPORT ────────────────────────────────────────────

  console.log(`\n${'_'.repeat(60)}`);
  console.log('  IMPORT COMPLETE');
  console.log(`${'_'.repeat(60)}`);
  console.log(`  Total processed:   ${products.length}`);
  console.log(`  Inserted:          ${inserted}`);
  console.log(`  Skipped (dupes):   ${toSkip.length}`);
  console.log(`  Errors:            ${errors}`);
  console.log(`${'_'.repeat(60)}\n`);

  await pool.end();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
