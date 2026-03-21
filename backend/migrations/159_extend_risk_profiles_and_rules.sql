-- Migration 159: Extend employee_risk_profiles with metrics/z-scores, fraud_rules with weight/parameters
-- Phase 3 fraud infrastructure

-- employee_risk_profiles: add rolling metric columns + z-scores
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS location_id INTEGER;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS period_end DATE;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS total_transactions INTEGER DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS total_sales_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS avg_transaction_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS void_count INTEGER DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS void_rate DECIMAL(5,4) DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS refund_count INTEGER DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS refund_rate DECIMAL(5,4) DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS refund_total DECIMAL(12,2) DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS discount_count INTEGER DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS discount_rate DECIMAL(5,4) DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS avg_discount_percent DECIMAL(5,2) DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS max_discount_percent DECIMAL(5,2) DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS manual_entry_count INTEGER DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS no_sale_drawer_opens INTEGER DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS price_override_count INTEGER DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS fallback_swipe_count INTEGER DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS void_rate_zscore DECIMAL(6,3) DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS refund_rate_zscore DECIMAL(6,3) DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS discount_rate_zscore DECIMAL(6,3) DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0;
ALTER TABLE employee_risk_profiles ADD COLUMN IF NOT EXISTS flagged_patterns JSONB DEFAULT '{}';

-- fraud_rules: add weight, parameters, location_overrides, created_by columns
ALTER TABLE fraud_rules ADD COLUMN IF NOT EXISTS weight INTEGER DEFAULT 0;
ALTER TABLE fraud_rules ADD COLUMN IF NOT EXISTS parameters JSONB DEFAULT '{}';
ALTER TABLE fraud_rules ADD COLUMN IF NOT EXISTS location_overrides JSONB DEFAULT '{}';
ALTER TABLE fraud_rules ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);

-- Seed 10 new rules for Phase 3 pattern detection
INSERT INTO fraud_rules (rule_code, rule_name, rule_type, description, risk_points, severity, is_active, conditions, weight, parameters)
VALUES
  ('card_velocity_5min', 'Card Velocity (5min)', 'velocity', 'Same card used 3+ times in 5 minutes', 15, 'high', true, '{}', 15, '{"max_count": 3, "window_seconds": 300, "applies_to": "card"}'),
  ('terminal_velocity_2min', 'Terminal Velocity (2min)', 'velocity', '5+ transactions on same terminal in 2 minutes', 10, 'medium', true, '{}', 10, '{"max_count": 5, "window_seconds": 120, "applies_to": "terminal"}'),
  ('amount_anomaly', 'Amount Anomaly', 'amount', 'Transaction amount deviates >2.5 standard deviations from category mean', 15, 'medium', true, '{}', 15, '{"zscore_threshold": 2.5, "category_specific": true}'),
  ('high_value_threshold', 'High Value Threshold', 'amount', 'Transaction exceeds $1000 CAD', 10, 'medium', true, '{}', 10, '{"threshold_cad": 1000, "requires_manager": true}'),
  ('bin_prepaid_flag', 'BIN Prepaid/Foreign Flag', 'pattern', 'Prepaid or foreign-issued card detected', 8, 'low', true, '{}', 8, '{"flag_prepaid": true, "flag_foreign": true}'),
  ('off_hours_activity', 'Off-Hours Activity', 'pattern', 'Transaction outside business hours (10 PM - 6 AM)', 10, 'medium', true, '{}', 10, '{"start_hour": 22, "end_hour": 6}'),
  ('decline_velocity', 'Decline Velocity', 'velocity', '3+ declines on same card in 10 minutes', 12, 'high', true, '{}', 12, '{"max_declines": 3, "window_seconds": 600}'),
  ('split_transaction', 'Split Transaction', 'pattern', '3+ small transactions in 30 minutes suggesting split to avoid thresholds', 10, 'medium', true, '{}', 10, '{"window_minutes": 30, "max_splits": 3}'),
  ('card_testing', 'Card Testing', 'pattern', '3+ small-amount (<$5) attempts in 5 minutes suggesting card testing', 15, 'high', true, '{}', 15, '{"small_amount_threshold": 5, "min_attempts": 3, "window_seconds": 300}'),
  ('geographic_anomaly', 'Geographic Anomaly', 'pattern', 'Same card used at locations >100km apart within 30 minutes', 12, 'high', true, '{}', 12, '{"impossible_travel_minutes": 30, "min_distance_km": 100}')
ON CONFLICT (rule_code) DO NOTHING;
