-- Migration 103: Discount fraud detection rules + approved_by tracking
-- Adds 3 new fraud rules for discount abuse patterns
-- Adds approved_by column to discount_transactions for escalation tracking

-- ============================================================================
-- 1. Add approved_by column to discount_transactions
-- ============================================================================
ALTER TABLE discount_transactions
  ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id);

-- ============================================================================
-- 2. Add 3 new fraud rules for discount abuse patterns
-- ============================================================================

-- Rule 1: Employee consistently maxing their discount tier limit
-- Triggers when an employee applies max or near-max discounts repeatedly
INSERT INTO fraud_rules (rule_code, rule_name, rule_type, description, conditions, risk_points, severity, action, is_active)
VALUES (
  'discount_max_pattern',
  'Discount Tier Maxing Pattern',
  'pattern',
  'Employee repeatedly applies discounts at or near their tier maximum within a rolling window',
  '{"window_hours": 168, "min_transactions": 5, "near_max_threshold_pct": 90}',
  35,
  'medium',
  'alert',
  true
)
ON CONFLICT (rule_code) DO NOTHING;

-- Rule 2: Discount applied then transaction voided shortly after
-- Potential scheme: apply discount, void, pocket the difference
INSERT INTO fraud_rules (rule_code, rule_name, rule_type, description, conditions, risk_points, severity, action, is_active)
VALUES (
  'discount_void_pattern',
  'Discount Then Void Pattern',
  'pattern',
  'Transaction with discount is voided within a short time window by the same employee',
  '{"void_window_minutes": 60, "min_discount_pct": 5}',
  50,
  'high',
  'alert',
  true
)
ON CONFLICT (rule_code) DO NOTHING;

-- Rule 3: High ratio of discounted items to refunds per employee
-- Employee gives discounts then processes refunds at full price
INSERT INTO fraud_rules (rule_code, rule_name, rule_type, description, conditions, risk_points, severity, action, is_active)
VALUES (
  'discount_refund_ratio',
  'Discount to Refund Ratio',
  'employee',
  'Employee has unusually high ratio of discounted transactions followed by refunds',
  '{"window_days": 30, "min_discount_txns": 3, "refund_ratio_threshold": 0.4}',
  45,
  'high',
  'require_approval',
  true
)
ON CONFLICT (rule_code) DO NOTHING;

-- ============================================================================
-- 3. Add discount-related permissions
-- ============================================================================
INSERT INTO permissions (code, name, description, category)
VALUES
  ('discount_audit_view', 'View Discount Audit', 'View discount audit trail and transaction history', 'discount'),
  ('discount_fraud_review', 'Review Discount Fraud', 'Review discount fraud alerts and patterns', 'fraud')
ON CONFLICT (code) DO NOTHING;

-- Grant discount permissions to admin (role_id=1) and manager (role_id=2)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code IN ('discount_audit_view', 'discount_fraud_review')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE code IN ('discount_audit_view', 'discount_fraud_review')
ON CONFLICT DO NOTHING;
