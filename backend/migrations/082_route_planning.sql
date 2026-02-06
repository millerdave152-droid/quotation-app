-- ============================================================================
-- Migration 082: Route Planning & Optimization
-- ============================================================================

-- Enhance dispatch_routes
ALTER TABLE dispatch_routes ADD COLUMN IF NOT EXISTS start_location_id INTEGER REFERENCES locations(id);
ALTER TABLE dispatch_routes ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE dispatch_routes ADD COLUMN IF NOT EXISTS total_distance_km NUMERIC(10,2);
ALTER TABLE dispatch_routes ADD COLUMN IF NOT EXISTS total_volume_cbm NUMERIC(10,2);
ALTER TABLE dispatch_routes ADD COLUMN IF NOT EXISTS optimized_at TIMESTAMP;

-- Add optimized status
DO $$ BEGIN
  ALTER TABLE dispatch_routes DROP CONSTRAINT IF EXISTS dispatch_routes_status_check;
  ALTER TABLE dispatch_routes ADD CONSTRAINT dispatch_routes_status_check
    CHECK (status IN ('planned','optimized','assigned','in_progress','completed','cancelled'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Route stops table
CREATE TABLE IF NOT EXISTS delivery_route_stops (
  id SERIAL PRIMARY KEY,
  route_id INTEGER REFERENCES dispatch_routes(id) ON DELETE CASCADE,
  delivery_booking_id INTEGER REFERENCES delivery_bookings(id),
  scheduled_delivery_id INTEGER REFERENCES scheduled_deliveries(id),

  sequence_order INTEGER NOT NULL,

  address TEXT NOT NULL,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),

  estimated_arrival TIME,
  estimated_departure TIME,
  estimated_duration_minutes INTEGER DEFAULT 15,
  estimated_distance_from_prev_km NUMERIC(8,2),

  actual_arrival TIMESTAMP,
  actual_departure TIMESTAMP,

  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending','approaching','arrived','completed','skipped','failed'
  )),

  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_stops_route ON delivery_route_stops(route_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_booking ON delivery_route_stops(delivery_booking_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_sequence ON delivery_route_stops(route_id, sequence_order);

-- Add geocode columns to delivery_bookings
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

-- Add geocode columns to locations (warehouse starting points)
ALTER TABLE locations ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
