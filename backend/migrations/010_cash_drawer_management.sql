-- TeleTime POS - Cash Drawer Management
-- Migration: 010_cash_drawer_management.sql
-- Description: Enhanced cash drawer tracking with movements, denominations, and reconciliation

-- ============================================================================
-- 1. CASH MOVEMENTS TABLE
-- Track all cash in/out movements (paid-outs, drops, additions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cash_movements (
  id SERIAL PRIMARY KEY,
  shift_id INTEGER NOT NULL REFERENCES register_shifts(shift_id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN (
    'paid_out',      -- Cash removed for expenses (e.g., supplier payment)
    'drop',          -- Cash removed to safe (excess cash)
    'pickup',        -- Cash picked up by manager
    'add',           -- Cash added to drawer
    'float_adjust',  -- Adjustment to opening float
    'refund',        -- Cash refund to customer
    'correction'     -- Manual correction
  )),
  amount DECIMAL(10,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  reference_number VARCHAR(50),  -- Receipt/reference for paid-outs
  approved_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE cash_movements IS 'Tracks all cash drawer movements outside of sales';
COMMENT ON COLUMN cash_movements.movement_type IS 'Type of cash movement';
COMMENT ON COLUMN cash_movements.amount IS 'Positive for cash in, negative for cash out';
COMMENT ON COLUMN cash_movements.reference_number IS 'External reference (receipt number, etc.)';
COMMENT ON COLUMN cash_movements.approved_by IS 'Manager who approved the movement (for paid-outs)';

-- Indexes for cash movements
CREATE INDEX IF NOT EXISTS idx_cash_movements_shift ON cash_movements(shift_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_type ON cash_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_cash_movements_date ON cash_movements(created_at);

-- ============================================================================
-- 2. CASH COUNTS TABLE
-- Store denomination breakdown for opening/closing counts
-- ============================================================================

CREATE TABLE IF NOT EXISTS cash_counts (
  id SERIAL PRIMARY KEY,
  shift_id INTEGER NOT NULL REFERENCES register_shifts(shift_id),
  count_type VARCHAR(20) NOT NULL CHECK (count_type IN ('opening', 'closing', 'drop', 'audit')),

  -- Bills (CAD)
  bills_100 INTEGER DEFAULT 0,
  bills_50 INTEGER DEFAULT 0,
  bills_20 INTEGER DEFAULT 0,
  bills_10 INTEGER DEFAULT 0,
  bills_5 INTEGER DEFAULT 0,

  -- Coins (CAD)
  coins_200 INTEGER DEFAULT 0,  -- $2 (toonie)
  coins_100 INTEGER DEFAULT 0,  -- $1 (loonie)
  coins_25 INTEGER DEFAULT 0,   -- 25 cents
  coins_10 INTEGER DEFAULT 0,   -- 10 cents
  coins_5 INTEGER DEFAULT 0,    -- 5 cents

  -- Rolls (optional for opening float)
  rolls_200 INTEGER DEFAULT 0,  -- $2 rolls ($50)
  rolls_100 INTEGER DEFAULT 0,  -- $1 rolls ($25)
  rolls_25 INTEGER DEFAULT 0,   -- 25c rolls ($10)
  rolls_10 INTEGER DEFAULT 0,   -- 10c rolls ($5)
  rolls_5 INTEGER DEFAULT 0,    -- 5c rolls ($2)

  -- Calculated total
  total_amount DECIMAL(10,2) NOT NULL,

  counted_by INTEGER NOT NULL REFERENCES users(id),
  verified_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE cash_counts IS 'Detailed denomination counts for cash drawer';
COMMENT ON COLUMN cash_counts.count_type IS 'When the count was performed';

CREATE INDEX IF NOT EXISTS idx_cash_counts_shift ON cash_counts(shift_id);
CREATE INDEX IF NOT EXISTS idx_cash_counts_type ON cash_counts(count_type);

-- ============================================================================
-- 3. ADD COLUMNS TO REGISTER_SHIFTS FOR ENHANCED TRACKING
-- ============================================================================

-- Add columns for better drawer tracking
ALTER TABLE register_shifts
ADD COLUMN IF NOT EXISTS drawer_status VARCHAR(20) DEFAULT 'closed'
  CHECK (drawer_status IN ('closed', 'open', 'counting', 'reconciling'));

ALTER TABLE register_shifts
ADD COLUMN IF NOT EXISTS total_cash_sales DECIMAL(10,2) DEFAULT 0;

ALTER TABLE register_shifts
ADD COLUMN IF NOT EXISTS total_cash_refunds DECIMAL(10,2) DEFAULT 0;

ALTER TABLE register_shifts
ADD COLUMN IF NOT EXISTS total_paid_out DECIMAL(10,2) DEFAULT 0;

ALTER TABLE register_shifts
ADD COLUMN IF NOT EXISTS total_drops DECIMAL(10,2) DEFAULT 0;

ALTER TABLE register_shifts
ADD COLUMN IF NOT EXISTS total_additions DECIMAL(10,2) DEFAULT 0;

ALTER TABLE register_shifts
ADD COLUMN IF NOT EXISTS blind_close BOOLEAN DEFAULT false;

ALTER TABLE register_shifts
ADD COLUMN IF NOT EXISTS closed_by INTEGER REFERENCES users(id);

-- ============================================================================
-- 4. DRAWER AUDIT LOG
-- Track all drawer open/close events
-- ============================================================================

CREATE TABLE IF NOT EXISTS drawer_audit_log (
  id SERIAL PRIMARY KEY,
  shift_id INTEGER NOT NULL REFERENCES register_shifts(shift_id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  action VARCHAR(30) NOT NULL CHECK (action IN (
    'drawer_opened',
    'drawer_closed',
    'no_sale',
    'cash_count_started',
    'cash_count_completed',
    'shift_started',
    'shift_ended',
    'manager_override',
    'void_approved',
    'refund_approved'
  )),
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE drawer_audit_log IS 'Audit trail for all drawer activities';

CREATE INDEX IF NOT EXISTS idx_drawer_audit_shift ON drawer_audit_log(shift_id);
CREATE INDEX IF NOT EXISTS idx_drawer_audit_action ON drawer_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_drawer_audit_date ON drawer_audit_log(created_at);

-- ============================================================================
-- 5. FUNCTION: Calculate Cash Denomination Total
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_cash_count_total(
  p_bills_100 INTEGER, p_bills_50 INTEGER, p_bills_20 INTEGER,
  p_bills_10 INTEGER, p_bills_5 INTEGER,
  p_coins_200 INTEGER, p_coins_100 INTEGER, p_coins_25 INTEGER,
  p_coins_10 INTEGER, p_coins_5 INTEGER,
  p_rolls_200 INTEGER, p_rolls_100 INTEGER, p_rolls_25 INTEGER,
  p_rolls_10 INTEGER, p_rolls_5 INTEGER
)
RETURNS DECIMAL(10,2) AS $$
BEGIN
  RETURN (
    (COALESCE(p_bills_100, 0) * 100.00) +
    (COALESCE(p_bills_50, 0) * 50.00) +
    (COALESCE(p_bills_20, 0) * 20.00) +
    (COALESCE(p_bills_10, 0) * 10.00) +
    (COALESCE(p_bills_5, 0) * 5.00) +
    (COALESCE(p_coins_200, 0) * 2.00) +
    (COALESCE(p_coins_100, 0) * 1.00) +
    (COALESCE(p_coins_25, 0) * 0.25) +
    (COALESCE(p_coins_10, 0) * 0.10) +
    (COALESCE(p_coins_5, 0) * 0.05) +
    (COALESCE(p_rolls_200, 0) * 50.00) +  -- $2 roll = $50
    (COALESCE(p_rolls_100, 0) * 25.00) +  -- $1 roll = $25
    (COALESCE(p_rolls_25, 0) * 10.00) +   -- 25c roll = $10
    (COALESCE(p_rolls_10, 0) * 5.00) +    -- 10c roll = $5
    (COALESCE(p_rolls_5, 0) * 2.00)       -- 5c roll = $2
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 6. FUNCTION: Calculate Expected Cash for Shift
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_expected_drawer_cash(p_shift_id INTEGER)
RETURNS DECIMAL(10,2) AS $$
DECLARE
  v_opening_cash DECIMAL(10,2);
  v_cash_sales DECIMAL(10,2);
  v_cash_refunds DECIMAL(10,2);
  v_movements DECIMAL(10,2);
BEGIN
  -- Get opening cash
  SELECT opening_cash INTO v_opening_cash
  FROM register_shifts
  WHERE shift_id = p_shift_id;

  -- Get total cash from sales (amount received minus change given)
  SELECT COALESCE(SUM(p.amount - COALESCE(p.change_given, 0)), 0)
  INTO v_cash_sales
  FROM payments p
  JOIN transactions t ON p.transaction_id = t.transaction_id
  WHERE t.shift_id = p_shift_id
    AND p.payment_method = 'cash'
    AND p.status = 'completed'
    AND t.status = 'completed';

  -- Get cash refunds
  SELECT COALESCE(SUM(ABS(p.amount)), 0)
  INTO v_cash_refunds
  FROM payments p
  JOIN transactions t ON p.transaction_id = t.transaction_id
  WHERE t.shift_id = p_shift_id
    AND p.payment_method = 'cash'
    AND (p.status = 'refunded' OR t.status = 'refunded');

  -- Get net cash movements (positive = in, negative = out)
  SELECT COALESCE(SUM(
    CASE
      WHEN movement_type IN ('add', 'float_adjust') THEN amount
      WHEN movement_type IN ('paid_out', 'drop', 'pickup', 'refund') THEN -ABS(amount)
      WHEN movement_type = 'correction' THEN amount
      ELSE 0
    END
  ), 0)
  INTO v_movements
  FROM cash_movements
  WHERE shift_id = p_shift_id;

  RETURN COALESCE(v_opening_cash, 0) + v_cash_sales - v_cash_refunds + v_movements;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. FUNCTION: Get Shift Cash Summary
-- ============================================================================

CREATE OR REPLACE FUNCTION get_shift_cash_summary(p_shift_id INTEGER)
RETURNS TABLE (
  opening_cash DECIMAL(10,2),
  cash_sales DECIMAL(10,2),
  cash_refunds DECIMAL(10,2),
  paid_outs DECIMAL(10,2),
  drops DECIMAL(10,2),
  additions DECIMAL(10,2),
  expected_cash DECIMAL(10,2),
  actual_cash DECIMAL(10,2),
  variance DECIMAL(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rs.opening_cash,
    COALESCE((
      SELECT SUM(p.amount - COALESCE(p.change_given, 0))
      FROM payments p
      JOIN transactions t ON p.transaction_id = t.transaction_id
      WHERE t.shift_id = p_shift_id
        AND p.payment_method = 'cash'
        AND p.status = 'completed'
        AND t.status = 'completed'
    ), 0) as cash_sales,
    COALESCE((
      SELECT SUM(ABS(p.amount))
      FROM payments p
      JOIN transactions t ON p.transaction_id = t.transaction_id
      WHERE t.shift_id = p_shift_id
        AND p.payment_method = 'cash'
        AND (p.status = 'refunded' OR t.status = 'refunded')
    ), 0) as cash_refunds,
    COALESCE((
      SELECT SUM(ABS(amount))
      FROM cash_movements
      WHERE shift_id = p_shift_id AND movement_type = 'paid_out'
    ), 0) as paid_outs,
    COALESCE((
      SELECT SUM(ABS(amount))
      FROM cash_movements
      WHERE shift_id = p_shift_id AND movement_type IN ('drop', 'pickup')
    ), 0) as drops,
    COALESCE((
      SELECT SUM(amount)
      FROM cash_movements
      WHERE shift_id = p_shift_id AND movement_type IN ('add', 'float_adjust')
    ), 0) as additions,
    calculate_expected_drawer_cash(p_shift_id) as expected_cash,
    rs.closing_cash as actual_cash,
    CASE
      WHEN rs.closing_cash IS NOT NULL
      THEN rs.closing_cash - calculate_expected_drawer_cash(p_shift_id)
      ELSE NULL
    END as variance
  FROM register_shifts rs
  WHERE rs.shift_id = p_shift_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. UPDATE TRIGGER: Recalculate shift totals after cash movement
-- ============================================================================

CREATE OR REPLACE FUNCTION update_shift_cash_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the shift's running totals
  UPDATE register_shifts SET
    total_paid_out = COALESCE((
      SELECT SUM(ABS(amount))
      FROM cash_movements
      WHERE shift_id = NEW.shift_id AND movement_type = 'paid_out'
    ), 0),
    total_drops = COALESCE((
      SELECT SUM(ABS(amount))
      FROM cash_movements
      WHERE shift_id = NEW.shift_id AND movement_type IN ('drop', 'pickup')
    ), 0),
    total_additions = COALESCE((
      SELECT SUM(amount)
      FROM cash_movements
      WHERE shift_id = NEW.shift_id AND movement_type IN ('add', 'float_adjust')
    ), 0)
  WHERE shift_id = NEW.shift_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_shift_cash_totals ON cash_movements;

CREATE TRIGGER trigger_update_shift_cash_totals
  AFTER INSERT OR UPDATE OR DELETE ON cash_movements
  FOR EACH ROW
  EXECUTE FUNCTION update_shift_cash_totals();

-- ============================================================================
-- 9. DAILY SUMMARY VIEW
-- ============================================================================

CREATE OR REPLACE VIEW v_daily_drawer_summary AS
SELECT
  DATE(rs.opened_at) as business_date,
  r.register_name,
  rs.shift_id,
  u.first_name || ' ' || u.last_name as cashier_name,
  rs.opened_at,
  rs.closed_at,
  rs.opening_cash,
  rs.closing_cash,
  calculate_expected_drawer_cash(rs.shift_id) as expected_cash,
  CASE
    WHEN rs.closing_cash IS NOT NULL
    THEN rs.closing_cash - calculate_expected_drawer_cash(rs.shift_id)
    ELSE NULL
  END as variance,
  rs.status,
  (SELECT COUNT(*) FROM transactions t WHERE t.shift_id = rs.shift_id AND t.status = 'completed') as transaction_count,
  (SELECT COALESCE(SUM(total_amount), 0) FROM transactions t WHERE t.shift_id = rs.shift_id AND t.status = 'completed') as total_sales
FROM register_shifts rs
JOIN registers r ON rs.register_id = r.register_id
JOIN users u ON rs.user_id = u.id
ORDER BY rs.opened_at DESC;

-- ============================================================================
-- 10. SAFE DROPS SUMMARY VIEW
-- ============================================================================

CREATE OR REPLACE VIEW v_safe_drops AS
SELECT
  DATE(cm.created_at) as drop_date,
  cm.id as movement_id,
  r.register_name,
  u.first_name || ' ' || u.last_name as performed_by,
  approver.first_name || ' ' || approver.last_name as approved_by,
  ABS(cm.amount) as amount,
  cm.reason,
  cm.reference_number,
  cm.created_at
FROM cash_movements cm
JOIN register_shifts rs ON cm.shift_id = rs.shift_id
JOIN registers r ON rs.register_id = r.register_id
JOIN users u ON cm.user_id = u.id
LEFT JOIN users approver ON cm.approved_by = approver.id
WHERE cm.movement_type IN ('drop', 'pickup')
ORDER BY cm.created_at DESC;
