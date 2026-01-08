/**
 * Migration: Add approval_type column to quote_approvals table
 * This supports differentiating between manual approval requests and auto-triggered margin approvals
 */

const { Pool } = require('pg');
require('dotenv').config();

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
    console.log('Starting migration: add-approval-type-column');

    await client.query('BEGIN');

    // Check if column already exists
    const checkColumn = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'quote_approvals' AND column_name = 'approval_type'
    `);

    if (checkColumn.rows.length === 0) {
      // Add approval_type column
      await client.query(`
        ALTER TABLE quote_approvals
        ADD COLUMN approval_type VARCHAR(30) DEFAULT 'manual'
      `);
      console.log('Added approval_type column to quote_approvals');

      // Add comment
      await client.query(`
        COMMENT ON COLUMN quote_approvals.approval_type IS
        'Type of approval: manual (user-requested), margin_threshold (auto-triggered by low margin), counter_offer'
      `);
    } else {
      console.log('approval_type column already exists, skipping');
    }

    // Also check if we need to add requester_user_id for linking to users table
    const checkRequester = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'quote_approvals' AND column_name = 'requester_user_id'
    `);

    if (checkRequester.rows.length === 0) {
      await client.query(`
        ALTER TABLE quote_approvals
        ADD COLUMN requester_user_id INTEGER REFERENCES users(id)
      `);
      console.log('Added requester_user_id column to quote_approvals');
    }

    // Add approver_user_id if not exists
    const checkApprover = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'quote_approvals' AND column_name = 'approver_user_id'
    `);

    if (checkApprover.rows.length === 0) {
      await client.query(`
        ALTER TABLE quote_approvals
        ADD COLUMN approver_user_id INTEGER REFERENCES users(id)
      `);
      console.log('Added approver_user_id column to quote_approvals');
    }

    // Add margin_at_request column to track the margin when approval was requested
    const checkMargin = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'quote_approvals' AND column_name = 'margin_at_request'
    `);

    if (checkMargin.rows.length === 0) {
      await client.query(`
        ALTER TABLE quote_approvals
        ADD COLUMN margin_at_request DECIMAL(5,2)
      `);
      console.log('Added margin_at_request column to quote_approvals');
    }

    // Add threshold_at_request column
    const checkThreshold = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'quote_approvals' AND column_name = 'threshold_at_request'
    `);

    if (checkThreshold.rows.length === 0) {
      await client.query(`
        ALTER TABLE quote_approvals
        ADD COLUMN threshold_at_request DECIMAL(5,2)
      `);
      console.log('Added threshold_at_request column to quote_approvals');
    }

    await client.query('COMMIT');
    console.log('Migration completed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
