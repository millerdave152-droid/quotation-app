-- Rollback: 60_quote_items_snapshot.down.sql
-- Description: Remove Skulytics snapshot + discontinued-acknowledgement columns from quotation_items
-- Dependencies: none

-- Drop indexes first
DROP INDEX IF EXISTS idx_qi_skulytics_id;
DROP INDEX IF EXISTS idx_qi_skulytics_snapshot_gin;

-- Remove columns (order: newest first)
ALTER TABLE quotation_items DROP COLUMN IF EXISTS discontinued_acknowledged_at;
ALTER TABLE quotation_items DROP COLUMN IF EXISTS discontinued_acknowledged_by;
ALTER TABLE quotation_items DROP COLUMN IF EXISTS skulytics_snapshot;
ALTER TABLE quotation_items DROP COLUMN IF EXISTS skulytics_id;
