/**
 * Run remaining failed migrations after 004 is fixed.
 * Each migration runs individually so failures don't block others.
 */
process.env.DATABASE_SSL = 'false';
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function run() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  // Skip 001-003 (already applied) and 004 (just fixed)
  // Try all others
  const results = { applied: [], skipped: [], failed: [] };

  for (const file of files) {
    const num = parseInt(file.split('_')[0]);
    if (num <= 4) continue; // Already handled

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    try {
      await db.query(sql);
      results.applied.push(file);
      console.log(`✓ ${file}`);
    } catch (e) {
      const msg = e.message.split('\n')[0];
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        results.skipped.push(file);
        console.log(`~ ${file} (already exists)`);
      } else {
        results.failed.push({ file, error: msg });
        console.log(`✗ ${file}: ${msg}`);
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Applied: ${results.applied.length}`);
  console.log(`Skipped: ${results.skipped.length}`);
  console.log(`Failed:  ${results.failed.length}`);

  if (results.failed.length > 0) {
    console.log('\nFailed migrations:');
    results.failed.forEach(f => console.log(`  ${f.file}: ${f.error}`));
  }

  // Check key tables
  const tables = await db.query(`
    SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename IN ('unified_orders','unified_order_items','unified_order_payments',
      'batch_email_settings','pos_returns','order_fulfillment','hub_returns',
      'inventory_transactions','unified_order_status_history')
    ORDER BY tablename
  `);
  console.log('\nKey tables present:');
  tables.rows.forEach(r => console.log(`  ✓ ${r.tablename}`));

  await db.end();
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
