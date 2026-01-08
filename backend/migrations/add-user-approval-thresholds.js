/**
 * Migration: Add User Approval Thresholds
 * Adds approval-related columns to users table for role-based quote approval workflow
 */

const db = require('../config/database');

async function migrate() {
  const client = await db.connect();

  try {
    console.log('Starting migration: add-user-approval-thresholds');
    await client.query('BEGIN');

    // Add approval threshold columns to users table
    await client.query(`
      -- Add approval threshold percent (margin % below which approval is required)
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS approval_threshold_percent DECIMAL(5,2) DEFAULT NULL;

      -- Add flag for users who can approve quotes
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS can_approve_quotes BOOLEAN DEFAULT false;

      -- Add maximum approval amount in cents (optional limit)
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS max_approval_amount_cents INTEGER DEFAULT NULL;

      -- Add manager reference for hierarchical approval
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

      -- Add department for organizational grouping
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT NULL;

      -- Add phone number for contact
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS phone VARCHAR(50) DEFAULT NULL;

      -- Add job title
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS job_title VARCHAR(100) DEFAULT NULL;
    `);

    console.log('Added approval columns to users table');

    // Create index for manager lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id);
      CREATE INDEX IF NOT EXISTS idx_users_can_approve ON users(can_approve_quotes) WHERE can_approve_quotes = true;
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    `);

    console.log('Created indexes for users table');

    // Update existing admin/manager users to be approvers by default
    const result = await client.query(`
      UPDATE users
      SET can_approve_quotes = true
      WHERE role IN ('admin', 'manager', 'supervisor')
      AND can_approve_quotes = false;
    `);

    console.log(`Updated ${result.rowCount} admin/manager users to be approvers`);

    // Add default approval threshold for non-approver users (15%)
    await client.query(`
      UPDATE users
      SET approval_threshold_percent = 15.00
      WHERE role = 'user'
      AND approval_threshold_percent IS NULL;
    `);

    console.log('Set default approval threshold for regular users');

    await client.query('COMMIT');
    console.log('Migration completed successfully: add-user-approval-thresholds');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Migration finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration error:', error);
      process.exit(1);
    });
}

module.exports = { migrate };
