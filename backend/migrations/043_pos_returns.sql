-- Migration 043: POS Returns System
-- Tracks product returns and refunds for POS transactions

CREATE TABLE IF NOT EXISTS pos_returns (
  id SERIAL PRIMARY KEY,
  original_transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  return_number VARCHAR(50) UNIQUE NOT NULL,
  return_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  return_type VARCHAR(10) NOT NULL CHECK (return_type IN ('full', 'partial')),
  status VARCHAR(20) NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'processing', 'completed', 'cancelled')),
  processed_by INTEGER REFERENCES users(id),
  total_refund_amount NUMERIC(10,2),
  refund_method VARCHAR(50),
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_returns_original_transaction ON pos_returns(original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_returns_return_number ON pos_returns(return_number);
CREATE INDEX IF NOT EXISTS idx_pos_returns_status ON pos_returns(status);
