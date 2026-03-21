-- Migration 150: New fraud rules + evidence snapshot + Code 10 support
-- Seeds 3 detection rules, 1 manual Code 10 rule, adds evidence_snapshot
-- column to transactions, and grants code10 permission to POS roles.

BEGIN;

-- ============================================================================
-- 1. New fraud detection rules
-- ============================================================================

-- Card not present on in-store transaction
INSERT INTO fraud_rules (rule_code, rule_name, description, rule_type, conditions, risk_points, severity, action)
VALUES (
  'card_not_present',
  'Card Not Present',
  'Card-not-present on in-store transaction (manual/keyed entry)',
  'pattern',
  '{"entry_methods": ["manual", "keyed", "online"]}',
  25,
  'medium',
  'alert'
) ON CONFLICT (rule_code) DO NOTHING;

-- Split tender across 3+ payment methods
INSERT INTO fraud_rules (rule_code, rule_name, description, rule_type, conditions, risk_points, severity, action)
VALUES (
  'split_tender_many',
  'Split Tender 3+ Methods',
  'Transaction split across 3 or more different payment methods',
  'pattern',
  '{"min_methods": 3}',
  20,
  'medium',
  'alert'
) ON CONFLICT (rule_code) DO NOTHING;

-- Transaction outside business hours
INSERT INTO fraud_rules (rule_code, rule_name, description, rule_type, conditions, risk_points, severity, action)
VALUES (
  'outside_business_hours',
  'Outside Business Hours',
  'Transaction processed before 8 AM or after 10 PM',
  'pattern',
  '{"start_hour": 8, "end_hour": 22}',
  15,
  'low',
  'alert'
) ON CONFLICT (rule_code) DO NOTHING;

-- Manual Code 10 rule (used by silent alert endpoint)
INSERT INTO fraud_rules (rule_code, rule_name, description, rule_type, conditions, risk_points, severity, action)
VALUES (
  'manual_code10',
  'Code 10 - Manual Alert',
  'Cashier-initiated silent fraud alert (Code 10)',
  'employee',
  '{"manual": true}',
  0,
  'critical',
  'alert'
) ON CONFLICT (rule_code) DO NOTHING;

-- ============================================================================
-- 2. Evidence snapshot on transactions for chargeback defense
-- ============================================================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS evidence_snapshot JSONB;

COMMENT ON COLUMN transactions.evidence_snapshot IS
  'Auto-captured at transaction completion: receipt ref, employee, shift, payments, customer, serial numbers';

-- ============================================================================
-- 3. Code 10 permission
-- ============================================================================

INSERT INTO permissions (code, name, description, category)
VALUES ('fraud.code10', 'Code 10 Silent Alert', 'Trigger silent fraud alert from POS', 'fraud')
ON CONFLICT (code) DO NOTHING;

-- Grant to all POS roles (every employee should be able to trigger Code 10)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('admin', 'manager', 'senior_manager', 'user', 'salesperson')
  AND p.code = 'fraud.code10'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
