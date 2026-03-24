-- Migration 199: Delivery Slips
-- Tracks delivery slip lifecycle from warehouse pull to customer signature

BEGIN;

-- Delivery slip status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_slip_status') THEN
    CREATE TYPE delivery_slip_status AS ENUM (
      'scheduled',
      'out_for_delivery',
      'delivered',
      'cancelled'
    );
  END IF;
END$$;

-- Condition on delivery enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_condition') THEN
    CREATE TYPE delivery_condition AS ENUM ('good', 'damaged');
  END IF;
END$$;

-- Sequence for slip numbering per year
CREATE SEQUENCE IF NOT EXISTS delivery_slip_seq START 1;

CREATE TABLE IF NOT EXISTS delivery_slips (
  id                    SERIAL PRIMARY KEY,
  slip_number           VARCHAR(20) NOT NULL UNIQUE,
  sales_order_id        INTEGER REFERENCES sales_orders(id) ON DELETE SET NULL,
  transaction_id        INTEGER REFERENCES transactions(transaction_id) ON DELETE SET NULL,
  customer_id           INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  delivery_date         DATE,
  delivery_address      TEXT,
  delivery_city         VARCHAR(100),
  delivery_province     VARCHAR(5),
  delivery_postal_code  VARCHAR(10),
  access_instructions   TEXT,
  delivery_notes        TEXT,
  status                delivery_slip_status NOT NULL DEFAULT 'scheduled',
  driver_name           VARCHAR(100),
  vehicle_number        VARCHAR(50),
  pulled_by             VARCHAR(100),
  checked_by            VARCHAR(100),
  loaded_by             VARCHAR(100),
  delivered_at          TIMESTAMPTZ,
  signature_obtained    BOOLEAN DEFAULT FALSE,
  condition_on_delivery delivery_condition,
  damage_notes          TEXT,
  created_by            INTEGER REFERENCES users(id),
  tenant_id             INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-generate slip number: DS-YYYY-00001
CREATE OR REPLACE FUNCTION generate_delivery_slip_number()
RETURNS TRIGGER AS $$
DECLARE
  yr TEXT;
  seq_val INTEGER;
BEGIN
  yr := EXTRACT(YEAR FROM NOW())::TEXT;
  seq_val := nextval('delivery_slip_seq');
  NEW.slip_number := 'DS-' || yr || '-' || LPAD(seq_val::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delivery_slip_number ON delivery_slips;
CREATE TRIGGER trg_delivery_slip_number
  BEFORE INSERT ON delivery_slips
  FOR EACH ROW
  WHEN (NEW.slip_number IS NULL OR NEW.slip_number = '')
  EXECUTE FUNCTION generate_delivery_slip_number();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_delivery_slips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delivery_slips_updated_at ON delivery_slips;
CREATE TRIGGER trg_delivery_slips_updated_at
  BEFORE UPDATE ON delivery_slips
  FOR EACH ROW
  EXECUTE FUNCTION update_delivery_slips_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_delivery_slips_status ON delivery_slips(status);
CREATE INDEX IF NOT EXISTS idx_delivery_slips_transaction ON delivery_slips(transaction_id);
CREATE INDEX IF NOT EXISTS idx_delivery_slips_customer ON delivery_slips(customer_id);
CREATE INDEX IF NOT EXISTS idx_delivery_slips_date ON delivery_slips(delivery_date);
CREATE INDEX IF NOT EXISTS idx_delivery_slips_tenant ON delivery_slips(tenant_id);

-- RLS
ALTER TABLE delivery_slips ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'delivery_slips' AND policyname = 'delivery_slips_tenant_isolation'
  ) THEN
    CREATE POLICY delivery_slips_tenant_isolation ON delivery_slips
      USING (tenant_id = current_setting('app.current_tenant', true)::INTEGER);
  END IF;
END$$;

COMMIT;
