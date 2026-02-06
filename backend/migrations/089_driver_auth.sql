-- ============================================================================
-- Migration 089: Driver Authentication
-- Adds employee_id and PIN hash to drivers table for mobile app login
-- ============================================================================

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50) UNIQUE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_drivers_employee_id ON drivers(employee_id) WHERE employee_id IS NOT NULL;

-- Backfill employee_id from id for existing drivers (DRV-001, DRV-002, ...)
UPDATE drivers SET employee_id = 'DRV-' || LPAD(id::text, 3, '0')
WHERE employee_id IS NULL;
