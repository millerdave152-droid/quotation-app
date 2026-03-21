/**
 * Migration: Add Nomenclature Scraping Schema
 * Adds tables and columns for automated nomenclature scraping
 *
 * Run: node migrations/add-nomenclature-scraping.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
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

    console.log('Adding nomenclature scraping schema...\n');

    // 1. Nomenclature scrape jobs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS nomenclature_scrape_jobs (
        id SERIAL PRIMARY KEY,
        status VARCHAR(20) DEFAULT 'pending',
        job_type VARCHAR(50) DEFAULT 'full', -- 'full', 'single_brand', 'single_category'
        target_brand VARCHAR(50),
        target_category VARCHAR(100),
        brands_found INTEGER DEFAULT 0,
        categories_found INTEGER DEFAULT 0,
        templates_created INTEGER DEFAULT 0,
        templates_updated INTEGER DEFAULT 0,
        rules_created INTEGER DEFAULT 0,
        codes_created INTEGER DEFAULT 0,
        error_log TEXT,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  Created nomenclature_scrape_jobs table');

    // 2. Add source tracking columns to nomenclature_templates
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'nomenclature_templates' AND column_name = 'source_url') THEN
          ALTER TABLE nomenclature_templates ADD COLUMN source_url TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'nomenclature_templates' AND column_name = 'scraped_at') THEN
          ALTER TABLE nomenclature_templates ADD COLUMN scraped_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'nomenclature_templates' AND column_name = 'version') THEN
          ALTER TABLE nomenclature_templates ADD COLUMN version INTEGER DEFAULT 1;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'nomenclature_templates' AND column_name = 'is_scraped') THEN
          ALTER TABLE nomenclature_templates ADD COLUMN is_scraped BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);
    console.log('  Added source tracking columns to nomenclature_templates');

    // 3. Add scraped_raw to nomenclature_codes
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'nomenclature_codes' AND column_name = 'scraped_raw') THEN
          ALTER TABLE nomenclature_codes ADD COLUMN scraped_raw TEXT;
        END IF;
      END $$;
    `);
    console.log('  Added scraped_raw column to nomenclature_codes');

    // 4. Add decoded_attributes to products table
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'products' AND column_name = 'decoded_attributes') THEN
          ALTER TABLE products ADD COLUMN decoded_attributes JSONB;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'products' AND column_name = 'nomenclature_confidence') THEN
          ALTER TABLE products ADD COLUMN nomenclature_confidence INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'products' AND column_name = 'decoded_at') THEN
          ALTER TABLE products ADD COLUMN decoded_at TIMESTAMP;
        END IF;
      END $$;
    `);
    console.log('  Added decoded_attributes columns to products');

    // 5. Nomenclature change log for version tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS nomenclature_change_log (
        id SERIAL PRIMARY KEY,
        template_id INTEGER REFERENCES nomenclature_templates(id) ON DELETE CASCADE,
        rule_id INTEGER REFERENCES nomenclature_rules(id) ON DELETE CASCADE,
        code_id INTEGER REFERENCES nomenclature_codes(id) ON DELETE CASCADE,
        change_type VARCHAR(20) NOT NULL, -- 'added', 'modified', 'removed'
        entity_type VARCHAR(20) NOT NULL, -- 'template', 'rule', 'code'
        field_name VARCHAR(50),
        old_value TEXT,
        new_value TEXT,
        scrape_job_id INTEGER REFERENCES nomenclature_scrape_jobs(id),
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  Created nomenclature_change_log table');

    // 6. Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status
      ON nomenclature_scrape_jobs(status)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scrape_jobs_created
      ON nomenclature_scrape_jobs(created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_change_log_template
      ON nomenclature_change_log(template_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_change_log_detected
      ON nomenclature_change_log(detected_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_decoded
      ON products(nomenclature_confidence) WHERE nomenclature_confidence IS NOT NULL
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_decoded_attrs
      ON products USING gin(decoded_attributes) WHERE decoded_attributes IS NOT NULL
    `);
    console.log('  Created indexes');

    await client.query('COMMIT');
    console.log('\nMigration completed successfully!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nMigration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
