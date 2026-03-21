-- Migration 054: POS Role-Based Permissions
-- Granular permission system layered on top of existing role column

CREATE TABLE IF NOT EXISTS pos_roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]',
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add POS role reference to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS pos_role_id INTEGER REFERENCES pos_roles(id);

CREATE INDEX IF NOT EXISTS idx_users_pos_role ON users(pos_role_id);

-- Seed system roles
INSERT INTO pos_roles (name, display_name, permissions, is_system) VALUES
  ('cashier', 'Cashier', '[
    "pos.checkout.create",
    "pos.drawer.open",
    "pos.customers.create",
    "pos.reports.view"
  ]'::jsonb, true),

  ('senior_sales', 'Senior Sales', '[
    "pos.checkout.create",
    "pos.checkout.discount",
    "pos.returns.create",
    "pos.drawer.open",
    "pos.drawer.close_shift",
    "pos.customers.create",
    "pos.customers.edit",
    "pos.reports.view"
  ]'::jsonb, true),

  ('manager', 'Manager', '[
    "pos.checkout.create",
    "pos.checkout.discount",
    "pos.checkout.price_override",
    "pos.checkout.void",
    "pos.returns.create",
    "pos.returns.process_refund",
    "pos.drawer.open",
    "pos.drawer.close_shift",
    "pos.customers.create",
    "pos.customers.edit",
    "pos.reports.view"
  ]'::jsonb, true),

  ('admin', 'Administrator', '[
    "pos.checkout.create",
    "pos.checkout.discount",
    "pos.checkout.price_override",
    "pos.checkout.void",
    "pos.returns.create",
    "pos.returns.process_refund",
    "pos.drawer.open",
    "pos.drawer.close_shift",
    "pos.customers.create",
    "pos.customers.edit",
    "pos.reports.view"
  ]'::jsonb, true)
ON CONFLICT (name) DO NOTHING;

-- Set default pos_role_id based on existing role column for existing users
UPDATE users SET pos_role_id = (SELECT id FROM pos_roles WHERE name = 'admin') WHERE role = 'admin' AND pos_role_id IS NULL;
UPDATE users SET pos_role_id = (SELECT id FROM pos_roles WHERE name = 'manager') WHERE role = 'manager' AND pos_role_id IS NULL;
UPDATE users SET pos_role_id = (SELECT id FROM pos_roles WHERE name = 'cashier') WHERE role = 'user' AND pos_role_id IS NULL;
