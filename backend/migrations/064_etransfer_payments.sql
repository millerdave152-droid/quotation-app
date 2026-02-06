-- Migration 064: E-Transfer Payment Tracking
-- Adds e-transfer as a payment method and tracking columns to unified_order_payments

-- ============================================================================
-- ADD 'etransfer' TO payment_method_type ENUM
-- ============================================================================

ALTER TYPE payment_method_type ADD VALUE IF NOT EXISTS 'etransfer' AFTER 'bank_transfer';

-- ============================================================================
-- ADD E-TRANSFER COLUMNS TO unified_order_payments
-- ============================================================================

ALTER TABLE unified_order_payments
  ADD COLUMN IF NOT EXISTS etransfer_reference VARCHAR(50),
  ADD COLUMN IF NOT EXISTS etransfer_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS etransfer_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS etransfer_confirmed_by INTEGER REFERENCES users(id);

-- Constraints
ALTER TABLE unified_order_payments DROP CONSTRAINT IF EXISTS chk_etransfer_status;
ALTER TABLE unified_order_payments ADD CONSTRAINT chk_etransfer_status
  CHECK (etransfer_status IS NULL OR etransfer_status IN ('pending', 'received', 'confirmed', 'failed'));

-- Unique index on non-null e-transfer references
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_payments_etransfer_ref
  ON unified_order_payments(etransfer_reference)
  WHERE etransfer_reference IS NOT NULL;

-- ============================================================================
-- ADD 'awaiting_etransfer' TO order_status ENUM
-- ============================================================================

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_etransfer' AFTER 'order_pending';
