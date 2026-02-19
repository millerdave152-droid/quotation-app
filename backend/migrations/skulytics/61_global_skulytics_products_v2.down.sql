-- Rollback: 61_global_skulytics_products_v2.down.sql

ALTER TABLE global_skulytics_products
  DROP COLUMN IF EXISTS is_in_stock,
  DROP COLUMN IF EXISTS umrp,
  DROP COLUMN IF EXISTS competitor_pricing,
  DROP COLUMN IF EXISTS brand_slug,
  DROP COLUMN IF EXISTS primary_image,
  DROP COLUMN IF EXISTS product_link,
  DROP COLUMN IF EXISTS is_multi_brand;
