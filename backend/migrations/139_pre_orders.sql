-- Migration 139: Pre-Order System

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_preorder BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS preorder_release_date DATE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS preorder_deposit_percent INTEGER DEFAULT 100;
ALTER TABLE products ADD COLUMN IF NOT EXISTS preorder_max_qty INTEGER;

CREATE TABLE IF NOT EXISTS pre_orders (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  transaction_id INTEGER,
  quantity INTEGER NOT NULL DEFAULT 1,
  deposit_cents INTEGER DEFAULT 0,
  total_price_cents INTEGER NOT NULL DEFAULT 0,
  balance_cents INTEGER GENERATED ALWAYS AS (total_price_cents - deposit_cents) STORED,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'available', 'notified', 'fulfilled', 'cancelled', 'refunded')),
  release_date DATE,
  notified_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pre_orders_customer ON pre_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_pre_orders_product ON pre_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_pre_orders_status ON pre_orders(status);
CREATE INDEX IF NOT EXISTS idx_pre_orders_release ON pre_orders(release_date);

INSERT INTO permissions (code, name, description, category) VALUES
  ('pre_orders.view', 'View pre-orders', 'View pre-orders', 'sales'),
  ('pre_orders.create', 'Create pre-orders', 'Create pre-orders', 'sales'),
  ('pre_orders.edit', 'Edit pre-orders', 'Edit pre-orders', 'sales'),
  ('pre_orders.fulfill', 'Fulfill pre-orders', 'Fulfill pre-orders', 'sales')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin' AND p.code LIKE 'pre_orders.%'
AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
