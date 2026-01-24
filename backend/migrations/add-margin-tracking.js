/**
 * Migration: Add Margin Tracking and Quote Events
 *
 * Adds:
 * - margin_percent column to quotations for tracking profit margin
 * - quote_events table for audit trail of quote actions
 */

const pool = require('../db');

async function up() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add margin_percent column to quotations if it doesn't exist
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS margin_percent DECIMAL(5,2)
    `);
    console.log('✅ Added margin_percent column to quotations');

    // Ensure approval_required column exists
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS approval_required BOOLEAN DEFAULT false
    `);
    console.log('✅ Ensured approval_required column exists');

    // Create quote_events table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_events (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        description TEXT,
        user_id INTEGER REFERENCES users(id),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created quote_events table');

    // Add index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_events_quotation_id
      ON quote_events(quotation_id)
    `);
    console.log('✅ Added index on quote_events');

    // Add index on approval_required for filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotations_approval_required
      ON quotations(approval_required) WHERE approval_required = true
    `);
    console.log('✅ Added index on approval_required');

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop quote_events table
    await client.query('DROP TABLE IF EXISTS quote_events');
    console.log('✅ Dropped quote_events table');

    // Remove margin_percent column
    await client.query('ALTER TABLE quotations DROP COLUMN IF EXISTS margin_percent');
    console.log('✅ Dropped margin_percent column');

    await client.query('COMMIT');
    console.log('✅ Rollback completed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  const action = process.argv[2];

  if (action === 'down') {
    down().then(() => process.exit(0)).catch(() => process.exit(1));
  } else {
    up().then(() => process.exit(0)).catch(() => process.exit(1));
  }
}

module.exports = { up, down };
