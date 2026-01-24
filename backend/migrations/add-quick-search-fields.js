/**
 * Migration: Add Quick Search fields to products table
 *
 * Adds:
 * - Product lifecycle status (normal, clearance, discontinued, end_of_line)
 * - Clearance pricing fields
 * - Floor price for negotiation (manager/admin visible)
 * - Full-text search optimization with tsvector
 * - Status change tracking
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
  ssl: { rejectUnauthorized: false }
});

async function up() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Adding Quick Search fields to products table...\n');

    // Product lifecycle status (replaces simple active/discontinued)
    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS product_status VARCHAR(20) DEFAULT 'normal'
    `);
    console.log('  + product_status (normal, clearance, discontinued, end_of_line)');

    // Add check constraint for product_status
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'products_product_status_check'
        ) THEN
          ALTER TABLE products
          ADD CONSTRAINT products_product_status_check
          CHECK (product_status IN ('normal', 'clearance', 'discontinued', 'end_of_line'));
        END IF;
      END $$;
    `);
    console.log('  + Added product_status check constraint');

    // Clearance pricing
    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS clearance_price_cents INTEGER
    `);
    console.log('  + clearance_price_cents');

    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS clearance_start_date DATE
    `);
    console.log('  + clearance_start_date');

    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS clearance_reason VARCHAR(100)
    `);
    console.log('  + clearance_reason');

    // Floor price for negotiation (manager/admin visible)
    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS floor_price_cents INTEGER
    `);
    console.log('  + floor_price_cents');

    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS floor_price_set_by INTEGER REFERENCES users(id)
    `);
    console.log('  + floor_price_set_by');

    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS floor_price_expiry DATE
    `);
    console.log('  + floor_price_expiry');

    // Status change tracking
    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP
    `);
    console.log('  + status_changed_at');

    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS previous_status VARCHAR(20)
    `);
    console.log('  + previous_status');

    // Full-text search optimization
    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS search_vector tsvector
    `);
    console.log('  + search_vector (tsvector for full-text search)');

    // Create indexes
    console.log('\nCreating indexes...');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_product_status
      ON products(product_status)
    `);
    console.log('  + idx_products_product_status');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_search_vector
      ON products USING GIN(search_vector)
    `);
    console.log('  + idx_products_search_vector (GIN)');

    // Partial index for clearance items
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_clearance_active
      ON products(clearance_price_cents, product_status)
      WHERE product_status = 'clearance'
    `);
    console.log('  + idx_products_clearance_active (partial)');

    // Index for floor price queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_floor_price
      ON products(floor_price_cents)
      WHERE floor_price_cents IS NOT NULL
    `);
    console.log('  + idx_products_floor_price (partial)');

    // Create function to update search_vector
    console.log('\nCreating search vector update function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION products_search_vector_update() RETURNS trigger AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('english', COALESCE(NEW.model, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW.manufacturer, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C');
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql;
    `);
    console.log('  + products_search_vector_update function');

    // Create trigger for search_vector
    await client.query(`
      DROP TRIGGER IF EXISTS trig_products_search_vector ON products;
      CREATE TRIGGER trig_products_search_vector
      BEFORE INSERT OR UPDATE OF model, name, manufacturer, category, description
      ON products
      FOR EACH ROW
      EXECUTE FUNCTION products_search_vector_update();
    `);
    console.log('  + trig_products_search_vector trigger');

    // Create function for auto-transition clearance → discontinued when stock hits 0
    console.log('\nCreating status auto-transition function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION products_status_auto_transition() RETURNS trigger AS $$
      BEGIN
        -- Auto-transition clearance to discontinued when stock hits 0
        IF NEW.product_status = 'clearance'
           AND NEW.stock_quantity IS NOT NULL
           AND NEW.stock_quantity <= 0
           AND (OLD.stock_quantity IS NULL OR OLD.stock_quantity > 0) THEN
          NEW.previous_status := NEW.product_status;
          NEW.product_status := 'discontinued';
          NEW.status_changed_at := CURRENT_TIMESTAMP;
        END IF;
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql;
    `);
    console.log('  + products_status_auto_transition function');

    // Create trigger for status auto-transition
    await client.query(`
      DROP TRIGGER IF EXISTS trig_products_status_transition ON products;
      CREATE TRIGGER trig_products_status_transition
      BEFORE UPDATE OF stock_quantity
      ON products
      FOR EACH ROW
      EXECUTE FUNCTION products_status_auto_transition();
    `);
    console.log('  + trig_products_status_transition trigger');

    // Populate search_vector for existing products
    console.log('\nPopulating search_vector for existing products...');
    const updateResult = await client.query(`
      UPDATE products
      SET search_vector =
        setweight(to_tsvector('english', COALESCE(model, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(manufacturer, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(category, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(description, '')), 'C')
      WHERE search_vector IS NULL
    `);
    console.log(`  Updated ${updateResult.rowCount} products with search_vector`);

    await client.query('COMMIT');
    console.log('\nMigration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function down() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Rolling back Quick Search fields migration...');

    // Drop triggers first
    await client.query('DROP TRIGGER IF EXISTS trig_products_status_transition ON products');
    await client.query('DROP TRIGGER IF EXISTS trig_products_search_vector ON products');

    // Drop functions
    await client.query('DROP FUNCTION IF EXISTS products_status_auto_transition()');
    await client.query('DROP FUNCTION IF EXISTS products_search_vector_update()');

    // Drop indexes
    await client.query('DROP INDEX IF EXISTS idx_products_floor_price');
    await client.query('DROP INDEX IF EXISTS idx_products_clearance_active');
    await client.query('DROP INDEX IF EXISTS idx_products_search_vector');
    await client.query('DROP INDEX IF EXISTS idx_products_product_status');

    // Drop constraint
    await client.query('ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_status_check');

    // Drop columns
    await client.query('ALTER TABLE products DROP COLUMN IF EXISTS search_vector');
    await client.query('ALTER TABLE products DROP COLUMN IF EXISTS previous_status');
    await client.query('ALTER TABLE products DROP COLUMN IF EXISTS status_changed_at');
    await client.query('ALTER TABLE products DROP COLUMN IF EXISTS floor_price_expiry');
    await client.query('ALTER TABLE products DROP COLUMN IF EXISTS floor_price_set_by');
    await client.query('ALTER TABLE products DROP COLUMN IF EXISTS floor_price_cents');
    await client.query('ALTER TABLE products DROP COLUMN IF EXISTS clearance_reason');
    await client.query('ALTER TABLE products DROP COLUMN IF EXISTS clearance_start_date');
    await client.query('ALTER TABLE products DROP COLUMN IF EXISTS clearance_price_cents');
    await client.query('ALTER TABLE products DROP COLUMN IF EXISTS product_status');

    await client.query('COMMIT');
    console.log('Rollback completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Rollback failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration based on command line argument
const command = process.argv[2];

if (command === 'down') {
  down().catch(err => {
    console.error('Rollback error:', err);
    process.exit(1);
  });
} else {
  up().catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
  });
}
