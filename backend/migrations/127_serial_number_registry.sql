-- ============================================================================
-- Migration 127: Serial Number Registry
-- Full serial number lifecycle tracking with audit trail
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. product_serials — Master serial number registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_serials (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  serial_number VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','sold','returned','warranty_repair','recalled','damaged','scrapped')),
  location_id INTEGER REFERENCES locations(id),
  received_at TIMESTAMPTZ,
  sold_at TIMESTAMPTZ,
  customer_id INTEGER REFERENCES customers(id),
  transaction_id INTEGER REFERENCES transactions(transaction_id),
  purchase_order_id INTEGER, -- Phase 2 linking (nullable)
  notes TEXT,
  tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000000' REFERENCES tenants(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_serials_serial ON product_serials(serial_number);
CREATE INDEX IF NOT EXISTS idx_product_serials_product_status ON product_serials(product_id, status);
CREATE INDEX IF NOT EXISTS idx_product_serials_customer ON product_serials(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_serials_location ON product_serials(location_id) WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_serials_tenant ON product_serials(tenant_id);

-- ============================================================================
-- 2. serial_events — Audit trail for every status change
-- ============================================================================

CREATE TABLE IF NOT EXISTS serial_events (
  id SERIAL PRIMARY KEY,
  serial_id INTEGER NOT NULL REFERENCES product_serials(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL
    CHECK (event_type IN ('received','sold','returned','transferred','warranty_claim','recalled','damaged','scrapped')),
  from_status VARCHAR(30),
  to_status VARCHAR(30),
  reference_type VARCHAR(50), -- 'transaction','return','transfer','warranty','adjustment'
  reference_id INTEGER,
  location_id INTEGER REFERENCES locations(id),
  performed_by INTEGER REFERENCES users(id),
  notes TEXT,
  tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000000' REFERENCES tenants(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_serial_events_serial ON serial_events(serial_id);
CREATE INDEX IF NOT EXISTS idx_serial_events_type ON serial_events(event_type);
CREATE INDEX IF NOT EXISTS idx_serial_events_tenant ON serial_events(tenant_id);

-- ============================================================================
-- 3. Migrate existing serial numbers from transaction_items
-- ============================================================================

INSERT INTO product_serials (product_id, serial_number, status, customer_id, transaction_id, sold_at, created_at)
SELECT DISTINCT ON (ti.serial_number)
  ti.product_id,
  ti.serial_number,
  'sold',
  t.customer_id,
  t.transaction_id,
  t.created_at,
  NOW()
FROM transaction_items ti
JOIN transactions t ON t.transaction_id = ti.transaction_id
WHERE ti.serial_number IS NOT NULL
  AND ti.serial_number != ''
  AND NOT EXISTS (SELECT 1 FROM product_serials ps WHERE ps.serial_number = ti.serial_number)
ORDER BY ti.serial_number, t.created_at DESC;

-- Create sold events for migrated serials
INSERT INTO serial_events (serial_id, event_type, from_status, to_status, reference_type, reference_id, performed_by, notes)
SELECT
  ps.id,
  'sold',
  NULL,
  'sold',
  'transaction',
  ps.transaction_id,
  NULL,
  'Migrated from transaction_items'
FROM product_serials ps
WHERE NOT EXISTS (SELECT 1 FROM serial_events se WHERE se.serial_id = ps.id);

-- ============================================================================
-- 4. Permissions
-- ============================================================================

INSERT INTO permissions (code, name, category)
VALUES
  ('serial_numbers.view',   'View serial number registry and history', 'inventory'),
  ('serial_numbers.create', 'Register new serial numbers',             'inventory'),
  ('serial_numbers.edit',   'Change serial number status',             'inventory')
ON CONFLICT (code) DO NOTHING;

-- Grant to admin and manager roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('admin', 'manager')
  AND p.code IN ('serial_numbers.view', 'serial_numbers.create', 'serial_numbers.edit')
ON CONFLICT DO NOTHING;

-- Grant view to sales role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'sales'
  AND p.code = 'serial_numbers.view'
ON CONFLICT DO NOTHING;

COMMIT;
