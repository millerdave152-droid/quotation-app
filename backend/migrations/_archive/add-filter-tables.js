/**
 * Migration: Add Filter Tables for Package Builder V2
 * Creates filter_definitions and product_filter_values tables
 * for faceted filtering system
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('=== ADD FILTER TABLES MIGRATION ===\n');

  try {
    // Create filter_definitions table
    console.log('Creating filter_definitions table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS filter_definitions (
        id SERIAL PRIMARY KEY,
        package_type VARCHAR(50) NOT NULL,
        appliance_category VARCHAR(50) NOT NULL,
        filter_key VARCHAR(50) NOT NULL,
        filter_label VARCHAR(100) NOT NULL,
        filter_type VARCHAR(20) NOT NULL DEFAULT 'single',
        display_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        options JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(package_type, appliance_category, filter_key)
      )
    `);
    console.log('  filter_definitions table created');

    // Create product_filter_values table
    console.log('Creating product_filter_values table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_filter_values (
        id SERIAL PRIMARY KEY,
        product_id INT REFERENCES products(id) ON DELETE CASCADE,
        filter_key VARCHAR(50) NOT NULL,
        filter_value VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_id, filter_key)
      )
    `);
    console.log('  product_filter_values table created');

    // Create indexes for fast lookups
    console.log('Creating indexes...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_filter_values_key_value
      ON product_filter_values(filter_key, filter_value)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_filter_values_product
      ON product_filter_values(product_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_filter_definitions_package
      ON filter_definitions(package_type, appliance_category)
    `);
    console.log('  Indexes created');

    // Insert filter definitions for Kitchen packages
    console.log('\nInserting Kitchen filter definitions...');

    // Global filters
    await pool.query(`
      INSERT INTO filter_definitions (package_type, appliance_category, filter_key, filter_label, filter_type, display_order, options)
      VALUES
        ('kitchen', 'global', 'brand', 'Brand', 'multi', 1, '["Samsung", "LG", "Whirlpool", "GE", "KitchenAid", "Bosch", "Frigidaire", "Maytag", "JennAir", "Viking", "Thermador", "Miele"]'),
        ('kitchen', 'global', 'finish', 'Finish', 'single', 2, '[{"value": "stainless", "label": "Stainless Steel"}, {"value": "black_stainless", "label": "Black Stainless"}, {"value": "white", "label": "White"}, {"value": "black", "label": "Black"}, {"value": "panel_ready", "label": "Panel Ready"}]'),
        ('kitchen', 'global', 'smart', 'Smart Features', 'checkbox', 3, '[{"value": "wifi", "label": "WiFi/Smart Home"}]')
      ON CONFLICT (package_type, appliance_category, filter_key) DO NOTHING
    `);

    // Refrigerator filters
    await pool.query(`
      INSERT INTO filter_definitions (package_type, appliance_category, filter_key, filter_label, filter_type, display_order, options)
      VALUES
        ('kitchen', 'refrigerator', 'width', 'Width', 'single', 1, '[{"value": "30", "label": "30\\""}, {"value": "33", "label": "33\\""}, {"value": "36", "label": "36\\""}, {"value": "42", "label": "42\\""}, {"value": "48", "label": "48\\""}]'),
        ('kitchen', 'refrigerator', 'style', 'Style', 'single', 2, '[{"value": "french_door", "label": "French Door"}, {"value": "side_by_side", "label": "Side-by-Side"}, {"value": "top_freezer", "label": "Top Freezer"}, {"value": "bottom_freezer", "label": "Bottom Freezer"}]'),
        ('kitchen', 'refrigerator', 'depth', 'Depth', 'single', 3, '[{"value": "standard", "label": "Standard Depth"}, {"value": "counter_depth", "label": "Counter-Depth"}]'),
        ('kitchen', 'refrigerator', 'ice_water', 'Ice & Water', 'single', 4, '[{"value": "door", "label": "Door Dispenser"}, {"value": "inside", "label": "Inside Only"}, {"value": "none", "label": "None"}]'),
        ('kitchen', 'refrigerator', 'capacity', 'Capacity', 'single', 5, '[{"value": "small", "label": "< 20 cu ft"}, {"value": "medium", "label": "20-25 cu ft"}, {"value": "large", "label": "25+ cu ft"}]')
      ON CONFLICT (package_type, appliance_category, filter_key) DO NOTHING
    `);

    // Range filters
    await pool.query(`
      INSERT INTO filter_definitions (package_type, appliance_category, filter_key, filter_label, filter_type, display_order, options)
      VALUES
        ('kitchen', 'range', 'fuel_type', 'Fuel Type', 'single', 1, '[{"value": "gas", "label": "Gas"}, {"value": "electric", "label": "Electric"}, {"value": "induction", "label": "Induction"}, {"value": "dual_fuel", "label": "Dual Fuel"}]'),
        ('kitchen', 'range', 'width', 'Width', 'single', 2, '[{"value": "24", "label": "24\\""}, {"value": "30", "label": "30\\""}, {"value": "36", "label": "36\\""}, {"value": "48", "label": "48\\""}, {"value": "60", "label": "60\\""}]'),
        ('kitchen', 'range', 'configuration', 'Configuration', 'single', 3, '[{"value": "freestanding", "label": "Freestanding"}, {"value": "slide_in", "label": "Slide-In"}, {"value": "front_control", "label": "Front Control"}]'),
        ('kitchen', 'range', 'features', 'Oven Features', 'multi', 4, '[{"value": "convection", "label": "Convection"}, {"value": "air_fry", "label": "Air Fry"}, {"value": "steam_clean", "label": "Steam Clean"}, {"value": "self_clean", "label": "Self-Clean"}]')
      ON CONFLICT (package_type, appliance_category, filter_key) DO NOTHING
    `);

    // Dishwasher filters
    await pool.query(`
      INSERT INTO filter_definitions (package_type, appliance_category, filter_key, filter_label, filter_type, display_order, options)
      VALUES
        ('kitchen', 'dishwasher', 'noise_level', 'Noise Level', 'single', 1, '[{"value": "ultra_quiet", "label": "< 44 dB (Ultra Quiet)"}, {"value": "quiet", "label": "44-49 dB (Quiet)"}, {"value": "standard", "label": "50+ dB (Standard)"}]'),
        ('kitchen', 'dishwasher', 'tub_material', 'Tub Material', 'single', 2, '[{"value": "stainless", "label": "Stainless Steel"}, {"value": "plastic", "label": "Plastic"}, {"value": "hybrid", "label": "Hybrid"}]'),
        ('kitchen', 'dishwasher', 'rack_config', 'Rack Configuration', 'single', 3, '[{"value": "2_rack", "label": "2 Rack"}, {"value": "3_rack", "label": "3 Rack"}]'),
        ('kitchen', 'dishwasher', 'cycles', 'Wash Cycles', 'multi', 4, '[{"value": "sanitize", "label": "Sanitize"}, {"value": "quick_wash", "label": "Quick Wash"}, {"value": "heavy_duty", "label": "Heavy Duty"}]')
      ON CONFLICT (package_type, appliance_category, filter_key) DO NOTHING
    `);

    // Insert filter definitions for Laundry packages
    console.log('Inserting Laundry filter definitions...');

    // Global laundry filters
    await pool.query(`
      INSERT INTO filter_definitions (package_type, appliance_category, filter_key, filter_label, filter_type, display_order, options)
      VALUES
        ('laundry', 'global', 'brand', 'Brand', 'multi', 1, '["Samsung", "LG", "Whirlpool", "GE", "Maytag", "Electrolux", "Speed Queen", "Bosch"]'),
        ('laundry', 'global', 'finish', 'Finish', 'single', 2, '[{"value": "white", "label": "White"}, {"value": "graphite", "label": "Graphite"}, {"value": "champagne", "label": "Champagne"}, {"value": "navy", "label": "Navy"}]')
      ON CONFLICT (package_type, appliance_category, filter_key) DO NOTHING
    `);

    // Washer filters
    await pool.query(`
      INSERT INTO filter_definitions (package_type, appliance_category, filter_key, filter_label, filter_type, display_order, options)
      VALUES
        ('laundry', 'washer', 'type', 'Type', 'single', 1, '[{"value": "front_load", "label": "Front Load"}, {"value": "top_load", "label": "Top Load"}]'),
        ('laundry', 'washer', 'capacity', 'Capacity', 'single', 2, '[{"value": "standard", "label": "Standard (4-5 cu ft)"}, {"value": "large", "label": "Large (5-6 cu ft)"}, {"value": "xl", "label": "XL (6+ cu ft)"}]'),
        ('laundry', 'washer', 'steam', 'Steam Wash', 'checkbox', 3, '[{"value": "steam", "label": "Steam Wash"}]'),
        ('laundry', 'washer', 'stackable', 'Stackable', 'checkbox', 4, '[{"value": "stackable", "label": "Can be Stacked"}]')
      ON CONFLICT (package_type, appliance_category, filter_key) DO NOTHING
    `);

    // Dryer filters
    await pool.query(`
      INSERT INTO filter_definitions (package_type, appliance_category, filter_key, filter_label, filter_type, display_order, options)
      VALUES
        ('laundry', 'dryer', 'fuel_type', 'Fuel Type', 'single', 1, '[{"value": "electric", "label": "Electric"}, {"value": "gas", "label": "Gas"}]'),
        ('laundry', 'dryer', 'capacity', 'Capacity', 'single', 2, '[{"value": "standard", "label": "Standard (7-8 cu ft)"}, {"value": "large", "label": "Large (8-9 cu ft)"}, {"value": "xl", "label": "XL (9+ cu ft)"}]'),
        ('laundry', 'dryer', 'steam', 'Steam Refresh', 'checkbox', 3, '[{"value": "steam", "label": "Steam Refresh"}]'),
        ('laundry', 'dryer', 'sensor_dry', 'Sensor Dry', 'checkbox', 4, '[{"value": "sensor", "label": "Moisture Sensors"}]')
      ON CONFLICT (package_type, appliance_category, filter_key) DO NOTHING
    `);

    // Verify insertion
    const filterCount = await pool.query('SELECT COUNT(*) FROM filter_definitions');
    console.log(`\n  Total filter definitions: ${filterCount.rows[0].count}`);

    console.log('\n=== MIGRATION COMPLETE ===\n');

  } catch (err) {
    console.error('Migration error:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

run();
