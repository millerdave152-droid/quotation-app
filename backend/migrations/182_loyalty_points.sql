-- Migration 051: Loyalty Points System
-- Adds loyalty tables and updates payment method constraint

-- Customer loyalty balances and tiers
CREATE TABLE IF NOT EXISTS customer_loyalty (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) UNIQUE,
  points_balance INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  tier_level VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (tier_level IN ('none', 'bronze', 'silver', 'gold', 'platinum')),
  tier_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_loyalty_customer ON customer_loyalty(customer_id);

-- Loyalty point transactions (earn, redeem, adjust, expire)
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  points INTEGER NOT NULL,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('earn', 'redeem', 'refund', 'adjustment', 'expire')),
  order_id INTEGER,
  transaction_id INTEGER REFERENCES transactions(transaction_id),
  balance_after INTEGER NOT NULL,
  description TEXT,
  performed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_txns_customer ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_txns_order ON loyalty_transactions(order_id);

-- Add 'loyalty_points' to payments.payment_method CHECK constraint
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('cash', 'credit', 'debit', 'gift_card', 'account', 'financing', 'store_credit', 'etransfer', 'loyalty_points'));
