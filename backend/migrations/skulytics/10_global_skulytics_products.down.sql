-- Rollback: 10_global_skulytics_products.down.sql
-- Description: Drop global_skulytics_products table and all associated indexes/triggers
-- Dependencies: must run AFTER 20, 30, 40, 50 rollbacks

-- Drop trigger first
DROP TRIGGER IF EXISTS trg_gsp_updated_at ON global_skulytics_products;

-- Drop indexes (CASCADE from table drop covers these, but explicit for clarity)
DROP INDEX IF EXISTS idx_gsp_sku;
DROP INDEX IF EXISTS idx_gsp_upc;
DROP INDEX IF EXISTS idx_gsp_brand;
DROP INDEX IF EXISTS idx_gsp_category_slug;
DROP INDEX IF EXISTS idx_gsp_variant_group;
DROP INDEX IF EXISTS idx_gsp_stale;
DROP INDEX IF EXISTS idx_gsp_discontinued;
DROP INDEX IF EXISTS idx_gsp_raw_gin;
DROP INDEX IF EXISTS idx_gsp_specs_gin;

-- Drop table
DROP TABLE IF EXISTS global_skulytics_products CASCADE;
