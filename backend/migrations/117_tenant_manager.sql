-- Migration 117: Multi-tenant architecture for marketplace
-- Adds tenant isolation to channels, orders, and listings

CREATE TABLE IF NOT EXISTS marketplace_tenants (
  id SERIAL PRIMARY KEY,
  tenant_code VARCHAR(50) UNIQUE NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  plan VARCHAR(30) DEFAULT 'STANDARD',
  active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add tenant_id to key tables
ALTER TABLE marketplace_channels ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES marketplace_tenants(id);
ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES marketplace_tenants(id);
ALTER TABLE product_channel_listings ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES marketplace_tenants(id);

-- Indexes for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_channels_tenant ON marketplace_channels (tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON marketplace_orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_listings_tenant ON product_channel_listings (tenant_id);

-- Seed TeleTime as tenant #1
INSERT INTO marketplace_tenants (tenant_code, company_name, plan)
VALUES ('TELETIME', 'TeleTime', 'ENTERPRISE')
ON CONFLICT (tenant_code) DO NOTHING;

-- Backfill existing data to TeleTime tenant
UPDATE marketplace_channels SET tenant_id = (SELECT id FROM marketplace_tenants WHERE tenant_code = 'TELETIME') WHERE tenant_id IS NULL;
UPDATE marketplace_orders SET tenant_id = (SELECT id FROM marketplace_tenants WHERE tenant_code = 'TELETIME') WHERE tenant_id IS NULL;
UPDATE product_channel_listings SET tenant_id = (SELECT id FROM marketplace_tenants WHERE tenant_code = 'TELETIME') WHERE tenant_id IS NULL;
