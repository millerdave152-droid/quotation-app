-- Migration 057: Create delivery_details table
-- Consolidates dwelling type, entry point, floor, elevator booking,
-- access constraints, parking, and pathway confirmation

CREATE TABLE IF NOT EXISTS delivery_details (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES unified_orders(id) ON DELETE CASCADE UNIQUE NOT NULL,

  -- Address
  street_number VARCHAR(20) NOT NULL,
  street_name VARCHAR(255) NOT NULL,
  unit VARCHAR(50),
  buzzer VARCHAR(50),
  city VARCHAR(100) NOT NULL,
  province VARCHAR(2) NOT NULL,
  postal_code VARCHAR(10) NOT NULL,

  -- Dwelling
  dwelling_type VARCHAR(20) NOT NULL CHECK (dwelling_type IN ('house', 'townhouse', 'condo', 'apartment', 'commercial')),
  entry_point VARCHAR(50),
  floor_number VARCHAR(20),

  -- Elevator
  elevator_required BOOLEAN DEFAULT false,
  elevator_booking_date DATE,
  elevator_booking_time VARCHAR(50),
  concierge_phone VARCHAR(20),
  concierge_notes TEXT,

  -- Access
  access_steps INTEGER DEFAULT 0,
  access_narrow_stairs BOOLEAN DEFAULT false,
  access_height_restriction INTEGER,
  access_width_restriction INTEGER,
  access_notes TEXT,

  -- Parking
  parking_type VARCHAR(50),
  parking_distance INTEGER,
  parking_notes TEXT,

  -- Confirmation
  pathway_confirmed BOOLEAN DEFAULT false,
  pathway_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_details_order_id ON delivery_details(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_details_postal_code ON delivery_details(postal_code);
