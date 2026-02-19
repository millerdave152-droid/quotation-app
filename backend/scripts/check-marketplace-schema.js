/**
 * Check marketplace DB schema and data
 */
const pool = require('../db');

async function check() {
  // Marketplace tables
  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'marketplace%' ORDER BY table_name"
  );
  console.log('=== MARKETPLACE TABLES ===');
  for (const t of tables.rows) {
    const cols = await pool.query(
      'SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position',
      [t.table_name]
    );
    console.log('\n' + t.table_name + ':');
    cols.rows.forEach(c =>
      console.log('  ' + c.column_name + ' (' + c.data_type + ')' + (c.is_nullable === 'NO' ? ' NOT NULL' : ''))
    );
  }

  // Products marketplace columns
  const prodCols = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='products' AND (column_name LIKE 'marketplace%' OR column_name LIKE 'mirakl%' OR column_name LIKE 'bestbuy%') ORDER BY column_name"
  );
  console.log('\n=== PRODUCTS MARKETPLACE COLUMNS ===');
  prodCols.rows.forEach(c => console.log('  ' + c.column_name + ' (' + c.data_type + ')'));

  // Offer imports
  const imports = await pool.query(
    'SELECT COUNT(*) as total, status, import_type FROM marketplace_offer_imports GROUP BY status, import_type ORDER BY import_type, status'
  );
  console.log('\n=== OFFER IMPORTS ===');
  console.table(imports.rows);

  // Products stats
  const enabled = await pool.query('SELECT COUNT(*) as total FROM products WHERE marketplace_enabled = true');
  const total = await pool.query('SELECT COUNT(*) as total FROM products');
  console.log('\n=== PRODUCTS ===');
  console.log('Total:', total.rows[0].total, '| Marketplace enabled:', enabled.rows[0].total);

  // Sample enabled products
  const sample = await pool.query(
    'SELECT id, sku, name, marketplace_enabled, mirakl_sku, mirakl_offer_id, bestbuy_category_code, stock_quantity FROM products WHERE marketplace_enabled = true LIMIT 5'
  );
  console.log('\nSample enabled products:');
  console.table(sample.rows);

  // Check for products with SKU but no mirakl_sku
  const noMiraklSku = await pool.query(
    "SELECT COUNT(*) as cnt FROM products WHERE marketplace_enabled = true AND (mirakl_sku IS NULL OR mirakl_sku = '')"
  );
  console.log('\nEnabled but no mirakl_sku:', noMiraklSku.rows[0].cnt);

  // Check inventory queue
  const queue = await pool.query(
    'SELECT COUNT(*) as pending FROM marketplace_inventory_queue WHERE synced_at IS NULL'
  );
  console.log('Pending inventory queue:', queue.rows[0].pending);

  // Check sync logs (recent)
  const logs = await pool.query(
    "SELECT sync_type, status, records_processed, records_succeeded, records_failed, sync_start_time FROM marketplace_sync_log ORDER BY sync_start_time DESC LIMIT 10"
  );
  console.log('\n=== RECENT SYNC LOGS ===');
  console.table(logs.rows);

  // Check indexes on marketplace tables
  const indexes = await pool.query(
    "SELECT tablename, indexname FROM pg_indexes WHERE schemaname='public' AND tablename LIKE 'marketplace%' ORDER BY tablename, indexname"
  );
  console.log('\n=== MARKETPLACE INDEXES ===');
  indexes.rows.forEach(i => console.log('  ' + i.tablename + ': ' + i.indexname));

  await pool.end();
}

check().catch(e => { console.error(e); process.exit(1); });
