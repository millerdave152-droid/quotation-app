-- ============================================================================
-- Migration 035: Floor Number for Delivery Orders
-- Adds floor_number to order_fulfillment for delivery logistics
-- ============================================================================

ALTER TABLE order_fulfillment
  ADD COLUMN IF NOT EXISTS floor_number VARCHAR(20);

COMMENT ON COLUMN order_fulfillment.floor_number
  IS 'Floor number at delivery address (numeric, Ground, or Basement). Recommended for multi-unit dwellings.';
