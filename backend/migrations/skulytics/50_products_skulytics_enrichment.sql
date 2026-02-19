-- Migration: 50_products_skulytics_enrichment.sql
-- Description: Add Skulytics enrichment columns to existing products table
-- Dependencies: 10_global_skulytics_products.sql
-- Rollback: 50_products_skulytics_enrichment.down.sql

-- ============================================================
-- 50: PRODUCTS TABLE ENRICHMENT COLUMNS
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS skulytics_id
    TEXT REFERENCES global_skulytics_products(skulytics_id);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS skulytics_imported_at TIMESTAMPTZ;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS skulytics_enriched_at TIMESTAMPTZ;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS skulytics_override
    BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_products_skulytics_id
  ON products (skulytics_id) WHERE skulytics_id IS NOT NULL;
