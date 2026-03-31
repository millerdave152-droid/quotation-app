-- Migration 212: Refresh token hash security upgrade
-- The `token` column now stores SHA-256 hashes instead of raw JWT tokens.
-- Existing raw tokens are invalidated — all users will need to re-login.

-- Add index on token column for hash lookups (if not already indexed)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

-- Add index on family_id for reuse detection queries
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens(family_id);

-- Clear all existing tokens (they store raw values, not hashes)
-- Users will need to re-login after this migration runs.
UPDATE refresh_tokens SET revoked = true, revoked_at = NOW()
WHERE revoked = false;
