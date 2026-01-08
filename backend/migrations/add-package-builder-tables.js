/**
 * Package Builder Tables Migration
 * Creates tables for the guided package builder wizard
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
    console.log('🚀 Starting Package Builder migration...\n');

    await client.query('BEGIN');

    // ============================================
    // 1. PRODUCT EXTENDED ATTRIBUTES
    // ============================================
    console.log('📦 Creating product_extended_attributes table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_extended_attributes (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,

        -- Physical dimensions (inches * 10 for precision, e.g., 360 = 36.0")
        width_inches_x10 INTEGER,
        height_inches_x10 INTEGER,
        depth_inches_x10 INTEGER,
        capacity_cubic_ft_x10 INTEGER,

        -- Appliance attributes
        fuel_type VARCHAR(50),              -- 'gas', 'electric', 'dual', 'induction'
        db_level INTEGER,                   -- Decibel rating for dishwashers/appliances
        smart_level INTEGER DEFAULT 0,      -- 0=none, 1=basic WiFi, 2=full smart home
        finish VARCHAR(50),                 -- 'stainless', 'black_stainless', 'white', 'black', 'panel_ready'

        -- Features (booleans)
        has_ice_water VARCHAR(20),          -- 'door', 'inside', 'none'
        has_air_fry BOOLEAN DEFAULT false,
        has_convection BOOLEAN DEFAULT false,
        has_steam_clean BOOLEAN DEFAULT false,
        has_steam_feature BOOLEAN DEFAULT false,  -- For laundry
        is_stackable BOOLEAN DEFAULT false,       -- For laundry

        -- Quality/reliability tiers (admin-assigned)
        reliability_tier INTEGER DEFAULT 3,  -- 1=budget, 2=good, 3=better, 4=best, 5=premium
        quiet_tier INTEGER,                  -- 1-5, derived from dB levels

        -- Package tier suggestions
        package_tier VARCHAR(20),           -- 'good', 'better', 'best'

        -- Appliance category (for filtering)
        appliance_type VARCHAR(100),        -- 'refrigerator', 'range', 'dishwasher', 'washer', 'dryer'

        -- Bundle info
        bundle_sku VARCHAR(100),            -- Links to manufacturer combo deal
        bundle_discount_percent DECIMAL(5,2),

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(product_id)
      )
    `);

    // Create indexes for filtering
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pea_product ON product_extended_attributes(product_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pea_fuel ON product_extended_attributes(fuel_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pea_finish ON product_extended_attributes(finish)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pea_width ON product_extended_attributes(width_inches_x10)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pea_tier ON product_extended_attributes(package_tier)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pea_appliance ON product_extended_attributes(appliance_type)`);
    console.log('  ✅ product_extended_attributes created with indexes\n');

    // ============================================
    // 2. PACKAGE QUESTIONNAIRES
    // ============================================
    console.log('📝 Creating package_questionnaires table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS package_questionnaires (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        package_type VARCHAR(50) NOT NULL,  -- 'kitchen', 'laundry', 'full_house'
        version INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pq_type ON package_questionnaires(package_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pq_active ON package_questionnaires(is_active)`);
    console.log('  ✅ package_questionnaires created\n');

    // ============================================
    // 3. PACKAGE QUESTIONS
    // ============================================
    console.log('❓ Creating package_questions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS package_questions (
        id SERIAL PRIMARY KEY,
        questionnaire_id INTEGER NOT NULL REFERENCES package_questionnaires(id) ON DELETE CASCADE,
        question_key VARCHAR(100) NOT NULL,         -- e.g., 'use_case', 'priority', 'fridge_width'
        question_text VARCHAR(500) NOT NULL,
        question_type VARCHAR(50) NOT NULL,         -- 'single_select', 'multi_select', 'boolean'
        display_order INTEGER NOT NULL,
        is_required BOOLEAN DEFAULT true,
        max_selections INTEGER,                     -- For multi_select questions
        conditional_on_question_id INTEGER,         -- Show only if another question answered
        conditional_on_answers JSONB,               -- {"values": ["rental", "flip"]}
        help_text VARCHAR(500),
        icon VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pques_questionnaire ON package_questions(questionnaire_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pques_order ON package_questions(display_order)`);
    console.log('  ✅ package_questions created\n');

    // ============================================
    // 4. PACKAGE QUESTION OPTIONS
    // ============================================
    console.log('🔘 Creating package_question_options table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS package_question_options (
        id SERIAL PRIMARY KEY,
        question_id INTEGER NOT NULL REFERENCES package_questions(id) ON DELETE CASCADE,
        option_key VARCHAR(100) NOT NULL,           -- e.g., 'own_home', '30_inch'
        option_text VARCHAR(255) NOT NULL,
        option_icon VARCHAR(50),
        display_order INTEGER NOT NULL,

        -- Filter/scoring mappings (JSONB)
        hard_filter JSONB,                          -- {"category": "Refrigerators", "width_inches_x10": {"min": 290, "max": 310}}
        soft_score JSONB,                           -- {"reliability_tier": {"weight": 2, "prefer": "high"}}

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pqo_question ON package_question_options(question_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pqo_order ON package_question_options(display_order)`);
    console.log('  ✅ package_question_options created\n');

    // ============================================
    // 5. PACKAGE SESSIONS
    // ============================================
    console.log('💾 Creating package_sessions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS package_sessions (
        id SERIAL PRIMARY KEY,
        session_uuid UUID DEFAULT gen_random_uuid(),
        customer_id INTEGER REFERENCES customers(id),
        questionnaire_id INTEGER REFERENCES package_questionnaires(id),
        answers JSONB NOT NULL DEFAULT '{}',        -- {"use_case": "own_home", "priority": ["reliability", "quiet"]}
        generated_packages JSONB,                   -- Cached package results
        selected_tier VARCHAR(20),                  -- Which tier user selected
        status VARCHAR(50) DEFAULT 'in_progress',   -- 'in_progress', 'completed', 'abandoned', 'added_to_quote'
        quote_id INTEGER,                           -- Link to quote if added
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ps_uuid ON package_sessions(session_uuid)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ps_customer ON package_sessions(customer_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ps_status ON package_sessions(status)`);
    console.log('  ✅ package_sessions created\n');

    // ============================================
    // 6. PACKAGE TEMPLATES (Admin Feature)
    // ============================================
    console.log('📋 Creating package_templates table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS package_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        package_type VARCHAR(50) NOT NULL,          -- 'kitchen', 'laundry', 'full_house'

        -- Slot definitions (JSONB)
        slots JSONB NOT NULL,
        /* Example slots structure:
        {
          "fridge": {
            "label": "Refrigerator",
            "category": "Refrigerators",
            "required": true,
            "tier_msrp_ranges": {
              "good": {"min": 80000, "max": 150000},
              "better": {"min": 150000, "max": 250000},
              "best": {"min": 250000, "max": 500000}
            }
          },
          "range": { ... },
          "dishwasher": { ... }
        }
        */

        -- Pricing rules
        bundle_discount_percent DECIMAL(5,2) DEFAULT 5.0,
        min_items_for_discount INTEGER DEFAULT 3,

        -- Default questionnaire answers (optional pre-fills)
        default_answers JSONB,

        is_active BOOLEAN DEFAULT true,
        use_count INTEGER DEFAULT 0,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pt_type ON package_templates(package_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pt_active ON package_templates(is_active)`);
    console.log('  ✅ package_templates created\n');

    // ============================================
    // 7. BUNDLE DISCOUNT RULES
    // ============================================
    console.log('💰 Creating bundle_discount_rules table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS bundle_discount_rules (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,

        -- Rule conditions
        min_items INTEGER DEFAULT 3,
        require_same_brand BOOLEAN DEFAULT true,
        require_same_finish BOOLEAN DEFAULT false,
        applicable_categories JSONB,                -- ["Refrigerators", "Ranges", "Dishwashers"]

        -- Discount values
        discount_percent DECIMAL(5,2) NOT NULL,
        max_discount_percent DECIMAL(5,2) DEFAULT 10.0,

        -- Validity
        is_active BOOLEAN DEFAULT true,
        priority INTEGER DEFAULT 0,                 -- Higher = applied first
        valid_from TIMESTAMP,
        valid_until TIMESTAMP,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✅ bundle_discount_rules created\n');

    await client.query('COMMIT');

    console.log('========================================');
    console.log('✅ Package Builder migration completed!');
    console.log('========================================\n');

    console.log('Tables created:');
    console.log('  • product_extended_attributes');
    console.log('  • package_questionnaires');
    console.log('  • package_questions');
    console.log('  • package_question_options');
    console.log('  • package_sessions');
    console.log('  • package_templates');
    console.log('  • bundle_discount_rules');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function seedDefaultQuestionnaires() {
  const client = await pool.connect();

  try {
    console.log('\n🌱 Seeding default questionnaires...\n');

    await client.query('BEGIN');

    // ============================================
    // KITCHEN QUESTIONNAIRE
    // ============================================
    console.log('🍳 Creating Kitchen Package questionnaire...');

    const kitchenResult = await client.query(`
      INSERT INTO package_questionnaires (name, description, package_type)
      VALUES ('Kitchen Appliance Package', 'Build a complete kitchen appliance package with fridge, range, and dishwasher', 'kitchen')
      ON CONFLICT DO NOTHING
      RETURNING id
    `);

    const kitchenId = kitchenResult.rows[0]?.id;

    if (kitchenId) {
      // Question 1: Use Case
      const q1 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon, help_text)
        VALUES ($1, 'use_case', 'What is this kitchen for?', 'single_select', 1, '🏠', 'This helps us recommend the right quality level')
        RETURNING id
      `, [kitchenId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, option_icon, display_order, soft_score)
        VALUES
          ($1, 'own_home', 'My own home (long-term)', '🏡', 1, '{"reliability_tier": {"weight": 1.5, "prefer": "high"}}'),
          ($1, 'rental', 'Rental property', '🔑', 2, '{"reliability_tier": {"weight": 1.2}, "package_tier": {"prefer": "good"}}'),
          ($1, 'flip_reno', 'Flip / Renovation', '🔨', 3, '{"package_tier": {"prefer": "better"}}')
      `, [q1.rows[0].id]);

      // Question 2: Priorities
      const q2 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, max_selections, icon, help_text)
        VALUES ($1, 'priority', 'What matters most to you?', 'multi_select', 2, 3, '⭐', 'Select up to 3 priorities')
        RETURNING id
      `, [kitchenId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, option_icon, display_order, soft_score)
        VALUES
          ($1, 'price', 'Best price', '💰', 1, '{"package_tier": {"prefer": "good"}}'),
          ($1, 'reliability', 'Reliability', '🛡️', 2, '{"reliability_tier": {"weight": 2, "prefer": "high"}}'),
          ($1, 'look', 'Style & Look', '✨', 3, '{"finish_match": {"weight": 2}}'),
          ($1, 'smart', 'Smart features', '📱', 4, '{"smart_level": {"weight": 2, "prefer": "high"}}'),
          ($1, 'quiet', 'Quiet operation', '🔇', 5, '{"quiet_tier": {"weight": 2, "prefer": "high"}}')
      `, [q2.rows[0].id]);

      // Question 3: Finish
      const q3 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon)
        VALUES ($1, 'finish', 'What finish do you prefer?', 'single_select', 3, '🎨')
        RETURNING id
      `, [kitchenId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, option_icon, display_order, hard_filter)
        VALUES
          ($1, 'stainless', 'Stainless Steel', '🥈', 1, '{"finish": "stainless"}'),
          ($1, 'black_stainless', 'Black Stainless', '⬛', 2, '{"finish": "black_stainless"}'),
          ($1, 'white', 'White', '⬜', 3, '{"finish": "white"}'),
          ($1, 'black', 'Black', '🖤', 4, '{"finish": "black"}'),
          ($1, 'panel_ready', 'Panel Ready', '🚪', 5, '{"finish": "panel_ready"}'),
          ($1, 'any', 'No preference', '🔄', 6, NULL)
      `, [q3.rows[0].id]);

      // Question 4: Brand Preference
      const q4 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon, is_required)
        VALUES ($1, 'brand_preference', 'Do you have a brand preference?', 'single_select', 4, '🏷️', false)
        RETURNING id
      `, [kitchenId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, display_order, hard_filter)
        VALUES
          ($1, 'samsung', 'Samsung', 1, '{"manufacturer": "Samsung"}'),
          ($1, 'lg', 'LG', 2, '{"manufacturer": "LG"}'),
          ($1, 'ge', 'GE / GE Profile', 3, '{"manufacturer": "GE"}'),
          ($1, 'whirlpool', 'Whirlpool', 4, '{"manufacturer": "Whirlpool"}'),
          ($1, 'kitchenaid', 'KitchenAid', 5, '{"manufacturer": "KitchenAid"}'),
          ($1, 'bosch', 'Bosch', 6, '{"manufacturer": "Bosch"}'),
          ($1, 'any', 'No preference', 7, NULL)
      `, [q4.rows[0].id]);

      // Question 5: Fridge Width
      const q5 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon, help_text)
        VALUES ($1, 'fridge_width', 'What refrigerator width fits your space?', 'single_select', 5, '📏', 'Measure your cabinet opening')
        RETURNING id
      `, [kitchenId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, display_order, hard_filter)
        VALUES
          ($1, '30_inch', '30" (Standard)', 1, '{"width_inches_x10": {"min": 290, "max": 310}}'),
          ($1, '33_inch', '33"', 2, '{"width_inches_x10": {"min": 320, "max": 340}}'),
          ($1, '36_inch', '36" (Large)', 3, '{"width_inches_x10": {"min": 350, "max": 370}}'),
          ($1, 'counter_depth', 'Counter-depth (any width)', 4, '{"depth_inches_x10": {"max": 280}}'),
          ($1, 'not_sure', 'Not sure', 5, NULL)
      `, [q5.rows[0].id]);

      // Question 6: Ice & Water
      const q6 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon)
        VALUES ($1, 'ice_water', 'Ice and water dispenser preference?', 'single_select', 6, '🧊')
        RETURNING id
      `, [kitchenId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, display_order, hard_filter)
        VALUES
          ($1, 'door', 'Through the door', 1, '{"has_ice_water": "door"}'),
          ($1, 'inside', 'Inside only', 2, '{"has_ice_water": "inside"}'),
          ($1, 'none', 'None needed', 3, '{"has_ice_water": "none"}'),
          ($1, 'any', 'No preference', 4, NULL)
      `, [q6.rows[0].id]);

      // Question 7: Range Fuel
      const q7 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon)
        VALUES ($1, 'range_fuel', 'What type of range?', 'single_select', 7, '🔥')
        RETURNING id
      `, [kitchenId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, display_order, hard_filter)
        VALUES
          ($1, 'gas', 'Gas', 1, '{"fuel_type": "gas"}'),
          ($1, 'electric', 'Electric', 2, '{"fuel_type": "electric"}'),
          ($1, 'induction', 'Induction', 3, '{"fuel_type": "induction"}'),
          ($1, 'dual_fuel', 'Dual Fuel', 4, '{"fuel_type": "dual"}')
      `, [q7.rows[0].id]);

      // Question 8: Cooking Features
      const q8 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon)
        VALUES ($1, 'cooking_features', 'Any cooking features you want?', 'multi_select', 8, '👨‍🍳')
        RETURNING id
      `, [kitchenId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, display_order, hard_filter)
        VALUES
          ($1, 'air_fry', 'Air Fry', 1, '{"has_air_fry": true}'),
          ($1, 'convection', 'Convection', 2, '{"has_convection": true}'),
          ($1, 'steam_clean', 'Steam Clean', 3, '{"has_steam_clean": true}'),
          ($1, 'none', 'No preference', 4, NULL)
      `, [q8.rows[0].id]);

      // Question 9: Dishwasher Quietness
      const q9 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon, help_text)
        VALUES ($1, 'dishwasher_quiet', 'How important is dishwasher quietness?', 'single_select', 9, '🔇', 'Lower dB = quieter operation')
        RETURNING id
      `, [kitchenId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, display_order, hard_filter, soft_score)
        VALUES
          ($1, 'very_quiet', 'Very quiet (< 44 dB)', 1, '{"db_level": {"max": 44}}', '{"quiet_tier": {"weight": 2}}'),
          ($1, 'quiet', 'Quiet (44-49 dB)', 2, '{"db_level": {"max": 49}}', NULL),
          ($1, 'standard', 'Standard is fine', 3, NULL, NULL)
      `, [q9.rows[0].id]);

      // Question 10: Smart Features
      const q10 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon)
        VALUES ($1, 'smart_preference', 'Smart home connectivity?', 'single_select', 10, '📱')
        RETURNING id
      `, [kitchenId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, display_order, hard_filter, soft_score)
        VALUES
          ($1, 'yes', 'Yes, I want smart features', 1, '{"smart_level": {"min": 1}}', '{"smart_level": {"weight": 2, "prefer": "high"}}'),
          ($1, 'no', 'Keep it simple', 2, NULL, NULL)
      `, [q10.rows[0].id]);

      console.log('  ✅ Kitchen questionnaire created with 10 questions\n');
    }

    // ============================================
    // LAUNDRY QUESTIONNAIRE
    // ============================================
    console.log('🧺 Creating Laundry Package questionnaire...');

    const laundryResult = await client.query(`
      INSERT INTO package_questionnaires (name, description, package_type)
      VALUES ('Laundry Pair Package', 'Build a washer and dryer pair', 'laundry')
      ON CONFLICT DO NOTHING
      RETURNING id
    `);

    const laundryId = laundryResult.rows[0]?.id;

    if (laundryId) {
      // Question 1: Use Case
      const lq1 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon, help_text)
        VALUES ($1, 'use_case', 'What is this laundry for?', 'single_select', 1, '🏠', 'This helps us recommend the right quality level')
        RETURNING id
      `, [laundryId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, option_icon, display_order, soft_score)
        VALUES
          ($1, 'own_home', 'My own home (long-term)', '🏡', 1, '{"reliability_tier": {"weight": 1.5, "prefer": "high"}}'),
          ($1, 'rental', 'Rental property', '🔑', 2, '{"reliability_tier": {"weight": 1.2}, "package_tier": {"prefer": "good"}}'),
          ($1, 'flip_reno', 'Flip / Renovation', '🔨', 3, '{"package_tier": {"prefer": "better"}}')
      `, [lq1.rows[0].id]);

      // Question 2: Priorities
      const lq2 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, max_selections, icon, help_text)
        VALUES ($1, 'priority', 'What matters most to you?', 'multi_select', 2, 3, '⭐', 'Select up to 3 priorities')
        RETURNING id
      `, [laundryId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, option_icon, display_order, soft_score)
        VALUES
          ($1, 'price', 'Best price', '💰', 1, '{"package_tier": {"prefer": "good"}}'),
          ($1, 'reliability', 'Reliability', '🛡️', 2, '{"reliability_tier": {"weight": 2, "prefer": "high"}}'),
          ($1, 'capacity', 'Large capacity', '📦', 3, '{"capacity_cubic_ft_x10": {"weight": 2, "prefer": "high"}}'),
          ($1, 'smart', 'Smart features', '📱', 4, '{"smart_level": {"weight": 2, "prefer": "high"}}'),
          ($1, 'quiet', 'Quiet operation', '🔇', 5, '{"quiet_tier": {"weight": 2, "prefer": "high"}}')
      `, [lq2.rows[0].id]);

      // Question 3: Finish
      const lq3 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon)
        VALUES ($1, 'finish', 'What finish do you prefer?', 'single_select', 3, '🎨')
        RETURNING id
      `, [laundryId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, display_order, hard_filter)
        VALUES
          ($1, 'white', 'White', 1, '{"finish": "white"}'),
          ($1, 'graphite', 'Graphite / Black Steel', 2, '{"finish": "graphite"}'),
          ($1, 'chrome', 'Chrome / Silver', 3, '{"finish": "chrome"}'),
          ($1, 'any', 'No preference', 4, NULL)
      `, [lq3.rows[0].id]);

      // Question 4: Brand Preference
      const lq4 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon, is_required)
        VALUES ($1, 'brand_preference', 'Do you have a brand preference?', 'single_select', 4, '🏷️', false)
        RETURNING id
      `, [laundryId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, display_order, hard_filter)
        VALUES
          ($1, 'samsung', 'Samsung', 1, '{"manufacturer": "Samsung"}'),
          ($1, 'lg', 'LG', 2, '{"manufacturer": "LG"}'),
          ($1, 'whirlpool', 'Whirlpool', 3, '{"manufacturer": "Whirlpool"}'),
          ($1, 'maytag', 'Maytag', 4, '{"manufacturer": "Maytag"}'),
          ($1, 'ge', 'GE', 5, '{"manufacturer": "GE"}'),
          ($1, 'any', 'No preference', 6, NULL)
      `, [lq4.rows[0].id]);

      // Question 5: Washer Type
      const lq5 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon)
        VALUES ($1, 'washer_type', 'What type of washer?', 'single_select', 5, '🌀')
        RETURNING id
      `, [laundryId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, display_order, hard_filter)
        VALUES
          ($1, 'front_load', 'Front Load', 1, '{"appliance_type": "washer_front"}'),
          ($1, 'top_load', 'Top Load', 2, '{"appliance_type": "washer_top"}')
      `, [lq5.rows[0].id]);

      // Question 6: Capacity
      const lq6 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon)
        VALUES ($1, 'washer_capacity', 'What capacity do you need?', 'single_select', 6, '📦')
        RETURNING id
      `, [laundryId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, display_order, hard_filter)
        VALUES
          ($1, 'standard', 'Standard (4-5 cu ft)', 1, '{"capacity_cubic_ft_x10": {"min": 40, "max": 50}}'),
          ($1, 'large', 'Large (5-6 cu ft)', 2, '{"capacity_cubic_ft_x10": {"min": 50, "max": 60}}'),
          ($1, 'xl', 'Extra Large (6+ cu ft)', 3, '{"capacity_cubic_ft_x10": {"min": 60}}')
      `, [lq6.rows[0].id]);

      // Question 7: Dryer Type
      const lq7 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon)
        VALUES ($1, 'dryer_fuel', 'What type of dryer?', 'single_select', 7, '🔥')
        RETURNING id
      `, [laundryId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, display_order, hard_filter)
        VALUES
          ($1, 'electric', 'Electric', 1, '{"fuel_type": "electric"}'),
          ($1, 'gas', 'Gas', 2, '{"fuel_type": "gas"}')
      `, [lq7.rows[0].id]);

      // Question 8: Steam Features
      const lq8 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon)
        VALUES ($1, 'steam_feature', 'Do you want steam features?', 'single_select', 8, '💨')
        RETURNING id
      `, [laundryId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, display_order, hard_filter)
        VALUES
          ($1, 'yes', 'Yes, I want steam', 1, '{"has_steam_feature": true}'),
          ($1, 'no', 'Not needed', 2, NULL)
      `, [lq8.rows[0].id]);

      // Question 9: Stacking
      const lq9 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon)
        VALUES ($1, 'stacking', 'Stacking or side-by-side?', 'single_select', 9, '📐')
        RETURNING id
      `, [laundryId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, display_order, hard_filter)
        VALUES
          ($1, 'stackable', 'Stackable (need stacking kit)', 1, '{"is_stackable": true}'),
          ($1, 'side_by_side', 'Side by side', 2, NULL),
          ($1, 'either', 'Either is fine', 3, NULL)
      `, [lq9.rows[0].id]);

      // Question 10: Smart Features
      const lq10 = await client.query(`
        INSERT INTO package_questions (questionnaire_id, question_key, question_text, question_type, display_order, icon)
        VALUES ($1, 'smart_preference', 'Smart home connectivity?', 'single_select', 10, '📱')
        RETURNING id
      `, [laundryId]);

      await client.query(`
        INSERT INTO package_question_options (question_id, option_key, option_text, display_order, hard_filter, soft_score)
        VALUES
          ($1, 'yes', 'Yes, I want smart features', 1, '{"smart_level": {"min": 1}}', '{"smart_level": {"weight": 2, "prefer": "high"}}'),
          ($1, 'no', 'Keep it simple', 2, NULL, NULL)
      `, [lq10.rows[0].id]);

      console.log('  ✅ Laundry questionnaire created with 10 questions\n');
    }

    // ============================================
    // DEFAULT BUNDLE DISCOUNT RULE
    // ============================================
    console.log('💰 Creating default bundle discount rule...');
    await client.query(`
      INSERT INTO bundle_discount_rules (name, description, min_items, require_same_brand, discount_percent, max_discount_percent)
      VALUES (
        'Same Brand Bundle Discount',
        'Apply 5% discount when purchasing 3+ appliances from the same brand',
        3,
        true,
        5.0,
        10.0
      )
      ON CONFLICT DO NOTHING
    `);
    console.log('  ✅ Bundle discount rule created (5% for 3+ same-brand items)\n');

    // ============================================
    // DEFAULT PACKAGE TEMPLATES
    // ============================================
    console.log('📋 Creating default package templates...');

    await client.query(`
      INSERT INTO package_templates (name, description, package_type, bundle_discount_percent, slots)
      VALUES (
        'Standard Kitchen Suite',
        'Complete kitchen package with refrigerator, range, and dishwasher',
        'kitchen',
        5.0,
        '{
          "refrigerator": {
            "label": "Refrigerator",
            "category": "Refrigerators",
            "required": true,
            "tier_msrp_ranges": {
              "good": {"min": 80000, "max": 150000},
              "better": {"min": 150000, "max": 250000},
              "best": {"min": 250000, "max": 500000}
            }
          },
          "range": {
            "label": "Range",
            "category": "Ranges",
            "required": true,
            "tier_msrp_ranges": {
              "good": {"min": 50000, "max": 100000},
              "better": {"min": 100000, "max": 200000},
              "best": {"min": 200000, "max": 400000}
            }
          },
          "dishwasher": {
            "label": "Dishwasher",
            "category": "Dishwashers",
            "required": true,
            "tier_msrp_ranges": {
              "good": {"min": 40000, "max": 70000},
              "better": {"min": 70000, "max": 100000},
              "best": {"min": 100000, "max": 200000}
            }
          }
        }'
      )
      ON CONFLICT DO NOTHING
    `);

    await client.query(`
      INSERT INTO package_templates (name, description, package_type, bundle_discount_percent, slots)
      VALUES (
        'Laundry Pair',
        'Washer and dryer pair',
        'laundry',
        5.0,
        '{
          "washer": {
            "label": "Washer",
            "category": "Washers",
            "required": true,
            "tier_msrp_ranges": {
              "good": {"min": 50000, "max": 80000},
              "better": {"min": 80000, "max": 120000},
              "best": {"min": 120000, "max": 200000}
            }
          },
          "dryer": {
            "label": "Dryer",
            "category": "Dryers",
            "required": true,
            "tier_msrp_ranges": {
              "good": {"min": 40000, "max": 70000},
              "better": {"min": 70000, "max": 100000},
              "best": {"min": 100000, "max": 150000}
            }
          }
        }'
      )
      ON CONFLICT DO NOTHING
    `);

    console.log('  ✅ Default package templates created\n');

    await client.query('COMMIT');

    console.log('========================================');
    console.log('✅ Seeding completed successfully!');
    console.log('========================================');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function run() {
  try {
    await migrate();
    await seedDefaultQuestionnaires();
  } catch (err) {
    console.error('Migration/seeding failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

run();
