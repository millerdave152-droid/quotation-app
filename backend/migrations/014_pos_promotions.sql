-- ============================================================================
-- Migration 014: POS Promotions System
-- ============================================================================
-- Creates comprehensive promotion system for POS with support for:
-- - Percentage off entire order
-- - Fixed amount off order
-- - Percentage off specific products/categories
-- - Buy X Get Y free
-- - Bundle pricing (buy A + B together for $X)
-- - Free item with purchase threshold
--
-- Constraints supported:
-- - Valid date range
-- - Minimum order amount
-- - Minimum quantity
-- - Specific products or categories
-- - Customer tier restrictions
-- - Usage limits (per customer, total)
-- - Promo code required vs auto-apply
-- ============================================================================

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Promotion type enum
DO $$ BEGIN
  CREATE TYPE pos_promo_type AS ENUM (
    'percent_order',           -- Percentage off entire order
    'fixed_order',             -- Fixed amount off order
    'percent_product',         -- Percentage off specific products
    'fixed_product',           -- Fixed amount off specific products
    'buy_x_get_y',             -- Buy X items, get Y free/discounted
    'bundle',                  -- Bundle pricing (A + B for $X)
    'free_item_threshold',     -- Free item when spending over threshold
    'category_percent',        -- Percentage off category
    'category_fixed'           -- Fixed amount off category
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Promotion status enum
DO $$ BEGIN
  CREATE TYPE pos_promo_status AS ENUM (
    'draft',       -- Being created, not active
    'scheduled',   -- Scheduled for future activation
    'active',      -- Currently active
    'paused',      -- Temporarily disabled
    'expired',     -- Past end date
    'exhausted',   -- Usage limit reached
    'archived'     -- No longer in use
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Rule condition type enum
DO $$ BEGIN
  CREATE TYPE promo_rule_type AS ENUM (
    'min_order_amount',        -- Minimum order $ amount
    'min_order_quantity',      -- Minimum total items
    'min_product_quantity',    -- Minimum qty of specific product
    'min_category_quantity',   -- Minimum qty from category
    'customer_tier',           -- Customer must be specific tier
    'customer_tag',            -- Customer has specific tag
    'day_of_week',             -- Valid on specific days
    'time_of_day',             -- Valid during specific hours
    'first_purchase',          -- Customer's first purchase
    'product_combo',           -- Specific products together
    'category_combo',          -- Products from multiple categories
    'exclude_product',         -- Exclude specific products
    'exclude_category',        -- Exclude category
    'exclude_on_sale',         -- Exclude already discounted items
    'payment_method'           -- Specific payment methods only
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- MAIN PROMOTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS pos_promotions (
  id SERIAL PRIMARY KEY,

  -- Basic identification
  promo_code VARCHAR(50) UNIQUE,  -- NULL = auto-apply (no code needed)
  name VARCHAR(255) NOT NULL,
  description TEXT,
  internal_notes TEXT,

  -- Promotion type and configuration
  promo_type pos_promo_type NOT NULL,
  status pos_promo_status DEFAULT 'draft',

  -- Discount configuration (depends on promo_type)
  discount_percent DECIMAL(5,2),           -- For percentage discounts
  discount_amount_cents INTEGER,           -- For fixed amount discounts
  max_discount_cents INTEGER,              -- Cap on discount amount

  -- Buy X Get Y configuration
  buy_quantity INTEGER,                    -- Buy this many
  get_quantity INTEGER,                    -- Get this many
  get_discount_percent DECIMAL(5,2),       -- Discount on "get" items (100 = free)
  get_product_id INTEGER REFERENCES products(id),  -- Specific product to get (optional)

  -- Bundle configuration
  bundle_price_cents INTEGER,              -- Total bundle price
  bundle_items JSONB,                      -- Array of {productId, quantity} for bundle

  -- Free item threshold
  threshold_amount_cents INTEGER,          -- Spend this much
  free_item_product_id INTEGER REFERENCES products(id),  -- Get this item free
  free_item_value_cents INTEGER,           -- OR pick any item up to this value

  -- Validity period
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_date TIMESTAMP WITH TIME ZONE,

  -- Usage limits
  max_uses_total INTEGER,                  -- NULL = unlimited
  max_uses_per_customer INTEGER,           -- NULL = unlimited
  current_uses INTEGER DEFAULT 0,

  -- Minimum requirements (basic - complex rules go in promotion_rules)
  min_order_cents INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 0,

  -- Customer restrictions
  customer_tier_required pricing_tier,     -- Uses existing pricing_tier enum
  customer_tiers_allowed pricing_tier[],   -- Array of allowed tiers

  -- Application settings
  auto_apply BOOLEAN DEFAULT FALSE,        -- Apply automatically or require code
  combinable BOOLEAN DEFAULT FALSE,        -- Can stack with other promos
  combination_group VARCHAR(50),           -- Promos in same group don't stack
  priority INTEGER DEFAULT 0,              -- Higher = applied first

  -- Display settings
  display_name VARCHAR(100),               -- Short name for UI
  badge_text VARCHAR(30),                  -- "SALE", "20% OFF", etc.
  badge_color VARCHAR(20) DEFAULT '#10B981',  -- Tailwind green-500
  show_in_catalog BOOLEAN DEFAULT TRUE,
  show_countdown BOOLEAN DEFAULT FALSE,

  -- Tracking
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_discount_config CHECK (
    CASE
      WHEN promo_type IN ('percent_order', 'percent_product', 'category_percent')
        THEN discount_percent IS NOT NULL AND discount_percent > 0 AND discount_percent <= 100
      WHEN promo_type IN ('fixed_order', 'fixed_product', 'category_fixed')
        THEN discount_amount_cents IS NOT NULL AND discount_amount_cents > 0
      WHEN promo_type = 'buy_x_get_y'
        THEN buy_quantity IS NOT NULL AND get_quantity IS NOT NULL
      WHEN promo_type = 'bundle'
        THEN bundle_price_cents IS NOT NULL AND bundle_items IS NOT NULL
      WHEN promo_type = 'free_item_threshold'
        THEN threshold_amount_cents IS NOT NULL AND (free_item_product_id IS NOT NULL OR free_item_value_cents IS NOT NULL)
      ELSE TRUE
    END
  ),
  CONSTRAINT valid_dates CHECK (end_date IS NULL OR end_date > start_date),
  CONSTRAINT valid_uses CHECK (
    (max_uses_total IS NULL OR max_uses_total > 0) AND
    (max_uses_per_customer IS NULL OR max_uses_per_customer > 0)
  )
);

-- ============================================================================
-- PROMOTION RULES TABLE (Conditions/Constraints)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pos_promotion_rules (
  id SERIAL PRIMARY KEY,
  promotion_id INTEGER NOT NULL REFERENCES pos_promotions(id) ON DELETE CASCADE,

  -- Rule definition
  rule_type promo_rule_type NOT NULL,
  rule_operator VARCHAR(10) DEFAULT '>=',  -- >=, <=, =, IN, NOT IN, BETWEEN

  -- Rule values (usage depends on rule_type)
  value_int INTEGER,                       -- For numeric comparisons
  value_decimal DECIMAL(10,2),             -- For decimal comparisons
  value_text VARCHAR(255),                 -- For text comparisons
  value_array JSONB,                       -- For IN/NOT IN operations (array of values)
  value_range JSONB,                       -- For BETWEEN {min, max}

  -- Referenced entities
  product_id INTEGER REFERENCES products(id),
  category_id INTEGER,                     -- References categories (if table exists)

  -- Rule logic
  is_required BOOLEAN DEFAULT TRUE,        -- Must pass or optional
  rule_group VARCHAR(50),                  -- Rules in same group are OR'd, different groups AND'd

  -- Metadata
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- PROMOTION PRODUCTS TABLE (Product/Category Targeting)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pos_promotion_products (
  id SERIAL PRIMARY KEY,
  promotion_id INTEGER NOT NULL REFERENCES pos_promotions(id) ON DELETE CASCADE,

  -- Targeting type
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('product', 'category', 'brand', 'manufacturer', 'sku_pattern')),

  -- Target identification
  product_id INTEGER REFERENCES products(id),
  category_name VARCHAR(100),              -- Category name
  brand_name VARCHAR(100),                 -- Brand name
  manufacturer_name VARCHAR(100),          -- Manufacturer
  sku_pattern VARCHAR(100),                -- SQL LIKE pattern for SKU matching

  -- Inclusion/Exclusion
  is_included BOOLEAN DEFAULT TRUE,        -- TRUE = include, FALSE = exclude

  -- For bundle/buy-x-get-y: role of this product
  product_role VARCHAR(20) CHECK (product_role IN ('qualifying', 'reward', 'bundle_item', NULL)),
  required_quantity INTEGER DEFAULT 1,      -- Quantity needed for this item

  -- For bundle pricing: specific price for this item in bundle
  bundle_item_price_cents INTEGER,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- PROMOTION USAGE TABLE (Redemption Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pos_promotion_usage (
  id SERIAL PRIMARY KEY,
  promotion_id INTEGER NOT NULL REFERENCES pos_promotions(id) ON DELETE CASCADE,

  -- Where applied
  transaction_id INTEGER REFERENCES transactions(transaction_id),
  quotation_id INTEGER REFERENCES quotations(id),

  -- Who used it
  customer_id INTEGER REFERENCES customers(id),
  user_id INTEGER REFERENCES users(id),     -- Cashier who applied

  -- Usage details
  discount_applied_cents INTEGER NOT NULL,
  items_affected JSONB,                     -- Array of {itemId, productId, discountCents}

  -- For buy-x-get-y / free item
  free_items_given JSONB,                   -- Array of {productId, quantity, valueCents}

  -- Promo code entered (if applicable)
  code_entered VARCHAR(50),

  -- Status
  status VARCHAR(20) DEFAULT 'applied' CHECK (status IN ('applied', 'voided', 'refunded')),
  voided_at TIMESTAMP WITH TIME ZONE,
  voided_by INTEGER REFERENCES users(id),
  void_reason TEXT,

  -- Metadata
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate applications to same transaction
  UNIQUE(promotion_id, transaction_id),
  UNIQUE(promotion_id, quotation_id)
);

-- ============================================================================
-- PROMOTION COMBINATIONS TABLE (Stacking Rules)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pos_promotion_combinations (
  id SERIAL PRIMARY KEY,
  promotion_id INTEGER NOT NULL REFERENCES pos_promotions(id) ON DELETE CASCADE,

  -- Can combine with these promotions
  can_combine_with_id INTEGER REFERENCES pos_promotions(id) ON DELETE CASCADE,

  -- Or exclude these
  cannot_combine_with_id INTEGER REFERENCES pos_promotions(id) ON DELETE CASCADE,

  -- Logic
  combination_type VARCHAR(20) NOT NULL CHECK (combination_type IN ('allow', 'deny')),

  CONSTRAINT one_combination_type CHECK (
    (can_combine_with_id IS NOT NULL AND cannot_combine_with_id IS NULL) OR
    (can_combine_with_id IS NULL AND cannot_combine_with_id IS NOT NULL)
  )
);

-- ============================================================================
-- PROMOTION SCHEDULES TABLE (Recurring Promotions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pos_promotion_schedules (
  id SERIAL PRIMARY KEY,
  promotion_id INTEGER NOT NULL REFERENCES pos_promotions(id) ON DELETE CASCADE,

  -- Day restrictions
  valid_days INTEGER[],                    -- 0=Sunday, 1=Monday, etc.

  -- Time restrictions
  valid_time_start TIME,
  valid_time_end TIME,

  -- Recurring pattern
  recurrence_type VARCHAR(20) CHECK (recurrence_type IN ('daily', 'weekly', 'monthly', 'custom')),
  recurrence_days JSONB,                   -- For custom: specific dates/conditions

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Main promotions table indexes
CREATE INDEX IF NOT EXISTS idx_pos_promotions_code ON pos_promotions(promo_code) WHERE promo_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_promotions_status ON pos_promotions(status);
CREATE INDEX IF NOT EXISTS idx_pos_promotions_type ON pos_promotions(promo_type);
CREATE INDEX IF NOT EXISTS idx_pos_promotions_dates ON pos_promotions(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_pos_promotions_auto_apply ON pos_promotions(auto_apply) WHERE auto_apply = TRUE;
CREATE INDEX IF NOT EXISTS idx_pos_promotions_active ON pos_promotions(status, start_date, end_date)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pos_promotions_customer_tier ON pos_promotions(customer_tier_required)
  WHERE customer_tier_required IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_promotions_priority ON pos_promotions(priority DESC);

-- Rules table indexes
CREATE INDEX IF NOT EXISTS idx_pos_promo_rules_promotion ON pos_promotion_rules(promotion_id);
CREATE INDEX IF NOT EXISTS idx_pos_promo_rules_type ON pos_promotion_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_pos_promo_rules_product ON pos_promotion_rules(product_id) WHERE product_id IS NOT NULL;

-- Products table indexes
CREATE INDEX IF NOT EXISTS idx_pos_promo_products_promotion ON pos_promotion_products(promotion_id);
CREATE INDEX IF NOT EXISTS idx_pos_promo_products_product ON pos_promotion_products(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_promo_products_category ON pos_promotion_products(category_name) WHERE category_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_promo_products_brand ON pos_promotion_products(brand_name) WHERE brand_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_promo_products_type ON pos_promotion_products(target_type);
CREATE INDEX IF NOT EXISTS idx_pos_promo_products_role ON pos_promotion_products(product_role) WHERE product_role IS NOT NULL;

-- Usage table indexes
CREATE INDEX IF NOT EXISTS idx_pos_promo_usage_promotion ON pos_promotion_usage(promotion_id);
CREATE INDEX IF NOT EXISTS idx_pos_promo_usage_customer ON pos_promotion_usage(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_promo_usage_transaction ON pos_promotion_usage(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_promo_usage_quotation ON pos_promotion_usage(quotation_id) WHERE quotation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_promo_usage_date ON pos_promotion_usage(applied_at);
CREATE INDEX IF NOT EXISTS idx_pos_promo_usage_status ON pos_promotion_usage(status);

-- Combinations table indexes
CREATE INDEX IF NOT EXISTS idx_pos_promo_combos_promotion ON pos_promotion_combinations(promotion_id);
CREATE INDEX IF NOT EXISTS idx_pos_promo_combos_allow ON pos_promotion_combinations(can_combine_with_id) WHERE can_combine_with_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_promo_combos_deny ON pos_promotion_combinations(cannot_combine_with_id) WHERE cannot_combine_with_id IS NOT NULL;

-- Schedules table indexes
CREATE INDEX IF NOT EXISTS idx_pos_promo_schedules_promotion ON pos_promotion_schedules(promotion_id);
CREATE INDEX IF NOT EXISTS idx_pos_promo_schedules_days ON pos_promotion_schedules USING GIN(valid_days);

-- ============================================================================
-- DATABASE FUNCTIONS
-- ============================================================================

-- Function to check if a promotion is currently valid
CREATE OR REPLACE FUNCTION is_promotion_valid(p_promotion_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  v_promo RECORD;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_schedule RECORD;
  v_current_day INTEGER;
  v_current_time TIME;
BEGIN
  -- Get promotion
  SELECT * INTO v_promo FROM pos_promotions WHERE id = p_promotion_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check status
  IF v_promo.status NOT IN ('active', 'scheduled') THEN
    RETURN FALSE;
  END IF;

  -- Check date range
  IF v_promo.start_date > v_now THEN
    RETURN FALSE;
  END IF;

  IF v_promo.end_date IS NOT NULL AND v_promo.end_date < v_now THEN
    RETURN FALSE;
  END IF;

  -- Check usage limits
  IF v_promo.max_uses_total IS NOT NULL AND v_promo.current_uses >= v_promo.max_uses_total THEN
    RETURN FALSE;
  END IF;

  -- Check schedule restrictions
  SELECT * INTO v_schedule FROM pos_promotion_schedules WHERE promotion_id = p_promotion_id LIMIT 1;

  IF FOUND THEN
    v_current_day := EXTRACT(DOW FROM v_now)::INTEGER;
    v_current_time := v_now::TIME;

    -- Check valid days
    IF v_schedule.valid_days IS NOT NULL AND NOT (v_current_day = ANY(v_schedule.valid_days)) THEN
      RETURN FALSE;
    END IF;

    -- Check valid times
    IF v_schedule.valid_time_start IS NOT NULL AND v_schedule.valid_time_end IS NOT NULL THEN
      IF v_current_time < v_schedule.valid_time_start OR v_current_time > v_schedule.valid_time_end THEN
        RETURN FALSE;
      END IF;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to check customer usage count
CREATE OR REPLACE FUNCTION get_customer_promo_usage_count(
  p_promotion_id INTEGER,
  p_customer_id INTEGER
)
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(
    (SELECT COUNT(*) FROM pos_promotion_usage
     WHERE promotion_id = p_promotion_id
     AND customer_id = p_customer_id
     AND status = 'applied'),
    0
  );
END;
$$ LANGUAGE plpgsql;

-- Function to check if customer can use promotion
CREATE OR REPLACE FUNCTION can_customer_use_promotion(
  p_promotion_id INTEGER,
  p_customer_id INTEGER
)
RETURNS TABLE(
  can_use BOOLEAN,
  reason TEXT
) AS $$
DECLARE
  v_promo RECORD;
  v_customer RECORD;
  v_usage_count INTEGER;
BEGIN
  -- Get promotion
  SELECT * INTO v_promo FROM pos_promotions WHERE id = p_promotion_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Promotion not found';
    RETURN;
  END IF;

  -- Check basic validity
  IF NOT is_promotion_valid(p_promotion_id) THEN
    RETURN QUERY SELECT FALSE, 'Promotion is not currently valid';
    RETURN;
  END IF;

  -- Check customer tier if required
  IF v_promo.customer_tier_required IS NOT NULL AND p_customer_id IS NOT NULL THEN
    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;

    IF FOUND THEN
      IF v_customer.pricing_tier != v_promo.customer_tier_required THEN
        RETURN QUERY SELECT FALSE, 'Customer tier does not qualify for this promotion';
        RETURN;
      END IF;
    END IF;
  END IF;

  -- Check allowed tiers array
  IF v_promo.customer_tiers_allowed IS NOT NULL AND array_length(v_promo.customer_tiers_allowed, 1) > 0 THEN
    IF p_customer_id IS NOT NULL THEN
      SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;

      IF FOUND AND NOT (v_customer.pricing_tier = ANY(v_promo.customer_tiers_allowed)) THEN
        RETURN QUERY SELECT FALSE, 'Customer tier not in allowed list';
        RETURN;
      END IF;
    END IF;
  END IF;

  -- Check per-customer usage limit
  IF v_promo.max_uses_per_customer IS NOT NULL AND p_customer_id IS NOT NULL THEN
    v_usage_count := get_customer_promo_usage_count(p_promotion_id, p_customer_id);

    IF v_usage_count >= v_promo.max_uses_per_customer THEN
      RETURN QUERY SELECT FALSE, 'Customer has reached usage limit for this promotion';
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to get applicable promotions for a cart
CREATE OR REPLACE FUNCTION get_applicable_promotions(
  p_customer_id INTEGER,
  p_cart_items JSONB,  -- Array of {productId, quantity, unitPriceCents, categoryName, brandName}
  p_subtotal_cents INTEGER,
  p_include_code_required BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
  promotion_id INTEGER,
  promo_code VARCHAR(50),
  name VARCHAR(255),
  promo_type pos_promo_type,
  discount_preview_cents INTEGER,
  requires_code BOOLEAN,
  priority INTEGER
) AS $$
DECLARE
  v_promo RECORD;
  v_discount INTEGER;
  v_total_quantity INTEGER;
  v_item JSONB;
  v_matching_qty INTEGER;
  v_can_use RECORD;
BEGIN
  -- Calculate total quantity
  SELECT COALESCE(SUM((item->>'quantity')::INTEGER), 0) INTO v_total_quantity
  FROM jsonb_array_elements(p_cart_items) AS item;

  -- Loop through active promotions
  FOR v_promo IN
    SELECT p.* FROM pos_promotions p
    WHERE p.status = 'active'
    AND (p.start_date IS NULL OR p.start_date <= NOW())
    AND (p.end_date IS NULL OR p.end_date > NOW())
    AND (p_include_code_required OR p.auto_apply = TRUE OR p.promo_code IS NULL)
    ORDER BY p.priority DESC, p.discount_percent DESC NULLS LAST
  LOOP
    -- Check if customer can use this promotion
    SELECT * INTO v_can_use FROM can_customer_use_promotion(v_promo.id, p_customer_id);

    IF NOT v_can_use.can_use THEN
      CONTINUE;
    END IF;

    -- Check minimum order amount
    IF v_promo.min_order_cents > 0 AND p_subtotal_cents < v_promo.min_order_cents THEN
      CONTINUE;
    END IF;

    -- Check minimum quantity
    IF v_promo.min_quantity > 0 AND v_total_quantity < v_promo.min_quantity THEN
      CONTINUE;
    END IF;

    -- Calculate discount preview based on type
    v_discount := 0;

    CASE v_promo.promo_type
      WHEN 'percent_order' THEN
        v_discount := ROUND(p_subtotal_cents * v_promo.discount_percent / 100);
        IF v_promo.max_discount_cents IS NOT NULL THEN
          v_discount := LEAST(v_discount, v_promo.max_discount_cents);
        END IF;

      WHEN 'fixed_order' THEN
        v_discount := LEAST(v_promo.discount_amount_cents, p_subtotal_cents);

      WHEN 'percent_product', 'category_percent' THEN
        -- Calculate discount on matching products
        SELECT COALESCE(SUM(
          ROUND((item->>'unitPriceCents')::INTEGER * (item->>'quantity')::INTEGER * v_promo.discount_percent / 100)
        ), 0) INTO v_discount
        FROM jsonb_array_elements(p_cart_items) AS item
        WHERE EXISTS (
          SELECT 1 FROM pos_promotion_products pp
          WHERE pp.promotion_id = v_promo.id
          AND pp.is_included = TRUE
          AND (
            (pp.product_id = (item->>'productId')::INTEGER)
            OR (pp.category_name = item->>'categoryName')
            OR (pp.brand_name = item->>'brandName')
          )
        );

        IF v_promo.max_discount_cents IS NOT NULL THEN
          v_discount := LEAST(v_discount, v_promo.max_discount_cents);
        END IF;

      WHEN 'fixed_product', 'category_fixed' THEN
        -- Count matching items and apply fixed discount
        SELECT COALESCE(SUM((item->>'quantity')::INTEGER), 0) INTO v_matching_qty
        FROM jsonb_array_elements(p_cart_items) AS item
        WHERE EXISTS (
          SELECT 1 FROM pos_promotion_products pp
          WHERE pp.promotion_id = v_promo.id
          AND pp.is_included = TRUE
          AND (
            (pp.product_id = (item->>'productId')::INTEGER)
            OR (pp.category_name = item->>'categoryName')
          )
        );

        v_discount := v_matching_qty * v_promo.discount_amount_cents;

      WHEN 'buy_x_get_y' THEN
        -- Calculate number of "sets" that qualify
        IF v_total_quantity >= v_promo.buy_quantity THEN
          v_discount := ROUND(
            (v_total_quantity / (v_promo.buy_quantity + v_promo.get_quantity))
            * v_promo.get_quantity
            * COALESCE(
              (SELECT MIN((item->>'unitPriceCents')::INTEGER) FROM jsonb_array_elements(p_cart_items) AS item),
              0
            )
            * v_promo.get_discount_percent / 100
          );
        END IF;

      WHEN 'bundle' THEN
        -- Check if all bundle items are present
        -- Simplified: calculate difference between regular price and bundle price
        v_discount := GREATEST(0, p_subtotal_cents - v_promo.bundle_price_cents);

      WHEN 'free_item_threshold' THEN
        IF p_subtotal_cents >= v_promo.threshold_amount_cents THEN
          v_discount := COALESCE(
            v_promo.free_item_value_cents,
            (SELECT retail_price_cents FROM products WHERE id = v_promo.free_item_product_id)
          );
        END IF;
    END CASE;

    -- Only return if there's an actual discount
    IF v_discount > 0 THEN
      RETURN QUERY SELECT
        v_promo.id,
        v_promo.promo_code,
        v_promo.name,
        v_promo.promo_type,
        v_discount,
        v_promo.promo_code IS NOT NULL AND v_promo.auto_apply = FALSE,
        v_promo.priority;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to apply a promotion (record usage)
CREATE OR REPLACE FUNCTION apply_promotion(
  p_promotion_id INTEGER,
  p_transaction_id INTEGER DEFAULT NULL,
  p_quotation_id INTEGER DEFAULT NULL,
  p_customer_id INTEGER DEFAULT NULL,
  p_user_id INTEGER DEFAULT NULL,
  p_discount_cents INTEGER DEFAULT 0,
  p_items_affected JSONB DEFAULT NULL,
  p_code_entered VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  usage_id INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_can_use RECORD;
  v_promo RECORD;
  v_usage_id INTEGER;
BEGIN
  -- Check if promotion can be used
  SELECT * INTO v_can_use FROM can_customer_use_promotion(p_promotion_id, p_customer_id);

  IF NOT v_can_use.can_use THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, v_can_use.reason;
    RETURN;
  END IF;

  -- Get promotion for code validation
  SELECT * INTO v_promo FROM pos_promotions WHERE id = p_promotion_id;

  -- Validate promo code if required
  IF v_promo.promo_code IS NOT NULL AND NOT v_promo.auto_apply THEN
    IF p_code_entered IS NULL OR UPPER(p_code_entered) != UPPER(v_promo.promo_code) THEN
      RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Invalid promo code';
      RETURN;
    END IF;
  END IF;

  -- Record usage
  INSERT INTO pos_promotion_usage (
    promotion_id,
    transaction_id,
    quotation_id,
    customer_id,
    user_id,
    discount_applied_cents,
    items_affected,
    code_entered
  ) VALUES (
    p_promotion_id,
    p_transaction_id,
    p_quotation_id,
    p_customer_id,
    p_user_id,
    p_discount_cents,
    p_items_affected,
    p_code_entered
  )
  RETURNING id INTO v_usage_id;

  -- Increment usage counter
  UPDATE pos_promotions
  SET current_uses = current_uses + 1,
      updated_at = NOW()
  WHERE id = p_promotion_id;

  -- Check if promotion is now exhausted
  IF v_promo.max_uses_total IS NOT NULL AND v_promo.current_uses + 1 >= v_promo.max_uses_total THEN
    UPDATE pos_promotions SET status = 'exhausted', updated_at = NOW() WHERE id = p_promotion_id;
  END IF;

  RETURN QUERY SELECT TRUE, v_usage_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to void a promotion usage
CREATE OR REPLACE FUNCTION void_promotion_usage(
  p_usage_id INTEGER,
  p_user_id INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_usage RECORD;
BEGIN
  SELECT * INTO v_usage FROM pos_promotion_usage WHERE id = p_usage_id AND status = 'applied';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Update usage record
  UPDATE pos_promotion_usage
  SET status = 'voided',
      voided_at = NOW(),
      voided_by = p_user_id,
      void_reason = p_reason
  WHERE id = p_usage_id;

  -- Decrement usage counter
  UPDATE pos_promotions
  SET current_uses = GREATEST(0, current_uses - 1),
      updated_at = NOW()
  WHERE id = v_usage.promotion_id;

  -- If promotion was exhausted, set back to active
  UPDATE pos_promotions
  SET status = 'active', updated_at = NOW()
  WHERE id = v_usage.promotion_id
  AND status = 'exhausted';

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update status based on dates
CREATE OR REPLACE FUNCTION update_promotion_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Set to scheduled if start date is in future
  IF NEW.start_date > NOW() AND NEW.status = 'draft' THEN
    NEW.status := 'scheduled';
  END IF;

  -- Set to active if start date has passed
  IF NEW.start_date <= NOW() AND NEW.status = 'scheduled' THEN
    NEW.status := 'active';
  END IF;

  -- Set to expired if end date has passed
  IF NEW.end_date IS NOT NULL AND NEW.end_date < NOW() AND NEW.status = 'active' THEN
    NEW.status := 'expired';
  END IF;

  -- Update timestamp
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_promotion_status
  BEFORE INSERT OR UPDATE ON pos_promotions
  FOR EACH ROW
  EXECUTE FUNCTION update_promotion_status();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active promotions view
CREATE OR REPLACE VIEW v_active_promotions AS
SELECT
  p.*,
  COALESCE(p.max_uses_total - p.current_uses, 999999) AS uses_remaining,
  CASE
    WHEN p.end_date IS NOT NULL
    THEN EXTRACT(EPOCH FROM (p.end_date - NOW())) / 86400
    ELSE NULL
  END AS days_remaining,
  (
    SELECT COUNT(*) FROM pos_promotion_products pp WHERE pp.promotion_id = p.id
  ) AS product_count,
  (
    SELECT COUNT(*) FROM pos_promotion_rules pr WHERE pr.promotion_id = p.id
  ) AS rule_count
FROM pos_promotions p
WHERE p.status = 'active'
AND (p.start_date IS NULL OR p.start_date <= NOW())
AND (p.end_date IS NULL OR p.end_date > NOW())
AND (p.max_uses_total IS NULL OR p.current_uses < p.max_uses_total);

-- Promotion usage summary view
CREATE OR REPLACE VIEW v_promotion_usage_summary AS
SELECT
  p.id AS promotion_id,
  p.name,
  p.promo_code,
  p.promo_type,
  p.status,
  p.current_uses,
  p.max_uses_total,
  COALESCE(SUM(pu.discount_applied_cents), 0) AS total_discount_cents,
  COUNT(DISTINCT pu.customer_id) AS unique_customers,
  COUNT(DISTINCT pu.transaction_id) AS transaction_count,
  MIN(pu.applied_at) AS first_used,
  MAX(pu.applied_at) AS last_used
FROM pos_promotions p
LEFT JOIN pos_promotion_usage pu ON p.id = pu.promotion_id AND pu.status = 'applied'
GROUP BY p.id, p.name, p.promo_code, p.promo_type, p.status, p.current_uses, p.max_uses_total;

-- ============================================================================
-- SAMPLE DATA (for testing)
-- ============================================================================

-- Insert sample promotions (uncomment to use)
/*
INSERT INTO pos_promotions (promo_code, name, description, promo_type, discount_percent, auto_apply, start_date, end_date, status)
VALUES
  ('SAVE10', '10% Off Everything', 'Save 10% on your entire order', 'percent_order', 10.00, FALSE, NOW(), NOW() + INTERVAL '30 days', 'active'),
  (NULL, 'First Time Customer', 'Automatic 5% off for first-time customers', 'percent_order', 5.00, TRUE, NOW(), NULL, 'active'),
  ('SUMMER50', '$50 Off Orders Over $200', 'Spend $200, save $50', 'fixed_order', NULL, FALSE, NOW(), NOW() + INTERVAL '60 days', 'active');

UPDATE pos_promotions SET discount_amount_cents = 5000, min_order_cents = 20000 WHERE promo_code = 'SUMMER50';

-- Add a rule for first-time customer promo
INSERT INTO pos_promotion_rules (promotion_id, rule_type, description)
SELECT id, 'first_purchase', 'Must be customer''s first purchase'
FROM pos_promotions WHERE name = 'First Time Customer';
*/

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE pos_promotions IS 'Main table for POS promotions including discounts, buy-x-get-y, bundles, and free items';
COMMENT ON TABLE pos_promotion_rules IS 'Conditions/constraints that must be met for a promotion to apply';
COMMENT ON TABLE pos_promotion_products IS 'Products, categories, or brands that a promotion applies to';
COMMENT ON TABLE pos_promotion_usage IS 'Tracks each time a promotion is redeemed';
COMMENT ON TABLE pos_promotion_combinations IS 'Defines which promotions can or cannot be used together';
COMMENT ON TABLE pos_promotion_schedules IS 'Time-based restrictions for promotions (days, hours)';

COMMENT ON FUNCTION is_promotion_valid IS 'Check if a promotion is currently valid based on status, dates, and usage limits';
COMMENT ON FUNCTION can_customer_use_promotion IS 'Check if a specific customer can use a promotion';
COMMENT ON FUNCTION get_applicable_promotions IS 'Get all promotions that could apply to a given cart';
COMMENT ON FUNCTION apply_promotion IS 'Record a promotion redemption and update usage counters';
COMMENT ON FUNCTION void_promotion_usage IS 'Void a previously applied promotion (for refunds/corrections)';
