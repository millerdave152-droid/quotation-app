-- ============================================================================
-- Migration 098: Fraud Detection & Prevention System
-- Created: 2026-02-07
-- Description: Tables for fraud detection rules, alerts, review queue,
--              incidents, audit logging, refund approvals, and chargebacks
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FRAUD RULES — Configurable detection rules
-- ============================================================================

CREATE TABLE IF NOT EXISTS fraud_rules (
  id SERIAL PRIMARY KEY,
  rule_code VARCHAR(50) UNIQUE NOT NULL,
  rule_name VARCHAR(100) NOT NULL,
  description TEXT,
  rule_type VARCHAR(30) NOT NULL CHECK (rule_type IN ('velocity', 'amount', 'pattern', 'employee', 'customer')),
  conditions JSONB NOT NULL DEFAULT '{}',
  risk_points INTEGER NOT NULL DEFAULT 0 CHECK (risk_points >= 0 AND risk_points <= 100),
  severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  action VARCHAR(20) NOT NULL DEFAULT 'alert' CHECK (action IN ('alert', 'block', 'require_approval')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_rules_type ON fraud_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_fraud_rules_active ON fraud_rules(is_active);

-- ============================================================================
-- 2. FRAUD ALERTS — Generated when a rule triggers
-- ============================================================================

CREATE TABLE IF NOT EXISTS fraud_alerts (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER REFERENCES transactions(transaction_id) ON DELETE SET NULL,
  return_id INTEGER REFERENCES pos_returns(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  rule_id INTEGER NOT NULL REFERENCES fraud_rules(id),
  risk_score INTEGER NOT NULL DEFAULT 0,
  alert_type VARCHAR(30) NOT NULL CHECK (alert_type IN ('transaction', 'refund', 'void', 'pattern', 'chargeback')),
  severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details JSONB DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'confirmed_fraud', 'false_positive', 'dismissed')),
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_alerts_transaction ON fraud_alerts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_return ON fraud_alerts(return_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_user ON fraud_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_customer ON fraud_alerts(customer_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_status ON fraud_alerts(status);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_severity ON fraud_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_created ON fraud_alerts(created_at DESC);

-- ============================================================================
-- 3. FRAUD REVIEW QUEUE — Manager review assignments
-- ============================================================================

CREATE TABLE IF NOT EXISTS fraud_review_queue (
  id SERIAL PRIMARY KEY,
  alert_id INTEGER NOT NULL UNIQUE REFERENCES fraud_alerts(id) ON DELETE CASCADE,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved')),
  resolution VARCHAR(30) CHECK (resolution IN ('confirmed_fraud', 'false_positive', 'needs_investigation')),
  resolution_notes TEXT,
  assigned_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_review_status ON fraud_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_fraud_review_assigned ON fraud_review_queue(assigned_to);
CREATE INDEX IF NOT EXISTS idx_fraud_review_priority ON fraud_review_queue(priority DESC);

-- ============================================================================
-- 4. FRAUD INCIDENTS — Confirmed fraud cases
-- ============================================================================

CREATE TABLE IF NOT EXISTS fraud_incidents (
  id SERIAL PRIMARY KEY,
  incident_number VARCHAR(20) UNIQUE NOT NULL,
  alert_ids INTEGER[] DEFAULT '{}',
  employee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  incident_type VARCHAR(30) NOT NULL CHECK (incident_type IN ('employee_theft', 'return_fraud', 'chargeback_fraud', 'discount_abuse', 'collusion')),
  total_loss DECIMAL(10,2) DEFAULT 0,
  description TEXT,
  evidence JSONB DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'confirmed', 'resolved', 'closed')),
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_incidents_status ON fraud_incidents(status);
CREATE INDEX IF NOT EXISTS idx_fraud_incidents_employee ON fraud_incidents(employee_id);
CREATE INDEX IF NOT EXISTS idx_fraud_incidents_customer ON fraud_incidents(customer_id);
CREATE INDEX IF NOT EXISTS idx_fraud_incidents_type ON fraud_incidents(incident_type);

-- ============================================================================
-- 5. AUDIT LOG — Extend existing audit_log with fraud-related columns
-- ============================================================================

-- The audit_log table already exists; add missing columns for fraud detection
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES register_shifts(shift_id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS risk_score INTEGER;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_shift ON audit_log(shift_id);

-- ============================================================================
-- 6. REFUND APPROVALS — Approval workflow for refunds above threshold
-- ============================================================================

CREATE TABLE IF NOT EXISTS refund_approvals (
  id SERIAL PRIMARY KEY,
  return_id INTEGER NOT NULL REFERENCES pos_returns(id) ON DELETE CASCADE,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  refund_amount DECIMAL(10,2) NOT NULL,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'denied')),
  denial_reason TEXT,
  risk_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refund_approvals_return ON refund_approvals(return_id);
CREATE INDEX IF NOT EXISTS idx_refund_approvals_status ON refund_approvals(approval_status);

-- ============================================================================
-- 7. CHARGEBACK CASES — Payment dispute tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS chargeback_cases (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(transaction_id) ON DELETE CASCADE,
  payment_id INTEGER NOT NULL REFERENCES payments(payment_id) ON DELETE CASCADE,
  case_number VARCHAR(50),
  amount DECIMAL(10,2) NOT NULL,
  reason_code VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'responding', 'won', 'lost', 'expired')),
  deadline DATE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chargeback_transaction ON chargeback_cases(transaction_id);
CREATE INDEX IF NOT EXISTS idx_chargeback_status ON chargeback_cases(status);
CREATE INDEX IF NOT EXISTS idx_chargeback_deadline ON chargeback_cases(deadline);

-- ============================================================================
-- 8. CHARGEBACK EVIDENCE — Evidence attachments for disputes
-- ============================================================================

CREATE TABLE IF NOT EXISTS chargeback_evidence (
  id SERIAL PRIMARY KEY,
  chargeback_id INTEGER NOT NULL REFERENCES chargeback_cases(id) ON DELETE CASCADE,
  evidence_type VARCHAR(30) NOT NULL CHECK (evidence_type IN ('receipt', 'signature', 'delivery_proof', 'communication', 'cctv')),
  file_path TEXT,
  description TEXT,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chargeback_evidence_case ON chargeback_evidence(chargeback_id);

-- ============================================================================
-- 9. EMPLOYEE FRAUD METRICS — Materialized view for pattern detection
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS employee_fraud_metrics AS
SELECT
  u.id AS user_id,
  u.first_name || ' ' || u.last_name AS employee_name,
  u.role,
  COUNT(DISTINCT t.transaction_id) AS total_transactions,
  COUNT(DISTINCT t.transaction_id) FILTER (WHERE t.status = 'voided') AS void_count,
  COUNT(DISTINCT r.id) AS refund_count,
  COALESCE(SUM(t.discount_amount), 0) AS total_discounts_given,
  COALESCE(AVG(t.discount_amount) FILTER (WHERE t.discount_amount > 0), 0) AS avg_discount,
  COUNT(*) FILTER (WHERE t.discount_amount > 0) AS discount_transaction_count,
  COALESCE(SUM(r.total_refund_amount), 0) AS total_refund_amount,
  COUNT(DISTINCT fa.id) AS fraud_alert_count,
  MAX(t.created_at) AS last_transaction_at
FROM users u
LEFT JOIN transactions t ON t.user_id = u.id AND t.created_at > NOW() - INTERVAL '90 days'
LEFT JOIN pos_returns r ON r.processed_by = u.id AND r.created_at > NOW() - INTERVAL '90 days'
LEFT JOIN fraud_alerts fa ON fa.user_id = u.id AND fa.created_at > NOW() - INTERVAL '90 days'
WHERE u.is_active = true
GROUP BY u.id, u.first_name, u.last_name, u.role;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_fraud_metrics_user ON employee_fraud_metrics(user_id);

-- ============================================================================
-- 10. SEED DEFAULT FRAUD RULES
-- ============================================================================

INSERT INTO fraud_rules (rule_code, rule_name, description, rule_type, conditions, risk_points, severity, action) VALUES
  ('velocity_refund', 'Refund Velocity', 'Too many refunds in a single shift', 'velocity',
   '{"max_count": 3, "window_type": "shift", "target": "refund"}', 30, 'medium', 'alert'),

  ('velocity_void', 'Void Velocity', 'Too many voids in a single shift', 'velocity',
   '{"max_count": 2, "window_type": "shift", "target": "void"}', 25, 'medium', 'alert'),

  ('amount_high_txn', 'High Transaction Amount', 'Transaction exceeds $5,000 threshold', 'amount',
   '{"threshold": 5000, "target": "transaction"}', 15, 'low', 'alert'),

  ('amount_high_refund', 'High Refund Amount', 'Refund exceeds $1,000 threshold', 'amount',
   '{"threshold": 1000, "target": "refund"}', 25, 'medium', 'require_approval'),

  ('amount_high_discount', 'High Discount', 'Discount exceeds 30% of transaction', 'amount',
   '{"threshold_percent": 30, "target": "discount"}', 20, 'medium', 'alert'),

  ('pattern_self_refund', 'Self-Refund', 'Employee refunding their own sale', 'employee',
   '{"pattern": "self_refund"}', 40, 'high', 'block'),

  ('pattern_void_complete', 'Void Completed Transaction', 'Voiding a completed transaction', 'employee',
   '{"pattern": "void_completed"}', 20, 'medium', 'require_approval'),

  ('pattern_repeat_return', 'Repeat Returns', 'Customer with more than 3 returns in 30 days', 'customer',
   '{"max_returns": 3, "window_days": 30}', 35, 'high', 'alert'),

  ('pattern_no_receipt', 'No Receipt Return', 'Return processed without receipt', 'customer',
   '{"pattern": "no_receipt_return"}', 15, 'low', 'alert'),

  ('chargeback_history', 'Chargeback History', 'Customer has prior chargeback on file', 'customer',
   '{"pattern": "prior_chargeback"}', 30, 'medium', 'alert')

ON CONFLICT (rule_code) DO NOTHING;

-- ============================================================================
-- 11. PERMISSIONS
-- ============================================================================

INSERT INTO permissions (code, name, description, category) VALUES
  ('fraud.alerts.view', 'View Fraud Alerts', 'View fraud alerts and risk scores', 'fraud'),
  ('fraud.alerts.review', 'Review Fraud Alerts', 'Review and resolve fraud alerts', 'fraud'),
  ('fraud.incidents.manage', 'Manage Fraud Incidents', 'Create and manage fraud incident cases', 'fraud'),
  ('fraud.chargebacks.manage', 'Manage Chargebacks', 'Track and respond to chargeback cases', 'fraud'),
  ('fraud.rules.manage', 'Manage Fraud Rules', 'Configure fraud detection rules', 'fraud'),
  ('fraud.employee_metrics.view', 'View Employee Metrics', 'View employee fraud risk metrics', 'fraud'),
  ('audit.logs.view', 'View Audit Logs', 'View system-wide audit trail', 'audit')
ON CONFLICT (code) DO NOTHING;

-- Assign fraud.* and audit.* permissions to admin and manager roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('admin', 'manager')
  AND p.category IN ('fraud', 'audit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
