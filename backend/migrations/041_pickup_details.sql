-- ============================================================================
-- Migration 041: Pickup Details for Pickup Orders
-- Adds pickup location, date, and time preference to order_fulfillment
-- Also creates a locations table for store/warehouse pickup points
-- ============================================================================

-- Locations table for pickup points
CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  province VARCHAR(2),
  postal_code VARCHAR(10),
  phone VARCHAR(20),
  type VARCHAR(50) DEFAULT 'store',
  is_pickup_location BOOLEAN DEFAULT TRUE,
  pickup_hours TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE locations IS 'Store and warehouse locations for pickup fulfillment';
COMMENT ON COLUMN locations.type IS 'Location type: store, warehouse, distribution_center';
COMMENT ON COLUMN locations.pickup_hours IS 'JSON string of pickup hours by day';

-- Add pickup fields to order_fulfillment
ALTER TABLE order_fulfillment
  ADD COLUMN IF NOT EXISTS pickup_location_id INTEGER,
  ADD COLUMN IF NOT EXISTS pickup_date DATE,
  ADD COLUMN IF NOT EXISTS pickup_time_preference VARCHAR(50);

COMMENT ON COLUMN order_fulfillment.pickup_location_id IS 'Foreign key to locations table for pickup orders';
COMMENT ON COLUMN order_fulfillment.pickup_date IS 'Selected pickup date';
COMMENT ON COLUMN order_fulfillment.pickup_time_preference IS 'Preferred pickup time window: morning, afternoon, evening';

-- Seed default store location
INSERT INTO locations (name, address, city, province, postal_code, phone, type, is_pickup_location)
VALUES ('TeleTime Main Store', '123 Main Street', 'Toronto', 'ON', 'M5V 2T6', '416-555-0100', 'store', TRUE)
ON CONFLICT DO NOTHING;
