-- Migration 137: Customer Account / On-Account Sales System

CREATE TABLE IF NOT EXISTS customer_accounts (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id),
  tenant_id UUID REFERENCES tenants(id),
  credit_limit_cents INTEGER NOT NULL DEFAULT 0,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  available_credit_cents INTEGER GENERATED ALWAYS AS (credit_limit_cents - balance_cents) STORED,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'suspended', 'closed')),
  payment_terms_days INTEGER DEFAULT 30,
  last_payment_at TIMESTAMPTZ,
  last_charge_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  opened_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_account_transactions (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES customer_accounts(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('charge', 'payment', 'credit', 'adjustment', 'writeoff')),
  amount_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  reference_type VARCHAR(50),
  reference_id INTEGER,
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_accounts_customer ON customer_accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_accounts_status ON customer_accounts(status);
CREATE INDEX IF NOT EXISTS idx_customer_account_txns_account ON customer_account_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_customer_account_txns_type ON customer_account_transactions(type);

INSERT INTO permissions (code, name, description, category) VALUES
  ('customer_accounts.view', 'View customer accounts', 'View customer accounts', 'sales'),
  ('customer_accounts.create', 'Create customer accounts', 'Create customer accounts', 'sales'),
  ('customer_accounts.edit', 'Edit customer accounts', 'Edit customer accounts', 'sales'),
  ('customer_accounts.charge', 'Charge to customer account', 'Charge to customer account', 'sales'),
  ('customer_accounts.payment', 'Record account payments', 'Record account payments', 'sales'),
  ('customer_accounts.writeoff', 'Write off account balances', 'Write off account balances', 'sales')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin' AND p.code LIKE 'customer_accounts.%'
AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
