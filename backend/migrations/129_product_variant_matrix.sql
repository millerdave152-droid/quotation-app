-- ============================================================================
-- Migration 129: Product Variant Matrix
-- Attributes, attribute values, parent/child product relationships
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. product_attributes — Global attribute definitions
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_attributes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000000' REFERENCES tenants(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_attributes_slug ON product_attributes(slug);
CREATE INDEX IF NOT EXISTS idx_product_attributes_tenant ON product_attributes(tenant_id);

-- ============================================================================
-- 2. product_attribute_values — Possible values for each attribute
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_attribute_values (
  id SERIAL PRIMARY KEY,
  attribute_id INTEGER NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  value VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  display_order INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}', -- hex_color, image_url, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(attribute_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_pav_attribute ON product_attribute_values(attribute_id);

-- ============================================================================
-- 3. Add variant columns to products table
-- ============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS parent_product_id INTEGER REFERENCES products(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_parent BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_attributes JSONB; -- e.g. {"color":"Stainless Steel","size":"36 inch"}

CREATE INDEX IF NOT EXISTS idx_products_parent ON products(parent_product_id) WHERE parent_product_id IS NOT NULL;

-- ============================================================================
-- 4. category_attributes — Which attributes apply to which categories
-- ============================================================================

CREATE TABLE IF NOT EXISTS category_attributes (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  attribute_id INTEGER NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  is_required BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  UNIQUE(category_id, attribute_id)
);

CREATE INDEX IF NOT EXISTS idx_ca_category ON category_attributes(category_id);
CREATE INDEX IF NOT EXISTS idx_ca_attribute ON category_attributes(attribute_id);

-- ============================================================================
-- 5. Seed common appliance/electronics attributes
-- ============================================================================

INSERT INTO product_attributes (name, slug, display_order)
VALUES
  ('Color',    'color',    1),
  ('Finish',   'finish',   2),
  ('Size',     'size',     3),
  ('Capacity', 'capacity', 4)
ON CONFLICT (slug) DO NOTHING;

-- Color values
INSERT INTO product_attribute_values (attribute_id, value, slug, display_order, metadata)
SELECT pa.id, v.value, v.slug, v.ord, v.meta::jsonb
FROM product_attributes pa,
(VALUES
  ('White',           'white',           1, '{"hex":"#FFFFFF"}'),
  ('Black',           'black',           2, '{"hex":"#000000"}'),
  ('Stainless Steel', 'stainless-steel', 3, '{"hex":"#C0C0C0"}'),
  ('Slate',           'slate',           4, '{"hex":"#708090"}'),
  ('Bisque',          'bisque',          5, '{"hex":"#FFE4C4"}')
) AS v(value, slug, ord, meta)
WHERE pa.slug = 'color'
ON CONFLICT (attribute_id, slug) DO NOTHING;

-- Finish values
INSERT INTO product_attribute_values (attribute_id, value, slug, display_order)
SELECT pa.id, v.value, v.slug, v.ord
FROM product_attributes pa,
(VALUES
  ('Matte',    'matte',    1),
  ('Glossy',   'glossy',   2),
  ('Brushed',  'brushed',  3),
  ('Textured', 'textured', 4)
) AS v(value, slug, ord)
WHERE pa.slug = 'finish'
ON CONFLICT (attribute_id, slug) DO NOTHING;

-- ============================================================================
-- 6. Permissions (reuse products.view/edit — no new permissions needed)
-- ============================================================================

COMMIT;
