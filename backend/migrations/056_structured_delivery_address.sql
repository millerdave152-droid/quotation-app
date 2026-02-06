-- Migration 056: Add structured delivery address columns to unified_orders
-- Replaces the plain TEXT delivery_address with individual validated fields

ALTER TABLE unified_orders ADD COLUMN IF NOT EXISTS delivery_street_number VARCHAR(20);
ALTER TABLE unified_orders ADD COLUMN IF NOT EXISTS delivery_street_name VARCHAR(255);
ALTER TABLE unified_orders ADD COLUMN IF NOT EXISTS delivery_unit VARCHAR(50);
ALTER TABLE unified_orders ADD COLUMN IF NOT EXISTS delivery_buzzer VARCHAR(50);
ALTER TABLE unified_orders ADD COLUMN IF NOT EXISTS delivery_city VARCHAR(100);
ALTER TABLE unified_orders ADD COLUMN IF NOT EXISTS delivery_province VARCHAR(2);
ALTER TABLE unified_orders ADD COLUMN IF NOT EXISTS delivery_postal_code VARCHAR(10);

-- Index for lookups by postal code and city
CREATE INDEX IF NOT EXISTS idx_unified_orders_delivery_postal_code ON unified_orders(delivery_postal_code);
CREATE INDEX IF NOT EXISTS idx_unified_orders_delivery_city ON unified_orders(delivery_city);
