/**
 * Migration: Add Leads/Inquiry Capture System
 *
 * Creates the leads, lead_requirements, and lead_activities tables
 * for capturing customer inquiries before formal quotes.
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

    console.log('Creating leads system tables...');

    // ============================================
    // LEADS TABLE (Primary Record)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        lead_number VARCHAR(20) UNIQUE NOT NULL,

        -- Customer Contact
        customer_id INTEGER REFERENCES customers(id),
        contact_name VARCHAR(255) NOT NULL,
        contact_email VARCHAR(255),
        contact_phone VARCHAR(50),
        preferred_contact_method VARCHAR(20),
        best_time_to_contact VARCHAR(100),

        -- Lead Source
        lead_source VARCHAR(50),
        source_details VARCHAR(255),

        -- Context/Timing
        inquiry_reason VARCHAR(50),
        timeline VARCHAR(50),
        move_in_date DATE,

        -- Requirements
        requirements_notes TEXT,

        -- Internal
        priority VARCHAR(20) DEFAULT 'warm',
        assigned_to INTEGER REFERENCES users(id),
        follow_up_date DATE,

        -- AI Content
        ai_summary TEXT,
        ai_suggested_products JSONB,
        ai_draft_message TEXT,

        -- Workflow
        status VARCHAR(30) DEFAULT 'new',
        lost_reason VARCHAR(100),
        quotation_id INTEGER REFERENCES quotations(id),

        -- Timestamps
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id)
      )
    `);
    console.log('  + leads table created');

    // Add constraints
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'leads_priority_check'
        ) THEN
          ALTER TABLE leads ADD CONSTRAINT leads_priority_check
          CHECK (priority IN ('hot', 'warm', 'cold'));
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'leads_status_check'
        ) THEN
          ALTER TABLE leads ADD CONSTRAINT leads_status_check
          CHECK (status IN ('new', 'contacted', 'qualified', 'quote_created', 'converted', 'lost'));
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'leads_contact_method_check'
        ) THEN
          ALTER TABLE leads ADD CONSTRAINT leads_contact_method_check
          CHECK (preferred_contact_method IN ('phone', 'text', 'email', NULL));
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'leads_source_check'
        ) THEN
          ALTER TABLE leads ADD CONSTRAINT leads_source_check
          CHECK (lead_source IN ('walk_in', 'phone', 'website', 'referral', 'realtor', 'builder', 'social_media', 'other', NULL));
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'leads_timeline_check'
        ) THEN
          ALTER TABLE leads ADD CONSTRAINT leads_timeline_check
          CHECK (timeline IN ('asap', '1_2_weeks', '1_3_months', '3_6_months', 'just_researching', NULL));
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'leads_reason_check'
        ) THEN
          ALTER TABLE leads ADD CONSTRAINT leads_reason_check
          CHECK (inquiry_reason IN ('browsing', 'researching', 'moving', 'renovation', 'replacement', 'upgrade', 'builder_project', 'other', NULL));
        END IF;
      END $$;
    `);
    console.log('  + leads constraints added');

    // ============================================
    // LEAD_REQUIREMENTS TABLE (Structured Requirements)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_requirements (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
        category VARCHAR(100) NOT NULL,
        subcategory VARCHAR(100),
        brand_preferences JSONB,
        budget_min_cents INTEGER,
        budget_max_cents INTEGER,
        must_have_features JSONB,
        color_preferences JSONB,
        size_constraints VARCHAR(255),
        quantity INTEGER DEFAULT 1,
        notes TEXT
      )
    `);
    console.log('  + lead_requirements table created');

    // ============================================
    // LEAD_ACTIVITIES TABLE (Activity Log)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_activities (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
        activity_type VARCHAR(50) NOT NULL,
        description TEXT,
        metadata JSONB,
        performed_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  + lead_activities table created');

    // ============================================
    // INDEXES
    // ============================================
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_follow_up_date ON leads(follow_up_date);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_customer_id ON leads(customer_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_requirements_lead_id ON lead_requirements(lead_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_activities_created_at ON lead_activities(created_at DESC);
    `);
    console.log('  + indexes created');

    // ============================================
    // SEQUENCE FOR LEAD NUMBERS
    // ============================================
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS lead_number_seq START 1;
    `);
    console.log('  + lead_number_seq sequence created');

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

async function down() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Rolling back leads system migration...');

    // Drop indexes first
    await client.query('DROP INDEX IF EXISTS idx_lead_activities_created_at');
    await client.query('DROP INDEX IF EXISTS idx_lead_activities_lead_id');
    await client.query('DROP INDEX IF EXISTS idx_lead_requirements_lead_id');
    await client.query('DROP INDEX IF EXISTS idx_leads_customer_id');
    await client.query('DROP INDEX IF EXISTS idx_leads_created_at');
    await client.query('DROP INDEX IF EXISTS idx_leads_follow_up_date');
    await client.query('DROP INDEX IF EXISTS idx_leads_assigned_to');
    await client.query('DROP INDEX IF EXISTS idx_leads_priority');
    await client.query('DROP INDEX IF EXISTS idx_leads_status');

    // Drop tables
    await client.query('DROP TABLE IF EXISTS lead_activities');
    await client.query('DROP TABLE IF EXISTS lead_requirements');
    await client.query('DROP TABLE IF EXISTS leads');

    // Drop sequence
    await client.query('DROP SEQUENCE IF EXISTS lead_number_seq');

    await client.query('COMMIT');
    console.log('Rollback completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Rollback failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration based on command line argument
const command = process.argv[2];

if (command === 'down') {
  down().catch(err => {
    console.error('Rollback error:', err);
    process.exit(1);
  });
} else {
  up().catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
  });
}
