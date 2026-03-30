-- Migration 209: Add 'push' to lead_reminders.reminder_type constraint

ALTER TABLE lead_reminders DROP CONSTRAINT IF EXISTS lead_reminders_reminder_type_check;
ALTER TABLE lead_reminders ADD CONSTRAINT lead_reminders_reminder_type_check
  CHECK (reminder_type IN ('in_app', 'email', 'sms', 'push'));
