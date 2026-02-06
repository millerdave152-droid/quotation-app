-- Migration 063: Hub Commission Tracking
-- Order-level commission tracking with rules, split support, and approval workflow
-- Complements the existing POS commission system (migration 028)

-- ============================================================================
-- HUB COMMISSION RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS hub_commission_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,

  -- Scope (what this rule applies to)
  applies_to VARCHAR(20) NOT NULL CHECK (applies_to IN ('all', 'category', 'manufacturer', 'product')),
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  manufacturer VARCHAR(255),
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,

  -- Commission calculation
  commission_type VARCHAR(20) NOT NULL CHECK (commission_type IN ('percentage', 'flat', 'tiered')),
  commission_value DECIMAL(10,4), -- Percentage (e.g., 5.00 for 5%) or flat amount in dollars

  -- For tiered commissions (based on margin)
  tier_rules JSONB, -- [{ "min_margin": 0, "max_margin": 10, "commission": 2.0 }, ...]

  -- Conditions
  min_sale_amount INTEGER,         -- Minimum sale amount in cents
  min_margin_percent DECIMAL(5,2), -- Minimum margin % required

  priority INTEGER DEFAULT 0,     -- Higher priority rules applied first
  is_active BOOLEAN DEFAULT true,

  effective_from DATE,
  effective_to DATE,

  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_commission_rules_scope ON hub_commission_rules(applies_to) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_hub_commission_rules_category ON hub_commission_rules(category_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_hub_commission_rules_manufacturer ON hub_commission_rules(manufacturer) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_hub_commission_rules_product ON hub_commission_rules(product_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_hub_commission_rules_priority ON hub_commission_rules(priority DESC) WHERE is_active = true;

-- ============================================================================
-- ORDER COMMISSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_commissions (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES unified_orders(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),

  split_percentage DECIMAL(5,2) DEFAULT 100.00,

  -- Calculated amounts (all in cents)
  sale_amount INTEGER NOT NULL,       -- Their share of sale
  commission_base INTEGER NOT NULL,   -- Amount commission calculated on
  commission_rate DECIMAL(10,4),      -- Applied rate
  commission_amount INTEGER NOT NULL, -- Final commission

  -- Status workflow
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'adjusted', 'paid', 'cancelled')),

  -- Adjustments
  adjusted_amount INTEGER,
  adjustment_reason TEXT,
  adjusted_by INTEGER REFERENCES users(id),
  adjusted_at TIMESTAMPTZ,

  -- Approval
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMPTZ,

  -- Payment
  paid_in_period VARCHAR(20), -- '2026-01' for Jan 2026
  paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate commissions per user per order
  CONSTRAINT unique_order_commission_user UNIQUE (order_id, user_id)
);

CREATE INDEX idx_order_commissions_order ON order_commissions(order_id);
CREATE INDEX idx_order_commissions_user ON order_commissions(user_id);
CREATE INDEX idx_order_commissions_status ON order_commissions(status);
CREATE INDEX idx_order_commissions_period ON order_commissions(paid_in_period);

-- ============================================================================
-- ORDER COMMISSION LINE ITEMS (per-item breakdown)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_commission_items (
  id SERIAL PRIMARY KEY,
  commission_id INTEGER NOT NULL REFERENCES order_commissions(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES unified_order_items(id) ON DELETE CASCADE,
  rule_id INTEGER REFERENCES hub_commission_rules(id) ON DELETE SET NULL,

  -- Item details snapshot
  product_name VARCHAR(255),
  quantity INTEGER NOT NULL,

  -- Commission calculation
  item_amount_cents INTEGER NOT NULL,
  margin_percent DECIMAL(5,2),
  commission_rate DECIMAL(10,4),
  commission_amount_cents INTEGER NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_commission_items_commission ON order_commission_items(commission_id);

-- ============================================================================
-- DEFAULT RULES
-- ============================================================================

INSERT INTO hub_commission_rules (name, applies_to, commission_type, commission_value, priority, is_active)
VALUES ('Default Commission', 'all', 'percentage', 3.0000, 0, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW v_hub_commission_summary AS
SELECT
  oc.user_id,
  u.name AS rep_name,
  DATE_TRUNC('month', oc.created_at) AS month,
  COUNT(*) AS order_count,
  SUM(oc.sale_amount) AS total_sales_cents,
  SUM(COALESCE(oc.adjusted_amount, oc.commission_amount)) AS total_commission_cents,
  AVG(oc.commission_rate) AS avg_commission_rate,
  COUNT(*) FILTER (WHERE oc.status = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE oc.status = 'approved') AS approved_count,
  COUNT(*) FILTER (WHERE oc.status = 'paid') AS paid_count
FROM order_commissions oc
JOIN users u ON u.id = oc.user_id
WHERE oc.status != 'cancelled'
GROUP BY oc.user_id, u.name, DATE_TRUNC('month', oc.created_at);

CREATE OR REPLACE VIEW v_hub_commission_leaderboard AS
SELECT
  oc.user_id,
  u.name AS rep_name,
  SUM(COALESCE(oc.adjusted_amount, oc.commission_amount)) AS mtd_commission_cents,
  SUM(oc.sale_amount) AS mtd_sales_cents,
  COUNT(*) AS mtd_orders,
  RANK() OVER (ORDER BY SUM(COALESCE(oc.adjusted_amount, oc.commission_amount)) DESC) AS rank
FROM order_commissions oc
JOIN users u ON u.id = oc.user_id
WHERE oc.status != 'cancelled'
  AND oc.created_at >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY oc.user_id, u.name
ORDER BY mtd_commission_cents DESC;
