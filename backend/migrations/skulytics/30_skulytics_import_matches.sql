-- Migration: 30_skulytics_import_matches.sql
-- Description: Import match table to prevent silent product duplication
-- Dependencies: 10_global_skulytics_products.sql
-- Rollback: 30_skulytics_import_matches.down.sql

-- ============================================================
-- 30: IMPORT MATCH TABLE (no silent duplication)
-- ============================================================

CREATE TABLE IF NOT EXISTS skulytics_import_matches (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  skulytics_id         TEXT NOT NULL REFERENCES global_skulytics_products(skulytics_id),
  internal_product_id  INTEGER REFERENCES products(id),

  match_method         TEXT NOT NULL
    CHECK (match_method IN ('upc','sku','composite','manual')),
  match_confidence     SMALLINT
    CHECK (match_confidence BETWEEN 0 AND 100),
  match_status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (match_status IN ('pending','confirmed','rejected','new')),

  reviewed_by          INTEGER REFERENCES users(id),
  reviewed_at          TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sim_tenant_status
  ON skulytics_import_matches (tenant_id, match_status);
CREATE INDEX IF NOT EXISTS idx_sim_skulytics
  ON skulytics_import_matches (skulytics_id);
CREATE INDEX IF NOT EXISTS idx_sim_internal
  ON skulytics_import_matches (internal_product_id);
