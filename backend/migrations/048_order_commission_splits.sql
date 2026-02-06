-- Migration 048: Order Commission Splits
-- Allows multiple commission records per order with configurable split percentages

CREATE TABLE IF NOT EXISTS order_commission_splits (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(transaction_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  split_percentage DECIMAL(5,2) NOT NULL CHECK (split_percentage > 0 AND split_percentage <= 100),
  commission_amount_cents INTEGER NOT NULL DEFAULT 0,
  role VARCHAR(20) NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'secondary', 'assist')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'adjusted')),
  notes TEXT,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_split_per_user UNIQUE (transaction_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_commission_splits_transaction ON order_commission_splits(transaction_id);
CREATE INDEX IF NOT EXISTS idx_commission_splits_user ON order_commission_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_commission_splits_status ON order_commission_splits(status);
CREATE INDEX IF NOT EXISTS idx_commission_splits_user_date ON order_commission_splits(user_id, created_at DESC);
