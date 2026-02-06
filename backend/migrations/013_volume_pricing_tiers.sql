-- ============================================================================
-- Migration: 013_volume_pricing_tiers.sql
-- Description: Enhanced volume/quantity tier pricing for POS
-- Date: 2026-01-26
--
-- This migration adds:
-- 1. product_volume_tiers - Simple per-product quantity breaks
-- 2. tier_volume_overrides - Customer tier-specific volume pricing
-- 3. Optimized indexes for POS real-time lookups
-- 4. Helper functions for cart calculations
--
-- Works alongside existing volume_pricing_rules table (rules-based system)
-- ============================================================================

-- ============================================================================
-- PRODUCT VOLUME TIERS TABLE
-- Simple per-product quantity breaks: 1-9 = $100, 10-24 = $90, 25+ = $80
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_volume_tiers (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Quantity range (inclusive)
  min_qty INTEGER NOT NULL DEFAULT 1,
  max_qty INTEGER, -- NULL = unlimited (e.g., 100+)

  -- Pricing (use ONE of these)
  price_cents INTEGER, -- Fixed price per unit at this tier
  discount_percent DECIMAL(5,2), -- OR percentage off base price

  -- Metadata
  tier_name VARCHAR(50), -- e.g., "Single", "Case", "Pallet"
  is_active BOOLEAN DEFAULT TRUE,

  -- Audit
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT product_volume_tiers_qty_check CHECK (min_qty > 0),
  CONSTRAINT product_volume_tiers_range_check CHECK (max_qty IS NULL OR max_qty >= min_qty),
  CONSTRAINT product_volume_tiers_price_check CHECK (
    (price_cents IS NOT NULL AND discount_percent IS NULL) OR
    (price_cents IS NULL AND discount_percent IS NOT NULL)
  )
);

-- Unique constraint: no overlapping ranges for same product
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_volume_tiers_unique
  ON product_volume_tiers(product_id, min_qty)
  WHERE is_active = TRUE;

-- Fast lookup indexes for POS
CREATE INDEX IF NOT EXISTS idx_product_volume_tiers_lookup
  ON product_volume_tiers(product_id, is_active)
  INCLUDE (min_qty, max_qty, price_cents, discount_percent)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_product_volume_tiers_active
  ON product_volume_tiers(product_id)
  WHERE is_active = TRUE;

-- ============================================================================
-- TIER VOLUME OVERRIDES TABLE
-- Customer tier-specific volume breaks (wholesale gets better than retail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tier_volume_overrides (
  id SERIAL PRIMARY KEY,

  -- Can be product-specific or global (NULL = all products)
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,

  -- Which customer tier this applies to
  pricing_tier pricing_tier NOT NULL,

  -- Quantity range
  min_qty INTEGER NOT NULL DEFAULT 1,
  max_qty INTEGER,

  -- Override pricing (better than default)
  price_cents INTEGER,
  discount_percent DECIMAL(5,2),

  -- Additional discount ON TOP of product_volume_tiers (stacking)
  additional_discount_percent DECIMAL(5,2),

  -- Priority for rule resolution (higher = wins)
  priority INTEGER DEFAULT 0,

  -- Validity period
  is_active BOOLEAN DEFAULT TRUE,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,

  -- Audit
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT tier_volume_qty_check CHECK (min_qty > 0),
  CONSTRAINT tier_volume_range_check CHECK (max_qty IS NULL OR max_qty >= min_qty)
);

-- Indexes for tier volume lookups
CREATE INDEX IF NOT EXISTS idx_tier_volume_overrides_lookup
  ON tier_volume_overrides(pricing_tier, is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_tier_volume_overrides_product
  ON tier_volume_overrides(product_id, pricing_tier)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_tier_volume_overrides_dates
  ON tier_volume_overrides(effective_from, effective_to)
  WHERE is_active = TRUE;

-- ============================================================================
-- CUSTOMER VOLUME TIERS TABLE (Optional: customer-specific overrides)
-- For special customers who negotiate their own volume breaks
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_volume_tiers (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Can be product-specific or global
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,

  -- Quantity range
  min_qty INTEGER NOT NULL DEFAULT 1,
  max_qty INTEGER,

  -- Customer's negotiated pricing
  price_cents INTEGER,
  discount_percent DECIMAL(5,2),

  -- Validity
  is_active BOOLEAN DEFAULT TRUE,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,

  -- Notes for why this customer has special pricing
  notes TEXT,

  -- Audit
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT customer_volume_qty_check CHECK (min_qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_customer_volume_tiers_customer
  ON customer_volume_tiers(customer_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_customer_volume_tiers_lookup
  ON customer_volume_tiers(customer_id, product_id)
  WHERE is_active = TRUE;

-- ============================================================================
-- ADD FLAG TO PRODUCTS TABLE
-- Quick check if product has volume pricing configured
-- ============================================================================

ALTER TABLE products
ADD COLUMN IF NOT EXISTS has_volume_pricing BOOLEAN DEFAULT FALSE;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS volume_pricing_note VARCHAR(255);

-- ============================================================================
-- OPTIMIZED LOOKUP FUNCTION FOR POS
-- Returns best price for product/customer/quantity combination
-- ============================================================================

CREATE OR REPLACE FUNCTION get_volume_price(
  p_product_id INTEGER,
  p_quantity INTEGER,
  p_customer_id INTEGER DEFAULT NULL,
  p_customer_tier pricing_tier DEFAULT NULL
)
RETURNS TABLE (
  base_price_cents INTEGER,
  volume_price_cents INTEGER,
  discount_percent DECIMAL,
  tier_name VARCHAR,
  pricing_source VARCHAR,
  savings_cents INTEGER
) AS $$
DECLARE
  v_base_price INTEGER;
  v_volume_price INTEGER;
  v_discount DECIMAL := 0;
  v_tier_name VARCHAR := 'Standard';
  v_source VARCHAR := 'base';
  v_customer_tier pricing_tier;
  v_additional_discount DECIMAL := 0;
BEGIN
  -- Get base product price
  SELECT COALESCE(p.retail_price_cents, (p.price * 100)::INTEGER) INTO v_base_price
  FROM products p
  WHERE p.id = p_product_id;

  IF v_base_price IS NULL THEN
    RETURN QUERY SELECT 0::INTEGER, 0::INTEGER, 0::DECIMAL, 'Not Found'::VARCHAR, 'error'::VARCHAR, 0::INTEGER;
    RETURN;
  END IF;

  v_volume_price := v_base_price;

  -- Get customer tier if customer provided
  IF p_customer_id IS NOT NULL AND p_customer_tier IS NULL THEN
    SELECT c.pricing_tier INTO v_customer_tier
    FROM customers c
    WHERE c.id = p_customer_id;
  ELSE
    v_customer_tier := p_customer_tier;
  END IF;

  -- Priority 1: Check customer-specific volume tiers
  IF p_customer_id IS NOT NULL THEN
    SELECT
      COALESCE(cvt.price_cents, ROUND(v_base_price * (1 - cvt.discount_percent / 100))),
      COALESCE(cvt.discount_percent, ROUND((1 - cvt.price_cents::DECIMAL / v_base_price) * 100, 2)),
      'Customer Special'
    INTO v_volume_price, v_discount, v_tier_name
    FROM customer_volume_tiers cvt
    WHERE cvt.customer_id = p_customer_id
      AND (cvt.product_id = p_product_id OR cvt.product_id IS NULL)
      AND cvt.is_active = TRUE
      AND cvt.min_qty <= p_quantity
      AND (cvt.max_qty IS NULL OR cvt.max_qty >= p_quantity)
      AND cvt.effective_from <= CURRENT_DATE
      AND (cvt.effective_to IS NULL OR cvt.effective_to >= CURRENT_DATE)
    ORDER BY
      CASE WHEN cvt.product_id IS NOT NULL THEN 0 ELSE 1 END,
      cvt.min_qty DESC
    LIMIT 1;

    IF v_volume_price IS NOT NULL AND v_volume_price < v_base_price THEN
      v_source := 'customer_volume';
      RETURN QUERY SELECT v_base_price, v_volume_price::INTEGER, v_discount, v_tier_name, v_source, (v_base_price - v_volume_price)::INTEGER;
      RETURN;
    END IF;
  END IF;

  -- Priority 2: Check tier-specific volume overrides
  IF v_customer_tier IS NOT NULL THEN
    SELECT
      COALESCE(tvo.price_cents, ROUND(v_base_price * (1 - tvo.discount_percent / 100))),
      COALESCE(tvo.discount_percent, ROUND((1 - tvo.price_cents::DECIMAL / v_base_price) * 100, 2)),
      COALESCE(tvo.additional_discount_percent, 0)
    INTO v_volume_price, v_discount, v_additional_discount
    FROM tier_volume_overrides tvo
    WHERE tvo.pricing_tier = v_customer_tier
      AND (tvo.product_id = p_product_id OR tvo.product_id IS NULL)
      AND tvo.is_active = TRUE
      AND tvo.min_qty <= p_quantity
      AND (tvo.max_qty IS NULL OR tvo.max_qty >= p_quantity)
      AND tvo.effective_from <= CURRENT_DATE
      AND (tvo.effective_to IS NULL OR tvo.effective_to >= CURRENT_DATE)
    ORDER BY
      CASE WHEN tvo.product_id IS NOT NULL THEN 0 ELSE 1 END,
      tvo.priority DESC,
      tvo.min_qty DESC
    LIMIT 1;

    IF v_volume_price IS NOT NULL AND v_volume_price < v_base_price THEN
      v_source := 'tier_volume';
      v_tier_name := v_customer_tier::VARCHAR || ' Volume';
      RETURN QUERY SELECT v_base_price, v_volume_price::INTEGER, v_discount, v_tier_name, v_source, (v_base_price - v_volume_price)::INTEGER;
      RETURN;
    END IF;
  END IF;

  -- Priority 3: Check product-specific volume tiers
  SELECT
    COALESCE(pvt.price_cents, ROUND(v_base_price * (1 - pvt.discount_percent / 100))),
    COALESCE(pvt.discount_percent, ROUND((1 - pvt.price_cents::DECIMAL / v_base_price) * 100, 2)),
    COALESCE(pvt.tier_name, 'Volume ' || pvt.min_qty || '+')
  INTO v_volume_price, v_discount, v_tier_name
  FROM product_volume_tiers pvt
  WHERE pvt.product_id = p_product_id
    AND pvt.is_active = TRUE
    AND pvt.min_qty <= p_quantity
    AND (pvt.max_qty IS NULL OR pvt.max_qty >= p_quantity)
  ORDER BY pvt.min_qty DESC
  LIMIT 1;

  IF v_volume_price IS NOT NULL AND v_volume_price < v_base_price THEN
    v_source := 'product_volume';

    -- Apply additional tier discount if customer has one (stacking)
    IF v_additional_discount > 0 THEN
      v_volume_price := ROUND(v_volume_price * (1 - v_additional_discount / 100));
      v_discount := v_discount + v_additional_discount;
      v_source := 'product_volume+tier_bonus';
    END IF;

    RETURN QUERY SELECT v_base_price, v_volume_price::INTEGER, v_discount, v_tier_name, v_source, (v_base_price - v_volume_price)::INTEGER;
    RETURN;
  END IF;

  -- Priority 4: Fall back to existing volume_pricing_rules
  SELECT COALESCE(vpr.discount_percent, 0)
  INTO v_discount
  FROM volume_pricing_rules vpr
  WHERE vpr.is_active = TRUE
    AND vpr.effective_from <= CURRENT_DATE
    AND (vpr.effective_to IS NULL OR vpr.effective_to >= CURRENT_DATE)
    AND vpr.min_quantity <= p_quantity
    AND (vpr.max_quantity IS NULL OR vpr.max_quantity >= p_quantity)
    AND (
      vpr.product_id = p_product_id
      OR vpr.product_id IS NULL
    )
    AND (
      vpr.customer_id = p_customer_id
      OR vpr.pricing_tier = v_customer_tier
      OR (vpr.customer_id IS NULL AND vpr.pricing_tier IS NULL)
    )
  ORDER BY
    CASE WHEN vpr.customer_id IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN vpr.product_id IS NOT NULL THEN 0 ELSE 1 END,
    vpr.priority DESC,
    vpr.discount_percent DESC
  LIMIT 1;

  IF v_discount > 0 THEN
    v_volume_price := ROUND(v_base_price * (1 - v_discount / 100));
    v_source := 'volume_rules';
    v_tier_name := 'Volume Discount';
    RETURN QUERY SELECT v_base_price, v_volume_price::INTEGER, v_discount, v_tier_name, v_source, (v_base_price - v_volume_price)::INTEGER;
    RETURN;
  END IF;

  -- No volume pricing applies, return base price
  RETURN QUERY SELECT v_base_price, v_base_price, 0::DECIMAL, 'Standard'::VARCHAR, 'base'::VARCHAR, 0::INTEGER;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- BATCH VOLUME PRICING FUNCTION (For cart with multiple items)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_cart_volume_prices(
  p_items JSONB, -- Array of {product_id, quantity}
  p_customer_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
  product_id INTEGER,
  quantity INTEGER,
  base_price_cents INTEGER,
  volume_price_cents INTEGER,
  discount_percent DECIMAL,
  tier_name VARCHAR,
  line_total_cents BIGINT,
  savings_cents INTEGER
) AS $$
DECLARE
  v_item JSONB;
  v_customer_tier pricing_tier;
BEGIN
  -- Get customer tier once
  IF p_customer_id IS NOT NULL THEN
    SELECT c.pricing_tier INTO v_customer_tier
    FROM customers c
    WHERE c.id = p_customer_id;
  END IF;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    RETURN QUERY
    SELECT
      (v_item->>'product_id')::INTEGER,
      (v_item->>'quantity')::INTEGER,
      vp.base_price_cents,
      vp.volume_price_cents,
      vp.discount_percent,
      vp.tier_name,
      (vp.volume_price_cents * (v_item->>'quantity')::INTEGER)::BIGINT,
      vp.savings_cents * (v_item->>'quantity')::INTEGER
    FROM get_volume_price(
      (v_item->>'product_id')::INTEGER,
      (v_item->>'quantity')::INTEGER,
      p_customer_id,
      v_customer_tier
    ) vp;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- VIEW: PRODUCTS WITH VOLUME PRICING
-- Quick view to see which products have volume tiers configured
-- ============================================================================

CREATE OR REPLACE VIEW v_products_volume_pricing AS
SELECT
  p.id as product_id,
  p.name as product_name,
  p.model,
  COALESCE(p.retail_price_cents, (p.price * 100)::INTEGER) as base_price_cents,
  p.has_volume_pricing,
  COALESCE(
    (SELECT COUNT(*) FROM product_volume_tiers pvt WHERE pvt.product_id = p.id AND pvt.is_active),
    0
  ) as tier_count,
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'min_qty', pvt.min_qty,
        'max_qty', pvt.max_qty,
        'price_cents', pvt.price_cents,
        'discount_percent', pvt.discount_percent,
        'tier_name', pvt.tier_name
      ) ORDER BY pvt.min_qty
    )
    FROM product_volume_tiers pvt
    WHERE pvt.product_id = p.id AND pvt.is_active
  ) as volume_tiers
FROM products p
WHERE p.active = TRUE;

-- ============================================================================
-- TRIGGER: Auto-update has_volume_pricing flag
-- ============================================================================

CREATE OR REPLACE FUNCTION update_product_volume_pricing_flag()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE products
    SET has_volume_pricing = EXISTS (
      SELECT 1 FROM product_volume_tiers pvt
      WHERE pvt.product_id = NEW.product_id AND pvt.is_active
    )
    WHERE id = NEW.product_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE products
    SET has_volume_pricing = EXISTS (
      SELECT 1 FROM product_volume_tiers pvt
      WHERE pvt.product_id = OLD.product_id AND pvt.is_active
    )
    WHERE id = OLD.product_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_volume_pricing_flag ON product_volume_tiers;
CREATE TRIGGER trigger_update_volume_pricing_flag
  AFTER INSERT OR UPDATE OR DELETE ON product_volume_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_product_volume_pricing_flag();

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_volume_tier_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_product_volume_tiers_timestamp ON product_volume_tiers;
CREATE TRIGGER trigger_product_volume_tiers_timestamp
  BEFORE UPDATE ON product_volume_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_volume_tier_timestamp();

DROP TRIGGER IF EXISTS trigger_tier_volume_overrides_timestamp ON tier_volume_overrides;
CREATE TRIGGER trigger_tier_volume_overrides_timestamp
  BEFORE UPDATE ON tier_volume_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_volume_tier_timestamp();

DROP TRIGGER IF EXISTS trigger_customer_volume_tiers_timestamp ON customer_volume_tiers;
CREATE TRIGGER trigger_customer_volume_tiers_timestamp
  BEFORE UPDATE ON customer_volume_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_volume_tier_timestamp();

-- ============================================================================
-- SAMPLE DATA: Example volume tiers
-- ============================================================================

-- Note: These are examples. Uncomment and modify product_id values as needed.

/*
-- Example: Product ID 1 with quantity breaks
INSERT INTO product_volume_tiers (product_id, min_qty, max_qty, price_cents, tier_name)
VALUES
  (1, 1, 9, 10000, 'Single'),      -- 1-9 units: $100.00
  (1, 10, 24, 9000, 'Case'),       -- 10-24 units: $90.00
  (1, 25, 99, 8000, 'Bulk'),       -- 25-99 units: $80.00
  (1, 100, NULL, 7500, 'Pallet');  -- 100+ units: $75.00

-- Example: Wholesale tier gets additional 5% off all volume pricing
INSERT INTO tier_volume_overrides (pricing_tier, min_qty, max_qty, additional_discount_percent, priority)
VALUES
  ('wholesale', 10, 24, 2.0, 10),   -- Wholesale: extra 2% off at 10-24 units
  ('wholesale', 25, 99, 3.0, 11),   -- Wholesale: extra 3% off at 25-99 units
  ('wholesale', 100, NULL, 5.0, 12); -- Wholesale: extra 5% off at 100+ units

-- Example: Dealer tier gets even better breaks
INSERT INTO tier_volume_overrides (pricing_tier, min_qty, max_qty, additional_discount_percent, priority)
VALUES
  ('dealer', 10, 24, 5.0, 20),
  ('dealer', 25, 99, 7.0, 21),
  ('dealer', 100, NULL, 10.0, 22);
*/

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE product_volume_tiers IS 'Simple per-product quantity break pricing tiers';
COMMENT ON TABLE tier_volume_overrides IS 'Customer tier-specific volume pricing overrides (wholesale, dealer, etc.)';
COMMENT ON TABLE customer_volume_tiers IS 'Customer-specific negotiated volume pricing';
COMMENT ON COLUMN product_volume_tiers.price_cents IS 'Fixed price per unit at this quantity tier (mutually exclusive with discount_percent)';
COMMENT ON COLUMN product_volume_tiers.discount_percent IS 'Percentage discount off base price (mutually exclusive with price_cents)';
COMMENT ON COLUMN tier_volume_overrides.additional_discount_percent IS 'Extra discount ON TOP of product_volume_tiers (stacking)';
COMMENT ON FUNCTION get_volume_price IS 'Returns best volume price for a product/customer/quantity - optimized for POS';
COMMENT ON FUNCTION get_cart_volume_prices IS 'Batch function to get volume prices for entire cart - optimized for POS';
