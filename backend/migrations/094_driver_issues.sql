-- Issue/problem reports from drivers
CREATE TABLE IF NOT EXISTS driver_issues (
  id SERIAL PRIMARY KEY,
  ticket_number VARCHAR(20) UNIQUE NOT NULL,
  driver_id INTEGER REFERENCES drivers(id),
  delivery_booking_id INTEGER REFERENCES delivery_bookings(id),
  route_id INTEGER,
  category VARCHAR(30) NOT NULL,
  severity VARCHAR(10) NOT NULL DEFAULT 'medium',
  description TEXT NOT NULL,
  location_lat DECIMAL(10,7),
  location_lng DECIMAL(10,7),
  requires_immediate_action BOOLEAN DEFAULT false,
  customer_notified BOOLEAN DEFAULT false,
  customer_comments TEXT,
  can_continue_route BOOLEAN DEFAULT true,
  needs_assistance BOOLEAN DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  resolved_at TIMESTAMPTZ,
  resolved_by INTEGER,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_issue_photos (
  id SERIAL PRIMARY KEY,
  issue_id INTEGER NOT NULL REFERENCES driver_issues(id) ON DELETE CASCADE,
  photo_data TEXT NOT NULL,
  caption VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_issues_driver ON driver_issues(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_issues_status ON driver_issues(status);
CREATE INDEX IF NOT EXISTS idx_driver_issues_ticket ON driver_issues(ticket_number);
CREATE INDEX IF NOT EXISTS idx_driver_issues_booking ON driver_issues(delivery_booking_id);
