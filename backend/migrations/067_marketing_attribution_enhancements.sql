-- Migration 067: Marketing Attribution Enhancements
-- Enhances marketing_sources with code, category, requires_detail
-- Adds FK-based tracking to unified_orders and first_contact_date to customers

-- ============================================================================
-- 1. ENHANCE marketing_sources TABLE
-- ============================================================================

-- Add new columns
ALTER TABLE marketing_sources ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE marketing_sources ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE marketing_sources ADD COLUMN IF NOT EXISTS category VARCHAR(50);
ALTER TABLE marketing_sources ADD COLUMN IF NOT EXISTS requires_detail BOOLEAN DEFAULT FALSE;
ALTER TABLE marketing_sources ADD COLUMN IF NOT EXISTS is_active BOOLEAN;

-- Backfill code from label (lowercase, spaces to underscores, strip special chars)
UPDATE marketing_sources SET
  code = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(label, '[^a-zA-Z0-9 ]', '', 'g'), '\s+', '_', 'g')),
  name = label,
  is_active = active
WHERE code IS NULL;

-- Set category based on existing labels
UPDATE marketing_sources SET category = 'digital'
WHERE code IN ('google_search', 'facebookinstagram', 'facebook_instagram', 'tiktok', 'youtube', 'kijiji_marketplace', 'kijiji__marketplace');

UPDATE marketing_sources SET category = 'direct'
WHERE code IN ('walkin_driveby', 'walkin__driveby', 'walk_in__driveby', 'returning_customer');

UPDATE marketing_sources SET category = 'referral'
WHERE code IN ('referral_from_friendfamily', 'referral_from_friend_family', 'referralfrom_friendfamily');

UPDATE marketing_sources SET category = 'traditional'
WHERE code IN ('flyer_print_ad', 'flyer__print_ad');

UPDATE marketing_sources SET category = 'other'
WHERE category IS NULL;

-- Set requires_detail for referral and other
UPDATE marketing_sources SET requires_detail = TRUE
WHERE code LIKE '%referral%' OR code = 'other';

-- Add unique constraint on code
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_sources_code ON marketing_sources(code);

-- Insert missing seed entries (if not present by label)
INSERT INTO marketing_sources (label, code, name, category, sort_order, is_active, requires_detail)
VALUES
  ('Google Ads', 'google_ads', 'Google Ads', 'digital', 2, true, false),
  ('Radio', 'radio', 'Radio', 'traditional', 9, true, false),
  ('TV', 'tv', 'TV', 'traditional', 10, true, false)
ON CONFLICT (label) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  category = EXCLUDED.category;

-- ============================================================================
-- 2. ADD FK-BASED MARKETING COLUMNS TO unified_orders
-- ============================================================================

ALTER TABLE unified_orders ADD COLUMN IF NOT EXISTS marketing_source_id INTEGER REFERENCES marketing_sources(id);
ALTER TABLE unified_orders ADD COLUMN IF NOT EXISTS marketing_source_detail TEXT;

CREATE INDEX IF NOT EXISTS idx_unified_orders_marketing_source ON unified_orders(marketing_source_id);

-- ============================================================================
-- 3. ADD marketing_source_id FK AND first_contact_date TO customers
-- ============================================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS marketing_source_id INTEGER REFERENCES marketing_sources(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS first_contact_date DATE DEFAULT CURRENT_DATE;

-- Backfill marketing_source_id from existing marketing_source text
UPDATE customers c SET marketing_source_id = ms.id
FROM marketing_sources ms
WHERE c.marketing_source = ms.label
  AND c.marketing_source_id IS NULL
  AND c.marketing_source IS NOT NULL;

-- Backfill unified_orders from transactions where possible
-- (orders may have been created from transactions that had marketing_source)

CREATE INDEX IF NOT EXISTS idx_customers_marketing_source_id ON customers(marketing_source_id);
