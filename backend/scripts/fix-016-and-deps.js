/**
 * Fix migration 016 and its dependents (033-042, 055)
 */
process.env.DATABASE_SSL = 'false';
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function runSQL(label, sql) {
  try {
    await db.query(sql);
    console.log(`✓ ${label}`);
    return true;
  } catch (e) {
    const msg = e.message.split('\n')[0];
    if (msg.includes('already exists') || msg.includes('duplicate')) {
      console.log(`~ ${label} (already exists)`);
      return true;
    }
    console.log(`✗ ${label}: ${msg}`);
    return false;
  }
}

async function run() {
  // Read 016 and strip ALL block comments (/* ... */)
  let sql016 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '016_delivery_fulfillment.sql'), 'utf8');
  // Remove all block comments including nested /** */
  sql016 = sql016.replace(/\/\*[\s\S]*?\*\//g, '');

  const ok = await runSQL('016_delivery_fulfillment (stripped comments)', sql016);

  if (!ok) {
    // If still failing, let's see the exact error location
    // Try running line by line to find the issue
    console.log('\nTrying to identify exact issue...');

    // Split by semicolons and try each statement
    const statements = sql016.split(';').map(s => s.trim()).filter(s => s.length > 10);
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        await db.query(stmt);
        // console.log(`  stmt ${i+1}: OK`);
      } catch (e) {
        const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
        console.log(`  stmt ${i+1} FAILED: ${e.message.split('\n')[0]}`);
        console.log(`    SQL: ${preview}...`);
      }
    }
  }

  // Now try dependents
  if (ok || await db.query("SELECT EXISTS(SELECT 1 FROM pg_tables WHERE tablename='order_fulfillment')").then(r => r.rows[0].exists)) {
    console.log('\nRunning order_fulfillment dependents (033-042, 055)...');
    for (let i = 33; i <= 42; i++) {
      const pad = String(i).padStart(3, '0');
      const files = fs.readdirSync(path.join(__dirname, '..', 'migrations')).filter(f => f.startsWith(pad));
      for (const f of files) {
        const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', f), 'utf8');
        await runSQL(f, sql);
      }
    }

    const files055 = fs.readdirSync(path.join(__dirname, '..', 'migrations')).filter(f => f.startsWith('055'));
    for (const f of files055) {
      const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', f), 'utf8');
      await runSQL(f, sql);
    }
  }

  // Check results
  const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('order_fulfillment','delivery_options','delivery_zones','delivery_schedules','shipping_carriers','fulfillment_status_history')");
  console.log('\nDelivery tables:');
  tables.rows.forEach(r => console.log(`  ✓ ${r.tablename}`));

  await db.end();
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
