-- Migration 135: Work Order / Service Order System

CREATE TABLE IF NOT EXISTS work_orders (
  id SERIAL PRIMARY KEY,
  wo_number VARCHAR(30) NOT NULL UNIQUE,
  tenant_id UUID REFERENCES tenants(id),
  customer_id INTEGER REFERENCES customers(id),
  transaction_id INTEGER,
  order_id INTEGER,
  location_id INTEGER REFERENCES locations(id),
  work_type VARCHAR(30) NOT NULL DEFAULT 'delivery' CHECK (work_type IN ('delivery', 'installation', 'repair', 'pickup', 'exchange', 'warranty_service')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'assigned', 'in_progress', 'on_hold', 'completed', 'closed', 'cancelled')),
  priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  -- Scheduling
  scheduled_date DATE,
  scheduled_time_start TIME,
  scheduled_time_end TIME,
  -- Assignment
  assigned_to INTEGER REFERENCES users(id),
  assigned_team VARCHAR(100),
  -- Address
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  province VARCHAR(50),
  postal_code VARCHAR(20),
  -- Costs
  labor_cost_cents INTEGER DEFAULT 0,
  parts_cost_cents INTEGER DEFAULT 0,
  total_cost_cents INTEGER DEFAULT 0,
  billed_to VARCHAR(30) DEFAULT 'customer' CHECK (billed_to IN ('customer', 'warranty', 'store', 'manufacturer')),
  -- Notes
  description TEXT,
  internal_notes TEXT,
  customer_notes TEXT,
  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_order_items (
  id SERIAL PRIMARY KEY,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  serial_number VARCHAR(100),
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost_cents INTEGER DEFAULT 0,
  item_type VARCHAR(20) NOT NULL DEFAULT 'product' CHECK (item_type IN ('product', 'part', 'labor', 'fee')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_order_status_history (
  id SERIAL PRIMARY KEY,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_order_photos (
  id SERIAL PRIMARY KEY,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  photo_data TEXT NOT NULL,
  photo_type VARCHAR(20) DEFAULT 'other' CHECK (photo_type IN ('before', 'during', 'after', 'damage', 'other')),
  caption TEXT,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_order_signatures (
  id SERIAL PRIMARY KEY,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  signature_data TEXT NOT NULL,
  signer_name VARCHAR(200),
  relationship VARCHAR(50),
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_customer ON work_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned ON work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_orders_scheduled ON work_orders(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_work_orders_location ON work_orders(location_id);
CREATE INDEX IF NOT EXISTS idx_work_order_items_wo ON work_order_items(work_order_id);
CREATE INDEX IF NOT EXISTS idx_work_order_status_history_wo ON work_order_status_history(work_order_id);

-- Permissions
INSERT INTO permissions (code, name, description, category) VALUES
  ('work_orders.view', 'View work orders', 'View work orders', 'operations'),
  ('work_orders.create', 'Create work orders', 'Create work orders', 'operations'),
  ('work_orders.edit', 'Edit work orders', 'Edit work orders', 'operations'),
  ('work_orders.assign', 'Assign work orders', 'Assign work orders', 'operations'),
  ('work_orders.complete', 'Complete work orders', 'Complete work orders', 'operations'),
  ('work_orders.delete', 'Delete work orders', 'Delete work orders', 'operations')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin' AND p.code LIKE 'work_orders.%'
AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
