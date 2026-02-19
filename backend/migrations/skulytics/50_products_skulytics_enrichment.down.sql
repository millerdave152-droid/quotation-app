-- Rollback: 50_products_skulytics_enrichment.down.sql
-- Description: Remove Skulytics enrichment columns from products table (safe, no data destruction)
-- Dependencies: must run BEFORE 10 rollback

-- Drop index first
DROP INDEX IF EXISTS idx_products_skulytics_id;

-- Remove enrichment columns
-- NOTE: These columns may contain data. Dropping them is destructive to enrichment
-- metadata only — it does NOT delete products themselves.
ALTER TABLE products DROP COLUMN IF EXISTS skulytics_override;
ALTER TABLE products DROP COLUMN IF EXISTS skulytics_enriched_at;
ALTER TABLE products DROP COLUMN IF EXISTS skulytics_imported_at;
ALTER TABLE products DROP COLUMN IF EXISTS skulytics_id;
