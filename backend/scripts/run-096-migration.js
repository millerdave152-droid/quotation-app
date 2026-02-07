/**
 * Run migration 096_excelsior_warranties.sql
 *
 * Handles the ALTER TYPE ... ADD VALUE separately (can't run in transaction block),
 * then runs the rest of the migration.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'quotation-db.ccrqkqs0m6eu.us-east-1.rds.amazonaws.com',
  database: 'quotationapp',
  user: 'dbadmin',
  password: 'QuotationPass123!',
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('='.repeat(70));
  console.log('Migration 096: Excelsior/Guardian Angel Warranty Integration');
  console.log('='.repeat(70));

  try {
    // Step 1: Add enum value outside transaction (required by PostgreSQL)
    console.log('\n[1/2] Adding service_plan enum value...');
    try {
      await pool.query("ALTER TYPE warranty_type ADD VALUE IF NOT EXISTS 'service_plan'");
      console.log('  -> Added service_plan to warranty_type enum');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('  -> service_plan already exists in enum (skipping)');
      } else {
        throw err;
      }
    }

    // Step 2: Run the rest of the migration (everything after the ALTER TYPE line)
    console.log('\n[2/2] Running main migration...');
    const sqlPath = path.join(__dirname, '..', 'migrations', '096_excelsior_warranties.sql');
    let sql = fs.readFileSync(sqlPath, 'utf-8');

    // Remove the ALTER TYPE line (already executed above)
    sql = sql.replace(/ALTER TYPE warranty_type ADD VALUE IF NOT EXISTS 'service_plan';/, '-- (already executed)');

    await pool.query(sql);
    console.log('  -> Migration completed successfully');

    // Verify results
    console.log('\n' + '='.repeat(70));
    console.log('Verification');
    console.log('='.repeat(70));

    const counts = await pool.query(`
      SELECT provider_code, sale_context, COUNT(*) as cnt
      FROM warranty_products
      WHERE provider_code IS NOT NULL AND is_active = true
      GROUP BY provider_code, sale_context
      ORDER BY provider_code, sale_context
    `);

    let total = 0;
    for (const row of counts.rows) {
      console.log(`  ${row.provider_code} (${row.sale_context}): ${row.cnt} warranties`);
      total += parseInt(row.cnt);
    }
    console.log(`  TOTAL active Excelsior warranties: ${total}`);

    const oldSamples = await pool.query(`
      SELECT COUNT(*) as cnt FROM warranty_products wp
      JOIN products p ON p.id = wp.product_id
      WHERE p.sku LIKE 'WRN-%YR-%' AND wp.is_active = true
    `);
    console.log(`  Old sample warranties still active: ${oldSamples.rows[0].cnt}`);

    const regTable = await pool.query(`
      SELECT COUNT(*) as cnt FROM information_schema.tables
      WHERE table_name = 'warranty_provider_registrations'
    `);
    console.log(`  warranty_provider_registrations table: ${regTable.rows[0].cnt > 0 ? 'EXISTS' : 'MISSING'}`);

    console.log('\n' + '='.repeat(70));
    console.log('Migration 096 COMPLETE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\nMIGRATION FAILED:', error.message);
    if (error.position) {
      console.error('SQL position:', error.position);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
