-- Migration 044: Return Reason Codes and Return Items
-- Lookup table for return reasons + per-item return tracking

-- ============================================================================
-- TABLE: return_reason_codes
-- ============================================================================

CREATE TABLE IF NOT EXISTS return_reason_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  description VARCHAR(255) NOT NULL,
  requires_notes BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed reason codes
INSERT INTO return_reason_codes (code, description, requires_notes, sort_order) VALUES
  ('damaged_transit', 'Damaged in transit', false, 1),
  ('damaged_arrival', 'Damaged on arrival', false, 2),
  ('wrong_item_shipped', 'Wrong item shipped', false, 3),
  ('wrong_item_ordered', 'Wrong item ordered', false, 4),
  ('changed_mind', 'Customer changed mind', false, 5),
  ('does_not_fit', 'Does not fit', false, 6),
  ('quality_not_expected', 'Quality not as expected', false, 7),
  ('missing_parts', 'Missing parts', false, 8),
  ('defective', 'Defective/not working', false, 9),
  ('other', 'Other', true, 10)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- TABLE: return_items
-- ============================================================================

CREATE TABLE IF NOT EXISTS return_items (
  id SERIAL PRIMARY KEY,
  return_id INTEGER NOT NULL REFERENCES pos_returns(id) ON DELETE CASCADE,
  transaction_item_id INTEGER NOT NULL REFERENCES transaction_items(item_id),
  quantity INTEGER NOT NULL DEFAULT 1,
  reason_code_id INTEGER NOT NULL REFERENCES return_reason_codes(id),
  reason_notes TEXT,
  condition VARCHAR(20) NOT NULL DEFAULT 'resellable' CHECK (condition IN ('resellable', 'damaged', 'defective')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_transaction_item_id ON return_items(transaction_item_id);
