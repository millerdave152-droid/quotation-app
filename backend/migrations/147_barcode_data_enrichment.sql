-- ============================================================================
-- Migration 147: Barcode Data Enrichment
-- Adds barcode_formats and barcode_attributes columns to products table
-- for storing full Barcode Lookup API v3 response data.
-- ============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode_formats VARCHAR(500);
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode_attributes JSONB;

COMMENT ON COLUMN products.barcode_formats IS 'Raw barcode format string from Barcode Lookup API, e.g. "UPC-A 196641097995, EAN-13 0196641097995"';
COMMENT ON COLUMN products.barcode_attributes IS 'Full product attributes from Barcode Lookup API (age_group, material, size, features, reviews, etc.)';
