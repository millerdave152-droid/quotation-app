-- Migration 045: Add refund processing fields to pos_returns
-- Stores refund breakdown and Stripe refund reference

ALTER TABLE pos_returns
  ADD COLUMN IF NOT EXISTS refund_subtotal INTEGER,
  ADD COLUMN IF NOT EXISTS refund_tax INTEGER,
  ADD COLUMN IF NOT EXISTS refund_total INTEGER,
  ADD COLUMN IF NOT EXISTS restocking_fee INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_refund_id VARCHAR(255);

-- Widen refund_method to support enum-like values
-- (existing column is VARCHAR(50), just update the check if needed)
-- Values: 'original_payment', 'store_credit', 'cash', 'gift_card'

-- Track which original payments were refunded and how much
CREATE TABLE IF NOT EXISTS return_payment_allocations (
  id SERIAL PRIMARY KEY,
  return_id INTEGER NOT NULL REFERENCES pos_returns(id) ON DELETE CASCADE,
  original_payment_id INTEGER NOT NULL REFERENCES payments(payment_id),
  refund_amount_cents INTEGER NOT NULL,
  refund_method VARCHAR(50) NOT NULL,
  stripe_refund_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_payment_alloc_return ON return_payment_allocations(return_id);
