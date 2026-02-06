-- Migration 046: Store Credits System
-- Allows issuing store credit from returns, promotions, or manual adjustments

CREATE TABLE IF NOT EXISTS store_credits (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  code VARCHAR(20) UNIQUE NOT NULL,
  original_amount INTEGER NOT NULL,
  current_balance INTEGER NOT NULL,
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('return', 'promotion', 'manual')),
  source_id INTEGER,
  issued_by INTEGER REFERENCES users(id),
  issued_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expiry_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'depleted', 'expired', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_credits_code ON store_credits(code);
CREATE INDEX IF NOT EXISTS idx_store_credits_customer ON store_credits(customer_id);
CREATE INDEX IF NOT EXISTS idx_store_credits_status ON store_credits(status);
CREATE INDEX IF NOT EXISTS idx_store_credits_source ON store_credits(source_type, source_id);

-- Track individual redemptions of store credit
CREATE TABLE IF NOT EXISTS store_credit_transactions (
  id SERIAL PRIMARY KEY,
  store_credit_id INTEGER NOT NULL REFERENCES store_credits(id),
  transaction_id INTEGER REFERENCES transactions(transaction_id),
  amount_cents INTEGER NOT NULL,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('issue', 'redeem', 'refund', 'adjustment', 'cancel')),
  balance_after INTEGER NOT NULL,
  notes TEXT,
  performed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_credit_txns_credit ON store_credit_transactions(store_credit_id);
CREATE INDEX IF NOT EXISTS idx_store_credit_txns_transaction ON store_credit_transactions(transaction_id);
