-- ============================================================================
-- Migration 168: Province-Aware Tax Engine
-- Standalone tax rate tables, exemption certificates, and transaction
-- tax breakdown records. Called by POS, quotation builder, and invoicing.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. tax_rates — canonical Canadian tax rates by province
-- ============================================================================

CREATE TABLE IF NOT EXISTS tax_rates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  province_code    CHAR(2) NOT NULL,
  tax_type         VARCHAR(10) NOT NULL
    CHECK (tax_type IN ('GST', 'HST', 'PST', 'QST')),
  rate             NUMERIC(7,5) NOT NULL,
  effective_date   DATE NOT NULL,
  end_date         DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (province_code, tax_type, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_tax_rates_province
  ON tax_rates(province_code);
CREATE INDEX IF NOT EXISTS idx_tax_rates_active
  ON tax_rates(province_code, effective_date)
  WHERE end_date IS NULL;

-- ============================================================================
-- 2. tax_exemption_certificates
--    customer_id and verified_by are INTEGER to match existing customers/users
-- ============================================================================

CREATE TABLE IF NOT EXISTS tax_exemption_certificates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         INTEGER NOT NULL REFERENCES customers(id),
  province_code       CHAR(2) NOT NULL,
  certificate_number  VARCHAR(100) NOT NULL,
  exempt_tax_types    TEXT[] NOT NULL,
  issued_date         DATE NOT NULL,
  expiry_date         DATE,
  document_url        TEXT,
  verified            BOOLEAN DEFAULT FALSE,
  verified_by         INTEGER REFERENCES users(id),
  verified_at         TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_exempt_customer
  ON tax_exemption_certificates(customer_id);
CREATE INDEX IF NOT EXISTS idx_tax_exempt_province
  ON tax_exemption_certificates(customer_id, province_code);
CREATE INDEX IF NOT EXISTS idx_tax_exempt_active
  ON tax_exemption_certificates(customer_id, province_code)
  WHERE verified = TRUE;

-- ============================================================================
-- 3. transaction_tax_breakdown — audit record per taxed transaction
--    transaction_id is INTEGER to match transactions.transaction_id
-- ============================================================================

CREATE TABLE IF NOT EXISTS transaction_tax_breakdown (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   INTEGER NOT NULL,
  transaction_type VARCHAR(20) NOT NULL
    CHECK (transaction_type IN ('pos_sale', 'quote', 'invoice')),
  province_code    CHAR(2) NOT NULL,
  subtotal_cents   INTEGER NOT NULL,
  gst_rate         NUMERIC(7,5),
  gst_cents        INTEGER,
  hst_rate         NUMERIC(7,5),
  hst_cents        INTEGER,
  pst_rate         NUMERIC(7,5),
  pst_cents        INTEGER,
  qst_rate         NUMERIC(7,5),
  qst_cents        INTEGER,
  total_tax_cents  INTEGER NOT NULL,
  total_cents      INTEGER NOT NULL,
  exempt_cert_id   UUID REFERENCES tax_exemption_certificates(id),
  calculated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_breakdown_txn
  ON transaction_tax_breakdown(transaction_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_tax_breakdown_province
  ON transaction_tax_breakdown(province_code);

-- ============================================================================
-- 4. Seed current Canadian tax rates (effective 2024-01-01)
-- ============================================================================

INSERT INTO tax_rates (province_code, tax_type, rate, effective_date) VALUES
  ('ON', 'HST', 0.1300, '2024-01-01'),
  ('BC', 'GST', 0.0500, '2024-01-01'),
  ('BC', 'PST', 0.0700, '2024-01-01'),
  ('AB', 'GST', 0.0500, '2024-01-01'),
  ('QC', 'GST', 0.0500, '2024-01-01'),
  ('QC', 'QST', 0.09975, '2024-01-01'),
  ('MB', 'GST', 0.0500, '2024-01-01'),
  ('MB', 'PST', 0.0700, '2024-01-01'),
  ('SK', 'GST', 0.0500, '2024-01-01'),
  ('SK', 'PST', 0.0600, '2024-01-01'),
  ('NS', 'HST', 0.1500, '2024-01-01'),
  ('NB', 'HST', 0.1500, '2024-01-01'),
  ('NL', 'HST', 0.1500, '2024-01-01'),
  ('PE', 'HST', 0.1500, '2024-01-01'),
  ('NT', 'GST', 0.0500, '2024-01-01'),
  ('NU', 'GST', 0.0500, '2024-01-01'),
  ('YT', 'GST', 0.0500, '2024-01-01')
ON CONFLICT (province_code, tax_type, effective_date) DO NOTHING;

-- ============================================================================
-- 5. RBAC Permissions
-- ============================================================================

INSERT INTO permissions (code, name, category, description) VALUES
  ('tax.rates.view',       'View tax rates',             'hub', 'View provincial tax rate tables'),
  ('tax.rates.edit',       'Edit tax rates',             'hub', 'Create and modify tax rates'),
  ('tax.exemptions.view',  'View tax exemptions',        'hub', 'View customer tax exemption certificates'),
  ('tax.exemptions.edit',  'Manage tax exemptions',      'hub', 'Upload and verify exemption certificates'),
  ('tax.breakdown.view',   'View tax breakdowns',        'hub', 'View transaction tax calculation records')
ON CONFLICT (code) DO NOTHING;

-- Admin: full access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND p.code IN ('tax.rates.view', 'tax.rates.edit', 'tax.exemptions.view',
                 'tax.exemptions.edit', 'tax.breakdown.view')
ON CONFLICT DO NOTHING;

-- Manager: full access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'manager'
  AND p.code IN ('tax.rates.view', 'tax.rates.edit', 'tax.exemptions.view',
                 'tax.exemptions.edit', 'tax.breakdown.view')
ON CONFLICT DO NOTHING;

-- Sales roles: read-only on rates and exemptions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('sales', 'senior_sales')
  AND p.code IN ('tax.rates.view', 'tax.exemptions.view')
ON CONFLICT DO NOTHING;

COMMIT;
