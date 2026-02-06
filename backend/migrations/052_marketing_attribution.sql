-- Migration 052: Marketing Attribution
-- Adds "How did you hear about us?" tracking to customers and transactions

-- Marketing sources lookup table
CREATE TABLE IF NOT EXISTS marketing_sources (
  id SERIAL PRIMARY KEY,
  label VARCHAR(100) NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default sources
INSERT INTO marketing_sources (label, sort_order) VALUES
  ('Google Search', 1),
  ('Facebook / Instagram', 2),
  ('TikTok', 3),
  ('YouTube', 4),
  ('Kijiji / Marketplace', 5),
  ('Walk-in / Drive-by', 6),
  ('Referral from Friend/Family', 7),
  ('Returning Customer', 8),
  ('Flyer / Print Ad', 9),
  ('Other', 100)
ON CONFLICT (label) DO NOTHING;

-- Add marketing_source to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS marketing_source VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS marketing_source_detail VARCHAR(255);

-- Add marketing_source to transactions (per-order tracking)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS marketing_source VARCHAR(100);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS marketing_source_detail VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_customers_marketing_source ON customers(marketing_source);
CREATE INDEX IF NOT EXISTS idx_transactions_marketing_source ON transactions(marketing_source);
