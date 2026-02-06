-- ============================================================================
-- Migration 075: Product Bundles & Kits
-- ============================================================================

CREATE TABLE IF NOT EXISTS bundles (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  pricing_type VARCHAR(20) NOT NULL CHECK (pricing_type IN ('fixed', 'percentage_discount', 'sum_minus_discount')),
  fixed_price INTEGER,
  discount_percentage DECIMAL(5,2),
  discount_amount INTEGER,

  image_url VARCHAR(500),
  is_featured BOOLEAN DEFAULT FALSE,

  is_active BOOLEAN DEFAULT TRUE,
  available_from DATE,
  available_to DATE,

  track_component_inventory BOOLEAN DEFAULT TRUE,

  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bundle_items (
  id SERIAL PRIMARY KEY,
  bundle_id INTEGER REFERENCES bundles(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) NOT NULL,
  quantity INTEGER DEFAULT 1,

  is_required BOOLEAN DEFAULT TRUE,
  alternatives JSONB,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON bundle_items(bundle_id);
CREATE INDEX IF NOT EXISTS idx_bundle_items_product ON bundle_items(product_id);
CREATE INDEX IF NOT EXISTS idx_bundles_sku ON bundles(sku);
CREATE INDEX IF NOT EXISTS idx_bundles_active ON bundles(is_active) WHERE is_active = TRUE;
