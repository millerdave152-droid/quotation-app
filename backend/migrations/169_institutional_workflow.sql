-- ============================================================================
-- Migration 169: Institutional Buyer Workflow — Phase 1
-- Core profiles, contacts, and delivery addresses for government and
-- institutional procurement. All changes are additive — no existing
-- tables are replaced or dropped.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. institutional_profiles — one-to-one with customers
-- ============================================================================

CREATE TABLE IF NOT EXISTS institutional_profiles (
  id                      SERIAL PRIMARY KEY,
  customer_id             INTEGER NOT NULL UNIQUE REFERENCES customers(id),
  org_type                VARCHAR(50) NOT NULL
    CHECK (org_type IN ('housing_authority', 'school', 'municipality', 'corporation', 'other')),
  org_name                VARCHAR(255) NOT NULL,
  vendor_number           VARCHAR(100),
  payment_terms           VARCHAR(20) NOT NULL DEFAULT 'net30'
    CHECK (payment_terms IN ('net30', 'net60', 'net90', 'cod', 'prepaid')),
  credit_limit_cents      INTEGER NOT NULL DEFAULT 0,
  credit_used_cents       INTEGER NOT NULL DEFAULT 0,
  preferred_contact_id    INTEGER,  -- FK added after contacts table created
  requires_po             BOOLEAN NOT NULL DEFAULT TRUE,
  requires_quote_approval BOOLEAN NOT NULL DEFAULT FALSE,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  notes                   TEXT,
  created_by              INTEGER REFERENCES users(id),
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. institutional_contacts
-- ============================================================================

CREATE TABLE IF NOT EXISTS institutional_contacts (
  id              SERIAL PRIMARY KEY,
  profile_id      INTEGER NOT NULL REFERENCES institutional_profiles(id),
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  title           VARCHAR(100),
  department      VARCHAR(100),
  email           VARCHAR(255),
  phone           VARCHAR(30),
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  can_issue_po    BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. Add FK from institutional_profiles.preferred_contact_id
--    to institutional_contacts now that the contacts table exists
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_preferred_contact'
      AND table_name = 'institutional_profiles'
  ) THEN
    ALTER TABLE institutional_profiles
      ADD CONSTRAINT fk_preferred_contact
      FOREIGN KEY (preferred_contact_id)
      REFERENCES institutional_contacts(id);
  END IF;
END $$;

-- ============================================================================
-- 4. institutional_delivery_addresses
-- ============================================================================

CREATE TABLE IF NOT EXISTS institutional_delivery_addresses (
  id              SERIAL PRIMARY KEY,
  profile_id      INTEGER NOT NULL REFERENCES institutional_profiles(id),
  site_name       VARCHAR(100) NOT NULL,
  address_line1   VARCHAR(255) NOT NULL,
  address_line2   VARCHAR(255),
  city            VARCHAR(100) NOT NULL,
  province_code   CHAR(2) NOT NULL,
  postal_code     VARCHAR(10) NOT NULL,
  contact_name    VARCHAR(150),
  contact_phone   VARCHAR(30),
  access_notes    TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. Extend quotations table (additive only)
-- ============================================================================

ALTER TABLE quotations ADD COLUMN IF NOT EXISTS
  institutional_profile_id INTEGER REFERENCES institutional_profiles(id);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS
  po_number VARCHAR(100);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS
  budget_code VARCHAR(100);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS
  department_reference VARCHAR(150);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS
  payment_terms VARCHAR(20);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS
  delivery_address_id INTEGER
    REFERENCES institutional_delivery_addresses(id);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS
  tax_exempt_cert_id UUID
    REFERENCES tax_exemption_certificates(id);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS
  requires_formal_invoice BOOLEAN DEFAULT FALSE;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS
  consolidated_invoice_group VARCHAR(100);

-- ============================================================================
-- 6. Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inst_profiles_customer
  ON institutional_profiles(customer_id);
CREATE INDEX IF NOT EXISTS idx_inst_contacts_profile
  ON institutional_contacts(profile_id);
CREATE INDEX IF NOT EXISTS idx_inst_addresses_profile
  ON institutional_delivery_addresses(profile_id);
CREATE INDEX IF NOT EXISTS idx_quotations_inst_profile
  ON quotations(institutional_profile_id)
  WHERE institutional_profile_id IS NOT NULL;

-- ============================================================================
-- 7. Auto-update trigger on institutional_profiles.updated_at
--    update_updated_at_column() already exists from migration 167
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
    WHERE trigger_name = 'trg_inst_profiles_updated_at'
      AND event_object_table = 'institutional_profiles'
  ) THEN
    CREATE TRIGGER trg_inst_profiles_updated_at
      BEFORE UPDATE ON institutional_profiles
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================================
-- 8. RBAC Permissions
-- ============================================================================

INSERT INTO permissions (code, name, category, description) VALUES
  ('institutional.profiles.view',   'View institutional profiles',   'hub', 'View institutional buyer profiles'),
  ('institutional.profiles.create', 'Create institutional profiles', 'hub', 'Create new institutional buyer profiles'),
  ('institutional.profiles.edit',   'Edit institutional profiles',   'hub', 'Update institutional buyer profiles'),
  ('institutional.contacts.view',   'View institutional contacts',   'hub', 'View institutional buyer contacts'),
  ('institutional.contacts.create', 'Create institutional contacts', 'hub', 'Add contacts to institutional profiles'),
  ('institutional.contacts.edit',   'Edit institutional contacts',   'hub', 'Update institutional buyer contacts'),
  ('institutional.addresses.view',  'View delivery addresses',       'hub', 'View institutional delivery addresses'),
  ('institutional.addresses.create','Create delivery addresses',     'hub', 'Add delivery addresses to institutional profiles'),
  ('institutional.addresses.edit',  'Edit delivery addresses',       'hub', 'Update institutional delivery addresses')
ON CONFLICT (code) DO NOTHING;

-- Admin + Manager: full access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('admin', 'manager')
  AND p.code IN (
    'institutional.profiles.view', 'institutional.profiles.create', 'institutional.profiles.edit',
    'institutional.contacts.view', 'institutional.contacts.create', 'institutional.contacts.edit',
    'institutional.addresses.view', 'institutional.addresses.create', 'institutional.addresses.edit'
  )
ON CONFLICT DO NOTHING;

-- Senior sales + Sales: SELECT + INSERT on profiles/contacts/addresses; UPDATE on contacts
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('senior_sales', 'sales')
  AND p.code IN (
    'institutional.profiles.view', 'institutional.profiles.create',
    'institutional.contacts.view', 'institutional.contacts.create', 'institutional.contacts.edit',
    'institutional.addresses.view', 'institutional.addresses.create'
  )
ON CONFLICT DO NOTHING;

COMMIT;
