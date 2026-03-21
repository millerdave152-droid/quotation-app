-- Migration 156: Create fraud_scores table for comprehensive transaction risk tracking
-- Phase 3 fraud infrastructure

CREATE TABLE IF NOT EXISTS fraud_scores (
  id BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT REFERENCES transactions(transaction_id),
  order_id BIGINT,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  risk_level VARCHAR(20) NOT NULL,
  signals JSONB NOT NULL DEFAULT '{}',
  action_taken VARCHAR(30) NOT NULL DEFAULT 'approved',
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  moneris_token VARCHAR(64),
  card_bin VARCHAR(8),
  card_last_four VARCHAR(4),
  card_type VARCHAR(20),
  card_brand VARCHAR(20),
  entry_method VARCHAR(20),
  terminal_id VARCHAR(50),
  employee_id INTEGER REFERENCES users(id),
  location_id INTEGER,
  customer_id INTEGER REFERENCES customers(id),
  amount DECIMAL(12,2),
  currency VARCHAR(3) DEFAULT 'CAD',
  ip_address INET,
  device_fingerprint VARCHAR(128),
  avs_result VARCHAR(10),
  cvv_result VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_scores_transaction ON fraud_scores(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fraud_scores_score ON fraud_scores(score);
CREATE INDEX IF NOT EXISTS idx_fraud_scores_risk_level ON fraud_scores(risk_level);
CREATE INDEX IF NOT EXISTS idx_fraud_scores_employee ON fraud_scores(employee_id);
CREATE INDEX IF NOT EXISTS idx_fraud_scores_location ON fraud_scores(location_id);
CREATE INDEX IF NOT EXISTS idx_fraud_scores_created ON fraud_scores(created_at);
CREATE INDEX IF NOT EXISTS idx_fraud_scores_card_bin ON fraud_scores(card_bin);
CREATE INDEX IF NOT EXISTS idx_fraud_scores_action ON fraud_scores(action_taken);
