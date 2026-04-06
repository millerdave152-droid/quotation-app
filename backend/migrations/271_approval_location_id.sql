ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_location ON approval_requests(location_id) WHERE location_id IS NOT NULL;

ALTER TABLE discount_escalations ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id);
CREATE INDEX IF NOT EXISTS idx_discount_escalations_location ON discount_escalations(location_id) WHERE location_id IS NOT NULL;
