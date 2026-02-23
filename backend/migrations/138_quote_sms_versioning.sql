-- Migration 138: Quote SMS Sharing & Share Log

CREATE TABLE IF NOT EXISTS quote_share_log (
  id SERIAL PRIMARY KEY,
  quotation_id INTEGER NOT NULL,
  share_method VARCHAR(20) NOT NULL CHECK (share_method IN ('email', 'sms', 'pdf_download', 'link', 'print')),
  recipient VARCHAR(255),
  status VARCHAR(20) DEFAULT 'sent',
  metadata JSONB DEFAULT '{}',
  shared_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS channel VARCHAR(20);
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS phone_number VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_quote_share_log_quotation ON quote_share_log(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quote_share_log_method ON quote_share_log(share_method);
