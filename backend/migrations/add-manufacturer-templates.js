/**
 * Migration: Add Manufacturer Import Templates
 *
 * Creates tables for storing and managing manufacturer-specific import templates:
 * - manufacturer_import_templates: Main template storage with column mappings
 * - template_match_history: Track template usage and success rates
 * - template_learning_log: Record user corrections for learning
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('Starting manufacturer templates migration...\n');

    // ================================================
    // 1. CREATE MAIN TEMPLATES TABLE
    // ================================================
    console.log('Creating manufacturer_import_templates table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS manufacturer_import_templates (
        id SERIAL PRIMARY KEY,

        -- Template identification
        name VARCHAR(255) NOT NULL,
        manufacturer VARCHAR(255) NOT NULL,
        description TEXT,
        version INTEGER DEFAULT 1,

        -- File type (csv, xlsx, xls, pdf)
        file_type VARCHAR(50),

        -- Template matching criteria
        filename_patterns JSONB,
        header_signature VARCHAR(500),
        header_patterns JSONB,

        -- Column mappings (source -> target)
        column_mappings JSONB NOT NULL,

        -- Data transformations
        transformations JSONB,

        -- Price field configurations (multi-price support)
        price_mappings JSONB,

        -- Import settings
        header_row_index INTEGER DEFAULT 1,
        data_start_row INTEGER DEFAULT 2,
        skip_rows INTEGER DEFAULT 0,
        skip_patterns JSONB,
        date_format VARCHAR(50),
        encoding VARCHAR(50) DEFAULT 'utf-8',

        -- Template status
        is_active BOOLEAN DEFAULT true,
        is_default BOOLEAN DEFAULT false,
        confidence_threshold INTEGER DEFAULT 80,

        -- Usage tracking
        use_count INTEGER DEFAULT 0,
        last_used_at TIMESTAMP,
        success_rate DECIMAL(5, 2) DEFAULT 100.00,
        total_imports INTEGER DEFAULT 0,
        successful_imports INTEGER DEFAULT 0,

        -- Audit fields
        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ manufacturer_import_templates table created');

    // ================================================
    // 2. CREATE TEMPLATE COLUMN MAPPINGS TABLE
    // ================================================
    console.log('\nCreating template_column_mappings table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS template_column_mappings (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES manufacturer_import_templates(id) ON DELETE CASCADE,

        -- Source column info
        source_column_name VARCHAR(255) NOT NULL,
        source_column_index INTEGER,
        source_column_aliases JSONB,

        -- Target field
        target_field VARCHAR(100) NOT NULL,

        -- Transformation config
        transformation_type VARCHAR(50),
        transformation_config JSONB,

        -- Validation
        is_required BOOLEAN DEFAULT false,
        validation_regex VARCHAR(255),
        default_value TEXT,

        -- Priority/order
        priority INTEGER DEFAULT 0,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(template_id, source_column_name)
      )
    `);
    console.log('  ✓ template_column_mappings table created');

    // ================================================
    // 3. CREATE TEMPLATE PRICE FIELDS TABLE
    // ================================================
    console.log('\nCreating template_price_fields table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS template_price_fields (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES manufacturer_import_templates(id) ON DELETE CASCADE,

        -- Price field identification
        field_name VARCHAR(100) NOT NULL,
        source_column_name VARCHAR(255) NOT NULL,

        -- Target database field
        target_column VARCHAR(100) NOT NULL,

        -- Pricing attributes
        price_type VARCHAR(50) NOT NULL,
        is_primary BOOLEAN DEFAULT false,
        priority INTEGER DEFAULT 0,

        -- Transformation
        multiply_by INTEGER DEFAULT 100,

        -- Conditional logic
        condition_column VARCHAR(255),
        condition_value VARCHAR(255),

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ template_price_fields table created');

    // ================================================
    // 4. CREATE TEMPLATE MATCH HISTORY TABLE
    // ================================================
    console.log('\nCreating template_match_history table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS template_match_history (
        id SERIAL PRIMARY KEY,
        template_id INTEGER REFERENCES manufacturer_import_templates(id) ON DELETE SET NULL,

        -- File info
        filename VARCHAR(500) NOT NULL,
        file_hash VARCHAR(64),
        file_size_bytes INTEGER,
        file_type VARCHAR(50),

        -- Matching results
        match_method VARCHAR(50),
        confidence_score INTEGER,
        matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        -- Import results
        was_successful BOOLEAN,
        rows_processed INTEGER,
        rows_imported INTEGER,
        rows_updated INTEGER,
        rows_failed INTEGER,
        error_summary TEXT,

        -- User action
        user_confirmed BOOLEAN DEFAULT false,
        user_selected_different BOOLEAN DEFAULT false,
        user_created_new BOOLEAN DEFAULT false,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ template_match_history table created');

    // ================================================
    // 5. CREATE TEMPLATE LEARNING LOG TABLE
    // ================================================
    console.log('\nCreating template_learning_log table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS template_learning_log (
        id SERIAL PRIMARY KEY,
        template_id INTEGER REFERENCES manufacturer_import_templates(id) ON DELETE CASCADE,

        -- Learning event type
        event_type VARCHAR(50) NOT NULL,

        -- Before/after
        original_mapping JSONB,
        corrected_mapping JSONB,

        -- Context
        filename VARCHAR(500),
        row_example JSONB,

        -- User info
        corrected_by VARCHAR(255),
        correction_reason TEXT,

        -- Whether to apply to template
        applied_to_template BOOLEAN DEFAULT false,
        applied_at TIMESTAMP,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ template_learning_log table created');

    // ================================================
    // 6. CREATE INDEXES
    // ================================================
    console.log('\nCreating indexes...');

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_templates_manufacturer ON manufacturer_import_templates(manufacturer)',
      'CREATE INDEX IF NOT EXISTS idx_templates_active ON manufacturer_import_templates(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_templates_last_used ON manufacturer_import_templates(last_used_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_templates_file_type ON manufacturer_import_templates(file_type)',
      'CREATE INDEX IF NOT EXISTS idx_template_mappings_template ON template_column_mappings(template_id)',
      'CREATE INDEX IF NOT EXISTS idx_template_prices_template ON template_price_fields(template_id)',
      'CREATE INDEX IF NOT EXISTS idx_match_history_template ON template_match_history(template_id)',
      'CREATE INDEX IF NOT EXISTS idx_match_history_filename ON template_match_history(filename)',
      'CREATE INDEX IF NOT EXISTS idx_learning_log_template ON template_learning_log(template_id)',
      'CREATE INDEX IF NOT EXISTS idx_templates_patterns_gin ON manufacturer_import_templates USING GIN (filename_patterns)',
      'CREATE INDEX IF NOT EXISTS idx_templates_header_patterns_gin ON manufacturer_import_templates USING GIN (header_patterns)'
    ];

    for (const indexSql of indexes) {
      await client.query(indexSql);
    }
    console.log('  ✓ All indexes created');

    // ================================================
    // 7. INSERT SAMPLE TEMPLATES
    // ================================================
    console.log('\nInserting sample templates for common manufacturers...');

    // Samsung template
    await client.query(`
      INSERT INTO manufacturer_import_templates (
        name, manufacturer, description, file_type,
        filename_patterns, column_mappings, price_mappings, is_default
      ) VALUES (
        'Samsung Dealer Pricelist',
        'Samsung',
        'Standard Samsung dealer price sheet format with multi-price support',
        'xlsx',
        $1::jsonb,
        $2::jsonb,
        $3::jsonb,
        true
      ) ON CONFLICT DO NOTHING
    `, [
      JSON.stringify(['samsung', 'sam_', 'sm_dealer', 'sam_price']),
      JSON.stringify({
        'Model': { targetField: 'model', isRequired: true },
        'Category': { targetField: 'category', isRequired: false },
        'Description': { targetField: 'description', isRequired: false },
        'Color': { targetField: 'color', isRequired: false },
        'Dealer Cost': { targetField: 'cost_cents', isRequired: true, transformation: { type: 'multiply_100' } },
        'MSRP': { targetField: 'msrp_cents', isRequired: false, transformation: { type: 'multiply_100' } },
        'Go To Price': { targetField: 'retail_price_cents', isRequired: false, transformation: { type: 'multiply_100' } },
        'Avg Promo': { targetField: 'promo_cost_cents', isRequired: false, transformation: { type: 'multiply_100' } }
      }),
      JSON.stringify({
        cost: { primary: 'Dealer Cost', alternatives: ['DC', 'Net Price', 'Dealer'], targetColumn: 'cost_cents' },
        promo_cost: { primary: 'Avg Promo', alternatives: ['Promo Cost', 'Better Cost'], targetColumn: 'promo_cost_cents' },
        msrp: { primary: 'MSRP', alternatives: ['Retail', 'SRP'], targetColumn: 'msrp_cents' },
        retail: { primary: 'Go To Price', alternatives: ['Retail Price', 'Go-To'], targetColumn: 'retail_price_cents' }
      })
    ]);
    console.log('  ✓ Samsung template added');

    // LG template
    await client.query(`
      INSERT INTO manufacturer_import_templates (
        name, manufacturer, description, file_type,
        filename_patterns, column_mappings, price_mappings, is_default
      ) VALUES (
        'LG Dealer Pricelist',
        'LG',
        'Standard LG dealer price sheet format',
        'xlsx',
        $1::jsonb,
        $2::jsonb,
        $3::jsonb,
        true
      ) ON CONFLICT DO NOTHING
    `, [
      JSON.stringify(['lg', 'lg_dealer', 'lg_price', 'lg_cost']),
      JSON.stringify({
        'Model #': { targetField: 'model', isRequired: true },
        'Model Number': { targetField: 'model', isRequired: true },
        'Product Category': { targetField: 'category', isRequired: false },
        'Product Name': { targetField: 'name', isRequired: false },
        'Description': { targetField: 'description', isRequired: false },
        'Net Dealer': { targetField: 'cost_cents', isRequired: true, transformation: { type: 'multiply_100' } },
        'Suggested Retail': { targetField: 'msrp_cents', isRequired: false, transformation: { type: 'multiply_100' } }
      }),
      JSON.stringify({
        cost: { primary: 'Net Dealer', alternatives: ['Dealer Cost', 'Net Price', 'DC'], targetColumn: 'cost_cents' },
        msrp: { primary: 'Suggested Retail', alternatives: ['MSRP', 'Retail', 'SRP'], targetColumn: 'msrp_cents' }
      })
    ]);
    console.log('  ✓ LG template added');

    // Whirlpool template
    await client.query(`
      INSERT INTO manufacturer_import_templates (
        name, manufacturer, description, file_type,
        filename_patterns, column_mappings, price_mappings, is_default
      ) VALUES (
        'Whirlpool Dealer Pricelist',
        'Whirlpool',
        'Standard Whirlpool/Maytag/KitchenAid dealer price sheet format',
        'xlsx',
        $1::jsonb,
        $2::jsonb,
        $3::jsonb,
        true
      ) ON CONFLICT DO NOTHING
    `, [
      JSON.stringify(['whirlpool', 'whp_', 'maytag', 'kitchenaid', 'whr_']),
      JSON.stringify({
        'Model Number': { targetField: 'model', isRequired: true },
        'Model': { targetField: 'model', isRequired: true },
        'Brand': { targetField: 'manufacturer', isRequired: false },
        'Category': { targetField: 'category', isRequired: false },
        'Description': { targetField: 'description', isRequired: false },
        'Dealer Cost': { targetField: 'cost_cents', isRequired: true, transformation: { type: 'multiply_100' } },
        'MSRP': { targetField: 'msrp_cents', isRequired: false, transformation: { type: 'multiply_100' } },
        'MAP': { targetField: 'map_price_cents', isRequired: false, transformation: { type: 'multiply_100' } }
      }),
      JSON.stringify({
        cost: { primary: 'Dealer Cost', alternatives: ['Net Price', 'Wholesale', 'DC'], targetColumn: 'cost_cents' },
        msrp: { primary: 'MSRP', alternatives: ['Retail', 'SRP', 'List Price'], targetColumn: 'msrp_cents' },
        map: { primary: 'MAP', alternatives: ['Minimum Advertised', 'MAP Price'], targetColumn: 'map_price_cents' }
      })
    ]);
    console.log('  ✓ Whirlpool template added');

    // GE/Haier template
    await client.query(`
      INSERT INTO manufacturer_import_templates (
        name, manufacturer, description, file_type,
        filename_patterns, column_mappings, price_mappings, is_default
      ) VALUES (
        'GE Appliances Pricelist',
        'GE',
        'GE/Haier/Cafe/Monogram dealer price sheet format',
        'xlsx',
        $1::jsonb,
        $2::jsonb,
        $3::jsonb,
        true
      ) ON CONFLICT DO NOTHING
    `, [
      JSON.stringify(['ge_', 'haier', 'ge_appliance', 'cafe_', 'monogram']),
      JSON.stringify({
        'Model': { targetField: 'model', isRequired: true },
        'Item Number': { targetField: 'model', isRequired: true },
        'Brand': { targetField: 'manufacturer', isRequired: false },
        'Category': { targetField: 'category', isRequired: false },
        'Product Description': { targetField: 'description', isRequired: false },
        'Net Price': { targetField: 'cost_cents', isRequired: true, transformation: { type: 'multiply_100' } },
        'Retail': { targetField: 'msrp_cents', isRequired: false, transformation: { type: 'multiply_100' } }
      }),
      JSON.stringify({
        cost: { primary: 'Net Price', alternatives: ['Dealer Cost', 'Net', 'Wholesale'], targetColumn: 'cost_cents' },
        msrp: { primary: 'Retail', alternatives: ['MSRP', 'SRP', 'List'], targetColumn: 'msrp_cents' }
      })
    ]);
    console.log('  ✓ GE template added');

    // Frigidaire/Electrolux template
    await client.query(`
      INSERT INTO manufacturer_import_templates (
        name, manufacturer, description, file_type,
        filename_patterns, column_mappings, price_mappings, is_default
      ) VALUES (
        'Frigidaire/Electrolux Pricelist',
        'Frigidaire',
        'Frigidaire/Electrolux dealer price sheet format',
        'xlsx',
        $1::jsonb,
        $2::jsonb,
        $3::jsonb,
        true
      ) ON CONFLICT DO NOTHING
    `, [
      JSON.stringify(['frigidaire', 'frig_', 'electrolux', 'elux_']),
      JSON.stringify({
        'Part #': { targetField: 'model', isRequired: true },
        'Model Number': { targetField: 'model', isRequired: true },
        'Brand': { targetField: 'manufacturer', isRequired: false },
        'Category': { targetField: 'category', isRequired: false },
        'Description': { targetField: 'description', isRequired: false },
        'Dealer': { targetField: 'cost_cents', isRequired: true, transformation: { type: 'multiply_100' } },
        'MSRP': { targetField: 'msrp_cents', isRequired: false, transformation: { type: 'multiply_100' } }
      }),
      JSON.stringify({
        cost: { primary: 'Dealer', alternatives: ['Dealer Cost', 'Net Price', 'Cost'], targetColumn: 'cost_cents' },
        msrp: { primary: 'MSRP', alternatives: ['Retail', 'SRP', 'List Price'], targetColumn: 'msrp_cents' }
      })
    ]);
    console.log('  ✓ Frigidaire template added');

    // ================================================
    // 8. ADD promo_cost_cents AND map_price_cents TO PRODUCTS TABLE
    // ================================================
    console.log('\nAdding additional price columns to products table...');

    const priceColumns = [
      { name: 'promo_cost_cents', type: 'BIGINT', comment: 'Promotional/better dealer cost in cents' },
      { name: 'map_price_cents', type: 'BIGINT', comment: 'Minimum Advertised Price in cents' }
    ];

    for (const col of priceColumns) {
      try {
        await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        console.log(`  ✓ Added ${col.name} to products table`);
      } catch (err) {
        if (err.code === '42701') {
          console.log(`  - ${col.name} already exists`);
        } else {
          throw err;
        }
      }
    }

    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!');
    console.log('\nTables created:');
    console.log('  - manufacturer_import_templates (main template storage)');
    console.log('  - template_column_mappings (individual column mapping details)');
    console.log('  - template_price_fields (multi-price configuration)');
    console.log('  - template_match_history (usage tracking)');
    console.log('  - template_learning_log (user corrections for learning)');
    console.log('\nSample templates added for:');
    console.log('  - Samsung, LG, Whirlpool, GE, Frigidaire');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
