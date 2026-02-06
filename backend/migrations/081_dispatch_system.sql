-- ============================================================================
-- Migration 081: Dispatch Console Infrastructure
-- Drivers, vehicles, routes, and GPS tracking
-- ============================================================================

-- Drivers
CREATE TABLE IF NOT EXISTS drivers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  license_number VARCHAR(50),

  status VARCHAR(20) DEFAULT 'off_duty' CHECK (status IN (
    'available', 'on_route', 'break', 'off_duty'
  )),

  current_lat NUMERIC(10,7),
  current_lng NUMERIC(10,7),
  location_updated_at TIMESTAMP,

  vehicle_id INTEGER,
  home_location_id INTEGER REFERENCES locations(id),

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  plate_number VARCHAR(20),
  vehicle_type VARCHAR(30) CHECK (vehicle_type IN ('van', 'truck', 'flatbed', 'car')),

  capacity_weight_kg NUMERIC(8,2),
  capacity_volume_cbm NUMERIC(8,2),
  capacity_items INTEGER,

  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE drivers ADD CONSTRAINT fk_drivers_vehicle
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id);

-- Dispatch routes
CREATE TABLE IF NOT EXISTS dispatch_routes (
  id SERIAL PRIMARY KEY,
  route_number VARCHAR(50) UNIQUE NOT NULL,
  route_date DATE NOT NULL,

  driver_id INTEGER REFERENCES drivers(id),
  vehicle_id INTEGER REFERENCES vehicles(id),
  location_id INTEGER REFERENCES locations(id),

  status VARCHAR(20) DEFAULT 'planned' CHECK (status IN (
    'planned', 'assigned', 'in_progress', 'completed', 'cancelled'
  )),

  total_stops INTEGER DEFAULT 0,
  completed_stops INTEGER DEFAULT 0,
  total_weight_kg NUMERIC(8,2) DEFAULT 0,

  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  estimated_duration_minutes INTEGER,

  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_routes_date ON dispatch_routes(route_date);
CREATE INDEX IF NOT EXISTS idx_dispatch_routes_driver ON dispatch_routes(driver_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_routes_status ON dispatch_routes(status);

-- Link scheduled_deliveries to routes
ALTER TABLE scheduled_deliveries ADD COLUMN IF NOT EXISTS route_id INTEGER REFERENCES dispatch_routes(id);
ALTER TABLE scheduled_deliveries ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(8,2);

-- Link delivery_bookings to routes
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS route_id INTEGER REFERENCES dispatch_routes(id);
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS zone_id INTEGER REFERENCES delivery_zones(id);
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(8,2);
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS estimated_arrival TIMESTAMP;

-- Driver GPS log
CREATE TABLE IF NOT EXISTS driver_location_log (
  id SERIAL PRIMARY KEY,
  driver_id INTEGER REFERENCES drivers(id) NOT NULL,
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  speed_kmh NUMERIC(6,2),
  heading INTEGER,
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_loc_log_driver ON driver_location_log(driver_id, recorded_at DESC);

-- Route sequence for transfer numbers
CREATE SEQUENCE IF NOT EXISTS dispatch_route_number_seq START 1;
