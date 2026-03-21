-- Migration 160: MOTO (Mail Order/Telephone Order) Security Controls
-- Adds employee MOTO authorization, per-employee limits, store-wide settings,
-- MOTO order tracking, and callback verification workflow.

-- ============================================================================
-- 1. Employee MOTO authorization + limits on users table
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS moto_authorized BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS moto_limit DECIMAL(10,2) DEFAULT 2000.00;

COMMENT ON COLUMN users.moto_authorized IS 'Whether this employee can process MOTO (card-not-present) transactions';
COMMENT ON COLUMN users.moto_limit IS 'Maximum MOTO transaction amount before requiring manager approval (CAD)';

-- ============================================================================
-- 2. Store-wide MOTO settings
-- ============================================================================

CREATE TABLE IF NOT EXISTS moto_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(50) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO moto_settings (setting_key, setting_value, description)
VALUES
  ('store_moto_limit', '5000.00', 'Store-wide MOTO limit (CAD). Transactions above this always require owner/admin approval.'),
  ('moto_enabled', 'true', 'Whether MOTO transactions are enabled globally.'),
  ('callback_threshold', '500.00', 'MOTO order amount threshold requiring callback verification before authorization.'),
  ('callback_required', 'true', 'Whether callback verification is required for orders above the threshold.'),
  ('pickup_chip_conversion_prompt', 'true', 'Whether to show chip conversion prompt at in-store pickup of MOTO orders.'),
  ('address_divergence_score', '5', 'Additional fraud score points when delivery address differs from billing address in different cities.')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- 3. MOTO orders tracking table
-- ============================================================================

CREATE TABLE IF NOT EXISTS moto_orders (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER REFERENCES transactions(transaction_id),
  order_id INTEGER,
  employee_id INTEGER NOT NULL REFERENCES users(id),

  -- Cardholder data (references only — full card data never stored per PCI DSS)
  cardholder_name VARCHAR(100) NOT NULL,
  card_bin VARCHAR(8),
  card_last_four VARCHAR(4),
  card_brand VARCHAR(20),
  card_type VARCHAR(20),
  expiry_month SMALLINT,
  expiry_year SMALLINT,

  -- Billing address (stored for AVS verification record)
  billing_street VARCHAR(200),
  billing_city VARCHAR(100),
  billing_province VARCHAR(2),
  billing_postal_code VARCHAR(7),

  -- Delivery address (if different)
  delivery_street VARCHAR(200),
  delivery_city VARCHAR(100),
  delivery_province VARCHAR(2),
  delivery_postal_code VARCHAR(7),
  delivery_method VARCHAR(30), -- 'delivery', 'pickup', 'ship'

  -- Callback verification
  callback_phone VARCHAR(20),
  callback_required BOOLEAN DEFAULT false,
  callback_completed BOOLEAN DEFAULT false,
  callback_completed_by INTEGER REFERENCES users(id),
  callback_completed_at TIMESTAMPTZ,
  callback_crm_phone VARCHAR(20), -- Verified phone from CRM record (independent verification)
  callback_notes TEXT,

  -- AVS/CVV verification results
  avs_result VARCHAR(10),
  cvv_result VARCHAR(10),
  avs_message TEXT,
  cvv_message TEXT,

  -- Address divergence
  address_divergent BOOLEAN DEFAULT false,
  address_divergence_detail TEXT,

  -- Amount and approval tracking
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'CAD',
  required_manager_approval BOOLEAN DEFAULT false,
  manager_approved_by INTEGER REFERENCES users(id),
  manager_approved_at TIMESTAMPTZ,

  -- Pickup conversion tracking
  pickup_converted_to_chip BOOLEAN DEFAULT false,
  pickup_chip_transaction_id INTEGER REFERENCES transactions(transaction_id),
  pickup_id_verified BOOLEAN DEFAULT false,
  pickup_id_type VARCHAR(30),
  pickup_authorization_signed BOOLEAN DEFAULT false,

  -- Status and lifecycle
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN (
    'pending',              -- Initial entry
    'pending_verification', -- Awaiting callback verification (orders > threshold)
    'verified',             -- Callback completed, ready for authorization
    'authorized',           -- Payment authorized via Moneris
    'completed',            -- Order fulfilled
    'voided',               -- Voided (e.g., converted to chip at pickup)
    'declined',             -- Payment declined
    'cancelled'             -- Cancelled by employee
  )),

  moneris_order_id VARCHAR(50),
  moneris_receipt_id VARCHAR(50),
  authorization_code VARCHAR(50),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moto_orders_employee ON moto_orders(employee_id);
CREATE INDEX IF NOT EXISTS idx_moto_orders_status ON moto_orders(status);
CREATE INDEX IF NOT EXISTS idx_moto_orders_transaction ON moto_orders(transaction_id);
CREATE INDEX IF NOT EXISTS idx_moto_orders_created ON moto_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_moto_orders_callback ON moto_orders(callback_required, callback_completed)
  WHERE callback_required = true AND callback_completed = false;

-- ============================================================================
-- 4. MOTO permissions
-- ============================================================================

INSERT INTO permissions (code, name, description, category)
VALUES
  ('moto.access', 'MOTO Access', 'Access MOTO transaction entry', 'moto'),
  ('moto.process', 'MOTO Process', 'Process MOTO transactions', 'moto'),
  ('moto.override_limit', 'MOTO Override Limit', 'Override per-employee MOTO limit', 'moto'),
  ('moto.settings', 'MOTO Settings', 'Manage MOTO security settings', 'moto'),
  ('moto.callback_verify', 'MOTO Callback Verify', 'Complete callback verification for MOTO orders', 'moto'),
  ('moto.pickup_convert', 'MOTO Pickup Convert', 'Convert MOTO order to chip transaction at pickup', 'moto')
ON CONFLICT (code) DO NOTHING;

-- Grant MOTO permissions to admin and manager roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('admin', 'manager')
  AND p.code IN ('moto.access', 'moto.process', 'moto.override_limit',
                 'moto.settings', 'moto.callback_verify', 'moto.pickup_convert')
ON CONFLICT DO NOTHING;

-- Grant basic MOTO access to sales role (actual MOTO processing still requires moto_authorized flag)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'sales'
  AND p.code IN ('moto.access', 'moto.process', 'moto.callback_verify', 'moto.pickup_convert')
ON CONFLICT DO NOTHING;
