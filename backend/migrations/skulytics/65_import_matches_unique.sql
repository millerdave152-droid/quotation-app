-- Migration: 65_import_matches_unique.sql
-- Description: Add unique constraint on (tenant_id, skulytics_id) to support ON CONFLICT upserts
-- Dependencies: 30_skulytics_import_matches.sql

CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_tenant_skulytics_unique
  ON skulytics_import_matches (tenant_id, skulytics_id);
