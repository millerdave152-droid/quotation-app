-- Migration 213: Feature flags table with runtime kill switches
-- Used for ML scoring, A/B tests, and gradual rollouts.

CREATE TABLE IF NOT EXISTS feature_flags (
  id SERIAL PRIMARY KEY,
  flag_name VARCHAR(100) NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id)
);

INSERT INTO feature_flags (flag_name, is_enabled)
VALUES ('ml_scoring_enabled', false)
ON CONFLICT (flag_name) DO NOTHING;
