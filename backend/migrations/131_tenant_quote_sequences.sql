-- Migration 131: Tenant Quote Sequences & Settings
-- Adds per-tenant quote number sequences and tenant branding settings
-- Part of multi-tenancy quotation module update

-- Per-tenant quote number sequences
CREATE TABLE IF NOT EXISTS tenant_quote_sequences (
  tenant_id UUID NOT NULL REFERENCES tenants(id) PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0,
  prefix VARCHAR(10) NOT NULL DEFAULT 'QT',
  format VARCHAR(50) NOT NULL DEFAULT '{prefix}-{year}-{number:4}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed for default tenant from current MAX
INSERT INTO tenant_quote_sequences (tenant_id, last_number, prefix)
SELECT
  'a0000000-0000-0000-0000-000000000000',
  COALESCE(MAX(CAST(SUBSTRING(quote_number FROM 'QT-\d{4}-(\d+)') AS INTEGER)), 0),
  'QT'
FROM quotations
ON CONFLICT (tenant_id) DO NOTHING;

-- Tenant settings for branding / PDF
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id UUID NOT NULL REFERENCES tenants(id) PRIMARY KEY,
  company_name TEXT NOT NULL DEFAULT 'Your Company',
  company_address TEXT NOT NULL DEFAULT '',
  company_city TEXT NOT NULL DEFAULT '',
  company_phone TEXT NOT NULL DEFAULT '',
  company_email TEXT NOT NULL DEFAULT '',
  company_website TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#1e40af',
  tax_rate NUMERIC(5,2) DEFAULT 13.00,
  quote_terms TEXT,
  quote_expiry_days INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default tenant from current env-style defaults
INSERT INTO tenant_settings (tenant_id, company_name, company_address, company_city, company_phone, company_email, company_website)
VALUES (
  'a0000000-0000-0000-0000-000000000000',
  COALESCE(current_setting('app.company_name', true), 'TeleTime'),
  '', '', '', '', ''
)
ON CONFLICT (tenant_id) DO NOTHING;

-- Backfill: fix any quotations rows with wrong/default tenant_id
UPDATE quotations q
SET tenant_id = u.tenant_id
FROM users u
WHERE q.created_by = u.id::text
  AND q.tenant_id = 'a0000000-0000-0000-0000-000000000000'
  AND u.tenant_id != 'a0000000-0000-0000-0000-000000000000';

-- Same for quotation_items
UPDATE quotation_items qi
SET tenant_id = q.tenant_id
FROM quotations q
WHERE qi.quotation_id = q.id
  AND qi.tenant_id != q.tenant_id;
