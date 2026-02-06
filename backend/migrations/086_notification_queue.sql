-- ============================================================================
-- Migration 086: Notification Queue & Sending Infrastructure
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_queue (
  id SERIAL PRIMARY KEY,

  template_code VARCHAR(100) REFERENCES notification_templates(code),
  channel VARCHAR(20) NOT NULL,

  recipient_email VARCHAR(255),
  recipient_phone VARCHAR(20),
  recipient_customer_id INTEGER REFERENCES customers(id),

  subject VARCHAR(500),
  body TEXT NOT NULL,

  related_type VARCHAR(30),
  related_id INTEGER,

  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'sent', 'delivered', 'failed', 'bounced', 'unsubscribed'
  )),

  scheduled_for TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,

  provider VARCHAR(30),
  provider_message_id VARCHAR(255),
  error_message TEXT,

  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled ON notification_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notification_queue_customer ON notification_queue(recipient_customer_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_status_scheduled ON notification_queue(status, scheduled_for);

-- Add consent columns to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_transactional BOOLEAN DEFAULT TRUE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_marketing BOOLEAN DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_transactional BOOLEAN DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_marketing BOOLEAN DEFAULT FALSE;
