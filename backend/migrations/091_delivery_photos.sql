-- Delivery photos table for proof of delivery
CREATE TABLE IF NOT EXISTS delivery_photos (
  id SERIAL PRIMARY KEY,
  delivery_booking_id INTEGER NOT NULL REFERENCES delivery_bookings(id),
  driver_id INTEGER REFERENCES drivers(id),
  photo_data TEXT NOT NULL,
  caption VARCHAR(500),
  tag VARCHAR(50),
  taken_at TIMESTAMPTZ DEFAULT NOW(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_delivery_photos_booking ON delivery_photos(delivery_booking_id);
CREATE INDEX idx_delivery_photos_driver ON delivery_photos(driver_id);
CREATE INDEX idx_delivery_photos_tag ON delivery_photos(tag);
