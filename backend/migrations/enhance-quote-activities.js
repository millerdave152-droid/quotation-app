/**
 * Migration: Enhance quote_events table for comprehensive activity tracking
 *
 * Adds:
 * - user_name: Track who performed the action
 * - user_id: Reference to users table (if available)
 * - metadata: JSON field for additional context
 * - is_internal: Flag for internal-only notes
 * - ip_address: Track where action was performed
 * - activity_category: Group activities by category
 */

require('dotenv').config();
const { Pool } = require('pg');

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
    console.log('Starting migration: enhance-quote-activities');
    await client.query('BEGIN');

    // Add user_name column if not exists
    await client.query(`
      ALTER TABLE quote_events
      ADD COLUMN IF NOT EXISTS user_name VARCHAR(255) DEFAULT 'System'
    `);
    console.log('Added user_name column');

    // Add user_id column if not exists
    await client.query(`
      ALTER TABLE quote_events
      ADD COLUMN IF NOT EXISTS user_id INTEGER
    `);
    console.log('Added user_id column');

    // Add metadata JSON column for storing additional context
    await client.query(`
      ALTER TABLE quote_events
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'
    `);
    console.log('Added metadata column');

    // Add is_internal flag for internal-only notes
    await client.query(`
      ALTER TABLE quote_events
      ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT TRUE
    `);
    console.log('Added is_internal column');

    // Add ip_address for audit trail
    await client.query(`
      ALTER TABLE quote_events
      ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50)
    `);
    console.log('Added ip_address column');

    // Add activity_category for grouping
    await client.query(`
      ALTER TABLE quote_events
      ADD COLUMN IF NOT EXISTS activity_category VARCHAR(50) DEFAULT 'general'
    `);
    console.log('Added activity_category column');

    // Create index for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_events_quotation_id
      ON quote_events(quotation_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_events_created_at
      ON quote_events(created_at DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_events_type
      ON quote_events(event_type)
    `);

    console.log('Created indexes');

    await client.query('COMMIT');
    console.log('Migration completed successfully!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
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
