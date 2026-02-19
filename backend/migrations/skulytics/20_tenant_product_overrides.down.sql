-- Rollback: 20_tenant_product_overrides.down.sql
-- Description: Drop tenant_product_overrides table and all associated indexes/triggers
-- Dependencies: must run BEFORE 10 rollback

DROP TRIGGER IF EXISTS trg_tpo_updated_at ON tenant_product_overrides;

DROP INDEX IF EXISTS idx_tpo_tenant;
DROP INDEX IF EXISTS idx_tpo_skulytics;
DROP INDEX IF EXISTS idx_tpo_enabled;

DROP TABLE IF EXISTS tenant_product_overrides CASCADE;
