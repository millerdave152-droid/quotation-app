-- Migration 157: Extend audit_log with PCI DSS columns
-- Phase 3 fraud infrastructure

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS event_category VARCHAR(30);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS severity VARCHAR(10) DEFAULT 'info';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS terminal_id VARCHAR(50);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS location_id INTEGER;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS transaction_id BIGINT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_log_event_category ON audit_log(event_category);
CREATE INDEX IF NOT EXISTS idx_audit_log_severity ON audit_log(severity) WHERE severity != 'info';
CREATE INDEX IF NOT EXISTS idx_audit_log_terminal ON audit_log(terminal_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_location ON audit_log(location_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_transaction ON audit_log(transaction_id);
