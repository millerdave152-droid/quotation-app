-- Rollback: 30_skulytics_import_matches.down.sql
-- Description: Drop skulytics_import_matches table and indexes
-- Dependencies: must run BEFORE 10 rollback

DROP INDEX IF EXISTS idx_sim_tenant_status;
DROP INDEX IF EXISTS idx_sim_skulytics;
DROP INDEX IF EXISTS idx_sim_internal;

DROP TABLE IF EXISTS skulytics_import_matches CASCADE;
