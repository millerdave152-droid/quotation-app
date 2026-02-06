-- ============================================================================
-- Migration 037: Access Constraints for Delivery Orders
-- Adds access constraint fields to order_fulfillment for furniture/appliance deliveries
-- ============================================================================

ALTER TABLE order_fulfillment
  ADD COLUMN IF NOT EXISTS access_steps INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS access_narrow_stairs BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS access_height_restriction INTEGER,
  ADD COLUMN IF NOT EXISTS access_width_restriction INTEGER,
  ADD COLUMN IF NOT EXISTS access_notes TEXT;

COMMENT ON COLUMN order_fulfillment.access_steps
  IS 'Number of steps to entrance at delivery address';
COMMENT ON COLUMN order_fulfillment.access_narrow_stairs
  IS 'Whether there are narrow stairs or tight turns on the delivery path';
COMMENT ON COLUMN order_fulfillment.access_height_restriction
  IS 'Maximum height restriction in inches (e.g. low doorframe), NULL if none';
COMMENT ON COLUMN order_fulfillment.access_width_restriction
  IS 'Maximum width restriction in inches (e.g. narrow doorway), NULL if none';
COMMENT ON COLUMN order_fulfillment.access_notes
  IS 'Additional notes about access constraints for delivery drivers';
