-- ============================================
-- Migration 028: Commission System
-- Calculates and tracks sales rep commissions
-- ============================================

-- Commission Rules Table
-- Defines how commissions are calculated for different scenarios
CREATE TABLE IF NOT EXISTS commission_rules (
  id SERIAL PRIMARY KEY,
  rule_name VARCHAR(100) NOT NULL,
  rule_type VARCHAR(30) NOT NULL CHECK (rule_type IN ('flat', 'tiered', 'category', 'product_type', 'warranty', 'service')),
  description TEXT,

  -- Rate configuration
  rate DECIMAL(5, 4) NOT NULL DEFAULT 0.03, -- Percentage as decimal (0.03 = 3%)

  -- Tiered configuration (for tiered rules)
  min_threshold_cents INTEGER DEFAULT 0,
  max_threshold_cents INTEGER, -- NULL = unlimited

  -- Category/Product type specific
  category_id INTEGER REFERENCES product_categories(id) ON DELETE SET NULL,
  product_type VARCHAR(50), -- 'accessory', 'tv', 'phone', 'warranty', 'service', etc.

  -- Discount handling
  applies_to_discounted BOOLEAN DEFAULT true,
  discount_threshold DECIMAL(5, 4) DEFAULT 0.20, -- Reduce commission if discount > 20%
  discounted_rate DECIMAL(5, 4), -- Alternative rate for heavily discounted items

  -- Bonus configuration (for warranties/services)
  is_bonus BOOLEAN DEFAULT false,
  bonus_flat_cents INTEGER, -- Flat bonus amount instead of percentage

  -- Priority and status
  priority INTEGER DEFAULT 100, -- Lower = higher priority (checked first)
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

-- Commission Tiers (for tiered commission structures)
CREATE TABLE IF NOT EXISTS commission_tiers (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER REFERENCES commission_rules(id) ON DELETE CASCADE,
  tier_name VARCHAR(50),
  min_amount_cents INTEGER NOT NULL DEFAULT 0,
  max_amount_cents INTEGER, -- NULL = unlimited
  rate DECIMAL(5, 4) NOT NULL,

  CONSTRAINT tier_range_valid CHECK (max_amount_cents IS NULL OR max_amount_cents > min_amount_cents)
);

-- Commission Earnings Table
-- Records actual commissions earned on completed orders
CREATE TABLE IF NOT EXISTS commission_earnings (
  id SERIAL PRIMARY KEY,
  sales_rep_id INTEGER NOT NULL REFERENCES users(id),
  order_id INTEGER REFERENCES unified_orders(id) ON DELETE SET NULL,
  line_item_id INTEGER REFERENCES unified_order_items(id) ON DELETE SET NULL,

  -- Commission details
  commission_amount_cents INTEGER NOT NULL,
  commission_rate DECIMAL(5, 4) NOT NULL,
  base_amount_cents INTEGER NOT NULL, -- What commission was calculated on

  -- Rule tracking
  rule_id INTEGER REFERENCES commission_rules(id) ON DELETE SET NULL,
  rule_name VARCHAR(100), -- Denormalized for history
  rule_type VARCHAR(30),

  -- Item details (denormalized for history)
  item_name VARCHAR(255),
  item_sku VARCHAR(50),
  category_name VARCHAR(100),

  -- Flags
  is_bonus BOOLEAN DEFAULT false,
  is_reduced BOOLEAN DEFAULT false, -- Was rate reduced due to discount?
  discount_percent DECIMAL(5, 4), -- Original discount on item

  -- Notes
  notes TEXT,

  -- Timestamps
  order_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),

  -- Prevent duplicate earnings
  CONSTRAINT unique_earning_per_item UNIQUE (order_id, line_item_id, rule_id)
);

-- Commission Payouts (for tracking paid commissions)
CREATE TABLE IF NOT EXISTS commission_payouts (
  id SERIAL PRIMARY KEY,
  sales_rep_id INTEGER NOT NULL REFERENCES users(id),
  payout_period_start DATE NOT NULL,
  payout_period_end DATE NOT NULL,

  -- Amounts
  gross_commission_cents INTEGER NOT NULL,
  adjustments_cents INTEGER DEFAULT 0,
  net_commission_cents INTEGER NOT NULL,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  paid_at TIMESTAMP,

  -- Reference
  payment_reference VARCHAR(100),
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Link payouts to individual earnings
CREATE TABLE IF NOT EXISTS commission_payout_items (
  payout_id INTEGER REFERENCES commission_payouts(id) ON DELETE CASCADE,
  earning_id INTEGER REFERENCES commission_earnings(id) ON DELETE CASCADE,
  PRIMARY KEY (payout_id, earning_id)
);

-- Sales Rep Commission Settings (individual overrides)
CREATE TABLE IF NOT EXISTS sales_rep_commission_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,

  -- Override rates
  base_rate_override DECIMAL(5, 4), -- Override flat rate
  warranty_bonus_override DECIMAL(5, 4),

  -- Targets
  monthly_target_cents INTEGER,
  quarterly_target_cents INTEGER,

  -- Accelerators (bonus rate above target)
  accelerator_rate DECIMAL(5, 4), -- Extra rate when exceeding target
  accelerator_threshold DECIMAL(3, 2) DEFAULT 1.0, -- 1.0 = 100% of target

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- INDEXES
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
-- DEFAULT COMMISSION RULES
-- ============================================
INSERT INTO commission_rules (rule_name, rule_type, description, rate, priority, is_active) VALUES
  ('Base Commission', 'flat', 'Default commission rate for all sales', 0.03, 1000, true)
ON CONFLICT DO NOTHING;

-- Warranty/Service bonuses
INSERT INTO commission_rules (rule_name, rule_type, description, rate, product_type, is_bonus, priority, is_active) VALUES
  ('Warranty Bonus', 'warranty', 'Bonus commission for warranty sales', 0.15, 'warranty', true, 50, true),
  ('Service Bonus', 'service', 'Bonus commission for service/installation sales', 0.10, 'service', true, 51, true)
ON CONFLICT DO NOTHING;

-- Category-specific rates (if categories exist)
INSERT INTO commission_rules (rule_name, rule_type, description, rate, product_type, priority, is_active) VALUES
  ('Accessories Rate', 'product_type', 'Higher commission on accessories', 0.05, 'accessory', 100, true),
  ('TV Rate', 'product_type', 'Standard commission on TVs', 0.02, 'tv', 100, true),
  ('Phone Rate', 'product_type', 'Commission on phones', 0.025, 'phone', 100, true),
  ('Audio Rate', 'product_type', 'Commission on audio equipment', 0.03, 'audio', 100, true)
ON CONFLICT DO NOTHING;

-- Tiered commission structure
INSERT INTO commission_rules (rule_name, rule_type, description, rate, min_threshold_cents, max_threshold_cents, priority, is_active) VALUES
  ('Tiered - Base', 'tiered', 'Base tier: 0-$10K monthly', 0.03, 0, 1000000, 200, false),
  ('Tiered - Mid', 'tiered', 'Mid tier: $10K-$25K monthly', 0.04, 1000000, 2500000, 200, false),
  ('Tiered - High', 'tiered', 'High tier: $25K+ monthly', 0.05, 2500000, NULL, 200, false)
ON CONFLICT DO NOTHING;

-- ============================================
-- VIEWS
-- ============================================

-- Rep commission summary view
CREATE OR REPLACE VIEW v_rep_commission_summary AS
SELECT
  ce.sales_rep_id,
  u.name AS rep_name,
  DATE_TRUNC('month', ce.order_date) AS month,
  COUNT(DISTINCT ce.order_id) AS order_count,
  SUM(ce.base_amount_cents) AS total_sales_cents,
  SUM(ce.commission_amount_cents) AS total_commission_cents,
  SUM(CASE WHEN ce.is_bonus THEN ce.commission_amount_cents ELSE 0 END) AS bonus_commission_cents,
  AVG(ce.commission_rate) AS avg_commission_rate,
  COUNT(CASE WHEN ce.is_bonus THEN 1 END) AS bonus_items_sold
FROM commission_earnings ce
JOIN users u ON u.id = ce.sales_rep_id
GROUP BY ce.sales_rep_id, u.name, DATE_TRUNC('month', ce.order_date);

-- Daily commission tracking
CREATE OR REPLACE VIEW v_daily_commissions AS
SELECT
  ce.sales_rep_id,
  u.name AS rep_name,
  ce.order_date,
  COUNT(DISTINCT ce.order_id) AS orders,
  SUM(ce.base_amount_cents) AS sales_cents,
  SUM(ce.commission_amount_cents) AS commission_cents
FROM commission_earnings ce
JOIN users u ON u.id = ce.sales_rep_id
WHERE ce.order_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY ce.sales_rep_id, u.name, ce.order_date
ORDER BY ce.order_date DESC, commission_cents DESC;

-- Commission leaderboard
CREATE OR REPLACE VIEW v_commission_leaderboard AS
SELECT
  ce.sales_rep_id,
  u.name AS rep_name,
  SUM(ce.commission_amount_cents) AS mtd_commission_cents,
  SUM(ce.base_amount_cents) AS mtd_sales_cents,
  COUNT(DISTINCT ce.order_id) AS mtd_orders,
  RANK() OVER (ORDER BY SUM(ce.commission_amount_cents) DESC) AS rank
FROM commission_earnings ce
JOIN users u ON u.id = ce.sales_rep_id
WHERE ce.order_date >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY ce.sales_rep_id, u.name
ORDER BY mtd_commission_cents DESC;

COMMENT ON TABLE commission_rules IS 'Defines commission calculation rules for different scenarios';
COMMENT ON TABLE commission_earnings IS 'Records actual commissions earned on completed orders';
COMMENT ON TABLE commission_payouts IS 'Tracks commission payouts to sales reps';
COMMENT ON VIEW v_commission_leaderboard IS 'Monthly commission rankings for sales reps';
