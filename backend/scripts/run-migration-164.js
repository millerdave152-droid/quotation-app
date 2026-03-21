/**
 * Run Migration 164: Fix return_payment_allocations moneris_refund_id column
 *
 * Usage: node backend/scripts/run-migration-164.js
 *
 * This migration renames stripe_refund_id -> moneris_refund_id on the
 * return_payment_allocations table, which was missed in migration 125.
 *
 * Fixes: "column 'moneris_refund_id' of relation 'return_payment_allocations' does not exist"
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { rawPool } = require('../db');
const fs = require('fs');

const sqlPath = path.join(__dirname, '..', 'migrations', '164_fix_return_payment_allocations_moneris.sql');

if (!fs.existsSync(sqlPath)) {
  console.error('Migration file not found:', sqlPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');

console.log('Starting Migration 164: Fix return_payment_allocations moneris_refund_id...');

rawPool.query(sql)
  .then(async () => {
    console.log('Migration 164 completed successfully!');
    console.log('');
    console.log('Fixed:');
    console.log('  - Renamed stripe_refund_id -> moneris_refund_id on return_payment_allocations');
    console.log('');

    // Verify the column exists
    const verify = await rawPool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'return_payment_allocations'
        AND column_name = 'moneris_refund_id'
    `);

    if (verify.rows.length > 0) {
      const col = verify.rows[0];
      console.log(`Verified: moneris_refund_id exists (${col.data_type}(${col.character_maximum_length}))`);
    } else {
      console.error('WARNING: moneris_refund_id column not found after migration!');
    }

    rawPool.end();
  })
  .catch(e => {
    console.error('Migration 164 failed:', e.message);
    if (e.detail) console.error('Detail:', e.detail);
    if (e.hint) console.error('Hint:', e.hint);
    if (e.where) console.error('Where:', e.where);
    rawPool.end();
    process.exit(1);
  });
