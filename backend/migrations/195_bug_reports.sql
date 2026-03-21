-- Migration 195: Create bug_reports table for in-app bug reporting

CREATE TABLE IF NOT EXISTS bug_reports (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(200)  NOT NULL,
  description   TEXT          NOT NULL,
  severity      VARCHAR(20)   NOT NULL CHECK (severity IN ('blocker', 'major', 'minor')),
  page          VARCHAR(255),
  reported_by   VARCHAR(100),
  steps         TEXT,
  user_agent    TEXT,
  status        VARCHAR(20)   NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'in_progress', 'resolved', 'wont_fix')),
  notes         TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_severity   ON bug_reports (severity);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status     ON bug_reports (status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports (created_at DESC);
