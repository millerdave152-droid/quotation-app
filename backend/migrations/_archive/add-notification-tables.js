/**
 * Migration: Add notification tables for email audit trail and user preferences
 * Run with: node migrations/add-notification-tables.js
 */

const pool = require('../db');

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating notification_log table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_log (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
        notification_type VARCHAR(50) NOT NULL,
        recipient_email VARCHAR(255) NOT NULL,
        subject VARCHAR(500),
        status VARCHAR(20) DEFAULT 'sent',
        error_message TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating notification_preferences table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id SERIAL PRIMARY KEY,
        user_email VARCHAR(255) UNIQUE NOT NULL,
        quote_created BOOLEAN DEFAULT true,
        quote_won BOOLEAN DEFAULT true,
        quote_lost BOOLEAN DEFAULT true,
        quote_updated BOOLEAN DEFAULT true,
        expiry_warning BOOLEAN DEFAULT true,
        follow_up_reminder BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_log_quote_id ON notification_log(quote_id);
      CREATE INDEX IF NOT EXISTS idx_notification_log_type ON notification_log(notification_type);
      CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON notification_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_notification_log_recipient ON notification_log(recipient_email);
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// Run if executed directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = migrate;
