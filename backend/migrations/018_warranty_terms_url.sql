-- TeleTime POS - Add terms URL to warranty products
-- Migration: 018_warranty_terms_url.sql
-- Description: Adds terms_url column for linking to warranty terms and conditions

-- ============================================================================
-- ADD TERMS URL COLUMN
-- ============================================================================

ALTER TABLE warranty_products
ADD COLUMN IF NOT EXISTS terms_url VARCHAR(500);

COMMENT ON COLUMN warranty_products.terms_url IS 'URL to warranty terms and conditions document';

-- ============================================================================
-- UPDATE EXISTING WARRANTY PRODUCTS WITH DEFAULT TERMS URL
-- ============================================================================

-- Set default terms URL for existing warranties (adjust domain as needed)
UPDATE warranty_products
SET terms_url = CONCAT(
    'https://teletime.ca/warranty/terms/',
    LOWER(REPLACE(warranty_name, ' ', '-'))
)
WHERE terms_url IS NULL;

-- ============================================================================
-- INDEXES FOR WARRANTY LOOKUP
-- ============================================================================

-- Index for customer warranty lookup
CREATE INDEX IF NOT EXISTS idx_warranty_purchases_customer_status
ON warranty_purchases(customer_id, status);

-- Index for active warranties
CREATE INDEX IF NOT EXISTS idx_warranty_purchases_status_end_date
ON warranty_purchases(status, coverage_end_date);

-- Index for warranty expiry alerts
CREATE INDEX IF NOT EXISTS idx_warranty_purchases_expiring
ON warranty_purchases(coverage_end_date)
WHERE status = 'active';
