-- Migration 108: Marketplace Commission Rates Reference Table
-- Stores Best Buy's commission fee schedule by product category (new items only)

CREATE TABLE IF NOT EXISTS marketplace_commission_rates (
  id SERIAL PRIMARY KEY,
  category_path TEXT NOT NULL,              -- Full path: "Product Root > Home Theatre > Wall Mounts"
  category_leaf VARCHAR(255) NOT NULL,      -- Leaf name: "Wall Mounts"
  commission_pct NUMERIC(5,2) NOT NULL,     -- e.g., 25.00
  item_condition VARCHAR(20) DEFAULT 'NEW',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_rates_leaf
  ON marketplace_commission_rates(category_leaf);

CREATE INDEX IF NOT EXISTS idx_commission_rates_path
  ON marketplace_commission_rates(category_path);

-- Add expected commission rate column to order items
ALTER TABLE marketplace_order_items
  ADD COLUMN IF NOT EXISTS expected_commission_rate NUMERIC(5,2);
