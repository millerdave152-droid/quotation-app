-- Migration: 60_quote_items_snapshot.sql
-- Description: Add Skulytics snapshot + discontinued-acknowledgement columns to quotation_items
-- Dependencies: 10_global_skulytics_products.sql
-- Rollback: 60_quote_items_snapshot.down.sql
-- NOTE: The real table is "quotation_items"; "quote_items" is a VIEW over it.

-- ============================================================
-- 60: QUOTATION ITEMS — SKULYTICS SNAPSHOT + DISCONTINUED ACK
-- ============================================================

-- Skulytics enrichment columns
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS skulytics_id TEXT;

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS skulytics_snapshot JSONB;

-- Discontinued product acknowledgement columns
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS discontinued_acknowledged_by INTEGER REFERENCES users(id);

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS discontinued_acknowledged_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_qi_skulytics_id
  ON quotation_items (skulytics_id) WHERE skulytics_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qi_skulytics_snapshot_gin
  ON quotation_items USING GIN (skulytics_snapshot);
