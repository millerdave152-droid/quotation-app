#!/usr/bin/env node
/**
 * Fix Migration Tracking
 *
 * Updates schema_migrations to reflect renamed duplicate files (Phase 2).
 * Run: node scripts/fix-migration-tracking.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_ADMIN_USER || process.env.DB_USER,
  password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const RENAMES = [
  ['001_pos_tables.sql', '178_pos_tables.sql'],
  ['010_pos_test_seed_data.sql', '179_pos_test_seed_data.sql'],
  ['049_product_images.sql', '180_product_images.sql'],
  ['050_discontinued_products.sql', '181_discontinued_products.sql'],
  ['051_loyalty_points.sql', '182_loyalty_points.sql'],
  ['052_marketing_attribution.sql', '183_marketing_attribution.sql'],
  ['053_employee_time_clock.sql', '184_employee_time_clock.sql'],
  ['054_pos_permissions.sql', '185_pos_permissions.sql'],
  ['096_excelsior_warranties.sql', '186_excelsior_warranties.sql'],
  ['111_offline_approval_support.sql', '187_offline_approval_support.sql'],
  ['112_pricing_engine.sql', '188_pricing_engine.sql'],
  ['115_messaging_hub.sql', '189_messaging_hub.sql'],
  ['156_fraud_scores.sql', '190_fraud_scores.sql'],
  ['157_order_versions.sql', '191_order_versions.sql'],
  ['160_mv_employee_fraud_metrics.sql', '192_mv_employee_fraud_metrics.sql'],
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Rename duplicate File B's
    let updated = 0;
    for (const [oldName, newName] of RENAMES) {
      const result = await client.query(
        'UPDATE schema_migrations SET filename = $1 WHERE filename = $2',
        [newName, oldName]
      );
      if (result.rowCount > 0) {
        console.log(`  Renamed: ${oldName} -> ${newName}`);
        updated++;
      } else {
        console.log(`  SKIP (not found): ${oldName}`);
      }
    }

    // 2. Remove the .down.sql rollback entry
    const delResult = await client.query(
      "DELETE FROM schema_migrations WHERE filename = '121_ce_integration_support.down.sql'"
    );
    if (delResult.rowCount > 0) {
      console.log(`  Deleted: 121_ce_integration_support.down.sql (rollback file)`);
    } else {
      console.log(`  SKIP (not found): 121_ce_integration_support.down.sql`);
    }

    await client.query('COMMIT');

    // 3. Verify
    const total = await client.query('SELECT COUNT(*) FROM schema_migrations');
    const downFiles = await client.query(
      "SELECT COUNT(*) FROM schema_migrations WHERE filename LIKE '%.down.sql'"
    );

    console.log(`\n  Done: ${updated} renamed, ${delResult.rowCount} deleted`);
    console.log(`  Total migrations tracked: ${total.rows[0].count}`);
    console.log(`  .down.sql files remaining: ${downFiles.rows[0].count}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
