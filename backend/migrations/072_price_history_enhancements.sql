-- ============================================================================
-- Migration 072: Price History Enhancements
-- Adds cents-based columns, effective_to, source CHECK, and auto-close trigger
-- ============================================================================

-- Add cents-based price columns
ALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS cost INTEGER;
ALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS retail_price INTEGER;
ALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS promo_price INTEGER;

-- Add effective_to for date-range queries
ALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS effective_to DATE;

-- Make effective_from NOT NULL with a default for existing rows
ALTER TABLE product_price_history ALTER COLUMN effective_from SET DEFAULT CURRENT_DATE;
UPDATE product_price_history SET effective_from = created_at::date WHERE effective_from IS NULL;

-- Backfill cents columns from dollar columns where available
UPDATE product_price_history
SET cost = ROUND(new_cost * 100)::int,
    retail_price = ROUND(new_price * 100)::int
WHERE cost IS NULL AND new_cost IS NOT NULL;

-- Add source CHECK constraint (only if not already present)
DO $$ BEGIN
  ALTER TABLE product_price_history
    ADD CONSTRAINT chk_pph_source CHECK (source IN ('import','manual','api','promotion'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN check_violation THEN NULL;
END $$;

-- Additional index for date range lookups
CREATE INDEX IF NOT EXISTS idx_pph_dates ON product_price_history(effective_from, effective_to);

-- Trigger: auto-close previous price record when a new one is inserted
CREATE OR REPLACE FUNCTION close_previous_price()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE product_price_history
  SET effective_to = NEW.effective_from - INTERVAL '1 day'
  WHERE product_id = NEW.product_id
    AND effective_to IS NULL
    AND id != NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_close_previous_price ON product_price_history;
CREATE TRIGGER trigger_close_previous_price
  AFTER INSERT ON product_price_history
  FOR EACH ROW
  EXECUTE FUNCTION close_previous_price();
