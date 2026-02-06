-- ============================================================================
-- Migration 070: Price List Import Infrastructure
-- Vendors, price list imports tracking, and import row details
-- ============================================================================

-- 1. Vendors / Suppliers
CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(20),
  website VARCHAR(255),
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_code ON vendors(code);
CREATE INDEX IF NOT EXISTS idx_vendors_active ON vendors(is_active) WHERE is_active = TRUE;

-- 2. Price list imports tracking
CREATE TABLE IF NOT EXISTS price_list_imports (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER REFERENCES vendors(id),

  filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(500),
  file_size INTEGER,

  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending','mapping','validating','preview','importing','completed','failed','cancelled')),

  column_mapping JSONB,

  total_rows INTEGER,
  rows_processed INTEGER DEFAULT 0,
  rows_created INTEGER DEFAULT 0,
  rows_updated INTEGER DEFAULT 0,
  rows_skipped INTEGER DEFAULT 0,
  rows_errored INTEGER DEFAULT 0,

  effective_from DATE,
  effective_to DATE,

  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,

  uploaded_by INTEGER REFERENCES users(id) NOT NULL,
  approved_by INTEGER REFERENCES users(id),

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pli_vendor ON price_list_imports(vendor_id);
CREATE INDEX IF NOT EXISTS idx_pli_status ON price_list_imports(status);
CREATE INDEX IF NOT EXISTS idx_pli_uploaded_by ON price_list_imports(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_pli_created ON price_list_imports(created_at);

-- 3. Import row details
CREATE TABLE IF NOT EXISTS price_list_import_rows (
  id SERIAL PRIMARY KEY,
  import_id INTEGER REFERENCES price_list_imports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,

  raw_data JSONB NOT NULL,

  parsed_sku VARCHAR(100),
  parsed_description TEXT,
  parsed_cost INTEGER,
  parsed_msrp INTEGER,
  parsed_promo_price INTEGER,

  matched_product_id INTEGER REFERENCES products(id),
  match_type VARCHAR(20),

  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending','valid','warning','error','skipped','imported')),
  validation_errors JSONB,
  validation_warnings JSONB,

  previous_cost INTEGER,
  previous_msrp INTEGER,
  cost_change INTEGER,
  msrp_change INTEGER,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_rows_import ON price_list_import_rows(import_id);
CREATE INDEX IF NOT EXISTS idx_import_rows_status ON price_list_import_rows(status);
CREATE INDEX IF NOT EXISTS idx_import_rows_sku ON price_list_import_rows(parsed_sku);
CREATE INDEX IF NOT EXISTS idx_import_rows_match ON price_list_import_rows(matched_product_id) WHERE matched_product_id IS NOT NULL;

-- 4. Seed test vendors
INSERT INTO vendors (name, code, contact_name, contact_email, website) VALUES
  ('Samsung Electronics', 'SAMSUNG', 'Sales Department', 'sales@samsung.com', 'https://www.samsung.com'),
  ('LG Electronics', 'LG', 'Sales Department', 'sales@lg.com', 'https://www.lg.com'),
  ('Sony', 'SONY', 'Sales Department', 'sales@sony.com', 'https://www.sony.com'),
  ('Apple', 'APPLE', 'Sales Department', 'sales@apple.com', 'https://www.apple.com'),
  ('Whirlpool', 'WHIRLPOOL', 'Sales Department', 'sales@whirlpool.com', 'https://www.whirlpool.com'),
  ('Bosch', 'BOSCH', 'Sales Department', 'sales@bosch.com', 'https://www.bosch.com'),
  ('Panasonic', 'PANASONIC', 'Sales Department', 'sales@panasonic.com', 'https://www.panasonic.com'),
  ('Bose', 'BOSE', 'Sales Department', 'sales@bose.com', 'https://www.bose.com')
ON CONFLICT (code) DO NOTHING;
