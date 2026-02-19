-- Migration: 61_global_skulytics_products_v2.sql
-- Description: Add 7 new columns to global_skulytics_products for real API shape
-- Dependencies: 10_global_skulytics_products.sql
-- Rollback: 61_global_skulytics_products_v2.down.sql

ALTER TABLE global_skulytics_products
  ADD COLUMN IF NOT EXISTS is_in_stock      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS umrp             NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS competitor_pricing JSONB,
  ADD COLUMN IF NOT EXISTS brand_slug       TEXT,
  ADD COLUMN IF NOT EXISTS primary_image    TEXT,
  ADD COLUMN IF NOT EXISTS product_link     TEXT,
  ADD COLUMN IF NOT EXISTS is_multi_brand   BOOLEAN DEFAULT FALSE;
