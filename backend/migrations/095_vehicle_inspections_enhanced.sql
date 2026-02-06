-- Enhanced vehicle inspections for post-trip workflow
ALTER TABLE vehicle_inspections ADD COLUMN IF NOT EXISTS checklist JSONB;
ALTER TABLE vehicle_inspections ADD COLUMN IF NOT EXISTS fuel_level VARCHAR(20);
ALTER TABLE vehicle_inspections ADD COLUMN IF NOT EXISTS fuel_purchased BOOLEAN DEFAULT false;
ALTER TABLE vehicle_inspections ADD COLUMN IF NOT EXISTS fuel_receipt_url TEXT;
ALTER TABLE vehicle_inspections ADD COLUMN IF NOT EXISTS new_damage JSONB;
ALTER TABLE vehicle_inspections ADD COLUMN IF NOT EXISTS issues_reported JSONB;
ALTER TABLE vehicle_inspections ADD COLUMN IF NOT EXISTS maintenance_needed TEXT;
ALTER TABLE vehicle_inspections ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE vehicle_inspections ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed';
ALTER TABLE vehicle_inspections ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE vehicle_inspections ADD COLUMN IF NOT EXISTS shift_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_driver ON vehicle_inspections(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_vehicle ON vehicle_inspections(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_type ON vehicle_inspections(inspection_type);
