-- Product multi-image gallery
CREATE TABLE IF NOT EXISTS product_images (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE NOT NULL,

  image_url VARCHAR(500) NOT NULL,
  thumbnail_url VARCHAR(500),

  image_type VARCHAR(30) DEFAULT 'product' CHECK (image_type IN (
    'primary', 'product', 'lifestyle', 'dimension', 'detail', 'packaging'
  )),

  alt_text VARCHAR(255),
  sort_order INTEGER DEFAULT 0,
  is_primary BOOLEAN DEFAULT false,

  width INTEGER,
  height INTEGER,
  file_size INTEGER,

  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_primary ON product_images(product_id, is_primary) WHERE is_primary = true;

-- Ensure only one primary image per product
CREATE OR REPLACE FUNCTION ensure_single_primary_image()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE product_images SET is_primary = false
    WHERE product_id = NEW.product_id AND id != NEW.id AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_single_primary ON product_images;
CREATE TRIGGER trigger_single_primary
AFTER INSERT OR UPDATE ON product_images
FOR EACH ROW EXECUTE FUNCTION ensure_single_primary_image();
