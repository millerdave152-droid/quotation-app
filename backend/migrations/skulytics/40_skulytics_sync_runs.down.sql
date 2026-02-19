-- Rollback: 40_skulytics_sync_runs.down.sql
-- Description: Drop sync run tables and remove deferred FK from global_skulytics_products
-- Dependencies: must run BEFORE 10 rollback

-- Remove deferred FK from global_skulytics_products first
ALTER TABLE global_skulytics_products
  DROP CONSTRAINT IF EXISTS fk_gsp_sync_run;

-- Drop indexes
DROP INDEX IF EXISTS idx_sssl_run_status;
DROP INDEX IF EXISTS idx_sssl_failed;
DROP INDEX IF EXISTS idx_ssr_status_started;
DROP INDEX IF EXISTS idx_ssr_type_started;

-- Drop tables (sku_log first due to FK)
DROP TABLE IF EXISTS skulytics_sync_sku_log CASCADE;
DROP TABLE IF EXISTS skulytics_sync_runs CASCADE;
