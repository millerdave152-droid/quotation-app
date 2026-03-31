-- Migration 210: Multi-location inventory tracking and inter-store transfers
--
-- Creates inventory_locations (per-product per-location stock levels) and
-- stock_transfers (inter-store transfer workflow).
-- Seeds inventory_locations from products.qty_on_hand into location_id = 1 (Mississauga).
-- products.qty_on_hand is NOT altered — left in place for backward compatibility.

-- ============================================================================
-- 1. inventory_locations — per-product stock by location
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_locations (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  qty_on_hand INTEGER NOT NULL DEFAULT 0,
  qty_reserved INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_locations_product ON inventory_locations(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_locations_location ON inventory_locations(location_id);

-- ============================================================================
-- 2. Seed inventory_locations from products.qty_on_hand → location 1 (Mississauga)
-- ============================================================================
INSERT INTO inventory_locations (product_id, location_id, qty_on_hand, qty_reserved)
SELECT id, 1, COALESCE(qty_on_hand, 0), COALESCE(qty_reserved, 0)
FROM products
ON CONFLICT (product_id, location_id) DO NOTHING;

-- ============================================================================
-- 3. stock_transfers — inter-store transfer workflow
-- ============================================================================
CREATE TABLE IF NOT EXISTS stock_transfers (
  id SERIAL PRIMARY KEY,
  from_location_id INTEGER NOT NULL REFERENCES locations(id),
  to_location_id INTEGER NOT NULL REFERENCES locations(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  serial_id INTEGER REFERENCES product_serials(id),
  qty INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'picked_up', 'received', 'cancelled')),
  requested_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  driver_notes TEXT,
  picked_up_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from ON stock_transfers(from_location_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to ON stock_transfers(to_location_id);

-- ============================================================================
-- 4. serial_events event_type — add 'transferred' if not already present
--    Current constraint already includes 'transferred', so this is a no-op
--    safety net. Drop and recreate with full set to be idempotent.
-- ============================================================================
ALTER TABLE serial_events DROP CONSTRAINT IF EXISTS serial_events_event_type_check;
ALTER TABLE serial_events ADD CONSTRAINT serial_events_event_type_check
  CHECK (event_type IN (
    'received', 'sold', 'returned', 'transferred', 'warranty_claim',
    'recalled', 'damaged', 'scrapped', 'delivered', 'reserved', 'ra_created'
  ));
