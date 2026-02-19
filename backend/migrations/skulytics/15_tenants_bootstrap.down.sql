-- Migration: 15_tenants_bootstrap.down.sql
-- Description: Rollback bootstrap tenants table
-- Dependencies: Must run BEFORE 10_global_skulytics_products.down.sql
--              Must run AFTER 20_tenant_product_overrides.down.sql
-- WARNING: Drops the tenants table and all data. tenant_product_overrides
--          must be dropped first (migration 20 down) or CASCADE will remove them.

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;
DROP TABLE IF EXISTS tenants CASCADE;
