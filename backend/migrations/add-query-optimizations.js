/**
 * Query Optimization Migration
 *
 * Adds missing indexes for frequently queried columns identified through code review:
 * - Revenue features tables (quote_financing, quote_warranties, etc.)
 * - CLV-related queries
 * - Marketplace sync tables
 * - Order items and invoice payments
 *
 * Run with: node backend/migrations/add-query-optimizations.js
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(60));
    console.log('Query Optimization Migration');
    console.log('='.repeat(60));

    await client.query('BEGIN');

    // ============================================
    // 1. REVENUE FEATURES INDEXES
    // These tables are joined frequently in analytics queries
    // ============================================
    console.log('\n1. Adding revenue features indexes...');

    const revenueTables = [
      { table: 'quote_financing', column: 'quote_id', name: 'idx_quote_financing_quote_id' },
      { table: 'quote_warranties', column: 'quote_id', name: 'idx_quote_warranties_quote_id' },
      { table: 'quote_delivery', column: 'quote_id', name: 'idx_quote_delivery_quote_id' },
      { table: 'quote_rebates', column: 'quote_id', name: 'idx_quote_rebates_quote_id' },
      { table: 'quote_trade_ins', column: 'quote_id', name: 'idx_quote_trade_ins_quote_id' },
    ];

    for (const idx of revenueTables) {
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.column})
        `);
        console.log(`   ✓ Created index: ${idx.name}`);
      } catch (err) {
        if (err.message.includes('does not exist')) {
          console.log(`   - Table ${idx.table} does not exist yet (skipped)`);
        } else {
          console.log(`   ✗ Failed: ${idx.name} - ${err.message}`);
        }
      }
    }

    // ============================================
    // 2. ORDER SYSTEM INDEXES
    // ============================================
    console.log('\n2. Adding order system indexes...');

    const orderIndexes = [
      { table: 'orders', column: 'quotation_id', name: 'idx_orders_quotation_id' },
      { table: 'orders', column: 'customer_id', name: 'idx_orders_customer_id' },
      { table: 'orders', column: 'status', name: 'idx_orders_status' },
      { table: 'orders', column: 'created_at', name: 'idx_orders_created_at' },
      { table: 'order_items', column: 'order_id', name: 'idx_order_items_order_id' },
      { table: 'order_items', column: 'product_id', name: 'idx_order_items_product_id' },
    ];

    for (const idx of orderIndexes) {
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.column})
        `);
        console.log(`   ✓ Created index: ${idx.name}`);
      } catch (err) {
        if (err.message.includes('does not exist')) {
          console.log(`   - Table ${idx.table} does not exist yet (skipped)`);
        } else {
          console.log(`   ✗ Failed: ${idx.name} - ${err.message}`);
        }
      }
    }

    // ============================================
    // 3. INVOICE SYSTEM INDEXES
    // ============================================
    console.log('\n3. Adding invoice system indexes...');

    const invoiceIndexes = [
      { table: 'invoices', column: 'order_id', name: 'idx_invoices_order_id' },
      { table: 'invoices', column: 'quotation_id', name: 'idx_invoices_quotation_id' },
      { table: 'invoices', column: 'customer_id', name: 'idx_invoices_customer_id' },
      { table: 'invoices', column: 'status', name: 'idx_invoices_status' },
      { table: 'invoices', column: 'due_date', name: 'idx_invoices_due_date' },
      { table: 'invoice_payments', column: 'invoice_id', name: 'idx_invoice_payments_invoice_id' },
    ];

    for (const idx of invoiceIndexes) {
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.column})
        `);
        console.log(`   ✓ Created index: ${idx.name}`);
      } catch (err) {
        if (err.message.includes('does not exist')) {
          console.log(`   - Table ${idx.table} does not exist yet (skipped)`);
        } else {
          console.log(`   ✗ Failed: ${idx.name} - ${err.message}`);
        }
      }
    }

    // ============================================
    // 4. MARKETPLACE SYNC INDEXES
    // ============================================
    console.log('\n4. Adding marketplace sync indexes...');

    const marketplaceIndexes = [
      { table: 'marketplace_orders', column: 'customer_id', name: 'idx_mp_orders_customer_id' },
      { table: 'marketplace_order_items', column: 'order_id', name: 'idx_mp_order_items_order_id' },
      { table: 'marketplace_order_items', column: 'product_id', name: 'idx_mp_order_items_product_id' },
      { table: 'marketplace_shipments', column: 'order_id', name: 'idx_mp_shipments_order_id' },
      { table: 'marketplace_sync_log', column: 'entity_type', name: 'idx_mp_sync_entity_type' },
      { table: 'marketplace_sync_log', column: 'status', name: 'idx_mp_sync_status' },
    ];

    for (const idx of marketplaceIndexes) {
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.column})
        `);
        console.log(`   ✓ Created index: ${idx.name}`);
      } catch (err) {
        if (err.message.includes('does not exist')) {
          console.log(`   - Table ${idx.table} does not exist yet (skipped)`);
        } else {
          console.log(`   ✗ Failed: ${idx.name} - ${err.message}`);
        }
      }
    }

    // ============================================
    // 5. CLV AND CHURN SYSTEM INDEXES
    // ============================================
    console.log('\n5. Adding CLV and churn alert indexes...');

    const clvIndexes = [
      { table: 'churn_alerts', column: 'customer_id', name: 'idx_churn_alerts_customer_id' },
      { table: 'churn_alerts', column: 'created_at', name: 'idx_churn_alerts_created_at' },
      { table: 'churn_alerts', column: 'status', name: 'idx_churn_alerts_status' },
      { table: 'churn_alert_job_log', column: 'status', name: 'idx_churn_job_log_status' },
      { table: 'churn_alert_job_log', column: 'created_at', name: 'idx_churn_job_log_created_at' },
    ];

    for (const idx of clvIndexes) {
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.column})
        `);
        console.log(`   ✓ Created index: ${idx.name}`);
      } catch (err) {
        if (err.message.includes('does not exist')) {
          console.log(`   - Table ${idx.table} does not exist yet (skipped)`);
        } else {
          console.log(`   ✗ Failed: ${idx.name} - ${err.message}`);
        }
      }
    }

    // ============================================
    // 6. COMPOSITE INDEXES FOR COMMON QUERIES
    // ============================================
    console.log('\n6. Adding composite indexes for common queries...');

    const compositeIndexes = [
      // For customer filtering with status
      {
        table: 'customers',
        columns: 'customer_type, created_at DESC',
        name: 'idx_customers_type_created'
      },
      // For quote analytics by status and date
      {
        table: 'quotations',
        columns: 'customer_id, created_at DESC',
        name: 'idx_quotations_customer_created'
      },
      // For finding overdue invoices
      {
        table: 'invoices',
        columns: 'status, due_date',
        name: 'idx_invoices_status_due'
      },
      // For order filtering
      {
        table: 'orders',
        columns: 'customer_id, status',
        name: 'idx_orders_customer_status'
      },
      // For product filtering by category and manufacturer
      {
        table: 'products',
        columns: 'category_id, manufacturer',
        name: 'idx_products_category_manufacturer'
      },
      // For quotation items by product
      {
        table: 'quotation_items',
        columns: 'product_id, quotation_id',
        name: 'idx_quote_items_product_quotation'
      },
    ];

    for (const idx of compositeIndexes) {
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.columns})
        `);
        console.log(`   ✓ Created composite index: ${idx.name}`);
      } catch (err) {
        if (err.message.includes('does not exist')) {
          console.log(`   - Table ${idx.table} does not exist yet (skipped)`);
        } else {
          console.log(`   ✗ Failed: ${idx.name} - ${err.message}`);
        }
      }
    }

    // ============================================
    // 7. PARTIAL INDEXES FOR FILTERED QUERIES
    // ============================================
    console.log('\n7. Adding partial indexes for filtered queries...');

    // Active products only
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_products_active_only
        ON products(manufacturer, category)
        WHERE active = true
      `);
      console.log('   ✓ Created partial index: idx_products_active_only');
    } catch (err) {
      console.log(`   ✗ Failed: idx_products_active_only - ${err.message}`);
    }

    // Pending quotes only
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_quotations_pending_only
        ON quotations(customer_id, created_at DESC)
        WHERE status IN ('DRAFT', 'SENT', 'PENDING_APPROVAL')
      `);
      console.log('   ✓ Created partial index: idx_quotations_pending_only');
    } catch (err) {
      console.log(`   ✗ Failed: idx_quotations_pending_only - ${err.message}`);
    }

    // Won quotes for CLV calculation
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_quotations_won_for_clv
        ON quotations(customer_id, total_cents, won_at)
        WHERE status = 'WON'
      `);
      console.log('   ✓ Created partial index: idx_quotations_won_for_clv');
    } catch (err) {
      console.log(`   ✗ Failed: idx_quotations_won_for_clv - ${err.message}`);
    }

    // Unpaid invoices
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_invoices_unpaid
        ON invoices(customer_id, due_date)
        WHERE status IN ('draft', 'sent', 'partial')
      `);
      console.log('   ✓ Created partial index: idx_invoices_unpaid');
    } catch (err) {
      console.log(`   ✗ Failed: idx_invoices_unpaid - ${err.message}`);
    }

    await client.query('COMMIT');

    // ============================================
    // SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('Migration Complete!');
    console.log('='.repeat(60));
    console.log(`
Summary of indexes added:
  - Revenue features tables (quote_financing, warranties, etc.)
  - Order system (orders, order_items)
  - Invoice system (invoices, invoice_payments)
  - Marketplace sync (marketplace_orders, shipments, sync_log)
  - CLV and churn alert system
  - Composite indexes for common multi-column queries
  - Partial indexes for filtered queries

Expected performance improvements:
  - Faster analytics dashboard loads
  - Faster CLV calculations
  - Faster invoice lookups
  - Faster marketplace order queries
  - Reduced query execution time for filtered queries
    `);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('\n🎉 Query optimization migration completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration error:', error);
    process.exit(1);
  });
