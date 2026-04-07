-- ============================================================================
-- Migration 218: Add customer_description to quotation_items
-- ============================================================================
-- When "Hide Model Numbers" is enabled on a quote, this field provides a
-- staff-editable, customer-facing product description that omits model
-- numbers and manufacturer-identifiable information. If NULL, the PDF
-- generator auto-builds a description from product attributes (screen size,
-- color, category, variant_attributes, ce_specs).
-- ============================================================================

BEGIN;

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS customer_description VARCHAR(500);

COMMENT ON COLUMN quotation_items.customer_description IS
  'Optional customer-facing description used when hide_model_numbers is enabled. Overrides auto-generated description.';

COMMIT;
