-- Migration: 20_tenant_product_overrides.sql
-- Description: Per-tenant product overrides for retailer customization
-- Dependencies: 00_skulytics_extensions.sql, 10_global_skulytics_products.sql
-- Rollback: 20_tenant_product_overrides.down.sql

-- ============================================================
-- 20: TENANT PRODUCT OVERRIDES (per-retailer customization)
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_product_overrides (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  skulytics_id         TEXT NOT NULL REFERENCES global_skulytics_products(skulytics_id),

  custom_description   TEXT,
  custom_model_name    TEXT,
  override_msrp        NUMERIC(12,2),

  is_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured          BOOLEAN NOT NULL DEFAULT FALSE,

  pricing_rule_id      INTEGER REFERENCES pricing_rules(id),
  overridden_by        INTEGER REFERENCES users(id),

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, skulytics_id)
);

-- Trigger: auto-update updated_at on row change
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tpo_updated_at'
  ) THEN
    CREATE TRIGGER trg_tpo_updated_at
    BEFORE UPDATE ON tenant_product_overrides
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tpo_tenant
  ON tenant_product_overrides (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tpo_skulytics
  ON tenant_product_overrides (skulytics_id);
CREATE INDEX IF NOT EXISTS idx_tpo_enabled
  ON tenant_product_overrides (tenant_id, is_enabled);
