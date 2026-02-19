-- Migration: 40_skulytics_sync_runs.sql
-- Description: Sync run tracking with per-SKU log and deferred FK on global_skulytics_products
-- Dependencies: 10_global_skulytics_products.sql
-- Rollback: 40_skulytics_sync_runs.down.sql

-- ============================================================
-- 40: SYNC RUN TRACKING + PER-SKU LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS skulytics_sync_runs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  run_type             TEXT NOT NULL
    CHECK (run_type IN ('full','incremental','manual_sku')),
  status               TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','failed','partial')),

  triggered_by         TEXT,
  api_cursor           TEXT,
  last_successful_sku  TEXT,

  total_expected       INTEGER,
  processed            INTEGER NOT NULL DEFAULT 0,
  created              INTEGER NOT NULL DEFAULT 0,
  updated              INTEGER NOT NULL DEFAULT 0,
  discontinued         INTEGER NOT NULL DEFAULT 0,
  failed               INTEGER NOT NULL DEFAULT 0,

  rate_limit_hits      INTEGER NOT NULL DEFAULT 0,
  last_rate_limit_at   TIMESTAMPTZ,

  api_schema_version   TEXT,
  error_message        TEXT,
  error_count          INTEGER NOT NULL DEFAULT 0,

  started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes on sync runs
CREATE INDEX IF NOT EXISTS idx_ssr_status_started
  ON skulytics_sync_runs (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ssr_type_started
  ON skulytics_sync_runs (run_type, started_at DESC);

-- Per-SKU log table
CREATE TABLE IF NOT EXISTS skulytics_sync_sku_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id          UUID NOT NULL
    REFERENCES skulytics_sync_runs(id) ON DELETE CASCADE,
  skulytics_id         TEXT,
  sku                  TEXT NOT NULL,
  status               TEXT NOT NULL
    CHECK (status IN ('created','updated','failed','skipped')),
  error_message        TEXT,
  processed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes on SKU log
CREATE INDEX IF NOT EXISTS idx_sssl_run_status
  ON skulytics_sync_sku_log (sync_run_id, status);
CREATE INDEX IF NOT EXISTS idx_sssl_failed
  ON skulytics_sync_sku_log (status, processed_at DESC)
  WHERE status = 'failed';

-- Wire deferred FK on global cache table (sync_run_id -> skulytics_sync_runs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_gsp_sync_run'
  ) THEN
    ALTER TABLE global_skulytics_products
      ADD CONSTRAINT fk_gsp_sync_run
      FOREIGN KEY (sync_run_id) REFERENCES skulytics_sync_runs(id);
  END IF;
END;
$$;

-- Optional: self-referencing FK for variant parents
-- ALTER TABLE global_skulytics_products
--   ADD CONSTRAINT fk_gsp_parent
--   FOREIGN KEY (parent_skulytics_id)
--   REFERENCES global_skulytics_products(skulytics_id);
