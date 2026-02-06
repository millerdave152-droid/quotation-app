process.env.DATABASE_SSL = 'false';
const db = require('../config/database');

async function run() {
  const r = await db.query("SELECT COUNT(*) FROM pg_tables WHERE schemaname='public'");
  console.log('Total tables:', r.rows[0].count);

  const criticalTables = [
    'users', 'customers', 'products', 'quotations', 'transactions',
    'unified_orders', 'unified_order_items', 'unified_order_payments', 'unified_order_status_history',
    'order_fulfillment', 'delivery_zones', 'delivery_options',
    'registers', 'register_shifts', 'pos_returns', 'return_reason_codes',
    'gift_cards', 'gift_card_transactions', 'store_credits',
    'roles', 'permissions', 'role_permissions',
    'batch_email_settings', 'customer_consent_log', 'marketing_sources',
    'hub_returns', 'locations', 'commission_rules', 'fulfillment_status_history'
  ];
  const existing = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1)", [criticalTables]);
  const ex = new Set(existing.rows.map(r => r.tablename));
  console.log('\nCritical tables:');
  let missing = 0;
  for (const t of criticalTables) {
    if (!ex.has(t)) { console.log('  MISSING:', t); missing++; }
  }
  if (missing === 0) console.log('  All present!');

  // Data counts
  const counts = ['users', 'customers', 'products', 'quotations', 'transactions'];
  console.log('\nData:');
  for (const t of counts) {
    try {
      const c = await db.query(`SELECT COUNT(*) FROM ${t}`);
      console.log(`  ${t}: ${c.rows[0].count} rows`);
    } catch(e) { console.log(`  ${t}: ERROR`); }
  }

  await db.end();
}

run().catch(e => { console.error(e); process.exit(1); });
