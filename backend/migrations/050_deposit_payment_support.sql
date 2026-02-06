-- Migration 050: Deposit Payment Support
-- Add 'deposit_paid' status to transactions and deposit tracking columns

-- Update transactions status CHECK constraint to include deposit_paid
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('pending', 'completed', 'voided', 'refunded', 'deposit_paid'));

-- Add deposit tracking columns to transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_deposit BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS balance_due DECIMAL(10,2);

-- Index for finding orders with outstanding balances
CREATE INDEX IF NOT EXISTS idx_transactions_deposit_status
  ON transactions (status) WHERE status = 'deposit_paid';
