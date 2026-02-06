-- ============================================================================
-- Migration 040: Delivery Window Selection for Delivery Orders
-- Adds delivery window scheduling fields to order_fulfillment
-- ============================================================================

ALTER TABLE order_fulfillment
  ADD COLUMN IF NOT EXISTS delivery_date DATE,
  ADD COLUMN IF NOT EXISTS delivery_window_start TIME,
  ADD COLUMN IF NOT EXISTS delivery_window_end TIME,
  ADD COLUMN IF NOT EXISTS delivery_window_id INTEGER;

COMMENT ON COLUMN order_fulfillment.delivery_date
  IS 'Selected delivery date';
COMMENT ON COLUMN order_fulfillment.delivery_window_start
  IS 'Start time of selected delivery window';
COMMENT ON COLUMN order_fulfillment.delivery_window_end
  IS 'End time of selected delivery window';
COMMENT ON COLUMN order_fulfillment.delivery_window_id
  IS 'Foreign key to future delivery_windows table for slot capacity tracking';
