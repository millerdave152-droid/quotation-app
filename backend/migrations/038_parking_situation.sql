-- ============================================================================
-- Migration 038: Parking Situation for Delivery Orders
-- Adds parking details to order_fulfillment for delivery logistics
-- ============================================================================

ALTER TABLE order_fulfillment
  ADD COLUMN IF NOT EXISTS parking_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS parking_distance INTEGER,
  ADD COLUMN IF NOT EXISTS parking_notes TEXT;

COMMENT ON COLUMN order_fulfillment.parking_type
  IS 'Parking type at delivery address (driveway, street, underground, parking_lot, no_parking)';
COMMENT ON COLUMN order_fulfillment.parking_distance
  IS 'Estimated distance from parking to door in feet, NULL if unknown';
COMMENT ON COLUMN order_fulfillment.parking_notes
  IS 'Special parking instructions for delivery drivers';
