-- ============================================================================
-- Migration 042: Pickup Person Details
-- Adds pickup person name, phone, vehicle type, and vehicle notes
-- to order_fulfillment for third-party pickups
-- ============================================================================

ALTER TABLE order_fulfillment
  ADD COLUMN IF NOT EXISTS pickup_person_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS pickup_person_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pickup_vehicle_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS pickup_vehicle_notes TEXT;

COMMENT ON COLUMN order_fulfillment.pickup_person_name IS 'Name of person picking up (may differ from customer)';
COMMENT ON COLUMN order_fulfillment.pickup_person_phone IS 'Phone of person picking up';
COMMENT ON COLUMN order_fulfillment.pickup_vehicle_type IS 'Vehicle type: car, suv, truck, van, other';
COMMENT ON COLUMN order_fulfillment.pickup_vehicle_notes IS 'Vehicle/loading notes for pickup';
