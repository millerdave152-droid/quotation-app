-- Migration: 15_tenants_bootstrap.sql
-- Description: Bootstrap tenants table required by
--              migration 20 (tenant_product_overrides FK)
-- Dependencies: 00_skulytics_extensions.sql (for gen_random_uuid, set_updated_at)
-- Rollback: 15_tenants_bootstrap.down.sql

CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tenants_updated_at'
  ) THEN
    CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- Seed TeleTime as tenant #1
INSERT INTO tenants (name, slug)
VALUES ('TeleTime', 'teletime')
ON CONFLICT (slug) DO NOTHING;
