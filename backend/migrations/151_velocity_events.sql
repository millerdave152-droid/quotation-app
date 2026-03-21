-- Migration 151: Velocity Events table for sliding-window fraud detection
-- Supports both Redis (primary) and PostgreSQL (fallback) velocity tracking

CREATE TABLE IF NOT EXISTS velocity_events (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(30) NOT NULL,        -- 'card_use','terminal_txn','employee_txn','decline'
  entity_id VARCHAR(100) NOT NULL,         -- card hash, terminal ID, employee ID, etc.
  amount_cents INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_velocity_events_lookup
  ON velocity_events (event_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_velocity_events_cleanup
  ON velocity_events (created_at);
