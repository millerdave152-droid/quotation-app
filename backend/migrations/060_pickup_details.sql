-- Migration 060: Pickup details table
-- Stores pickup person, vehicle, location, scheduling, and status tracking

CREATE TABLE IF NOT EXISTS pickup_details (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES unified_orders(id) ON DELETE CASCADE UNIQUE NOT NULL,

  location_id INTEGER REFERENCES locations(id) NOT NULL,
  pickup_date DATE NOT NULL,
  pickup_time_preference VARCHAR(50), -- 'morning', 'afternoon', 'anytime', or specific time

  -- Person collecting
  pickup_person_name VARCHAR(255) NOT NULL,
  pickup_person_phone VARCHAR(20) NOT NULL,
  pickup_person_email VARCHAR(255),

  -- Vehicle
  vehicle_type VARCHAR(50),
  vehicle_notes TEXT,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'notified', 'picked_up', 'cancelled')),
  ready_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  picked_up_by VARCHAR(255),

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pickup_details_order_id ON pickup_details(order_id);
CREATE INDEX IF NOT EXISTS idx_pickup_details_location_date ON pickup_details(location_id, pickup_date);
CREATE INDEX IF NOT EXISTS idx_pickup_details_status ON pickup_details(status);
