-- Marketplace V2 Upgrade (idempotent)

DO $$
BEGIN
  -- PRODUCTS TABLE ENHANCEMENTS
  ALTER TABLE products ADD COLUMN IF NOT EXISTS mirakl_offer_state VARCHAR(20) DEFAULT 'INACTIVE';
  ALTER TABLE products ADD COLUMN IF NOT EXISTS mirakl_last_offer_sync TIMESTAMP;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS mirakl_last_price_sync TIMESTAMP;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS mirakl_last_stock_sync TIMESTAMP;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS mirakl_product_id VARCHAR(100);
  ALTER TABLE products ADD COLUMN IF NOT EXISTS bestbuy_logistic_class VARCHAR(10) DEFAULT 'L';
  ALTER TABLE products ADD COLUMN IF NOT EXISTS bestbuy_leadtime_to_ship INTEGER DEFAULT 2;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS bestbuy_product_tax_code VARCHAR(50);
  ALTER TABLE products ADD COLUMN IF NOT EXISTS bestbuy_ehf_amount DECIMAL(10,2) DEFAULT 0;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS bestbuy_min_quantity_alert INTEGER DEFAULT 5;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS marketplace_enabled BOOLEAN DEFAULT false;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS marketplace_discount_price DECIMAL(10,2);
  ALTER TABLE products ADD COLUMN IF NOT EXISTS marketplace_discount_start DATE;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS marketplace_discount_end DATE;
END $$;

-- NEW TABLE: marketplace_offer_imports
CREATE TABLE IF NOT EXISTS marketplace_offer_imports (
  import_id SERIAL PRIMARY KEY,
  mirakl_import_id VARCHAR(100) UNIQUE,
  import_type VARCHAR(30) NOT NULL,
  file_name VARCHAR(255),
  status VARCHAR(30) DEFAULT 'QUEUED',
  records_submitted INTEGER DEFAULT 0,
  records_processed INTEGER DEFAULT 0,
  records_with_errors INTEGER DEFAULT 0,
  error_report TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);

DO $$
BEGIN
  -- ENHANCE marketplace_orders TABLE
  ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS mirakl_order_state VARCHAR(50);
  ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);
  ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
  ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS shipping_type VARCHAR(50);
  ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS shipping_price DECIMAL(10,2) DEFAULT 0;
  ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10,2) DEFAULT 0;
  ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,4);
  ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS taxes_total DECIMAL(10,2) DEFAULT 0;
  ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) DEFAULT 'CAD';
  ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS acceptance_deadline TIMESTAMP;
  ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS last_polled_at TIMESTAMP;
  ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS internal_order_id INTEGER;
END $$;

DO $$
BEGIN
  -- ENHANCE marketplace_order_items TABLE
  ALTER TABLE marketplace_order_items ADD COLUMN IF NOT EXISTS mirakl_order_line_id VARCHAR(100);
  ALTER TABLE marketplace_order_items ADD COLUMN IF NOT EXISTS product_sku VARCHAR(100);
  ALTER TABLE marketplace_order_items ADD COLUMN IF NOT EXISTS offer_sku VARCHAR(100);
  ALTER TABLE marketplace_order_items ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
  ALTER TABLE marketplace_order_items ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2);
  ALTER TABLE marketplace_order_items ADD COLUMN IF NOT EXISTS line_total DECIMAL(10,2);
  ALTER TABLE marketplace_order_items ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10,2);
  ALTER TABLE marketplace_order_items ADD COLUMN IF NOT EXISTS taxes JSONB;
  ALTER TABLE marketplace_order_items ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'PENDING';
  ALTER TABLE marketplace_order_items ADD COLUMN IF NOT EXISTS shipping_tracking VARCHAR(100);
  ALTER TABLE marketplace_order_items ADD COLUMN IF NOT EXISTS shipping_carrier VARCHAR(50);
  ALTER TABLE marketplace_order_items ADD COLUMN IF NOT EXISTS refused_reason VARCHAR(255);
END $$;

-- NEW TABLE: marketplace_inventory_queue
CREATE TABLE IF NOT EXISTS marketplace_inventory_queue (
  queue_id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  sku VARCHAR(100) NOT NULL,
  old_quantity INTEGER,
  new_quantity INTEGER NOT NULL,
  change_source VARCHAR(50),
  queued_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP,
  batch_import_id INTEGER REFERENCES marketplace_offer_imports(import_id)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_inventory_queue_unsynced ON marketplace_inventory_queue(synced_at) WHERE synced_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_state ON marketplace_orders(mirakl_order_state);
CREATE INDEX IF NOT EXISTS idx_products_marketplace ON products(marketplace_enabled) WHERE marketplace_enabled = true;
