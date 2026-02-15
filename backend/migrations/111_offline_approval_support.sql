-- ============================================================================
-- Migration 111: Offline Approval Support
-- ============================================================================
-- Adds 'pin_offline' to approval_method enum and dedup/sync columns
-- to approval_requests for offline fallback mode.
-- ============================================================================

-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block,
-- so we do it outside BEGIN/COMMIT.
ALTER TYPE approval_method ADD VALUE IF NOT EXISTS 'pin_offline';

-- Now add the dedup and sync columns inside a transaction
BEGIN;

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(64) UNIQUE,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offline_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS device_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_approval_requests_client_request_id
  ON approval_requests (client_request_id) WHERE client_request_id IS NOT NULL;

COMMIT;
