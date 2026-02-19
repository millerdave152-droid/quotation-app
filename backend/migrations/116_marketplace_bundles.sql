-- Migration 116: Marketplace Bundle Manager
-- Extends existing product_bundles table + creates bundle_components

-- Add missing columns to product_bundles
ALTER TABLE product_bundles ADD COLUMN IF NOT EXISTS bundle_sku VARCHAR(100);
ALTER TABLE product_bundles ADD COLUMN IF NOT EXISTS bundle_price DECIMAL(10,2);
ALTER TABLE product_bundles ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE product_bundles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create unique index on bundle_sku (only for non-null values since existing rows won't have it)
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_bundles_sku ON product_bundles (bundle_sku) WHERE bundle_sku IS NOT NULL;

-- Create bundle_components table
CREATE TABLE IF NOT EXISTS bundle_components (
  id SERIAL PRIMARY KEY,
  bundle_id INTEGER REFERENCES product_bundles(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  UNIQUE(bundle_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_bundle_components_bundle ON bundle_components (bundle_id);
CREATE INDEX IF NOT EXISTS idx_bundle_components_product ON bundle_components (product_id);
