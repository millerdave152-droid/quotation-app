/**
 * Migration: Add Vendor Products Tables
 *
 * Creates tables for:
 * - vendor_sources: Manufacturer portals (Whirlpool Central, etc.)
 * - vendor_products: Scraped product data
 * - vendor_product_images: Multi-resolution images
 * - vendor_product_assets: Documents, manuals, spec sheets
 * - scrape_jobs: Job tracking for scrape operations
 */

const pool = require('../db');

async function runMigration() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating vendor_sources table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_sources (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        base_url VARCHAR(500) NOT NULL,
        login_url VARCHAR(500),
        requires_auth BOOLEAN DEFAULT true,
        credentials_key VARCHAR(100),
        rate_limit_ms INTEGER DEFAULT 2000,
        is_active BOOLEAN DEFAULT true,
        last_sync TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating vendor_products table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_products (
        id SERIAL PRIMARY KEY,
        vendor_source_id INTEGER REFERENCES vendor_sources(id),
        external_id VARCHAR(100),
        model_number VARCHAR(100) NOT NULL,
        name VARCHAR(500) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        subcategory VARCHAR(100),
        brand VARCHAR(100),
        msrp_cents INTEGER,
        dealer_price_cents INTEGER,
        specifications JSONB DEFAULT '{}',
        features JSONB DEFAULT '[]',
        dimensions JSONB DEFAULT '{}',
        energy_rating VARCHAR(50),
        color_finish VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        last_scraped TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vendor_source_id, model_number)
      )
    `);

    console.log('Creating vendor_product_images table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_product_images (
        id SERIAL PRIMARY KEY,
        vendor_product_id INTEGER REFERENCES vendor_products(id) ON DELETE CASCADE,
        image_type VARCHAR(50) NOT NULL,
        angle VARCHAR(50),
        original_url TEXT NOT NULL,
        local_path TEXT,
        thumbnail_path TEXT,
        web_path TEXT,
        print_path TEXT,
        alt_text VARCHAR(500),
        sort_order INTEGER DEFAULT 0,
        is_primary BOOLEAN DEFAULT false,
        file_size_bytes INTEGER,
        width INTEGER,
        height INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating vendor_product_assets table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_product_assets (
        id SERIAL PRIMARY KEY,
        vendor_product_id INTEGER REFERENCES vendor_products(id) ON DELETE CASCADE,
        asset_type VARCHAR(50) NOT NULL,
        name VARCHAR(255),
        original_url TEXT NOT NULL,
        local_path TEXT,
        file_size_bytes INTEGER,
        mime_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating scrape_jobs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS scrape_jobs (
        id SERIAL PRIMARY KEY,
        vendor_source_id INTEGER REFERENCES vendor_sources(id),
        job_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        products_found INTEGER DEFAULT 0,
        products_scraped INTEGER DEFAULT 0,
        products_failed INTEGER DEFAULT 0,
        images_downloaded INTEGER DEFAULT 0,
        error_log TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    console.log('Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_products_category ON vendor_products(category);
      CREATE INDEX IF NOT EXISTS idx_vendor_products_brand ON vendor_products(brand);
      CREATE INDEX IF NOT EXISTS idx_vendor_products_model ON vendor_products(model_number);
      CREATE INDEX IF NOT EXISTS idx_vendor_products_source ON vendor_products(vendor_source_id);
      CREATE INDEX IF NOT EXISTS idx_vendor_product_images_type ON vendor_product_images(image_type);
      CREATE INDEX IF NOT EXISTS idx_vendor_product_images_product ON vendor_product_images(vendor_product_id);
      CREATE INDEX IF NOT EXISTS idx_vendor_product_assets_product ON vendor_product_assets(vendor_product_id);
      CREATE INDEX IF NOT EXISTS idx_scrape_jobs_vendor ON scrape_jobs(vendor_source_id);
      CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status);
    `);

    // Insert default vendor source for Whirlpool Central
    console.log('Inserting default vendor source...');
    await client.query(`
      INSERT INTO vendor_sources (name, base_url, login_url, requires_auth, credentials_key, rate_limit_ms)
      VALUES ('Whirlpool Central', 'https://whirlpoolcentral.ca', 'https://whirlpoolcentral.ca/login', true, 'WHIRLPOOL_CENTRAL', 2000)
      ON CONFLICT DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('Vendor products migration complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration error:', err);
      process.exit(1);
    });
}

module.exports = { runMigration };
