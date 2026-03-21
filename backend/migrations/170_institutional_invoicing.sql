-- ============================================================================
-- Migration 170: Institutional Invoicing & Payment Tracking — Phase 2
-- Formal invoices consolidated from accepted quotes, payment recording,
-- and credit lifecycle management.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Invoice number sequence
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS institutional_invoice_seq START 1;

-- ============================================================================
-- 2. institutional_invoices
-- ============================================================================

CREATE TABLE IF NOT EXISTS institutional_invoices (
  id                    SERIAL PRIMARY KEY,
  invoice_number        VARCHAR(50) UNIQUE NOT NULL,
  profile_id            INTEGER NOT NULL
                          REFERENCES institutional_profiles(id),
  quote_ids             INTEGER[],
  subtotal_cents        INTEGER NOT NULL,
  tax_cents             INTEGER NOT NULL DEFAULT 0,
  total_cents           INTEGER NOT NULL,
  issued_date           DATE NOT NULL,
  due_date              DATE NOT NULL,
  status                VARCHAR(30) NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'sent', 'partially_paid', 'paid', 'overdue', 'void')),
  paid_cents            INTEGER NOT NULL DEFAULT 0,
  paid_date             DATE,
  payment_reference     VARCHAR(100),
  pdf_url               TEXT,
  notes                 TEXT,
  created_by            INTEGER REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. institutional_payments
-- ============================================================================

CREATE TABLE IF NOT EXISTS institutional_payments (
  id                    SERIAL PRIMARY KEY,
  invoice_id            INTEGER NOT NULL
                          REFERENCES institutional_invoices(id),
  amount_cents          INTEGER NOT NULL,
  payment_method        VARCHAR(30) NOT NULL
    CHECK (payment_method IN ('cheque', 'eft', 'wire', 'credit_card')),
  payment_reference     VARCHAR(100),
  received_date         DATE NOT NULL,
  recorded_by           INTEGER REFERENCES users(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inst_invoices_profile
  ON institutional_invoices(profile_id);
CREATE INDEX IF NOT EXISTS idx_inst_invoices_status
  ON institutional_invoices(status);
CREATE INDEX IF NOT EXISTS idx_inst_invoices_due_date
  ON institutional_invoices(due_date)
  WHERE status NOT IN ('paid', 'void');
CREATE INDEX IF NOT EXISTS idx_inst_payments_invoice
  ON institutional_payments(invoice_id);

-- ============================================================================
-- 5. Auto-update trigger on institutional_invoices.updated_at
--    update_updated_at_column() already exists from migration 167/169
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trg_inst_invoices_updated_at'
      AND event_object_table = 'institutional_invoices'
  ) THEN
    CREATE TRIGGER trg_inst_invoices_updated_at
      BEFORE UPDATE ON institutional_invoices
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================================
-- 6. RBAC Permissions
-- ============================================================================

INSERT INTO permissions (code, name, category, description) VALUES
  ('institutional.invoices.view',   'View institutional invoices',   'hub', 'View institutional buyer invoices'),
  ('institutional.invoices.create', 'Create institutional invoices', 'hub', 'Generate invoices from accepted quotes'),
  ('institutional.invoices.edit',   'Edit institutional invoices',   'hub', 'Update and void institutional invoices'),
  ('institutional.payments.view',   'View institutional payments',   'hub', 'View payment records on institutional invoices'),
  ('institutional.payments.create', 'Record institutional payments', 'hub', 'Record payments against institutional invoices')
ON CONFLICT (code) DO NOTHING;

-- Admin + Manager: full access both tables
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('admin', 'manager')
  AND p.code IN (
    'institutional.invoices.view', 'institutional.invoices.create', 'institutional.invoices.edit',
    'institutional.payments.view', 'institutional.payments.create'
  )
ON CONFLICT DO NOTHING;

-- Senior sales + Sales: SELECT on invoices only, no payment access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('senior_sales', 'sales')
  AND p.code IN ('institutional.invoices.view')
ON CONFLICT DO NOTHING;

COMMIT;
