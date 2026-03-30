-- Migration 207: Add notification preferences to users table
-- Stores per-user email notification opt-in/opt-out settings

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{"lead_email_reminders": true}';
