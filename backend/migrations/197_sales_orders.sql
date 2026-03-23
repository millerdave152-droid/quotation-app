-- ============================================================================
-- Migration 197: Sales Orders Table
-- Links POS transactions to formal Sales Order Confirmations
-- Supports auto-invoice conversion for partial/account payments
-- ============================================================================

BEGIN;

-- Sales order status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sales_order_status') THEN
    CREATE TYPE sales_order_status AS ENUM ('draft', 'confirmed', 'invoiced', 'cancelled');
  END IF;
END
$$;

COMMIT;

BEGIN;

-- Sales orders table
CREATE TABLE IF NOT EXISTS sales_orders (
  id                   SERIAL PRIMARY KEY,
  sales_order_number   VARCHAR(20) NOT NULL UNIQUE,
  transaction_id       INTEGER NOT NULL REFERENCES transactions(transaction_id),
  customer_id          INTEGER REFERENCES customers(id),
  status               sales_order_status NOT NULL DEFAULT 'confirmed',
  total_amount         INTEGER NOT NULL DEFAULT 0,        -- cents
  balance_due          INTEGER NOT NULL DEFAULT 0,        -- cents
  invoice_id           INTEGER,                           -- FK to invoices if converted
  created_by           INTEGER REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id            INTEGER
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sales_orders_transaction ON sales_orders(transaction_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_number ON sales_orders(sales_order_number);
CREATE INDEX IF NOT EXISTS idx_sales_orders_tenant ON sales_orders(tenant_id);

-- Sequence for auto-incrementing order numbers within each year
CREATE SEQUENCE IF NOT EXISTS sales_order_seq START WITH 1 INCREMENT BY 1;

-- Function to generate SO-YYYY-00001 format numbers
CREATE OR REPLACE FUNCTION generate_sales_order_number()
RETURNS TRIGGER AS $$
DECLARE
  current_year TEXT;
  next_seq INTEGER;
BEGIN
  current_year := EXTRACT(YEAR FROM NOW())::TEXT;
  next_seq := nextval('sales_order_seq');
  NEW.sales_order_number := 'SO-' || current_year || '-' || LPAD(next_seq::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate order number on insert
DROP TRIGGER IF EXISTS trg_sales_order_number ON sales_orders;
CREATE TRIGGER trg_sales_order_number
  BEFORE INSERT ON sales_orders
  FOR EACH ROW
  WHEN (NEW.sales_order_number IS NULL OR NEW.sales_order_number = '')
  EXECUTE FUNCTION generate_sales_order_number();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_sales_orders_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sales_orders_updated ON sales_orders;
CREATE TRIGGER trg_sales_orders_updated
  BEFORE UPDATE ON sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_sales_orders_timestamp();

COMMIT;
