-- Migration 068: CASL Consent Tracking
-- Adds consent audit log, consent metadata on customers, suppression support

-- ============================================================================
-- 1. CONSENT METADATA ON customers
-- ============================================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS consent_recorded_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS consent_ip_address VARCHAR(45);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS consent_source VARCHAR(50);

-- ============================================================================
-- 2. CONSENT AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_consent_log (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  consent_type VARCHAR(50) NOT NULL,
  consent_given BOOLEAN NOT NULL,
  previous_value BOOLEAN,
  consent_source VARCHAR(50) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  recorded_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_log_customer ON customer_consent_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_consent_log_type ON customer_consent_log(consent_type);
CREATE INDEX IF NOT EXISTS idx_consent_log_created ON customer_consent_log(created_at);

-- ============================================================================
-- 3. INDEXES FOR SUPPRESSION LIST QUERIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_customers_email_marketing ON customers(email_marketing) WHERE email_marketing = false;
CREATE INDEX IF NOT EXISTS idx_customers_sms_marketing ON customers(sms_marketing) WHERE sms_marketing = false;
