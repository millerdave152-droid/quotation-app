-- ============================================================================
-- Migration 083: Driver Management & Vehicle Enhancements
-- ============================================================================

-- Enhance vehicles
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS license_plate VARCHAR(20);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS has_lift_gate BOOLEAN DEFAULT FALSE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS has_blankets BOOLEAN DEFAULT TRUE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'available';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_odometer INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_inspection_date DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS next_inspection_due DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS max_weight_kg INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS max_items INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Backfill max_weight_kg from capacity_weight_kg
UPDATE vehicles SET max_weight_kg = capacity_weight_kg::int WHERE max_weight_kg IS NULL AND capacity_weight_kg IS NOT NULL;
-- Backfill max_items from capacity_items
UPDATE vehicles SET max_items = capacity_items WHERE max_items IS NULL AND capacity_items IS NOT NULL;
-- Backfill license_plate from plate_number
UPDATE vehicles SET license_plate = plate_number WHERE license_plate IS NULL AND plate_number IS NOT NULL;

-- Enhance driver_location_log
ALTER TABLE driver_location_log ADD COLUMN IF NOT EXISTS accuracy_meters INTEGER;

-- Driver shifts
CREATE TABLE IF NOT EXISTS driver_shifts (
  id SERIAL PRIMARY KEY,
  driver_id INTEGER REFERENCES drivers(id) NOT NULL,
  shift_date DATE NOT NULL,

  scheduled_start TIME,
  scheduled_end TIME,

  actual_start TIMESTAMP,
  actual_end TIMESTAMP,

  vehicle_id INTEGER REFERENCES vehicles(id),

  start_odometer INTEGER,
  end_odometer INTEGER,

  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'started', 'on_break', 'completed', 'no_show'
  )),

  total_deliveries INTEGER DEFAULT 0,
  total_distance_km NUMERIC(8,2),

  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(driver_id, shift_date)
);

CREATE INDEX IF NOT EXISTS idx_driver_shifts_date ON driver_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_driver_shifts_driver ON driver_shifts(driver_id);

-- Vehicle inspections
CREATE TABLE IF NOT EXISTS vehicle_inspections (
  id SERIAL PRIMARY KEY,
  vehicle_id INTEGER REFERENCES vehicles(id) NOT NULL,
  driver_id INTEGER REFERENCES drivers(id),

  inspection_type VARCHAR(20) NOT NULL CHECK (inspection_type IN ('pre_trip', 'post_trip', 'periodic')),
  inspection_date DATE DEFAULT CURRENT_DATE,

  checklist JSONB DEFAULT '{}',
  passed BOOLEAN DEFAULT TRUE,
  issues_found TEXT,

  odometer_reading INTEGER,
  photos TEXT[], -- array of URLs

  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_vehicle ON vehicle_inspections(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_date ON vehicle_inspections(inspection_date);

-- Location log cleanup done via scheduled job; index on recorded_at already exists
