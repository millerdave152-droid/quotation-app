/**
 * Quick Win Performance Indexes Migration
 *
 * Adds critical indexes for dashboard and analytics query performance.
 * All indexes use CONCURRENTLY to avoid locking tables during creation.
 *
 * Run: node migrations/add-quick-win-indexes.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

const indexes = [
  // Quotations date columns - critical for dashboard aggregations
  {
    name: 'idx_quotations_won_at',
    table: 'quotations',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotations_won_at
          ON quotations(won_at) WHERE won_at IS NOT NULL`
  },
  {
    name: 'idx_quotations_lost_at',
    table: 'quotations',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotations_lost_at
          ON quotations(lost_at) WHERE lost_at IS NOT NULL`
  },
  {
    name: 'idx_quotations_sent_at',
    table: 'quotations',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotations_sent_at
          ON quotations(sent_at) WHERE sent_at IS NOT NULL`
  },
  // Composite index for status + created_at (common query pattern)
  {
    name: 'idx_quotations_status_created',
    table: 'quotations',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotations_status_created
          ON quotations(status, created_at DESC)`
  },
  // Expiry date for follow-up queries
  {
    name: 'idx_quotations_expires_at',
    table: 'quotations',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotations_expires_at
          ON quotations(expires_at) WHERE expires_at IS NOT NULL`
  },
  // Analytics feature tables - JOIN optimization
  {
    name: 'idx_quote_financing_quote_id',
    table: 'quote_financing',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quote_financing_quote_id
          ON quote_financing(quote_id)`
  },
  {
    name: 'idx_quote_warranties_quote_id',
    table: 'quote_warranties',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quote_warranties_quote_id
          ON quote_warranties(quote_id)`
  },
  {
    name: 'idx_quote_delivery_quote_id',
    table: 'quote_delivery',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quote_delivery_quote_id
          ON quote_delivery(quote_id)`
  },
  {
    name: 'idx_quote_rebates_quote_id',
    table: 'quote_rebates',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quote_rebates_quote_id
          ON quote_rebates(quote_id)`
  },
  {
    name: 'idx_quote_trade_ins_quote_id',
    table: 'quote_trade_ins',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quote_trade_ins_quote_id
          ON quote_trade_ins(quote_id)`
  }
];

async function runMigration() {
  const client = await pool.connect();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     QUICK WIN PERFORMANCE INDEXES MIGRATION              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const index of indexes) {
    try {
      // Check if table exists first
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        )
      `, [index.table]);

      if (!tableCheck.rows[0].exists) {
        console.log(`⏭️  SKIP: ${index.name} (table '${index.table}' does not exist)`);
        skipped++;
        continue;
      }

      // Check if index already exists
      const indexCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = $1
        )
      `, [index.name]);

      if (indexCheck.rows[0].exists) {
        console.log(`✓  EXISTS: ${index.name}`);
        skipped++;
        continue;
      }

      // Create the index (outside transaction for CONCURRENTLY)
      console.log(`⏳ Creating: ${index.name}...`);
      await client.query(index.sql);
      console.log(`✅ CREATED: ${index.name}`);
      created++;

    } catch (err) {
      console.log(`❌ FAILED: ${index.name} - ${err.message}`);
      failed++;
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Results: ${created} created, ${skipped} skipped, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════');

  // Verify indexes
  console.log('');
  console.log('Verifying quotations indexes:');
  const result = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'quotations'
    AND indexname LIKE 'idx_quotations%'
    ORDER BY indexname
  `);

  result.rows.forEach(row => {
    console.log(`  - ${row.indexname}`);
  });

  client.release();
  await pool.end();

  console.log('');
  console.log('Migration complete!');
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
