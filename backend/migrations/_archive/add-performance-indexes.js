/**
 * Performance Indexes Migration
 * Adds database indexes to improve query performance for common operations
 *
 * Run with: node migrations/add-performance-indexes.js
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
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('🚀 Adding performance indexes...\n');

    await client.query('BEGIN');

    // ============================================
    // QUOTATIONS TABLE INDEXES
    // ============================================
    console.log('📊 Adding quotations table indexes...');

    // Index for customer lookups (frequently joined)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotations_customer_id
      ON quotations(customer_id);
    `);

    // Index for status filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotations_status
      ON quotations(status);
    `);

    // Index for date range queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotations_created_at
      ON quotations(created_at DESC);
    `);

    // Composite index for common list queries (status + created_at)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotations_status_created
      ON quotations(status, created_at DESC);
    `);

    // Index for quote number lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotations_quote_number
      ON quotations(quote_number);
    `);

    // Index for expiring quotes queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotations_expires_at
      ON quotations(expires_at)
      WHERE expires_at IS NOT NULL;
    `);

    console.log('  ✅ Quotations indexes created');

    // ============================================
    // QUOTATION_ITEMS TABLE INDEXES
    // ============================================
    console.log('📊 Adding quotation_items table indexes...');

    // Primary lookup by quotation
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id
      ON quotation_items(quotation_id);
    `);

    // Product lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotation_items_product_id
      ON quotation_items(product_id);
    `);

    console.log('  ✅ Quotation items indexes created');

    // ============================================
    // CUSTOMERS TABLE INDEXES
    // ============================================
    console.log('📊 Adding customers table indexes...');

    // Email lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_email
      ON customers(email);
    `);

    // Name search (for ILIKE queries)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_name_lower
      ON customers(LOWER(name));
    `);

    // City and province filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_city
      ON customers(city);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_province
      ON customers(province);
    `);

    // Created date for "new customers this month" queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_created_at
      ON customers(created_at DESC);
    `);

    console.log('  ✅ Customers indexes created');

    // ============================================
    // PRODUCTS TABLE INDEXES
    // ============================================
    console.log('📊 Adding products table indexes...');

    // Model lookups (unique constraint already creates index, but explicit is clearer)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_model
      ON products(model);
    `);

    // Manufacturer filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_manufacturer
      ON products(manufacturer);
    `);

    // Category filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_category
      ON products(category);
    `);

    // Text search on model and description
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_search
      ON products USING gin(to_tsvector('english', COALESCE(model, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(manufacturer, '')));
    `);

    console.log('  ✅ Products indexes created');

    // ============================================
    // MARKETPLACE_ORDERS TABLE INDEXES
    // ============================================
    console.log('📊 Adding marketplace_orders table indexes...');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_orders_order_state
      ON marketplace_orders(order_state);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_orders_created_at
      ON marketplace_orders(created_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_orders_mirakl_order_id
      ON marketplace_orders(mirakl_order_id);
    `);

    console.log('  ✅ Marketplace orders indexes created');

    // ============================================
    // QUOTE_EVENTS TABLE INDEXES
    // ============================================
    console.log('📊 Adding quote_events table indexes...');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_events_quotation_id
      ON quote_events(quotation_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_events_created_at
      ON quote_events(created_at DESC);
    `);

    console.log('  ✅ Quote events indexes created');

    // ============================================
    // QUOTE_APPROVALS TABLE INDEXES
    // ============================================
    console.log('📊 Adding quote_approvals table indexes...');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_approvals_quotation_id
      ON quote_approvals(quotation_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_approvals_status
      ON quote_approvals(status);
    `);

    console.log('  ✅ Quote approvals indexes created');

    // ============================================
    // FOLLOW_UP_REMINDERS TABLE INDEXES
    // ============================================
    console.log('📊 Adding follow_up_reminders table indexes...');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_quotation_id
      ON follow_up_reminders(quotation_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_scheduled_for
      ON follow_up_reminders(scheduled_for);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_status
      ON follow_up_reminders(status);
    `);

    console.log('  ✅ Follow-up reminders indexes created');

    // ============================================
    // PRICE_HISTORY TABLE INDEXES
    // ============================================
    console.log('📊 Adding price_history table indexes...');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_price_history_product_id
      ON price_history(product_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_price_history_change_date
      ON price_history(change_date DESC);
    `);

    console.log('  ✅ Price history indexes created');

    // ============================================
    // AUDIT_LOG TABLE INDEXES
    // ============================================
    console.log('📊 Adding audit_log table indexes...');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_user_id
      ON audit_log(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
      ON audit_log(created_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_action
      ON audit_log(action);
    `);

    console.log('  ✅ Audit log indexes created');

    await client.query('COMMIT');

    console.log('\n✅ All performance indexes added successfully!');
    console.log('\n📈 Expected improvements:');
    console.log('   - Faster quote listings and searches');
    console.log('   - Faster customer lookups');
    console.log('   - Faster product searches');
    console.log('   - Faster marketplace order queries');
    console.log('   - Faster analytics dashboard loads');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);

    // If error is about table not existing, provide helpful message
    if (error.message.includes('does not exist')) {
      console.log('\n⚠️  Some tables may not exist yet. Run other migrations first.');
    }

    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('\n🎉 Performance indexes migration completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration error:', error);
    process.exit(1);
  });
