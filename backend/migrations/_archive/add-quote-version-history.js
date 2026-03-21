/**
 * Migration: Add quote version history tracking
 * Creates quote_versions table to store snapshots of quotes when updated
 * Enables viewing previous versions and comparing changes
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Creating quote version history tables...\n');

    // Create quote_versions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_versions (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,

        -- Snapshot of quote state at this version
        customer_id INTEGER,
        customer_name VARCHAR(255),
        status VARCHAR(50),
        subtotal_cents BIGINT,
        discount_percent DECIMAL(5,2),
        discount_cents BIGINT,
        tax_rate DECIMAL(5,2),
        tax_cents BIGINT,
        total_cents BIGINT,
        gross_profit_cents BIGINT,

        -- Quote details
        notes TEXT,
        terms TEXT,
        expires_at TIMESTAMP,

        -- Delivery info
        delivery_address TEXT,
        delivery_city VARCHAR(100),
        delivery_postal_code VARCHAR(20),
        delivery_date DATE,
        delivery_instructions TEXT,
        installation_required BOOLEAN DEFAULT FALSE,

        -- Items snapshot (stored as JSON)
        items_snapshot JSONB,

        -- Change metadata
        change_summary TEXT,
        change_type VARCHAR(50),
        changed_by VARCHAR(100),
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        -- Change details (what specifically changed)
        changes JSONB,

        UNIQUE(quotation_id, version_number)
      )
    `);
    console.log('  Created quote_versions table');

    // Create indexes for efficient querying
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_versions_quotation_id
      ON quote_versions(quotation_id)
    `);
    console.log('  Created index on quotation_id');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_versions_changed_at
      ON quote_versions(changed_at DESC)
    `);
    console.log('  Created index on changed_at');

    // Add version tracking columns to quotations table
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1
    `);
    console.log('  Added current_version column to quotations');

    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS version_notes TEXT
    `);
    console.log('  Added version_notes column to quotations');

    // Create a function to auto-increment version on update
    await client.query(`
      CREATE OR REPLACE FUNCTION increment_quote_version()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.current_version := COALESCE(OLD.current_version, 1) + 1;
        NEW.updated_at := CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('  Created increment_quote_version function');

    // Check if trigger already exists before creating
    const triggerExists = await client.query(`
      SELECT 1 FROM pg_trigger WHERE tgname = 'quote_version_trigger'
    `);

    if (triggerExists.rows.length === 0) {
      await client.query(`
        CREATE TRIGGER quote_version_trigger
        BEFORE UPDATE ON quotations
        FOR EACH ROW
        WHEN (
          OLD.subtotal_cents IS DISTINCT FROM NEW.subtotal_cents OR
          OLD.total_cents IS DISTINCT FROM NEW.total_cents OR
          OLD.discount_percent IS DISTINCT FROM NEW.discount_percent OR
          OLD.customer_id IS DISTINCT FROM NEW.customer_id
        )
        EXECUTE FUNCTION increment_quote_version()
      `);
      console.log('  Created version increment trigger');
    } else {
      console.log('  Version trigger already exists');
    }

    console.log('\nMigration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
