-- Migration 104: Discount Enforcement
-- Adds enforcement columns to discount_escalations for transaction linking and expiry

-- 1. Add enforcement columns to discount_escalations
ALTER TABLE discount_escalations
  ADD COLUMN IF NOT EXISTS used_in_transaction_id INTEGER REFERENCES transactions(transaction_id),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Set default expiry for existing pending escalations
UPDATE discount_escalations
SET expires_at = created_at + INTERVAL '2 hours'
WHERE expires_at IS NULL AND status = 'pending';

-- 2. Indexes for enforcement lookups
CREATE INDEX IF NOT EXISTS idx_discount_esc_approved_unused
  ON discount_escalations(requesting_employee_id, product_id)
  WHERE status = 'approved' AND used_in_transaction_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_discount_esc_expires
  ON discount_escalations(expires_at)
  WHERE status = 'pending';
