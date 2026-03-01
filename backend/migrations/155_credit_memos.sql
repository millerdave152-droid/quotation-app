-- Migration 155: Credit Memo System
-- Creates credit_memos, credit_memo_lines, credit_memo_reason_codes tables,
-- credit_memo_status enum, sequence, and amendment/credit-memo permissions.
-- Idempotent: safe to re-run.

BEGIN;

-- ============================================================================
-- 0. ENSURE order_amendments TABLE EXISTS (referenced by credit_memos FK)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE amendment_type AS ENUM (
    'item_added', 'item_removed', 'item_modified',
    'quantity_changed', 'price_changed', 'discount_changed',
    'fulfillment_updated', 'order_cancelled', 'order_reinstated'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE amendment_status AS ENUM (
    'draft', 'pending_approval', 'approved',
    'rejected', 'applied', 'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS order_amendments (
  id SERIAL PRIMARY KEY,
  amendment_number VARCHAR(30) NOT NULL UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amendment_type amendment_type NOT NULL,
  status amendment_status DEFAULT 'draft',
  reason TEXT,
  previous_total_cents INTEGER NOT NULL,
  new_total_cents INTEGER NOT NULL,
  difference_cents INTEGER NOT NULL,
  use_quote_prices BOOLEAN DEFAULT FALSE,
  use_current_prices BOOLEAN DEFAULT FALSE,
  price_override BOOLEAN DEFAULT FALSE,
  requires_approval BOOLEAN DEFAULT FALSE,
  approval_threshold_cents INTEGER,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  applied_by INTEGER REFERENCES users(id),
  resulting_version_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_amendments_order ON order_amendments(order_id);
CREATE INDEX IF NOT EXISTS idx_amendments_status ON order_amendments(status);
CREATE INDEX IF NOT EXISTS idx_amendments_created ON order_amendments(created_at);

-- ============================================================================
-- 1. CREDIT MEMO REASON CODES LOOKUP TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_memo_reason_codes (
  code VARCHAR(50) PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0
);

-- Seed reason codes (idempotent via ON CONFLICT)
INSERT INTO credit_memo_reason_codes (code, label, description, sort_order) VALUES
  ('price_adjustment',   'Price Adjustment',   'Credit issued for a price correction or price-match',          10),
  ('item_return',        'Item Return',        'Credit issued for returned merchandise',                       20),
  ('order_cancellation', 'Order Cancellation', 'Credit issued for a fully cancelled order',                    30),
  ('quantity_change',    'Quantity Change',     'Credit issued when ordered quantity is reduced',               40),
  ('billing_error',      'Billing Error',      'Credit issued to correct an invoicing or billing mistake',     50),
  ('goodwill',           'Goodwill',           'Discretionary credit issued as a customer-satisfaction gesture',60)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. CREDIT MEMO STATUS ENUM
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE credit_memo_status AS ENUM ('draft', 'issued', 'applied', 'voided');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 3. CREDIT MEMO NUMBER SEQUENCE
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS credit_memo_number_seq
  START WITH 1
  INCREMENT BY 1;

-- ============================================================================
-- 4. CREDIT MEMOS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_memos (
  id                      SERIAL PRIMARY KEY,
  credit_memo_number      VARCHAR(20) UNIQUE,
  order_id                INTEGER NOT NULL REFERENCES orders(id),
  amendment_id            INTEGER REFERENCES order_amendments(id),
  original_invoice_number VARCHAR(50),
  customer_id             INTEGER REFERENCES customers(id),

  -- Reasons
  reason                  TEXT,            -- customer-facing
  internal_notes          TEXT,            -- internal-only
  reason_code             VARCHAR(50) REFERENCES credit_memo_reason_codes(code),

  -- Money (all in cents)
  subtotal_cents          INTEGER NOT NULL,
  discount_cents          INTEGER NOT NULL DEFAULT 0,
  hst_cents               INTEGER NOT NULL DEFAULT 0,
  gst_cents               INTEGER NOT NULL DEFAULT 0,
  pst_cents               INTEGER NOT NULL DEFAULT 0,
  tax_total_cents         INTEGER NOT NULL DEFAULT 0,
  total_cents             INTEGER NOT NULL,

  -- Tax province
  province                VARCHAR(2),

  -- Status
  status                  credit_memo_status NOT NULL DEFAULT 'draft',

  -- Application
  application_method      VARCHAR(30),     -- refund_to_original, store_credit, manual_adjustment

  -- Lifecycle timestamps / actors
  issued_at               TIMESTAMPTZ,
  issued_by               INTEGER REFERENCES users(id),
  applied_at              TIMESTAMPTZ,
  applied_by              INTEGER REFERENCES users(id),
  voided_at               TIMESTAMPTZ,
  voided_by               INTEGER REFERENCES users(id),
  void_reason             TEXT,

  -- PDF
  pdf_url                 TEXT,

  -- Audit
  created_by              INTEGER NOT NULL REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_memos_order      ON credit_memos(order_id);
CREATE INDEX IF NOT EXISTS idx_credit_memos_customer   ON credit_memos(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_memos_amendment  ON credit_memos(amendment_id);
CREATE INDEX IF NOT EXISTS idx_credit_memos_status     ON credit_memos(status);
CREATE INDEX IF NOT EXISTS idx_credit_memos_created_at ON credit_memos(created_at);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION update_credit_memo_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_memo_updated ON credit_memos;
CREATE TRIGGER trg_credit_memo_updated
  BEFORE UPDATE ON credit_memos
  FOR EACH ROW
  EXECUTE FUNCTION update_credit_memo_timestamp();

-- ============================================================================
-- 5. CREDIT MEMO LINES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_memo_lines (
  id                       SERIAL PRIMARY KEY,
  credit_memo_id           INTEGER NOT NULL REFERENCES credit_memos(id) ON DELETE CASCADE,
  line_number              INTEGER NOT NULL,
  product_id               INTEGER REFERENCES products(id),
  product_sku              VARCHAR(100),
  product_name             VARCHAR(500),
  quantity                 INTEGER NOT NULL,
  original_unit_price_cents INTEGER NOT NULL,
  credited_unit_price_cents INTEGER NOT NULL,
  discount_cents           INTEGER NOT NULL DEFAULT 0,
  tax_rate                 NUMERIC(5,4) NOT NULL DEFAULT 0,
  tax_cents                INTEGER NOT NULL DEFAULT 0,
  line_total_cents         INTEGER NOT NULL,
  description              TEXT
);

CREATE INDEX IF NOT EXISTS idx_credit_memo_lines_memo ON credit_memo_lines(credit_memo_id);

-- ============================================================================
-- 6. PERMISSIONS
-- ============================================================================

-- Insert amendment + credit-memo permissions
INSERT INTO permissions (code, name, description, category) VALUES
  ('orders.amend',          'Amend Orders',          'Create order amendments',                    'orders'),
  ('orders.amend.any',      'Amend Any Order',       'Amend orders created by any user',           'orders'),
  ('orders.amend.approve',  'Approve Amendments',    'Approve or reject order amendments',         'orders'),
  ('credit_memos.create',   'Create Credit Memos',   'Create new credit memos',                    'orders'),
  ('credit_memos.view',     'View Credit Memos',     'View credit memos and their details',        'orders'),
  ('credit_memos.apply',    'Apply Credit Memos',    'Apply credit memos (issue refunds/credits)', 'orders'),
  ('credit_memos.void',     'Void Credit Memos',     'Void issued or applied credit memos',        'orders')
ON CONFLICT (code) DO NOTHING;

-- Grant ALL 7 permissions to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND p.code IN (
    'orders.amend', 'orders.amend.any', 'orders.amend.approve',
    'credit_memos.create', 'credit_memos.view', 'credit_memos.apply', 'credit_memos.void'
  )
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Grant all EXCEPT credit_memos.void to manager role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'manager'
  AND p.code IN (
    'orders.amend', 'orders.amend.any', 'orders.amend.approve',
    'credit_memos.create', 'credit_memos.view', 'credit_memos.apply'
  )
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Grant orders.amend + credit_memos.view to senior_sales and sales roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('senior_sales', 'sales')
  AND p.code IN ('orders.amend', 'credit_memos.view')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

COMMIT;
