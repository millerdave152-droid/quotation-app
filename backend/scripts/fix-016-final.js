process.env.DATABASE_SSL = 'false';
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function run() {
  let sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '016_delivery_fulfillment.sql'), 'utf8');

  // Fix: 'do' is a reserved keyword in PostgreSQL, rename alias to 'dopt'
  sql = sql.replace(/\bdo\./g, 'dopt.');
  sql = sql.replace(/delivery_options do\b/g, 'delivery_options dopt');
  // Also fix 'of' alias for order_fulfillment (also reserved in some contexts)
  sql = sql.replace(/\bof\./g, 'oful.');
  sql = sql.replace(/order_fulfillment of\b/g, 'order_fulfillment oful');

  try {
    await db.query(sql);
    console.log('✓ Migration 016 applied');
  } catch (e) {
    console.log('✗ Error:', e.message.split('\n')[0]);
    if (e.position) {
      const pos = parseInt(e.position);
      const context = sql.substring(Math.max(0, pos - 80), pos + 80);
      console.log('Context:', context);
    }
  }

  // Verify
  const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('order_fulfillment','delivery_options','delivery_schedules','fulfillment_status_history','shipping_rates')");
  console.log('Tables created:', tables.rows.map(r => r.tablename));

  // Now run dependents 033-042, 055
  if (tables.rows.some(r => r.tablename === 'order_fulfillment')) {
    console.log('\nRunning dependents...');
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    for (let i = 33; i <= 42; i++) {
      const pad = String(i).padStart(3, '0');
      const files = fs.readdirSync(migrationsDir).filter(f => f.startsWith(pad));
      for (const f of files) {
        try {
          await db.query(fs.readFileSync(path.join(migrationsDir, f), 'utf8'));
          console.log(`  ✓ ${f}`);
        } catch (e) {
          const msg = e.message.split('\n')[0];
          if (msg.includes('already exists')) console.log(`  ~ ${f}`);
          else console.log(`  ✗ ${f}: ${msg}`);
        }
      }
    }
    // 055
    const f055 = fs.readdirSync(migrationsDir).filter(f => f.startsWith('055'));
    for (const f of f055) {
      try {
        await db.query(fs.readFileSync(path.join(migrationsDir, f), 'utf8'));
        console.log(`  ✓ ${f}`);
      } catch (e) {
        const msg = e.message.split('\n')[0];
        if (msg.includes('already exists')) console.log(`  ~ ${f}`);
        else console.log(`  ✗ ${f}: ${msg}`);
      }
    }
  }

  await db.end();
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
