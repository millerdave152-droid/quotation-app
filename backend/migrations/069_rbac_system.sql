-- Migration 069: Comprehensive RBAC System
-- Normalized roles, permissions, and role_permissions tables for Hub and POS

-- ============================================================================
-- 1. ROLES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system_role BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. PERMISSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category);

-- ============================================================================
-- 3. ROLE_PERMISSIONS JOIN TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permission_id);

-- ============================================================================
-- 4. ADD role_id FK TO users
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- ============================================================================
-- 5. SEED ROLES
-- ============================================================================

INSERT INTO roles (name, display_name, description, is_system_role) VALUES
  ('admin', 'Administrator', 'Full system access', true),
  ('manager', 'Store Manager', 'Store manager with approval rights', true),
  ('senior_sales', 'Senior Salesperson', 'Senior salesperson with advanced features', true),
  ('sales', 'Salesperson', 'Standard salesperson', true),
  ('warehouse', 'Warehouse Staff', 'Warehouse and inventory management', true),
  ('driver', 'Delivery Driver', 'Delivery driver with dispatch access', true)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_system_role = EXCLUDED.is_system_role;

-- ============================================================================
-- 6. SEED PERMISSIONS
-- ============================================================================

INSERT INTO permissions (code, name, category) VALUES
  -- POS
  ('pos.checkout.create', 'Create sales transactions', 'pos'),
  ('pos.checkout.discount', 'Apply discounts', 'pos'),
  ('pos.checkout.price_override', 'Override item prices', 'pos'),
  ('pos.checkout.void', 'Void transactions', 'pos'),
  ('pos.returns.create', 'Initiate returns', 'pos'),
  ('pos.returns.process', 'Process refunds', 'pos'),
  ('pos.drawer.open', 'Open cash drawer', 'pos'),
  ('pos.drawer.close', 'Close shift/drawer', 'pos'),
  -- Hub
  ('hub.products.view', 'View products', 'hub'),
  ('hub.products.edit', 'Edit products', 'hub'),
  ('hub.products.import', 'Import price lists', 'hub'),
  ('hub.orders.view', 'View orders', 'hub'),
  ('hub.orders.edit', 'Edit orders', 'hub'),
  ('hub.orders.void', 'Void orders', 'hub'),
  ('hub.customers.view', 'View customers', 'hub'),
  ('hub.customers.edit', 'Edit customers', 'hub'),
  ('hub.inventory.view', 'View inventory', 'hub'),
  ('hub.inventory.adjust', 'Adjust inventory', 'hub'),
  ('hub.commissions.view_own', 'View own commissions', 'hub'),
  ('hub.commissions.view_all', 'View all commissions', 'hub'),
  ('hub.commissions.approve', 'Approve commissions', 'hub'),
  ('hub.delivery.dispatch', 'Dispatch deliveries', 'hub'),
  ('hub.delivery.view', 'View delivery schedule', 'hub'),
  ('hub.quotes.create', 'Create quotes', 'hub'),
  ('hub.quotes.edit', 'Edit quotes', 'hub'),
  ('hub.quotes.send', 'Send quotes to customers', 'hub'),
  -- Reports
  ('reports.sales', 'View sales reports', 'reports'),
  ('reports.inventory', 'View inventory reports', 'reports'),
  ('reports.commissions', 'View commission reports', 'reports'),
  ('reports.financial', 'View financial reports', 'reports'),
  ('reports.marketing', 'View marketing reports', 'reports'),
  -- Admin
  ('admin.users', 'Manage users', 'admin'),
  ('admin.roles', 'Manage roles and permissions', 'admin'),
  ('admin.settings', 'System settings', 'admin'),
  ('admin.audit_log', 'View audit log', 'admin')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category;

-- ============================================================================
-- 7. ASSIGN PERMISSIONS TO ROLES
-- ============================================================================

-- Admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- Manager: everything except admin.*
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'manager' AND p.category != 'admin'
ON CONFLICT DO NOTHING;

-- Also give manager admin.audit_log
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'manager' AND p.code = 'admin.audit_log'
ON CONFLICT DO NOTHING;

-- Senior Sales
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'senior_sales' AND p.code IN (
  'pos.checkout.create', 'pos.checkout.discount', 'pos.drawer.open', 'pos.drawer.close',
  'pos.returns.create', 'pos.returns.process',
  'hub.products.view', 'hub.orders.view', 'hub.orders.edit',
  'hub.customers.view', 'hub.customers.edit',
  'hub.commissions.view_own', 'hub.inventory.view',
  'hub.quotes.create', 'hub.quotes.edit', 'hub.quotes.send',
  'reports.sales', 'reports.commissions'
)
ON CONFLICT DO NOTHING;

-- Sales
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'sales' AND p.code IN (
  'pos.checkout.create', 'pos.drawer.open',
  'pos.returns.create',
  'hub.products.view', 'hub.orders.view',
  'hub.customers.view', 'hub.customers.edit',
  'hub.commissions.view_own',
  'hub.quotes.create', 'hub.quotes.edit', 'hub.quotes.send',
  'reports.sales'
)
ON CONFLICT DO NOTHING;

-- Warehouse
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'warehouse' AND p.code IN (
  'hub.products.view',
  'hub.inventory.view', 'hub.inventory.adjust',
  'hub.orders.view',
  'hub.delivery.view',
  'reports.inventory'
)
ON CONFLICT DO NOTHING;

-- Driver
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'driver' AND p.code IN (
  'hub.orders.view',
  'hub.delivery.view', 'hub.delivery.dispatch',
  'hub.customers.view'
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 8. BACKFILL role_id FROM EXISTING users.role COLUMN
-- ============================================================================

UPDATE users u SET role_id = r.id
FROM roles r
WHERE u.role_id IS NULL
  AND (
    (u.role = 'admin' AND r.name = 'admin')
    OR (u.role = 'manager' AND r.name = 'manager')
    OR (u.role = 'salesperson' AND r.name = 'sales')
    OR (u.role = 'user' AND r.name = 'sales')
  );
