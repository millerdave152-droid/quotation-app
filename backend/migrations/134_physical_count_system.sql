-- Migration 134: Physical Inventory Count System
-- Supports full, cycle, spot, and ABC counting

CREATE TABLE IF NOT EXISTS physical_counts (
  id SERIAL PRIMARY KEY,
  count_number VARCHAR(30) NOT NULL UNIQUE,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  count_type VARCHAR(20) NOT NULL DEFAULT 'full' CHECK (count_type IN ('full', 'cycle', 'spot', 'abc')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'review', 'approved', 'cancelled')),
  started_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  total_items INTEGER DEFAULT 0,
  total_counted INTEGER DEFAULT 0,
  total_variance_units INTEGER DEFAULT 0,
  total_variance_cost_cents BIGINT DEFAULT 0,
  notes TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS physical_count_items (
  id SERIAL PRIMARY KEY,
  physical_count_id INTEGER NOT NULL REFERENCES physical_counts(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  expected_qty INTEGER NOT NULL DEFAULT 0,
  counted_qty INTEGER,
  recount_qty INTEGER,
  variance INTEGER GENERATED ALWAYS AS (COALESCE(recount_qty, counted_qty, 0) - expected_qty) STORED,
  unit_cost_cents INTEGER DEFAULT 0,
  variance_cost_cents INTEGER GENERATED ALWAYS AS ((COALESCE(recount_qty, counted_qty, 0) - expected_qty) * COALESCE(unit_cost_cents, 0)) STORED,
  scanned_barcode VARCHAR(100),
  counted_by INTEGER REFERENCES users(id),
  counted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cycle_count_schedule (
  id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  abc_class CHAR(1) NOT NULL CHECK (abc_class IN ('A', 'B', 'C')),
  frequency_days INTEGER NOT NULL DEFAULT 30,
  next_count_date DATE NOT NULL,
  last_count_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, abc_class)
);

CREATE INDEX IF NOT EXISTS idx_physical_counts_location ON physical_counts(location_id);
CREATE INDEX IF NOT EXISTS idx_physical_counts_status ON physical_counts(status);
CREATE INDEX IF NOT EXISTS idx_physical_count_items_count ON physical_count_items(physical_count_id);
CREATE INDEX IF NOT EXISTS idx_physical_count_items_product ON physical_count_items(product_id);
CREATE INDEX IF NOT EXISTS idx_cycle_count_schedule_next ON cycle_count_schedule(next_count_date) WHERE is_active = TRUE;

-- Permissions
INSERT INTO permissions (code, name, description, category) VALUES
  ('inventory_counts.view', 'View inventory counts', 'View inventory counts', 'inventory'),
  ('inventory_counts.create', 'Create inventory counts', 'Create inventory counts', 'inventory'),
  ('inventory_counts.count', 'Record count entries', 'Record count entries', 'inventory'),
  ('inventory_counts.approve', 'Approve inventory counts', 'Approve inventory counts', 'inventory')
ON CONFLICT (code) DO NOTHING;

-- Grant to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin' AND p.code LIKE 'inventory_counts.%'
AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
