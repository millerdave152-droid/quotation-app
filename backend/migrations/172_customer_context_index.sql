-- Migration 172: Customer Context — performance index for walk-in recognition
-- Covers the recent-transactions lookup used by getCustomerContext().

BEGIN;

CREATE INDEX IF NOT EXISTS idx_transactions_customer_recent
  ON transactions(customer_id, created_at DESC)
  WHERE status = 'completed';

COMMIT;
