-- ============================================================================
-- Migration 080: Scheduled Reports Enhancement
-- Evolve existing scheduled_reports table and add generation log
-- ============================================================================

-- Add missing columns to existing scheduled_reports
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS report_type VARCHAR(50);
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS frequency VARCHAR(20);
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS day_of_week INTEGER;
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS day_of_month INTEGER;
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS time_of_day TIME DEFAULT '08:00';
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'America/Toronto';
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS filters JSONB DEFAULT '{}';
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS recipient_emails TEXT[];
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS format VARCHAR(10) DEFAULT 'excel';
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMP;
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS next_send_at TIMESTAMP;
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS send_count INTEGER DEFAULT 0;
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Backfill name from existing data
UPDATE scheduled_reports SET name = 'Report #' || id WHERE name IS NULL;
-- Backfill frequency from schedule_type
UPDATE scheduled_reports SET frequency = COALESCE(schedule_type, 'weekly') WHERE frequency IS NULL;
-- Backfill recipient_emails from recipients
UPDATE scheduled_reports SET recipient_emails = CASE
  WHEN recipients IS NOT NULL AND jsonb_typeof(recipients) = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(recipients))
  ELSE ARRAY['admin@teletime.ca']
END WHERE recipient_emails IS NULL;
-- Backfill next_send_at
UPDATE scheduled_reports SET next_send_at = COALESCE(next_run_at, NOW() + INTERVAL '1 day') WHERE next_send_at IS NULL;

-- Report generation log
CREATE TABLE IF NOT EXISTS report_generation_log (
  id SERIAL PRIMARY KEY,
  scheduled_report_id INTEGER REFERENCES scheduled_reports(id),
  report_type VARCHAR(50) NOT NULL,
  format VARCHAR(10) NOT NULL DEFAULT 'excel',
  file_path VARCHAR(500),
  file_size_bytes INTEGER,
  row_count INTEGER,
  recipient_emails TEXT[],
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  generated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_report_gen_log_status ON report_generation_log(status);
CREATE INDEX IF NOT EXISTS idx_report_gen_log_date ON report_generation_log(created_at);
