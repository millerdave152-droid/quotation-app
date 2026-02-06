-- ============================================================================
-- Migration 039: Pathway Confirmation for Delivery Orders
-- Adds liability confirmation fields to order_fulfillment
-- ============================================================================

ALTER TABLE order_fulfillment
  ADD COLUMN IF NOT EXISTS pathway_confirmed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pathway_notes TEXT;

COMMENT ON COLUMN order_fulfillment.pathway_confirmed
  IS 'Customer confirms pathway will be clear on delivery day (liability acknowledgement)';
COMMENT ON COLUMN order_fulfillment.pathway_notes
  IS 'Notes about potential obstacles (snow, pets, construction, etc.)';
