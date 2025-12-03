/**
 * Migration: Add Returns Management System
 * - marketplace_returns: Store return/refund requests
 * - marketplace_return_items: Individual items in returns
 * - marketplace_refunds: Track refund processing
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
    console.log('🚀 Starting Returns Management migration...');

    await client.query('BEGIN');

    // 1. Create marketplace_returns table
    console.log('📋 Creating marketplace_returns table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_returns (
        id SERIAL PRIMARY KEY,
        return_number VARCHAR(50) UNIQUE NOT NULL,
        order_id INTEGER REFERENCES marketplace_orders(id) ON DELETE SET NULL,
        mirakl_order_id VARCHAR(255),
        mirakl_return_id VARCHAR(255) UNIQUE,
        customer_name VARCHAR(255),
        customer_email VARCHAR(255),
        return_type VARCHAR(50) NOT NULL DEFAULT 'return',
        return_reason VARCHAR(100),
        return_reason_detail TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        received_date TIMESTAMP,
        processed_date TIMESTAMP,
        total_refund_cents BIGINT DEFAULT 0,
        restocking_fee_cents BIGINT DEFAULT 0,
        shipping_refund_cents BIGINT DEFAULT 0,
        return_shipping_paid_by VARCHAR(50) DEFAULT 'customer',
        return_label_url TEXT,
        tracking_number VARCHAR(255),
        carrier_code VARCHAR(100),
        notes TEXT,
        internal_notes TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for returns
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_returns_return_number
      ON marketplace_returns(return_number);

      CREATE INDEX IF NOT EXISTS idx_returns_order_id
      ON marketplace_returns(order_id);

      CREATE INDEX IF NOT EXISTS idx_returns_status
      ON marketplace_returns(status);

      CREATE INDEX IF NOT EXISTS idx_returns_mirakl_return_id
      ON marketplace_returns(mirakl_return_id);

      CREATE INDEX IF NOT EXISTS idx_returns_customer_email
      ON marketplace_returns(customer_email);

      CREATE INDEX IF NOT EXISTS idx_returns_created_at
      ON marketplace_returns(created_at DESC);
    `);

    // 2. Create marketplace_return_items table
    console.log('📋 Creating marketplace_return_items table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_return_items (
        id SERIAL PRIMARY KEY,
        return_id INTEGER REFERENCES marketplace_returns(id) ON DELETE CASCADE,
        order_item_id INTEGER REFERENCES marketplace_order_items(id) ON DELETE SET NULL,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_sku VARCHAR(255),
        product_name VARCHAR(255),
        quantity_ordered INTEGER NOT NULL,
        quantity_returned INTEGER NOT NULL,
        unit_price_cents BIGINT NOT NULL,
        refund_amount_cents BIGINT NOT NULL,
        condition VARCHAR(50) DEFAULT 'unknown',
        restockable BOOLEAN DEFAULT true,
        reason VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for return items
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_return_items_return_id
      ON marketplace_return_items(return_id);

      CREATE INDEX IF NOT EXISTS idx_return_items_product_id
      ON marketplace_return_items(product_id);

      CREATE INDEX IF NOT EXISTS idx_return_items_order_item_id
      ON marketplace_return_items(order_item_id);
    `);

    // 3. Create marketplace_refunds table
    console.log('📋 Creating marketplace_refunds table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_refunds (
        id SERIAL PRIMARY KEY,
        refund_number VARCHAR(50) UNIQUE NOT NULL,
        return_id INTEGER REFERENCES marketplace_returns(id) ON DELETE SET NULL,
        order_id INTEGER REFERENCES marketplace_orders(id) ON DELETE SET NULL,
        mirakl_refund_id VARCHAR(255) UNIQUE,
        refund_type VARCHAR(50) NOT NULL DEFAULT 'full',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        amount_cents BIGINT NOT NULL,
        currency VARCHAR(10) DEFAULT 'USD',
        reason VARCHAR(255),
        payment_method VARCHAR(100),
        transaction_id VARCHAR(255),
        processed_by VARCHAR(255),
        processed_at TIMESTAMP,
        notes TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for refunds
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_refunds_refund_number
      ON marketplace_refunds(refund_number);

      CREATE INDEX IF NOT EXISTS idx_refunds_return_id
      ON marketplace_refunds(return_id);

      CREATE INDEX IF NOT EXISTS idx_refunds_order_id
      ON marketplace_refunds(order_id);

      CREATE INDEX IF NOT EXISTS idx_refunds_status
      ON marketplace_refunds(status);

      CREATE INDEX IF NOT EXISTS idx_refunds_mirakl_refund_id
      ON marketplace_refunds(mirakl_refund_id);
    `);

    // 4. Add return settings to order settings
    console.log('📋 Adding return settings...');
    await client.query(`
      INSERT INTO marketplace_order_settings (setting_key, setting_value, description)
      VALUES
        ('return_window_days', '{"value": 30}', 'Number of days customer can initiate return'),
        ('auto_approve_returns', '{"enabled": false, "max_value": 5000}', 'Auto-approve returns under threshold'),
        ('restocking_fee_percentage', '{"value": 0}', 'Restocking fee percentage (0-100)'),
        ('return_shipping_policy', '{"paid_by": "customer", "free_return_threshold": 10000}', 'Who pays for return shipping'),
        ('refund_processing_days', '{"value": 5}', 'Business days to process refund after receipt')
      ON CONFLICT (setting_key) DO NOTHING;
    `);

    // 5. Create return status history table for audit trail
    console.log('📋 Creating marketplace_return_history table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_return_history (
        id SERIAL PRIMARY KEY,
        return_id INTEGER REFERENCES marketplace_returns(id) ON DELETE CASCADE,
        previous_status VARCHAR(50),
        new_status VARCHAR(50) NOT NULL,
        changed_by VARCHAR(255),
        notes TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_return_history_return_id
      ON marketplace_return_history(return_id);

      CREATE INDEX IF NOT EXISTS idx_return_history_created_at
      ON marketplace_return_history(created_at DESC);
    `);

    await client.query('COMMIT');
    console.log('✅ Returns Management migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('🎉 Migration script finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrate };
