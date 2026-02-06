-- E-Transfer Payment Support
-- Adds e-transfer tracking columns to transactions and updates payment method constraint

-- Add e-transfer columns to transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS etransfer_reference VARCHAR(50) UNIQUE,
  ADD COLUMN IF NOT EXISTS etransfer_status VARCHAR(20) CHECK (etransfer_status IN ('pending', 'received', 'confirmed', 'failed')),
  ADD COLUMN IF NOT EXISTS etransfer_received_at TIMESTAMPTZ;

-- Index on etransfer_reference for quick lookups
CREATE INDEX IF NOT EXISTS idx_transactions_etransfer_reference ON transactions (etransfer_reference) WHERE etransfer_reference IS NOT NULL;

-- Add 'etransfer' to payments.payment_method CHECK constraint
-- Drop existing constraint and recreate with new value
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('cash', 'credit', 'debit', 'gift_card', 'account', 'financing', 'store_credit', 'etransfer'));
