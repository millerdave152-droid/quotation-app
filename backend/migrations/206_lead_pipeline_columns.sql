-- Migration 206: Add quote-to-lead pipeline columns
-- Extends leads table with store location and resolution tracking
-- Extends quotations table with lead linkage and opt-in flag

-- Add store_location_id and resolved_at to leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS store_location_id INTEGER REFERENCES locations(id),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_store_location_id ON leads(store_location_id);

-- Add lead_id and lead_opt_in to quotations
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_opt_in BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_quotations_lead_id ON quotations(lead_id);

-- Extend leads status constraint to include pipeline statuses
-- The existing constraint allows: new, contacted, qualified, quote_created, converted, lost
-- We add: quoted, follow_up_scheduled, negotiating, won, expired
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN (
    'new', 'contacted', 'qualified', 'quote_created', 'converted', 'lost',
    'quoted', 'follow_up_scheduled', 'negotiating', 'won', 'expired'
  ));
