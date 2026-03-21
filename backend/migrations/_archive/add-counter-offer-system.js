/**
 * Migration: Add Counter-Offer System
 * Creates tables and columns for quote negotiation between customers and supervisors
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
    console.log('Starting migration: add-counter-offer-system');

    await client.query('BEGIN');

    // Check if table already exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'quote_counter_offers'
      )
    `);

    if (!tableExists.rows[0].exists) {
      // Create counter offers table
      await client.query(`
        CREATE TABLE quote_counter_offers (
          id SERIAL PRIMARY KEY,
          quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,

          -- Who submitted
          submitted_by_type VARCHAR(20) NOT NULL, -- 'customer', 'salesperson', 'supervisor'
          submitted_by_user_id INTEGER REFERENCES users(id),
          submitted_by_name VARCHAR(255),
          submitted_by_email VARCHAR(255),

          -- Offer details
          counter_offer_total_cents INTEGER NOT NULL,
          original_total_cents INTEGER NOT NULL,
          difference_cents INTEGER GENERATED ALWAYS AS (counter_offer_total_cents - original_total_cents) STORED,
          message TEXT,

          -- Magic link for customer access
          access_token VARCHAR(255) UNIQUE,
          token_expires_at TIMESTAMP,

          -- Response
          status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, rejected, countered, expired
          response_by_user_id INTEGER REFERENCES users(id),
          response_by_name VARCHAR(255),
          response_message TEXT,
          responded_at TIMESTAMP,

          -- Audit
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Created quote_counter_offers table');

      // Add indexes
      await client.query(`
        CREATE INDEX idx_counter_offers_quotation ON quote_counter_offers(quotation_id);
        CREATE INDEX idx_counter_offers_status ON quote_counter_offers(status);
        CREATE INDEX idx_counter_offers_token ON quote_counter_offers(access_token) WHERE access_token IS NOT NULL;
        CREATE INDEX idx_counter_offers_created ON quote_counter_offers(created_at);
      `);
      console.log('Created indexes on quote_counter_offers');

    } else {
      console.log('quote_counter_offers table already exists, skipping');
    }

    // Add negotiation_status to quotations if not exists
    const negotiationCol = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'quotations' AND column_name = 'negotiation_status'
    `);

    if (negotiationCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE quotations
        ADD COLUMN negotiation_status VARCHAR(30) DEFAULT NULL
      `);
      console.log('Added negotiation_status column to quotations');

      await client.query(`
        COMMENT ON COLUMN quotations.negotiation_status IS
        'Negotiation state: null (no negotiation), awaiting_customer, awaiting_supervisor, negotiation_complete'
      `);
    }

    // Add counter_offer_count to quotations if not exists
    const counterCol = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'quotations' AND column_name = 'counter_offer_count'
    `);

    if (counterCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE quotations
        ADD COLUMN counter_offer_count INTEGER DEFAULT 0
      `);
      console.log('Added counter_offer_count column to quotations');
    }

    // Add last_counter_offer_at to quotations if not exists
    const lastCounterCol = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'quotations' AND column_name = 'last_counter_offer_at'
    `);

    if (lastCounterCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE quotations
        ADD COLUMN last_counter_offer_at TIMESTAMP DEFAULT NULL
      `);
      console.log('Added last_counter_offer_at column to quotations');
    }

    // Add customer_portal_token for magic link access
    const portalTokenCol = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'quotations' AND column_name = 'customer_portal_token'
    `);

    if (portalTokenCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE quotations
        ADD COLUMN customer_portal_token VARCHAR(255) UNIQUE,
        ADD COLUMN customer_portal_token_expires TIMESTAMP
      `);
      console.log('Added customer portal token columns to quotations');

      await client.query(`
        CREATE INDEX idx_quotations_portal_token
        ON quotations(customer_portal_token)
        WHERE customer_portal_token IS NOT NULL
      `);
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
