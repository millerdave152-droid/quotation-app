-- Migration 112: Batch Approval Support
-- Adds columns for grouping multiple approval requests into a single batch

BEGIN;

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS request_type VARCHAR(20) NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS parent_request_id INTEGER REFERENCES approval_requests(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS batch_label VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_approval_requests_parent
  ON approval_requests(parent_request_id) WHERE parent_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_approval_requests_batch_pending
  ON approval_requests(status, request_type)
  WHERE request_type = 'batch' AND status IN ('pending', 'countered');

COMMIT;
