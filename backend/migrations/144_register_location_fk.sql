-- ============================================================================
-- Migration 144: Add location_id FK to registers table
-- Links registers to locations for per-location inventory tracking on POS sales
-- ============================================================================

ALTER TABLE registers ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id);

-- Backfill existing registers to the first available location
UPDATE registers
SET location_id = (SELECT id FROM locations ORDER BY id LIMIT 1)
WHERE location_id IS NULL
  AND EXISTS (SELECT 1 FROM locations LIMIT 1);

CREATE INDEX IF NOT EXISTS idx_registers_location ON registers(location_id);
