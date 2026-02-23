-- ============================================
-- Migration 123: Commission System Fix
-- Ensures all commission tables from migration 028 exist
-- and fixes the commission_rules schema if it has the old columns.
-- Also fixes views that reference u.name (doesn't exist).
-- ============================================

-- ============================================
-- 1. Fix commission_rules schema — add missing columns
-- ============================================

-- Add new columns that the CommissionService expects.
-- The old schema had (product_category, commission_percent);
-- the new schema uses (rule_type, rate, priority, etc.).
DO $$
BEGIN
  -- rule_name
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'rule_name') THEN
    ALTER TABLE commission_rules ADD COLUMN rule_name VARCHAR(100);
  END IF;

  -- rule_type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'rule_type') THEN
    ALTER TABLE commission_rules ADD COLUMN rule_type VARCHAR(30) DEFAULT 'flat';
  END IF;

  -- rate
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'rate') THEN
    ALTER TABLE commission_rules ADD COLUMN rate DECIMAL(5,4) DEFAULT 0.03;
  END IF;

  -- description
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'description') THEN
    ALTER TABLE commission_rules ADD COLUMN description TEXT;
  END IF;

  -- min_threshold_cents
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'min_threshold_cents') THEN
    ALTER TABLE commission_rules ADD COLUMN min_threshold_cents INTEGER DEFAULT 0;
  END IF;

  -- max_threshold_cents
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'max_threshold_cents') THEN
    ALTER TABLE commission_rules ADD COLUMN max_threshold_cents INTEGER;
  END IF;

  -- category_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'category_id') THEN
    ALTER TABLE commission_rules ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
  END IF;

  -- product_type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'product_type') THEN
    ALTER TABLE commission_rules ADD COLUMN product_type VARCHAR(50);
  END IF;

  -- applies_to_discounted
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'applies_to_discounted') THEN
    ALTER TABLE commission_rules ADD COLUMN applies_to_discounted BOOLEAN DEFAULT true;
  END IF;

  -- discount_threshold
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'discount_threshold') THEN
    ALTER TABLE commission_rules ADD COLUMN discount_threshold DECIMAL(5,4) DEFAULT 0.20;
  END IF;

  -- discounted_rate
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'discounted_rate') THEN
    ALTER TABLE commission_rules ADD COLUMN discounted_rate DECIMAL(5,4);
  END IF;

  -- is_bonus
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'is_bonus') THEN
    ALTER TABLE commission_rules ADD COLUMN is_bonus BOOLEAN DEFAULT false;
  END IF;

  -- bonus_flat_cents
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'bonus_flat_cents') THEN
    ALTER TABLE commission_rules ADD COLUMN bonus_flat_cents INTEGER;
  END IF;

  -- priority
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'priority') THEN
    ALTER TABLE commission_rules ADD COLUMN priority INTEGER DEFAULT 100;
  END IF;

  -- is_active (may already exist on old schema)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'is_active') THEN
    ALTER TABLE commission_rules ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;

  -- updated_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'updated_at') THEN
    ALTER TABLE commission_rules ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
  END IF;

  -- created_by
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'created_by') THEN
    ALTER TABLE commission_rules ADD COLUMN created_by INTEGER REFERENCES users(id);
  END IF;

  -- created_at (may already exist)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'created_at') THEN
    ALTER TABLE commission_rules ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
  END IF;
END $$;

-- ============================================
-- 2. Backfill old rows that have commission_percent but not rate
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'commission_percent') THEN
    UPDATE commission_rules
    SET rate = commission_percent / 100.0,
        rule_type = COALESCE(rule_type, 'flat'),
        rule_name = COALESCE(rule_name, 'Legacy Rule #' || id)
    WHERE rate IS NULL OR rate = 0.03;
  END IF;
END $$;

-- ============================================
-- 3. Create missing tables (IF NOT EXISTS)
-- ============================================

-- Commission Tiers
CREATE TABLE IF NOT EXISTS commission_tiers (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER REFERENCES commission_rules(id) ON DELETE CASCADE,
  tier_name VARCHAR(50),
  min_amount_cents INTEGER NOT NULL DEFAULT 0,
  max_amount_cents INTEGER,
  rate DECIMAL(5, 4) NOT NULL,
  CONSTRAINT tier_range_valid CHECK (max_amount_cents IS NULL OR max_amount_cents > min_amount_cents)
);

-- Commission Earnings
-- NOTE: order_id references transactions(transaction_id) instead of unified_orders(id)
-- because POS sales go to transactions table
CREATE TABLE IF NOT EXISTS commission_earnings (
  id SERIAL PRIMARY KEY,
  sales_rep_id INTEGER NOT NULL REFERENCES users(id),
  order_id INTEGER, -- References transaction_id (no FK since it could be unified_orders or transactions)
  line_item_id INTEGER,

  commission_amount_cents INTEGER NOT NULL,
  commission_rate DECIMAL(5, 4) NOT NULL,
  base_amount_cents INTEGER NOT NULL,

  rule_id INTEGER REFERENCES commission_rules(id) ON DELETE SET NULL,
  rule_name VARCHAR(100),
  rule_type VARCHAR(30),

  item_name VARCHAR(255),
  item_sku VARCHAR(50),
  category_name VARCHAR(100),

  is_bonus BOOLEAN DEFAULT false,
  is_reduced BOOLEAN DEFAULT false,
  discount_percent DECIMAL(5, 4),

  notes TEXT,
  order_date DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Commission Payouts
CREATE TABLE IF NOT EXISTS commission_payouts (
  id SERIAL PRIMARY KEY,
  sales_rep_id INTEGER NOT NULL REFERENCES users(id),
  payout_period_start DATE NOT NULL,
  payout_period_end DATE NOT NULL,

  gross_commission_cents INTEGER NOT NULL,
  adjustments_cents INTEGER DEFAULT 0,
  net_commission_cents INTEGER NOT NULL,

  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  paid_at TIMESTAMP,

  payment_reference VARCHAR(100),
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Commission Payout Items
CREATE TABLE IF NOT EXISTS commission_payout_items (
  payout_id INTEGER REFERENCES commission_payouts(id) ON DELETE CASCADE,
  earning_id INTEGER REFERENCES commission_earnings(id) ON DELETE CASCADE,
  PRIMARY KEY (payout_id, earning_id)
);

-- Sales Rep Commission Settings
CREATE TABLE IF NOT EXISTS sales_rep_commission_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,

  base_rate_override DECIMAL(5, 4),
  warranty_bonus_override DECIMAL(5, 4),

  monthly_target_cents INTEGER,
  quarterly_target_cents INTEGER,

  accelerator_rate DECIMAL(5, 4),
  accelerator_threshold DECIMAL(3, 2) DEFAULT 1.0,

  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 4. Create Indexes (IF NOT EXISTS)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_commission_rules_type ON commission_rules(rule_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_commission_rules_category ON commission_rules(category_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_commission_rules_product_type ON commission_rules(product_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_commission_rules_priority ON commission_rules(priority) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_commission_earnings_rep ON commission_earnings(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_commission_earnings_order ON commission_earnings(order_id);
CREATE INDEX IF NOT EXISTS idx_commission_earnings_date ON commission_earnings(order_date);
CREATE INDEX IF NOT EXISTS idx_commission_earnings_rep_date ON commission_earnings(sales_rep_id, order_date);

CREATE INDEX IF NOT EXISTS idx_commission_payouts_rep ON commission_payouts(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_status ON commission_payouts(status);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_period ON commission_payouts(payout_period_start, payout_period_end);

-- ============================================
-- 5. Insert default commission rules (only if empty or missing)
-- ============================================
INSERT INTO commission_rules (rule_name, rule_type, description, rate, priority, is_active)
SELECT 'Base Commission', 'flat', 'Default commission rate for all sales', 0.03, 1000, true
WHERE NOT EXISTS (SELECT 1 FROM commission_rules WHERE rule_type = 'flat' AND is_active = true);

INSERT INTO commission_rules (rule_name, rule_type, description, rate, product_type, is_bonus, priority, is_active)
SELECT 'Warranty Bonus', 'warranty', 'Bonus commission for warranty sales', 0.15, 'warranty', true, 50, true
WHERE NOT EXISTS (SELECT 1 FROM commission_rules WHERE rule_type = 'warranty' AND is_active = true);

INSERT INTO commission_rules (rule_name, rule_type, description, rate, product_type, is_bonus, priority, is_active)
SELECT 'Service Bonus', 'service', 'Bonus commission for service/installation sales', 0.10, 'service', true, 51, true
WHERE NOT EXISTS (SELECT 1 FROM commission_rules WHERE rule_type = 'service' AND is_active = true);

-- ============================================
-- 6. Fix views — replace u.name with first_name || last_name
-- ============================================
CREATE OR REPLACE VIEW v_rep_commission_summary AS
SELECT
  ce.sales_rep_id,
  COALESCE(u.first_name || ' ' || u.last_name, u.email) AS rep_name,
  DATE_TRUNC('month', ce.order_date) AS month,
  COUNT(DISTINCT ce.order_id) AS order_count,
  SUM(ce.base_amount_cents) AS total_sales_cents,
  SUM(ce.commission_amount_cents) AS total_commission_cents,
  SUM(CASE WHEN ce.is_bonus THEN ce.commission_amount_cents ELSE 0 END) AS bonus_commission_cents,
  AVG(ce.commission_rate) AS avg_commission_rate,
  COUNT(CASE WHEN ce.is_bonus THEN 1 END) AS bonus_items_sold
FROM commission_earnings ce
JOIN users u ON u.id = ce.sales_rep_id
GROUP BY ce.sales_rep_id, u.first_name, u.last_name, u.email, DATE_TRUNC('month', ce.order_date);

CREATE OR REPLACE VIEW v_daily_commissions AS
SELECT
  ce.sales_rep_id,
  COALESCE(u.first_name || ' ' || u.last_name, u.email) AS rep_name,
  ce.order_date,
  COUNT(DISTINCT ce.order_id) AS orders,
  SUM(ce.base_amount_cents) AS sales_cents,
  SUM(ce.commission_amount_cents) AS commission_cents
FROM commission_earnings ce
JOIN users u ON u.id = ce.sales_rep_id
WHERE ce.order_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY ce.sales_rep_id, u.first_name, u.last_name, u.email, ce.order_date
ORDER BY ce.order_date DESC, commission_cents DESC;

CREATE OR REPLACE VIEW v_commission_leaderboard AS
SELECT
  ce.sales_rep_id,
  COALESCE(u.first_name || ' ' || u.last_name, u.email) AS rep_name,
  SUM(ce.commission_amount_cents) AS mtd_commission_cents,
  SUM(ce.base_amount_cents) AS mtd_sales_cents,
  COUNT(DISTINCT ce.order_id) AS mtd_orders,
  RANK() OVER (ORDER BY SUM(ce.commission_amount_cents) DESC) AS rank
FROM commission_earnings ce
JOIN users u ON u.id = ce.sales_rep_id
WHERE ce.order_date >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY ce.sales_rep_id, u.first_name, u.last_name, u.email
ORDER BY mtd_commission_cents DESC;
