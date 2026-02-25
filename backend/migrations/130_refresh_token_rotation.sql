-- Migration 130: Refresh Token Rotation & Reuse Detection
-- Adds token family tracking, rotation metadata, session context,
-- and a cleanup function for expired tokens.

BEGIN;

-- 1. Add columns for token rotation and session tracking
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by_id INTEGER REFERENCES refresh_tokens(id);
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- 2. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_cleanup ON refresh_tokens(expires_at) WHERE revoked = false;

-- 3. Backfill family_id for existing tokens (each existing token gets its own family)
-- Already handled by the DEFAULT gen_random_uuid() on the column

-- 4. Function to clean up expired/revoked tokens older than retention period
CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM refresh_tokens
  WHERE (
    -- Expired and revoked tokens older than retention period
    (revoked = true AND revoked_at < CURRENT_TIMESTAMP - (retention_days || ' days')::INTERVAL)
    OR
    -- Expired tokens (never revoked) older than retention period
    (expires_at < CURRENT_TIMESTAMP - (retention_days || ' days')::INTERVAL)
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;
