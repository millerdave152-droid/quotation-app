-- ============================================================================
-- TeleTime - Customer Pricing Migration
-- Handles customer-specific pricing tiers, discounts, and volume pricing
-- ============================================================================

-- ============================================================================
-- PRICING TIERS ENUM
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE pricing_tier AS ENUM (
    'retail',
    'wholesale',
    'vip',
    'contractor',
    'dealer',
    'employee',
    'cost_plus'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- EXTEND CUSTOMERS TABLE
-- ============================================================================

-- Add pricing tier to customers
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS pricing_tier pricing_tier DEFAULT 'retail';

-- Add default discount percentage for customer
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS default_discount_percent DECIMAL(5,2) DEFAULT 0;

-- Add cost-plus margin for cost_plus tier customers
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS cost_plus_margin_percent DECIMAL(5,2) DEFAULT NULL;

-- Add flag for whether customer can see cost pricing
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS show_cost_pricing BOOLEAN DEFAULT FALSE;

-- Add credit limit for wholesale/dealer customers
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS credit_limit_cents INTEGER DEFAULT NULL;

-- ============================================================================
-- PRICING TIER CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS pricing_tier_config (
  tier pricing_tier PRIMARY KEY,
  display_name VARCHAR(50) NOT NULL,
  description TEXT,
  base_discount_percent DECIMAL(5,2) DEFAULT 0,
  can_see_cost BOOLEAN DEFAULT FALSE,
  requires_approval_over_percent DECIMAL(5,2) DEFAULT 20,
  max_additional_discount_percent DECIMAL(5,2) DEFAULT 10,
  volume_discount_eligible BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default tier configurations
INSERT INTO pricing_tier_config (tier, display_name, description, base_discount_percent, can_see_cost, requires_approval_over_percent, max_additional_discount_percent)
VALUES
  ('retail', 'Retail', 'Standard retail customers', 0, FALSE, 15, 10),
  ('wholesale', 'Wholesale', 'Wholesale buyers with volume discounts', 10, FALSE, 25, 15),
  ('vip', 'VIP', 'VIP customers with premium discounts', 15, FALSE, 30, 20),
  ('contractor', 'Contractor', 'Licensed contractors', 12, FALSE, 25, 15),
  ('dealer', 'Dealer', 'Authorized dealers', 20, TRUE, 35, 25),
  ('employee', 'Employee', 'Company employees', 25, TRUE, 30, 10),
  ('cost_plus', 'Cost Plus', 'Cost plus margin pricing', 0, TRUE, 50, 30)
ON CONFLICT (tier) DO NOTHING;

-- ============================================================================
-- CUSTOMER-SPECIFIC PRODUCT PRICING
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_product_pricing (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Pricing type: 'fixed', 'discount_percent', 'cost_plus_percent'
  pricing_type VARCHAR(20) NOT NULL DEFAULT 'discount_percent',

  -- For fixed pricing
  fixed_price_cents INTEGER,

  -- For discount pricing
  discount_percent DECIMAL(5,2),

  -- For cost-plus pricing
  cost_plus_percent DECIMAL(5,2),

  -- Validity period
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,

  -- Metadata
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique customer-product combination for active period
  CONSTRAINT unique_customer_product_pricing
    UNIQUE (customer_id, product_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_customer_product_pricing_customer
  ON customer_product_pricing(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_product_pricing_product
  ON customer_product_pricing(product_id);
CREATE INDEX IF NOT EXISTS idx_customer_product_pricing_dates
  ON customer_product_pricing(effective_from, effective_to);

-- ============================================================================
-- CUSTOMER CATEGORY PRICING
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_category_pricing (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,

  -- Discount for entire category
  discount_percent DECIMAL(5,2) NOT NULL,

  -- Validity period
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,

  -- Metadata
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_customer_category_pricing
    UNIQUE (customer_id, category_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_customer_category_pricing_customer
  ON customer_category_pricing(customer_id);

-- ============================================================================
-- VOLUME PRICING RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS volume_pricing_rules (
  id SERIAL PRIMARY KEY,

  -- Can be product-specific, category-specific, or global
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,

  -- Optional customer tier restriction
  pricing_tier pricing_tier,

  -- Optional specific customer
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,

  -- Volume thresholds
  min_quantity INTEGER NOT NULL,
  max_quantity INTEGER, -- NULL means unlimited

  -- Discount
  discount_percent DECIMAL(5,2) NOT NULL,

  -- Priority (higher = takes precedence)
  priority INTEGER DEFAULT 0,

  -- Validity
  is_active BOOLEAN DEFAULT TRUE,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_volume_pricing_product ON volume_pricing_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_volume_pricing_category ON volume_pricing_rules(category_id);
CREATE INDEX IF NOT EXISTS idx_volume_pricing_customer ON volume_pricing_rules(customer_id);
CREATE INDEX IF NOT EXISTS idx_volume_pricing_tier ON volume_pricing_rules(pricing_tier);

-- ============================================================================
-- PRICE OVERRIDE AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS price_override_log (
  id SERIAL PRIMARY KEY,

  -- Reference to transaction or quote
  transaction_id INTEGER REFERENCES transactions(transaction_id) ON DELETE SET NULL,
  quote_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,

  -- Product and customer
  product_id INTEGER NOT NULL REFERENCES products(id),
  customer_id INTEGER REFERENCES customers(id),

  -- Original pricing
  original_price_cents INTEGER NOT NULL,
  customer_tier_price_cents INTEGER,

  -- Override details
  override_price_cents INTEGER NOT NULL,
  override_discount_percent DECIMAL(5,2),

  -- Savings/loss
  price_difference_cents INTEGER NOT NULL, -- Negative = discount given
  margin_impact_cents INTEGER, -- Impact on margin

  -- Reason and approval
  override_reason TEXT NOT NULL,
  requires_approval BOOLEAN DEFAULT FALSE,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  approval_notes TEXT,

  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'auto_approved'

  -- Who made the override
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- IP and session for audit
  ip_address INET,
  session_id VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_price_override_transaction ON price_override_log(transaction_id);
CREATE INDEX IF NOT EXISTS idx_price_override_quote ON price_override_log(quote_id);
CREATE INDEX IF NOT EXISTS idx_price_override_product ON price_override_log(product_id);
CREATE INDEX IF NOT EXISTS idx_price_override_customer ON price_override_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_price_override_status ON price_override_log(status);
CREATE INDEX IF NOT EXISTS idx_price_override_created ON price_override_log(created_at);
CREATE INDEX IF NOT EXISTS idx_price_override_created_by ON price_override_log(created_by);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to get customer's effective pricing tier discount
CREATE OR REPLACE FUNCTION get_customer_tier_discount(p_customer_id INTEGER)
RETURNS DECIMAL AS $$
DECLARE
  v_tier pricing_tier;
  v_customer_discount DECIMAL;
  v_tier_discount DECIMAL;
BEGIN
  -- Get customer tier and personal discount
  SELECT pricing_tier, COALESCE(default_discount_percent, 0)
  INTO v_tier, v_customer_discount
  FROM customers
  WHERE id = p_customer_id;

  IF v_tier IS NULL THEN
    RETURN 0;
  END IF;

  -- Get tier base discount
  SELECT COALESCE(base_discount_percent, 0)
  INTO v_tier_discount
  FROM pricing_tier_config
  WHERE tier = v_tier;

  -- Return the higher of tier discount or customer-specific discount
  RETURN GREATEST(COALESCE(v_tier_discount, 0), COALESCE(v_customer_discount, 0));
END;
$$ LANGUAGE plpgsql;

-- Function to calculate customer price for a product
CREATE OR REPLACE FUNCTION calculate_customer_price(
  p_customer_id INTEGER,
  p_product_id INTEGER,
  p_quantity INTEGER DEFAULT 1
)
RETURNS TABLE (
  base_price_cents INTEGER,
  customer_price_cents INTEGER,
  discount_percent DECIMAL,
  pricing_source VARCHAR(50),
  volume_discount_percent DECIMAL,
  total_discount_percent DECIMAL
) AS $$
DECLARE
  v_base_price INTEGER;
  v_cost INTEGER;
  v_customer_tier pricing_tier;
  v_category_id INTEGER;
  v_custom_pricing RECORD;
  v_category_discount DECIMAL := 0;
  v_tier_discount DECIMAL := 0;
  v_volume_discount DECIMAL := 0;
  v_final_discount DECIMAL := 0;
  v_pricing_source VARCHAR(50) := 'base';
  v_cost_plus_margin DECIMAL;
BEGIN
  -- Get product base price, cost, and category
  SELECT p.price, p.cost, p.category_id
  INTO v_base_price, v_cost, v_category_id
  FROM products p
  WHERE p.id = p_product_id;

  IF v_base_price IS NULL THEN
    RETURN QUERY SELECT 0::INTEGER, 0::INTEGER, 0::DECIMAL, 'not_found'::VARCHAR, 0::DECIMAL, 0::DECIMAL;
    RETURN;
  END IF;

  -- If no customer, return base price
  IF p_customer_id IS NULL THEN
    RETURN QUERY SELECT v_base_price, v_base_price, 0::DECIMAL, 'base'::VARCHAR, 0::DECIMAL, 0::DECIMAL;
    RETURN;
  END IF;

  -- Get customer tier
  SELECT c.pricing_tier, c.cost_plus_margin_percent
  INTO v_customer_tier, v_cost_plus_margin
  FROM customers c
  WHERE c.id = p_customer_id;

  -- Check for customer-specific product pricing (highest priority)
  SELECT cpp.*
  INTO v_custom_pricing
  FROM customer_product_pricing cpp
  WHERE cpp.customer_id = p_customer_id
    AND cpp.product_id = p_product_id
    AND cpp.effective_from <= CURRENT_DATE
    AND (cpp.effective_to IS NULL OR cpp.effective_to >= CURRENT_DATE)
  ORDER BY cpp.effective_from DESC
  LIMIT 1;

  IF v_custom_pricing.id IS NOT NULL THEN
    -- Use customer-specific pricing
    IF v_custom_pricing.pricing_type = 'fixed' THEN
      v_final_discount := (1 - (v_custom_pricing.fixed_price_cents::DECIMAL / v_base_price)) * 100;
      v_pricing_source := 'customer_fixed';
    ELSIF v_custom_pricing.pricing_type = 'discount_percent' THEN
      v_final_discount := v_custom_pricing.discount_percent;
      v_pricing_source := 'customer_discount';
    ELSIF v_custom_pricing.pricing_type = 'cost_plus_percent' THEN
      -- Calculate cost plus price
      v_final_discount := (1 - ((v_cost * (1 + v_custom_pricing.cost_plus_percent / 100))::DECIMAL / v_base_price)) * 100;
      v_pricing_source := 'customer_cost_plus';
    END IF;
  ELSE
    -- Check for category-specific pricing
    SELECT ccp.discount_percent
    INTO v_category_discount
    FROM customer_category_pricing ccp
    WHERE ccp.customer_id = p_customer_id
      AND ccp.category_id = v_category_id
      AND ccp.effective_from <= CURRENT_DATE
      AND (ccp.effective_to IS NULL OR ccp.effective_to >= CURRENT_DATE)
    ORDER BY ccp.effective_from DESC
    LIMIT 1;

    IF v_category_discount IS NOT NULL AND v_category_discount > 0 THEN
      v_final_discount := v_category_discount;
      v_pricing_source := 'category';
    ELSE
      -- Use tier-based pricing
      IF v_customer_tier = 'cost_plus' AND v_cost_plus_margin IS NOT NULL THEN
        v_final_discount := (1 - ((v_cost * (1 + v_cost_plus_margin / 100))::DECIMAL / v_base_price)) * 100;
        v_pricing_source := 'tier_cost_plus';
      ELSE
        v_tier_discount := get_customer_tier_discount(p_customer_id);
        v_final_discount := v_tier_discount;
        v_pricing_source := 'tier';
      END IF;
    END IF;
  END IF;

  -- Check for volume discounts
  SELECT COALESCE(vpr.discount_percent, 0)
  INTO v_volume_discount
  FROM volume_pricing_rules vpr
  WHERE vpr.is_active = TRUE
    AND vpr.effective_from <= CURRENT_DATE
    AND (vpr.effective_to IS NULL OR vpr.effective_to >= CURRENT_DATE)
    AND vpr.min_quantity <= p_quantity
    AND (vpr.max_quantity IS NULL OR vpr.max_quantity >= p_quantity)
    AND (
      vpr.product_id = p_product_id
      OR vpr.category_id = v_category_id
      OR (vpr.product_id IS NULL AND vpr.category_id IS NULL)
    )
    AND (
      vpr.customer_id = p_customer_id
      OR vpr.pricing_tier = v_customer_tier
      OR (vpr.customer_id IS NULL AND vpr.pricing_tier IS NULL)
    )
  ORDER BY
    -- Prioritize: specific customer > specific product > category > tier > global
    CASE WHEN vpr.customer_id IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN vpr.product_id IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN vpr.category_id IS NOT NULL THEN 0 ELSE 1 END,
    vpr.priority DESC,
    vpr.discount_percent DESC
  LIMIT 1;

  -- Combine discounts (volume is additive)
  v_final_discount := v_final_discount + COALESCE(v_volume_discount, 0);

  -- Cap at 100%
  v_final_discount := LEAST(v_final_discount, 100);

  RETURN QUERY SELECT
    v_base_price,
    ROUND(v_base_price * (1 - v_final_discount / 100))::INTEGER,
    v_final_discount - COALESCE(v_volume_discount, 0),
    v_pricing_source,
    COALESCE(v_volume_discount, 0)::DECIMAL,
    v_final_discount;
END;
$$ LANGUAGE plpgsql;

-- Function to check if override requires approval
CREATE OR REPLACE FUNCTION check_override_requires_approval(
  p_customer_id INTEGER,
  p_override_discount_percent DECIMAL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_tier pricing_tier;
  v_threshold DECIMAL;
BEGIN
  -- Get customer tier
  SELECT pricing_tier INTO v_tier
  FROM customers
  WHERE id = p_customer_id;

  -- Get approval threshold for tier
  SELECT requires_approval_over_percent INTO v_threshold
  FROM pricing_tier_config
  WHERE tier = COALESCE(v_tier, 'retail');

  RETURN p_override_discount_percent > COALESCE(v_threshold, 15);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for customer pricing summary
CREATE OR REPLACE VIEW customer_pricing_summary AS
SELECT
  c.id as customer_id,
  c.name as customer_name,
  c.pricing_tier,
  ptc.display_name as tier_name,
  ptc.base_discount_percent as tier_discount,
  c.default_discount_percent as customer_discount,
  GREATEST(COALESCE(ptc.base_discount_percent, 0), COALESCE(c.default_discount_percent, 0)) as effective_discount,
  c.cost_plus_margin_percent,
  c.show_cost_pricing,
  c.credit_limit_cents,
  ptc.requires_approval_over_percent,
  ptc.max_additional_discount_percent,
  (SELECT COUNT(*) FROM customer_product_pricing cpp WHERE cpp.customer_id = c.id) as custom_product_prices,
  (SELECT COUNT(*) FROM customer_category_pricing ccp WHERE ccp.customer_id = c.id) as custom_category_prices
FROM customers c
LEFT JOIN pricing_tier_config ptc ON c.pricing_tier = ptc.tier;

-- View for recent price overrides
CREATE OR REPLACE VIEW recent_price_overrides AS
SELECT
  pol.id,
  pol.created_at,
  pol.status,
  p.name as product_name,
  p.model as product_sku,
  c.name as customer_name,
  c.pricing_tier,
  pol.original_price_cents,
  pol.customer_tier_price_cents,
  pol.override_price_cents,
  pol.price_difference_cents,
  pol.override_reason,
  pol.requires_approval,
  u_created.first_name || ' ' || u_created.last_name as created_by_name,
  u_approved.first_name || ' ' || u_approved.last_name as approved_by_name,
  pol.approved_at,
  pol.approval_notes
FROM price_override_log pol
JOIN products p ON pol.product_id = p.id
LEFT JOIN customers c ON pol.customer_id = c.id
LEFT JOIN users u_created ON pol.created_by = u_created.id
LEFT JOIN users u_approved ON pol.approved_by = u_approved.id
ORDER BY pol.created_at DESC;

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Add some volume pricing rules
INSERT INTO volume_pricing_rules (min_quantity, max_quantity, discount_percent, priority, pricing_tier)
VALUES
  (5, 9, 2.0, 1, NULL),      -- 5-9 units: 2% off for everyone
  (10, 24, 5.0, 2, NULL),    -- 10-24 units: 5% off
  (25, 49, 8.0, 3, NULL),    -- 25-49 units: 8% off
  (50, 99, 10.0, 4, NULL),   -- 50-99 units: 10% off
  (100, NULL, 12.0, 5, NULL) -- 100+ units: 12% off
ON CONFLICT DO NOTHING;

-- Wholesale-specific volume discounts (additional)
INSERT INTO volume_pricing_rules (min_quantity, max_quantity, discount_percent, priority, pricing_tier)
VALUES
  (10, 24, 2.0, 10, 'wholesale'),   -- Extra 2% for wholesale
  (25, 49, 3.0, 11, 'wholesale'),   -- Extra 3% for wholesale
  (50, NULL, 5.0, 12, 'wholesale')  -- Extra 5% for wholesale 50+
ON CONFLICT DO NOTHING;

COMMENT ON TABLE pricing_tier_config IS 'Configuration for each pricing tier including base discounts and approval thresholds';
COMMENT ON TABLE customer_product_pricing IS 'Customer-specific pricing for individual products';
COMMENT ON TABLE customer_category_pricing IS 'Customer-specific discounts for product categories';
COMMENT ON TABLE volume_pricing_rules IS 'Volume-based discounts by quantity, product, category, or customer tier';
COMMENT ON TABLE price_override_log IS 'Audit log of all price overrides with approval workflow';
