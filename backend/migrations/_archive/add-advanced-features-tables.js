/**
 * Migration: Add Advanced Features Tables
 * - Competitor prices tracking
 * - Sync error log
 * - Marketplace audit log
 * - Health score metrics
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('🚀 Starting Advanced Features migration...\n');

    // 1. Competitor Prices Table
    console.log('📋 Creating competitor_prices table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS competitor_prices (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        competitor_name VARCHAR(255) NOT NULL,
        competitor_url TEXT,
        competitor_price DECIMAL(12, 2),
        currency VARCHAR(10) DEFAULT 'CAD',
        last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        price_difference DECIMAL(12, 2),
        is_lower BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_competitor_prices_product
      ON competitor_prices(product_id);

      CREATE INDEX IF NOT EXISTS idx_competitor_prices_is_lower
      ON competitor_prices(is_lower) WHERE is_lower = true;
    `);
    console.log('✅ competitor_prices table created\n');

    // 2. Sync Error Log Table
    console.log('📋 Creating marketplace_sync_errors table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_sync_errors (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_sku VARCHAR(255),
        error_type VARCHAR(100) NOT NULL,
        error_message TEXT NOT NULL,
        error_details JSONB,
        sync_job_id INTEGER REFERENCES marketplace_sync_jobs(id) ON DELETE SET NULL,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        status VARCHAR(50) DEFAULT 'pending',
        resolved_at TIMESTAMP,
        resolved_by VARCHAR(255),
        ignored BOOLEAN DEFAULT false,
        ignored_at TIMESTAMP,
        ignored_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_sync_errors_status
      ON marketplace_sync_errors(status);

      CREATE INDEX IF NOT EXISTS idx_sync_errors_product
      ON marketplace_sync_errors(product_id);

      CREATE INDEX IF NOT EXISTS idx_sync_errors_type
      ON marketplace_sync_errors(error_type);

      CREATE INDEX IF NOT EXISTS idx_sync_errors_created
      ON marketplace_sync_errors(created_at DESC);
    `);
    console.log('✅ marketplace_sync_errors table created\n');

    // 3. Marketplace Audit Log Table
    console.log('📋 Creating marketplace_audit_log table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_audit_log (
        id SERIAL PRIMARY KEY,
        action_type VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id INTEGER,
        entity_name VARCHAR(255),
        user_id INTEGER,
        user_name VARCHAR(255) DEFAULT 'System',
        old_values JSONB,
        new_values JSONB,
        description TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_audit_log_action
      ON marketplace_audit_log(action_type);

      CREATE INDEX IF NOT EXISTS idx_audit_log_entity
      ON marketplace_audit_log(entity_type, entity_id);

      CREATE INDEX IF NOT EXISTS idx_audit_log_user
      ON marketplace_audit_log(user_id);

      CREATE INDEX IF NOT EXISTS idx_audit_log_created
      ON marketplace_audit_log(created_at DESC);
    `);
    console.log('✅ marketplace_audit_log table created\n');

    // 4. Health Score Metrics Table
    console.log('📋 Creating marketplace_health_metrics table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_health_metrics (
        id SERIAL PRIMARY KEY,
        metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
        sync_success_rate DECIMAL(5, 2) DEFAULT 0,
        order_fulfillment_rate DECIMAL(5, 2) DEFAULT 0,
        inventory_accuracy DECIMAL(5, 2) DEFAULT 0,
        avg_response_time_ms INTEGER DEFAULT 0,
        total_sync_attempts INTEGER DEFAULT 0,
        successful_syncs INTEGER DEFAULT 0,
        failed_syncs INTEGER DEFAULT 0,
        total_orders INTEGER DEFAULT 0,
        fulfilled_orders INTEGER DEFAULT 0,
        cancelled_orders INTEGER DEFAULT 0,
        products_in_sync INTEGER DEFAULT 0,
        products_out_of_sync INTEGER DEFAULT 0,
        overall_health_score INTEGER DEFAULT 0,
        recommendations JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(metric_date)
      );

      CREATE INDEX IF NOT EXISTS idx_health_metrics_date
      ON marketplace_health_metrics(metric_date DESC);
    `);
    console.log('✅ marketplace_health_metrics table created\n');

    // 5. Add marketplace_enabled column to products if not exists
    console.log('📋 Adding marketplace_enabled column to products...');
    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS marketplace_enabled BOOLEAN DEFAULT true;
    `);
    console.log('✅ marketplace_enabled column added\n');

    // 6. Create bulk operations log table
    console.log('📋 Creating bulk_operations_log table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS bulk_operations_log (
        id SERIAL PRIMARY KEY,
        operation_type VARCHAR(100) NOT NULL,
        total_items INTEGER DEFAULT 0,
        successful_items INTEGER DEFAULT 0,
        failed_items INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'pending',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        user_name VARCHAR(255) DEFAULT 'System',
        details JSONB,
        error_summary TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_bulk_ops_status
      ON bulk_operations_log(status);

      CREATE INDEX IF NOT EXISTS idx_bulk_ops_type
      ON bulk_operations_log(operation_type);
    `);
    console.log('✅ bulk_operations_log table created\n');

    await client.query('COMMIT');
    console.log('✅ Advanced Features migration completed successfully!\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
