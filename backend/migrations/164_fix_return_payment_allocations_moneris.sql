-- Migration 164: Fix return_payment_allocations — rename stripe_refund_id to moneris_refund_id
--
-- Root cause: Migration 125 (stripe_to_moneris) renamed stripe columns on
-- pos_returns, payments, and payment_transactions, but missed the
-- return_payment_allocations table created in migration 045.
--
-- The backend code (routes/returns.js) references moneris_refund_id in its
-- INSERT INTO return_payment_allocations, causing:
--   "column 'moneris_refund_id' of relation 'return_payment_allocations' does not exist"

DO $$
BEGIN
  -- Rename the column if it still has the old Stripe name
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'return_payment_allocations'
      AND column_name = 'stripe_refund_id'
  ) THEN
    ALTER TABLE return_payment_allocations RENAME COLUMN stripe_refund_id TO moneris_refund_id;
    RAISE NOTICE 'Renamed stripe_refund_id → moneris_refund_id on return_payment_allocations';
  END IF;

  -- If neither column exists (table was recreated without it), add it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'return_payment_allocations'
      AND column_name = 'moneris_refund_id'
  ) THEN
    ALTER TABLE return_payment_allocations ADD COLUMN moneris_refund_id VARCHAR(255);
    RAISE NOTICE 'Added moneris_refund_id column to return_payment_allocations';
  END IF;
END $$;
