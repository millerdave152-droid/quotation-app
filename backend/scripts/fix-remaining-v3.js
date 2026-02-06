process.env.DATABASE_SSL = 'false';
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function q(label, sql) {
  try {
    await db.query(sql);
    console.log(`✓ ${label}`);
    return true;
  } catch (e) {
    const msg = e.message.split('\n')[0];
    if (msg.includes('already exists') || msg.includes('duplicate')) { console.log(`~ ${label}`); return true; }
    console.log(`✗ ${label}: ${msg}`);
    return false;
  }
}

async function run() {
  const md = path.join(__dirname, '..', 'migrations');

  // Fix products table - add missing columns needed by migrations
  await q('products.is_active', "ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE");

  // 017: warranty_products
  await q('017', fs.readFileSync(path.join(md, '017_warranty_products.sql'), 'utf8'));
  // 018
  await q('018', fs.readFileSync(path.join(md, '018_warranty_terms_url.sql'), 'utf8'));

  // 015: Fix IMMUTABLE issue - read to understand what index expression is problematic
  let sql015 = fs.readFileSync(path.join(md, '015_manager_override_system.sql'), 'utf8');
  // Remove problematic FK refs and function-based indexes
  sql015 = sql015.replace(/REFERENCES\s+shifts\([^)]+\)/g, '');
  sql015 = sql015.replace(/quotation_id\s+INTEGER\s+REFERENCES\s+\w+\([^)]+\)/g, 'quotation_id INTEGER');
  // Remove any CREATE INDEX with function expressions that aren't IMMUTABLE
  sql015 = sql015.replace(/CREATE INDEX.*?lower\(.*?\).*?;/gi, '-- removed non-immutable index');
  await q('015', sql015);

  // 019 depends on override_thresholds from 015
  await q('019', fs.readFileSync(path.join(md, '019_override_threshold_levels.sql'), 'utf8'));

  // 023: The GET DIAGNOSTICS issue - let's read the exact syntax
  let sql023 = fs.readFileSync(path.join(md, '023_product_relationships.sql'), 'utf8');
  // Fix all GET DIAGNOSTICS patterns
  sql023 = sql023.replace(/GET DIAGNOSTICS\s+(\w+)\s*=\s*ROW_COUNT/g, 'GET DIAGNOSTICS $1 = row_count');
  await q('023', sql023);

  // 030: email_queue - "user_id" FK issue
  let sql030 = fs.readFileSync(path.join(md, '030_email_queue.sql'), 'utf8');
  // Remove problematic FK
  sql030 = sql030.replace(/user_id\s+INTEGER\s+NOT\s+NULL\s+REFERENCES\s+\w+\([^)]+\)/g, 'user_id INTEGER NOT NULL');
  sql030 = sql030.replace(/user_id\s+INTEGER\s+REFERENCES\s+\w+\([^)]+\)/g, 'user_id INTEGER');
  await q('030', sql030);

  // 041: locations needs pickup_hours
  await q('locations.pickup_hours', "ALTER TABLE locations ADD COLUMN IF NOT EXISTS pickup_hours JSONB");
  await q('locations.is_pickup_location', "ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_pickup_location BOOLEAN DEFAULT FALSE");
  await q('041', fs.readFileSync(path.join(md, '041_pickup_details.sql'), 'utf8'));

  // 059: locations enhancements
  await q('059', fs.readFileSync(path.join(md, '059_locations_enhancements.sql'), 'utf8'));

  // Final check
  const total = await db.query("SELECT COUNT(*) FROM pg_tables WHERE schemaname='public'");
  console.log(`\nTotal tables: ${total.rows[0].count}`);

  const keyTables = ['warranty_products', 'override_thresholds', 'email_queue', 'customer_signatures'];
  const existing = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1)", [keyTables]);
  console.log('Previously missing tables now:');
  existing.rows.forEach(r => console.log(`  ✓ ${r.tablename}`));
  const ex = new Set(existing.rows.map(r => r.tablename));
  keyTables.filter(t => !ex.has(t)).forEach(t => console.log(`  ✗ ${t} (still missing)`));

  await db.end();
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
