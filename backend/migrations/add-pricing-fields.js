/**
 * Migration: Add Pricing Fields
 * Adds MAP, LAP, UMRP, PMAP, promo pricing and product_metrics table
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
    console.log('Starting Pricing Fields Migration...\n');

    // =====================================================
    // 1. ADD PRICING COLUMNS TO PRODUCTS
    // =====================================================
    console.log('1. Adding pricing columns to products...');
    await client.query(`
      ALTER TABLE products
      -- Manufacturer pricing policies
      ADD COLUMN IF NOT EXISTS map_cents INTEGER,         -- Minimum Advertised Price
      ADD COLUMN IF NOT EXISTS lap_cents INTEGER,         -- Lowest Advertised Price
      ADD COLUMN IF NOT EXISTS umrp_cents INTEGER,        -- Unilateral Minimum Resale Price
      ADD COLUMN IF NOT EXISTS pmap_cents INTEGER,        -- Premium MAP (higher tier MAP)

      -- Promotional pricing
      ADD COLUMN IF NOT EXISTS promo_price_cents INTEGER,
      ADD COLUMN IF NOT EXISTS promo_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS promo_start_date DATE,
      ADD COLUMN IF NOT EXISTS promo_end_date DATE,

      -- Margin controls
      ADD COLUMN IF NOT EXISTS min_margin_percent DECIMAL(5,2) DEFAULT 10.00,
      ADD COLUMN IF NOT EXISTS target_margin_percent DECIMAL(5,2) DEFAULT 20.00,

      -- Price metadata
      ADD COLUMN IF NOT EXISTS price_effective_date DATE,
      ADD COLUMN IF NOT EXISTS price_expiry_date DATE,
      ADD COLUMN IF NOT EXISTS price_source VARCHAR(50),      -- dealer_portal, csv_import, manual
      ADD COLUMN IF NOT EXISTS price_last_updated TIMESTAMP,
      ADD COLUMN IF NOT EXISTS price_update_notes TEXT;
    `);
    console.log('   ✓ Pricing columns added to products\n');

    // =====================================================
    // 2. CREATE PRODUCT METRICS TABLE
    // =====================================================
    console.log('2. Creating product_metrics table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_metrics (
        id SERIAL PRIMARY KEY,
        product_id INTEGER UNIQUE NOT NULL REFERENCES products(id) ON DELETE CASCADE,

        -- Sales velocity
        qty_sold_7d INTEGER DEFAULT 0,
        qty_sold_30d INTEGER DEFAULT 0,
        qty_sold_90d INTEGER DEFAULT 0,
        qty_sold_365d INTEGER DEFAULT 0,

        -- Revenue
        revenue_30d_cents INTEGER DEFAULT 0,
        revenue_90d_cents INTEGER DEFAULT 0,
        revenue_365d_cents INTEGER DEFAULT 0,

        -- Quote metrics
        qty_quoted_30d INTEGER DEFAULT 0,
        quotes_won_30d INTEGER DEFAULT 0,
        quotes_lost_30d INTEGER DEFAULT 0,
        win_rate_30d DECIMAL(5,2),

        -- Pricing metrics
        avg_sell_price_cents INTEGER,
        min_sell_price_30d_cents INTEGER,
        max_sell_price_30d_cents INTEGER,
        avg_margin_percent DECIMAL(5,2),

        -- Demand classification
        demand_tag VARCHAR(30),
        -- Values: fast_mover, steady, slow_mover, dead_stock, new, seasonal

        -- Stock risk
        days_of_stock INTEGER,       -- Based on sales velocity
        stockout_risk VARCHAR(20),   -- low, medium, high, critical
        overstock_flag BOOLEAN DEFAULT false,

        -- Calculation tracking
        last_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        calculation_notes TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ product_metrics table created\n');

    // =====================================================
    // 3. CREATE PRICE POINT HISTORY TABLE
    // (Named price_point_history to avoid conflict with existing price_history table)
    // =====================================================
    console.log('3. Creating price_point_history table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_point_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,

        -- Price snapshot
        cost_cents INTEGER,
        msrp_cents INTEGER,
        map_cents INTEGER,
        lap_cents INTEGER,
        umrp_cents INTEGER,
        pmap_cents INTEGER,
        promo_price_cents INTEGER,

        -- Change tracking
        change_type VARCHAR(30), -- cost_update, msrp_update, map_update, promo_add, promo_remove
        change_source VARCHAR(50), -- csv_import, manual, api, dealer_portal
        change_reason TEXT,

        -- Audit
        effective_date DATE DEFAULT CURRENT_DATE,
        changed_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ price_point_history table created\n');

    // =====================================================
    // 4. CREATE PRICE VIOLATION LOG TABLE
    // =====================================================
    console.log('4. Creating price_violations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_violations (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,

        -- Violation details
        violation_type VARCHAR(30) NOT NULL,
        -- Values: below_map, below_umrp, below_lap, below_cost, below_min_margin

        quoted_price_cents INTEGER NOT NULL,
        threshold_price_cents INTEGER NOT NULL, -- The price that was violated
        difference_cents INTEGER NOT NULL,      -- How much below threshold

        -- Resolution
        status VARCHAR(20) DEFAULT 'pending',   -- pending, approved, rejected, auto_approved
        approved_by VARCHAR(255),
        approval_notes TEXT,
        resolved_at TIMESTAMP,

        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ price_violations table created\n');

    // =====================================================
    // 5. CREATE INDEXES
    // =====================================================
    console.log('5. Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_product_metrics_product ON product_metrics(product_id);
      CREATE INDEX IF NOT EXISTS idx_product_metrics_demand ON product_metrics(demand_tag);
      CREATE INDEX IF NOT EXISTS idx_product_metrics_stockout ON product_metrics(stockout_risk);

      CREATE INDEX IF NOT EXISTS idx_price_point_history_product ON price_point_history(product_id);
      CREATE INDEX IF NOT EXISTS idx_price_point_history_date ON price_point_history(effective_date);

      CREATE INDEX IF NOT EXISTS idx_price_violations_product ON price_violations(product_id);
      CREATE INDEX IF NOT EXISTS idx_price_violations_quote ON price_violations(quotation_id);
      CREATE INDEX IF NOT EXISTS idx_price_violations_status ON price_violations(status);

      CREATE INDEX IF NOT EXISTS idx_products_map ON products(map_cents);
      CREATE INDEX IF NOT EXISTS idx_products_promo ON products(promo_price_cents) WHERE promo_price_cents IS NOT NULL;
    `);
    console.log('   ✓ Indexes created\n');

    // =====================================================
    // 6. ADD PRICE TRACKING TO QUOTATION ITEMS
    // =====================================================
    console.log('6. Adding price tracking to quotation_items...');
    await client.query(`
      ALTER TABLE quotation_items
      ADD COLUMN IF NOT EXISTS price_source VARCHAR(30),      -- msrp, map, promo, custom, negotiated
      ADD COLUMN IF NOT EXISTS margin_percent DECIMAL(5,2),
      ADD COLUMN IF NOT EXISTS map_at_quote INTEGER,
      ADD COLUMN IF NOT EXISTS msrp_at_quote INTEGER,
      ADD COLUMN IF NOT EXISTS cost_at_quote INTEGER,
      ADD COLUMN IF NOT EXISTS has_violation BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS violation_type VARCHAR(30);
    `);
    console.log('   ✓ Quotation items updated\n');

    await client.query('COMMIT');
    console.log('✅ Pricing Fields migration completed successfully!');

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
