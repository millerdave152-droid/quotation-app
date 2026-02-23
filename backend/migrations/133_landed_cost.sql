-- Migration 133: Landed Cost System
-- Adds landed cost tracking to goods receipts and products

-- Add landed cost columns to goods_receipt_items
ALTER TABLE goods_receipt_items ADD COLUMN IF NOT EXISTS landed_cost_cents INTEGER DEFAULT 0;
ALTER TABLE goods_receipt_items ADD COLUMN IF NOT EXISTS freight_allocation_cents INTEGER DEFAULT 0;
ALTER TABLE goods_receipt_items ADD COLUMN IF NOT EXISTS duty_cents INTEGER DEFAULT 0;
ALTER TABLE goods_receipt_items ADD COLUMN IF NOT EXISTS brokerage_cents INTEGER DEFAULT 0;

-- Add totals to goods_receipts
ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS total_freight_cents INTEGER DEFAULT 0;
ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS total_duty_cents INTEGER DEFAULT 0;
ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS total_brokerage_cents INTEGER DEFAULT 0;
ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS landed_cost_calculated BOOLEAN DEFAULT FALSE;

-- Add landed cost to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS landed_cost_cents INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_landed_cost_at TIMESTAMPTZ;

-- Landed cost entry details
CREATE TABLE IF NOT EXISTS landed_cost_entries (
  id SERIAL PRIMARY KEY,
  goods_receipt_id INTEGER NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  cost_type VARCHAR(50) NOT NULL CHECK (cost_type IN ('freight', 'duty', 'brokerage', 'insurance', 'handling', 'other')),
  description TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  allocated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landed_cost_entries_receipt ON landed_cost_entries(goods_receipt_id);
