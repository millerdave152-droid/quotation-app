-- Add missing Mirakl order detail fields
-- These fields are available in the Mirakl OR11 API response but not currently captured

-- Order-level fields
ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS shipping_zone_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS shipping_zone_label VARCHAR(255),
  ADD COLUMN IF NOT EXISTS shipping_type_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS shipping_type_label VARCHAR(255),
  ADD COLUMN IF NOT EXISTS customer_locale VARCHAR(20),
  ADD COLUMN IF NOT EXISTS leadtime_to_ship INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_date_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_date_end TIMESTAMPTZ;

-- Line-item fields
ALTER TABLE marketplace_order_items
  ADD COLUMN IF NOT EXISTS product_title VARCHAR(500),
  ADD COLUMN IF NOT EXISTS category_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS category_label VARCHAR(255),
  ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS shipping_taxes JSONB,
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS product_media_url TEXT,
  ADD COLUMN IF NOT EXISTS order_line_state VARCHAR(50);
