-- Discontinued product management enhancements
ALTER TABLE products ADD COLUMN IF NOT EXISTS discontinued_at TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discontinue_reason VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS replacement_product_id INTEGER REFERENCES products(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS hide_when_out_of_stock BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_products_discontinued ON products(product_status) WHERE product_status = 'discontinued';
CREATE INDEX IF NOT EXISTS idx_products_replacement ON products(replacement_product_id) WHERE replacement_product_id IS NOT NULL;
