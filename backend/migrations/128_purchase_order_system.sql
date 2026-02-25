-- ============================================================================
-- Migration 128: Purchase Order System
-- Full purchase order lifecycle with goods receiving and vendor enhancements
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Enhance vendors table
-- ============================================================================

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER DEFAULT 30;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'CAD';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tax_number VARCHAR(50);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS province VARCHAR(50);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS postal_code VARCHAR(10);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS country VARCHAR(50) DEFAULT 'Canada';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS lead_time_days INTEGER;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS minimum_order_cents INTEGER;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS default_shipping_method VARCHAR(50);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- 2. purchase_orders
-- ============================================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  po_number VARCHAR(30) UNIQUE NOT NULL,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  location_id INTEGER REFERENCES locations(id),
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','confirmed','partially_received','received','cancelled')),
  order_date DATE,
  expected_date DATE,
  subtotal_cents INTEGER DEFAULT 0,
  tax_cents INTEGER DEFAULT 0,
  shipping_cents INTEGER DEFAULT 0,
  total_cents INTEGER DEFAULT 0,
  notes TEXT,
  internal_notes TEXT,
  created_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  cancelled_by INTEGER REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000000' REFERENCES tenants(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_po_vendor_status ON purchase_orders(vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_expected_date ON purchase_orders(expected_date);
CREATE INDEX IF NOT EXISTS idx_po_tenant ON purchase_orders(tenant_id);

-- ============================================================================
-- 3. purchase_order_items
-- ============================================================================

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id SERIAL PRIMARY KEY,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0),
  quantity_received INTEGER DEFAULT 0,
  unit_cost_cents INTEGER NOT NULL,
  total_cents INTEGER GENERATED ALWAYS AS (quantity_ordered * unit_cost_cents) STORED,
  notes TEXT,
  is_special_order BOOLEAN DEFAULT false,
  special_order_reference VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_poi_product ON purchase_order_items(product_id);

-- ============================================================================
-- 4. goods_receipts
-- ============================================================================

CREATE TABLE IF NOT EXISTS goods_receipts (
  id SERIAL PRIMARY KEY,
  receipt_number VARCHAR(30) UNIQUE NOT NULL,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
  location_id INTEGER REFERENCES locations(id),
  received_by INTEGER REFERENCES users(id),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000000' REFERENCES tenants(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gr_number ON goods_receipts(receipt_number);
CREATE INDEX IF NOT EXISTS idx_gr_po ON goods_receipts(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_gr_tenant ON goods_receipts(tenant_id);

-- ============================================================================
-- 5. goods_receipt_items
-- ============================================================================

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id SERIAL PRIMARY KEY,
  goods_receipt_id INTEGER NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id INTEGER NOT NULL REFERENCES purchase_order_items(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity_received INTEGER NOT NULL CHECK (quantity_received >= 0),
  quantity_damaged INTEGER DEFAULT 0,
  serial_numbers TEXT[], -- Array of serials for auto-registration
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gri_receipt ON goods_receipt_items(goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_gri_poi ON goods_receipt_items(purchase_order_item_id);

-- ============================================================================
-- 6. Permissions
-- ============================================================================

INSERT INTO permissions (code, name, category)
VALUES
  ('purchase_orders.view',    'View purchase orders',              'purchasing'),
  ('purchase_orders.create',  'Create purchase orders',            'purchasing'),
  ('purchase_orders.edit',    'Edit and submit purchase orders',   'purchasing'),
  ('purchase_orders.approve', 'Approve/confirm purchase orders',   'purchasing'),
  ('purchase_orders.receive', 'Receive goods against POs',         'purchasing'),
  ('vendors.view',            'View vendor list',                  'purchasing'),
  ('vendors.create',          'Create vendors',                    'purchasing'),
  ('vendors.edit',            'Edit vendor details',               'purchasing')
ON CONFLICT (code) DO NOTHING;

-- Grant to admin and manager roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('admin', 'manager')
  AND p.code IN (
    'purchase_orders.view','purchase_orders.create','purchase_orders.edit',
    'purchase_orders.approve','purchase_orders.receive',
    'vendors.view','vendors.create','vendors.edit'
  )
ON CONFLICT DO NOTHING;

-- Grant view + receive to sales role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'sales'
  AND p.code IN ('purchase_orders.view', 'purchase_orders.receive', 'vendors.view')
ON CONFLICT DO NOTHING;

COMMIT;
