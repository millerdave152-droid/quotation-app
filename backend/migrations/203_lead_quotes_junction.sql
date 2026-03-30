-- Migration 203: Lead-Quotes junction table
-- Enables many-to-many relationship between leads and quotations
-- (replaces the single quotation_id FK on leads for richer linking)

CREATE TABLE IF NOT EXISTS lead_quotes (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  quote_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lead_id, quote_id)
);

CREATE INDEX idx_lead_quotes_lead_id ON lead_quotes(lead_id);
CREATE INDEX idx_lead_quotes_quote_id ON lead_quotes(quote_id);
