-- Migration 099: Lead Response Time Tracking
-- Adds first_contacted_at column to leads table for tracking response time

ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_contacted_at TIMESTAMP;

-- Backfill from activity log where leads were moved to 'contacted' status
UPDATE leads l SET first_contacted_at = (
  SELECT MIN(la.created_at) FROM lead_activities la
  WHERE la.lead_id = l.id AND la.activity_type = 'status_changed'
    AND la.metadata::text LIKE '%"newStatus":"contacted"%'
) WHERE l.status NOT IN ('new') AND l.first_contacted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_first_contacted ON leads(first_contacted_at) WHERE first_contacted_at IS NOT NULL;
