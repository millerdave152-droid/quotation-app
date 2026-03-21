/**
 * Migration: Add Advanced Pricing Tables
 *
 * Creates tables for:
 * - Volume discount rules and tiers
 * - Promotions and usage tracking
 * - Stacking policies
 */

const pool = require('../db');

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating advanced pricing tables...');

    // Volume Discount Rules Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS volume_discount_rules (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        scope_type VARCHAR(50) NOT NULL DEFAULT 'all',
        scope_product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        scope_category VARCHAR(100),
        scope_manufacturer VARCHAR(100),
        discount_type VARCHAR(20) DEFAULT 'percent',
        is_active BOOLEAN DEFAULT true,
        valid_from TIMESTAMP,
        valid_until TIMESTAMP,
        priority INTEGER DEFAULT 0,
        can_stack BOOLEAN DEFAULT true,
        stacking_group VARCHAR(50),
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  - Created volume_discount_rules table');

    // Volume Discount Tiers Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS volume_discount_tiers (
        id SERIAL PRIMARY KEY,
        rule_id INTEGER REFERENCES volume_discount_rules(id) ON DELETE CASCADE,
        min_quantity INTEGER NOT NULL,
        max_quantity INTEGER,
        discount_value DECIMAL(10, 4) NOT NULL,
        display_label VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  - Created volume_discount_tiers table');

    // Promotions Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS promotions (
        id SERIAL PRIMARY KEY,
        promo_code VARCHAR(50) UNIQUE,
        promo_name VARCHAR(255) NOT NULL,
        description TEXT,
        promo_type VARCHAR(50) NOT NULL DEFAULT 'general',
        scope_type VARCHAR(50) NOT NULL DEFAULT 'all',
        scope_value TEXT,
        discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
        discount_value DECIMAL(10, 4) NOT NULL,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        auto_activate BOOLEAN DEFAULT true,
        max_uses_total INTEGER,
        max_uses_per_customer INTEGER,
        current_uses INTEGER DEFAULT 0,
        min_purchase_cents INTEGER,
        max_discount_cents INTEGER,
        min_quantity INTEGER,
        can_stack BOOLEAN DEFAULT false,
        stacking_group VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  - Created promotions table');

    // Promotion Usage Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS promotion_usage (
        id SERIAL PRIMARY KEY,
        promotion_id INTEGER REFERENCES promotions(id) ON DELETE CASCADE,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        discount_applied_cents INTEGER NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  - Created promotion_usage table');

    // Stacking Policy Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS stacking_policies (
        id SERIAL PRIMARY KEY,
        policy_name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        max_total_discount_percent DECIMAL(5, 2) DEFAULT 50.00,
        min_margin_after_discounts_percent DECIMAL(5, 2) DEFAULT 5.00,
        max_stackable_discounts INTEGER DEFAULT 3,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  - Created stacking_policies table');

    // Applied Discounts Table (for tracking what was applied to each quote item)
    await client.query(`
      CREATE TABLE IF NOT EXISTS applied_discounts (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
        quotation_item_id INTEGER,
        discount_source VARCHAR(50) NOT NULL,
        source_id INTEGER,
        discount_type VARCHAR(20) NOT NULL,
        discount_value DECIMAL(10, 4) NOT NULL,
        discount_amount_cents INTEGER NOT NULL,
        original_price_cents INTEGER NOT NULL,
        final_price_cents INTEGER NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  - Created applied_discounts table');

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_volume_rules_scope ON volume_discount_rules(scope_type, is_active);
      CREATE INDEX IF NOT EXISTS idx_volume_rules_dates ON volume_discount_rules(valid_from, valid_until);
      CREATE INDEX IF NOT EXISTS idx_volume_tiers_rule ON volume_discount_tiers(rule_id);
      CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions(promo_code) WHERE promo_code IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_promotions_dates ON promotions(start_date, end_date, is_active);
      CREATE INDEX IF NOT EXISTS idx_promotions_type ON promotions(promo_type, is_active);
      CREATE INDEX IF NOT EXISTS idx_promo_usage_promo ON promotion_usage(promotion_id);
      CREATE INDEX IF NOT EXISTS idx_promo_usage_customer ON promotion_usage(customer_id);
      CREATE INDEX IF NOT EXISTS idx_applied_discounts_quote ON applied_discounts(quotation_id);
    `);
    console.log('  - Created indexes');

    // Insert default stacking policy
    await client.query(`
      INSERT INTO stacking_policies (policy_name, description, max_total_discount_percent, min_margin_after_discounts_percent, max_stackable_discounts, is_active)
      VALUES ('Default Policy', 'Default stacking policy - allows up to 50% total discount with 5% minimum margin', 50.00, 5.00, 3, true)
      ON CONFLICT (policy_name) DO NOTHING
    `);
    console.log('  - Inserted default stacking policy');

    // Add pricing_adjustments column to quotation_items if not exists
    const checkColumn = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'quotation_items' AND column_name = 'pricing_adjustments'
    `);

    if (checkColumn.rows.length === 0) {
      await client.query(`
        ALTER TABLE quotation_items
        ADD COLUMN pricing_adjustments JSONB DEFAULT '[]'
      `);
      console.log('  - Added pricing_adjustments column to quotation_items');
    }

    // Add applied_promo_code column to quotations if not exists
    const checkPromoColumn = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'quotations' AND column_name = 'applied_promo_code'
    `);

    if (checkPromoColumn.rows.length === 0) {
      await client.query(`
        ALTER TABLE quotations
        ADD COLUMN applied_promo_code VARCHAR(50),
        ADD COLUMN promo_discount_cents INTEGER DEFAULT 0
      `);
      console.log('  - Added promo columns to quotations');
    }

    await client.query('COMMIT');
    console.log('\nAdvanced pricing migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('Migration finished');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
  });
