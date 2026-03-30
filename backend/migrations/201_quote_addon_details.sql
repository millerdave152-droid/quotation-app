-- Migration 201: Add plan details to quote_financing and warranty details to quote_warranties
-- These columns allow persisting the full plan info so it displays correctly when viewing quotes

-- Add financing plan details
ALTER TABLE quote_financing ADD COLUMN IF NOT EXISTS plan_name VARCHAR(255);
ALTER TABLE quote_financing ADD COLUMN IF NOT EXISTS provider VARCHAR(100);
ALTER TABLE quote_financing ADD COLUMN IF NOT EXISTS term_months INTEGER DEFAULT 0;
ALTER TABLE quote_financing ADD COLUMN IF NOT EXISTS apr_percent NUMERIC(5,2) DEFAULT 0;
ALTER TABLE quote_financing ADD COLUMN IF NOT EXISTS financing_type VARCHAR(50);

-- Add warranty plan details (years stored directly, plus covered product info)
ALTER TABLE quote_warranties ADD COLUMN IF NOT EXISTS warranty_years INTEGER DEFAULT 0;
ALTER TABLE quote_warranties ADD COLUMN IF NOT EXISTS covered_product_model VARCHAR(255);
ALTER TABLE quote_warranties ADD COLUMN IF NOT EXISTS covered_product_manufacturer VARCHAR(255);
ALTER TABLE quote_warranties ADD COLUMN IF NOT EXISTS provider VARCHAR(100);
ALTER TABLE quote_warranties ADD COLUMN IF NOT EXISTS coverage_details TEXT;

-- Add unique constraints on quote_id for delivery and financing (one per quote)
-- Required for ON CONFLICT (quote_id) upsert in the save routes
CREATE UNIQUE INDEX IF NOT EXISTS quote_delivery_quote_id_unique ON quote_delivery (quote_id);
CREATE UNIQUE INDEX IF NOT EXISTS quote_financing_quote_id_unique ON quote_financing (quote_id);
