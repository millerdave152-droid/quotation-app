-- Migration 205: Lead reminders table
-- Supports in-app, email, and SMS reminders triggered by various conditions

CREATE TABLE IF NOT EXISTS lead_reminders (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  reminder_type VARCHAR(10) NOT NULL CHECK (reminder_type IN ('in_app', 'email', 'sms')),
  trigger_type VARCHAR(20) NOT NULL
    CHECK (trigger_type IN ('manual', 'quote_expiry', 'no_contact', 'state_stale')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  recipient_user_id INTEGER REFERENCES users(id),
  recipient_email VARCHAR(255),
  message_body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lead_reminders_lead_id ON lead_reminders(lead_id);
CREATE INDEX idx_lead_reminders_scheduled_at ON lead_reminders(scheduled_at);
CREATE INDEX idx_lead_reminders_sent_at ON lead_reminders(sent_at);
