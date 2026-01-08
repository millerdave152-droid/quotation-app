/**
 * Migration: Add AI Personalization Tables
 *
 * Creates tables for:
 * - Dynamic pricing rules
 * - Product affinity/correlation (for upselling)
 * - Customer behavior tracking
 * - Recommendation history
 */

const pool = require('../db');

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating AI personalization tables...');

    // Dynamic Pricing Rules Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS dynamic_pricing_rules (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        rule_type VARCHAR(50) NOT NULL,
        scope_type VARCHAR(50) DEFAULT 'all',
        scope_product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        scope_category VARCHAR(100),
        scope_manufacturer VARCHAR(100),
        adjustment_type VARCHAR(20) DEFAULT 'percent',
        min_adjustment DECIMAL(10, 4) DEFAULT -20,
        max_adjustment DECIMAL(10, 4) DEFAULT 20,
        priority INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  - Created dynamic_pricing_rules table');

    // Dynamic Pricing Conditions Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS dynamic_pricing_conditions (
        id SERIAL PRIMARY KEY,
        rule_id INTEGER REFERENCES dynamic_pricing_rules(id) ON DELETE CASCADE,
        condition_type VARCHAR(50) NOT NULL,
        operator VARCHAR(20) NOT NULL,
        threshold_value DECIMAL(15, 4),
        threshold_unit VARCHAR(20),
        adjustment_value DECIMAL(10, 4) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  - Created dynamic_pricing_conditions table');

    // Product Affinity Table (for upselling correlations)
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_affinity (
        id SERIAL PRIMARY KEY,
        source_product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        target_product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        affinity_type VARCHAR(50) DEFAULT 'frequently_bought_together',
        affinity_score DECIMAL(5, 4) DEFAULT 0,
        purchase_count INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        conversion_rate DECIMAL(5, 4) DEFAULT 0,
        is_manual BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_product_id, target_product_id, affinity_type)
      )
    `);
    console.log('  - Created product_affinity table');

    // Category Affinity Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS category_affinity (
        id SERIAL PRIMARY KEY,
        source_category VARCHAR(100) NOT NULL,
        target_category VARCHAR(100) NOT NULL,
        affinity_score DECIMAL(5, 4) DEFAULT 0,
        recommendation_text TEXT,
        is_active BOOLEAN DEFAULT true,
        UNIQUE(source_category, target_category)
      )
    `);
    console.log('  - Created category_affinity table');

    // Customer Behavior Tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_behavior (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        category VARCHAR(100),
        manufacturer VARCHAR(100),
        event_data JSONB DEFAULT '{}',
        session_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  - Created customer_behavior table');

    // Customer Preferences (learned from behavior)
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_preferences (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        preference_type VARCHAR(50) NOT NULL,
        preference_value VARCHAR(255) NOT NULL,
        confidence_score DECIMAL(5, 4) DEFAULT 0,
        occurrence_count INTEGER DEFAULT 1,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(customer_id, preference_type, preference_value)
      )
    `);
    console.log('  - Created customer_preferences table');

    // Recommendation History
    await client.query(`
      CREATE TABLE IF NOT EXISTS recommendation_history (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
        recommendation_type VARCHAR(50) NOT NULL,
        recommended_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        source_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        recommendation_reason TEXT,
        confidence_score DECIMAL(5, 4),
        was_accepted BOOLEAN DEFAULT false,
        was_viewed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  - Created recommendation_history table');

    // Upsell Rules Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS upsell_rules (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        trigger_type VARCHAR(50) NOT NULL,
        trigger_category VARCHAR(100),
        trigger_manufacturer VARCHAR(100),
        trigger_min_price_cents INTEGER,
        trigger_min_quantity INTEGER,
        recommendation_type VARCHAR(50) NOT NULL,
        recommendation_category VARCHAR(100),
        recommendation_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        recommendation_text TEXT,
        discount_percent DECIMAL(5, 2),
        priority INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  - Created upsell_rules table');

    // Price Adjustment History (for analytics)
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_adjustment_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
        original_price_cents INTEGER NOT NULL,
        adjusted_price_cents INTEGER NOT NULL,
        adjustment_percent DECIMAL(10, 4),
        rule_id INTEGER REFERENCES dynamic_pricing_rules(id) ON DELETE SET NULL,
        adjustment_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  - Created price_adjustment_history table');

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dynamic_rules_type ON dynamic_pricing_rules(rule_type, is_active);
      CREATE INDEX IF NOT EXISTS idx_dynamic_rules_scope ON dynamic_pricing_rules(scope_type);
      CREATE INDEX IF NOT EXISTS idx_pricing_conditions_rule ON dynamic_pricing_conditions(rule_id);
      CREATE INDEX IF NOT EXISTS idx_affinity_source ON product_affinity(source_product_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_affinity_target ON product_affinity(target_product_id);
      CREATE INDEX IF NOT EXISTS idx_customer_behavior_customer ON customer_behavior(customer_id);
      CREATE INDEX IF NOT EXISTS idx_customer_behavior_product ON customer_behavior(product_id);
      CREATE INDEX IF NOT EXISTS idx_customer_behavior_type ON customer_behavior(event_type);
      CREATE INDEX IF NOT EXISTS idx_customer_prefs_customer ON customer_preferences(customer_id);
      CREATE INDEX IF NOT EXISTS idx_recommendation_customer ON recommendation_history(customer_id);
      CREATE INDEX IF NOT EXISTS idx_recommendation_quote ON recommendation_history(quotation_id);
      CREATE INDEX IF NOT EXISTS idx_upsell_rules_trigger ON upsell_rules(trigger_type, is_active);
      CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_adjustment_history(product_id);
    `);
    console.log('  - Created indexes');

    // Insert default category affinities
    await client.query(`
      INSERT INTO category_affinity (source_category, target_category, affinity_score, recommendation_text)
      VALUES
        ('Refrigerators', 'Water Filters', 0.8, 'Protect your investment with genuine water filters'),
        ('Ranges', 'Range Hoods', 0.9, 'Complete your kitchen with a matching range hood'),
        ('Washers', 'Dryers', 0.95, 'Bundle with a matching dryer for the perfect laundry pair'),
        ('Dishwashers', 'Dishwasher Accessories', 0.7, 'Add dishwasher pods and rinse aid'),
        ('TVs', 'Soundbars', 0.85, 'Enhance your audio with a premium soundbar'),
        ('TVs', 'TV Mounts', 0.75, 'Wall mount your TV for a clean look'),
        ('Refrigerators', 'Extended Warranty', 0.6, 'Protect your refrigerator with extended coverage'),
        ('Ranges', 'Cookware Sets', 0.5, 'Start cooking with a professional cookware set')
      ON CONFLICT (source_category, target_category) DO NOTHING
    `);
    console.log('  - Inserted default category affinities');

    // Insert default upsell rules
    await client.query(`
      INSERT INTO upsell_rules (name, trigger_type, trigger_category, recommendation_type, recommendation_category, recommendation_text, discount_percent, priority)
      VALUES
        ('Washer to Dryer Bundle', 'category', 'Washers', 'category', 'Dryers', 'Complete your laundry setup! Add a matching dryer and save.', 5, 100),
        ('Range to Hood Bundle', 'category', 'Ranges', 'category', 'Range Hoods', 'Don''t forget proper ventilation! Add a range hood.', 3, 90),
        ('TV to Soundbar Bundle', 'category', 'TVs', 'category', 'Soundbars', 'Upgrade your audio experience with a premium soundbar.', 5, 85),
        ('Premium Appliance Protection', 'price_threshold', NULL, 'service', NULL, 'Protect your investment with our Premium Protection Plan.', NULL, 50),
        ('Bulk Delivery Savings', 'quantity_threshold', NULL, 'service', NULL, 'Qualify for free delivery on orders of 3+ appliances!', NULL, 40)
    `);
    console.log('  - Inserted default upsell rules');

    // Insert default dynamic pricing rules
    await client.query(`
      INSERT INTO dynamic_pricing_rules (name, description, rule_type, scope_type, adjustment_type, min_adjustment, max_adjustment, priority)
      VALUES
        ('High Margin Protection', 'Prevent excessive discounting on high-margin items', 'margin_protection', 'all', 'percent', -15, 0, 100),
        ('Slow Mover Discount', 'Auto-discount products with low sales velocity', 'inventory_velocity', 'all', 'percent', -10, 0, 80),
        ('Premium Brand Premium', 'Maintain premium pricing on luxury brands', 'brand_tier', 'manufacturer', 'percent', 0, 5, 70),
        ('Bundle Incentive', 'Discount when purchasing multiple items', 'bundle_size', 'all', 'percent', -8, 0, 60)
    `);
    console.log('  - Inserted default dynamic pricing rules');

    await client.query('COMMIT');
    console.log('\nAI personalization migration completed successfully!');

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
