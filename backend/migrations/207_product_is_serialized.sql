-- Migration 207: Add is_serialized flag to products
-- Enables gating serial number prompts across POS, quotes, invoices, delivery, and RA modules

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_serialized BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark products that already have serials registered
UPDATE products SET is_serialized = true
WHERE id IN (SELECT DISTINCT product_id FROM product_serials);

-- Partial index for efficient filtering of serialized products
CREATE INDEX IF NOT EXISTS idx_products_is_serialized
  ON products (is_serialized) WHERE is_serialized = true;
