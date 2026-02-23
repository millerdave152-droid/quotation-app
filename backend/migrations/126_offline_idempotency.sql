-- Migration 126: Add client_transaction_id for offline idempotency
-- Allows POS to generate UUIDs for offline transactions and replay safely

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_transaction_id UUID UNIQUE;

CREATE INDEX IF NOT EXISTS idx_txn_client_id
  ON transactions(client_transaction_id)
  WHERE client_transaction_id IS NOT NULL;
