-- Outcome-specific fields for delivery_bookings
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS outcome_type VARCHAR(30);
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS outcome_reason TEXT;
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS outcome_details JSONB;
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS contact_attempted BOOLEAN DEFAULT false;
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS recommended_action VARCHAR(50);
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS reschedule_date DATE;
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS reschedule_time VARCHAR(20);
