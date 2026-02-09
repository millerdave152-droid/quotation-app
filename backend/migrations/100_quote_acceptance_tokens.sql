-- Migration 100: Online Quote Acceptance Tokens
-- Allows customers to accept quotes via email magic link

CREATE TABLE IF NOT EXISTS quote_acceptance_tokens (
  id SERIAL PRIMARY KEY,
  quotation_id INTEGER NOT NULL REFERENCES quotations(id),
  access_token VARCHAR(128) UNIQUE NOT NULL,
  customer_email VARCHAR(255),
  token_expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quote_accept_token ON quote_acceptance_tokens(access_token);
