-- Migration 215: Add expected_receive_by to inventory_transfers
-- Used by the overdue transfer reconciliation job.

ALTER TABLE inventory_transfers
  ADD COLUMN IF NOT EXISTS expected_receive_by TIMESTAMPTZ;

-- Backfill existing shipped transfers: expected within 7 days of ship
UPDATE inventory_transfers
SET expected_receive_by = shipped_at + INTERVAL '7 days'
WHERE status = 'in_transit' AND shipped_at IS NOT NULL AND expected_receive_by IS NULL;
