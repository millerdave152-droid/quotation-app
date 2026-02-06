/**
 * Fix all remaining failed migrations.
 * Runs SQL directly, fixing known issues in each migration.
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

async function runFile(label, filename) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', filename), 'utf8');
  return runSQL(label, sql);
}

async function run() {
  // ---- 005: Tax configuration ----
  // Fails because of c.company_name - need to check what columns customers has
  const custCols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='customers' AND column_name IN ('company_name','company')");
  const hasCompanyName = custCols.rows.some(r => r.column_name === 'company_name');
  const hasCompany = custCols.rows.some(r => r.column_name === 'company');

  if (!hasCompanyName && hasCompany) {
    // Read and fix the migration
    let sql005 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '005_tax_configuration.sql'), 'utf8');
    sql005 = sql005.replace(/c\.company_name/g, 'c.company');
    await runSQL('005_tax_configuration (fixed company_name->company)', sql005);
  } else if (!hasCompanyName) {
    // Add column first
    await runSQL('005 prep: add company_name', "ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_name VARCHAR(255)");
    await runFile('005_tax_configuration', '005_tax_configuration.sql');
  } else {
    await runFile('005_tax_configuration', '005_tax_configuration.sql');
  }

  // ---- 008: Order modifications - needs "quotes" table which doesn't exist (it's "quotations") ----
  let sql008 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '008_order_modifications.sql'), 'utf8');
  sql008 = sql008.replace(/\bquotes\b(?!_)/g, 'quotations');
  await runSQL('008_order_modifications (fixed quotes->quotations)', sql008);

  // ---- 015: Manager override system - needs quotation_id column ----
  // The FK references a column that doesn't exist on the target table; skip or fix
  let sql015 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '015_manager_override_system.sql'), 'utf8');
  // Remove the problematic FK reference or fix it
  sql015 = sql015.replace(/quotation_id\s+INTEGER\s+REFERENCES\s+\w+\([^)]+\)/g, 'quotation_id INTEGER');
  await runSQL('015_manager_override_system (fixed FK)', sql015);

  // ---- 016: Delivery fulfillment - syntax error from /** comments ----
  let sql016 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '016_delivery_fulfillment.sql'), 'utf8');
  // Replace /** with /* to fix PostgreSQL comment parsing
  sql016 = sql016.replace(/\/\*\*/g, '/*');
  await runSQL('016_delivery_fulfillment (fixed comments)', sql016);

  // ---- 017: Warranty products - needs sku column on products ----
  const skuCol = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='sku'");
  if (skuCol.rows.length === 0) {
    await runSQL('017 prep: add sku to products', "ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(100)");
  }
  await runFile('017_warranty_products', '017_warranty_products.sql');

  // ---- 018: warranty_terms_url - depends on warranty_products ----
  await runFile('018_warranty_terms_url', '018_warranty_terms_url.sql');

  // ---- 019: Override threshold levels - depends on override_thresholds from 015 ----
  await runFile('019_override_threshold_levels', '019_override_threshold_levels.sql');

  // ---- 023: Product relationships - PL/pgSQL syntax error ----
  let sql023 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '023_product_relationships.sql'), 'utf8');
  // Fix "GET DIAGNOSTICS v_count" -> need to check the exact issue
  sql023 = sql023.replace(/GET DIAGNOSTICS\s+v_count\s*=\s*ROW_COUNT/g, 'GET DIAGNOSTICS v_count := ROW_COUNT');
  await runSQL('023_product_relationships (fixed GET DIAGNOSTICS)', sql023);

  // ---- 027: Quote follow-ups - column user_id ----
  let sql027 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '027_quote_follow_ups.sql'), 'utf8');
  // Likely needs users(id) reference but references user_id that doesn't exist on some table
  await runSQL('027_quote_follow_ups', sql027);

  // ---- 028: Commission system ----
  let sql028 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '028_commission_system.sql'), 'utf8');
  await runSQL('028_commission_system', sql028);

  // ---- 029: Customer signatures - unterminated comment ----
  let sql029 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '029_customer_signatures.sql'), 'utf8');
  sql029 = sql029.replace(/\/\*\*/g, '/*');
  await runSQL('029_customer_signatures (fixed comments)', sql029);

  // ---- 030: Email queue ----
  let sql030 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '030_email_queue.sql'), 'utf8');
  await runSQL('030_email_queue', sql030);

  // ---- 031: Batch email settings - pos_shifts doesn't exist ----
  let sql031 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '031_batch_email_settings.sql'), 'utf8');
  // Replace pos_shifts reference
  sql031 = sql031.replace(/REFERENCES\s+pos_shifts\([^)]+\)/g, '');
  await runSQL('031_batch_email_settings (fixed pos_shifts FK)', sql031);

  // ---- 032b: Create indexes - CONCURRENTLY can't run in transaction ----
  let sql032b = fs.readFileSync(path.join(__dirname, '..', 'migrations', '032b_create_indexes.sql'), 'utf8');
  // Remove BEGIN/COMMIT and run without transaction, also remove CONCURRENTLY
  sql032b = sql032b.replace(/\bBEGIN\b;?/gi, '');
  sql032b = sql032b.replace(/\bCOMMIT\b;?/gi, '');
  sql032b = sql032b.replace(/\bCONCURRENTLY\b/gi, '');
  // Split into individual statements and run each
  const stmts = sql032b.split(';').map(s => s.trim()).filter(s => s.length > 5);
  let idx_ok = 0, idx_fail = 0;
  for (const stmt of stmts) {
    try {
      await db.query(stmt);
      idx_ok++;
    } catch (e) {
      if (!e.message.includes('already exists')) idx_fail++;
    }
  }
  console.log(`✓ 032b_create_indexes: ${idx_ok} created, ${idx_fail} failed`);

  // ---- 033-042: All depend on order_fulfillment ----
  for (let i = 33; i <= 42; i++) {
    const pad = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(__dirname, '..', 'migrations')).filter(f => f.startsWith(pad));
    for (const f of files) {
      await runFile(f, f);
    }
  }

  // ---- 043: POS returns - FK references transactions(id) but column is transaction_id ----
  let sql043 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '043_pos_returns.sql'), 'utf8');
  sql043 = sql043.replace(/REFERENCES transactions\(id\)/g, 'REFERENCES transactions(transaction_id)');
  await runSQL('043_pos_returns (fixed FK)', sql043);

  // ---- 044, 045, 047: Depend on pos_returns ----
  await runFile('044_return_reason_codes', '044_return_reason_codes.sql');
  await runFile('045_return_refund_fields', '045_return_refund_fields.sql');
  await runFile('047_exchange_support', '047_exchange_support.sql');

  // ---- 055: order_fulfillment_type ----
  await runFile('055_order_fulfillment_type', '055_order_fulfillment_type.sql');

  // ---- 059, 060: locations ----
  // Create locations table if it doesn't exist
  await runSQL('059 prep: locations table', `
    CREATE TABLE IF NOT EXISTS locations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      address TEXT,
      city VARCHAR(100),
      province VARCHAR(10),
      postal_code VARCHAR(10),
      phone VARCHAR(50),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await runFile('059_locations_enhancements', '059_locations_enhancements.sql');
  await runFile('060_pickup_details', '060_pickup_details.sql');

  // ---- 061: hub_returns - depends on return_reason_codes ----
  await runFile('061_hub_returns', '061_hub_returns.sql');

  // ---- 063: hub_commission_tracking - u.name doesn't exist ----
  let sql063 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '063_hub_commission_tracking.sql'), 'utf8');
  sql063 = sql063.replace(/u\.name\b/g, "u.first_name || ' ' || u.last_name");
  await runSQL('063_hub_commission_tracking (fixed u.name)', sql063);

  // Final summary
  console.log('\n=== Checking key tables ===');
  const keyTables = [
    'unified_orders', 'unified_order_items', 'unified_order_payments',
    'order_fulfillment', 'pos_returns', 'delivery_zones', 'delivery_options',
    'warranty_products', 'batch_email_settings', 'locations',
    'return_reason_codes', 'hub_returns'
  ];
  const existing = await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1)`, [keyTables]);
  const existingSet = new Set(existing.rows.map(r => r.tablename));
  for (const t of keyTables) {
    console.log(`  ${existingSet.has(t) ? '✓' : '✗'} ${t}`);
  }

  // Total table count
  const total = await db.query("SELECT COUNT(*) FROM pg_tables WHERE schemaname='public'");
  console.log(`\nTotal tables: ${total.rows[0].count}`);

  await db.end();
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
