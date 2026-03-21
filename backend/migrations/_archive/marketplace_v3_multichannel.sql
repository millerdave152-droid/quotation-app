-- ============================================================================
-- MARKETPLACE V3: MULTI-CHANNEL ARCHITECTURE
-- Migration: marketplace_v3_multichannel.sql
-- Date: 2026-02-14
-- Description: Introduces marketplace_channels + product_channel_listings
--              to support multiple marketplace integrations beyond Best Buy.
--              Fully idempotent — safe to re-run.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TABLE: marketplace_channels
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketplace_channels (
  id SERIAL PRIMARY KEY,
  channel_code VARCHAR(50) UNIQUE NOT NULL,           -- 'BESTBUY_CA', 'THEBAY', 'AMAZON_CA', 'WALMART_CA', 'EBAY_CA'
  channel_name VARCHAR(100) NOT NULL,                 -- 'Best Buy Canada'
  channel_type VARCHAR(30) NOT NULL,                  -- 'MIRAKL', 'AMAZON_SP', 'WALMART', 'EBAY'
  api_url VARCHAR(255),
  credentials JSONB DEFAULT '{}',                     -- encrypted: { api_key, shop_id, client_id, client_secret, etc }
  status VARCHAR(20) DEFAULT 'INACTIVE',              -- ACTIVE, INACTIVE, PENDING, ERROR
  config JSONB DEFAULT '{}',                          -- channel-specific: { poll_interval, default_leadtime, csv_delimiter, currency, etc }
  commission_rates JSONB DEFAULT '{}',                -- { "default": 0.08, "APPLIANCES": 0.07, "ELECTRONICS": 0.10 }
  features JSONB DEFAULT '{}',                        -- { "supports_webhooks": false, "supports_bundles": true, "max_offers_per_hour": 60 }
  onboarded_at TIMESTAMP,
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed Best Buy as first channel (migrate existing config)
INSERT INTO marketplace_channels (channel_code, channel_name, channel_type, api_url, status, config)
VALUES (
  'BESTBUY_CA',
  'Best Buy Canada',
  'MIRAKL',
  COALESCE(current_setting('app.mirakl_api_url', true), 'https://marketplace.bestbuy.ca/api'),
  'ACTIVE',
  '{"csv_delimiter": ";", "default_leadtime": 2, "default_logistic_class": "L", "poll_orders_minutes": 15, "poll_inventory_minutes": 30, "currency": "CAD", "requires_upc": true, "max_title_length": 126}'
) ON CONFLICT (channel_code) DO NOTHING;


-- ============================================================================
-- 2. TABLE: product_channel_listings
-- ============================================================================
CREATE TABLE IF NOT EXISTS product_channel_listings (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  channel_sku VARCHAR(100),                           -- SKU as known on this channel
  channel_product_id VARCHAR(100),                    -- marketplace's internal product ID
  channel_category_id VARCHAR(100),                   -- category code on this channel
  channel_category_name VARCHAR(255),
  channel_price DECIMAL(10,2),                        -- override price for this channel (NULL = use base price)
  channel_quantity INTEGER,                           -- last pushed quantity
  listing_status VARCHAR(30) DEFAULT 'DRAFT',         -- DRAFT, PENDING, ACTIVE, INACTIVE, ERROR, SUPPRESSED
  listing_error TEXT,                                 -- last error message from channel
  safety_buffer INTEGER DEFAULT 0,                    -- hold back N units from this channel
  allocation_percent DECIMAL(5,2) DEFAULT 100.00,     -- % of available stock allocated to this channel
  min_price DECIMAL(10,2),                            -- floor price for this channel
  max_price DECIMAL(10,2),                            -- ceiling price
  auto_price_enabled BOOLEAN DEFAULT false,
  channel_data JSONB DEFAULT '{}',                    -- any channel-specific fields
  last_offer_sync TIMESTAMP,
  last_price_sync TIMESTAMP,
  last_stock_sync TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(product_id, channel_id)
);


-- ============================================================================
-- 3. MIGRATE EXISTING BEST BUY DATA INTO product_channel_listings
-- ============================================================================
-- Move existing per-product Best Buy data into product_channel_listings.
-- Only runs for products that have a bestbuy_category_id assigned.
INSERT INTO product_channel_listings (
  product_id, channel_id, channel_sku, channel_category_id,
  channel_category_name, channel_price, listing_status,
  last_offer_sync, last_stock_sync
)
SELECT
  p.id,
  (SELECT id FROM marketplace_channels WHERE channel_code = 'BESTBUY_CA'),
  p.sku,
  p.bestbuy_category_id,
  bc.name,
  p.price,
  CASE WHEN p.marketplace_enabled THEN 'ACTIVE' ELSE 'DRAFT' END,
  p.mirakl_last_offer_sync,
  p.mirakl_last_stock_sync
FROM products p
LEFT JOIN bestbuy_categories bc ON bc.code = p.bestbuy_category_id
WHERE p.bestbuy_category_id IS NOT NULL
ON CONFLICT (product_id, channel_id) DO NOTHING;


-- ============================================================================
-- 4. ADD channel_id TO EXISTING MARKETPLACE TABLES
-- ============================================================================
ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS channel_id INTEGER REFERENCES marketplace_channels(id);
ALTER TABLE marketplace_offer_imports ADD COLUMN IF NOT EXISTS channel_id INTEGER REFERENCES marketplace_channels(id);
ALTER TABLE marketplace_inventory_queue ADD COLUMN IF NOT EXISTS channel_id INTEGER REFERENCES marketplace_channels(id);
ALTER TABLE marketplace_sync_log ADD COLUMN IF NOT EXISTS channel_id INTEGER REFERENCES marketplace_channels(id);

-- Backfill existing records to Best Buy channel
UPDATE marketplace_orders
  SET channel_id = (SELECT id FROM marketplace_channels WHERE channel_code = 'BESTBUY_CA')
  WHERE channel_id IS NULL;

UPDATE marketplace_offer_imports
  SET channel_id = (SELECT id FROM marketplace_channels WHERE channel_code = 'BESTBUY_CA')
  WHERE channel_id IS NULL;

UPDATE marketplace_inventory_queue
  SET channel_id = (SELECT id FROM marketplace_channels WHERE channel_code = 'BESTBUY_CA')
  WHERE channel_id IS NULL;

UPDATE marketplace_sync_log
  SET channel_id = (SELECT id FROM marketplace_channels WHERE channel_code = 'BESTBUY_CA')
  WHERE channel_id IS NULL;


-- ============================================================================
-- 5. INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_pcl_product_channel ON product_channel_listings(product_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_pcl_channel_status ON product_channel_listings(channel_id, listing_status);
CREATE INDEX IF NOT EXISTS idx_pcl_channel_sku ON product_channel_listings(channel_sku);
CREATE INDEX IF NOT EXISTS idx_mp_orders_channel ON marketplace_orders(channel_id);
CREATE INDEX IF NOT EXISTS idx_mp_inv_queue_channel ON marketplace_inventory_queue(channel_id);


COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
