-- Migration 148: Quote fraud scoring + expand alert_type constraint
-- Adds quote_risk_score to quotations and fixes alert_type CHECK to support
-- discount, quote_conversion, and code10 alert types.

BEGIN;

-- 1. Add risk score column to quotations for fraud tracking on conversions
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quote_risk_score INTEGER DEFAULT 0;

-- 2. Expand fraud_alerts.alert_type CHECK constraint
--    The original constraint only allowed: transaction, refund, void, pattern, chargeback
--    Need to add: discount, quote_conversion, code10
ALTER TABLE fraud_alerts DROP CONSTRAINT IF EXISTS fraud_alerts_alert_type_check;
ALTER TABLE fraud_alerts ADD CONSTRAINT fraud_alerts_alert_type_check
  CHECK (alert_type IN ('transaction', 'refund', 'void', 'pattern', 'chargeback', 'discount', 'quote_conversion', 'code10'));

COMMIT;
