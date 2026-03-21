/**
 * Migration: Add missing approval fields to quotations table
 * Week 1.1 of 4-week sprint
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

    console.log('Adding missing approval fields to quotations table...');

    // Add approval_required flag
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS approval_required BOOLEAN DEFAULT false
    `);
    console.log('  + approval_required (boolean)');

    // Add approved_by (references users)
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id)
    `);
    console.log('  + approved_by (integer, FK to users)');

    // Add rejected_reason (separate from lost_reason)
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS rejected_reason TEXT
    `);
    console.log('  + rejected_reason (text)');

    // Add accepted_at (when customer accepts the quote)
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP
    `);
    console.log('  + accepted_at (timestamp)');

    // Add rejected_at for completeness
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP
    `);
    console.log('  + rejected_at (timestamp)');

    // Add rejected_by for audit trail
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS rejected_by INTEGER REFERENCES users(id)
    `);
    console.log('  + rejected_by (integer, FK to users)');

    // Create index on approval_required for filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotations_approval_required
      ON quotations(approval_required) WHERE approval_required = true
    `);
    console.log('  + idx_quotations_approval_required (partial index)');

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

up().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
