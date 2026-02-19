-- Migration: 10_global_skulytics_products.sql
-- Description: Global Skulytics product cache shared across all tenants
-- Dependencies: 00_skulytics_extensions.sql
-- Rollback: 10_global_skulytics_products.down.sql

-- ============================================================
-- 10: GLOBAL SKULYTICS PRODUCTS (shared across all tenants)
-- ============================================================

CREATE TABLE IF NOT EXISTS global_skulytics_products (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  skulytics_id         TEXT NOT NULL UNIQUE,
  api_schema_version   TEXT NOT NULL DEFAULT 'v1',

  sku                  TEXT NOT NULL,
  upc                  TEXT,

  brand                TEXT NOT NULL,
  model_number         TEXT,
  model_name           TEXT,
  category_slug        TEXT,
  category_path        TEXT[],

  msrp                 NUMERIC(12,2),
  map_price            NUMERIC(12,2),
  currency             CHAR(3) NOT NULL DEFAULT 'CAD',

  weight_kg            NUMERIC(10,3),
  width_cm             NUMERIC(10,2),
  height_cm            NUMERIC(10,2),
  depth_cm             NUMERIC(10,2),

  variant_group_id     TEXT,
  is_variant_parent    BOOLEAN NOT NULL DEFAULT FALSE,
  parent_skulytics_id  TEXT,
  variant_type         TEXT,
  variant_value        TEXT,

  is_discontinued      BOOLEAN NOT NULL DEFAULT FALSE,
  discontinued_at      TIMESTAMPTZ,
  is_stale             BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at       TIMESTAMPTZ NOT NULL,
  sync_run_id          UUID,

  raw_json             JSONB NOT NULL,
  specs                JSONB,
  images               JSONB,
  warranty             JSONB,
  buyback_value        NUMERIC(12,2),

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: auto-update updated_at on row change
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gsp_updated_at'
  ) THEN
    CREATE TRIGGER trg_gsp_updated_at
    BEFORE UPDATE ON global_skulytics_products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gsp_sku
  ON global_skulytics_products (sku);
CREATE INDEX IF NOT EXISTS idx_gsp_upc
  ON global_skulytics_products (upc) WHERE upc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gsp_brand
  ON global_skulytics_products (brand);
CREATE INDEX IF NOT EXISTS idx_gsp_category_slug
  ON global_skulytics_products (category_slug) WHERE category_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gsp_variant_group
  ON global_skulytics_products (variant_group_id) WHERE variant_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gsp_stale
  ON global_skulytics_products (is_stale, last_synced_at);
CREATE INDEX IF NOT EXISTS idx_gsp_discontinued
  ON global_skulytics_products (is_discontinued) WHERE is_discontinued = TRUE;
CREATE INDEX IF NOT EXISTS idx_gsp_raw_gin
  ON global_skulytics_products USING GIN (raw_json);
CREATE INDEX IF NOT EXISTS idx_gsp_specs_gin
  ON global_skulytics_products USING GIN (specs);
