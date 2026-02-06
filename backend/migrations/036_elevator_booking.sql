-- ============================================================================
-- Migration 036: Elevator Booking for Delivery Orders
-- Adds elevator booking fields to order_fulfillment for condo/apartment deliveries
-- ============================================================================

ALTER TABLE order_fulfillment
  ADD COLUMN IF NOT EXISTS elevator_booking_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS elevator_booking_date DATE,
  ADD COLUMN IF NOT EXISTS elevator_booking_time VARCHAR(50),
  ADD COLUMN IF NOT EXISTS concierge_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS concierge_notes TEXT;

COMMENT ON COLUMN order_fulfillment.elevator_booking_required
  IS 'Whether elevator booking is required for this delivery (typically condo/apartment)';
COMMENT ON COLUMN order_fulfillment.elevator_booking_date
  IS 'Date of reserved elevator booking';
COMMENT ON COLUMN order_fulfillment.elevator_booking_time
  IS 'Time window for elevator booking (e.g. 9:00 AM - 12:00 PM)';
COMMENT ON COLUMN order_fulfillment.concierge_phone
  IS 'Concierge or building management phone number';
COMMENT ON COLUMN order_fulfillment.concierge_notes
  IS 'Notes for concierge or building access instructions';
