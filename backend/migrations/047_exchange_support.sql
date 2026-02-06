-- Migration 047: Exchange Support
-- Links returns to new exchange orders, tracks exchange transactions

-- Add exchange fields to pos_returns
ALTER TABLE pos_returns
  ADD COLUMN IF NOT EXISTS exchange_transaction_id INTEGER REFERENCES transactions(transaction_id),
  ADD COLUMN IF NOT EXISTS is_exchange BOOLEAN NOT NULL DEFAULT false;

-- Add exchange origin fields to transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_exchange BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exchange_return_id INTEGER REFERENCES pos_returns(id);

CREATE INDEX IF NOT EXISTS idx_pos_returns_exchange_txn ON pos_returns(exchange_transaction_id) WHERE exchange_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_exchange_return ON transactions(exchange_return_id) WHERE exchange_return_id IS NOT NULL;
