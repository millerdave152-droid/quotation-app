-- ============================================================================
-- Migration 073: Promotions System Enhancements
-- Evolve existing promotions/promotion_usage tables to support the full spec
-- ============================================================================

-- Add missing columns to promotions
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS promotion_type VARCHAR(30);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS discount_percentage DECIMAL(5,2);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS discount_amount INTEGER;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS fixed_price INTEGER;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS applies_to VARCHAR(20);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS category_ids INTEGER[];
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS brand_ids INTEGER[];
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS product_ids INTEGER[];
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS collection_id INTEGER;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS min_purchase_amount INTEGER;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS is_stackable BOOLEAN DEFAULT FALSE;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS times_used INTEGER DEFAULT 0;

-- Backfill name from promo_name
UPDATE promotions SET name = promo_name WHERE name IS NULL AND promo_name IS NOT NULL;
-- Backfill code from promo_code
UPDATE promotions SET code = promo_code WHERE code IS NULL AND promo_code IS NOT NULL;
-- Backfill promotion_type from promo_type/discount_type
UPDATE promotions SET promotion_type = COALESCE(promo_type, discount_type, 'percentage_off') WHERE promotion_type IS NULL;
-- Backfill applies_to from scope_type
UPDATE promotions SET applies_to = COALESCE(scope_type, 'all') WHERE applies_to IS NULL;
-- Backfill is_stackable from can_stack
UPDATE promotions SET is_stackable = COALESCE(can_stack, FALSE) WHERE is_stackable IS NULL;
-- Backfill status from is_active
UPDATE promotions SET status = CASE WHEN is_active = TRUE THEN 'active' ELSE 'draft' END WHERE status IS NULL OR status = 'draft';
-- Backfill times_used from current_uses
UPDATE promotions SET times_used = COALESCE(current_uses, 0) WHERE times_used = 0 AND current_uses > 0;
-- Backfill min_purchase_amount from min_purchase_cents
UPDATE promotions SET min_purchase_amount = min_purchase_cents WHERE min_purchase_amount IS NULL AND min_purchase_cents IS NOT NULL;

-- Add unique constraint on code if not exists
DO $$ BEGIN
  ALTER TABLE promotions ADD CONSTRAINT promotions_code_unique UNIQUE (code);
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- Add missing columns to promotion_usage
ALTER TABLE promotion_usage ADD COLUMN IF NOT EXISTS order_id INTEGER;
ALTER TABLE promotion_usage ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
ALTER TABLE promotion_usage ADD COLUMN IF NOT EXISTS discount_applied INTEGER;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_promotions_dates ON promotions(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(status);
CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions(code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promotions_type ON promotions(promotion_type);
CREATE INDEX IF NOT EXISTS idx_promotion_usage_promo ON promotion_usage(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_usage_customer ON promotion_usage(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promotion_usage_order ON promotion_usage(order_id) WHERE order_id IS NOT NULL;
