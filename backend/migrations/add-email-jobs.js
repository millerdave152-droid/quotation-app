/**
 * Migration: Add email_jobs table for email queue pattern
 * Week 2.3 of 4-week sprint
 *
 * Provides reliable email delivery with retries and monitoring
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

    console.log('Creating email_jobs table...');

    // Create email_jobs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_jobs (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
        recipient_email VARCHAR(255) NOT NULL,
        cc_emails TEXT[],
        bcc_emails TEXT[],
        subject VARCHAR(500) NOT NULL,
        body_text TEXT,
        body_html TEXT,
        template_name VARCHAR(100),
        template_data JSONB,
        attachment_urls TEXT[],
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
        priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        error_message TEXT,
        error_code VARCHAR(50),
        scheduled_at TIMESTAMP DEFAULT NOW(),
        processing_started_at TIMESTAMP,
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('  + email_jobs table created');

    // Create indexes for efficient queue processing
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_email_jobs_status
      ON email_jobs(status)
    `);
    console.log('  + idx_email_jobs_status index');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_email_jobs_status_scheduled
      ON email_jobs(status, scheduled_at)
      WHERE status IN ('pending', 'processing')
    `);
    console.log('  + idx_email_jobs_status_scheduled partial index');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_email_jobs_quote_id
      ON email_jobs(quote_id)
      WHERE quote_id IS NOT NULL
    `);
    console.log('  + idx_email_jobs_quote_id partial index');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_email_jobs_created_at
      ON email_jobs(created_at DESC)
    `);
    console.log('  + idx_email_jobs_created_at index');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_email_jobs_recipient
      ON email_jobs(recipient_email)
    `);
    console.log('  + idx_email_jobs_recipient index');

    // Create function to update updated_at timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_email_jobs_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Create trigger for updated_at
    await client.query(`
      DROP TRIGGER IF EXISTS trg_email_jobs_updated_at ON email_jobs;
      CREATE TRIGGER trg_email_jobs_updated_at
      BEFORE UPDATE ON email_jobs
      FOR EACH ROW
      EXECUTE FUNCTION update_email_jobs_updated_at()
    `);
    console.log('  + updated_at trigger created');

    // Create view for failed jobs (useful for admin monitoring)
    await client.query(`
      CREATE OR REPLACE VIEW email_jobs_failed AS
      SELECT
        ej.id,
        ej.quote_id,
        q.quotation_number,
        ej.recipient_email,
        ej.subject,
        ej.status,
        ej.attempts,
        ej.error_message,
        ej.error_code,
        ej.created_at,
        ej.updated_at,
        CONCAT(u.first_name, ' ', u.last_name) as created_by_name
      FROM email_jobs ej
      LEFT JOIN quotations q ON ej.quote_id = q.id
      LEFT JOIN users u ON ej.created_by = u.id
      WHERE ej.status = 'failed'
      ORDER BY ej.updated_at DESC
    `);
    console.log('  + email_jobs_failed view created');

    // Create view for pending jobs
    await client.query(`
      CREATE OR REPLACE VIEW email_jobs_pending AS
      SELECT
        ej.id,
        ej.quote_id,
        q.quotation_number,
        ej.recipient_email,
        ej.subject,
        ej.priority,
        ej.attempts,
        ej.scheduled_at,
        ej.created_at
      FROM email_jobs ej
      LEFT JOIN quotations q ON ej.quote_id = q.id
      WHERE ej.status = 'pending'
        AND ej.scheduled_at <= NOW()
        AND ej.attempts < ej.max_attempts
      ORDER BY ej.priority ASC, ej.scheduled_at ASC
    `);
    console.log('  + email_jobs_pending view created');

    // Create email_job_logs table for audit trail
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_job_logs (
        id SERIAL PRIMARY KEY,
        email_job_id INTEGER REFERENCES email_jobs(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        old_status VARCHAR(20),
        new_status VARCHAR(20),
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('  + email_job_logs table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_email_job_logs_job_id
      ON email_job_logs(email_job_id)
    `);
    console.log('  + idx_email_job_logs_job_id index');

    // Create function to log status changes
    await client.query(`
      CREATE OR REPLACE FUNCTION log_email_job_status_change()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          INSERT INTO email_job_logs (email_job_id, action, old_status, new_status, details)
          VALUES (
            NEW.id,
            'status_change',
            OLD.status,
            NEW.status,
            jsonb_build_object(
              'attempts', NEW.attempts,
              'error_message', NEW.error_message
            )
          );
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trg_email_job_status_log ON email_jobs;
      CREATE TRIGGER trg_email_job_status_log
      AFTER UPDATE ON email_jobs
      FOR EACH ROW
      EXECUTE FUNCTION log_email_job_status_change()
    `);
    console.log('  + status change logging trigger created');

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

    console.log('Rolling back email_jobs migration...');

    await client.query('DROP TRIGGER IF EXISTS trg_email_job_status_log ON email_jobs');
    await client.query('DROP FUNCTION IF EXISTS log_email_job_status_change()');
    await client.query('DROP TRIGGER IF EXISTS trg_email_jobs_updated_at ON email_jobs');
    await client.query('DROP FUNCTION IF EXISTS update_email_jobs_updated_at()');
    await client.query('DROP VIEW IF EXISTS email_jobs_pending');
    await client.query('DROP VIEW IF EXISTS email_jobs_failed');
    await client.query('DROP TABLE IF EXISTS email_job_logs');
    await client.query('DROP TABLE IF EXISTS email_jobs');

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
