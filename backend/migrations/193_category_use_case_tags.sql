-- Migration 193: Category use_case_tags + product_category_specs
-- Adds room/use-case browsing tags and quick-filter spec values to categories.
--
-- NOTE: The existing table is `categories` (not `product_categories`).
-- Slug names are mapped to the actual slugs in the database.

BEGIN;

-- ============================================================================
-- 1. Add use_case_tags column to categories
-- ============================================================================

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS use_case_tags TEXT[] NOT NULL DEFAULT '{}';

-- ============================================================================
-- 2. Seed use_case_tags for existing categories
-- ============================================================================

-- Kitchen / cooking categories (refrigerators, dishwashers, ranges, microwaves, cooktops, wall ovens, range hoods)
UPDATE categories SET use_case_tags = ARRAY['kitchen','cooking','food storage']
  WHERE slug IN (
    'french-door','side-by-side','bottom-freezer','top-freezer','counter-depth',   -- refrigerators
    'built-in-dishwasher','drawer-dishwasher','portable-dishwasher',               -- dishwashers
    'electric-range','gas-range','dual-fuel','induction-range',
    'slide-in-range','freestanding-range',                                          -- ranges
    'countertop-microwave','over-the-range-microwave',
    'built-in-microwave','drawer-microwave',                                        -- microwaves
    'gas-cooktop','electric-cooktop','induction-cooktop',                           -- cooktops
    'single-wall-oven','double-wall-oven','combination-oven',                      -- wall ovens
    'under-cabinet-hood','wall-mount-hood','island-hood','downdraft'                -- range hoods
  );

-- Also tag parent categories at level 2
UPDATE categories SET use_case_tags = ARRAY['kitchen','cooking','food storage']
  WHERE slug IN (
    'refrigerators','dishwashers','ranges','microwaves','cooktops','wall-ovens','range-hoods'
  );

-- Laundry / cleaning
UPDATE categories SET use_case_tags = ARRAY['laundry','cleaning']
  WHERE slug IN (
    'front-load-washer','top-load-washer',                                         -- washers
    'electric-dryer','gas-dryer','heat-pump-dryer',                                -- dryers
    'washers','dryers'                                                              -- parent level-2
  );

-- Living room / entertainment (TVs, audio)
UPDATE categories SET use_case_tags = ARRAY['living room','entertainment','home theatre']
  WHERE slug IN (
    'oled-tv','qled-tv','mini-led-tv','led-lcd-tv','projectors',                  -- TV types
    'televisions','audio',                                                          -- parent level-2
    'tvs'                                                                           -- level-1 TVs & Displays
  );

-- Outdoor / backyard
UPDATE categories SET use_case_tags = ARRAY['outdoor','backyard','summer']
  WHERE slug IN (
    'gas-grills','charcoal-grills','pellet-grills','griddles',                     -- grills
    'grills','smokers','fire-pits','fireplaces',                                   -- parent level-2
    'gas-fireplaces','electric-fireplaces','wood-fireplaces',                      -- fireplace types
    'outdoor'                                                                       -- level-1
  );

-- Small appliances → kitchen
UPDATE categories SET use_case_tags = ARRAY['kitchen','small appliances','countertop']
  WHERE slug IN (
    'coffee-makers','blenders','food-processors','mixers',
    'toasters','air-fryers','kettles',
    'small-appliances'
  );

-- Cleaning
UPDATE categories SET use_case_tags = ARRAY['cleaning','home care']
  WHERE slug = 'vacuums';

-- ============================================================================
-- 3. Add missing subcategories that the store needs
-- ============================================================================

-- Audio subcategories (under audio, id for 'audio' parent)
INSERT INTO categories (parent_id, name, slug, display_name, level, display_order, is_active)
SELECT id, 'Soundbars', 'soundbars', 'Soundbars', 3, 1, true
FROM categories WHERE slug = 'audio'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (parent_id, name, slug, display_name, level, display_order, is_active)
SELECT id, 'AV Receivers', 'av-receivers', 'AV Receivers', 3, 2, true
FROM categories WHERE slug = 'audio'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (parent_id, name, slug, display_name, level, display_order, is_active)
SELECT id, 'Floor Standing Speakers', 'floor-standing-speakers', 'Floor Standing Speakers', 3, 3, true
FROM categories WHERE slug = 'audio'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (parent_id, name, slug, display_name, level, display_order, is_active)
SELECT id, 'Subwoofers', 'subwoofers', 'Subwoofers', 3, 4, true
FROM categories WHERE slug = 'audio'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (parent_id, name, slug, display_name, level, display_order, is_active)
SELECT id, 'Wireless Earbuds', 'wireless-earbuds', 'Wireless Earbuds', 3, 5, true
FROM categories WHERE slug = 'audio'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (parent_id, name, slug, display_name, level, display_order, is_active)
SELECT id, 'Wireless Headphones', 'wireless-headphones', 'Wireless Headphones', 3, 6, true
FROM categories WHERE slug = 'audio'
ON CONFLICT (slug) DO NOTHING;

-- Tag new audio subcategories
UPDATE categories SET use_case_tags = ARRAY['living room','entertainment','home theatre']
  WHERE slug IN ('soundbars','av-receivers','floor-standing-speakers','subwoofers');

UPDATE categories SET use_case_tags = ARRAY['bedroom','personal audio','commute']
  WHERE slug IN ('wireless-earbuds','wireless-headphones');

-- Air quality / comfort (under Small Appliances)
INSERT INTO categories (parent_id, name, slug, display_name, level, display_order, is_active)
SELECT id, 'Air Purifiers', 'air-purifiers', 'Air Purifiers', 2, 20, true
FROM categories WHERE slug = 'small-appliances'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (parent_id, name, slug, display_name, level, display_order, is_active)
SELECT id, 'Dehumidifiers', 'dehumidifiers', 'Dehumidifiers', 2, 21, true
FROM categories WHERE slug = 'small-appliances'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (parent_id, name, slug, display_name, level, display_order, is_active)
SELECT id, 'Humidifiers', 'humidifiers', 'Humidifiers', 2, 22, true
FROM categories WHERE slug = 'small-appliances'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (parent_id, name, slug, display_name, level, display_order, is_active)
SELECT id, 'Fans', 'fans', 'Fans', 2, 23, true
FROM categories WHERE slug = 'small-appliances'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (parent_id, name, slug, display_name, level, display_order, is_active)
SELECT id, 'Space Heaters', 'space-heaters', 'Space Heaters', 2, 24, true
FROM categories WHERE slug = 'small-appliances'
ON CONFLICT (slug) DO NOTHING;

UPDATE categories SET use_case_tags = ARRAY['air quality','health','wellness','comfort']
  WHERE slug IN ('air-purifiers','dehumidifiers','humidifiers','fans','space-heaters');

-- Outdoor subcategories
INSERT INTO categories (parent_id, name, slug, display_name, level, display_order, is_active)
SELECT id, 'Patio Furniture', 'patio-furniture', 'Patio & Outdoor Furniture', 2, 10, true
FROM categories WHERE slug = 'outdoor'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (parent_id, name, slug, display_name, level, display_order, is_active)
SELECT id, 'Outdoor Heating', 'outdoor-heating', 'Outdoor Heating', 2, 11, true
FROM categories WHERE slug = 'outdoor'
ON CONFLICT (slug) DO NOTHING;

UPDATE categories SET use_case_tags = ARRAY['outdoor','backyard','summer']
  WHERE slug IN ('patio-furniture','outdoor-heating');

-- ============================================================================
-- 4. Create product_category_specs table for quick-filter spec values
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_category_specs (
  id            SERIAL PRIMARY KEY,
  category_id   INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  spec_key      TEXT NOT NULL,
  spec_label    TEXT NOT NULL,
  spec_values   TEXT[] NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_category_specs_cat_key
  ON product_category_specs (category_id, spec_key);

CREATE INDEX IF NOT EXISTS idx_category_specs_cat
  ON product_category_specs (category_id);

-- ============================================================================
-- 5. Seed spec quick-filters for major categories
-- ============================================================================

-- Refrigerators — width filter
INSERT INTO product_category_specs (category_id, spec_key, spec_label, spec_values, display_order)
SELECT id, 'width_inches', 'Width',
       ARRAY['24"','28"','30"','33"','36"'], 10
FROM categories WHERE slug IN ('french-door','side-by-side','bottom-freezer','top-freezer','counter-depth')
ON CONFLICT (category_id, spec_key) DO NOTHING;

-- Ranges — width filter
INSERT INTO product_category_specs (category_id, spec_key, spec_label, spec_values, display_order)
SELECT id, 'width_inches', 'Width',
       ARRAY['24"','30"','36"','48"'], 10
FROM categories WHERE slug IN ('electric-range','gas-range','dual-fuel','induction-range','slide-in-range','freestanding-range')
ON CONFLICT (category_id, spec_key) DO NOTHING;

-- TVs — screen size filter
INSERT INTO product_category_specs (category_id, spec_key, spec_label, spec_values, display_order)
SELECT id, 'screen_size_group', 'Screen Size',
       ARRAY['Under 55"','55"–65"','70"–75"','77"–85"','86"+'], 10
FROM categories WHERE slug IN ('oled-tv','qled-tv','mini-led-tv','led-lcd-tv')
ON CONFLICT (category_id, spec_key) DO NOTHING;

-- Soundbars — channels filter
INSERT INTO product_category_specs (category_id, spec_key, spec_label, spec_values, display_order)
SELECT id, 'channels', 'Channels',
       ARRAY['2.0','2.1','3.1','5.1.2','7.1.4'], 10
FROM categories WHERE slug = 'soundbars'
ON CONFLICT (category_id, spec_key) DO NOTHING;

-- AV Receivers — channels filter
INSERT INTO product_category_specs (category_id, spec_key, spec_label, spec_values, display_order)
SELECT id, 'channels', 'Channels',
       ARRAY['5.1','7.1','7.2','9.2','11.2'], 10
FROM categories WHERE slug = 'av-receivers'
ON CONFLICT (category_id, spec_key) DO NOTHING;

-- Dishwashers — width filter
INSERT INTO product_category_specs (category_id, spec_key, spec_label, spec_values, display_order)
SELECT id, 'width_inches', 'Width',
       ARRAY['18"','24"'], 10
FROM categories WHERE slug IN ('built-in-dishwasher','drawer-dishwasher','portable-dishwasher')
ON CONFLICT (category_id, spec_key) DO NOTHING;

-- Washers — capacity filter
INSERT INTO product_category_specs (category_id, spec_key, spec_label, spec_values, display_order)
SELECT id, 'capacity_cuft', 'Capacity',
       ARRAY['3.5–4.0 cu.ft','4.0–4.5 cu.ft','4.5–5.0 cu.ft','5.0+ cu.ft'], 10
FROM categories WHERE slug IN ('front-load-washer','top-load-washer')
ON CONFLICT (category_id, spec_key) DO NOTHING;

-- ============================================================================
-- 6. Updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_category_specs_updated ON product_category_specs;
CREATE TRIGGER trg_product_category_specs_updated
  BEFORE UPDATE ON product_category_specs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
