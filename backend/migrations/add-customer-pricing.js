/**
 * Migration: Add Customer Pricing System
 * Creates customer price tiers, negotiated prices, and purchase history tables
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
    console.log('Starting Customer Pricing Migration...\n');

    // =====================================================
    // 1. CREATE CUSTOMER PRICE TIERS TABLE
    // =====================================================
    console.log('1. Creating customer_price_tiers table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_price_tiers (
        id SERIAL PRIMARY KEY,
        tier_name VARCHAR(100) NOT NULL UNIQUE,
        tier_code VARCHAR(20) UNIQUE,
        description TEXT,

        -- Default discounts
        discount_percent DECIMAL(5,2) DEFAULT 0,
        discount_type VARCHAR(20) DEFAULT 'percent', -- percent, fixed_amount

        -- Margin controls
        margin_floor_percent DECIMAL(5,2),  -- Minimum margin allowed
        margin_target_percent DECIMAL(5,2), -- Target margin for recommendations

        -- Pricing rules
        use_map_as_floor BOOLEAN DEFAULT true,
        allow_below_map BOOLEAN DEFAULT false,
        requires_approval_below_margin BOOLEAN DEFAULT true,

        -- Access
        priority INTEGER DEFAULT 0,  -- Higher = better pricing
        is_active BOOLEAN DEFAULT true,

        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ customer_price_tiers table created\n');

    // =====================================================
    // 2. ADD TIER TO CUSTOMERS TABLE
    // =====================================================
    console.log('2. Adding price tier to customers...');
    await client.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS price_tier_id INTEGER REFERENCES customer_price_tiers(id),
      ADD COLUMN IF NOT EXISTS custom_discount_percent DECIMAL(5,2),
      ADD COLUMN IF NOT EXISTS pricing_notes TEXT,
      ADD COLUMN IF NOT EXISTS is_tax_exempt BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS tax_exempt_number VARCHAR(50);
    `);
    console.log('   ✓ Customers table updated\n');

    // =====================================================
    // 3. CREATE CUSTOMER NEGOTIATED PRICES TABLE
    // =====================================================
    console.log('3. Creating customer_negotiated_prices table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_negotiated_prices (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,

        -- Pricing
        negotiated_price_cents INTEGER NOT NULL,
        original_price_cents INTEGER,  -- What it would have been without negotiation
        discount_percent DECIMAL(5,2), -- Calculated discount from MSRP

        -- Validity
        valid_from DATE DEFAULT CURRENT_DATE,
        valid_until DATE,
        is_active BOOLEAN DEFAULT true,

        -- Quantity-based pricing
        min_quantity INTEGER DEFAULT 1,
        max_quantity INTEGER,

        -- Approval
        approved_by VARCHAR(255),
        approved_at TIMESTAMP,
        approval_notes TEXT,

        -- Context
        negotiation_reason TEXT,
        contract_reference VARCHAR(100),

        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(customer_id, product_id, valid_from)
      )
    `);
    console.log('   ✓ customer_negotiated_prices table created\n');

    // =====================================================
    // 4. CREATE CUSTOMER PRODUCT HISTORY TABLE
    // =====================================================
    console.log('4. Creating customer_product_history table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_product_history (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,

        -- Purchase stats
        times_purchased INTEGER DEFAULT 0,
        total_qty_purchased INTEGER DEFAULT 0,
        first_purchase_date DATE,
        last_purchase_date DATE,

        -- Pricing history
        avg_price_paid_cents INTEGER,
        min_price_paid_cents INTEGER,
        max_price_paid_cents INTEGER,
        last_price_paid_cents INTEGER,

        -- Quote history
        times_quoted INTEGER DEFAULT 0,
        times_won INTEGER DEFAULT 0,
        times_lost INTEGER DEFAULT 0,
        last_quoted_date DATE,
        last_quoted_price_cents INTEGER,

        -- Calculated metrics
        avg_discount_percent DECIMAL(5,2),
        lifetime_value_cents INTEGER DEFAULT 0,

        last_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(customer_id, product_id)
      )
    `);
    console.log('   ✓ customer_product_history table created\n');

    // =====================================================
    // 5. CREATE CUSTOMER CATEGORY DISCOUNTS TABLE
    // =====================================================
    console.log('5. Creating customer_category_discounts table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_category_discounts (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        category VARCHAR(100) NOT NULL,
        subcategory VARCHAR(100),
        manufacturer VARCHAR(100),

        -- Discount
        discount_percent DECIMAL(5,2) NOT NULL,
        discount_type VARCHAR(20) DEFAULT 'percent',

        -- Validity
        valid_from DATE DEFAULT CURRENT_DATE,
        valid_until DATE,
        is_active BOOLEAN DEFAULT true,

        -- Approval
        approved_by VARCHAR(255),
        notes TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(customer_id, category, subcategory, manufacturer)
      )
    `);
    console.log('   ✓ customer_category_discounts table created\n');

    // =====================================================
    // 6. CREATE INDEXES
    // =====================================================
    console.log('6. Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_price_tiers_active ON customer_price_tiers(is_active);
      CREATE INDEX IF NOT EXISTS idx_price_tiers_priority ON customer_price_tiers(priority);

      CREATE INDEX IF NOT EXISTS idx_customers_tier ON customers(price_tier_id);

      CREATE INDEX IF NOT EXISTS idx_negotiated_prices_customer ON customer_negotiated_prices(customer_id);
      CREATE INDEX IF NOT EXISTS idx_negotiated_prices_product ON customer_negotiated_prices(product_id);
      CREATE INDEX IF NOT EXISTS idx_negotiated_prices_active ON customer_negotiated_prices(customer_id, product_id)
        WHERE is_active = true;

      CREATE INDEX IF NOT EXISTS idx_product_history_customer ON customer_product_history(customer_id);
      CREATE INDEX IF NOT EXISTS idx_product_history_product ON customer_product_history(product_id);
      CREATE INDEX IF NOT EXISTS idx_product_history_recent ON customer_product_history(last_purchase_date);

      CREATE INDEX IF NOT EXISTS idx_category_discounts_customer ON customer_category_discounts(customer_id);
      CREATE INDEX IF NOT EXISTS idx_category_discounts_active ON customer_category_discounts(is_active)
        WHERE is_active = true;
    `);
    console.log('   ✓ Indexes created\n');

    // =====================================================
    // 7. INSERT DEFAULT PRICE TIERS
    // =====================================================
    console.log('7. Inserting default price tiers...');
    await client.query(`
      INSERT INTO customer_price_tiers (tier_name, tier_code, description, discount_percent, margin_floor_percent, priority)
      VALUES
        ('Standard', 'STD', 'Regular retail customers', 0, 15.00, 0),
        ('Preferred', 'PREF', 'Repeat customers with good history', 5.00, 12.00, 10),
        ('VIP', 'VIP', 'High-value customers', 10.00, 10.00, 20),
        ('Trade', 'TRADE', 'Contractors and trade professionals', 15.00, 8.00, 30),
        ('Builder', 'BUILD', 'Builders and developers', 20.00, 5.00, 40)
      ON CONFLICT (tier_name) DO NOTHING;
    `);
    console.log('   ✓ Default price tiers inserted\n');

    await client.query('COMMIT');
    console.log('✅ Customer Pricing migration completed successfully!');

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
