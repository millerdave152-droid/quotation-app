-- Migration 109: Push notification user targeting & notification preferences
-- Extends push_subscriptions with user_id for targeted push,
-- and adds notification_preferences for per-user settings.

-- 1. Add user_id to push_subscriptions (nullable for backward compat)
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions(user_id);

-- 2. Notification preferences per user
CREATE TABLE IF NOT EXISTS notification_preferences (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  push_enabled  BOOLEAN NOT NULL DEFAULT true,
  sound_enabled BOOLEAN NOT NULL DEFAULT true,
  quiet_start   TIME,          -- e.g. '22:00'
  quiet_end     TIME,          -- e.g. '07:00'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
