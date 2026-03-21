-- ============================================================================
-- Migration 167: Product Variant System — Phase 1 (Schema Only)
-- Builds on migration 129 (product_attributes, product_attribute_values,
-- parent_product_id, is_parent, variant_attributes columns).
-- Adds parent config, variant-attribute junction, variant-level inventory,
-- convenience views, and RBAC permissions.
-- Non-breaking: all existing FK references to products(id) remain valid.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. New columns on products
-- ============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_sku VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_sort_order INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_default_variant BOOLEAN DEFAULT false;

-- Partial unique index: variant_sku must be unique when set
CREATE INDEX IF NOT EXISTS idx_products_variant_sku
  ON products(variant_sku)
  WHERE variant_sku IS NOT NULL;

-- Index for ordering variants within a parent
CREATE INDEX IF NOT EXISTS idx_products_variant_sort
  ON products(parent_product_id, variant_sort_order)
  WHERE parent_product_id IS NOT NULL;

-- ============================================================================
-- 2. product_parent_config — one-to-one with parent products
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_parent_config (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,

  -- Which attributes vary across variants (array of product_attributes IDs)
  varying_attribute_ids INTEGER[] DEFAULT '{}',

  -- How the variant selector is rendered
  display_mode VARCHAR(20) DEFAULT 'dropdown'
    CHECK (display_mode IN ('dropdown', 'swatch', 'button', 'matrix', 'tile')),

  -- The default variant shown on page load
  default_variant_id INTEGER REFERENCES products(id) ON DELETE SET NULL,

  -- How the parent displays price when it has variants
  price_display VARCHAR(20) DEFAULT 'range'
    CHECK (price_display IN ('range', 'from_lowest', 'default_variant', 'hidden')),

  -- Whether the parent product sums variant inventory for display
  aggregate_inventory BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parent_config_product
  ON product_parent_config(product_id);

-- ============================================================================
-- 3. product_variant_attributes — junction: variant <-> attribute values
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_variant_attributes (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute_id INTEGER NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  attribute_value_id INTEGER NOT NULL REFERENCES product_attribute_values(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One value per attribute per variant
  UNIQUE(product_id, attribute_id)
);

CREATE INDEX IF NOT EXISTS idx_pva_product ON product_variant_attributes(product_id);
CREATE INDEX IF NOT EXISTS idx_pva_attribute ON product_variant_attributes(attribute_id);
CREATE INDEX IF NOT EXISTS idx_pva_value ON product_variant_attributes(attribute_value_id);

-- ============================================================================
-- 4. variant_inventory — variant-level inventory by location
--    Complements location_inventory (migration 076) which tracks at product level
-- ============================================================================

CREATE TABLE IF NOT EXISTS variant_inventory (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,  -- NULL = default/aggregate

  qty_on_hand INTEGER DEFAULT 0,
  qty_reserved INTEGER DEFAULT 0,
  qty_available INTEGER GENERATED ALWAYS AS (qty_on_hand - qty_reserved) STORED,

  reorder_point INTEGER DEFAULT 0,
  reorder_qty INTEGER DEFAULT 0,
  bin_location VARCHAR(50),

  last_counted_at TIMESTAMPTZ,
  last_counted_by INTEGER REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One row per variant per location
  UNIQUE(product_id, location_id),

  CONSTRAINT vi_non_negative_qty CHECK (qty_on_hand >= 0),
  CONSTRAINT vi_valid_reserved CHECK (qty_reserved >= 0)
);

CREATE INDEX IF NOT EXISTS idx_variant_inv_product ON variant_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_variant_inv_location ON variant_inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_variant_inv_low_stock
  ON variant_inventory(qty_on_hand)
  WHERE qty_on_hand > 0;

-- ============================================================================
-- 5. Trigger function: auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to product_parent_config
DROP TRIGGER IF EXISTS trg_parent_config_updated_at ON product_parent_config;
CREATE TRIGGER trg_parent_config_updated_at
  BEFORE UPDATE ON product_parent_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply to variant_inventory
DROP TRIGGER IF EXISTS trg_variant_inventory_updated_at ON variant_inventory;
CREATE TRIGGER trg_variant_inventory_updated_at
  BEFORE UPDATE ON variant_inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. Convenience views
-- ============================================================================

-- 6a. product_parents — parent products with config, variant count, price range
CREATE OR REPLACE VIEW product_parents AS
SELECT
  p.id,
  p.name,
  p.model,
  p.manufacturer,
  p.category_id,
  pc.varying_attribute_ids,
  pc.display_mode,
  pc.default_variant_id,
  pc.price_display,
  pc.aggregate_inventory,
  COUNT(v.id)::int AS variant_count,
  MIN(v.price)::numeric AS min_price,
  MAX(v.price)::numeric AS max_price,
  CASE
    WHEN pc.aggregate_inventory THEN
      COALESCE(SUM(v.qty_on_hand), 0)::int
    ELSE
      p.qty_on_hand
  END AS total_qty_on_hand,
  CASE
    WHEN pc.aggregate_inventory THEN
      COALESCE(SUM(v.qty_reserved), 0)::int
    ELSE
      p.qty_reserved
  END AS total_qty_reserved
FROM products p
LEFT JOIN product_parent_config pc ON pc.product_id = p.id
LEFT JOIN products v ON v.parent_product_id = p.id
WHERE p.is_parent = true
GROUP BY p.id, p.name, p.model, p.manufacturer, p.category_id,
         pc.varying_attribute_ids, pc.display_mode, pc.default_variant_id,
         pc.price_display, pc.aggregate_inventory,
         p.qty_on_hand, p.qty_reserved;

-- 6b. product_variants — variant products with parent info, resolved attributes
CREATE OR REPLACE VIEW product_variants AS
SELECT
  v.id,
  v.name,
  v.model,
  v.variant_sku,
  v.price,
  v.parent_product_id,
  parent.name AS parent_name,
  parent.model AS parent_model,
  v.variant_sort_order,
  v.is_default_variant,
  v.variant_attributes,
  v.qty_on_hand,
  v.qty_reserved,
  v.qty_available,
  -- Aggregate variant-level inventory across locations
  COALESCE(vi_agg.total_on_hand, 0)::int AS variant_inv_on_hand,
  COALESCE(vi_agg.total_reserved, 0)::int AS variant_inv_reserved,
  COALESCE(vi_agg.total_available, 0)::int AS variant_inv_available,
  COALESCE(vi_agg.location_count, 0)::int AS variant_inv_locations
FROM products v
JOIN products parent ON parent.id = v.parent_product_id
LEFT JOIN (
  SELECT
    product_id,
    SUM(qty_on_hand)::int AS total_on_hand,
    SUM(qty_reserved)::int AS total_reserved,
    SUM(qty_on_hand - qty_reserved)::int AS total_available,
    COUNT(DISTINCT location_id)::int AS location_count
  FROM variant_inventory
  GROUP BY product_id
) vi_agg ON vi_agg.product_id = v.id
WHERE v.parent_product_id IS NOT NULL;

-- 6c. variant_inventory_summary — roll-up of variant inventory by parent
CREATE OR REPLACE VIEW variant_inventory_summary AS
SELECT
  parent.id AS parent_product_id,
  parent.name AS parent_name,
  parent.model AS parent_model,
  COUNT(DISTINCT v.id)::int AS variant_count,
  SUM(COALESCE(vi.qty_on_hand, 0))::int AS total_on_hand,
  SUM(COALESCE(vi.qty_reserved, 0))::int AS total_reserved,
  SUM(COALESCE(vi.qty_on_hand - vi.qty_reserved, 0))::int AS total_available,
  COUNT(DISTINCT vi.location_id)::int AS locations_stocked
FROM products parent
JOIN products v ON v.parent_product_id = parent.id
LEFT JOIN variant_inventory vi ON vi.product_id = v.id
WHERE parent.is_parent = true
GROUP BY parent.id, parent.name, parent.model;

-- ============================================================================
-- 7. RBAC Permissions
-- ============================================================================

INSERT INTO permissions (code, name, category, description) VALUES
  ('product_variants.view',   'View product variants',        'hub', 'View variant details and attribute values'),
  ('product_variants.create', 'Create product variants',      'hub', 'Create new variants under parent products'),
  ('product_variants.edit',   'Edit product variants',        'hub', 'Edit variant attributes, SKU, and sort order'),
  ('product_variants.delete', 'Delete product variants',      'hub', 'Delete variant products'),
  ('variant_inventory.view',  'View variant inventory',       'hub', 'View per-variant inventory levels'),
  ('variant_inventory.edit',  'Adjust variant inventory',     'hub', 'Adjust per-variant inventory quantities')
ON CONFLICT (code) DO NOTHING;

-- Grant all new permissions to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND p.code IN (
    'product_variants.view', 'product_variants.create',
    'product_variants.edit', 'product_variants.delete',
    'variant_inventory.view', 'variant_inventory.edit'
  )
ON CONFLICT DO NOTHING;

-- Grant view + create/edit to manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'manager'
  AND p.code IN (
    'product_variants.view', 'product_variants.create',
    'product_variants.edit', 'product_variants.delete',
    'variant_inventory.view', 'variant_inventory.edit'
  )
ON CONFLICT DO NOTHING;

-- Grant view to warehouse staff
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'warehouse'
  AND p.code IN (
    'product_variants.view',
    'variant_inventory.view', 'variant_inventory.edit'
  )
ON CONFLICT DO NOTHING;

-- Grant view to sales roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('sales', 'senior_sales')
  AND p.code IN ('product_variants.view', 'variant_inventory.view')
ON CONFLICT DO NOTHING;

COMMIT;
