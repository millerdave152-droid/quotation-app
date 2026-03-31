-- Migration 211: Add 'processing' status to credit_memo_status enum
-- and add moneris_refund_id column + credit_memo_applications table.
-- Supports two-phase refund flow (CRIT-21 fix).

-- Add 'processing' to the enum (must be in separate transaction)
ALTER TYPE credit_memo_status ADD VALUE IF NOT EXISTS 'processing' AFTER 'issued';

-- Add moneris_refund_id column for tracking external refund references
ALTER TABLE credit_memos
  ADD COLUMN IF NOT EXISTS moneris_refund_id VARCHAR(100);

-- Application tracking table for audit trail
CREATE TABLE IF NOT EXISTS credit_memo_applications (
  id SERIAL PRIMARY KEY,
  credit_memo_id INTEGER NOT NULL REFERENCES credit_memos(id),
  application_method VARCHAR(30) NOT NULL,
  amount_cents INTEGER NOT NULL,
  moneris_refund_id VARCHAR(100),
  store_credit_id INTEGER,
  applied_by INTEGER REFERENCES users(id),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_cma_credit_memo
  ON credit_memo_applications (credit_memo_id);
