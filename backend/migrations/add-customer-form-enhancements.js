/**
 * Migration: Customer Form Enhancements
 *
 * Creates tables for:
 * - Canadian cities autocomplete (5000+ cities)
 * - Postal code cache (Geocoder.ca results)
 * - Common Canadian names (first and last names)
 *
 * Also modifies customers table to allow NULL email
 */

const pool = require('../db');

async function up() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Starting customer form enhancements migration...');

    // 1. Allow NULL email in customers table
    console.log('1. Modifying customers table to allow NULL email...');

    // Drop existing unique constraint if it exists
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'customers_email_key'
        ) THEN
          ALTER TABLE customers DROP CONSTRAINT customers_email_key;
        END IF;
      END $$;
    `);

    // Allow NULL in email column
    await client.query(`
      ALTER TABLE customers ALTER COLUMN email DROP NOT NULL;
    `);

    // Create partial unique index (only for non-null emails)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique_key
      ON customers(email) WHERE email IS NOT NULL;
    `);

    console.log('   ✓ Customers table modified');

    // 2. Create canadian_cities table
    console.log('2. Creating canadian_cities table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS canadian_cities (
        id SERIAL PRIMARY KEY,
        city_name VARCHAR(255) NOT NULL,
        province_code VARCHAR(2) NOT NULL,
        province_name VARCHAR(100) NOT NULL,
        population INTEGER DEFAULT 0,
        latitude DECIMAL(10, 6),
        longitude DECIMAL(10, 6),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for efficient searching
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cities_name
      ON canadian_cities(city_name);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cities_name_lower
      ON canadian_cities(LOWER(city_name));
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cities_province
      ON canadian_cities(province_code);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cities_population
      ON canadian_cities(population DESC);
    `);

    console.log('   ✓ canadian_cities table created');

    // 3. Create postal_code_cache table
    console.log('3. Creating postal_code_cache table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS postal_code_cache (
        id SERIAL PRIMARY KEY,
        postal_code VARCHAR(7) UNIQUE NOT NULL,
        city VARCHAR(255),
        province_code VARCHAR(2),
        province_name VARCHAR(100),
        latitude DECIMAL(10, 6),
        longitude DECIMAL(10, 6),
        lookup_count INTEGER DEFAULT 1,
        last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_postal_code_lookup
      ON postal_code_cache(postal_code);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_postal_code_city
      ON postal_code_cache(city);
    `);

    console.log('   ✓ postal_code_cache table created');

    // 4. Create canadian_names table
    console.log('4. Creating canadian_names table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS canadian_names (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        name_type VARCHAR(10) NOT NULL CHECK (name_type IN ('first', 'last')),
        frequency INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_names_search
      ON canadian_names(name);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_names_search_lower
      ON canadian_names(LOWER(name));
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_names_type
      ON canadian_names(name_type);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_names_frequency
      ON canadian_names(frequency DESC);
    `);

    console.log('   ✓ canadian_names table created');

    await client.query('COMMIT');

    console.log('\n========================================');
    console.log('Migration completed successfully!');
    console.log('========================================');
    console.log('Tables created/modified:');
    console.log('  - customers (email now nullable)');
    console.log('  - canadian_cities');
    console.log('  - postal_code_cache');
    console.log('  - canadian_names');
    console.log('========================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Rolling back customer form enhancements migration...');

    // Drop tables in reverse order
    await client.query('DROP TABLE IF EXISTS canadian_names CASCADE;');
    console.log('   ✓ Dropped canadian_names');

    await client.query('DROP TABLE IF EXISTS postal_code_cache CASCADE;');
    console.log('   ✓ Dropped postal_code_cache');

    await client.query('DROP TABLE IF EXISTS canadian_cities CASCADE;');
    console.log('   ✓ Dropped canadian_cities');

    // Note: We don't revert the customers email change as it would break existing NULL records
    console.log('   ⚠ customers.email NOT NULL constraint not restored (may have NULL records)');

    await client.query('COMMIT');

    console.log('\nRollback completed.\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Rollback failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  const action = process.argv[2] || 'up';

  if (action === 'up') {
    up()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else if (action === 'down') {
    down()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    console.log('Usage: node add-customer-form-enhancements.js [up|down]');
    process.exit(1);
  }
}

module.exports = { up, down };
