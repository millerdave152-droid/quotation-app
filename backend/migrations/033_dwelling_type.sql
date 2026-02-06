-- ============================================================================
-- Migration 033: Dwelling Type for Delivery Orders
-- Adds dwelling_type to order_fulfillment for delivery logistics
-- ============================================================================

-- Create dwelling type enum
DO $$ BEGIN
  CREATE TYPE dwelling_type AS ENUM (
    'house',
    'townhouse',
    'condo',
    'apartment',
    'commercial'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add dwelling_type column to order_fulfillment
ALTER TABLE order_fulfillment
  ADD COLUMN IF NOT EXISTS dwelling_type dwelling_type;

-- Add index for filtering by dwelling type
CREATE INDEX IF NOT EXISTS idx_fulfillment_dwelling_type
  ON order_fulfillment(dwelling_type) WHERE dwelling_type IS NOT NULL;

COMMENT ON COLUMN order_fulfillment.dwelling_type
  IS 'Type of dwelling at delivery address (required for delivery fulfillment types)';
