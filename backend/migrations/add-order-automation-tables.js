/**
 * Migration: Add Order Automation Tables
 * - marketplace_notifications: Store order notifications
 * - marketplace_auto_rules: Store automation rules for order processing
 * - marketplace_order_settings: Store user preferences for notifications
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
    console.log('🚀 Starting Order Automation migration...');

    await client.query('BEGIN');

    // 1. Create marketplace_notifications table
    console.log('📋 Creating marketplace_notifications table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_notifications (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        order_id INTEGER REFERENCES marketplace_orders(id) ON DELETE SET NULL,
        mirakl_order_id VARCHAR(255),
        read BOOLEAN DEFAULT false,
        dismissed BOOLEAN DEFAULT false,
        priority VARCHAR(20) DEFAULT 'normal',
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP,
        dismissed_at TIMESTAMP
      );
    `);

    // Create indexes for notifications
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_read
      ON marketplace_notifications(read);

      CREATE INDEX IF NOT EXISTS idx_notifications_type
      ON marketplace_notifications(type);

      CREATE INDEX IF NOT EXISTS idx_notifications_created_at
      ON marketplace_notifications(created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_notifications_order_id
      ON marketplace_notifications(order_id);
    `);

    // 2. Create marketplace_auto_rules table
    console.log('📋 Creating marketplace_auto_rules table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_auto_rules (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        rule_type VARCHAR(50) NOT NULL,
        conditions JSONB NOT NULL DEFAULT '[]',
        action VARCHAR(50) NOT NULL,
        action_params JSONB DEFAULT '{}',
        priority INTEGER DEFAULT 100,
        enabled BOOLEAN DEFAULT true,
        last_triggered_at TIMESTAMP,
        trigger_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for auto_rules
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_auto_rules_rule_type
      ON marketplace_auto_rules(rule_type);

      CREATE INDEX IF NOT EXISTS idx_auto_rules_enabled
      ON marketplace_auto_rules(enabled);

      CREATE INDEX IF NOT EXISTS idx_auto_rules_priority
      ON marketplace_auto_rules(priority);
    `);

    // 3. Create marketplace_order_settings table
    console.log('📋 Creating marketplace_order_settings table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_order_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value JSONB NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default settings
    console.log('📋 Inserting default settings...');
    await client.query(`
      INSERT INTO marketplace_order_settings (setting_key, setting_value, description)
      VALUES
        ('notification_sound', '{"enabled": true, "sound": "chime"}', 'Enable sound for new order notifications'),
        ('browser_notifications', '{"enabled": true}', 'Enable browser push notifications'),
        ('check_interval_minutes', '{"value": 5}', 'How often to check for new orders (minutes)'),
        ('auto_refresh_orders', '{"enabled": true, "interval_seconds": 60}', 'Auto-refresh order list'),
        ('default_reject_reason', '{"reason": "Out of stock"}', 'Default rejection reason')
      ON CONFLICT (setting_key) DO NOTHING;
    `);

    // 4. Create marketplace_rule_logs table for audit trail
    console.log('📋 Creating marketplace_rule_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_rule_logs (
        id SERIAL PRIMARY KEY,
        rule_id INTEGER REFERENCES marketplace_auto_rules(id) ON DELETE SET NULL,
        order_id INTEGER REFERENCES marketplace_orders(id) ON DELETE SET NULL,
        mirakl_order_id VARCHAR(255),
        action_taken VARCHAR(50) NOT NULL,
        conditions_matched JSONB,
        result VARCHAR(50),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for rule_logs
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rule_logs_rule_id
      ON marketplace_rule_logs(rule_id);

      CREATE INDEX IF NOT EXISTS idx_rule_logs_order_id
      ON marketplace_rule_logs(order_id);

      CREATE INDEX IF NOT EXISTS idx_rule_logs_created_at
      ON marketplace_rule_logs(created_at DESC);
    `);

    // 5. Insert sample auto-accept rules
    console.log('📋 Inserting sample auto-rules...');
    await client.query(`
      INSERT INTO marketplace_auto_rules (name, description, rule_type, conditions, action, action_params, priority, enabled)
      VALUES
        (
          'Auto-accept in-stock orders',
          'Automatically accept orders when all items are in stock and quantity is 5 or less',
          'auto_accept',
          '[{"field": "all_items_in_stock", "operator": "equals", "value": true}, {"field": "max_quantity", "operator": "less_than_or_equal", "value": 5}]',
          'accept',
          '{}',
          100,
          false
        ),
        (
          'Alert on high-value orders',
          'Send alert notification for orders over $5000',
          'alert',
          '[{"field": "order_total", "operator": "greater_than", "value": 5000}]',
          'notify',
          '{"priority": "high", "message": "High-value order requires review"}',
          50,
          true
        ),
        (
          'Auto-reject out-of-stock',
          'Automatically reject orders with out-of-stock items',
          'auto_reject',
          '[{"field": "any_item_out_of_stock", "operator": "equals", "value": true}]',
          'reject',
          '{"reason": "One or more items are currently out of stock"}',
          90,
          false
        )
      ON CONFLICT DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('✅ Order Automation migration completed successfully!');

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
