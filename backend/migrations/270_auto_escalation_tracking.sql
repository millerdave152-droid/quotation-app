-- ============================================================================
-- 270: Auto-escalation tracking columns
-- Adds escalation chain tracking to discount_escalations and quote_approvals
-- ============================================================================

-- POS discount escalations: track escalation chain
ALTER TABLE discount_escalations
  ADD COLUMN IF NOT EXISTS escalation_level INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalated_from_id INTEGER REFERENCES discount_escalations(id),
  ADD COLUMN IF NOT EXISTS current_approver_role VARCHAR(30),
  ADD COLUMN IF NOT EXISTS escalation_reason VARCHAR(30),
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_discount_esc_escalated_from
  ON discount_escalations(escalated_from_id)
  WHERE escalated_from_id IS NOT NULL;

-- CRM quote approvals: track escalation chain
ALTER TABLE quote_approvals
  ADD COLUMN IF NOT EXISTS escalation_level INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalated_from_id INTEGER REFERENCES quote_approvals(id),
  ADD COLUMN IF NOT EXISTS current_approver_role VARCHAR(30),
  ADD COLUMN IF NOT EXISTS escalation_reason VARCHAR(30),
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_quote_approvals_escalated_from
  ON quote_approvals(escalated_from_id)
  WHERE escalated_from_id IS NOT NULL;
