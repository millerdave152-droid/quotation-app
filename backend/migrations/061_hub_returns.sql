-- Migration 061: Hub-level returns system
-- Comprehensive returns tied to unified_orders (not POS transactions)

-- ============================================================================
-- RETURNS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS hub_returns (
  id SERIAL PRIMARY KEY,
  return_number VARCHAR(50) UNIQUE NOT NULL, -- Generated: RTN-2026-XXXXX

  original_order_id INTEGER NOT NULL REFERENCES unified_orders(id),
  customer_id INTEGER REFERENCES customers(id),

  return_type VARCHAR(20) NOT NULL CHECK (return_type IN ('full', 'partial', 'exchange')),
  status VARCHAR(20) DEFAULT 'initiated'
    CHECK (status IN ('initiated', 'approved', 'processing', 'completed', 'cancelled', 'rejected')),

  -- Refund amounts (cents)
  refund_subtotal INTEGER DEFAULT 0,
  refund_tax INTEGER DEFAULT 0,
  refund_total INTEGER DEFAULT 0,
  restocking_fee INTEGER DEFAULT 0,
  refund_method VARCHAR(20)
    CHECK (refund_method IN ('original_payment', 'store_credit', 'cash', 'gift_card')),

  -- If refund to original payment
  stripe_refund_id VARCHAR(255),

  -- If store credit issued
  store_credit_id INTEGER REFERENCES store_credits(id),

  -- If exchange
  exchange_order_id INTEGER REFERENCES unified_orders(id),

  -- Processing staff
  initiated_by INTEGER NOT NULL REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  processed_by INTEGER REFERENCES users(id),

  notes TEXT,

  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RETURN ITEMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS hub_return_items (
  id SERIAL PRIMARY KEY,
  return_id INTEGER NOT NULL REFERENCES hub_returns(id) ON DELETE CASCADE,
  original_order_item_id INTEGER NOT NULL REFERENCES unified_order_items(id),
  product_id INTEGER REFERENCES products(id),

  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL, -- Original price
  refund_amount_cents INTEGER NOT NULL, -- Amount being refunded for this item

  reason_code_id INTEGER NOT NULL REFERENCES return_reason_codes(id),
  reason_notes TEXT,

  item_condition VARCHAR(20) DEFAULT 'resellable'
    CHECK (item_condition IN ('resellable', 'damaged', 'defective', 'disposed')),
  disposition VARCHAR(20)
    CHECK (disposition IN ('return_to_stock', 'clearance', 'rma_vendor', 'dispose')),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_hub_returns_order_id ON hub_returns(original_order_id);
CREATE INDEX IF NOT EXISTS idx_hub_returns_customer_id ON hub_returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_hub_returns_status ON hub_returns(status);
CREATE INDEX IF NOT EXISTS idx_hub_returns_number ON hub_returns(return_number);
CREATE INDEX IF NOT EXISTS idx_hub_return_items_return_id ON hub_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_hub_return_items_product_id ON hub_return_items(product_id);

-- ============================================================================
-- RETURN NUMBER GENERATOR
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_return_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  v_year TEXT;
  v_random TEXT;
  v_number VARCHAR(50);
  v_exists BOOLEAN;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  LOOP
    v_random := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 5));
    v_number := 'RTN-' || v_year || '-' || v_random;
    SELECT EXISTS(SELECT 1 FROM hub_returns WHERE return_number = v_number) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;
