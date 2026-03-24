-- ============================================================================
-- Migration 198: Manufacturer Return Authorization (RA) System
-- Tracks items sent to manufacturers for warranty/defect returns,
-- with aging, communication logs, and credit tracking.
-- ============================================================================

BEGIN;

-- RA status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ra_status') THEN
    CREATE TYPE ra_status AS ENUM (
      'pending_approval', 'approved', 'shipped',
      'received', 'credited', 'closed', 'denied'
    );
  END IF;
END
$$;

COMMIT;

BEGIN;

-- RA reason enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ra_reason') THEN
    CREATE TYPE ra_reason AS ENUM ('defective', 'warranty', 'damaged', 'wrong_item');
  END IF;
END
$$;

COMMIT;

BEGIN;

-- Main manufacturer_ras table
CREATE TABLE IF NOT EXISTS manufacturer_ras (
  id                       SERIAL PRIMARY KEY,
  ra_number                VARCHAR(20) NOT NULL UNIQUE,
  manufacturer             VARCHAR(100) NOT NULL,
  manufacturer_ra_number   VARCHAR(100),
  hub_return_id            INTEGER REFERENCES hub_returns(id),
  warranty_claim_id        INTEGER REFERENCES warranty_claims(id),
  product_id               INTEGER REFERENCES products(id),
  serial_number            VARCHAR(100),
  reason                   ra_reason NOT NULL DEFAULT 'defective',
  status                   ra_status NOT NULL DEFAULT 'pending_approval',
  shipped_date             DATE,
  expected_credit_date     DATE,
  received_date            DATE,
  credit_date              DATE,
  credit_amount            INTEGER DEFAULT 0,            -- cents
  credit_reference         VARCHAR(100),
  shipping_tracking_number VARCHAR(100),
  shipping_carrier         VARCHAR(50),
  notes                    TEXT,
  communication_log        JSONB NOT NULL DEFAULT '[]',  -- [{date, user, user_name, note}]
  created_by               INTEGER REFERENCES users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id                INTEGER
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mfr_ras_manufacturer ON manufacturer_ras(manufacturer);
CREATE INDEX IF NOT EXISTS idx_mfr_ras_status ON manufacturer_ras(status);
CREATE INDEX IF NOT EXISTS idx_mfr_ras_product ON manufacturer_ras(product_id);
CREATE INDEX IF NOT EXISTS idx_mfr_ras_hub_return ON manufacturer_ras(hub_return_id);
CREATE INDEX IF NOT EXISTS idx_mfr_ras_warranty_claim ON manufacturer_ras(warranty_claim_id);
CREATE INDEX IF NOT EXISTS idx_mfr_ras_shipped ON manufacturer_ras(shipped_date) WHERE shipped_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mfr_ras_tenant ON manufacturer_ras(tenant_id);

-- Sequence for RA numbers
CREATE SEQUENCE IF NOT EXISTS manufacturer_ra_seq START WITH 1 INCREMENT BY 1;

-- Auto-generate RA-YYYY-00001 format
CREATE OR REPLACE FUNCTION generate_manufacturer_ra_number()
RETURNS TRIGGER AS $$
DECLARE
  current_year TEXT;
  next_seq INTEGER;
BEGIN
  current_year := EXTRACT(YEAR FROM NOW())::TEXT;
  next_seq := nextval('manufacturer_ra_seq');
  NEW.ra_number := 'RA-' || current_year || '-' || LPAD(next_seq::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_manufacturer_ra_number ON manufacturer_ras;
CREATE TRIGGER trg_manufacturer_ra_number
  BEFORE INSERT ON manufacturer_ras
  FOR EACH ROW
  WHEN (NEW.ra_number IS NULL OR NEW.ra_number = '')
  EXECUTE FUNCTION generate_manufacturer_ra_number();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_manufacturer_ras_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_manufacturer_ras_updated ON manufacturer_ras;
CREATE TRIGGER trg_manufacturer_ras_updated
  BEFORE UPDATE ON manufacturer_ras
  FOR EACH ROW
  EXECUTE FUNCTION update_manufacturer_ras_timestamp();

-- ============================================================================
-- Aging view: all open RAs with days outstanding
-- ============================================================================
CREATE OR REPLACE VIEW v_manufacturer_ra_aging AS
SELECT
  ra.id,
  ra.ra_number,
  ra.manufacturer,
  ra.manufacturer_ra_number,
  ra.status,
  ra.reason,
  ra.serial_number,
  p.name AS product_name,
  p.sku AS product_sku,
  ra.shipped_date,
  ra.expected_credit_date,
  ra.credit_amount,
  CASE
    WHEN ra.shipped_date IS NOT NULL THEN (CURRENT_DATE - ra.shipped_date)
    ELSE (CURRENT_DATE - ra.created_at::date)
  END AS days_outstanding,
  CASE
    WHEN ra.shipped_date IS NOT NULL AND (CURRENT_DATE - ra.shipped_date) > 30 THEN true
    ELSE false
  END AS overdue,
  ra.shipping_tracking_number,
  ra.shipping_carrier,
  ra.created_at,
  ra.created_by
FROM manufacturer_ras ra
LEFT JOIN products p ON ra.product_id = p.id
WHERE ra.status NOT IN ('closed', 'denied', 'credited');

COMMIT;
