-- Migration 120: Client Error Tracking
-- Self-hosted error tracking for POS (and future web) clients

BEGIN;

-- ============================================================================
-- RAW ERROR OCCURRENCES (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_errors (
  id            BIGSERIAL PRIMARY KEY,
  fingerprint   VARCHAR(64) NOT NULL,
  error_type    VARCHAR(30) NOT NULL DEFAULT 'runtime',   -- runtime, render, network, unhandled, manual
  severity      VARCHAR(10) NOT NULL DEFAULT 'error',     -- debug, info, warning, error, fatal
  message       TEXT NOT NULL,
  stack_trace   TEXT,
  component_stack TEXT,
  url           TEXT,
  user_agent    TEXT,
  user_id       INT REFERENCES users(id) ON DELETE SET NULL,
  shift_id      INT,
  context       JSONB DEFAULT '{}',
  request_id    VARCHAR(50),
  app_version   VARCHAR(20),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_errors_fingerprint ON client_errors (fingerprint);
CREATE INDEX IF NOT EXISTS idx_client_errors_created_at  ON client_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_user_id     ON client_errors (user_id);
CREATE INDEX IF NOT EXISTS idx_client_errors_error_type  ON client_errors (error_type);
CREATE INDEX IF NOT EXISTS idx_client_errors_severity    ON client_errors (severity);

-- ============================================================================
-- DEDUPLICATED ERROR GROUPS (one row per unique fingerprint)
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_error_groups (
  id              SERIAL PRIMARY KEY,
  fingerprint     VARCHAR(64) NOT NULL UNIQUE,
  message         TEXT NOT NULL,
  error_type      VARCHAR(30) NOT NULL DEFAULT 'runtime',
  severity        VARCHAR(10) NOT NULL DEFAULT 'error',
  first_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurrence_count INT NOT NULL DEFAULT 1,
  affected_users  INT NOT NULL DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'open',    -- open, acknowledged, resolved, ignored
  resolved_by     INT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_error_groups_status    ON client_error_groups (status);
CREATE INDEX IF NOT EXISTS idx_client_error_groups_last_seen ON client_error_groups (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_client_error_groups_severity  ON client_error_groups (severity);

-- ============================================================================
-- CONVENIENCE VIEW — groups joined with latest occurrence details
-- ============================================================================
CREATE OR REPLACE VIEW client_errors_recent AS
SELECT
  g.id            AS group_id,
  g.fingerprint,
  g.message,
  g.error_type,
  g.severity,
  g.status,
  g.first_seen,
  g.last_seen,
  g.occurrence_count,
  g.affected_users,
  g.resolved_by,
  g.resolved_at,
  g.notes,
  e.url           AS last_url,
  e.user_agent    AS last_user_agent,
  e.stack_trace   AS last_stack_trace,
  e.user_id       AS last_user_id,
  e.context       AS last_context
FROM client_error_groups g
LEFT JOIN LATERAL (
  SELECT * FROM client_errors ce
  WHERE ce.fingerprint = g.fingerprint
  ORDER BY ce.created_at DESC
  LIMIT 1
) e ON true;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================
INSERT INTO permissions (code, name, description, category)
VALUES
  ('errors.client.view',   'View Client Errors',   'View client error reports',   'errors'),
  ('errors.client.manage', 'Manage Client Errors', 'Manage client error groups',  'errors')
ON CONFLICT (code) DO NOTHING;

-- Grant to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND p.code IN ('errors.client.view', 'errors.client.manage')
ON CONFLICT DO NOTHING;

COMMIT;
