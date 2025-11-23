/**
 * REVENUE FEATURES MIGRATION
 * Creates all tables needed for:
 * 1. Delivery & Installation
 * 2. Extended Warranties
 * 3. Financing Plans
 * 4. Manufacturer Rebates
 * 5. Enhanced Package Deals
 * 6. Trade-In Values
 * 7. Sales Commission Tracking
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function createRevenueTables() {
  console.log('🚀 Creating Revenue Features Tables...\n');

  try {
    // ============================================
    // 1. DELIVERY & INSTALLATION SERVICES
    // ============================================
    console.log('📦 Creating delivery services tables...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivery_services (
        id SERIAL PRIMARY KEY,
        service_type VARCHAR(100) NOT NULL,
        service_name VARCHAR(255) NOT NULL,
        base_price_cents BIGINT DEFAULT 0,
        per_mile_cents BIGINT DEFAULT 0,
        per_floor_cents BIGINT DEFAULT 0,
        weekend_premium_percent DECIMAL(5,2) DEFAULT 0,
        evening_premium_percent DECIMAL(5,2) DEFAULT 0,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS quote_delivery (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
        delivery_service_id INTEGER REFERENCES delivery_services(id),
        delivery_date DATE,
        delivery_time_slot VARCHAR(50),
        delivery_address TEXT,
        distance_miles DECIMAL(10,2) DEFAULT 0,
        floor_level INTEGER DEFAULT 1,
        weekend_delivery BOOLEAN DEFAULT false,
        evening_delivery BOOLEAN DEFAULT false,
        special_instructions TEXT,
        total_delivery_cost_cents BIGINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default delivery services
    await pool.query(`
      INSERT INTO delivery_services
      (service_type, service_name, base_price_cents, per_mile_cents, per_floor_cents, weekend_premium_percent, description)
      VALUES
      ('standard_delivery', 'Standard Delivery', 9900, 50, 2000, 20, 'Standard delivery within 5-7 business days'),
      ('express_delivery', 'Express Delivery (2-3 days)', 19900, 75, 2500, 25, 'Faster delivery within 2-3 business days'),
      ('white_glove', 'White Glove Service', 29900, 100, 3000, 30, 'Premium delivery with unpacking and setup'),
      ('basic_installation', 'Basic Installation', 7900, 0, 0, 0, 'Basic product installation and setup'),
      ('premium_installation', 'Premium Installation', 15900, 0, 0, 0, 'Full installation with testing and configuration'),
      ('wall_mount_tv', 'TV Wall Mount Installation', 12900, 0, 0, 0, 'Professional TV wall mounting service'),
      ('appliance_hookup', 'Appliance Connection', 8900, 0, 0, 0, 'Connect appliances (water, gas, electric)'),
      ('haul_away', 'Old Appliance Haul Away', 4900, 0, 0, 0, 'Remove and dispose of old appliance')
      ON CONFLICT DO NOTHING;
    `);

    console.log('✅ Delivery services tables created');

    // ============================================
    // 2. EXTENDED WARRANTIES
    // ============================================
    console.log('🛡️ Creating warranty tables...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS warranty_plans (
        id SERIAL PRIMARY KEY,
        plan_name VARCHAR(100) NOT NULL,
        duration_years INTEGER NOT NULL,
        product_category VARCHAR(100),
        price_tier_min_cents BIGINT DEFAULT 0,
        price_tier_max_cents BIGINT DEFAULT 999999999,
        warranty_cost_cents BIGINT NOT NULL,
        warranty_cost_percent DECIMAL(5,2),
        coverage_details TEXT,
        provider VARCHAR(100),
        terms_url TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS quote_warranties (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
        quote_item_id INTEGER,
        warranty_plan_id INTEGER REFERENCES warranty_plans(id),
        product_name VARCHAR(255),
        product_price_cents BIGINT,
        warranty_cost_cents BIGINT NOT NULL,
        coverage_start_date DATE,
        coverage_end_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default warranty plans
    await pool.query(`
      INSERT INTO warranty_plans
      (plan_name, duration_years, product_category, price_tier_min_cents, price_tier_max_cents, warranty_cost_cents, coverage_details)
      VALUES
      ('1-Year Protection', 1, 'appliance', 0, 50000, 9900, 'Complete coverage for 1 year including parts and labor'),
      ('2-Year Protection', 2, 'appliance', 0, 50000, 14900, 'Complete coverage for 2 years including parts and labor'),
      ('3-Year Protection', 3, 'appliance', 0, 50000, 19900, 'Complete coverage for 3 years including parts and labor'),
      ('5-Year Protection', 5, 'appliance', 0, 50000, 29900, 'Complete coverage for 5 years including parts and labor'),
      ('1-Year Protection', 1, 'appliance', 50000, 150000, 14900, 'Premium appliance protection for 1 year'),
      ('2-Year Protection', 2, 'appliance', 50000, 150000, 24900, 'Premium appliance protection for 2 years'),
      ('3-Year Protection', 3, 'appliance', 50000, 150000, 34900, 'Premium appliance protection for 3 years'),
      ('5-Year Protection', 5, 'appliance', 50000, 150000, 49900, 'Premium appliance protection for 5 years'),
      ('2-Year TV Protection', 2, 'tv', 0, 100000, 19900, 'Screen protection and full coverage for 2 years'),
      ('3-Year TV Protection', 3, 'tv', 0, 100000, 29900, 'Screen protection and full coverage for 3 years'),
      ('5-Year TV Protection', 5, 'tv', 0, 100000, 44900, 'Screen protection and full coverage for 5 years'),
      ('3-Year Furniture Protection', 3, 'furniture', 0, 200000, 14900, 'Stain and damage protection for 3 years'),
      ('5-Year Furniture Protection', 5, 'furniture', 0, 200000, 24900, 'Stain and damage protection for 5 years')
      ON CONFLICT DO NOTHING;
    `);

    console.log('✅ Warranty tables created');

    // ============================================
    // 3. FINANCING PLANS
    // ============================================
    console.log('💳 Creating financing tables...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS financing_plans (
        id SERIAL PRIMARY KEY,
        plan_name VARCHAR(100) NOT NULL,
        provider VARCHAR(100),
        term_months INTEGER NOT NULL,
        apr_percent DECIMAL(5,2) NOT NULL,
        min_purchase_cents BIGINT DEFAULT 0,
        max_purchase_cents BIGINT,
        promo_description TEXT,
        promo_end_date DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS quote_financing (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
        financing_plan_id INTEGER REFERENCES financing_plans(id),
        down_payment_cents BIGINT DEFAULT 0,
        financed_amount_cents BIGINT NOT NULL,
        monthly_payment_cents BIGINT NOT NULL,
        total_interest_cents BIGINT DEFAULT 0,
        total_cost_cents BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default financing plans
    await pool.query(`
      INSERT INTO financing_plans
      (plan_name, provider, term_months, apr_percent, min_purchase_cents, promo_description)
      VALUES
      ('12 Months Same as Cash', 'Store Credit', 12, 0.00, 50000, 'No interest if paid in full within 12 months'),
      ('18 Months Same as Cash', 'Store Credit', 18, 0.00, 100000, 'No interest if paid in full within 18 months'),
      ('24 Months Same as Cash', 'Store Credit', 24, 0.00, 150000, 'No interest if paid in full within 24 months'),
      ('24 Months 5.99% APR', 'Store Credit', 24, 5.99, 50000, 'Low APR financing for 24 months'),
      ('36 Months 7.99% APR', 'Store Credit', 36, 7.99, 50000, 'Extended financing for 36 months'),
      ('48 Months 9.99% APR', 'Store Credit', 48, 9.99, 100000, 'Long-term financing for large purchases')
      ON CONFLICT DO NOTHING;
    `);

    console.log('✅ Financing tables created');

    // ============================================
    // 4. MANUFACTURER REBATES
    // ============================================
    console.log('💰 Creating rebates tables...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS manufacturer_rebates (
        id SERIAL PRIMARY KEY,
        manufacturer VARCHAR(100) NOT NULL,
        rebate_name VARCHAR(255) NOT NULL,
        rebate_amount_cents BIGINT NOT NULL,
        rebate_percent DECIMAL(5,2),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        rebate_type VARCHAR(50) DEFAULT 'instant',
        qualifying_products JSONB,
        min_purchase_amount_cents BIGINT DEFAULT 0,
        max_rebate_cents BIGINT,
        terms_conditions TEXT,
        redemption_url TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS quote_rebates (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
        rebate_id INTEGER REFERENCES manufacturer_rebates(id),
        rebate_amount_cents BIGINT NOT NULL,
        rebate_status VARCHAR(50) DEFAULT 'pending',
        redemption_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert sample rebates
    await pool.query(`
      INSERT INTO manufacturer_rebates
      (manufacturer, rebate_name, rebate_amount_cents, start_date, end_date, rebate_type, terms_conditions)
      VALUES
      ('Samsung', 'Kitchen Package Rebate', 50000, CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days', 'mail_in', 'Buy 4 qualifying Samsung appliances, get $500 rebate'),
      ('LG', 'Buy More Save More', 100000, CURRENT_DATE, CURRENT_DATE + INTERVAL '60 days', 'instant', 'Instant $1,000 off when you buy 4+ LG appliances'),
      ('Whirlpool', 'Energy Star Rebate', 10000, CURRENT_DATE, CURRENT_DATE + INTERVAL '365 days', 'mail_in', '$100 rebate on Energy Star certified appliances'),
      ('Sony', 'TV Trade-In Bonus', 30000, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'instant', 'Extra $300 when you trade in any TV'),
      ('GE', 'Spring Sale Rebate', 75000, CURRENT_DATE, CURRENT_DATE + INTERVAL '45 days', 'instant', '$750 instant rebate on select GE appliance packages')
      ON CONFLICT DO NOTHING;
    `);

    console.log('✅ Rebates tables created');

    // ============================================
    // 5. ENHANCED PACKAGE DEALS
    // ============================================
    console.log('📦 Creating package deals tables...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_bundles (
        id SERIAL PRIMARY KEY,
        bundle_name VARCHAR(255) NOT NULL,
        bundle_description TEXT,
        bundle_category VARCHAR(100),
        bundle_discount_percent DECIMAL(5,2) DEFAULT 0,
        bundle_discount_fixed_cents BIGINT DEFAULT 0,
        bundle_image_url TEXT,
        is_featured BOOLEAN DEFAULT false,
        valid_from DATE DEFAULT CURRENT_DATE,
        valid_until DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bundle_items (
        id SERIAL PRIMARY KEY,
        bundle_id INTEGER REFERENCES product_bundles(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER DEFAULT 1,
        is_required BOOLEAN DEFAULT true,
        alternative_products JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Package deals tables created');

    // ============================================
    // 6. TRADE-IN VALUES
    // ============================================
    console.log('🔄 Creating trade-in tables...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS trade_in_values (
        id SERIAL PRIMARY KEY,
        product_category VARCHAR(100) NOT NULL,
        brand VARCHAR(100),
        age_years INTEGER NOT NULL,
        condition VARCHAR(50) NOT NULL,
        estimated_value_cents BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS quote_trade_ins (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
        product_description TEXT NOT NULL,
        brand VARCHAR(100),
        model VARCHAR(100),
        age_years INTEGER,
        condition VARCHAR(50),
        trade_in_value_cents BIGINT DEFAULT 0,
        photos JSONB,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert sample trade-in values
    await pool.query(`
      INSERT INTO trade_in_values
      (product_category, brand, age_years, condition, estimated_value_cents)
      VALUES
      ('refrigerator', 'Any', 0, 'excellent', 30000),
      ('refrigerator', 'Any', 0, 'good', 25000),
      ('refrigerator', 'Any', 0, 'fair', 15000),
      ('refrigerator', 'Any', 1, 'excellent', 25000),
      ('refrigerator', 'Any', 1, 'good', 20000),
      ('refrigerator', 'Any', 1, 'fair', 12000),
      ('refrigerator', 'Any', 2, 'excellent', 20000),
      ('refrigerator', 'Any', 2, 'good', 15000),
      ('refrigerator', 'Any', 2, 'fair', 10000),
      ('refrigerator', 'Any', 5, 'good', 10000),
      ('refrigerator', 'Any', 5, 'fair', 5000),
      ('tv', 'Any', 0, 'excellent', 50000),
      ('tv', 'Any', 0, 'good', 40000),
      ('tv', 'Any', 1, 'excellent', 40000),
      ('tv', 'Any', 1, 'good', 30000),
      ('tv', 'Any', 2, 'good', 20000),
      ('tv', 'Any', 3, 'good', 15000),
      ('washer', 'Any', 0, 'excellent', 20000),
      ('washer', 'Any', 0, 'good', 15000),
      ('dryer', 'Any', 0, 'excellent', 20000),
      ('dryer', 'Any', 0, 'good', 15000)
      ON CONFLICT DO NOTHING;
    `);

    console.log('✅ Trade-in tables created');

    // ============================================
    // 7. SALES COMMISSION TRACKING
    // ============================================
    console.log('💼 Creating commission tracking tables...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales_reps (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        employee_id VARCHAR(50) UNIQUE,
        commission_tier VARCHAR(50) DEFAULT 'standard',
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_rules (
        id SERIAL PRIMARY KEY,
        rule_name VARCHAR(100) NOT NULL,
        product_category VARCHAR(100),
        commission_percent DECIMAL(5,2) DEFAULT 0,
        flat_commission_cents BIGINT DEFAULT 0,
        warranty_commission_percent DECIMAL(5,2) DEFAULT 0,
        delivery_commission_percent DECIMAL(5,2) DEFAULT 0,
        min_sale_cents BIGINT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS quote_sales_reps (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
        sales_rep_id INTEGER REFERENCES sales_reps(id),
        commission_cents BIGINT DEFAULT 0,
        commission_paid BOOLEAN DEFAULT false,
        paid_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default commission rules
    await pool.query(`
      INSERT INTO commission_rules
      (rule_name, product_category, commission_percent, warranty_commission_percent, delivery_commission_percent)
      VALUES
      ('Appliance Standard', 'appliance', 5.00, 20.00, 10.00),
      ('TV Standard', 'tv', 4.00, 20.00, 10.00),
      ('Furniture Standard', 'furniture', 6.00, 20.00, 15.00),
      ('AV Equipment Standard', 'av', 5.00, 20.00, 10.00),
      ('Default Commission', NULL, 5.00, 20.00, 10.00)
      ON CONFLICT DO NOTHING;
    `);

    console.log('✅ Commission tracking tables created');

    // ============================================
    // CREATE INDEXES FOR PERFORMANCE
    // ============================================
    console.log('⚡ Creating indexes...');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_delivery_quote_id ON quote_delivery(quote_id);
      CREATE INDEX IF NOT EXISTS idx_quote_warranties_quote_id ON quote_warranties(quote_id);
      CREATE INDEX IF NOT EXISTS idx_quote_financing_quote_id ON quote_financing(quote_id);
      CREATE INDEX IF NOT EXISTS idx_quote_rebates_quote_id ON quote_rebates(quote_id);
      CREATE INDEX IF NOT EXISTS idx_quote_trade_ins_quote_id ON quote_trade_ins(quote_id);
      CREATE INDEX IF NOT EXISTS idx_quote_sales_reps_quote_id ON quote_sales_reps(quote_id);
      CREATE INDEX IF NOT EXISTS idx_quote_sales_reps_sales_rep_id ON quote_sales_reps(sales_rep_id);
      CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle_id ON bundle_items(bundle_id);
      CREATE INDEX IF NOT EXISTS idx_manufacturer_rebates_active ON manufacturer_rebates(is_active, end_date);
    `);

    console.log('✅ Indexes created');

    console.log('\n🎉 SUCCESS! All revenue features tables created!\n');
    console.log('📊 Summary:');
    console.log('   ✅ Delivery & Installation: 2 tables + 8 default services');
    console.log('   ✅ Extended Warranties: 2 tables + 13 warranty plans');
    console.log('   ✅ Financing Plans: 2 tables + 6 financing options');
    console.log('   ✅ Manufacturer Rebates: 2 tables + 5 sample rebates');
    console.log('   ✅ Package Deals: 2 tables');
    console.log('   ✅ Trade-In Values: 2 tables + 21 value estimates');
    console.log('   ✅ Commission Tracking: 3 tables + 5 commission rules');
    console.log('   ✅ Performance indexes created');
    console.log('\n🚀 Your app is now ready to CRUSH the competition!\n');

  } catch (error) {
    console.error('❌ Error creating tables:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the migration
createRevenueTables()
  .then(() => {
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
