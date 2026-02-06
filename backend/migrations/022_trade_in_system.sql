-- Migration: 022_trade_in_system.sql
-- Description: Trade-in processing system for customer device trade-ins
-- Created: 2026-01-27

-- ============================================================================
-- TRADE-IN CATEGORIES
-- Categories of items that can be traded in
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_in_categories (
  id SERIAL PRIMARY KEY,

  -- Category info
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,

  -- Requirements
  requires_serial BOOLEAN DEFAULT true,
  requires_imei BOOLEAN DEFAULT false, -- For phones
  requires_photos BOOLEAN DEFAULT true,
  min_photos INTEGER DEFAULT 2,

  -- Age restrictions
  max_age_years INTEGER, -- Don't accept items older than X years (NULL = no limit)

  -- Value settings
  minimum_value DECIMAL(10, 2) DEFAULT 0, -- Minimum trade-in value
  maximum_value DECIMAL(10, 2), -- Cap on trade-in value (NULL = no cap)

  -- Display
  display_order INTEGER DEFAULT 0,
  icon VARCHAR(50), -- Icon name for UI

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_trade_in_categories_active ON trade_in_categories(is_active) WHERE is_active = true;
CREATE INDEX idx_trade_in_categories_order ON trade_in_categories(display_order);

-- ============================================================================
-- TRADE-IN PRODUCTS
-- Specific products/models that can be traded in with base values
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_in_products (
  id SERIAL PRIMARY KEY,

  -- Category reference
  category_id INTEGER NOT NULL REFERENCES trade_in_categories(id) ON DELETE CASCADE,

  -- Product identification
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(255) NOT NULL,
  model_pattern VARCHAR(255), -- Regex or keyword pattern for matching (e.g., 'iPhone 14%' or 'SM-G99%')
  variant VARCHAR(100), -- Storage size, color, etc. (e.g., '256GB', '65"')

  -- Release info for age calculation
  release_year INTEGER,
  release_date DATE,

  -- Value configuration
  base_value DECIMAL(10, 2) NOT NULL, -- Value in perfect condition

  -- Override category settings
  override_max_age_years INTEGER, -- Override category's max age for this specific product

  -- Metadata
  specifications JSONB, -- Additional specs for matching/display

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Prevent duplicates
  CONSTRAINT unique_trade_in_product UNIQUE (category_id, brand, model, variant)
);

-- Indexes
CREATE INDEX idx_trade_in_products_category ON trade_in_products(category_id);
CREATE INDEX idx_trade_in_products_brand ON trade_in_products(brand);
CREATE INDEX idx_trade_in_products_model ON trade_in_products(model);
CREATE INDEX idx_trade_in_products_active ON trade_in_products(is_active) WHERE is_active = true;
CREATE INDEX idx_trade_in_products_pattern ON trade_in_products(model_pattern) WHERE model_pattern IS NOT NULL;

-- ============================================================================
-- TRADE-IN CONDITIONS
-- Condition grades with value multipliers
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_in_conditions (
  id SERIAL PRIMARY KEY,

  -- Condition info
  condition_name VARCHAR(50) NOT NULL UNIQUE,
  condition_code VARCHAR(10) NOT NULL UNIQUE, -- Short code: 'EXC', 'GD', 'FR', 'PR'

  -- Value calculation
  value_multiplier DECIMAL(4, 3) NOT NULL, -- 1.000 = 100%, 0.800 = 80%

  -- Criteria for staff
  condition_criteria TEXT NOT NULL, -- Detailed description for assessment
  checklist JSONB, -- Structured checklist for UI

  -- Display
  display_order INTEGER DEFAULT 0,
  color VARCHAR(20), -- Color code for UI (e.g., 'green', 'yellow', 'orange', 'red')

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_trade_in_conditions_active ON trade_in_conditions(is_active) WHERE is_active = true;
CREATE INDEX idx_trade_in_conditions_order ON trade_in_conditions(display_order);

-- ============================================================================
-- TRADE-IN ASSESSMENT PHOTOS
-- Separate table for assessment photos
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_in_photos (
  id SERIAL PRIMARY KEY,
  assessment_id INTEGER NOT NULL, -- Will be FK to trade_in_assessments

  -- Photo info
  photo_url VARCHAR(500) NOT NULL,
  photo_type VARCHAR(50) DEFAULT 'general', -- 'front', 'back', 'screen', 'damage', 'serial', 'general'
  description VARCHAR(255),

  -- Metadata
  file_size INTEGER,
  mime_type VARCHAR(50),

  -- Audit
  uploaded_at TIMESTAMP DEFAULT NOW(),
  uploaded_by INTEGER REFERENCES users(id)
);

-- Index will be created after trade_in_assessments table

-- ============================================================================
-- TRADE-IN ASSESSMENTS
-- Actual trade-in assessments performed by staff
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_in_assessments (
  id SERIAL PRIMARY KEY,

  -- Reference to sale (nullable until applied to purchase)
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  transaction_id INTEGER REFERENCES transactions(transaction_id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id),

  -- Product being traded in
  trade_in_product_id INTEGER REFERENCES trade_in_products(id),
  category_id INTEGER REFERENCES trade_in_categories(id), -- Denormalized for queries

  -- Custom entry (when product not in system)
  custom_brand VARCHAR(100),
  custom_model VARCHAR(255),
  custom_description TEXT,

  -- Device identification
  serial_number VARCHAR(100),
  imei VARCHAR(20), -- For phones

  -- Condition assessment
  condition_id INTEGER NOT NULL REFERENCES trade_in_conditions(id),
  condition_notes TEXT, -- Staff notes on specific issues

  -- Damage documentation
  damage_details JSONB, -- Structured damage info: { "screen": "minor scratches", "body": "dent on corner" }

  -- Value calculation
  base_value DECIMAL(10, 2) NOT NULL, -- Starting value before condition multiplier
  condition_multiplier DECIMAL(4, 3) NOT NULL, -- Multiplier applied
  adjustment_amount DECIMAL(10, 2) DEFAULT 0, -- Manual adjustment (+/-)
  adjustment_reason VARCHAR(255), -- Reason for manual adjustment
  assessed_value DECIMAL(10, 2) NOT NULL, -- Final trade-in value

  -- Override (manager approval)
  override_value DECIMAL(10, 2), -- Manager-approved value if different
  override_reason VARCHAR(255),
  override_by INTEGER REFERENCES users(id),
  override_at TIMESTAMP,

  -- Final value used
  final_value DECIMAL(10, 2) NOT NULL, -- Either assessed_value or override_value

  -- Assessment info
  assessed_by INTEGER NOT NULL REFERENCES users(id),
  assessed_at TIMESTAMP DEFAULT NOW(),

  -- Status workflow
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'applied', 'rejected', 'void', 'expired')
  ),
  status_changed_at TIMESTAMP,
  status_changed_by INTEGER REFERENCES users(id),
  status_reason VARCHAR(255),

  -- Validity
  valid_until TIMESTAMP, -- Assessment expires after X hours/days

  -- Internal notes
  internal_notes TEXT,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Now add the FK constraint for photos
ALTER TABLE trade_in_photos
  ADD CONSTRAINT fk_trade_in_photos_assessment
  FOREIGN KEY (assessment_id) REFERENCES trade_in_assessments(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX idx_trade_in_assessments_order ON trade_in_assessments(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_trade_in_assessments_transaction ON trade_in_assessments(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_trade_in_assessments_customer ON trade_in_assessments(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_trade_in_assessments_product ON trade_in_assessments(trade_in_product_id);
CREATE INDEX idx_trade_in_assessments_status ON trade_in_assessments(status);
CREATE INDEX idx_trade_in_assessments_pending ON trade_in_assessments(status, assessed_at) WHERE status = 'pending';
CREATE INDEX idx_trade_in_assessments_date ON trade_in_assessments(assessed_at);
CREATE INDEX idx_trade_in_assessments_serial ON trade_in_assessments(serial_number) WHERE serial_number IS NOT NULL;
CREATE INDEX idx_trade_in_assessments_imei ON trade_in_assessments(imei) WHERE imei IS NOT NULL;

-- Index for photos
CREATE INDEX idx_trade_in_photos_assessment ON trade_in_photos(assessment_id);

-- ============================================================================
-- TRADE-IN VALUE HISTORY
-- Track value changes over time for products
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_in_value_history (
  id SERIAL PRIMARY KEY,
  trade_in_product_id INTEGER NOT NULL REFERENCES trade_in_products(id) ON DELETE CASCADE,

  old_base_value DECIMAL(10, 2),
  new_base_value DECIMAL(10, 2) NOT NULL,

  reason VARCHAR(255),
  changed_by INTEGER REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_trade_in_value_history_product ON trade_in_value_history(trade_in_product_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate trade-in value
CREATE OR REPLACE FUNCTION calculate_trade_in_value(
  p_base_value DECIMAL(10, 2),
  p_condition_multiplier DECIMAL(4, 3),
  p_adjustment DECIMAL(10, 2) DEFAULT 0
)
RETURNS DECIMAL(10, 2)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN GREATEST(0, ROUND((p_base_value * p_condition_multiplier) + COALESCE(p_adjustment, 0), 2));
END;
$$;

-- Function to check if product age is acceptable
CREATE OR REPLACE FUNCTION is_trade_in_age_acceptable(
  p_product_id INTEGER,
  p_check_date DATE DEFAULT CURRENT_DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_release_year INTEGER;
  v_max_age_years INTEGER;
  v_category_max_age INTEGER;
  v_product_age INTEGER;
BEGIN
  -- Get product and category info
  SELECT
    tip.release_year,
    tip.override_max_age_years,
    tic.max_age_years
  INTO v_release_year, v_max_age_years, v_category_max_age
  FROM trade_in_products tip
  JOIN trade_in_categories tic ON tip.category_id = tic.id
  WHERE tip.id = p_product_id;

  -- If no release year, assume acceptable
  IF v_release_year IS NULL THEN
    RETURN true;
  END IF;

  -- Calculate age
  v_product_age := EXTRACT(YEAR FROM p_check_date) - v_release_year;

  -- Use product override or category max age
  v_max_age_years := COALESCE(v_max_age_years, v_category_max_age);

  -- If no max age set, accept any age
  IF v_max_age_years IS NULL THEN
    RETURN true;
  END IF;

  RETURN v_product_age <= v_max_age_years;
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_trade_in_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trade_in_categories_updated
  BEFORE UPDATE ON trade_in_categories
  FOR EACH ROW EXECUTE FUNCTION update_trade_in_timestamp();

CREATE TRIGGER trade_in_products_updated
  BEFORE UPDATE ON trade_in_products
  FOR EACH ROW EXECUTE FUNCTION update_trade_in_timestamp();

CREATE TRIGGER trade_in_assessments_updated
  BEFORE UPDATE ON trade_in_assessments
  FOR EACH ROW EXECUTE FUNCTION update_trade_in_timestamp();

-- Track value changes
CREATE OR REPLACE FUNCTION track_trade_in_value_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.base_value IS DISTINCT FROM NEW.base_value THEN
    INSERT INTO trade_in_value_history (
      trade_in_product_id, old_base_value, new_base_value
    ) VALUES (
      NEW.id, OLD.base_value, NEW.base_value
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trade_in_products_value_changed
  AFTER UPDATE ON trade_in_products
  FOR EACH ROW EXECUTE FUNCTION track_trade_in_value_change();

-- Calculate final_value automatically
CREATE OR REPLACE FUNCTION calculate_final_trade_in_value()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate assessed_value from base, multiplier, and adjustment
  NEW.assessed_value := calculate_trade_in_value(
    NEW.base_value,
    NEW.condition_multiplier,
    NEW.adjustment_amount
  );

  -- Set final_value (use override if present, otherwise assessed)
  NEW.final_value := COALESCE(NEW.override_value, NEW.assessed_value);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trade_in_assessments_calculate_value
  BEFORE INSERT OR UPDATE ON trade_in_assessments
  FOR EACH ROW EXECUTE FUNCTION calculate_final_trade_in_value();

-- ============================================================================
-- SAMPLE DATA: CATEGORIES
-- ============================================================================

INSERT INTO trade_in_categories (name, description, requires_serial, requires_imei, max_age_years, icon, display_order) VALUES
('Smartphones', 'Mobile phones including iPhones and Android devices', true, true, 5, 'smartphone', 1),
('Tablets', 'iPads and Android tablets', true, false, 5, 'tablet', 2),
('Laptops', 'MacBooks, Windows laptops, Chromebooks', true, false, 6, 'laptop', 3),
('TVs', 'Smart TVs and monitors', true, false, 7, 'tv', 4),
('Smartwatches', 'Apple Watch, Galaxy Watch, Fitbit', true, false, 4, 'watch', 5),
('Gaming Consoles', 'PlayStation, Xbox, Nintendo Switch', true, false, 6, 'gamepad', 6),
('Audio Equipment', 'Headphones, speakers, soundbars', true, false, 5, 'headphones', 7)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SAMPLE DATA: CONDITIONS
-- ============================================================================

INSERT INTO trade_in_conditions (condition_name, condition_code, value_multiplier, condition_criteria, checklist, display_order, color) VALUES
(
  'Excellent',
  'EXC',
  1.000,
  'Device is in like-new condition with no visible wear. Screen is flawless, body has no scratches or dents. All functions work perfectly. Includes original accessories.',
  '{"items": [
    {"label": "Screen has no scratches or cracks", "required": true},
    {"label": "Body has no dents or scratches", "required": true},
    {"label": "All buttons and ports work", "required": true},
    {"label": "Battery health above 85%", "required": true},
    {"label": "No water damage indicators", "required": true},
    {"label": "Original accessories included", "required": false}
  ]}'::jsonb,
  1,
  'green'
),
(
  'Good',
  'GD',
  0.800,
  'Device shows light signs of use. Minor scratches on screen or body that are not easily visible. All functions work properly. Battery may show some wear.',
  '{"items": [
    {"label": "Screen has only minor scratches (not visible when on)", "required": true},
    {"label": "Body has only minor cosmetic wear", "required": true},
    {"label": "All buttons and ports work", "required": true},
    {"label": "Battery health above 70%", "required": true},
    {"label": "No water damage indicators", "required": true}
  ]}'::jsonb,
  2,
  'blue'
),
(
  'Fair',
  'FR',
  0.600,
  'Device shows moderate wear. Visible scratches on screen or body. Minor dents or dings acceptable. All core functions must work.',
  '{"items": [
    {"label": "Screen functional (scratches acceptable)", "required": true},
    {"label": "Body has moderate wear (dents/scratches)", "required": true},
    {"label": "Core functions work (calls, apps, charging)", "required": true},
    {"label": "Battery holds charge", "required": true},
    {"label": "No major cracks or broken glass", "required": true}
  ]}'::jsonb,
  3,
  'yellow'
),
(
  'Poor',
  'PR',
  0.300,
  'Device has significant wear or damage but still functions. Cracked screen (if still usable), significant body damage, or reduced functionality.',
  '{"items": [
    {"label": "Device powers on", "required": true},
    {"label": "Screen is usable (can be cracked)", "required": true},
    {"label": "Basic functions work", "required": true},
    {"label": "No missing major components", "required": true}
  ]}'::jsonb,
  4,
  'orange'
),
(
  'For Parts',
  'PRT',
  0.100,
  'Device does not function properly but has value for parts. May not power on, have broken screen, or other major issues.',
  '{"items": [
    {"label": "Device physically present", "required": true},
    {"label": "Identifiable model", "required": true}
  ]}'::jsonb,
  5,
  'red'
)
ON CONFLICT (condition_name) DO NOTHING;

-- ============================================================================
-- SAMPLE DATA: SMARTPHONES
-- ============================================================================

INSERT INTO trade_in_products (category_id, brand, model, model_pattern, variant, release_year, base_value, specifications) VALUES
-- Apple iPhones
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 15 Pro Max', 'iPhone 15 Pro Max%', '256GB', 2023, 850.00, '{"storage": "256GB", "display": "6.7\"", "chip": "A17 Pro"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 15 Pro Max', 'iPhone 15 Pro Max%', '512GB', 2023, 950.00, '{"storage": "512GB", "display": "6.7\"", "chip": "A17 Pro"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 15 Pro Max', 'iPhone 15 Pro Max%', '1TB', 2023, 1050.00, '{"storage": "1TB", "display": "6.7\"", "chip": "A17 Pro"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 15 Pro', 'iPhone 15 Pro%', '128GB', 2023, 700.00, '{"storage": "128GB", "display": "6.1\"", "chip": "A17 Pro"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 15 Pro', 'iPhone 15 Pro%', '256GB', 2023, 750.00, '{"storage": "256GB", "display": "6.1\"", "chip": "A17 Pro"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 15', 'iPhone 15', '128GB', 2023, 550.00, '{"storage": "128GB", "display": "6.1\"", "chip": "A16"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 15', 'iPhone 15', '256GB', 2023, 600.00, '{"storage": "256GB", "display": "6.1\"", "chip": "A16"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 15 Plus', 'iPhone 15 Plus%', '128GB', 2023, 600.00, '{"storage": "128GB", "display": "6.7\"", "chip": "A16"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 14 Pro Max', 'iPhone 14 Pro Max%', '128GB', 2022, 650.00, '{"storage": "128GB", "display": "6.7\"", "chip": "A16 Pro"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 14 Pro Max', 'iPhone 14 Pro Max%', '256GB', 2022, 700.00, '{"storage": "256GB", "display": "6.7\"", "chip": "A16 Pro"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 14 Pro', 'iPhone 14 Pro%', '128GB', 2022, 550.00, '{"storage": "128GB", "display": "6.1\"", "chip": "A16 Pro"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 14', 'iPhone 14', '128GB', 2022, 400.00, '{"storage": "128GB", "display": "6.1\"", "chip": "A15"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 13 Pro Max', 'iPhone 13 Pro Max%', '128GB', 2021, 500.00, '{"storage": "128GB", "display": "6.7\"", "chip": "A15 Pro"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 13 Pro', 'iPhone 13 Pro%', '128GB', 2021, 400.00, '{"storage": "128GB", "display": "6.1\"", "chip": "A15 Pro"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 13', 'iPhone 13', '128GB', 2021, 300.00, '{"storage": "128GB", "display": "6.1\"", "chip": "A15"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 12 Pro Max', 'iPhone 12 Pro Max%', '128GB', 2020, 350.00, '{"storage": "128GB", "display": "6.7\"", "chip": "A14"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone 12', 'iPhone 12', '64GB', 2020, 200.00, '{"storage": "64GB", "display": "6.1\"", "chip": "A14"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Apple', 'iPhone SE (3rd gen)', 'iPhone SE%3%', '64GB', 2022, 180.00, '{"storage": "64GB", "display": "4.7\"", "chip": "A15"}'::jsonb),

-- Samsung Galaxy
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Samsung', 'Galaxy S24 Ultra', 'SM-S928%', '256GB', 2024, 800.00, '{"storage": "256GB", "display": "6.8\"", "chip": "Snapdragon 8 Gen 3"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Samsung', 'Galaxy S24 Ultra', 'SM-S928%', '512GB', 2024, 900.00, '{"storage": "512GB", "display": "6.8\"", "chip": "Snapdragon 8 Gen 3"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Samsung', 'Galaxy S24+', 'SM-S926%', '256GB', 2024, 650.00, '{"storage": "256GB", "display": "6.7\"", "chip": "Snapdragon 8 Gen 3"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Samsung', 'Galaxy S24', 'SM-S921%', '128GB', 2024, 500.00, '{"storage": "128GB", "display": "6.2\"", "chip": "Snapdragon 8 Gen 3"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Samsung', 'Galaxy S23 Ultra', 'SM-S918%', '256GB', 2023, 650.00, '{"storage": "256GB", "display": "6.8\"", "chip": "Snapdragon 8 Gen 2"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Samsung', 'Galaxy S23+', 'SM-S916%', '256GB', 2023, 500.00, '{"storage": "256GB", "display": "6.6\"", "chip": "Snapdragon 8 Gen 2"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Samsung', 'Galaxy S23', 'SM-S911%', '128GB', 2023, 400.00, '{"storage": "128GB", "display": "6.1\"", "chip": "Snapdragon 8 Gen 2"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Samsung', 'Galaxy S22 Ultra', 'SM-S908%', '128GB', 2022, 450.00, '{"storage": "128GB", "display": "6.8\"", "chip": "Snapdragon 8 Gen 1"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Samsung', 'Galaxy S22', 'SM-S901%', '128GB', 2022, 280.00, '{"storage": "128GB", "display": "6.1\"", "chip": "Snapdragon 8 Gen 1"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Samsung', 'Galaxy Z Fold5', 'SM-F946%', '256GB', 2023, 900.00, '{"storage": "256GB", "display": "7.6\"", "chip": "Snapdragon 8 Gen 2", "type": "foldable"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Samsung', 'Galaxy Z Flip5', 'SM-F731%', '256GB', 2023, 550.00, '{"storage": "256GB", "display": "6.7\"", "chip": "Snapdragon 8 Gen 2", "type": "foldable"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Samsung', 'Galaxy A54', 'SM-A546%', '128GB', 2023, 200.00, '{"storage": "128GB", "display": "6.4\"", "chip": "Exynos 1380"}'::jsonb),

-- Google Pixel
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Google', 'Pixel 8 Pro', 'Pixel 8 Pro%', '128GB', 2023, 550.00, '{"storage": "128GB", "display": "6.7\"", "chip": "Tensor G3"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Google', 'Pixel 8', 'Pixel 8', '128GB', 2023, 400.00, '{"storage": "128GB", "display": "6.2\"", "chip": "Tensor G3"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Google', 'Pixel 7 Pro', 'Pixel 7 Pro%', '128GB', 2022, 350.00, '{"storage": "128GB", "display": "6.7\"", "chip": "Tensor G2"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Google', 'Pixel 7', 'Pixel 7', '128GB', 2022, 250.00, '{"storage": "128GB", "display": "6.3\"", "chip": "Tensor G2"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Smartphones'), 'Google', 'Pixel 7a', 'Pixel 7a%', '128GB', 2023, 200.00, '{"storage": "128GB", "display": "6.1\"", "chip": "Tensor G2"}'::jsonb);

-- ============================================================================
-- SAMPLE DATA: TVs
-- ============================================================================

INSERT INTO trade_in_products (category_id, brand, model, model_pattern, variant, release_year, base_value, specifications) VALUES
-- Samsung TVs
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'Samsung', 'QN90C Neo QLED', 'QN%QN90C%', '55"', 2023, 600.00, '{"size": "55\"", "type": "Neo QLED", "resolution": "4K", "hdr": "HDR10+"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'Samsung', 'QN90C Neo QLED', 'QN%QN90C%', '65"', 2023, 800.00, '{"size": "65\"", "type": "Neo QLED", "resolution": "4K", "hdr": "HDR10+"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'Samsung', 'QN90C Neo QLED', 'QN%QN90C%', '75"', 2023, 1100.00, '{"size": "75\"", "type": "Neo QLED", "resolution": "4K", "hdr": "HDR10+"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'Samsung', 'S95C OLED', 'QN%S95C%', '55"', 2023, 900.00, '{"size": "55\"", "type": "QD-OLED", "resolution": "4K", "hdr": "HDR10+"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'Samsung', 'S95C OLED', 'QN%S95C%', '65"', 2023, 1200.00, '{"size": "65\"", "type": "QD-OLED", "resolution": "4K", "hdr": "HDR10+"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'Samsung', 'Crystal UHD CU8000', 'UN%CU8000%', '55"', 2023, 250.00, '{"size": "55\"", "type": "LED", "resolution": "4K", "hdr": "HDR10+"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'Samsung', 'Crystal UHD CU8000', 'UN%CU8000%', '65"', 2023, 350.00, '{"size": "65\"", "type": "LED", "resolution": "4K", "hdr": "HDR10+"}'::jsonb),

-- LG TVs
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'LG', 'C3 OLED', 'OLED%C3%', '55"', 2023, 700.00, '{"size": "55\"", "type": "OLED", "resolution": "4K", "hdr": "Dolby Vision"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'LG', 'C3 OLED', 'OLED%C3%', '65"', 2023, 950.00, '{"size": "65\"", "type": "OLED", "resolution": "4K", "hdr": "Dolby Vision"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'LG', 'C3 OLED', 'OLED%C3%', '77"', 2023, 1400.00, '{"size": "77\"", "type": "OLED", "resolution": "4K", "hdr": "Dolby Vision"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'LG', 'G3 OLED Evo', 'OLED%G3%', '55"', 2023, 900.00, '{"size": "55\"", "type": "OLED Evo", "resolution": "4K", "hdr": "Dolby Vision"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'LG', 'G3 OLED Evo', 'OLED%G3%', '65"', 2023, 1300.00, '{"size": "65\"", "type": "OLED Evo", "resolution": "4K", "hdr": "Dolby Vision"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'LG', 'B3 OLED', 'OLED%B3%', '55"', 2023, 550.00, '{"size": "55\"", "type": "OLED", "resolution": "4K", "hdr": "Dolby Vision"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'LG', 'B3 OLED', 'OLED%B3%', '65"', 2023, 750.00, '{"size": "65\"", "type": "OLED", "resolution": "4K", "hdr": "Dolby Vision"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'LG', 'QNED80', 'QNED%80%', '55"', 2023, 350.00, '{"size": "55\"", "type": "QNED", "resolution": "4K", "hdr": "HDR10"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'LG', 'QNED80', 'QNED%80%', '65"', 2023, 450.00, '{"size": "65\"", "type": "QNED", "resolution": "4K", "hdr": "HDR10"}'::jsonb),

-- Sony TVs
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'Sony', 'A95L QD-OLED', 'XR%A95L%', '55"', 2023, 1100.00, '{"size": "55\"", "type": "QD-OLED", "resolution": "4K", "hdr": "Dolby Vision"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'Sony', 'A95L QD-OLED', 'XR%A95L%', '65"', 2023, 1500.00, '{"size": "65\"", "type": "QD-OLED", "resolution": "4K", "hdr": "Dolby Vision"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'Sony', 'A80L OLED', 'XR%A80L%', '55"', 2023, 750.00, '{"size": "55\"", "type": "OLED", "resolution": "4K", "hdr": "Dolby Vision"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'Sony', 'A80L OLED', 'XR%A80L%', '65"', 2023, 1000.00, '{"size": "65\"", "type": "OLED", "resolution": "4K", "hdr": "Dolby Vision"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'Sony', 'X90L', 'XR%X90L%', '55"', 2023, 500.00, '{"size": "55\"", "type": "Full Array LED", "resolution": "4K", "hdr": "Dolby Vision"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'TVs'), 'Sony', 'X90L', 'XR%X90L%', '65"', 2023, 700.00, '{"size": "65\"", "type": "Full Array LED", "resolution": "4K", "hdr": "Dolby Vision"}'::jsonb);

-- ============================================================================
-- SAMPLE DATA: TABLETS
-- ============================================================================

INSERT INTO trade_in_products (category_id, brand, model, model_pattern, variant, release_year, base_value, specifications) VALUES
-- Apple iPads
((SELECT id FROM trade_in_categories WHERE name = 'Tablets'), 'Apple', 'iPad Pro 12.9" (6th gen)', 'iPad Pro 12.9%6%', '128GB WiFi', 2022, 650.00, '{"storage": "128GB", "display": "12.9\"", "chip": "M2", "connectivity": "WiFi"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Tablets'), 'Apple', 'iPad Pro 12.9" (6th gen)', 'iPad Pro 12.9%6%', '256GB WiFi', 2022, 750.00, '{"storage": "256GB", "display": "12.9\"", "chip": "M2", "connectivity": "WiFi"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Tablets'), 'Apple', 'iPad Pro 11" (4th gen)', 'iPad Pro 11%4%', '128GB WiFi', 2022, 500.00, '{"storage": "128GB", "display": "11\"", "chip": "M2", "connectivity": "WiFi"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Tablets'), 'Apple', 'iPad Air (5th gen)', 'iPad Air%5%', '64GB WiFi', 2022, 350.00, '{"storage": "64GB", "display": "10.9\"", "chip": "M1", "connectivity": "WiFi"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Tablets'), 'Apple', 'iPad (10th gen)', 'iPad%10%', '64GB WiFi', 2022, 250.00, '{"storage": "64GB", "display": "10.9\"", "chip": "A14", "connectivity": "WiFi"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Tablets'), 'Apple', 'iPad mini (6th gen)', 'iPad mini%6%', '64GB WiFi', 2021, 300.00, '{"storage": "64GB", "display": "8.3\"", "chip": "A15", "connectivity": "WiFi"}'::jsonb),

-- Samsung Tablets
((SELECT id FROM trade_in_categories WHERE name = 'Tablets'), 'Samsung', 'Galaxy Tab S9 Ultra', 'SM-X910%', '256GB WiFi', 2023, 600.00, '{"storage": "256GB", "display": "14.6\"", "chip": "Snapdragon 8 Gen 2"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Tablets'), 'Samsung', 'Galaxy Tab S9+', 'SM-X810%', '256GB WiFi', 2023, 500.00, '{"storage": "256GB", "display": "12.4\"", "chip": "Snapdragon 8 Gen 2"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Tablets'), 'Samsung', 'Galaxy Tab S9', 'SM-X710%', '128GB WiFi', 2023, 400.00, '{"storage": "128GB", "display": "11\"", "chip": "Snapdragon 8 Gen 2"}'::jsonb),
((SELECT id FROM trade_in_categories WHERE name = 'Tablets'), 'Samsung', 'Galaxy Tab S8 Ultra', 'SM-X900%', '128GB WiFi', 2022, 450.00, '{"storage": "128GB", "display": "14.6\"", "chip": "Snapdragon 8 Gen 1"}'::jsonb);

-- ============================================================================
-- VIEWS FOR REPORTING
-- ============================================================================

-- Trade-in summary view
CREATE OR REPLACE VIEW v_trade_in_summary AS
SELECT
  tic.name as category_name,
  tip.brand,
  tip.model,
  tip.variant,
  tip.base_value,
  tip.release_year,
  tic.max_age_years,
  tip.is_active,
  (SELECT COUNT(*) FROM trade_in_assessments tia WHERE tia.trade_in_product_id = tip.id) as total_trade_ins,
  (SELECT COUNT(*) FROM trade_in_assessments tia WHERE tia.trade_in_product_id = tip.id AND tia.status = 'applied') as completed_trade_ins,
  (SELECT AVG(tia.final_value) FROM trade_in_assessments tia WHERE tia.trade_in_product_id = tip.id AND tia.status = 'applied') as avg_trade_in_value
FROM trade_in_products tip
JOIN trade_in_categories tic ON tip.category_id = tic.id
ORDER BY tic.display_order, tip.brand, tip.model, tip.variant;

-- Pending assessments view
CREATE OR REPLACE VIEW v_pending_trade_ins AS
SELECT
  tia.id as assessment_id,
  tia.assessed_at,
  tia.final_value,
  tia.status,
  tia.valid_until,
  CASE
    WHEN tia.valid_until < NOW() THEN true
    ELSE false
  END as is_expired,
  tic.name as category_name,
  COALESCE(tip.brand, tia.custom_brand) as brand,
  COALESCE(tip.model, tia.custom_model) as model,
  ticond.condition_name,
  c.name as customer_name,
  u.first_name || ' ' || u.last_name as assessed_by_name
FROM trade_in_assessments tia
LEFT JOIN trade_in_products tip ON tia.trade_in_product_id = tip.id
LEFT JOIN trade_in_categories tic ON tia.category_id = tic.id
LEFT JOIN trade_in_conditions ticond ON tia.condition_id = ticond.id
LEFT JOIN customers c ON tia.customer_id = c.id
LEFT JOIN users u ON tia.assessed_by = u.id
WHERE tia.status IN ('pending', 'approved')
ORDER BY tia.assessed_at DESC;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE trade_in_categories IS 'Categories of items accepted for trade-in (smartphones, TVs, etc.)';
COMMENT ON TABLE trade_in_products IS 'Specific products with their base trade-in values';
COMMENT ON TABLE trade_in_conditions IS 'Condition grades (Excellent, Good, Fair, Poor) with value multipliers';
COMMENT ON TABLE trade_in_assessments IS 'Individual trade-in assessments performed by staff';
COMMENT ON TABLE trade_in_photos IS 'Photos documenting trade-in item condition';
COMMENT ON TABLE trade_in_value_history IS 'History of base value changes for products';

COMMENT ON COLUMN trade_in_assessments.base_value IS 'Starting value from trade_in_products or custom entry';
COMMENT ON COLUMN trade_in_assessments.condition_multiplier IS 'Multiplier from trade_in_conditions (e.g., 0.8 for Good)';
COMMENT ON COLUMN trade_in_assessments.adjustment_amount IS 'Manual adjustment for special circumstances';
COMMENT ON COLUMN trade_in_assessments.assessed_value IS 'Calculated value: (base * multiplier) + adjustment';
COMMENT ON COLUMN trade_in_assessments.override_value IS 'Manager-approved value if different from assessed';
COMMENT ON COLUMN trade_in_assessments.final_value IS 'Value actually used: override_value OR assessed_value';
