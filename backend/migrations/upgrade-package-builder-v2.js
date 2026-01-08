/**
 * Package Builder v2 Migration
 * Adds: subtype, depth_type, capacity_band, noise_band, recommendable, is_test
 * Updates: question grouping and requirement mode support
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

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting Package Builder v2 migration...\n');

    await client.query('BEGIN');

    // ============================================
    // 1. ADD NEW COLUMNS TO PRODUCT_EXTENDED_ATTRIBUTES
    // ============================================
    console.log('1. Adding new columns to product_extended_attributes...');

    await client.query(`
      ALTER TABLE product_extended_attributes
      ADD COLUMN IF NOT EXISTS subtype VARCHAR(50);
    `);
    console.log('   - Added subtype column');

    await client.query(`
      ALTER TABLE product_extended_attributes
      ADD COLUMN IF NOT EXISTS depth_type VARCHAR(20);
    `);
    console.log('   - Added depth_type column');

    await client.query(`
      ALTER TABLE product_extended_attributes
      ADD COLUMN IF NOT EXISTS capacity_band VARCHAR(20);
    `);
    console.log('   - Added capacity_band column');

    await client.query(`
      ALTER TABLE product_extended_attributes
      ADD COLUMN IF NOT EXISTS noise_band VARCHAR(20);
    `);
    console.log('   - Added noise_band column');

    await client.query(`
      ALTER TABLE product_extended_attributes
      ADD COLUMN IF NOT EXISTS is_vented BOOLEAN;
    `);
    console.log('   - Added is_vented column');

    await client.query(`
      ALTER TABLE product_extended_attributes
      ADD COLUMN IF NOT EXISTS voltage VARCHAR(10);
    `);
    console.log('   - Added voltage column');

    // ============================================
    // 2. ADD RECOMMENDABLE AND IS_TEST TO PRODUCTS
    // ============================================
    console.log('\n2. Adding recommendable and is_test flags to products...');

    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS recommendable BOOLEAN DEFAULT true;
    `);
    console.log('   - Added recommendable column');

    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;
    `);
    console.log('   - Added is_test column');

    // ============================================
    // 3. ADD QUESTION GROUPING COLUMNS
    // ============================================
    console.log('\n3. Adding question grouping columns...');

    await client.query(`
      ALTER TABLE package_questions
      ADD COLUMN IF NOT EXISTS question_group VARCHAR(50);
    `);
    console.log('   - Added question_group column');

    await client.query(`
      ALTER TABLE package_questions
      ADD COLUMN IF NOT EXISTS group_order INTEGER DEFAULT 1;
    `);
    console.log('   - Added group_order column');

    await client.query(`
      ALTER TABLE package_questions
      ADD COLUMN IF NOT EXISTS show_group_header BOOLEAN DEFAULT false;
    `);
    console.log('   - Added show_group_header column');

    // ============================================
    // 4. ADD REQUIREMENT MODE SUPPORT TO OPTIONS
    // ============================================
    console.log('\n4. Adding requirement mode support to question options...');

    await client.query(`
      ALTER TABLE package_question_options
      ADD COLUMN IF NOT EXISTS supports_requirement_mode BOOLEAN DEFAULT false;
    `);
    console.log('   - Added supports_requirement_mode column');

    await client.query(`
      ALTER TABLE package_question_options
      ADD COLUMN IF NOT EXISTS default_mode VARCHAR(20) DEFAULT 'preference';
    `);
    console.log('   - Added default_mode column');

    // ============================================
    // 5. CREATE INDEXES
    // ============================================
    console.log('\n5. Creating indexes...');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pea_subtype
      ON product_extended_attributes(subtype);
    `);
    console.log('   - Created idx_pea_subtype');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pea_depth_type
      ON product_extended_attributes(depth_type);
    `);
    console.log('   - Created idx_pea_depth_type');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pea_capacity_band
      ON product_extended_attributes(capacity_band);
    `);
    console.log('   - Created idx_pea_capacity_band');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_recommendable
      ON products(recommendable) WHERE recommendable = true;
    `);
    console.log('   - Created idx_products_recommendable');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_is_test
      ON products(is_test) WHERE is_test = false;
    `);
    console.log('   - Created idx_products_is_test');

    // ============================================
    // 6. CREATE RECOMMENDATION_ANALYTICS TABLE
    // ============================================
    console.log('\n6. Creating recommendation_analytics table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS recommendation_analytics (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES package_sessions(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        tier VARCHAR(20),
        slot VARCHAR(50),
        score INTEGER,
        recommended_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('   - Created recommendation_analytics table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ra_session
      ON recommendation_analytics(session_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ra_product
      ON recommendation_analytics(product_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ra_recommended_at
      ON recommendation_analytics(recommended_at);
    `);
    console.log('   - Created indexes for recommendation_analytics');

    // ============================================
    // 7. AUTO-POPULATE DERIVED ATTRIBUTES
    // ============================================
    console.log('\n7. Auto-populating derived attributes...');

    // Set noise_band based on db_level
    await client.query(`
      UPDATE product_extended_attributes
      SET noise_band = CASE
        WHEN db_level IS NULL THEN NULL
        WHEN db_level < 40 THEN 'whisper'
        WHEN db_level < 45 THEN 'quiet'
        WHEN db_level < 50 THEN 'moderate'
        ELSE 'standard'
      END
      WHERE noise_band IS NULL AND db_level IS NOT NULL;
    `);
    const noiseResult = await client.query(`SELECT COUNT(*) FROM product_extended_attributes WHERE noise_band IS NOT NULL`);
    console.log(`   - Set noise_band for ${noiseResult.rows[0].count} products`);

    // Set capacity_band based on capacity_cubic_ft_x10
    await client.query(`
      UPDATE product_extended_attributes
      SET capacity_band = CASE
        WHEN capacity_cubic_ft_x10 IS NULL THEN NULL
        WHEN capacity_cubic_ft_x10 < 40 THEN 'compact'
        WHEN capacity_cubic_ft_x10 < 55 THEN 'standard'
        WHEN capacity_cubic_ft_x10 < 65 THEN 'large'
        ELSE 'xl'
      END
      WHERE capacity_band IS NULL AND capacity_cubic_ft_x10 IS NOT NULL;
    `);
    const capacityResult = await client.query(`SELECT COUNT(*) FROM product_extended_attributes WHERE capacity_band IS NOT NULL`);
    console.log(`   - Set capacity_band for ${capacityResult.rows[0].count} products`);

    // Set depth_type based on depth_inches_x10 (counter depth typically 24-30")
    await client.query(`
      UPDATE product_extended_attributes
      SET depth_type = CASE
        WHEN depth_inches_x10 IS NULL THEN NULL
        WHEN depth_inches_x10 <= 300 THEN 'counter_depth'
        ELSE 'standard'
      END
      WHERE depth_type IS NULL AND depth_inches_x10 IS NOT NULL;
    `);
    const depthResult = await client.query(`SELECT COUNT(*) FROM product_extended_attributes WHERE depth_type IS NOT NULL`);
    console.log(`   - Set depth_type for ${depthResult.rows[0].count} products`);

    await client.query('COMMIT');

    console.log('\n========================================');
    console.log('Package Builder v2 migration completed successfully!');
    console.log('========================================\n');

    // Print summary
    const summary = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM products WHERE recommendable = true) as recommendable_products,
        (SELECT COUNT(*) FROM products WHERE is_test = true) as test_products,
        (SELECT COUNT(*) FROM product_extended_attributes WHERE subtype IS NOT NULL) as products_with_subtype,
        (SELECT COUNT(*) FROM product_extended_attributes WHERE depth_type IS NOT NULL) as products_with_depth_type
    `);
    console.log('Summary:');
    console.log(`  - Recommendable products: ${summary.rows[0].recommendable_products}`);
    console.log(`  - Test products: ${summary.rows[0].test_products}`);
    console.log(`  - Products with subtype: ${summary.rows[0].products_with_subtype}`);
    console.log(`  - Products with depth_type: ${summary.rows[0].products_with_depth_type}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
