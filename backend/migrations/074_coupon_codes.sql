-- ============================================================================
-- Migration 074: Coupon Code System
-- Adds code-specific columns to promotions and unique codes table
-- ============================================================================

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS requires_code BOOLEAN DEFAULT FALSE;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS code_type VARCHAR(20);

-- Add CHECK constraint safely
DO $$ BEGIN
  ALTER TABLE promotions ADD CONSTRAINT chk_promotions_code_type
    CHECK (code_type IN ('single', 'multi_use', 'unique'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Unique codes table
CREATE TABLE IF NOT EXISTS promotion_codes (
  id SERIAL PRIMARY KEY,
  promotion_id INTEGER REFERENCES promotions(id) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,

  assigned_to_customer_id INTEGER REFERENCES customers(id),
  assigned_at TIMESTAMP,

  is_used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP,
  used_by_customer_id INTEGER REFERENCES customers(id),
  used_on_order_id INTEGER,

  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promotion_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_promo ON promotion_codes(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_customer ON promotion_codes(assigned_to_customer_id) WHERE assigned_to_customer_id IS NOT NULL;
