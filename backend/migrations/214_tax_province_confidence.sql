-- Migration 214: Add tax_province_confidence to transactions and quotations
-- Tracks how the tax province was resolved: 'api' (geocoder.ca), 'prefix' (postal code map), or 'default' (ON fallback).
-- Records with confidence != 'api' should be reviewed for tax accuracy.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS tax_province_confidence VARCHAR(10);

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS tax_province_confidence VARCHAR(10);
