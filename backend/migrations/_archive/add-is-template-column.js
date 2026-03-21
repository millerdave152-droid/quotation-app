/**
 * Migration: Add is_template column to quotations table
 *
 * This allows quotes to be saved as templates without requiring a customer.
 * Templates can be used as starting points for new quotes.
 */

const { Pool } = require('pg');
require('dotenv').config();

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
    console.log('🚀 Starting migration: add-is-template-column');

    await client.query('BEGIN');

    // Add is_template column to quotations table
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE
    `);
    console.log('✅ Added is_template column to quotations');

    // Add template_name column for named templates
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS template_name VARCHAR(255)
    `);
    console.log('✅ Added template_name column to quotations');

    // Add template_description column
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS template_description TEXT
    `);
    console.log('✅ Added template_description column to quotations');

    // Create index for quick template lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotations_is_template
      ON quotations(is_template)
      WHERE is_template = TRUE
    `);
    console.log('✅ Created index for template lookups');

    await client.query('COMMIT');

    console.log('✅ Migration completed successfully!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrate };
