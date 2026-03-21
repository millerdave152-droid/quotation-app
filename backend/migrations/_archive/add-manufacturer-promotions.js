/**
 * Migration: Add Manufacturer Promotions System
 *
 * Creates tables for:
 * - manufacturer_promotions: Master promotion definitions
 * - promotion_eligible_models: Links promotions to qualifying product models
 * - quote_applied_promotions: Tracks promotions applied to quotes
 * - promotion_import_logs: Import history tracking
 * - promotion_watch_folders: Folder watch configuration
 */

const pool = require('../db');

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Starting manufacturer promotions migration...');
    await client.query('BEGIN');

    // ============================================
    // TABLE: manufacturer_promotions
    // ============================================
    console.log('Creating manufacturer_promotions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS manufacturer_promotions (
        id SERIAL PRIMARY KEY,
        promo_code VARCHAR(100) UNIQUE NOT NULL,
        promo_name VARCHAR(255) NOT NULL,
        manufacturer VARCHAR(100) NOT NULL,
        promo_type VARCHAR(50) NOT NULL CHECK (promo_type IN ('bundle_savings', 'bonus_gift', 'guarantee')),

        -- Bundle-specific fields
        min_qualifying_items INTEGER,
        tier_discounts JSONB,

        -- Bonus Gift fields
        gift_description VARCHAR(500),
        gift_value_cents INTEGER,
        redemption_type VARCHAR(50) CHECK (redemption_type IN ('dealer_applied', 'consumer_registration')),
        redemption_url VARCHAR(500),

        -- Guarantee/Badge fields
        badge_text VARCHAR(100),
        badge_color VARCHAR(20) DEFAULT '#059669',
        show_on_product_card BOOLEAN DEFAULT true,
        show_on_quote BOOLEAN DEFAULT true,

        -- Date validity
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,

        -- Stacking rules
        can_combine_with JSONB DEFAULT '[]'::jsonb,
        exclusion_rules JSONB,

        -- Claimback info (display only)
        claimback_info TEXT,
        claimback_deadline DATE,

        -- Metadata
        source_file VARCHAR(255),
        import_batch_id INTEGER,
        is_active BOOLEAN DEFAULT true,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ============================================
    // TABLE: promotion_eligible_models
    // ============================================
    console.log('Creating promotion_eligible_models table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS promotion_eligible_models (
        id SERIAL PRIMARY KEY,
        promotion_id INTEGER NOT NULL REFERENCES manufacturer_promotions(id) ON DELETE CASCADE,
        brand VARCHAR(100) NOT NULL,
        category VARCHAR(100),
        subcategory VARCHAR(100),
        model VARCHAR(100) NOT NULL,
        product_family_detail VARCHAR(255),
        notes TEXT,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(promotion_id, brand, model)
      )
    `);

    // ============================================
    // TABLE: quote_applied_promotions
    // ============================================
    console.log('Creating quote_applied_promotions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_applied_promotions (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        promotion_id INTEGER NOT NULL REFERENCES manufacturer_promotions(id) ON DELETE CASCADE,

        -- Application details
        applied_by INTEGER REFERENCES users(id),
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        -- Calculated values at time of application
        qualifying_items JSONB,
        qualifying_count INTEGER,
        discount_amount_cents INTEGER DEFAULT 0,

        -- For bonus gifts
        gift_included BOOLEAN DEFAULT false,

        -- Status
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'removed', 'expired')),
        removed_at TIMESTAMP,
        removed_by INTEGER REFERENCES users(id),
        removal_reason VARCHAR(255),

        UNIQUE(quotation_id, promotion_id)
      )
    `);

    // ============================================
    // TABLE: promotion_import_logs
    // ============================================
    console.log('Creating promotion_import_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS promotion_import_logs (
        id SERIAL PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500),
        import_source VARCHAR(50) NOT NULL CHECK (import_source IN ('manual_upload', 'folder_watch')),
        manufacturer VARCHAR(100),

        -- Results
        status VARCHAR(50) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'success', 'partial', 'failed')),
        promotions_created INTEGER DEFAULT 0,
        promotions_updated INTEGER DEFAULT 0,
        models_imported INTEGER DEFAULT 0,
        models_matched INTEGER DEFAULT 0,
        errors_count INTEGER DEFAULT 0,

        -- Details
        summary JSONB,
        error_details JSONB,
        processing_time_ms INTEGER,

        imported_by INTEGER REFERENCES users(id),
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    // ============================================
    // TABLE: promotion_watch_folders
    // ============================================
    console.log('Creating promotion_watch_folders table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS promotion_watch_folders (
        id SERIAL PRIMARY KEY,
        folder_path VARCHAR(500) NOT NULL UNIQUE,
        manufacturer VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        check_interval_minutes INTEGER DEFAULT 60,
        last_checked_at TIMESTAMP,
        files_processed INTEGER DEFAULT 0,
        last_file_processed VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ============================================
    // INDEXES
    // ============================================
    console.log('Creating indexes...');

    // manufacturer_promotions indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mfr_promos_manufacturer
      ON manufacturer_promotions(manufacturer)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mfr_promos_type
      ON manufacturer_promotions(promo_type)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mfr_promos_dates
      ON manufacturer_promotions(start_date, end_date)
      WHERE is_active = true
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mfr_promos_active
      ON manufacturer_promotions(is_active, start_date, end_date)
    `);

    // promotion_eligible_models indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_promo_models_promotion
      ON promotion_eligible_models(promotion_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_promo_models_model
      ON promotion_eligible_models(model)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_promo_models_brand_model
      ON promotion_eligible_models(brand, model)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_promo_models_product
      ON promotion_eligible_models(product_id)
      WHERE product_id IS NOT NULL
    `);

    // quote_applied_promotions indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_promos_quote
      ON quote_applied_promotions(quotation_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_promos_promotion
      ON quote_applied_promotions(promotion_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_promos_status
      ON quote_applied_promotions(quotation_id, status)
    `);

    // promotion_import_logs indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_promo_import_logs_status
      ON promotion_import_logs(status)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_promo_import_logs_date
      ON promotion_import_logs(started_at DESC)
    `);

    // ============================================
    // TRIGGER: Update updated_at timestamp
    // ============================================
    console.log('Creating update trigger...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_manufacturer_promotions_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_manufacturer_promotions ON manufacturer_promotions
    `);
    await client.query(`
      CREATE TRIGGER trigger_update_manufacturer_promotions
      BEFORE UPDATE ON manufacturer_promotions
      FOR EACH ROW
      EXECUTE FUNCTION update_manufacturer_promotions_updated_at()
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully!');

    // Show table summary
    const tables = ['manufacturer_promotions', 'promotion_eligible_models', 'quote_applied_promotions', 'promotion_import_logs', 'promotion_watch_folders'];
    console.log('\nTables created:');
    for (const table of tables) {
      const result = await client.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`  - ${table}: ${result.rows[0].count} rows`);
    }

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function rollback() {
  const client = await pool.connect();

  try {
    console.log('Rolling back manufacturer promotions migration...');
    await client.query('BEGIN');

    // Drop tables in reverse order (respecting foreign keys)
    await client.query('DROP TABLE IF EXISTS promotion_watch_folders CASCADE');
    await client.query('DROP TABLE IF EXISTS promotion_import_logs CASCADE');
    await client.query('DROP TABLE IF EXISTS quote_applied_promotions CASCADE');
    await client.query('DROP TABLE IF EXISTS promotion_eligible_models CASCADE');
    await client.query('DROP TABLE IF EXISTS manufacturer_promotions CASCADE');

    // Drop trigger function
    await client.query('DROP FUNCTION IF EXISTS update_manufacturer_promotions_updated_at CASCADE');

    await client.query('COMMIT');
    console.log('Rollback completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration or rollback based on command line argument
const command = process.argv[2];

if (command === 'rollback') {
  rollback()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} else {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrate, rollback };
