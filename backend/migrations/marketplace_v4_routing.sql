-- Migration: marketplace_v4_routing
-- Order routing and fulfillment location management for multi-channel marketplace.

CREATE TABLE IF NOT EXISTS fulfillment_locations (
  id                      SERIAL PRIMARY KEY,
  name                    VARCHAR(100) NOT NULL,
  location_type           VARCHAR(30) DEFAULT 'STORE',   -- STORE, WAREHOUSE, PARTNER
  address_line1           VARCHAR(255),
  address_line2           VARCHAR(255),
  city                    VARCHAR(100),
  province                VARCHAR(2),
  postal_code             VARCHAR(10),
  latitude                DECIMAL(10,7),
  longitude               DECIMAL(10,7),
  capacity_orders_per_day INTEGER DEFAULT 50,
  active                  BOOLEAN DEFAULT true,
  config                  JSONB DEFAULT '{}',
  created_at              TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fulfillment_location_inventory (
  id          SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES fulfillment_locations(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,
  quantity    INTEGER DEFAULT 0,
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(location_id, product_id)
);

CREATE TABLE IF NOT EXISTS routing_rules (
  id          SERIAL PRIMARY KEY,
  rule_name   VARCHAR(100) NOT NULL,
  priority    INTEGER DEFAULT 100,           -- lower = higher priority
  conditions  JSONB DEFAULT '{}',            -- { "order_total_min": 500, "province": "ON", "channel": "BESTBUY_CA" }
  action      JSONB DEFAULT '{}',            -- { "prefer_location": 1, "split_allowed": true, "max_locations": 2 }
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW()
);

ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS fulfillment_location_id INTEGER REFERENCES fulfillment_locations(id);
ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS routing_decision JSONB;

CREATE INDEX IF NOT EXISTS idx_fulfillment_locations_active ON fulfillment_locations(active);
CREATE INDEX IF NOT EXISTS idx_fulfillment_loc_inv_location ON fulfillment_location_inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_loc_inv_product ON fulfillment_location_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_routing_rules_priority ON routing_rules(priority) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_location ON marketplace_orders(fulfillment_location_id);

-- Seed TeleTime locations
INSERT INTO fulfillment_locations (name, location_type, city, province, postal_code)
SELECT 'TeleTime Main Warehouse', 'WAREHOUSE', 'Toronto', 'ON', 'M1M 1M1'
WHERE NOT EXISTS (SELECT 1 FROM fulfillment_locations WHERE name = 'TeleTime Main Warehouse');

INSERT INTO fulfillment_locations (name, location_type, city, province, postal_code)
SELECT 'TeleTime Scarborough', 'STORE', 'Scarborough', 'ON', 'M1M 1M1'
WHERE NOT EXISTS (SELECT 1 FROM fulfillment_locations WHERE name = 'TeleTime Scarborough');
