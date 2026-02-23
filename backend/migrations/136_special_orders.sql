-- Migration 136: Special Order Tracking System

CREATE TABLE IF NOT EXISTS special_orders (
  id SERIAL PRIMARY KEY,
  so_number VARCHAR(30) NOT NULL UNIQUE,
  tenant_id UUID REFERENCES tenants(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  product_id INTEGER REFERENCES products(id),
  purchase_order_item_id INTEGER,
  transaction_id INTEGER,
  quotation_id INTEGER,
  status VARCHAR(30) NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'eta_confirmed', 'in_transit', 'arrived', 'customer_notified', 'picked_up', 'delivered', 'cancelled')),
  quantity INTEGER NOT NULL DEFAULT 1,
  deposit_cents INTEGER DEFAULT 0,
  total_price_cents INTEGER NOT NULL DEFAULT 0,
  product_description TEXT,
  vendor_name VARCHAR(200),
  vendor_order_ref VARCHAR(100),
  eta_date DATE,
  actual_arrival_date DATE,
  customer_notified_at TIMESTAMPTZ,
  notification_count INTEGER DEFAULT 0,
  pickup_deadline DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_special_orders_customer ON special_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_special_orders_status ON special_orders(status);
CREATE INDEX IF NOT EXISTS idx_special_orders_product ON special_orders(product_id);

INSERT INTO permissions (code, name, description, category) VALUES
  ('special_orders.view', 'View special orders', 'View special orders', 'sales'),
  ('special_orders.create', 'Create special orders', 'Create special orders', 'sales'),
  ('special_orders.edit', 'Edit special orders', 'Edit special orders', 'sales'),
  ('special_orders.notify', 'Send customer notifications', 'Send customer notifications', 'sales')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin' AND p.code LIKE 'special_orders.%'
AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
