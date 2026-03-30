-- Migration 209: Add serial_sync_warning flag to transactions
-- Flags transactions where serial number status sync failed (non-blocking)

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS serial_sync_warning BOOLEAN NOT NULL DEFAULT false;
