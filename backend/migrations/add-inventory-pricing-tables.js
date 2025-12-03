/**
 * Migration: Add Inventory Sync and Smart Pricing Tables
 * - marketplace_sync_settings: Auto-sync configuration
 * - marketplace_price_rules: Price rules engine
 * - Add stock buffer columns to products table
 * - Add marketplace pricing columns
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
    console.log('🚀 Starting Inventory Sync & Pricing migration...');

    await client.query('BEGIN');

    // 1. Create marketplace_sync_settings table
    console.log('📋 Creating marketplace_sync_settings table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_sync_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value JSONB NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default sync settings
    console.log('📋 Inserting default sync settings...');
    await client.query(`
      INSERT INTO marketplace_sync_settings (setting_key, setting_value, description)
      VALUES
        ('auto_sync_enabled', '{"enabled": false}', 'Enable/disable automatic inventory sync'),
        ('sync_frequency_hours', '{"value": 4}', 'How often to sync inventory (hours)'),
        ('last_sync_time', '{"timestamp": null}', 'Timestamp of last successful sync'),
        ('sync_only_changed', '{"enabled": true}', 'Only sync products that have changed since last sync'),
        ('global_stock_buffer', '{"value": 0}', 'Global stock buffer - reserve units not sent to marketplace'),
        ('price_sync_enabled', '{"enabled": true}', 'Enable/disable price sync with rules'),
        ('inventory_sync_enabled', '{"enabled": true}', 'Enable/disable inventory quantity sync')
      ON CONFLICT (setting_key) DO NOTHING;
    `);

    // 2. Add stock buffer and marketplace columns to products table
    console.log('📋 Adding marketplace columns to products table...');

    // Check if columns exist before adding
    const checkColumns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'products'
      AND column_name IN ('marketplace_stock_buffer', 'marketplace_price', 'marketplace_last_synced', 'marketplace_price_rule_id', 'stock_quantity')
    `);

    const existingColumns = checkColumns.rows.map(r => r.column_name);

    // Add stock_quantity column if not exists
    if (!existingColumns.includes('stock_quantity')) {
      await client.query(`
        ALTER TABLE products
        ADD COLUMN stock_quantity INTEGER DEFAULT 0;
      `);
      console.log('  ✓ Added stock_quantity column');
    }

    if (!existingColumns.includes('marketplace_stock_buffer')) {
      await client.query(`
        ALTER TABLE products
        ADD COLUMN marketplace_stock_buffer INTEGER DEFAULT NULL;
      `);
      console.log('  ✓ Added marketplace_stock_buffer column');
    }

    if (!existingColumns.includes('marketplace_price')) {
      await client.query(`
        ALTER TABLE products
        ADD COLUMN marketplace_price DECIMAL(12, 2) DEFAULT NULL;
      `);
      console.log('  ✓ Added marketplace_price column');
    }

    if (!existingColumns.includes('marketplace_last_synced')) {
      await client.query(`
        ALTER TABLE products
        ADD COLUMN marketplace_last_synced TIMESTAMP DEFAULT NULL;
      `);
      console.log('  ✓ Added marketplace_last_synced column');
    }

    if (!existingColumns.includes('marketplace_price_rule_id')) {
      await client.query(`
        ALTER TABLE products
        ADD COLUMN marketplace_price_rule_id INTEGER DEFAULT NULL;
      `);
      console.log('  ✓ Added marketplace_price_rule_id column');
    }

    // 3. Create marketplace_price_rules table
    console.log('📋 Creating marketplace_price_rules table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_price_rules (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        rule_type VARCHAR(50) NOT NULL,
        value DECIMAL(12, 4) NOT NULL,
        category_code VARCHAR(50) DEFAULT NULL,
        manufacturer VARCHAR(255) DEFAULT NULL,
        min_price DECIMAL(12, 2) DEFAULT NULL,
        max_price DECIMAL(12, 2) DEFAULT NULL,
        priority INTEGER DEFAULT 100,
        enabled BOOLEAN DEFAULT true,
        apply_globally BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for price rules
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_price_rules_enabled
      ON marketplace_price_rules(enabled);

      CREATE INDEX IF NOT EXISTS idx_price_rules_category
      ON marketplace_price_rules(category_code);

      CREATE INDEX IF NOT EXISTS idx_price_rules_priority
      ON marketplace_price_rules(priority);
    `);

    // 4. Create marketplace_sync_jobs table for tracking sync history
    console.log('📋 Creating marketplace_sync_jobs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_sync_jobs (
        id SERIAL PRIMARY KEY,
        job_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        products_checked INTEGER DEFAULT 0,
        products_synced INTEGER DEFAULT 0,
        products_failed INTEGER DEFAULT 0,
        error_message TEXT,
        details JSONB DEFAULT '{}'
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_status
      ON marketplace_sync_jobs(status);

      CREATE INDEX IF NOT EXISTS idx_sync_jobs_started_at
      ON marketplace_sync_jobs(started_at DESC);
    `);

    // 5. Insert sample price rules
    console.log('📋 Inserting sample price rules...');
    await client.query(`
      INSERT INTO marketplace_price_rules (name, description, rule_type, value, apply_globally, priority, enabled)
      VALUES
        (
          'Default Markup 15%',
          'Apply 15% markup to all products',
          'markup_percent',
          15.00,
          true,
          100,
          false
        ),
        (
          'Round to .99',
          'Round all prices to end in .99',
          'round_to',
          0.99,
          true,
          50,
          false
        ),
        (
          'Minimum 20% Margin',
          'Ensure at least 20% profit margin',
          'minimum_margin',
          20.00,
          true,
          75,
          false
        )
      ON CONFLICT DO NOTHING;
    `);

    // 6. Add foreign key constraint for price rule on products
    console.log('📋 Adding foreign key constraint...');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'fk_products_price_rule'
        ) THEN
          ALTER TABLE products
          ADD CONSTRAINT fk_products_price_rule
          FOREIGN KEY (marketplace_price_rule_id)
          REFERENCES marketplace_price_rules(id)
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await client.query('COMMIT');
    console.log('✅ Inventory Sync & Pricing migration completed successfully!');

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
