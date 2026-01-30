/**
 * Migration: Add Customer Portal Tables
 * Creates tables for customer self-service portal features
 */

async function up(pool) {
  // Create customer preferences table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_preferences (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
      email_quotes BOOLEAN DEFAULT TRUE,
      email_promotions BOOLEAN DEFAULT TRUE,
      email_reminders BOOLEAN DEFAULT TRUE,
      sms_delivery_updates BOOLEAN DEFAULT FALSE,
      sms_reminders BOOLEAN DEFAULT FALSE,
      preferred_contact_method VARCHAR(20) DEFAULT 'email',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create customer portal tokens table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_portal_tokens (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
      token VARCHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add reorder reference to quotations if not exists
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quotations' AND column_name = 'reorder_from_quote_id'
      ) THEN
        ALTER TABLE quotations ADD COLUMN reorder_from_quote_id INTEGER REFERENCES quotations(id);
      END IF;
    END $$
  `);

  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_preferences_customer ON customer_preferences(customer_id);
    CREATE INDEX IF NOT EXISTS idx_customer_portal_tokens_token ON customer_portal_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_customer_portal_tokens_expires ON customer_portal_tokens(expires_at);
  `);

  console.log('Customer portal tables created successfully');
}

async function down(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS customer_portal_tokens CASCADE;
    DROP TABLE IF EXISTS customer_preferences CASCADE;
    ALTER TABLE quotations DROP COLUMN IF EXISTS reorder_from_quote_id;
  `);
  console.log('Customer portal tables dropped');
}

module.exports = { up, down };
