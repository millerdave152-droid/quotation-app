/**
 * Migration: Add Orders Table
 * Creates orders and order_items tables for quote-to-order conversion
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('Starting Orders Table Migration...\n');

    // =====================================================
    // 1. CREATE ORDERS TABLE
    // =====================================================
    console.log('1. Creating orders table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,

        -- Status tracking
        status VARCHAR(30) DEFAULT 'pending',
        -- Values: pending, confirmed, processing, ready_for_delivery, shipped, delivered, cancelled

        -- Financial
        subtotal_cents INTEGER NOT NULL,
        tax_cents INTEGER NOT NULL,
        delivery_cents INTEGER DEFAULT 0,
        discount_cents INTEGER DEFAULT 0,
        total_cents INTEGER NOT NULL,

        -- Payment tracking
        payment_status VARCHAR(30) DEFAULT 'unpaid',
        -- Values: unpaid, deposit_paid, paid, refunded, partially_refunded
        deposit_amount_cents INTEGER DEFAULT 0,
        amount_paid_cents INTEGER DEFAULT 0,

        -- Delivery tracking
        delivery_status VARCHAR(30),
        -- Values: pending, scheduled, in_transit, delivered, failed
        delivery_date DATE,
        delivery_slot_id INTEGER,
        delivery_address TEXT,
        delivery_instructions TEXT,

        -- Metadata
        notes TEXT,
        internal_notes TEXT,
        source VARCHAR(50) DEFAULT 'quote', -- quote, manual, marketplace
        created_by VARCHAR(255),
        confirmed_at TIMESTAMP,
        shipped_at TIMESTAMP,
        delivered_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        cancellation_reason TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ orders table created\n');

    // =====================================================
    // 2. CREATE ORDER ITEMS TABLE
    // =====================================================
    console.log('2. Creating order_items table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        quotation_item_id INTEGER,

        -- Product snapshot (in case product changes later)
        product_name VARCHAR(255),
        product_model VARCHAR(255),
        manufacturer VARCHAR(255),

        -- Pricing
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price_cents INTEGER NOT NULL,
        discount_cents INTEGER DEFAULT 0,
        total_cents INTEGER NOT NULL,

        -- Cost tracking for margin analysis
        unit_cost_cents INTEGER,

        -- Inventory tracking
        reservation_id INTEGER,
        fulfillment_status VARCHAR(30) DEFAULT 'pending',
        -- Values: pending, reserved, allocated, shipped, delivered, backordered

        -- Special order tracking
        is_special_order BOOLEAN DEFAULT false,
        lead_time_days INTEGER,
        expected_arrival DATE,

        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ order_items table created\n');

    // =====================================================
    // 3. CREATE INDEXES
    // =====================================================
    console.log('3. Creating indexes...');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_quotation ON orders(quotation_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
      CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_fulfillment ON order_items(fulfillment_status);
    `);
    console.log('   ✓ Indexes created\n');

    // =====================================================
    // 4. CREATE ORDER SEQUENCE FOR ORDER NUMBERS
    // =====================================================
    console.log('4. Creating order number sequence...');
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1001;
    `);
    console.log('   ✓ Order number sequence created\n');

    // =====================================================
    // 5. ADD ORDER_ID COLUMN TO QUOTATIONS (for tracking conversion)
    // =====================================================
    console.log('5. Adding order tracking to quotations...');
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS converted_to_order_id INTEGER REFERENCES orders(id),
      ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP;
    `);
    console.log('   ✓ Quotations table updated\n');

    await client.query('COMMIT');
    console.log('✅ Orders table migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrate().catch(console.error);
