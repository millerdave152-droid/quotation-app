-- ============================================================================
-- Rollback Migration 121: Consumer Electronics Integration Support
-- ============================================================================
-- Removes CE integration columns added by 121_ce_integration_support.sql
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Products table — drop CE columns and indexes
-- --------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_products_data_source;
DROP INDEX IF EXISTS idx_products_icecat_product_id;

ALTER TABLE products
  DROP COLUMN IF EXISTS ce_specs,
  DROP COLUMN IF EXISTS icecat_product_id,
  DROP COLUMN IF EXISTS data_source;

-- --------------------------------------------------------------------------
-- 2. Competitor prices table — drop source tracking columns and indexes
-- --------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_competitor_prices_last_fetched_at;
DROP INDEX IF EXISTS idx_competitor_prices_pricing_source;

ALTER TABLE competitor_prices
  DROP COLUMN IF EXISTS last_fetched_at,
  DROP COLUMN IF EXISTS pricing_source;

-- --------------------------------------------------------------------------
-- 3. Global Skulytics products — drop source tracking columns
-- --------------------------------------------------------------------------
ALTER TABLE global_skulytics_products
  DROP COLUMN IF EXISTS last_fetched_at,
  DROP COLUMN IF EXISTS pricing_source;

COMMIT;
