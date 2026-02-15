-- Migration 115: Manager Delegation Authority
-- Allows managers to temporarily delegate their approval authority to other users

BEGIN;

CREATE TABLE IF NOT EXISTS manager_delegations (
  id SERIAL PRIMARY KEY,
  delegator_id INTEGER NOT NULL REFERENCES users(id),
  delegate_id INTEGER NOT NULL REFERENCES users(id),
  max_tier INTEGER NOT NULL DEFAULT 2,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  reason VARCHAR(255),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT chk_different_users CHECK (delegator_id != delegate_id),
  CONSTRAINT chk_valid_tier CHECK (max_tier BETWEEN 1 AND 4),
  CONSTRAINT chk_valid_dates CHECK (expires_at > starts_at)
);

CREATE INDEX idx_manager_delegations_active
  ON manager_delegations(delegate_id, active) WHERE active = TRUE;
CREATE INDEX idx_manager_delegations_delegator
  ON manager_delegations(delegator_id, active) WHERE active = TRUE;
CREATE INDEX idx_manager_delegations_expiry
  ON manager_delegations(expires_at) WHERE active = TRUE;

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS delegation_id INTEGER REFERENCES manager_delegations(id);

COMMIT;
