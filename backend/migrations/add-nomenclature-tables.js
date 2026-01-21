/**
 * Migration: Add Nomenclature Tables
 * Creates tables for model number nomenclature decoder and training system
 *
 * Run: node migrations/add-nomenclature-tables.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating nomenclature tables...');

    // 1. Nomenclature Templates - one per manufacturer/product type
    await client.query(`
      CREATE TABLE IF NOT EXISTS nomenclature_templates (
        id SERIAL PRIMARY KEY,
        manufacturer VARCHAR(50) NOT NULL,
        product_type VARCHAR(100) NOT NULL,
        template_name VARCHAR(150) NOT NULL,
        description TEXT,
        example_models TEXT[],
        pattern_regex VARCHAR(500),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id),
        UNIQUE(manufacturer, product_type)
      )
    `);
    console.log('  Created nomenclature_templates table');

    // 2. Nomenclature Rules - position-based decoding rules
    await client.query(`
      CREATE TABLE IF NOT EXISTS nomenclature_rules (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES nomenclature_templates(id) ON DELETE CASCADE,
        position_start INTEGER NOT NULL,
        position_end INTEGER NOT NULL,
        segment_name VARCHAR(100) NOT NULL,
        segment_description TEXT,
        display_order INTEGER DEFAULT 0,
        color VARCHAR(7) DEFAULT '#3b82f6',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  Created nomenclature_rules table');

    // 3. Nomenclature Codes - what each code value means
    await client.query(`
      CREATE TABLE IF NOT EXISTS nomenclature_codes (
        id SERIAL PRIMARY KEY,
        rule_id INTEGER NOT NULL REFERENCES nomenclature_rules(id) ON DELETE CASCADE,
        code_value VARCHAR(50) NOT NULL,
        code_meaning VARCHAR(200) NOT NULL,
        additional_info TEXT,
        is_common BOOLEAN DEFAULT false,
        display_order INTEGER DEFAULT 0,
        UNIQUE(rule_id, code_value)
      )
    `);
    console.log('  Created nomenclature_codes table');

    // 4. Quiz Attempts - track user quiz sessions
    await client.query(`
      CREATE TABLE IF NOT EXISTS nomenclature_quiz_attempts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        quiz_type VARCHAR(50) NOT NULL,
        manufacturer VARCHAR(50),
        product_type VARCHAR(100),
        total_questions INTEGER NOT NULL,
        correct_answers INTEGER NOT NULL DEFAULT 0,
        score_percentage DECIMAL(5,2),
        time_spent_seconds INTEGER,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        quiz_data JSONB
      )
    `);
    console.log('  Created nomenclature_quiz_attempts table');

    // 5. User Progress - track learning progress per manufacturer
    await client.query(`
      CREATE TABLE IF NOT EXISTS nomenclature_user_progress (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        manufacturer VARCHAR(50) NOT NULL,
        product_type VARCHAR(100) DEFAULT '',
        quizzes_completed INTEGER DEFAULT 0,
        total_questions_answered INTEGER DEFAULT 0,
        correct_answers INTEGER DEFAULT 0,
        best_score DECIMAL(5,2),
        last_quiz_date TIMESTAMP,
        mastery_level VARCHAR(20) DEFAULT 'beginner',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, manufacturer, product_type)
      )
    `);
    console.log('  Created nomenclature_user_progress table');

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_nomenclature_templates_manufacturer
      ON nomenclature_templates(manufacturer)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_nomenclature_rules_template
      ON nomenclature_rules(template_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_nomenclature_codes_rule
      ON nomenclature_codes(rule_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user
      ON nomenclature_quiz_attempts(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_progress_user
      ON nomenclature_user_progress(user_id)
    `);
    console.log('  Created indexes');

    // Seed initial nomenclature data
    console.log('\nSeeding nomenclature data...');
    await seedNomenclatureData(client);

    await client.query('COMMIT');
    console.log('\nMigration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function seedNomenclatureData(client) {
  // ========================================
  // SAMSUNG NOMENCLATURE
  // ========================================

  // Samsung Refrigerators
  const samsungRefrig = await insertTemplate(client, {
    manufacturer: 'SAMSUNG',
    product_type: 'refrigerator',
    template_name: 'Samsung Refrigerator Model Numbers',
    description: 'Samsung refrigerators use format: Type(2) + Capacity(2) + Series(1) + Features(4) + Color(2)',
    example_models: ['RF28R7351SG', 'RS27T5200SR', 'RT18M6215SG', 'RB12J8896S4']
  });

  await insertRulesAndCodes(client, samsungRefrig, [
    {
      position_start: 1, position_end: 2,
      segment_name: 'Product Type',
      segment_description: 'Identifies refrigerator style and door configuration',
      color: '#3b82f6',
      codes: [
        { code_value: 'RF', code_meaning: 'French Door Refrigerator', is_common: true },
        { code_value: 'RS', code_meaning: 'Side-by-Side Refrigerator', is_common: true },
        { code_value: 'RT', code_meaning: 'Top Freezer Refrigerator' },
        { code_value: 'RB', code_meaning: 'Bottom Freezer Refrigerator' },
        { code_value: 'RH', code_meaning: 'French Door Counter-Depth' },
        { code_value: 'RZ', code_meaning: 'Upright Freezer' }
      ]
    },
    {
      position_start: 3, position_end: 4,
      segment_name: 'Capacity',
      segment_description: 'Total cubic feet of refrigerator storage',
      color: '#10b981',
      codes: [
        { code_value: '28', code_meaning: '28 cubic feet', is_common: true },
        { code_value: '27', code_meaning: '27 cubic feet', is_common: true },
        { code_value: '26', code_meaning: '26 cubic feet' },
        { code_value: '25', code_meaning: '25 cubic feet' },
        { code_value: '23', code_meaning: '23 cubic feet' },
        { code_value: '22', code_meaning: '22 cubic feet' },
        { code_value: '21', code_meaning: '21 cubic feet' },
        { code_value: '18', code_meaning: '18 cubic feet' },
        { code_value: '17', code_meaning: '17 cubic feet' },
        { code_value: '12', code_meaning: '12 cubic feet' }
      ]
    },
    {
      position_start: 5, position_end: 5,
      segment_name: 'Year/Series',
      segment_description: 'Product generation or series indicator',
      color: '#f59e0b',
      codes: [
        { code_value: 'T', code_meaning: '2020 Series / Premium', is_common: true },
        { code_value: 'R', code_meaning: '2019 Series / Standard', is_common: true },
        { code_value: 'M', code_meaning: '2018 Series / Mid-Range' },
        { code_value: 'J', code_meaning: '2017 Series' },
        { code_value: 'K', code_meaning: '2016 Series' },
        { code_value: 'N', code_meaning: '2021 Series' },
        { code_value: 'S', code_meaning: '2022+ Series' }
      ]
    },
    {
      position_start: 6, position_end: 9,
      segment_name: 'Feature Code',
      segment_description: 'Internal model identifier for specific features',
      color: '#8b5cf6',
      codes: [
        { code_value: '7351', code_meaning: 'Family Hub, FlexZone Drawer' },
        { code_value: '5200', code_meaning: 'Standard Features, Ice Maker' },
        { code_value: '8570', code_meaning: 'FlexZone, Twin Cooling Plus' },
        { code_value: '6215', code_meaning: 'Ice Maker, LED Lighting' },
        { code_value: '5021', code_meaning: 'Basic Features' }
      ]
    },
    {
      position_start: 10, position_end: 11,
      segment_name: 'Color/Finish',
      segment_description: 'External finish and color of the appliance',
      color: '#ec4899',
      codes: [
        { code_value: 'SG', code_meaning: 'Black Stainless Steel', is_common: true },
        { code_value: 'SR', code_meaning: 'Stainless Steel', is_common: true },
        { code_value: 'WZ', code_meaning: 'White' },
        { code_value: 'AA', code_meaning: 'Black' },
        { code_value: 'S4', code_meaning: 'Stainless Steel (Alt)' },
        { code_value: 'MT', code_meaning: 'Tuscan Stainless' },
        { code_value: 'NV', code_meaning: 'Navy Steel' }
      ]
    }
  ]);
  console.log('  Added Samsung Refrigerator nomenclature');

  // Samsung Washers
  const samsungWasher = await insertTemplate(client, {
    manufacturer: 'SAMSUNG',
    product_type: 'washer',
    template_name: 'Samsung Washer Model Numbers',
    description: 'Samsung washers use format: Type(2) + Capacity(1) + Series(1) + Features(4) + Color(2)',
    example_models: ['WF45R6100AW', 'WA50R5400AV', 'WF50T8500AV']
  });

  await insertRulesAndCodes(client, samsungWasher, [
    {
      position_start: 1, position_end: 2,
      segment_name: 'Product Type',
      segment_description: 'Washer type - front load or top load',
      color: '#3b82f6',
      codes: [
        { code_value: 'WF', code_meaning: 'Front Load Washer', is_common: true },
        { code_value: 'WA', code_meaning: 'Top Load Washer', is_common: true },
        { code_value: 'WV', code_meaning: 'FlexWash Front Load' },
        { code_value: 'WW', code_meaning: 'Compact Front Load' }
      ]
    },
    {
      position_start: 3, position_end: 4,
      segment_name: 'Capacity',
      segment_description: 'Drum capacity in cubic feet',
      color: '#10b981',
      codes: [
        { code_value: '50', code_meaning: '5.0 cubic feet', is_common: true },
        { code_value: '45', code_meaning: '4.5 cubic feet', is_common: true },
        { code_value: '52', code_meaning: '5.2 cubic feet' },
        { code_value: '55', code_meaning: '5.5 cubic feet' },
        { code_value: '60', code_meaning: '6.0 cubic feet' },
        { code_value: '27', code_meaning: '2.7 cubic feet (compact)' }
      ]
    },
    {
      position_start: 5, position_end: 5,
      segment_name: 'Year/Series',
      segment_description: 'Product year or series',
      color: '#f59e0b',
      codes: [
        { code_value: 'T', code_meaning: '2020 Series', is_common: true },
        { code_value: 'R', code_meaning: '2019 Series', is_common: true },
        { code_value: 'A', code_meaning: '2021+ Series' },
        { code_value: 'B', code_meaning: 'Bespoke Series' }
      ]
    },
    {
      position_start: 6, position_end: 9,
      segment_name: 'Feature Code',
      segment_description: 'Model features and tier',
      color: '#8b5cf6',
      codes: [
        { code_value: '8500', code_meaning: 'Premium - Steam, Smart' },
        { code_value: '6100', code_meaning: 'Mid-Range - Steam' },
        { code_value: '5400', code_meaning: 'Standard Features' },
        { code_value: '5200', code_meaning: 'Basic Features' }
      ]
    },
    {
      position_start: 10, position_end: 11,
      segment_name: 'Color/Finish',
      segment_description: 'Exterior color',
      color: '#ec4899',
      codes: [
        { code_value: 'AW', code_meaning: 'White', is_common: true },
        { code_value: 'AV', code_meaning: 'Brushed Black', is_common: true },
        { code_value: 'US', code_meaning: 'Champagne' },
        { code_value: 'AT', code_meaning: 'Platinum' }
      ]
    }
  ]);
  console.log('  Added Samsung Washer nomenclature');

  // Samsung Dryers
  const samsungDryer = await insertTemplate(client, {
    manufacturer: 'SAMSUNG',
    product_type: 'dryer',
    template_name: 'Samsung Dryer Model Numbers',
    description: 'Samsung dryers use format: Type(3) + Capacity(1) + Series(1) + Features(4) + Color(2)',
    example_models: ['DVE45R6100W', 'DVG50R5400V', 'DVE50T8500V']
  });

  await insertRulesAndCodes(client, samsungDryer, [
    {
      position_start: 1, position_end: 3,
      segment_name: 'Product Type',
      segment_description: 'Dryer type - electric or gas',
      color: '#3b82f6',
      codes: [
        { code_value: 'DVE', code_meaning: 'Electric Dryer', is_common: true },
        { code_value: 'DVG', code_meaning: 'Gas Dryer', is_common: true },
        { code_value: 'DV4', code_meaning: 'Compact Electric Dryer' },
        { code_value: 'DVH', code_meaning: 'Heat Pump Dryer' }
      ]
    },
    {
      position_start: 4, position_end: 5,
      segment_name: 'Capacity',
      segment_description: 'Drum capacity in cubic feet',
      color: '#10b981',
      codes: [
        { code_value: '50', code_meaning: '7.5 cubic feet', is_common: true },
        { code_value: '45', code_meaning: '7.4 cubic feet', is_common: true },
        { code_value: '55', code_meaning: '7.8 cubic feet' }
      ]
    },
    {
      position_start: 6, position_end: 6,
      segment_name: 'Year/Series',
      segment_description: 'Product year',
      color: '#f59e0b',
      codes: [
        { code_value: 'T', code_meaning: '2020 Series', is_common: true },
        { code_value: 'R', code_meaning: '2019 Series', is_common: true },
        { code_value: 'A', code_meaning: '2021+ Series' }
      ]
    },
    {
      position_start: 7, position_end: 10,
      segment_name: 'Feature Code',
      segment_description: 'Model features',
      color: '#8b5cf6',
      codes: [
        { code_value: '8500', code_meaning: 'Premium - Steam, Smart' },
        { code_value: '6100', code_meaning: 'Mid-Range - Steam' },
        { code_value: '5400', code_meaning: 'Standard' }
      ]
    },
    {
      position_start: 11, position_end: 12,
      segment_name: 'Color/Finish',
      segment_description: 'Exterior color',
      color: '#ec4899',
      codes: [
        { code_value: 'W', code_meaning: 'White', is_common: true },
        { code_value: 'V', code_meaning: 'Brushed Black', is_common: true }
      ]
    }
  ]);
  console.log('  Added Samsung Dryer nomenclature');

  // ========================================
  // LG NOMENCLATURE
  // ========================================

  // LG Refrigerators
  const lgRefrig = await insertTemplate(client, {
    manufacturer: 'LG',
    product_type: 'refrigerator',
    template_name: 'LG Refrigerator Model Numbers',
    description: 'LG refrigerators use format: Type(4-5) + Capacity(2) + Features + Color(1-2)',
    example_models: ['LRMVS3006S', 'LRFXS2503S', 'LTCS24223S']
  });

  await insertRulesAndCodes(client, lgRefrig, [
    {
      position_start: 1, position_end: 4,
      segment_name: 'Product Type',
      segment_description: 'Refrigerator style',
      color: '#3b82f6',
      codes: [
        { code_value: 'LRMV', code_meaning: 'InstaView French Door', is_common: true },
        { code_value: 'LRFX', code_meaning: 'French Door Standard', is_common: true },
        { code_value: 'LRFV', code_meaning: 'French Door with Water' },
        { code_value: 'LRSB', code_meaning: 'Side-by-Side' },
        { code_value: 'LTCS', code_meaning: 'Top Freezer' },
        { code_value: 'LRBN', code_meaning: 'Bottom Freezer' }
      ]
    },
    {
      position_start: 5, position_end: 6,
      segment_name: 'Capacity',
      segment_description: 'Total capacity in cubic feet',
      color: '#10b981',
      codes: [
        { code_value: '30', code_meaning: '30 cubic feet', is_common: true },
        { code_value: '28', code_meaning: '28 cubic feet', is_common: true },
        { code_value: '27', code_meaning: '27 cubic feet' },
        { code_value: '26', code_meaning: '26 cubic feet' },
        { code_value: '25', code_meaning: '25 cubic feet' },
        { code_value: '24', code_meaning: '24 cubic feet' },
        { code_value: '22', code_meaning: '22 cubic feet' }
      ]
    },
    {
      position_start: 7, position_end: 9,
      segment_name: 'Feature/Year',
      segment_description: 'Features and model year',
      color: '#8b5cf6',
      codes: [
        { code_value: '06S', code_meaning: '2021 Smart Model' },
        { code_value: '03S', code_meaning: '2020 Smart Model' },
        { code_value: '23S', code_meaning: 'Standard Model' }
      ]
    },
    {
      position_start: 10, position_end: 10,
      segment_name: 'Color',
      segment_description: 'Finish color',
      color: '#ec4899',
      codes: [
        { code_value: 'S', code_meaning: 'Stainless Steel', is_common: true },
        { code_value: 'D', code_meaning: 'Black Stainless', is_common: true },
        { code_value: 'W', code_meaning: 'White' },
        { code_value: 'B', code_meaning: 'Black' }
      ]
    }
  ]);
  console.log('  Added LG Refrigerator nomenclature');

  // LG Washers
  const lgWasher = await insertTemplate(client, {
    manufacturer: 'LG',
    product_type: 'washer',
    template_name: 'LG Washer Model Numbers',
    description: 'LG washers use format: WM + Capacity(1) + Year + Features + Color',
    example_models: ['WM4000HWA', 'WM3600HWA', 'WT7300CW']
  });

  await insertRulesAndCodes(client, lgWasher, [
    {
      position_start: 1, position_end: 2,
      segment_name: 'Product Type',
      segment_description: 'Washer type',
      color: '#3b82f6',
      codes: [
        { code_value: 'WM', code_meaning: 'Front Load Washer', is_common: true },
        { code_value: 'WT', code_meaning: 'Top Load Washer', is_common: true },
        { code_value: 'WK', code_meaning: 'WashTower Combo' }
      ]
    },
    {
      position_start: 3, position_end: 3,
      segment_name: 'Capacity',
      segment_description: 'Cubic feet capacity',
      color: '#10b981',
      codes: [
        { code_value: '4', code_meaning: '4+ cubic feet (varies by model)', is_common: true },
        { code_value: '3', code_meaning: '3+ cubic feet', is_common: true },
        { code_value: '5', code_meaning: '5+ cubic feet' },
        { code_value: '7', code_meaning: '5.5+ cubic feet (top load)' }
      ]
    },
    {
      position_start: 4, position_end: 7,
      segment_name: 'Features/Series',
      segment_description: 'Model tier and features',
      color: '#8b5cf6',
      codes: [
        { code_value: '000H', code_meaning: 'Premium TurboWash' },
        { code_value: '600H', code_meaning: 'TurboWash 360' },
        { code_value: '300C', code_meaning: 'Standard Top Load' }
      ]
    },
    {
      position_start: 8, position_end: 9,
      segment_name: 'Color',
      segment_description: 'Finish',
      color: '#ec4899',
      codes: [
        { code_value: 'WA', code_meaning: 'White', is_common: true },
        { code_value: 'BA', code_meaning: 'Black Steel', is_common: true },
        { code_value: 'CW', code_meaning: 'White (Top Load)' }
      ]
    }
  ]);
  console.log('  Added LG Washer nomenclature');

  // ========================================
  // WHIRLPOOL NOMENCLATURE
  // ========================================

  // Whirlpool Refrigerators
  const whirlpoolRefrig = await insertTemplate(client, {
    manufacturer: 'WHIRLPOOL',
    product_type: 'refrigerator',
    template_name: 'Whirlpool Refrigerator Model Numbers',
    description: 'Whirlpool refrigerators use format: WR + Type(1) + Capacity(2) + Features + Color',
    example_models: ['WRF555SDFZ', 'WRS325SDHZ', 'WRT518SZFM']
  });

  await insertRulesAndCodes(client, whirlpoolRefrig, [
    {
      position_start: 1, position_end: 2,
      segment_name: 'Brand',
      segment_description: 'Whirlpool brand identifier',
      color: '#3b82f6',
      codes: [
        { code_value: 'WR', code_meaning: 'Whirlpool Refrigerator', is_common: true }
      ]
    },
    {
      position_start: 3, position_end: 3,
      segment_name: 'Door Style',
      segment_description: 'Refrigerator door configuration',
      color: '#10b981',
      codes: [
        { code_value: 'F', code_meaning: 'French Door', is_common: true },
        { code_value: 'S', code_meaning: 'Side-by-Side', is_common: true },
        { code_value: 'T', code_meaning: 'Top Freezer' },
        { code_value: 'B', code_meaning: 'Bottom Freezer' },
        { code_value: 'X', code_meaning: 'Counter-Depth French Door' }
      ]
    },
    {
      position_start: 4, position_end: 6,
      segment_name: 'Capacity/Series',
      segment_description: 'Size and series indicator',
      color: '#f59e0b',
      codes: [
        { code_value: '555', code_meaning: '25+ cu ft, Premium' },
        { code_value: '535', code_meaning: '25 cu ft, Mid-Range' },
        { code_value: '325', code_meaning: '21-24 cu ft' },
        { code_value: '518', code_meaning: '18 cu ft Top Freezer' }
      ]
    },
    {
      position_start: 7, position_end: 8,
      segment_name: 'Features',
      segment_description: 'Feature package',
      color: '#8b5cf6',
      codes: [
        { code_value: 'SD', code_meaning: 'Standard Features' },
        { code_value: 'SH', code_meaning: 'Premium Features' },
        { code_value: 'SZ', code_meaning: 'Basic Features' }
      ]
    },
    {
      position_start: 9, position_end: 10,
      segment_name: 'Color',
      segment_description: 'Finish',
      color: '#ec4899',
      codes: [
        { code_value: 'FZ', code_meaning: 'Fingerprint Resistant Stainless', is_common: true },
        { code_value: 'HZ', code_meaning: 'Stainless Steel', is_common: true },
        { code_value: 'FM', code_meaning: 'Stainless Steel (Alt)' },
        { code_value: 'HW', code_meaning: 'White' },
        { code_value: 'HB', code_meaning: 'Black' },
        { code_value: 'HV', code_meaning: 'Black Stainless' }
      ]
    }
  ]);
  console.log('  Added Whirlpool Refrigerator nomenclature');

  // Whirlpool Washers
  const whirlpoolWasher = await insertTemplate(client, {
    manufacturer: 'WHIRLPOOL',
    product_type: 'washer',
    template_name: 'Whirlpool Washer Model Numbers',
    description: 'Whirlpool washers use format: W + Type(2) + Capacity(1) + Series(3) + Color(2)',
    example_models: ['WFW5620HW', 'WTW5000DW', 'WFW9620HC']
  });

  await insertRulesAndCodes(client, whirlpoolWasher, [
    {
      position_start: 1, position_end: 3,
      segment_name: 'Product Type',
      segment_description: 'Washer type',
      color: '#3b82f6',
      codes: [
        { code_value: 'WFW', code_meaning: 'Front Load Washer', is_common: true },
        { code_value: 'WTW', code_meaning: 'Top Load Washer', is_common: true },
        { code_value: 'WET', code_meaning: 'Stacked Washer/Dryer' }
      ]
    },
    {
      position_start: 4, position_end: 4,
      segment_name: 'Capacity',
      segment_description: 'Drum capacity indicator',
      color: '#10b981',
      codes: [
        { code_value: '9', code_meaning: '5.0+ cu ft (Large)', is_common: true },
        { code_value: '8', code_meaning: '4.8 cu ft' },
        { code_value: '5', code_meaning: '4.5 cu ft', is_common: true },
        { code_value: '6', code_meaning: '4.5-4.7 cu ft' }
      ]
    },
    {
      position_start: 5, position_end: 7,
      segment_name: 'Series/Features',
      segment_description: 'Model tier and features',
      color: '#8b5cf6',
      codes: [
        { code_value: '620', code_meaning: 'Standard Features' },
        { code_value: '000', code_meaning: 'Basic Model' },
        { code_value: '900', code_meaning: 'Premium Model' }
      ]
    },
    {
      position_start: 8, position_end: 9,
      segment_name: 'Color',
      segment_description: 'Finish',
      color: '#ec4899',
      codes: [
        { code_value: 'HW', code_meaning: 'White', is_common: true },
        { code_value: 'HC', code_meaning: 'Chrome Shadow', is_common: true },
        { code_value: 'DW', code_meaning: 'White (Alt)' }
      ]
    }
  ]);
  console.log('  Added Whirlpool Washer nomenclature');

  // ========================================
  // GE NOMENCLATURE
  // ========================================

  // GE Refrigerators
  const geRefrig = await insertTemplate(client, {
    manufacturer: 'GE',
    product_type: 'refrigerator',
    template_name: 'GE Refrigerator Model Numbers',
    description: 'GE refrigerators use format: Brand(1-3) + Type(1) + Capacity(2) + Features + Color',
    example_models: ['GNE27JSMSS', 'GSS25IYNFS', 'GFE26JYMFS', 'PYE22KYNFS']
  });

  await insertRulesAndCodes(client, geRefrig, [
    {
      position_start: 1, position_end: 1,
      segment_name: 'Brand/Tier',
      segment_description: 'Product line within GE family',
      color: '#3b82f6',
      codes: [
        { code_value: 'G', code_meaning: 'GE Standard', is_common: true },
        { code_value: 'P', code_meaning: 'GE Profile', is_common: true },
        { code_value: 'C', code_meaning: 'Cafe' },
        { code_value: 'Z', code_meaning: 'Monogram' }
      ]
    },
    {
      position_start: 2, position_end: 2,
      segment_name: 'Door Style',
      segment_description: 'Refrigerator configuration',
      color: '#10b981',
      codes: [
        { code_value: 'N', code_meaning: 'French Door Bottom Freezer', is_common: true },
        { code_value: 'S', code_meaning: 'Side-by-Side', is_common: true },
        { code_value: 'F', code_meaning: 'French Door', is_common: true },
        { code_value: 'T', code_meaning: 'Top Freezer' },
        { code_value: 'Y', code_meaning: 'Profile French Door' },
        { code_value: 'W', code_meaning: 'French Door Counter-Depth' }
      ]
    },
    {
      position_start: 3, position_end: 3,
      segment_name: 'Sub-Type',
      segment_description: 'Additional configuration',
      color: '#f59e0b',
      codes: [
        { code_value: 'E', code_meaning: 'Standard Configuration', is_common: true },
        { code_value: 'S', code_meaning: 'Side-by-Side Config' }
      ]
    },
    {
      position_start: 4, position_end: 5,
      segment_name: 'Capacity',
      segment_description: 'Cubic feet capacity',
      color: '#8b5cf6',
      codes: [
        { code_value: '27', code_meaning: '27 cubic feet', is_common: true },
        { code_value: '26', code_meaning: '26 cubic feet', is_common: true },
        { code_value: '25', code_meaning: '25 cubic feet' },
        { code_value: '22', code_meaning: '22 cubic feet' },
        { code_value: '21', code_meaning: '21 cubic feet' }
      ]
    },
    {
      position_start: 9, position_end: 11,
      segment_name: 'Color',
      segment_description: 'Finish color',
      color: '#ec4899',
      codes: [
        { code_value: 'MSS', code_meaning: 'Stainless Steel', is_common: true },
        { code_value: 'NFS', code_meaning: 'Fingerprint Resistant Stainless', is_common: true },
        { code_value: 'MFS', code_meaning: 'Stainless (Alt)' },
        { code_value: 'MWW', code_meaning: 'White' },
        { code_value: 'MBB', code_meaning: 'Black' },
        { code_value: 'MDS', code_meaning: 'Black Slate' },
        { code_value: 'MTS', code_meaning: 'Slate' }
      ]
    }
  ]);
  console.log('  Added GE Refrigerator nomenclature');

  // ========================================
  // KITCHENAID NOMENCLATURE
  // ========================================

  // KitchenAid Refrigerators
  const kitchenaidRefrig = await insertTemplate(client, {
    manufacturer: 'KITCHENAID',
    product_type: 'refrigerator',
    template_name: 'KitchenAid Refrigerator Model Numbers',
    description: 'KitchenAid refrigerators use format: K + Type(3) + Size(2) + Features + Color',
    example_models: ['KRFF305ESS', 'KBSD608ESS', 'KRFC704FPS']
  });

  await insertRulesAndCodes(client, kitchenaidRefrig, [
    {
      position_start: 1, position_end: 1,
      segment_name: 'Brand',
      segment_description: 'KitchenAid brand identifier',
      color: '#3b82f6',
      codes: [
        { code_value: 'K', code_meaning: 'KitchenAid', is_common: true }
      ]
    },
    {
      position_start: 2, position_end: 3,
      segment_name: 'Product Type',
      segment_description: 'Refrigerator style',
      color: '#10b981',
      codes: [
        { code_value: 'RF', code_meaning: 'French Door', is_common: true },
        { code_value: 'RS', code_meaning: 'Side-by-Side', is_common: true },
        { code_value: 'BS', code_meaning: 'Built-In Side-by-Side' },
        { code_value: 'BF', code_meaning: 'Built-In French Door' }
      ]
    },
    {
      position_start: 4, position_end: 5,
      segment_name: 'Features/Series',
      segment_description: 'Feature tier',
      color: '#8b5cf6',
      codes: [
        { code_value: 'F3', code_meaning: 'Standard Features' },
        { code_value: 'FC', code_meaning: 'Premium Counter-Depth' },
        { code_value: 'D6', code_meaning: 'Built-In Premium' }
      ]
    },
    {
      position_start: 8, position_end: 10,
      segment_name: 'Color',
      segment_description: 'Finish',
      color: '#ec4899',
      codes: [
        { code_value: 'ESS', code_meaning: 'Stainless Steel', is_common: true },
        { code_value: 'FPS', code_meaning: 'PrintShield Stainless', is_common: true },
        { code_value: 'EBS', code_meaning: 'Black Stainless' },
        { code_value: 'EWH', code_meaning: 'White' }
      ]
    }
  ]);
  console.log('  Added KitchenAid Refrigerator nomenclature');

  // ========================================
  // MAYTAG NOMENCLATURE
  // ========================================

  // Maytag Washers
  const maytagWasher = await insertTemplate(client, {
    manufacturer: 'MAYTAG',
    product_type: 'washer',
    template_name: 'Maytag Washer Model Numbers',
    description: 'Maytag washers use format: M + Type(2) + Size(1) + Series(3) + Color(2)',
    example_models: ['MHW5630HW', 'MVW6200KW', 'MHW8630HC']
  });

  await insertRulesAndCodes(client, maytagWasher, [
    {
      position_start: 1, position_end: 3,
      segment_name: 'Product Type',
      segment_description: 'Washer type',
      color: '#3b82f6',
      codes: [
        { code_value: 'MHW', code_meaning: 'Front Load Washer', is_common: true },
        { code_value: 'MVW', code_meaning: 'Top Load Washer', is_common: true },
        { code_value: 'MET', code_meaning: 'Electric Stacked' }
      ]
    },
    {
      position_start: 4, position_end: 4,
      segment_name: 'Size',
      segment_description: 'Capacity tier',
      color: '#10b981',
      codes: [
        { code_value: '8', code_meaning: 'Extra Large Capacity', is_common: true },
        { code_value: '6', code_meaning: 'Large Capacity' },
        { code_value: '5', code_meaning: 'Standard Capacity', is_common: true }
      ]
    },
    {
      position_start: 5, position_end: 7,
      segment_name: 'Series',
      segment_description: 'Feature set',
      color: '#8b5cf6',
      codes: [
        { code_value: '630', code_meaning: 'Premium Features' },
        { code_value: '200', code_meaning: 'Standard Features' }
      ]
    },
    {
      position_start: 8, position_end: 9,
      segment_name: 'Color',
      segment_description: 'Finish',
      color: '#ec4899',
      codes: [
        { code_value: 'HW', code_meaning: 'White', is_common: true },
        { code_value: 'HC', code_meaning: 'Metallic Slate', is_common: true },
        { code_value: 'KW', code_meaning: 'White (Alt)' }
      ]
    }
  ]);
  console.log('  Added Maytag Washer nomenclature');

  // ========================================
  // BOSCH NOMENCLATURE
  // ========================================

  // Bosch Dishwashers
  const boschDishwasher = await insertTemplate(client, {
    manufacturer: 'BOSCH',
    product_type: 'dishwasher',
    template_name: 'Bosch Dishwasher Model Numbers',
    description: 'Bosch dishwashers use format: SH + Type(2) + Series(2) + Features(3) + Color(2)',
    example_models: ['SHPM88Z75N', 'SHXM98W75N', 'SHV863WD3N']
  });

  await insertRulesAndCodes(client, boschDishwasher, [
    {
      position_start: 1, position_end: 2,
      segment_name: 'Brand',
      segment_description: 'Bosch dishwasher identifier',
      color: '#3b82f6',
      codes: [
        { code_value: 'SH', code_meaning: 'Bosch Dishwasher', is_common: true }
      ]
    },
    {
      position_start: 3, position_end: 3,
      segment_name: 'Handle Type',
      segment_description: 'Handle configuration',
      color: '#10b981',
      codes: [
        { code_value: 'P', code_meaning: 'Pocket Handle', is_common: true },
        { code_value: 'X', code_meaning: 'Bar Handle', is_common: true },
        { code_value: 'V', code_meaning: 'Panel Ready' },
        { code_value: 'E', code_meaning: 'European Handle' }
      ]
    },
    {
      position_start: 4, position_end: 4,
      segment_name: 'Tub Material',
      segment_description: 'Interior tub',
      color: '#f59e0b',
      codes: [
        { code_value: 'M', code_meaning: 'Stainless Steel Tub', is_common: true },
        { code_value: 'S', code_meaning: 'Stainless Steel (Alt)' }
      ]
    },
    {
      position_start: 5, position_end: 6,
      segment_name: 'Series',
      segment_description: 'Product tier (higher = better)',
      color: '#8b5cf6',
      codes: [
        { code_value: '88', code_meaning: '800 Series Premium', is_common: true },
        { code_value: '98', code_meaning: '800 Series Top', is_common: true },
        { code_value: '78', code_meaning: '500 Series' },
        { code_value: '68', code_meaning: '300 Series' },
        { code_value: '63', code_meaning: '100 Series' }
      ]
    },
    {
      position_start: 9, position_end: 10,
      segment_name: 'Color',
      segment_description: 'Finish',
      color: '#ec4899',
      codes: [
        { code_value: '5N', code_meaning: 'Stainless Steel', is_common: true },
        { code_value: '3N', code_meaning: 'Panel Ready' },
        { code_value: '6N', code_meaning: 'Black Stainless' }
      ]
    }
  ]);
  console.log('  Added Bosch Dishwasher nomenclature');

  // ========================================
  // FRIGIDAIRE NOMENCLATURE
  // ========================================

  // Frigidaire Refrigerators
  const frigidaireRefrig = await insertTemplate(client, {
    manufacturer: 'FRIGIDAIRE',
    product_type: 'refrigerator',
    template_name: 'Frigidaire Refrigerator Model Numbers',
    description: 'Frigidaire refrigerators use format: Brand(2-4) + Type + Capacity + Color',
    example_models: ['FFSS2615TS', 'FGHB2868TF', 'FFTR1821TS']
  });

  await insertRulesAndCodes(client, frigidaireRefrig, [
    {
      position_start: 1, position_end: 2,
      segment_name: 'Brand/Tier',
      segment_description: 'Product line',
      color: '#3b82f6',
      codes: [
        { code_value: 'FF', code_meaning: 'Frigidaire Standard', is_common: true },
        { code_value: 'FG', code_meaning: 'Frigidaire Gallery', is_common: true },
        { code_value: 'FP', code_meaning: 'Frigidaire Professional' }
      ]
    },
    {
      position_start: 3, position_end: 4,
      segment_name: 'Door Style',
      segment_description: 'Configuration',
      color: '#10b981',
      codes: [
        { code_value: 'SS', code_meaning: 'Side-by-Side', is_common: true },
        { code_value: 'HB', code_meaning: 'French Door', is_common: true },
        { code_value: 'TR', code_meaning: 'Top Freezer' },
        { code_value: 'FU', code_meaning: 'Upright Freezer' }
      ]
    },
    {
      position_start: 5, position_end: 6,
      segment_name: 'Capacity',
      segment_description: 'Cubic feet',
      color: '#8b5cf6',
      codes: [
        { code_value: '26', code_meaning: '26 cubic feet', is_common: true },
        { code_value: '28', code_meaning: '28 cubic feet' },
        { code_value: '21', code_meaning: '21 cubic feet' },
        { code_value: '18', code_meaning: '18 cubic feet' }
      ]
    },
    {
      position_start: 9, position_end: 10,
      segment_name: 'Color',
      segment_description: 'Finish',
      color: '#ec4899',
      codes: [
        { code_value: 'TS', code_meaning: 'Stainless Steel', is_common: true },
        { code_value: 'TF', code_meaning: 'Smudge-Proof Stainless', is_common: true },
        { code_value: 'TW', code_meaning: 'White' },
        { code_value: 'TB', code_meaning: 'Black' },
        { code_value: 'TD', code_meaning: 'Black Stainless' }
      ]
    }
  ]);
  console.log('  Added Frigidaire Refrigerator nomenclature');
}

// Helper function to insert template
async function insertTemplate(client, data) {
  const result = await client.query(`
    INSERT INTO nomenclature_templates (manufacturer, product_type, template_name, description, example_models)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (manufacturer, product_type) DO UPDATE SET
      template_name = EXCLUDED.template_name,
      description = EXCLUDED.description,
      example_models = EXCLUDED.example_models,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `, [data.manufacturer, data.product_type, data.template_name, data.description, data.example_models]);

  return result.rows[0].id;
}

// Helper function to insert rules and codes
async function insertRulesAndCodes(client, templateId, rules) {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];

    // Insert rule
    const ruleResult = await client.query(`
      INSERT INTO nomenclature_rules (template_id, position_start, position_end, segment_name, segment_description, display_order, color)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [templateId, rule.position_start, rule.position_end, rule.segment_name, rule.segment_description, i, rule.color]);

    const ruleId = ruleResult.rows[0].id;

    // Insert codes for this rule
    for (let j = 0; j < rule.codes.length; j++) {
      const code = rule.codes[j];
      await client.query(`
        INSERT INTO nomenclature_codes (rule_id, code_value, code_meaning, additional_info, is_common, display_order)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (rule_id, code_value) DO UPDATE SET
          code_meaning = EXCLUDED.code_meaning,
          additional_info = EXCLUDED.additional_info,
          is_common = EXCLUDED.is_common
      `, [ruleId, code.code_value, code.code_meaning, code.additional_info || null, code.is_common || false, j]);
    }
  }
}

// Run migration
migrate().catch(console.error);
