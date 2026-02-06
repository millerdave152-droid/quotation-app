-- Migration 053: Communication Preferences (CASL Compliance)
-- Explicit opt-in fields for transactional and marketing communications

ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_transactional BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_marketing BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_transactional BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_marketing BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferences_updated_at TIMESTAMPTZ;
