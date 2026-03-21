-- Migration 161: Customer Payment Tokens (Moneris Vault)
-- Secure token storage for repeat transactions and cross-channel recognition.
-- moneris_token (data_key) is the only PCI-sensitive field — never exposed via API.

CREATE TABLE IF NOT EXISTS customer_payment_tokens (
  id BIGSERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  moneris_token VARCHAR(64) NOT NULL,          -- Moneris Vault data_key (never returned to API)
  card_bin VARCHAR(8),                          -- First 6-8 digits (non-sensitive, used for BIN lookup)
  last_four VARCHAR(4) NOT NULL,                -- Last 4 digits for display
  card_type VARCHAR(20),                        -- credit / debit
  card_brand VARCHAR(20),                       -- visa / mastercard / amex / discover
  expiry_date VARCHAR(4),                       -- YYMM format per Moneris spec
  nickname VARCHAR(50),                         -- Customer-facing label e.g. "My Visa ending 4242"
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,               -- Soft-delete for expired/removed tokens
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id),      -- Employee who created the token
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_customer_last_four UNIQUE (customer_id, last_four)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cpt_customer ON customer_payment_tokens(customer_id);
CREATE INDEX IF NOT EXISTS idx_cpt_active ON customer_payment_tokens(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cpt_brand ON customer_payment_tokens(card_brand);
CREATE INDEX IF NOT EXISTS idx_cpt_expiry ON customer_payment_tokens(expiry_date);

-- Ensure only one default per customer
CREATE UNIQUE INDEX IF NOT EXISTS idx_cpt_default_per_customer
  ON customer_payment_tokens(customer_id) WHERE is_default = true AND is_active = true;

COMMENT ON TABLE customer_payment_tokens IS 'Moneris Vault tokens for saved payment methods. moneris_token column must NEVER be returned via API.';
COMMENT ON COLUMN customer_payment_tokens.moneris_token IS 'Moneris Vault data_key — PCI restricted, service-only access.';
