-- Migration 204: Lead follow-ups table
-- Tracks scheduled and completed follow-up interactions for leads

CREATE TABLE IF NOT EXISTS lead_followups (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  scheduled_by INTEGER NOT NULL REFERENCES users(id),
  followup_type VARCHAR(20) NOT NULL DEFAULT 'call'
    CHECK (followup_type IN ('call', 'email', 'in_store_visit', 'custom')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lead_followups_lead_id ON lead_followups(lead_id);
CREATE INDEX idx_lead_followups_scheduled_at ON lead_followups(scheduled_at);
