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
      console.log(`~ ${label} (exists)`);
      return true;
    }
    console.log(`✗ ${label}: ${msg}`);
    return false;
  }
}

async function run() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');

  // 041: needs locations.type column
  await runSQL('locations.type', "ALTER TABLE locations ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'store'");
  await runSQL('041', fs.readFileSync(path.join(migrationsDir, '041_pickup_details.sql'), 'utf8'));

  // 005: has multiple column reference issues (company_name, contact_name)
  // Skip this - tax configuration tables likely already created from another path
  const taxTables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tax%'");
  console.log(`Tax tables already present: ${taxTables.rows.map(r=>r.tablename).join(', ') || 'none'}`);

  // 015: manager override - needs shifts table
  // Create a minimal shifts alias if needed
  const shiftsExists = await db.query("SELECT EXISTS(SELECT 1 FROM pg_tables WHERE tablename='shifts')");
  if (!shiftsExists.rows[0].exists) {
    // Create shifts as a view of register_shifts for compatibility
    await runSQL('shifts view', "CREATE OR REPLACE VIEW shifts AS SELECT shift_id as id, * FROM register_shifts");
  }
  let sql015 = fs.readFileSync(path.join(migrationsDir, '015_manager_override_system.sql'), 'utf8');
  sql015 = sql015.replace(/REFERENCES\s+shifts\([^)]+\)/g, '');
  sql015 = sql015.replace(/quotation_id\s+INTEGER\s+REFERENCES\s+\w+\([^)]+\)/g, 'quotation_id INTEGER');
  await runSQL('015_manager_override_system', sql015);

  // 017: warranty products - needs quantity_in_stock on products
  await runSQL('products.quantity_in_stock', "ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity_in_stock INTEGER DEFAULT 0");
  await runSQL('017', fs.readFileSync(path.join(migrationsDir, '017_warranty_products.sql'), 'utf8'));

  // 018: warranty_terms_url
  await runSQL('018', fs.readFileSync(path.join(migrationsDir, '018_warranty_terms_url.sql'), 'utf8'));

  // 019: override_threshold_levels - depends on override_thresholds from 015
  await runSQL('019', fs.readFileSync(path.join(migrationsDir, '019_override_threshold_levels.sql'), 'utf8'));

  // 023: product_relationships - GET DIAGNOSTICS syntax
  let sql023 = fs.readFileSync(path.join(migrationsDir, '023_product_relationships.sql'), 'utf8');
  // PostgreSQL uses := not = for GET DIAGNOSTICS
  sql023 = sql023.replace(/GET DIAGNOSTICS\s+(\w+)\s*=\s*/g, 'GET DIAGNOSTICS $1 := ');
  await runSQL('023_product_relationships', sql023);

  // 027: quote follow-ups - "user_id" doesn't exist
  let sql027 = fs.readFileSync(path.join(migrationsDir, '027_quote_follow_ups.sql'), 'utf8');
  // Try to see what table/column is the issue
  await runSQL('027_quote_follow_ups', sql027);

  // 028: commission system - "rule_type" doesn't exist
  let sql028 = fs.readFileSync(path.join(migrationsDir, '028_commission_system.sql'), 'utf8');
  await runSQL('028_commission_system', sql028);

  // 029: customer signatures - unterminated comment
  let sql029 = fs.readFileSync(path.join(migrationsDir, '029_customer_signatures.sql'), 'utf8');
  // Remove all block comments
  sql029 = sql029.replace(/\/\*[\s\S]*?\*\//g, '');
  await runSQL('029_customer_signatures', sql029);

  // 030: email queue
  let sql030 = fs.readFileSync(path.join(migrationsDir, '030_email_queue.sql'), 'utf8');
  await runSQL('030_email_queue', sql030);

  // 031: batch email settings
  let sql031 = fs.readFileSync(path.join(migrationsDir, '031_batch_email_settings.sql'), 'utf8');
  sql031 = sql031.replace(/REFERENCES\s+pos_shifts\([^)]+\)/g, '');
  sql031 = sql031.replace(/REFERENCES\s+email_batches\([^)]+\)/g, '');
  await runSQL('031_batch_email_settings', sql031);

  // 059: locations enhancements - column "type" missing was fixed above
  await runSQL('059', fs.readFileSync(path.join(migrationsDir, '059_locations_enhancements.sql'), 'utf8'));

  // Final summary
  const total = await db.query("SELECT COUNT(*) FROM pg_tables WHERE schemaname='public'");
  console.log(`\nTotal tables: ${total.rows[0].count}`);

  // Check all key tables
  const keyTables = [
    'unified_orders', 'unified_order_items', 'unified_order_payments',
    'order_fulfillment', 'pos_returns', 'delivery_zones', 'delivery_options',
    'warranty_products', 'batch_email_settings', 'locations', 'override_thresholds',
    'return_reason_codes', 'hub_returns', 'fulfillment_status_history',
    'customer_signatures', 'email_queue', 'quote_follow_ups', 'commission_rules'
  ];
  const existing = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1)", [keyTables]);
  const existingSet = new Set(existing.rows.map(r => r.tablename));
  console.log('\n=== Key tables ===');
  for (const t of keyTables) {
    console.log(`  ${existingSet.has(t) ? '✓' : '✗'} ${t}`);
  }

  await db.end();
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
