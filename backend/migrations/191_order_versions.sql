-- ============================================================================
-- Migration 157: Order Versions Table & Snapshot Function
-- ============================================================================
-- Creates:
--   1. order_versions table (snapshot of order state at a point in time)
--   2. create_order_version() function (called before/after amendments)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ORDER VERSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_versions (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,

  -- Snapshot of order state
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,

  -- Version metadata
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  change_summary TEXT,

  -- Store full item snapshot as JSONB
  items_snapshot JSONB NOT NULL DEFAULT '[]',

  CONSTRAINT unique_order_version UNIQUE (order_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_order_versions_order ON order_versions(order_id);
CREATE INDEX IF NOT EXISTS idx_order_versions_created ON order_versions(created_at);

-- ============================================================================
-- 2. create_order_version() FUNCTION
-- ============================================================================
-- Snapshots the current order state and all its line items into order_versions.
-- Called before and after amendments to create a full audit trail.
--
-- Parameters:
--   p_order_id      - The order to snapshot
--   p_user_id       - The user creating the version
--   p_change_summary - Human-readable description of why this version was created
--
-- Returns: The new order_versions.id
-- ============================================================================

CREATE OR REPLACE FUNCTION create_order_version(
  p_order_id INTEGER,
  p_user_id INTEGER,
  p_change_summary TEXT
) RETURNS INTEGER AS $fn$
DECLARE
  v_version_number INTEGER;
  v_order RECORD;
  v_items JSONB;
  v_version_id INTEGER;
BEGIN
  -- Get current order state
  SELECT
    COALESCE(subtotal_cents, 0) as subtotal_cents,
    COALESCE(discount_cents, 0) as discount_cents,
    COALESCE(tax_cents, 0) as tax_cents,
    COALESCE(total_cents, 0) as total_cents
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Snapshot all order items as JSONB array
  SELECT COALESCE(json_agg(json_build_object(
    'id', oi.id,
    'product_id', oi.product_id,
    'product_name', oi.product_name,
    'quantity', oi.quantity,
    'unit_price_cents', oi.unit_price_cents,
    'discount_cents', COALESCE(oi.discount_cents, 0),
    'total_cents', oi.total_cents,
    'fulfillment_status', oi.fulfillment_status
  ))::jsonb, '[]'::jsonb)
  INTO v_items
  FROM order_items oi
  WHERE oi.order_id = p_order_id;

  -- Determine next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_version_number
  FROM order_versions
  WHERE order_id = p_order_id;

  -- Insert version snapshot
  INSERT INTO order_versions (
    order_id, version_number,
    subtotal_cents, discount_cents, tax_cents, total_cents,
    item_count, created_by, change_summary, items_snapshot
  ) VALUES (
    p_order_id, v_version_number,
    v_order.subtotal_cents, v_order.discount_cents,
    v_order.tax_cents, v_order.total_cents,
    jsonb_array_length(v_items), p_user_id,
    p_change_summary, v_items
  )
  RETURNING id INTO v_version_id;

  -- Increment version_number on orders table if column exists
  BEGIN
    EXECUTE 'UPDATE orders SET version_number = $1 WHERE id = $2'
    USING v_version_number, p_order_id;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  RETURN v_version_id;
END;
$fn$ LANGUAGE plpgsql;

COMMIT;
