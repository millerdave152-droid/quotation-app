-- Migration: 031_batch_email_settings.sql
-- Scheduled batch email configuration
-- Created: 2024

-- ============================================================================
-- BATCH EMAIL SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS batch_email_settings (
  id SERIAL PRIMARY KEY,

  -- Auto-send configuration
  auto_send_enabled BOOLEAN DEFAULT FALSE,
  send_trigger VARCHAR(20) DEFAULT 'shift_end', -- 'shift_end' | 'scheduled_time'
  scheduled_time TIME, -- For scheduled_time trigger (e.g., '18:00:00')

  -- Scope settings
  include_current_shift_only BOOLEAN DEFAULT TRUE,

  -- Email customization
  email_subject_template VARCHAR(255) DEFAULT 'Your Receipt from {{business_name}} - Order #{{order_number}}',

  -- Manager notifications
  send_manager_summary BOOLEAN DEFAULT FALSE,
  manager_email VARCHAR(255),
  cc_manager_on_failures BOOLEAN DEFAULT TRUE,

  -- Rate limiting
  max_emails_per_batch INTEGER DEFAULT 50,
  send_delay_ms INTEGER DEFAULT 1000,

  -- Retry settings
  max_retries INTEGER DEFAULT 3,
  retry_delay_minutes INTEGER DEFAULT 5,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id)
);

-- Insert default settings
INSERT INTO batch_email_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- BATCH EMAIL SCHEDULE LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS batch_email_schedule_log (
  id SERIAL PRIMARY KEY,

  -- Trigger info
  trigger_type VARCHAR(20) NOT NULL, -- 'shift_end' | 'scheduled' | 'manual'
  shift_id INTEGER REFERENCES pos_shifts(id),

  -- Batch reference
  batch_id INTEGER REFERENCES email_batches(id),

  -- Results
  total_receipts INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'processing' | 'completed' | 'failed'
  error_message TEXT,

  -- Manager notification
  manager_notified BOOLEAN DEFAULT FALSE,
  manager_notification_sent_at TIMESTAMP,

  -- Timestamps
  triggered_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for querying by shift
CREATE INDEX IF NOT EXISTS idx_batch_email_schedule_log_shift
ON batch_email_schedule_log(shift_id);

-- Index for querying by date
CREATE INDEX IF NOT EXISTS idx_batch_email_schedule_log_triggered
ON batch_email_schedule_log(triggered_at);

-- ============================================================================
-- FUNCTION: Update timestamp trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_batch_email_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS batch_email_settings_updated_at ON batch_email_settings;
CREATE TRIGGER batch_email_settings_updated_at
  BEFORE UPDATE ON batch_email_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_batch_email_settings_timestamp();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE batch_email_settings IS 'Configuration for scheduled/automatic batch email sending';
COMMENT ON TABLE batch_email_schedule_log IS 'Log of scheduled batch email runs';
COMMENT ON COLUMN batch_email_settings.send_trigger IS 'When to trigger: shift_end or scheduled_time';
COMMENT ON COLUMN batch_email_settings.scheduled_time IS 'Time of day to send (for scheduled_time trigger)';
