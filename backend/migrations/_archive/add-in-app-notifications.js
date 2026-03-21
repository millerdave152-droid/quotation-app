/**
 * Migration: Add In-App Notifications System
 * Creates table for storing user notifications with badge counts
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
    console.log('Starting migration: add-in-app-notifications');

    await client.query('BEGIN');

    // Check if table already exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'user_notifications'
      )
    `);

    if (!tableExists.rows[0].exists) {
      // Create notifications table
      await client.query(`
        CREATE TABLE user_notifications (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

          -- Notification content
          notification_type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT,
          icon VARCHAR(10) DEFAULT 'bell',

          -- Related entities
          related_quote_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
          related_counter_offer_id INTEGER,
          related_approval_id INTEGER,

          -- Action URL (optional)
          action_url VARCHAR(500),

          -- Status
          is_read BOOLEAN DEFAULT false,
          read_at TIMESTAMP,

          -- Priority
          priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent

          -- Audit
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP DEFAULT NULL
        )
      `);
      console.log('Created user_notifications table');

      // Add indexes (with IF NOT EXISTS to handle partial runs)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_notifications_unread ON user_notifications(user_id, is_read) WHERE is_read = false;
        CREATE INDEX IF NOT EXISTS idx_user_notifications_created ON user_notifications(created_at);
        CREATE INDEX IF NOT EXISTS idx_user_notifications_type ON user_notifications(notification_type);
      `);
      console.log('Created indexes on user_notifications');

    } else {
      console.log('user_notifications table already exists, skipping');
    }

    // Create notification_preferences table if not exists
    const prefsExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'notification_preferences'
      )
    `);

    if (!prefsExists.rows[0].exists) {
      await client.query(`
        CREATE TABLE notification_preferences (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,

          -- Email preferences
          email_new_quote BOOLEAN DEFAULT true,
          email_quote_approved BOOLEAN DEFAULT true,
          email_quote_rejected BOOLEAN DEFAULT true,
          email_counter_offer BOOLEAN DEFAULT true,

          -- In-app preferences
          inapp_new_quote BOOLEAN DEFAULT true,
          inapp_quote_approved BOOLEAN DEFAULT true,
          inapp_quote_rejected BOOLEAN DEFAULT true,
          inapp_counter_offer BOOLEAN DEFAULT true,

          -- General settings
          daily_digest BOOLEAN DEFAULT false,
          digest_time TIME DEFAULT '09:00:00',

          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Created notification_preferences table');
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
