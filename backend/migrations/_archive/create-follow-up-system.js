const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting follow-up system migration...');

    await client.query('BEGIN');

    // 1. Create follow_up_reminders table
    console.log('📋 Creating follow_up_reminders table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS follow_up_reminders (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
        reminder_type VARCHAR(50) NOT NULL,
        scheduled_for TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'PENDING',
        sent_at TIMESTAMP,
        email_template_id INTEGER REFERENCES email_templates(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Create indexes for performance
    console.log('📋 Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_quotation_id
      ON follow_up_reminders(quotation_id);

      CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_scheduled_for
      ON follow_up_reminders(scheduled_for);

      CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_status
      ON follow_up_reminders(status);
    `);

    // 3. Create quote_interactions table to track customer responses
    console.log('📋 Creating quote_interactions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_interactions (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
        interaction_type VARCHAR(50) NOT NULL,
        interaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        next_action VARCHAR(100),
        next_action_date DATE,
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Add last_followed_up_at column to quotations table
    console.log('📋 Adding last_followed_up_at to quotations...');
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS last_followed_up_at TIMESTAMP;
    `);

    // 5. Create trigger to auto-schedule follow-ups
    console.log('📋 Creating auto-schedule trigger...');
    await client.query(`
      CREATE OR REPLACE FUNCTION schedule_initial_follow_up()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.status = 'SENT' AND OLD.status != 'SENT' THEN
          -- Schedule Day 2 follow-up
          INSERT INTO follow_up_reminders (quotation_id, reminder_type, scheduled_for, email_template_id)
          SELECT NEW.id, 'DAY_2_FOLLOW_UP', NEW.created_at + INTERVAL '2 days', id
          FROM email_templates
          WHERE category = 'FOLLOW_UP' AND name LIKE '%Day 2%' AND is_default = true
          LIMIT 1;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS auto_schedule_follow_up ON quotations;

      CREATE TRIGGER auto_schedule_follow_up
      AFTER UPDATE ON quotations
      FOR EACH ROW
      EXECUTE FUNCTION schedule_initial_follow_up();
    `);

    await client.query('COMMIT');

    console.log('✅ Follow-up system migration completed successfully!');
    console.log('');
    console.log('📊 Tables created:');
    console.log('  - follow_up_reminders (tracks scheduled reminders)');
    console.log('  - quote_interactions (logs customer interactions)');
    console.log('');
    console.log('🔧 Features enabled:');
    console.log('  - Auto-schedule follow-ups when quotes sent');
    console.log('  - Track reminder status (pending/sent/cancelled)');
    console.log('  - Log customer interactions and next actions');
    console.log('  - Link reminders to email templates');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
