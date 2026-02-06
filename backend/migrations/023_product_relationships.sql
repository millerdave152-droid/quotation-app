-- Migration: 023_product_relationships.sql
-- Description: Product relationships and recommendation system
-- Created: 2026-01-27

-- ============================================================================
-- PRODUCT RELATIONSHIPS
-- Stores all types of product relationships (curated and auto-generated)
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_relationships (
  id SERIAL PRIMARY KEY,

  -- The source product
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- The related product
  related_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Type of relationship
  relationship_type VARCHAR(30) NOT NULL CHECK (
    relationship_type IN ('bought_together', 'accessory', 'upgrade', 'alternative')
  ),

  -- Relevance score (0.0 = weak, 1.0 = strong)
  strength DECIMAL(3, 2) NOT NULL DEFAULT 0.50 CHECK (strength >= 0 AND strength <= 1),

  -- Whether this was manually curated (true) or auto-generated (false)
  is_curated BOOLEAN NOT NULL DEFAULT false,

  -- Display settings
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,

  -- For auto-generated: track the source of the relationship
  source VARCHAR(50), -- 'purchase_analysis', 'category_rule', 'manual', etc.

  -- Notes for curated relationships
  notes TEXT,

  -- Audit
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Prevent duplicate relationships of the same type
  CONSTRAINT unique_product_relationship UNIQUE (product_id, related_product_id, relationship_type),

  -- Prevent self-referencing
  CONSTRAINT no_self_reference CHECK (product_id != related_product_id)
);

-- Indexes for fast lookup
CREATE INDEX idx_product_relationships_product ON product_relationships(product_id);
CREATE INDEX idx_product_relationships_related ON product_relationships(related_product_id);
CREATE INDEX idx_product_relationships_type ON product_relationships(relationship_type);
CREATE INDEX idx_product_relationships_active ON product_relationships(is_active) WHERE is_active = true;
CREATE INDEX idx_product_relationships_curated ON product_relationships(is_curated) WHERE is_curated = true;
CREATE INDEX idx_product_relationships_strength ON product_relationships(strength DESC);

-- Composite index for common query pattern: get all active relationships for a product
CREATE INDEX idx_product_relationships_lookup ON product_relationships(product_id, relationship_type, is_active, strength DESC);

-- ============================================================================
-- PURCHASE PATTERNS
-- Tracks co-purchase frequency for ML/analysis and auto-generating relationships
-- ============================================================================

CREATE TABLE IF NOT EXISTS purchase_patterns (
  id SERIAL PRIMARY KEY,

  -- The two products that were purchased together
  -- Always store with product_a_id < product_b_id to avoid duplicates
  product_a_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_b_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- How many times these products were purchased together
  co_purchase_count INTEGER NOT NULL DEFAULT 1,

  -- Individual purchase counts for calculating confidence
  product_a_purchase_count INTEGER DEFAULT 0,
  product_b_purchase_count INTEGER DEFAULT 0,

  -- Calculated metrics (updated periodically)
  -- Confidence: P(B|A) = co_purchase_count / product_a_purchase_count
  confidence_a_to_b DECIMAL(5, 4) DEFAULT 0, -- If customer buys A, probability they buy B
  confidence_b_to_a DECIMAL(5, 4) DEFAULT 0, -- If customer buys B, probability they buy A

  -- Lift: How much more likely compared to random chance
  -- Lift = P(A and B) / (P(A) * P(B))
  lift DECIMAL(8, 4) DEFAULT 1.0,

  -- Time tracking
  first_co_purchase_at TIMESTAMP DEFAULT NOW(),
  last_co_purchase_at TIMESTAMP DEFAULT NOW(),
  last_updated TIMESTAMP DEFAULT NOW(),

  -- Ensure product_a_id < product_b_id to prevent duplicates
  CONSTRAINT unique_purchase_pattern UNIQUE (product_a_id, product_b_id),
  CONSTRAINT ordered_product_ids CHECK (product_a_id < product_b_id)
);

-- Indexes for analysis
CREATE INDEX idx_purchase_patterns_product_a ON purchase_patterns(product_a_id);
CREATE INDEX idx_purchase_patterns_product_b ON purchase_patterns(product_b_id);
CREATE INDEX idx_purchase_patterns_count ON purchase_patterns(co_purchase_count DESC);
CREATE INDEX idx_purchase_patterns_confidence_a ON purchase_patterns(confidence_a_to_b DESC);
CREATE INDEX idx_purchase_patterns_confidence_b ON purchase_patterns(confidence_b_to_a DESC);
CREATE INDEX idx_purchase_patterns_lift ON purchase_patterns(lift DESC);
CREATE INDEX idx_purchase_patterns_recent ON purchase_patterns(last_co_purchase_at DESC);

-- ============================================================================
-- RECOMMENDATION RULES
-- Category-based rules for suggesting products
-- ============================================================================

CREATE TABLE IF NOT EXISTS recommendation_rules (
  id SERIAL PRIMARY KEY,

  -- Rule name for admin interface
  name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Source condition: when customer has item from this category in cart
  source_category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,

  -- Source can also be a specific product
  source_product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,

  -- Target: what to recommend
  -- Either a category (suggest any active product from it)
  target_category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  -- Or a specific product
  target_product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,

  -- Rule type for clarity
  rule_type VARCHAR(30) NOT NULL DEFAULT 'category_to_category' CHECK (
    rule_type IN ('category_to_category', 'category_to_product', 'product_to_category', 'product_to_product')
  ),

  -- Priority (higher = show first)
  priority INTEGER NOT NULL DEFAULT 50,

  -- Limits
  max_recommendations INTEGER DEFAULT 3, -- Max products to show from this rule

  -- Filters for target products
  min_price DECIMAL(10, 2), -- Only suggest products above this price
  max_price DECIMAL(10, 2), -- Only suggest products below this price
  price_relative_to_source VARCHAR(20), -- 'below', 'above', 'similar' (within 20%)

  -- Conditions
  require_stock BOOLEAN DEFAULT true, -- Only suggest in-stock items
  exclude_on_sale BOOLEAN DEFAULT false, -- Don't suggest sale items

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Validity period
  valid_from TIMESTAMP,
  valid_until TIMESTAMP,

  -- Audit
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- At least one source must be specified
  CONSTRAINT has_source CHECK (source_category_id IS NOT NULL OR source_product_id IS NOT NULL),
  -- At least one target must be specified
  CONSTRAINT has_target CHECK (target_category_id IS NOT NULL OR target_product_id IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_recommendation_rules_source_cat ON recommendation_rules(source_category_id) WHERE source_category_id IS NOT NULL;
CREATE INDEX idx_recommendation_rules_source_prod ON recommendation_rules(source_product_id) WHERE source_product_id IS NOT NULL;
CREATE INDEX idx_recommendation_rules_target_cat ON recommendation_rules(target_category_id) WHERE target_category_id IS NOT NULL;
CREATE INDEX idx_recommendation_rules_target_prod ON recommendation_rules(target_product_id) WHERE target_product_id IS NOT NULL;
CREATE INDEX idx_recommendation_rules_active ON recommendation_rules(is_active, priority DESC) WHERE is_active = true;
CREATE INDEX idx_recommendation_rules_validity ON recommendation_rules(valid_from, valid_until) WHERE is_active = true;

-- ============================================================================
-- RECOMMENDATION HISTORY
-- Track which recommendations were shown and clicked (for ML feedback)
-- ============================================================================

CREATE TABLE IF NOT EXISTS recommendation_events (
  id SERIAL PRIMARY KEY,

  -- Context
  session_id VARCHAR(100), -- Browser session
  user_id INTEGER REFERENCES users(id), -- If logged in
  customer_id INTEGER REFERENCES customers(id), -- If customer identified

  -- The source that triggered the recommendation
  source_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,

  -- What was recommended
  recommended_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- How it was generated
  relationship_id INTEGER REFERENCES product_relationships(id) ON DELETE SET NULL,
  rule_id INTEGER REFERENCES recommendation_rules(id) ON DELETE SET NULL,
  recommendation_type VARCHAR(30), -- 'bought_together', 'accessory', 'upgrade', 'alternative', 'rule'

  -- Event type
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('impression', 'click', 'add_to_cart', 'purchase')),

  -- Position in recommendation list
  position INTEGER,

  -- Outcome
  clicked BOOLEAN DEFAULT false,
  added_to_cart BOOLEAN DEFAULT false,
  purchased BOOLEAN DEFAULT false,

  -- Context data
  page_type VARCHAR(50), -- 'product_detail', 'cart', 'checkout'
  device_type VARCHAR(20), -- 'desktop', 'mobile', 'tablet', 'pos'

  -- Timestamps
  event_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for analysis
CREATE INDEX idx_recommendation_events_session ON recommendation_events(session_id);
CREATE INDEX idx_recommendation_events_source ON recommendation_events(source_product_id);
CREATE INDEX idx_recommendation_events_recommended ON recommendation_events(recommended_product_id);
CREATE INDEX idx_recommendation_events_type ON recommendation_events(recommendation_type);
CREATE INDEX idx_recommendation_events_event ON recommendation_events(event_type);
CREATE INDEX idx_recommendation_events_date ON recommendation_events(event_at);
CREATE INDEX idx_recommendation_events_clicks ON recommendation_events(recommended_product_id, clicked) WHERE clicked = true;
CREATE INDEX idx_recommendation_events_purchases ON recommendation_events(recommended_product_id, purchased) WHERE purchased = true;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to update purchase patterns from a completed transaction
CREATE OR REPLACE FUNCTION update_purchase_patterns(p_transaction_id INTEGER)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_products INTEGER[];
  v_product_a INTEGER;
  v_product_b INTEGER;
  i INTEGER;
  j INTEGER;
BEGIN
  -- Get all product IDs from the transaction
  SELECT ARRAY_AGG(DISTINCT product_id ORDER BY product_id)
  INTO v_products
  FROM transaction_items
  WHERE transaction_id = p_transaction_id;

  -- If less than 2 products, nothing to do
  IF array_length(v_products, 1) < 2 THEN
    RETURN;
  END IF;

  -- For each pair of products, update or insert purchase pattern
  FOR i IN 1..array_length(v_products, 1) - 1 LOOP
    FOR j IN i + 1..array_length(v_products, 1) LOOP
      v_product_a := v_products[i];
      v_product_b := v_products[j];

      -- Ensure a < b (should already be true due to ORDER BY)
      IF v_product_a > v_product_b THEN
        v_product_a := v_products[j];
        v_product_b := v_products[i];
      END IF;

      -- Upsert the pattern
      INSERT INTO purchase_patterns (product_a_id, product_b_id, co_purchase_count, last_co_purchase_at)
      VALUES (v_product_a, v_product_b, 1, NOW())
      ON CONFLICT (product_a_id, product_b_id)
      DO UPDATE SET
        co_purchase_count = purchase_patterns.co_purchase_count + 1,
        last_co_purchase_at = NOW(),
        last_updated = NOW();
    END LOOP;
  END LOOP;
END;
$$;

-- Function to get related products for a given product
CREATE OR REPLACE FUNCTION get_related_products(
  p_product_id INTEGER,
  p_relationship_types VARCHAR[] DEFAULT ARRAY['bought_together', 'accessory', 'upgrade', 'alternative'],
  p_limit INTEGER DEFAULT 10,
  p_include_inactive BOOLEAN DEFAULT false
)
RETURNS TABLE (
  related_product_id INTEGER,
  relationship_type VARCHAR(30),
  strength DECIMAL(3, 2),
  is_curated BOOLEAN,
  display_order INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.related_product_id,
    pr.relationship_type,
    pr.strength,
    pr.is_curated,
    pr.display_order
  FROM product_relationships pr
  JOIN products p ON pr.related_product_id = p.id
  WHERE pr.product_id = p_product_id
    AND pr.relationship_type = ANY(p_relationship_types)
    AND (p_include_inactive OR pr.is_active = true)
    AND p.is_active = true
    AND p.quantity > 0  -- In stock
  ORDER BY
    pr.is_curated DESC,  -- Curated first
    pr.display_order ASC,
    pr.strength DESC
  LIMIT p_limit;
END;
$$;

-- Function to auto-generate "bought together" relationships from purchase patterns
CREATE OR REPLACE FUNCTION generate_bought_together_relationships(
  p_min_co_purchases INTEGER DEFAULT 3,  -- Minimum times bought together
  p_min_confidence DECIMAL DEFAULT 0.1,  -- Minimum 10% confidence
  p_min_lift DECIMAL DEFAULT 1.2         -- At least 20% more likely than random
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- First, update confidence and lift values in purchase_patterns
  -- (This would normally be done by a scheduled job)
  UPDATE purchase_patterns pp
  SET
    product_a_purchase_count = COALESCE((
      SELECT COUNT(DISTINCT transaction_id)
      FROM transaction_items
      WHERE product_id = pp.product_a_id
    ), 0),
    product_b_purchase_count = COALESCE((
      SELECT COUNT(DISTINCT transaction_id)
      FROM transaction_items
      WHERE product_id = pp.product_b_id
    ), 0),
    last_updated = NOW();

  -- Calculate confidence scores
  UPDATE purchase_patterns
  SET
    confidence_a_to_b = CASE
      WHEN product_a_purchase_count > 0
      THEN LEAST(1.0, co_purchase_count::DECIMAL / product_a_purchase_count)
      ELSE 0
    END,
    confidence_b_to_a = CASE
      WHEN product_b_purchase_count > 0
      THEN LEAST(1.0, co_purchase_count::DECIMAL / product_b_purchase_count)
      ELSE 0
    END;

  -- Insert new relationships (both directions) for qualifying patterns
  INSERT INTO product_relationships (
    product_id, related_product_id, relationship_type, strength, is_curated, source
  )
  SELECT
    pp.product_a_id,
    pp.product_b_id,
    'bought_together',
    LEAST(1.0, pp.confidence_a_to_b),
    false,
    'purchase_analysis'
  FROM purchase_patterns pp
  WHERE pp.co_purchase_count >= p_min_co_purchases
    AND pp.confidence_a_to_b >= p_min_confidence
  ON CONFLICT (product_id, related_product_id, relationship_type)
  DO UPDATE SET
    strength = EXCLUDED.strength,
    updated_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Insert reverse direction
  INSERT INTO product_relationships (
    product_id, related_product_id, relationship_type, strength, is_curated, source
  )
  SELECT
    pp.product_b_id,
    pp.product_a_id,
    'bought_together',
    LEAST(1.0, pp.confidence_b_to_a),
    false,
    'purchase_analysis'
  FROM purchase_patterns pp
  WHERE pp.co_purchase_count >= p_min_co_purchases
    AND pp.confidence_b_to_a >= p_min_confidence
  ON CONFLICT (product_id, related_product_id, relationship_type)
  DO UPDATE SET
    strength = EXCLUDED.strength,
    updated_at = NOW();

  GET DIAGNOSTICS v_count = v_count + ROW_COUNT;

  RETURN v_count;
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_relationship_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_relationships_updated
  BEFORE UPDATE ON product_relationships
  FOR EACH ROW EXECUTE FUNCTION update_relationship_timestamp();

CREATE TRIGGER recommendation_rules_updated
  BEFORE UPDATE ON recommendation_rules
  FOR EACH ROW EXECUTE FUNCTION update_relationship_timestamp();

-- Update purchase patterns when transaction is completed
CREATE OR REPLACE FUNCTION trigger_update_purchase_patterns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    PERFORM update_purchase_patterns(NEW.transaction_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transaction_completed_update_patterns
  AFTER INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION trigger_update_purchase_patterns();

-- ============================================================================
-- VIEWS FOR REPORTING
-- ============================================================================

-- View of all relationships with product details
CREATE OR REPLACE VIEW v_product_relationships AS
SELECT
  pr.id,
  pr.product_id,
  p1.name as product_name,
  p1.sku as product_sku,
  pr.related_product_id,
  p2.name as related_product_name,
  p2.sku as related_product_sku,
  p2.price as related_product_price,
  pr.relationship_type,
  pr.strength,
  pr.is_curated,
  pr.is_active,
  pr.source,
  pr.created_at
FROM product_relationships pr
JOIN products p1 ON pr.product_id = p1.id
JOIN products p2 ON pr.related_product_id = p2.id;

-- View of top purchase patterns
CREATE OR REPLACE VIEW v_top_purchase_patterns AS
SELECT
  pp.id,
  p1.name as product_a_name,
  p1.sku as product_a_sku,
  p2.name as product_b_name,
  p2.sku as product_b_sku,
  pp.co_purchase_count,
  pp.confidence_a_to_b,
  pp.confidence_b_to_a,
  pp.lift,
  pp.first_co_purchase_at,
  pp.last_co_purchase_at
FROM purchase_patterns pp
JOIN products p1 ON pp.product_a_id = p1.id
JOIN products p2 ON pp.product_b_id = p2.id
ORDER BY pp.co_purchase_count DESC;

-- View of recommendation rule effectiveness
CREATE OR REPLACE VIEW v_recommendation_performance AS
SELECT
  rr.id as rule_id,
  rr.name as rule_name,
  COUNT(re.id) as total_impressions,
  COUNT(re.id) FILTER (WHERE re.clicked = true) as clicks,
  COUNT(re.id) FILTER (WHERE re.added_to_cart = true) as add_to_carts,
  COUNT(re.id) FILTER (WHERE re.purchased = true) as purchases,
  ROUND(
    COUNT(re.id) FILTER (WHERE re.clicked = true)::DECIMAL /
    NULLIF(COUNT(re.id), 0) * 100, 2
  ) as click_rate,
  ROUND(
    COUNT(re.id) FILTER (WHERE re.purchased = true)::DECIMAL /
    NULLIF(COUNT(re.id), 0) * 100, 2
  ) as conversion_rate
FROM recommendation_rules rr
LEFT JOIN recommendation_events re ON re.rule_id = rr.id
GROUP BY rr.id, rr.name
ORDER BY total_impressions DESC;

-- ============================================================================
-- SAMPLE DATA: RECOMMENDATION RULES
-- ============================================================================

-- Insert sample recommendation rules
INSERT INTO recommendation_rules (name, description, source_category_id, target_category_id, rule_type, priority, max_recommendations) VALUES
-- Note: These assume category IDs exist. Adjust based on your actual categories.
-- TVs -> HDMI Cables
('HDMI Cables for TVs', 'Suggest HDMI cables when customer buys a TV',
  (SELECT id FROM categories WHERE name ILIKE '%TV%' OR name ILIKE '%Television%' LIMIT 1),
  (SELECT id FROM categories WHERE name ILIKE '%Cable%' OR name ILIKE '%HDMI%' LIMIT 1),
  'category_to_category', 90, 3),

-- Phones -> Cases
('Phone Cases', 'Suggest phone cases when customer buys a smartphone',
  (SELECT id FROM categories WHERE name ILIKE '%Phone%' OR name ILIKE '%Smartphone%' LIMIT 1),
  (SELECT id FROM categories WHERE name ILIKE '%Case%' OR name ILIKE '%Accessori%' LIMIT 1),
  'category_to_category', 85, 5),

-- Phones -> Screen Protectors
('Screen Protectors for Phones', 'Suggest screen protectors for smartphone purchases',
  (SELECT id FROM categories WHERE name ILIKE '%Phone%' OR name ILIKE '%Smartphone%' LIMIT 1),
  (SELECT id FROM categories WHERE name ILIKE '%Screen Protector%' OR name ILIKE '%Protection%' LIMIT 1),
  'category_to_category', 80, 3),

-- Laptops -> Bags
('Laptop Bags', 'Suggest laptop bags when customer buys a laptop',
  (SELECT id FROM categories WHERE name ILIKE '%Laptop%' OR name ILIKE '%Notebook%' LIMIT 1),
  (SELECT id FROM categories WHERE name ILIKE '%Bag%' OR name ILIKE '%Carrying%' LIMIT 1),
  'category_to_category', 75, 3),

-- Gaming Consoles -> Controllers
('Extra Controllers', 'Suggest extra controllers for gaming console purchases',
  (SELECT id FROM categories WHERE name ILIKE '%Gaming%' OR name ILIKE '%Console%' LIMIT 1),
  (SELECT id FROM categories WHERE name ILIKE '%Controller%' OR name ILIKE '%Gamepad%' LIMIT 1),
  'category_to_category', 85, 2)

ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE product_relationships IS 'Stores curated and auto-generated product relationships (accessories, alternatives, upgrades, bought-together)';
COMMENT ON TABLE purchase_patterns IS 'Tracks co-purchase frequency for ML analysis and auto-generating bought-together relationships';
COMMENT ON TABLE recommendation_rules IS 'Category and product-based rules for generating recommendations';
COMMENT ON TABLE recommendation_events IS 'Tracks recommendation impressions, clicks, and conversions for ML feedback';

COMMENT ON COLUMN product_relationships.strength IS 'Relevance score from 0 (weak) to 1 (strong), used for sorting recommendations';
COMMENT ON COLUMN product_relationships.is_curated IS 'True if manually curated by staff, false if auto-generated from purchase data';
COMMENT ON COLUMN purchase_patterns.confidence_a_to_b IS 'P(B|A): Probability customer buys B given they bought A';
COMMENT ON COLUMN purchase_patterns.lift IS 'How much more likely the co-purchase is compared to random chance (>1 = positive association)';
COMMENT ON COLUMN recommendation_rules.priority IS 'Higher priority rules are evaluated and displayed first';

COMMENT ON FUNCTION update_purchase_patterns IS 'Updates purchase_patterns table when a transaction is completed';
COMMENT ON FUNCTION get_related_products IS 'Returns related products for a given product, filtered by relationship type';
COMMENT ON FUNCTION generate_bought_together_relationships IS 'Auto-generates bought_together relationships from purchase patterns';
