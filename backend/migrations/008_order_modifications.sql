-- ============================================================================
-- TeleTime - Order Modifications Migration
-- Handles order versioning, amendments, price locking, and partial fulfillment
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE amendment_type AS ENUM (
    'item_added',
    'item_removed',
    'item_modified',
    'quantity_changed',
    'price_changed',
    'discount_changed',
    'fulfillment_updated',
    'order_cancelled',
    'order_reinstated'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fulfillment_status AS ENUM (
    'pending',
    'allocated',
    'picked',
    'packed',
    'shipped',
    'delivered',
    'cancelled',
    'backordered'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE amendment_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'applied',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- EXTEND ORDERS TABLE (unified_orders or orders)
-- ============================================================================

-- Add price lock and versioning columns
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS price_locked BOOLEAN DEFAULT FALSE;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS price_lock_until TIMESTAMPTZ;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS original_quote_id INTEGER REFERENCES quotes(quote_id);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS quote_prices_honored BOOLEAN DEFAULT FALSE;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS last_modified_by INTEGER REFERENCES users(user_id);

-- ============================================================================
-- ORDER ITEM FULFILLMENT
-- ============================================================================

-- Add fulfillment tracking to order items
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS fulfillment_status fulfillment_status DEFAULT 'pending';

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS quantity_fulfilled INTEGER DEFAULT 0;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS quantity_backordered INTEGER DEFAULT 0;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS quantity_cancelled INTEGER DEFAULT 0;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS original_quote_price_cents INTEGER;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS current_price_cents INTEGER;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS price_at_order_cents INTEGER;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- ============================================================================
-- ORDER VERSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_versions (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,

  -- Snapshot of order state
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER DEFAULT 0,
  tax_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  item_count INTEGER NOT NULL,

  -- Version metadata
  created_by INTEGER REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  change_summary TEXT,

  -- Store full item snapshot as JSONB
  items_snapshot JSONB NOT NULL,

  CONSTRAINT unique_order_version UNIQUE (order_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_order_versions_order ON order_versions(order_id);
CREATE INDEX IF NOT EXISTS idx_order_versions_created ON order_versions(created_at);

-- ============================================================================
-- ORDER AMENDMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_amendments (
  id SERIAL PRIMARY KEY,
  amendment_number VARCHAR(30) NOT NULL UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,

  -- Amendment details
  amendment_type amendment_type NOT NULL,
  status amendment_status DEFAULT 'draft',
  reason TEXT,

  -- Financial impact
  previous_total_cents INTEGER NOT NULL,
  new_total_cents INTEGER NOT NULL,
  difference_cents INTEGER NOT NULL,

  -- Price handling
  use_quote_prices BOOLEAN DEFAULT FALSE,
  use_current_prices BOOLEAN DEFAULT FALSE,
  price_override BOOLEAN DEFAULT FALSE,

  -- Approval workflow
  requires_approval BOOLEAN DEFAULT FALSE,
  approval_threshold_cents INTEGER,
  approved_by INTEGER REFERENCES users(user_id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Audit
  created_by INTEGER NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  applied_by INTEGER REFERENCES users(user_id),

  -- Link to resulting version
  resulting_version_id INTEGER REFERENCES order_versions(id)
);

CREATE INDEX IF NOT EXISTS idx_amendments_order ON order_amendments(order_id);
CREATE INDEX IF NOT EXISTS idx_amendments_status ON order_amendments(status);
CREATE INDEX IF NOT EXISTS idx_amendments_created ON order_amendments(created_at);

-- ============================================================================
-- AMENDMENT ITEMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_amendment_items (
  id SERIAL PRIMARY KEY,
  amendment_id INTEGER NOT NULL REFERENCES order_amendments(id) ON DELETE CASCADE,

  -- Item reference
  order_item_id INTEGER REFERENCES order_items(id),
  product_id INTEGER NOT NULL REFERENCES products(product_id),
  product_name VARCHAR(255) NOT NULL,
  product_sku VARCHAR(100),

  -- Change details
  change_type VARCHAR(20) NOT NULL, -- 'add', 'remove', 'modify'

  -- Quantities
  previous_quantity INTEGER DEFAULT 0,
  new_quantity INTEGER DEFAULT 0,
  quantity_change INTEGER NOT NULL,

  -- Prices
  quote_price_cents INTEGER,
  current_price_cents INTEGER,
  applied_price_cents INTEGER NOT NULL,

  -- Impact
  line_difference_cents INTEGER NOT NULL,

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_amendment_items_amendment ON order_amendment_items(amendment_id);
CREATE INDEX IF NOT EXISTS idx_amendment_items_product ON order_amendment_items(product_id);

-- ============================================================================
-- FULFILLMENT SHIPMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_shipments (
  id SERIAL PRIMARY KEY,
  shipment_number VARCHAR(30) NOT NULL UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,

  -- Carrier info
  carrier VARCHAR(100),
  tracking_number VARCHAR(200),
  tracking_url TEXT,

  -- Status
  status fulfillment_status DEFAULT 'pending',

  -- Dates
  shipped_at TIMESTAMPTZ,
  estimated_delivery TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Costs
  shipping_cost_cents INTEGER DEFAULT 0,

  -- Notes
  notes TEXT,

  created_by INTEGER REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipments_order ON order_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON order_shipments(status);

-- ============================================================================
-- SHIPMENT ITEMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_shipment_items (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES order_shipments(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id),

  quantity_shipped INTEGER NOT NULL,
  serial_numbers TEXT[], -- Array of serial numbers if applicable

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment ON order_shipment_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_items_order_item ON order_shipment_items(order_item_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Generate amendment number
CREATE OR REPLACE FUNCTION generate_amendment_number()
RETURNS VARCHAR(30) AS $$
DECLARE
  v_date_part VARCHAR(8);
  v_seq INTEGER;
  v_number VARCHAR(30);
BEGIN
  v_date_part := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(amendment_number FROM 'AMD-' || v_date_part || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO v_seq
  FROM order_amendments
  WHERE amendment_number LIKE 'AMD-' || v_date_part || '-%';

  v_number := 'AMD-' || v_date_part || '-' || LPAD(v_seq::TEXT, 4, '0');

  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- Generate shipment number
CREATE OR REPLACE FUNCTION generate_shipment_number()
RETURNS VARCHAR(30) AS $$
DECLARE
  v_date_part VARCHAR(8);
  v_seq INTEGER;
  v_number VARCHAR(30);
BEGIN
  v_date_part := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(shipment_number FROM 'SHP-' || v_date_part || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO v_seq
  FROM order_shipments
  WHERE shipment_number LIKE 'SHP-' || v_date_part || '-%';

  v_number := 'SHP-' || v_date_part || '-' || LPAD(v_seq::TEXT, 4, '0');

  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- Create order version snapshot
CREATE OR REPLACE FUNCTION create_order_version(
  p_order_id INTEGER,
  p_user_id INTEGER,
  p_change_summary TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_version_number INTEGER;
  v_order RECORD;
  v_items JSONB;
  v_version_id INTEGER;
BEGIN
  -- Get current version number and increment
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_version_number
  FROM order_versions
  WHERE order_id = p_order_id;

  -- Get order totals
  SELECT subtotal, discount_amount, tax_amount, total_amount
  INTO v_order
  FROM orders
  WHERE order_id = p_order_id;

  -- Snapshot current items
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', oi.id,
    'product_id', oi.product_id,
    'product_name', COALESCE(oi.product_name, p.name),
    'product_sku', COALESCE(oi.product_sku, p.sku),
    'quantity', oi.quantity,
    'unit_price_cents', COALESCE(oi.unit_price * 100, oi.price_at_order_cents),
    'discount_percent', oi.discount_percent,
    'line_total_cents', COALESCE(oi.line_total * 100,
      (oi.quantity * COALESCE(oi.unit_price * 100, oi.price_at_order_cents) * (1 - COALESCE(oi.discount_percent, 0) / 100))),
    'fulfillment_status', oi.fulfillment_status,
    'quantity_fulfilled', oi.quantity_fulfilled
  )), '[]'::jsonb)
  INTO v_items
  FROM order_items oi
  LEFT JOIN products p ON oi.product_id = p.product_id
  WHERE oi.order_id = p_order_id;

  -- Insert version
  INSERT INTO order_versions (
    order_id, version_number,
    subtotal_cents, discount_cents, tax_cents, total_cents,
    item_count, created_by, change_summary, items_snapshot
  ) VALUES (
    p_order_id, v_version_number,
    COALESCE(v_order.subtotal * 100, 0)::INTEGER,
    COALESCE(v_order.discount_amount * 100, 0)::INTEGER,
    COALESCE(v_order.tax_amount * 100, 0)::INTEGER,
    COALESCE(v_order.total_amount * 100, 0)::INTEGER,
    (SELECT COUNT(*) FROM order_items WHERE order_id = p_order_id),
    p_user_id,
    p_change_summary,
    v_items
  )
  RETURNING id INTO v_version_id;

  -- Update order version number
  UPDATE orders
  SET version_number = v_version_number,
      last_modified_at = NOW(),
      last_modified_by = p_user_id
  WHERE order_id = p_order_id;

  RETURN v_version_id;
END;
$$ LANGUAGE plpgsql;

-- Check if amendment requires approval based on amount
CREATE OR REPLACE FUNCTION check_amendment_approval(
  p_difference_cents INTEGER,
  p_order_total_cents INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_threshold_cents INTEGER := 10000; -- $100 default
  v_threshold_percent DECIMAL := 10; -- 10% of order
  v_percent_change DECIMAL;
BEGIN
  -- If difference is more than threshold, require approval
  IF ABS(p_difference_cents) > v_threshold_cents THEN
    RETURN TRUE;
  END IF;

  -- If percent change is more than threshold, require approval
  IF p_order_total_cents > 0 THEN
    v_percent_change := (ABS(p_difference_cents)::DECIMAL / p_order_total_cents) * 100;
    IF v_percent_change > v_threshold_percent THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Update order item fulfillment status
CREATE OR REPLACE FUNCTION update_item_fulfillment(
  p_order_item_id INTEGER,
  p_quantity_fulfilled INTEGER,
  p_status fulfillment_status DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_item RECORD;
  v_new_status fulfillment_status;
BEGIN
  SELECT quantity, quantity_fulfilled, quantity_cancelled
  INTO v_item
  FROM order_items
  WHERE id = p_order_item_id;

  -- Determine new status
  IF p_status IS NOT NULL THEN
    v_new_status := p_status;
  ELSIF p_quantity_fulfilled >= v_item.quantity THEN
    v_new_status := 'delivered';
  ELSIF p_quantity_fulfilled > 0 THEN
    v_new_status := 'shipped';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE order_items
  SET quantity_fulfilled = p_quantity_fulfilled,
      fulfillment_status = v_new_status,
      fulfilled_at = CASE WHEN p_quantity_fulfilled > 0 THEN NOW() ELSE fulfilled_at END
  WHERE id = p_order_item_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Order modification history view
CREATE OR REPLACE VIEW order_modification_history AS
SELECT
  oa.id as amendment_id,
  oa.amendment_number,
  oa.order_id,
  o.order_number,
  oa.amendment_type,
  oa.status,
  oa.reason,
  oa.previous_total_cents / 100.0 as previous_total,
  oa.new_total_cents / 100.0 as new_total,
  oa.difference_cents / 100.0 as difference,
  oa.requires_approval,
  u_created.first_name || ' ' || u_created.last_name as created_by_name,
  u_approved.first_name || ' ' || u_approved.last_name as approved_by_name,
  oa.created_at,
  oa.approved_at,
  oa.applied_at,
  (SELECT COUNT(*) FROM order_amendment_items oai WHERE oai.amendment_id = oa.id) as item_changes
FROM order_amendments oa
JOIN orders o ON oa.order_id = o.order_id
LEFT JOIN users u_created ON oa.created_by = u_created.user_id
LEFT JOIN users u_approved ON oa.approved_by = u_approved.user_id
ORDER BY oa.created_at DESC;

-- Order fulfillment summary view
CREATE OR REPLACE VIEW order_fulfillment_summary AS
SELECT
  o.order_id,
  o.order_number,
  o.status as order_status,
  COUNT(oi.id) as total_items,
  SUM(oi.quantity) as total_quantity,
  SUM(oi.quantity_fulfilled) as quantity_fulfilled,
  SUM(oi.quantity_backordered) as quantity_backordered,
  SUM(oi.quantity_cancelled) as quantity_cancelled,
  CASE
    WHEN SUM(oi.quantity_fulfilled) = 0 THEN 'unfulfilled'
    WHEN SUM(oi.quantity_fulfilled) < SUM(oi.quantity) THEN 'partial'
    ELSE 'fulfilled'
  END as fulfillment_status,
  ROUND(SUM(oi.quantity_fulfilled)::DECIMAL / NULLIF(SUM(oi.quantity), 0) * 100, 1) as fulfillment_percent
FROM orders o
LEFT JOIN order_items oi ON o.order_id = oi.order_id
GROUP BY o.order_id, o.order_number, o.status;

-- Orders from quotes view
CREATE OR REPLACE VIEW orders_from_quotes AS
SELECT
  o.order_id,
  o.order_number,
  o.original_quote_id,
  q.quote_number,
  o.price_locked,
  o.quote_prices_honored,
  o.version_number,
  o.total_amount as current_total,
  q.total_amount as quote_total,
  o.total_amount - q.total_amount as price_difference,
  o.created_at as order_created,
  q.created_at as quote_created,
  c.name as customer_name
FROM orders o
JOIN quotes q ON o.original_quote_id = q.quote_id
LEFT JOIN customers c ON o.customer_id = c.customer_id
WHERE o.original_quote_id IS NOT NULL;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-create version on significant order changes
CREATE OR REPLACE FUNCTION trigger_order_version_on_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create version if totals changed significantly
  IF OLD.total_amount IS DISTINCT FROM NEW.total_amount OR
     OLD.status IS DISTINCT FROM NEW.status THEN
    -- Version creation is handled by the service layer for better control
    NEW.last_modified_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_update_version_trigger ON orders;
CREATE TRIGGER order_update_version_trigger
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_order_version_on_update();

COMMENT ON TABLE order_versions IS 'Snapshots of order state at each version for audit trail';
COMMENT ON TABLE order_amendments IS 'Individual modification requests to orders';
COMMENT ON TABLE order_amendment_items IS 'Item-level changes within an amendment';
COMMENT ON TABLE order_shipments IS 'Shipment tracking for order fulfillment';
COMMENT ON TABLE order_shipment_items IS 'Items included in each shipment';
