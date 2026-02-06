-- Delivery signatures table for proof of delivery
CREATE TABLE IF NOT EXISTS delivery_signatures (
  id SERIAL PRIMARY KEY,
  delivery_booking_id INTEGER NOT NULL REFERENCES delivery_bookings(id),
  driver_id INTEGER REFERENCES drivers(id),
  signature_data TEXT NOT NULL,
  signer_name VARCHAR(255),
  relationship VARCHAR(50) DEFAULT 'customer' CHECK (relationship IN ('customer','spouse','family','staff','other')),
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_delivery_signatures_booking ON delivery_signatures(delivery_booking_id);
CREATE INDEX idx_delivery_signatures_driver ON delivery_signatures(driver_id);

-- Add checklist_verified and delivery_started_at to delivery_bookings if not present
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS checklist_verified BOOLEAN DEFAULT false;
ALTER TABLE delivery_bookings ADD COLUMN IF NOT EXISTS delivery_started_at TIMESTAMPTZ;
