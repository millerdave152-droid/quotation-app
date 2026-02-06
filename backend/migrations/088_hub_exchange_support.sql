-- ============================================================================
-- Migration 088: Hub Exchange Support
-- Adds exchange tracking columns to unified_orders
-- ============================================================================

ALTER TABLE unified_orders ADD COLUMN IF NOT EXISTS is_exchange BOOLEAN DEFAULT false;
ALTER TABLE unified_orders ADD COLUMN IF NOT EXISTS original_return_id INTEGER REFERENCES hub_returns(id);

CREATE INDEX IF NOT EXISTS idx_unified_orders_exchange ON unified_orders(original_return_id) WHERE original_return_id IS NOT NULL;
