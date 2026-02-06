-- ============================================================================
-- Migration 076: Multi-Location Inventory Tracking
-- ============================================================================

-- Add code column to existing locations table
ALTER TABLE locations ADD COLUMN IF NOT EXISTS code VARCHAR(50);

-- Backfill code from name for existing rows
UPDATE locations SET code = UPPER(REPLACE(SUBSTRING(name FROM 1 FOR 20), ' ', '_'))
  WHERE code IS NULL;

-- Add unique constraint safely
DO $$ BEGIN
  ALTER TABLE locations ADD CONSTRAINT locations_code_unique UNIQUE (code);
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS location_inventory (
  id SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES locations(id) NOT NULL,
  product_id INTEGER REFERENCES products(id) NOT NULL,

  quantity_on_hand INTEGER DEFAULT 0,
  quantity_reserved INTEGER DEFAULT 0,
  quantity_available INTEGER GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,

  reorder_point INTEGER,
  reorder_quantity INTEGER,

  bin_location VARCHAR(50),

  last_counted_at TIMESTAMP,
  last_counted_by INTEGER REFERENCES users(id),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(location_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_location_inventory_location ON location_inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_location_inventory_product ON location_inventory(product_id);

-- Inventory adjustment log
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES locations(id) NOT NULL,
  product_id INTEGER REFERENCES products(id) NOT NULL,
  adjustment_type VARCHAR(30) NOT NULL CHECK (adjustment_type IN (
    'manual', 'sale', 'return', 'transfer', 'count', 'receiving', 'damage', 'write_off'
  )),
  quantity_change INTEGER NOT NULL,
  quantity_before INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL,
  reason TEXT,
  reference_id INTEGER, -- order/transfer id
  adjusted_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_adj_location ON inventory_adjustments(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_product ON inventory_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_date ON inventory_adjustments(created_at);

-- Summary view
CREATE OR REPLACE VIEW product_inventory_summary AS
SELECT
  product_id,
  SUM(quantity_on_hand)::int AS total_on_hand,
  SUM(quantity_reserved)::int AS total_reserved,
  SUM(quantity_on_hand - quantity_reserved)::int AS total_available,
  COUNT(DISTINCT location_id)::int AS locations_stocked,
  ARRAY_AGG(DISTINCT location_id) AS location_ids
FROM location_inventory
GROUP BY product_id;
