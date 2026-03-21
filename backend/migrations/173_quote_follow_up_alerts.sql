-- Migration 173: Quote Follow-Up Alerts
-- Adds indexes to support the daily stalled-quote scan and dedup checking.
-- user_notifications and notification_preferences already exist; no new tables needed.

BEGIN;

-- ── Ensure salesperson_id column exists on quotations ────────────────
-- Migration 003 added this conditionally, but it may not exist in all DBs.
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS salesperson_id INTEGER REFERENCES users(id);

-- ── Index: fast lookup of open quotes per salesperson ────────────────
-- Used by getStalledQuotes() to find DRAFT / SENT quotes per rep.
CREATE INDEX IF NOT EXISTS idx_quotations_salesperson_status
  ON quotations(salesperson_id, status)
  WHERE status IN ('DRAFT', 'SENT');

-- ── Index: dedup check — has this quote already been alerted today? ──
CREATE INDEX IF NOT EXISTS idx_user_notifications_type_quote_date
  ON user_notifications(notification_type, related_quote_id, created_at DESC)
  WHERE notification_type = 'quote_followup';

-- ── Add daily_digest columns to notification_preferences (if missing) ─
-- The add-in-app-notifications migration may or may not have created these;
-- safe IF NOT EXISTS guards.
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS daily_digest BOOLEAN DEFAULT false;

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS digest_time TIME DEFAULT '09:00:00';

-- ── Add email column to notification_preferences for digest delivery ──
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS email_quote_followup BOOLEAN DEFAULT true;

COMMIT;
