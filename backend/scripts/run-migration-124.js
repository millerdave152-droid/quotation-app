/**
 * Run Migration 124: Multi-Tenancy with Row-Level Security
 *
 * Usage: node backend/scripts/run-migration-124.js
 *
 * This migration:
 *  - Updates TeleTime tenant UUID to a0000000-...
 *  - Adds tenant_id UUID column to ~385 tables
 *  - Renames marketplace integer tenant_id columns
 *  - Creates indexes on tenant_id
 *  - Enables RLS + FORCE RLS on all tenant-scoped tables
 *  - Creates tenant_isolation policies
 *  - Recreates employee_fraud_metrics materialized view
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { rawPool } = require('../db');
const fs = require('fs');

const sqlPath = path.join(__dirname, '..', 'migrations', '124_multi_tenancy_rls.sql');

if (!fs.existsSync(sqlPath)) {
  console.error('Migration file not found:', sqlPath);
  console.error('Run `node backend/scripts/generate-tenant-migration.js` first.');
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');

console.log('Starting Migration 124: Multi-Tenancy RLS...');
console.log(`SQL file size: ${(sql.length / 1024).toFixed(1)} KB`);

rawPool.query(sql)
  .then(() => {
    console.log('Migration 124 completed successfully!');
    console.log('Applied:');
    console.log('  - Updated TeleTime tenant UUID');
    console.log('  - Added tenant_id column to tables');
    console.log('  - Renamed marketplace integer tenant_id columns');
    console.log('  - Created tenant_id indexes');
    console.log('  - Enabled RLS + FORCE RLS');
    console.log('  - Created tenant_isolation policies');
    console.log('');
    console.log('Verify with:');
    console.log("  SET app.current_tenant = 'a0000000-0000-0000-0000-000000000000';");
    console.log('  SELECT count(*) FROM customers;  -- should return existing count');
    console.log("  SET app.current_tenant = 'b0000000-0000-0000-0000-000000000000';");
    console.log('  SELECT count(*) FROM customers;  -- should return 0');
    rawPool.end();
  })
  .catch(e => {
    console.error('Migration 124 failed:', e.message);
    if (e.detail) console.error('Detail:', e.detail);
    if (e.hint) console.error('Hint:', e.hint);
    if (e.where) console.error('Where:', e.where);
    rawPool.end();
    process.exit(1);
  });
