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
    console.log('🚀 Starting Best Buy Marketplace integration migration...');

    await client.query('BEGIN');

    // 1. Add marketplace columns to products table
    console.log('📋 Adding marketplace columns to products table...');
    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS mirakl_sku VARCHAR(255),
      ADD COLUMN IF NOT EXISTS mirakl_offer_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS bestbuy_category_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
    `);

    // Create indexes for marketplace columns
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_mirakl_sku
      ON products(mirakl_sku);

      CREATE INDEX IF NOT EXISTS idx_products_mirakl_offer_id
      ON products(mirakl_offer_id);

      CREATE INDEX IF NOT EXISTS idx_products_last_synced_at
      ON products(last_synced_at);
    `);

    // 2. Create marketplace_orders table
    console.log('📋 Creating marketplace_orders table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_orders (
        id SERIAL PRIMARY KEY,
        mirakl_order_id VARCHAR(255) UNIQUE NOT NULL,
        order_state VARCHAR(50) NOT NULL,
        customer_name VARCHAR(255),
        customer_email VARCHAR(255),
        shipping_address JSONB,
        billing_address JSONB,
        order_lines JSONB NOT NULL,
        total_price_cents BIGINT NOT NULL,
        currency VARCHAR(10) DEFAULT 'USD',
        payment_type VARCHAR(50),
        commission_fee_cents BIGINT DEFAULT 0,
        shipping_price_cents BIGINT DEFAULT 0,
        tax_cents BIGINT DEFAULT 0,
        order_date TIMESTAMP,
        last_updated TIMESTAMP,
        acceptance_decision_date TIMESTAMP,
        shipped_date TIMESTAMP,
        delivered_date TIMESTAMP,
        canceled_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for marketplace_orders
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_orders_mirakl_order_id
      ON marketplace_orders(mirakl_order_id);

      CREATE INDEX IF NOT EXISTS idx_marketplace_orders_order_state
      ON marketplace_orders(order_state);

      CREATE INDEX IF NOT EXISTS idx_marketplace_orders_order_date
      ON marketplace_orders(order_date);

      CREATE INDEX IF NOT EXISTS idx_marketplace_orders_customer_email
      ON marketplace_orders(customer_email);
    `);

    // 3. Create marketplace_order_items table (normalized order lines)
    console.log('📋 Creating marketplace_order_items table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES marketplace_orders(id) ON DELETE CASCADE,
        order_line_id VARCHAR(255),
        product_id INTEGER REFERENCES products(id),
        product_sku VARCHAR(255),
        quantity INTEGER NOT NULL,
        unit_price_cents BIGINT NOT NULL,
        total_price_cents BIGINT NOT NULL,
        commission_fee_cents BIGINT DEFAULT 0,
        tax_cents BIGINT DEFAULT 0,
        offer_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for marketplace_order_items
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_order_id
      ON marketplace_order_items(order_id);

      CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_product_id
      ON marketplace_order_items(product_id);

      CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_order_line_id
      ON marketplace_order_items(order_line_id);
    `);

    // 4. Create marketplace_shipments table
    console.log('📋 Creating marketplace_shipments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_shipments (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES marketplace_orders(id) ON DELETE CASCADE,
        tracking_number VARCHAR(255),
        carrier_code VARCHAR(100),
        carrier_name VARCHAR(255),
        shipping_method VARCHAR(100),
        shipment_date TIMESTAMP,
        estimated_delivery_date TIMESTAMP,
        actual_delivery_date TIMESTAMP,
        shipment_status VARCHAR(50),
        shipped_items JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for marketplace_shipments
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_shipments_order_id
      ON marketplace_shipments(order_id);

      CREATE INDEX IF NOT EXISTS idx_marketplace_shipments_tracking_number
      ON marketplace_shipments(tracking_number);

      CREATE INDEX IF NOT EXISTS idx_marketplace_shipments_shipment_status
      ON marketplace_shipments(shipment_status);
    `);

    // 5. Create marketplace_sync_log table
    console.log('📋 Creating marketplace_sync_log table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_sync_log (
        id SERIAL PRIMARY KEY,
        sync_type VARCHAR(50) NOT NULL,
        sync_direction VARCHAR(20) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(255),
        status VARCHAR(20) NOT NULL,
        records_processed INTEGER DEFAULT 0,
        records_succeeded INTEGER DEFAULT 0,
        records_failed INTEGER DEFAULT 0,
        error_message TEXT,
        error_details JSONB,
        sync_start_time TIMESTAMP NOT NULL,
        sync_end_time TIMESTAMP,
        duration_ms INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for marketplace_sync_log
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_sync_log_sync_type
      ON marketplace_sync_log(sync_type);

      CREATE INDEX IF NOT EXISTS idx_marketplace_sync_log_entity_type
      ON marketplace_sync_log(entity_type);

      CREATE INDEX IF NOT EXISTS idx_marketplace_sync_log_status
      ON marketplace_sync_log(status);

      CREATE INDEX IF NOT EXISTS idx_marketplace_sync_log_sync_start_time
      ON marketplace_sync_log(sync_start_time);
    `);

    // 6. Create marketplace_credentials table (for API keys)
    console.log('📋 Creating marketplace_credentials table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_credentials (
        id SERIAL PRIMARY KEY,
        marketplace_name VARCHAR(100) NOT NULL,
        environment VARCHAR(20) NOT NULL,
        api_key TEXT NOT NULL,
        api_secret TEXT,
        shop_id VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        last_validated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(marketplace_name, environment)
      );
    `);

    // 7. Create marketplace_webhook_events table
    console.log('📋 Creating marketplace_webhook_events table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_webhook_events (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        event_id VARCHAR(255) UNIQUE,
        marketplace_name VARCHAR(100),
        order_id VARCHAR(255),
        payload JSONB NOT NULL,
        processed BOOLEAN DEFAULT false,
        processed_at TIMESTAMP,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for marketplace_webhook_events
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_webhook_events_event_type
      ON marketplace_webhook_events(event_type);

      CREATE INDEX IF NOT EXISTS idx_marketplace_webhook_events_processed
      ON marketplace_webhook_events(processed);

      CREATE INDEX IF NOT EXISTS idx_marketplace_webhook_events_order_id
      ON marketplace_webhook_events(order_id);

      CREATE INDEX IF NOT EXISTS idx_marketplace_webhook_events_created_at
      ON marketplace_webhook_events(created_at);
    `);

    await client.query('COMMIT');
    console.log('✅ Marketplace migration completed successfully!');

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
