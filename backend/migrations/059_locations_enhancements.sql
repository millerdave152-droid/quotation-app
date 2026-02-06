-- Migration 059: Enhance locations table
-- Adds missing columns for full pickup location management

-- Email contact
ALTER TABLE locations ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Delivery origin flag
ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_delivery_origin BOOLEAN DEFAULT false;

-- Structured business hours (JSONB)
-- Format: {"monday": {"open": "09:00", "close": "18:00"}, "tuesday": {...}, ...}
ALTER TABLE locations ADD COLUMN IF NOT EXISTS business_hours JSONB;

-- Rename 'type' to more descriptive name via new column + backfill
-- (keeping old column for backward compatibility, adding new one)
ALTER TABLE locations ADD COLUMN IF NOT EXISTS location_type VARCHAR(20);

-- Backfill location_type from type
UPDATE locations SET location_type = type WHERE location_type IS NULL AND type IS NOT NULL;
UPDATE locations SET location_type = 'store' WHERE location_type IS NULL;

-- Backfill business hours with sensible defaults for existing locations
UPDATE locations
SET business_hours = '{
  "monday":    {"open": "09:00", "close": "18:00"},
  "tuesday":   {"open": "09:00", "close": "18:00"},
  "wednesday": {"open": "09:00", "close": "18:00"},
  "thursday":  {"open": "09:00", "close": "18:00"},
  "friday":    {"open": "09:00", "close": "18:00"},
  "saturday":  {"open": "10:00", "close": "17:00"},
  "sunday":    {"open": "closed", "close": "closed"}
}'::JSONB
WHERE business_hours IS NULL;

-- Seed warehouse location if it doesn't exist
INSERT INTO locations (name, address, city, province, postal_code, phone, type, location_type, is_pickup_location, is_delivery_origin, business_hours)
VALUES (
  'TeleTime Warehouse',
  '456 Industrial Rd',
  'Mississauga', 'ON', 'L4W 2B2',
  '905-555-0200',
  'warehouse', 'warehouse',
  true, true,
  '{"monday": {"open": "07:00", "close": "17:00"}, "tuesday": {"open": "07:00", "close": "17:00"}, "wednesday": {"open": "07:00", "close": "17:00"}, "thursday": {"open": "07:00", "close": "17:00"}, "friday": {"open": "07:00", "close": "17:00"}, "saturday": {"open": "08:00", "close": "14:00"}, "sunday": {"open": "closed", "close": "closed"}}'::JSONB
)
ON CONFLICT DO NOTHING;

-- Update main store to also be a delivery origin
UPDATE locations SET is_delivery_origin = true, location_type = 'both'
WHERE name = 'TeleTime Main Store' AND is_delivery_origin = false;

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(location_type);
CREATE INDEX IF NOT EXISTS idx_locations_active ON locations(active);
