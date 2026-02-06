-- Migration 055: Add fulfillment_type to unified_orders
-- Simple pickup/delivery selection stored directly on the order

-- Create the enum type
DO $$ BEGIN
  CREATE TYPE order_fulfillment_type AS ENUM ('pickup', 'delivery');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add column to unified_orders
ALTER TABLE unified_orders ADD COLUMN IF NOT EXISTS fulfillment_type order_fulfillment_type;

-- Backfill from order_fulfillment table where possible
UPDATE unified_orders uo
SET fulfillment_type = CASE
  WHEN of.fulfillment_type IN ('pickup_now', 'pickup_scheduled') THEN 'pickup'::order_fulfillment_type
  WHEN of.fulfillment_type IN ('local_delivery', 'shipping') THEN 'delivery'::order_fulfillment_type
END
FROM order_fulfillment of
WHERE of.order_id = uo.id
  AND uo.fulfillment_type IS NULL;

-- Also backfill from transactions linked via order_fulfillment
UPDATE unified_orders uo
SET fulfillment_type = CASE
  WHEN of.fulfillment_type IN ('pickup_now', 'pickup_scheduled') THEN 'pickup'::order_fulfillment_type
  WHEN of.fulfillment_type IN ('local_delivery', 'shipping') THEN 'delivery'::order_fulfillment_type
END
FROM order_fulfillment of
JOIN transactions t ON of.transaction_id = t.transaction_id
WHERE t.quote_id = uo.legacy_quote_id
  AND uo.fulfillment_type IS NULL
  AND of.fulfillment_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unified_orders_fulfillment_type ON unified_orders(fulfillment_type);
