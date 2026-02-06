-- ============================================================================
-- Migration 034: Entry Point for Delivery Orders
-- Adds entry_point to order_fulfillment for delivery logistics
-- ============================================================================

ALTER TABLE order_fulfillment
  ADD COLUMN IF NOT EXISTS entry_point VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_fulfillment_entry_point
  ON order_fulfillment(entry_point) WHERE entry_point IS NOT NULL;

COMMENT ON COLUMN order_fulfillment.entry_point
  IS 'Delivery entry point (e.g. front_door, back_door, concierge). Required for delivery fulfillment types.';
