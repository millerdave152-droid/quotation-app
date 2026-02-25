-- ============================================================================
-- Migration 146: AI Data Consent Flag (PIPEDA Compliance)
-- Customers must opt-in before AI tools can surface their PII.
-- ============================================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS ai_data_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ai_consent_updated_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ai_consent_updated_by INTEGER REFERENCES users(id);
