-- Migration 102: Discount Authority System
-- Tier-based discount permissions, budget tracking, and escalation workflows

-- 1. Tier configuration per role
CREATE TABLE IF NOT EXISTS discount_authority_tiers (
  id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  max_discount_pct_standard NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  max_discount_pct_high_margin NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  high_margin_threshold NUMERIC(5,2) NOT NULL DEFAULT 30.00,
  min_margin_floor_pct NUMERIC(5,2) DEFAULT 10.00,
  requires_approval_below_margin NUMERIC(5,2) DEFAULT 15.00,
  is_unrestricted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default tiers
INSERT INTO discount_authority_tiers (role_name, max_discount_pct_standard, max_discount_pct_high_margin, high_margin_threshold, min_margin_floor_pct, requires_approval_below_margin, is_unrestricted)
VALUES
  ('staff',   5.00, 10.00, 30.00, 10.00, 15.00, FALSE),
  ('manager', 15.00, 25.00, 30.00,  5.00, 10.00, FALSE),
  ('master',  NULL,  NULL,  NULL,   NULL,  NULL,  TRUE)
ON CONFLICT (role_name) DO NOTHING;

-- 2. Weekly discount budgets per employee
CREATE TABLE IF NOT EXISTS discount_budgets (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES users(id),
  budget_period_start DATE NOT NULL,
  budget_period_end DATE NOT NULL,
  total_budget_dollars NUMERIC(10,2) NOT NULL DEFAULT 500.00,
  used_dollars NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  remaining_dollars NUMERIC(10,2) GENERATED ALWAYS AS (total_budget_dollars - used_dollars) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, budget_period_start)
);

CREATE INDEX IF NOT EXISTS idx_discount_budgets_employee ON discount_budgets(employee_id);
CREATE INDEX IF NOT EXISTS idx_discount_budgets_period ON discount_budgets(budget_period_start, budget_period_end);

-- 3. Discount transaction log
CREATE TABLE IF NOT EXISTS discount_transactions (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER,
  sale_item_id INTEGER,
  employee_id INTEGER NOT NULL REFERENCES users(id),
  product_id INTEGER REFERENCES products(id),
  original_price NUMERIC(10,2) NOT NULL,
  discount_pct NUMERIC(5,2) NOT NULL,
  discount_amount NUMERIC(10,2) NOT NULL,
  price_after_discount NUMERIC(10,2) NOT NULL,
  product_cost NUMERIC(10,2),
  margin_before_discount NUMERIC(5,2),
  margin_after_discount NUMERIC(5,2),
  commission_impact NUMERIC(10,2),
  was_auto_approved BOOLEAN NOT NULL DEFAULT FALSE,
  required_manager_approval BOOLEAN NOT NULL DEFAULT FALSE,
  approval_reason TEXT,
  budget_period_id INTEGER REFERENCES discount_budgets(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discount_tx_employee ON discount_transactions(employee_id);
CREATE INDEX IF NOT EXISTS idx_discount_tx_sale ON discount_transactions(sale_id);
CREATE INDEX IF NOT EXISTS idx_discount_tx_created ON discount_transactions(created_at);

-- 4. Escalation requests for manager approval
CREATE TABLE IF NOT EXISTS discount_escalations (
  id SERIAL PRIMARY KEY,
  requesting_employee_id INTEGER NOT NULL REFERENCES users(id),
  approving_manager_id INTEGER REFERENCES users(id),
  product_id INTEGER REFERENCES products(id),
  requested_discount_pct NUMERIC(5,2) NOT NULL,
  reason TEXT,
  margin_after_discount NUMERIC(5,2),
  commission_impact NUMERIC(10,2),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  manager_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discount_esc_employee ON discount_escalations(requesting_employee_id);
CREATE INDEX IF NOT EXISTS idx_discount_esc_status ON discount_escalations(status);
