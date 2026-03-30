-- Migration 208: Add push_notifications_enabled to users, last_used_at to push_subscriptions
-- Staff must explicitly opt in — defaults to false

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS push_notifications_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
