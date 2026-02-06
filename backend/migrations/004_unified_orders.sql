-- ============================================================================
-- Migration 004: Unified Order Model
-- ============================================================================
-- Creates a single source of truth for quotes, orders, invoices, and POS
-- transactions. This replaces the separate quotations and transactions tables
-- with a unified model while maintaining backward compatibility.
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: ENUM TYPES
-- ============================================================================

-- Order status progression
CREATE TYPE order_status AS ENUM (
  'draft',           -- Initial creation, not yet sent/finalized
  'quote_sent',      -- Quote sent to customer
  'quote_viewed',    -- Customer has viewed the quote
  'quote_expired',   -- Quote past expiry date
  'quote_rejected',  -- Customer rejected the quote
  'quote_approved',  -- Customer approved/accepted
  'order_pending',   -- Converted to order, awaiting fulfillment
  'order_processing',-- Being processed/prepared
  'order_ready',     -- Ready for pickup/delivery
  'order_completed', -- Fulfilled/delivered
  'invoice_sent',    -- Invoice sent to customer
  'invoice_overdue', -- Past due date
  'paid',            -- Fully paid
  'partial_refund',  -- Partially refunded
  'refunded',        -- Fully refunded
  'void',            -- Voided/cancelled
  'archived'         -- Archived for records
);

-- Order source/origin
CREATE TYPE order_source AS ENUM (
  'quote',           -- Started as a quote
  'pos',             -- Direct POS sale
  'online',          -- E-commerce/online
  'phone',           -- Phone order
  'import',          -- Imported from external system
  'api'              -- Created via API
);

-- Payment method types
CREATE TYPE payment_method_type AS ENUM (
  'cash',
  'credit_card',
  'debit_card',
  'gift_card',
  'store_credit',
  'check',
  'bank_transfer',
  'financing',
  'other'
);

-- Payment status
CREATE TYPE payment_status AS ENUM (
  'pending',
  'authorized',
  'captured',
  'completed',
  'failed',
  'refunded',
  'partially_refunded',
  'voided'
);

-- Discount type
CREATE TYPE discount_type AS ENUM (
  'percent',
  'fixed_amount',
  'buy_x_get_y',
  'bundle'
);

-- ============================================================================
-- SECTION 2: UNIFIED ORDERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS unified_orders (
  -- Primary Key
  id SERIAL PRIMARY KEY,

  -- Unique identifiers (human-readable)
  order_number VARCHAR(50) UNIQUE NOT NULL,

  -- Legacy references (for migration/compatibility)
  legacy_quote_id INTEGER,           -- Reference to old quotations.id
  legacy_transaction_id INTEGER,     -- Reference to old transactions.id

  -- Source and Status
  source order_source NOT NULL DEFAULT 'pos',
  status order_status NOT NULL DEFAULT 'draft',

  -- Customer Information
  customer_id INTEGER REFERENCES customers(id),
  customer_name VARCHAR(255),        -- Denormalized for quick access
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_address TEXT,

  -- Attribution
  created_by INTEGER REFERENCES users(id),
  salesperson_id INTEGER REFERENCES users(id),

  -- POS-Specific Fields
  register_id INTEGER REFERENCES registers(register_id),
  shift_id INTEGER REFERENCES register_shifts(shift_id),

  -- Quote-Specific Fields
  quote_expiry_date DATE,
  quote_valid_days INTEGER DEFAULT 30,
  quote_revision INTEGER DEFAULT 1,
  quote_sent_at TIMESTAMP,
  quote_viewed_at TIMESTAMP,
  quote_approved_at TIMESTAMP,
  quote_approved_by VARCHAR(255),    -- Customer name/signature
  quote_rejection_reason TEXT,

  -- Financial Totals (all in cents for precision)
  subtotal_cents INTEGER NOT NULL DEFAULT 0,

  -- Item-level discounts (sum of all line item discounts)
  item_discount_cents INTEGER NOT NULL DEFAULT 0,

  -- Order-level discount
  order_discount_cents INTEGER NOT NULL DEFAULT 0,
  order_discount_type discount_type,
  order_discount_reason VARCHAR(255),
  order_discount_code VARCHAR(50),   -- Promo/coupon code if applicable

  -- After discounts, before tax
  taxable_amount_cents INTEGER NOT NULL DEFAULT 0,

  -- Tax breakdown
  tax_province VARCHAR(2) DEFAULT 'ON',
  hst_rate DECIMAL(5,4) DEFAULT 0,
  hst_cents INTEGER NOT NULL DEFAULT 0,
  gst_rate DECIMAL(5,4) DEFAULT 0,
  gst_cents INTEGER NOT NULL DEFAULT 0,
  pst_rate DECIMAL(5,4) DEFAULT 0,
  pst_cents INTEGER NOT NULL DEFAULT 0,
  tax_exempt BOOLEAN DEFAULT FALSE,
  tax_exempt_number VARCHAR(50),

  -- Delivery/Shipping
  delivery_cents INTEGER NOT NULL DEFAULT 0,
  delivery_method VARCHAR(50),
  delivery_address TEXT,
  delivery_instructions TEXT,
  delivery_date DATE,
  delivery_time_slot VARCHAR(50),

  -- Final total
  total_cents INTEGER NOT NULL DEFAULT 0,

  -- Payment tracking
  amount_paid_cents INTEGER NOT NULL DEFAULT 0,
  amount_due_cents INTEGER GENERATED ALWAYS AS (total_cents - amount_paid_cents) STORED,

  -- Deposit/Down payment (for quotes/orders)
  deposit_required_cents INTEGER DEFAULT 0,
  deposit_paid_cents INTEGER DEFAULT 0,

  -- Invoice fields
  invoice_number VARCHAR(50) UNIQUE,
  invoice_date DATE,
  invoice_due_date DATE,
  invoice_terms VARCHAR(100),        -- "Net 30", "Due on Receipt", etc.

  -- Notes
  internal_notes TEXT,               -- Staff only
  customer_notes TEXT,               -- Visible to customer

  -- Metadata
  metadata JSONB DEFAULT '{}',       -- Flexible additional data
  tags TEXT[],                       -- Searchable tags

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  voided_at TIMESTAMP,
  voided_by INTEGER REFERENCES users(id),
  void_reason TEXT,

  -- Constraints
  CONSTRAINT valid_totals CHECK (
    subtotal_cents >= 0 AND
    item_discount_cents >= 0 AND
    order_discount_cents >= 0 AND
    total_cents >= 0 AND
    amount_paid_cents >= 0
  )
);

-- Indexes for common queries
CREATE INDEX idx_unified_orders_number ON unified_orders(order_number);
CREATE INDEX idx_unified_orders_status ON unified_orders(status);
CREATE INDEX idx_unified_orders_source ON unified_orders(source);
CREATE INDEX idx_unified_orders_customer ON unified_orders(customer_id);
CREATE INDEX idx_unified_orders_salesperson ON unified_orders(salesperson_id);
CREATE INDEX idx_unified_orders_shift ON unified_orders(shift_id);
CREATE INDEX idx_unified_orders_created ON unified_orders(created_at);
CREATE INDEX idx_unified_orders_invoice_number ON unified_orders(invoice_number);
CREATE INDEX idx_unified_orders_tags ON unified_orders USING GIN(tags);
CREATE INDEX idx_unified_orders_metadata ON unified_orders USING GIN(metadata);

-- Partial indexes for active records
CREATE INDEX idx_unified_orders_active_quotes ON unified_orders(status, quote_expiry_date)
  WHERE status IN ('draft', 'quote_sent', 'quote_viewed');
CREATE INDEX idx_unified_orders_unpaid ON unified_orders(status, invoice_due_date)
  WHERE status IN ('invoice_sent', 'invoice_overdue');

-- ============================================================================
-- SECTION 3: ORDER ITEMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS unified_order_items (
  id SERIAL PRIMARY KEY,

  -- Parent reference
  order_id INTEGER NOT NULL REFERENCES unified_orders(id) ON DELETE CASCADE,

  -- Product reference
  product_id INTEGER REFERENCES products(id),

  -- Product snapshot (denormalized for historical accuracy)
  product_sku VARCHAR(100),
  product_name VARCHAR(255) NOT NULL,
  product_description TEXT,
  manufacturer VARCHAR(255),
  model VARCHAR(255),

  -- Quantity and Pricing (in cents)
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  unit_cost_cents INTEGER,           -- For margin tracking

  -- Item-level discount
  discount_type discount_type,
  discount_percent DECIMAL(5,2) DEFAULT 0,
  discount_cents INTEGER DEFAULT 0,
  discount_reason VARCHAR(255),

  -- Calculated line total
  line_subtotal_cents INTEGER GENERATED ALWAYS AS (unit_price_cents * quantity) STORED,
  line_discount_cents INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN discount_type = 'percent' THEN ROUND((unit_price_cents * quantity * discount_percent / 100))::INTEGER
      WHEN discount_type = 'fixed_amount' THEN discount_cents
      ELSE 0
    END
  ) STORED,
  line_total_cents INTEGER NOT NULL,

  -- Tax
  taxable BOOLEAN DEFAULT TRUE,
  tax_cents INTEGER DEFAULT 0,

  -- Serial/Inventory tracking
  serial_number VARCHAR(100),
  lot_number VARCHAR(100),

  -- Fulfillment
  fulfilled_quantity INTEGER DEFAULT 0,
  backordered_quantity INTEGER DEFAULT 0,
  fulfillment_status VARCHAR(30) DEFAULT 'pending',

  -- Special order tracking
  is_special_order BOOLEAN DEFAULT FALSE,
  special_order_eta DATE,
  special_order_notes TEXT,

  -- Warranty
  warranty_id INTEGER,
  warranty_expires DATE,

  -- Display order
  sort_order INTEGER DEFAULT 0,

  -- Notes
  notes TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_item_quantities CHECK (
    quantity > 0 AND
    fulfilled_quantity >= 0 AND
    backordered_quantity >= 0
  )
);

-- Indexes
CREATE INDEX idx_order_items_order ON unified_order_items(order_id);
CREATE INDEX idx_order_items_product ON unified_order_items(product_id);
CREATE INDEX idx_order_items_sku ON unified_order_items(product_sku);
CREATE INDEX idx_order_items_serial ON unified_order_items(serial_number);

-- ============================================================================
-- SECTION 4: ORDER PAYMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS unified_order_payments (
  id SERIAL PRIMARY KEY,

  -- Parent reference
  order_id INTEGER NOT NULL REFERENCES unified_orders(id) ON DELETE CASCADE,

  -- Payment details
  payment_method payment_method_type NOT NULL,
  amount_cents INTEGER NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',

  -- Cash specific
  cash_tendered_cents INTEGER,
  change_given_cents INTEGER,

  -- Card specific
  card_brand VARCHAR(20),            -- Visa, Mastercard, Amex, etc.
  card_last_four VARCHAR(4),
  card_expiry VARCHAR(7),            -- MM/YYYY
  authorization_code VARCHAR(50),
  processor_reference VARCHAR(100),
  processor_response JSONB,

  -- Check specific
  check_number VARCHAR(50),
  check_bank VARCHAR(100),

  -- Gift card / Store credit
  gift_card_number VARCHAR(50),
  gift_card_balance_cents INTEGER,

  -- Financing
  financing_provider VARCHAR(100),
  financing_account VARCHAR(50),
  financing_terms VARCHAR(100),

  -- Refund tracking
  is_refund BOOLEAN DEFAULT FALSE,
  refund_reason TEXT,
  original_payment_id INTEGER REFERENCES unified_order_payments(id),

  -- Attribution
  processed_by INTEGER REFERENCES users(id),

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  voided_at TIMESTAMP,

  -- Notes
  notes TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Constraints
  CONSTRAINT valid_payment_amount CHECK (amount_cents != 0),
  CONSTRAINT valid_cash_payment CHECK (
    payment_method != 'cash' OR
    (cash_tendered_cents IS NOT NULL AND cash_tendered_cents >= amount_cents)
  )
);

-- Indexes
CREATE INDEX idx_order_payments_order ON unified_order_payments(order_id);
CREATE INDEX idx_order_payments_status ON unified_order_payments(status);
CREATE INDEX idx_order_payments_method ON unified_order_payments(payment_method);
CREATE INDEX idx_order_payments_created ON unified_order_payments(created_at);

-- ============================================================================
-- SECTION 5: ORDER STATUS HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS unified_order_status_history (
  id SERIAL PRIMARY KEY,

  -- Parent reference
  order_id INTEGER NOT NULL REFERENCES unified_orders(id) ON DELETE CASCADE,

  -- Status change
  from_status order_status,
  to_status order_status NOT NULL,

  -- Attribution
  changed_by INTEGER REFERENCES users(id),
  changed_by_name VARCHAR(255),      -- For external changes (customer)

  -- Context
  reason TEXT,
  notes TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamp
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_status_history_order ON unified_order_status_history(order_id);
CREATE INDEX idx_status_history_timestamp ON unified_order_status_history(changed_at);

-- ============================================================================
-- SECTION 6: ORDER NUMBER SEQUENCE
-- ============================================================================

-- Sequence for generating order numbers
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 10001;

-- Function to generate order numbers with prefix
CREATE OR REPLACE FUNCTION generate_order_number(prefix VARCHAR DEFAULT 'ORD')
RETURNS VARCHAR AS $$
DECLARE
  new_number VARCHAR;
BEGIN
  new_number := prefix || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                LPAD(nextval('order_number_seq')::TEXT, 5, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 7: AUTO-UPDATE TRIGGER
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_unified_order_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_unified_orders_timestamp
  BEFORE UPDATE ON unified_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_unified_order_timestamp();

CREATE TRIGGER trg_unified_order_items_timestamp
  BEFORE UPDATE ON unified_order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_unified_order_timestamp();

-- ============================================================================
-- SECTION 8: RECALCULATE TOTALS FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_order_totals(p_order_id INTEGER)
RETURNS void AS $$
DECLARE
  v_subtotal INTEGER;
  v_item_discount INTEGER;
  v_taxable INTEGER;
  v_order unified_orders%ROWTYPE;
  v_hst INTEGER;
  v_gst INTEGER;
  v_pst INTEGER;
BEGIN
  -- Get order details
  SELECT * INTO v_order FROM unified_orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  -- Calculate item totals
  SELECT
    COALESCE(SUM(line_subtotal_cents), 0),
    COALESCE(SUM(line_discount_cents), 0)
  INTO v_subtotal, v_item_discount
  FROM unified_order_items
  WHERE order_id = p_order_id;

  -- Calculate taxable amount
  v_taxable := v_subtotal - v_item_discount - COALESCE(v_order.order_discount_cents, 0);

  -- Calculate taxes (only on taxable items if not tax exempt)
  IF NOT v_order.tax_exempt THEN
    -- Get taxable item total
    SELECT COALESCE(SUM(line_total_cents), 0)
    INTO v_taxable
    FROM unified_order_items
    WHERE order_id = p_order_id AND taxable = TRUE;

    v_taxable := v_taxable - COALESCE(v_order.order_discount_cents, 0);
    IF v_taxable < 0 THEN v_taxable := 0; END IF;

    v_hst := ROUND(v_taxable * COALESCE(v_order.hst_rate, 0))::INTEGER;
    v_gst := ROUND(v_taxable * COALESCE(v_order.gst_rate, 0))::INTEGER;
    v_pst := ROUND(v_taxable * COALESCE(v_order.pst_rate, 0))::INTEGER;
  ELSE
    v_hst := 0;
    v_gst := 0;
    v_pst := 0;
  END IF;

  -- Update order
  UPDATE unified_orders SET
    subtotal_cents = v_subtotal,
    item_discount_cents = v_item_discount,
    taxable_amount_cents = v_taxable,
    hst_cents = v_hst,
    gst_cents = v_gst,
    pst_cents = v_pst,
    total_cents = v_subtotal - v_item_discount - COALESCE(order_discount_cents, 0) +
                  v_hst + v_gst + v_pst + COALESCE(delivery_cents, 0),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_order_id;

  -- Update amount paid
  UPDATE unified_orders SET
    amount_paid_cents = (
      SELECT COALESCE(SUM(amount_cents), 0)
      FROM unified_order_payments
      WHERE order_id = p_order_id
        AND status = 'completed'
        AND is_refund = FALSE
    ) - (
      SELECT COALESCE(SUM(amount_cents), 0)
      FROM unified_order_payments
      WHERE order_id = p_order_id
        AND status = 'completed'
        AND is_refund = TRUE
    )
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to recalculate on item changes
CREATE OR REPLACE FUNCTION trigger_recalculate_order()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_order_totals(OLD.order_id);
    RETURN OLD;
  ELSE
    PERFORM recalculate_order_totals(NEW.order_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalculate_on_item_change
  AFTER INSERT OR UPDATE OR DELETE ON unified_order_items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_order();

-- ============================================================================
-- SECTION 9: STATUS TRANSITION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION transition_order_status(
  p_order_id INTEGER,
  p_new_status order_status,
  p_user_id INTEGER DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS unified_orders AS $$
DECLARE
  v_order unified_orders%ROWTYPE;
  v_old_status order_status;
BEGIN
  -- Get current order with lock
  SELECT * INTO v_order FROM unified_orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  v_old_status := v_order.status;

  -- Record status change
  INSERT INTO unified_order_status_history (
    order_id, from_status, to_status, changed_by, reason, notes
  ) VALUES (
    p_order_id, v_old_status, p_new_status, p_user_id, p_reason, p_notes
  );

  -- Update order status and relevant timestamps
  UPDATE unified_orders SET
    status = p_new_status,
    updated_at = CURRENT_TIMESTAMP,
    quote_sent_at = CASE WHEN p_new_status = 'quote_sent' THEN CURRENT_TIMESTAMP ELSE quote_sent_at END,
    quote_viewed_at = CASE WHEN p_new_status = 'quote_viewed' THEN CURRENT_TIMESTAMP ELSE quote_viewed_at END,
    quote_approved_at = CASE WHEN p_new_status = 'quote_approved' THEN CURRENT_TIMESTAMP ELSE quote_approved_at END,
    completed_at = CASE WHEN p_new_status IN ('paid', 'order_completed') THEN CURRENT_TIMESTAMP ELSE completed_at END,
    voided_at = CASE WHEN p_new_status = 'void' THEN CURRENT_TIMESTAMP ELSE voided_at END,
    voided_by = CASE WHEN p_new_status = 'void' THEN p_user_id ELSE voided_by END,
    void_reason = CASE WHEN p_new_status = 'void' THEN p_reason ELSE void_reason END
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 10: VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Active quotes view
CREATE OR REPLACE VIEW active_quotes AS
SELECT
  o.*,
  c.name as customer_display_name,
  c.email as customer_display_email,
  u.first_name || ' ' || u.last_name as salesperson_name,
  (SELECT COUNT(*) FROM unified_order_items WHERE order_id = o.id) as item_count,
  CASE
    WHEN o.quote_expiry_date < CURRENT_DATE THEN 'expired'
    WHEN o.quote_expiry_date = CURRENT_DATE THEN 'expires_today'
    WHEN o.quote_expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expires_soon'
    ELSE 'active'
  END as expiry_status
FROM unified_orders o
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN users u ON o.salesperson_id = u.id
WHERE o.source = 'quote'
  AND o.status IN ('draft', 'quote_sent', 'quote_viewed');

-- POS transactions view
CREATE OR REPLACE VIEW pos_transactions AS
SELECT
  o.*,
  c.name as customer_display_name,
  r.register_name,
  rs.opened_at as shift_opened_at,
  u.first_name || ' ' || u.last_name as cashier_name,
  sp.first_name || ' ' || sp.last_name as salesperson_name,
  (SELECT COUNT(*) FROM unified_order_items WHERE order_id = o.id) as item_count,
  (
    SELECT json_agg(json_build_object(
      'method', p.payment_method,
      'amount', p.amount_cents,
      'status', p.status
    ))
    FROM unified_order_payments p WHERE p.order_id = o.id
  ) as payments
FROM unified_orders o
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN registers r ON o.register_id = r.register_id
LEFT JOIN register_shifts rs ON o.shift_id = rs.shift_id
LEFT JOIN users u ON o.created_by = u.id
LEFT JOIN users sp ON o.salesperson_id = sp.id
WHERE o.source = 'pos';

-- Unpaid invoices view
CREATE OR REPLACE VIEW unpaid_invoices AS
SELECT
  o.*,
  c.name as customer_display_name,
  c.email as customer_display_email,
  c.phone as customer_display_phone,
  CURRENT_DATE - o.invoice_due_date as days_overdue
FROM unified_orders o
LEFT JOIN customers c ON o.customer_id = c.id
WHERE o.status IN ('invoice_sent', 'invoice_overdue')
  AND o.amount_due_cents > 0
ORDER BY o.invoice_due_date ASC;

-- ============================================================================
-- SECTION 11: COMMENTS
-- ============================================================================

COMMENT ON TABLE unified_orders IS 'Unified order model supporting quotes, POS transactions, and invoices';
COMMENT ON TABLE unified_order_items IS 'Line items for unified orders with pricing and fulfillment tracking';
COMMENT ON TABLE unified_order_payments IS 'Payment records supporting multiple payment methods and split payments';
COMMENT ON TABLE unified_order_status_history IS 'Audit trail of all status transitions';

COMMENT ON COLUMN unified_orders.source IS 'Origin of the order: quote, pos, online, phone, import, api';
COMMENT ON COLUMN unified_orders.status IS 'Current status in the order lifecycle';
COMMENT ON COLUMN unified_orders.order_number IS 'Human-readable unique identifier';
COMMENT ON COLUMN unified_orders.amount_due_cents IS 'Auto-calculated: total_cents - amount_paid_cents';

COMMIT;
