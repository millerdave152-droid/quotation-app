-- Additional completion fields for delivery_bookings
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS completion_type VARCHAR(20) DEFAULT 'delivered';
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS completion_checklist JSONB;
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS completion_notes TEXT;
