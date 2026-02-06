-- ============================================================================
-- Migration 077: Inter-Location Inventory Transfers
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_transfers (
  id SERIAL PRIMARY KEY,
  transfer_number VARCHAR(50) UNIQUE NOT NULL,

  from_location_id INTEGER REFERENCES locations(id) NOT NULL,
  to_location_id INTEGER REFERENCES locations(id) NOT NULL,

  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN (
    'draft', 'requested', 'approved', 'in_transit', 'received', 'completed', 'cancelled'
  )),

  requested_by INTEGER REFERENCES users(id),
  requested_at TIMESTAMP,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  shipped_by INTEGER REFERENCES users(id),
  shipped_at TIMESTAMP,
  received_by INTEGER REFERENCES users(id),
  received_at TIMESTAMP,

  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_transfer_items (
  id SERIAL PRIMARY KEY,
  transfer_id INTEGER REFERENCES inventory_transfers(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) NOT NULL,

  quantity_requested INTEGER NOT NULL,
  quantity_shipped INTEGER,
  quantity_received INTEGER,

  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfers_status ON inventory_transfers(status);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON inventory_transfers(from_location_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON inventory_transfers(to_location_id);
CREATE INDEX IF NOT EXISTS idx_transfers_number ON inventory_transfers(transfer_number);
CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON inventory_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_product ON inventory_transfer_items(product_id);

-- Sequence for transfer numbers
CREATE SEQUENCE IF NOT EXISTS transfer_number_seq START 1;
