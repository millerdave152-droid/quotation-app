-- ============================================================================
-- Migration 071: Price Import Tracking
-- Adds product_price_history table and tracking columns to products
-- ============================================================================

-- Tracking columns on products
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_updated_at TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_updated_by INTEGER REFERENCES users(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_price_import_id INTEGER REFERENCES price_list_imports(id);

-- Price history audit trail
CREATE TABLE IF NOT EXISTS product_price_history (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  previous_cost NUMERIC(10,2),
  new_cost NUMERIC(10,2),
  previous_price NUMERIC(10,2),
  new_price NUMERIC(10,2),

  source VARCHAR(30) NOT NULL DEFAULT 'import',  -- 'import', 'manual', 'bulk', 'promotion'
  source_id INTEGER,                              -- price_list_imports.id when source='import'

  effective_from DATE,

  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pph_product ON product_price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_pph_source ON product_price_history(source, source_id);
CREATE INDEX IF NOT EXISTS idx_pph_created ON product_price_history(created_at);
