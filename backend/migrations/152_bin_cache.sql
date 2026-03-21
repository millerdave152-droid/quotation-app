-- Migration 152: BIN (Bank Identification Number) cache + fraud rules
-- 3-tier lookup: Redis -> PostgreSQL -> binlist.net API

CREATE TABLE IF NOT EXISTS bin_cache (
  bin VARCHAR(8) PRIMARY KEY,
  card_brand VARCHAR(30),
  card_type VARCHAR(20),               -- debit, credit, prepaid
  issuer_name VARCHAR(100),
  issuer_country VARCHAR(3),
  is_prepaid BOOLEAN DEFAULT false,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  raw_response JSONB
);

CREATE INDEX IF NOT EXISTS idx_bin_cache_prepaid
  ON bin_cache (is_prepaid) WHERE is_prepaid = true;

-- Seed 2 BIN-related fraud rules
INSERT INTO fraud_rules (rule_code, rule_name, description, risk_points, severity, is_active, rule_type)
VALUES
  ('bin_prepaid_card', 'Prepaid Card', 'Payment uses a prepaid card', 20, 'medium', true, 'pattern'),
  ('bin_foreign_card', 'Foreign Card', 'Card issued outside CA/US', 15, 'low', true, 'pattern')
ON CONFLICT (rule_code) DO NOTHING;
