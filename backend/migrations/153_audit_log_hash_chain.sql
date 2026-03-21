-- Migration 153: Hash-chain integrity for audit_log
-- Adds prev_hash/entry_hash columns and immutability trigger

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS prev_hash VARCHAR(64);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entry_hash VARCHAR(64);

-- Immutability trigger: prevent UPDATE/DELETE on audit_log
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log entries are immutable — UPDATE and DELETE are prohibited';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
