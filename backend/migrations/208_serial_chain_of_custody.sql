-- Migration 208: Serial Number Chain-of-Custody schema changes
-- Closes integration gaps across quotes, invoices, delivery, and manufacturer RAs

-- ============================================================
-- 1. Add serial_number to quotation_items
-- ============================================================
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS serial_number VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_quotation_items_serial
  ON quotation_items (serial_number) WHERE serial_number IS NOT NULL;

-- ============================================================
-- 2. Add serial_number to invoice_items
-- ============================================================
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS serial_number VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_invoice_items_serial
  ON invoice_items (serial_number) WHERE serial_number IS NOT NULL;

-- ============================================================
-- 3. Expand serial_events event_type CHECK constraint
--    Adding: delivered, reserved, ra_created
-- ============================================================
ALTER TABLE serial_events
  DROP CONSTRAINT IF EXISTS serial_events_event_type_check;

ALTER TABLE serial_events
  ADD CONSTRAINT serial_events_event_type_check
  CHECK (event_type IN (
    'received', 'sold', 'returned', 'transferred', 'warranty_claim',
    'recalled', 'damaged', 'scrapped',
    'delivered', 'reserved', 'ra_created'
  ));

-- ============================================================
-- 4. Add serial_id FK to manufacturer_ras
-- ============================================================
ALTER TABLE manufacturer_ras
  ADD COLUMN IF NOT EXISTS serial_id INTEGER REFERENCES product_serials(id);

CREATE INDEX IF NOT EXISTS idx_mfr_ras_serial_id
  ON manufacturer_ras (serial_id) WHERE serial_id IS NOT NULL;

-- ============================================================
-- 5. New delivery_slip_items junction table
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_slip_items (
  id                      SERIAL PRIMARY KEY,
  delivery_slip_id        INTEGER NOT NULL REFERENCES delivery_slips(id) ON DELETE CASCADE,
  product_id              INTEGER REFERENCES products(id),
  serial_id               INTEGER REFERENCES product_serials(id),
  quantity                INTEGER NOT NULL DEFAULT 1,
  condition_at_load       VARCHAR(20) DEFAULT 'good',
  condition_at_delivery   VARCHAR(20),
  verified_at_delivery    BOOLEAN DEFAULT false,
  notes                   TEXT,
  tenant_id               INTEGER,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dsi_slip
  ON delivery_slip_items (delivery_slip_id);

CREATE INDEX IF NOT EXISTS idx_dsi_serial
  ON delivery_slip_items (serial_id) WHERE serial_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dsi_tenant
  ON delivery_slip_items (tenant_id);
