-- Migration 101: CLV System Tables & Columns
-- Adds CLV tracking columns to customers, history table, and job log

-- ============================================
-- 1. Add CLV columns to customers (IF NOT EXISTS)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'clv_score') THEN
    ALTER TABLE customers ADD COLUMN clv_score INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'churn_risk') THEN
    ALTER TABLE customers ADD COLUMN churn_risk VARCHAR(20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'clv_segment') THEN
    ALTER TABLE customers ADD COLUMN clv_segment VARCHAR(20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'clv_last_calculated') THEN
    ALTER TABLE customers ADD COLUMN clv_last_calculated TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'total_transactions') THEN
    ALTER TABLE customers ADD COLUMN total_transactions INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'avg_order_value_cents') THEN
    ALTER TABLE customers ADD COLUMN avg_order_value_cents INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'days_since_last_activity') THEN
    ALTER TABLE customers ADD COLUMN days_since_last_activity INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'clv_trend') THEN
    ALTER TABLE customers ADD COLUMN clv_trend VARCHAR(20) DEFAULT 'stable';
  END IF;
END $$;

-- ============================================
-- 2. Indexes for efficient CLV querying
-- ============================================
CREATE INDEX IF NOT EXISTS idx_customers_clv_score ON customers(clv_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_customers_clv_segment ON customers(clv_segment) WHERE clv_segment IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_churn_risk ON customers(churn_risk) WHERE churn_risk IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_clv_last_calculated ON customers(clv_last_calculated);

-- ============================================
-- 3. CLV History table for trend tracking
-- ============================================
CREATE TABLE IF NOT EXISTS clv_history (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  clv_score INTEGER,
  churn_risk VARCHAR(20),
  clv_segment VARCHAR(20),
  total_transactions INTEGER,
  avg_order_value_cents INTEGER,
  days_since_last_activity INTEGER,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_clv_history_customer_date ON clv_history(customer_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_clv_history_snapshot_date ON clv_history(snapshot_date);

-- ============================================
-- 4. CLV Job Log table for execution history
-- ============================================
CREATE TABLE IF NOT EXISTS clv_job_log (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  customers_processed INTEGER DEFAULT 0,
  customers_updated INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  error_details JSONB,
  duration_ms INTEGER,
  triggered_by VARCHAR(50) DEFAULT 'scheduled'
);

CREATE INDEX IF NOT EXISTS idx_clv_job_log_started ON clv_job_log(started_at DESC);
