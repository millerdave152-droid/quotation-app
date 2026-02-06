-- Migration 058: Delivery window scheduling system
-- Simplified zone + window config + scheduled deliveries for unified_orders

-- ============================================================================
-- DELIVERY WINDOW CONFIGS
-- ============================================================================
-- Per-zone, per-day-of-week time slot configuration

CREATE TABLE IF NOT EXISTS delivery_window_configs (
  id SERIAL PRIMARY KEY,
  zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_deliveries INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  CONSTRAINT dwc_valid_time_range CHECK (start_time < end_time),
  CONSTRAINT dwc_unique_slot UNIQUE (zone_id, day_of_week, start_time, end_time)
);

-- ============================================================================
-- SCHEDULED DELIVERIES
-- ============================================================================
-- Concrete delivery bookings tied to unified_orders

CREATE TABLE IF NOT EXISTS scheduled_deliveries (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES unified_orders(id) ON DELETE CASCADE UNIQUE NOT NULL,
  zone_id INTEGER REFERENCES delivery_zones(id),
  window_config_id INTEGER REFERENCES delivery_window_configs(id),
  delivery_date DATE NOT NULL,
  window_start TIME NOT NULL,
  window_end TIME NOT NULL,
  status VARCHAR(20) DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'out_for_delivery', 'delivered', 'failed', 'rescheduled')),
  driver_id INTEGER REFERENCES users(id),
  route_sequence INTEGER,
  estimated_arrival TIME,
  actual_arrival TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_deliveries_date ON scheduled_deliveries(delivery_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_deliveries_driver ON scheduled_deliveries(driver_id, delivery_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_deliveries_status ON scheduled_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_deliveries_zone_date ON scheduled_deliveries(zone_id, delivery_date);

-- ============================================================================
-- SEED DEFAULT WINDOW CONFIGS
-- ============================================================================
-- Create default windows for existing zones (if any exist)
-- Morning (9-12), Afternoon (12-3), Late Afternoon (3-6) — Mon-Sat

INSERT INTO delivery_window_configs (zone_id, day_of_week, start_time, end_time, max_deliveries)
SELECT z.id, dow.d, slot.s, slot.e, 8
FROM delivery_zones z
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6)) AS dow(d)
CROSS JOIN (VALUES ('09:00'::TIME, '12:00'::TIME), ('12:00'::TIME, '15:00'::TIME), ('15:00'::TIME, '18:00'::TIME)) AS slot(s, e)
WHERE z.is_active = true
ON CONFLICT DO NOTHING;
