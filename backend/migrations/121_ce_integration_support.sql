-- ============================================================================
-- Migration 121: Consumer Electronics Integration Support
-- ============================================================================
-- Adds CE data-source columns to products table (Icecat / CE API integration),
-- and enriches competitor_prices + global_skulytics_products for automated
-- price-fetching workflows.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Products table — CE integration columns
-- --------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS data_source VARCHAR(20) DEFAULT 'manual'
    CHECK (data_source IN ('manual', 'icecat', 'ce_api', 'skulytics')),
  ADD COLUMN IF NOT EXISTS icecat_product_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ce_specs JSONB;

-- Index for Icecat lookups
CREATE INDEX IF NOT EXISTS idx_products_icecat_product_id
  ON products (icecat_product_id) WHERE icecat_product_id IS NOT NULL;

-- Index for data_source filtering
CREATE INDEX IF NOT EXISTS idx_products_data_source
  ON products (data_source) WHERE data_source <> 'manual';

-- --------------------------------------------------------------------------
-- 2. Competitor prices table — source tracking columns
-- --------------------------------------------------------------------------
ALTER TABLE competitor_prices
  ADD COLUMN IF NOT EXISTS pricing_source VARCHAR(50) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_fetched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_competitor_prices_pricing_source
  ON competitor_prices (pricing_source);

CREATE INDEX IF NOT EXISTS idx_competitor_prices_last_fetched_at
  ON competitor_prices (last_fetched_at) WHERE last_fetched_at IS NOT NULL;

-- --------------------------------------------------------------------------
-- 3. Global Skulytics products — source tracking columns
-- --------------------------------------------------------------------------
ALTER TABLE global_skulytics_products
  ADD COLUMN IF NOT EXISTS pricing_source VARCHAR(50),
  ADD COLUMN IF NOT EXISTS last_fetched_at TIMESTAMPTZ;

COMMIT;
