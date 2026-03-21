/**
 * Migration: Add Inventory Reservation System
 * Creates inventory_reservations table and adds stock tracking fields to products
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
    console.log('Starting Inventory Reservation Migration...\n');

    // =====================================================
    // 1. ADD STOCK TRACKING COLUMNS TO PRODUCTS
    // =====================================================
    console.log('1. Adding stock tracking columns to products...');
    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS qty_on_hand INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS qty_reserved INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS qty_on_order INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS next_po_date DATE,
      ADD COLUMN IF NOT EXISTS next_po_qty INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS reorder_point INTEGER,
      ADD COLUMN IF NOT EXISTS reorder_qty INTEGER,
      ADD COLUMN IF NOT EXISTS last_stock_sync TIMESTAMP,
      ADD COLUMN IF NOT EXISTS stock_sync_source VARCHAR(50),
      ADD COLUMN IF NOT EXISTS warehouse_location VARCHAR(100);
    `);
    console.log('   ✓ Stock columns added to products\n');

    // =====================================================
    // 2. CREATE INVENTORY RESERVATIONS TABLE
    // =====================================================
    console.log('2. Creating inventory_reservations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_reservations (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,

        -- Reservation details
        quantity INTEGER NOT NULL,
        status VARCHAR(30) DEFAULT 'reserved',
        -- Values: reserved, released, converted, expired, cancelled

        -- Timing
        reserved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        released_at TIMESTAMP,
        converted_at TIMESTAMP,

        -- Release tracking
        release_reason VARCHAR(50),
        -- Values: quote_expired, quote_lost, quote_cancelled, converted_to_order, manual, timeout

        -- Audit
        created_by VARCHAR(255),
        released_by VARCHAR(255),
        notes TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ inventory_reservations table created\n');

    // =====================================================
    // 3. CREATE INVENTORY SYNC LOG TABLE
    // =====================================================
    console.log('3. Creating inventory_sync_log table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_sync_log (
        id SERIAL PRIMARY KEY,
        sync_type VARCHAR(50) NOT NULL, -- full, incremental, manual
        source VARCHAR(50), -- erp, csv, api, manual
        status VARCHAR(30) DEFAULT 'pending', -- pending, running, completed, failed
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        products_updated INTEGER DEFAULT 0,
        products_failed INTEGER DEFAULT 0,
        error_message TEXT,
        sync_data JSONB,
        created_by VARCHAR(255)
      )
    `);
    console.log('   ✓ inventory_sync_log table created\n');

    // =====================================================
    // 4. CREATE STOCK MOVEMENT HISTORY TABLE
    // =====================================================
    console.log('4. Creating stock_movements table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,

        -- Movement details
        movement_type VARCHAR(30) NOT NULL,
        -- Values: receipt, sale, return, adjustment, reservation, release, transfer

        quantity INTEGER NOT NULL, -- Positive for in, negative for out
        quantity_before INTEGER,
        quantity_after INTEGER,

        -- References
        reference_type VARCHAR(30), -- order, quote, po, adjustment, sync
        reference_id INTEGER,
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,

        -- Audit
        notes TEXT,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ stock_movements table created\n');

    // =====================================================
    // 5. CREATE INDEXES
    // =====================================================
    console.log('5. Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_product ON inventory_reservations(product_id);
      CREATE INDEX IF NOT EXISTS idx_reservations_quotation ON inventory_reservations(quotation_id);
      CREATE INDEX IF NOT EXISTS idx_reservations_order ON inventory_reservations(order_id);
      CREATE INDEX IF NOT EXISTS idx_reservations_status ON inventory_reservations(status);
      CREATE INDEX IF NOT EXISTS idx_reservations_expires ON inventory_reservations(expires_at);

      CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(created_at);

      CREATE INDEX IF NOT EXISTS idx_products_qty_available ON products((qty_on_hand - qty_reserved));
      CREATE INDEX IF NOT EXISTS idx_products_stock_status ON products(stock_status);
    `);
    console.log('   ✓ Indexes created\n');

    // =====================================================
    // 6. CREATE FUNCTION TO UPDATE RESERVED QTY
    // =====================================================
    console.log('6. Creating reservation update trigger...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_product_reserved_qty()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Update the product's reserved quantity
        UPDATE products
        SET qty_reserved = (
          SELECT COALESCE(SUM(quantity), 0)
          FROM inventory_reservations
          WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
          AND status = 'reserved'
        ),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = COALESCE(NEW.product_id, OLD.product_id);

        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trg_update_reserved_qty ON inventory_reservations;
      CREATE TRIGGER trg_update_reserved_qty
      AFTER INSERT OR UPDATE OR DELETE ON inventory_reservations
      FOR EACH ROW
      EXECUTE FUNCTION update_product_reserved_qty();
    `);
    console.log('   ✓ Reservation trigger created\n');

    // =====================================================
    // 7. ADD RESERVATION TRACKING TO QUOTATION ITEMS
    // =====================================================
    console.log('7. Adding reservation tracking to quotation_items...');
    await client.query(`
      ALTER TABLE quotation_items
      ADD COLUMN IF NOT EXISTS reservation_id INTEGER REFERENCES inventory_reservations(id),
      ADD COLUMN IF NOT EXISTS stock_status_at_quote VARCHAR(30),
      ADD COLUMN IF NOT EXISTS qty_available_at_quote INTEGER;
    `);
    console.log('   ✓ Quotation items updated\n');

    await client.query('COMMIT');
    console.log('✅ Inventory Reservation migration completed successfully!');

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
