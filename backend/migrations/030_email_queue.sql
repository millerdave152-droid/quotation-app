-- ============================================================================
-- Migration 030: Email Queue and Batch Sending
-- Supports batch receipt emails, retry failed sends, and email tracking
-- ============================================================================

-- Email batches table (groups batch sends)
CREATE TABLE IF NOT EXISTS email_batches (
  id SERIAL PRIMARY KEY,
  batch_type VARCHAR(50) NOT NULL CHECK (batch_type IN ('shift_receipts', 'manual_selection', 'retry_failed', 'scheduled')),
  created_by INTEGER REFERENCES users(user_id),
  shift_id INTEGER REFERENCES register_shifts(shift_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  total_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  notes TEXT
);

-- Email queue table (individual emails to send)
CREATE TABLE IF NOT EXISTS email_queue (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES email_batches(id) ON DELETE SET NULL,
  transaction_id INTEGER REFERENCES transactions(transaction_id),
  order_id INTEGER, -- For non-transaction emails (quotes, etc.)
  email_type VARCHAR(50) NOT NULL CHECK (email_type IN ('receipt', 'rebate_reminder', 'warranty_expiring', 'quote', 'delivery_confirmation', 'refund_confirmation')),
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255),
  subject VARCHAR(500),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped', 'cancelled')),
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10), -- 1 = highest
  queued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processing_started_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_by INTEGER REFERENCES users(user_id)
);

-- Email send log (audit trail)
CREATE TABLE IF NOT EXISTS email_send_log (
  id SERIAL PRIMARY KEY,
  queue_id INTEGER REFERENCES email_queue(id),
  batch_id INTEGER REFERENCES email_batches(id),
  attempt_number INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL,
  provider_message_id VARCHAR(255), -- SES message ID
  error_code VARCHAR(100),
  error_message TEXT,
  response_data JSONB,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Receipt email tracking (which transactions have been emailed)
CREATE TABLE IF NOT EXISTS receipt_email_tracking (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(transaction_id),
  email VARCHAR(255) NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  queue_id INTEGER REFERENCES email_queue(id),
  UNIQUE(transaction_id, email)
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_batch ON email_queue(batch_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_transaction ON email_queue(transaction_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_pending ON email_queue(status, priority, queued_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_queue_retry ON email_queue(status, next_retry_at) WHERE status = 'failed' AND retry_count < max_retries;
CREATE INDEX IF NOT EXISTS idx_email_batches_status ON email_batches(status);
CREATE INDEX IF NOT EXISTS idx_receipt_tracking_transaction ON receipt_email_tracking(transaction_id);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Get unsent receipts for a shift
CREATE OR REPLACE FUNCTION get_unsent_shift_receipts(p_shift_id INTEGER)
RETURNS TABLE (
  transaction_id INTEGER,
  transaction_number VARCHAR,
  customer_email VARCHAR,
  customer_name VARCHAR,
  total_amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.transaction_id,
    t.transaction_number,
    c.email AS customer_email,
    c.name AS customer_name,
    t.total_amount
  FROM transactions t
  JOIN customers c ON t.customer_id = c.customer_id
  WHERE t.shift_id = p_shift_id
    AND t.status = 'completed'
    AND c.email IS NOT NULL
    AND c.email != ''
    AND NOT EXISTS (
      SELECT 1 FROM receipt_email_tracking ret
      WHERE ret.transaction_id = t.transaction_id
    )
  ORDER BY t.created_at;
END;
$$ LANGUAGE plpgsql;

-- Get unsent receipts for a date range
CREATE OR REPLACE FUNCTION get_unsent_receipts_by_date(
  p_start_date TIMESTAMP WITH TIME ZONE,
  p_end_date TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
  transaction_id INTEGER,
  transaction_number VARCHAR,
  customer_email VARCHAR,
  customer_name VARCHAR,
  total_amount NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.transaction_id,
    t.transaction_number,
    c.email AS customer_email,
    c.name AS customer_name,
    t.total_amount,
    t.created_at
  FROM transactions t
  JOIN customers c ON t.customer_id = c.customer_id
  WHERE t.created_at BETWEEN p_start_date AND p_end_date
    AND t.status = 'completed'
    AND c.email IS NOT NULL
    AND c.email != ''
    AND NOT EXISTS (
      SELECT 1 FROM receipt_email_tracking ret
      WHERE ret.transaction_id = t.transaction_id
    )
  ORDER BY t.created_at;
END;
$$ LANGUAGE plpgsql;

-- Update batch counters
CREATE OR REPLACE FUNCTION update_batch_counters(p_batch_id INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE email_batches
  SET
    sent_count = (SELECT COUNT(*) FROM email_queue WHERE batch_id = p_batch_id AND status = 'sent'),
    failed_count = (SELECT COUNT(*) FROM email_queue WHERE batch_id = p_batch_id AND status = 'failed'),
    skipped_count = (SELECT COUNT(*) FROM email_queue WHERE batch_id = p_batch_id AND status = 'skipped')
  WHERE id = p_batch_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE email_batches IS 'Groups batch email sends for tracking and management';
COMMENT ON TABLE email_queue IS 'Queue of individual emails to be sent';
COMMENT ON TABLE email_send_log IS 'Audit trail of all email send attempts';
COMMENT ON TABLE receipt_email_tracking IS 'Tracks which transactions have had receipts emailed';
COMMENT ON COLUMN email_queue.priority IS 'Priority 1-10, lower number = higher priority';
COMMENT ON COLUMN email_queue.metadata IS 'Additional data like template variables, attachments info';
