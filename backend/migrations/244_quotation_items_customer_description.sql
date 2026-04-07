-- Migration 244: Add customer_description to quotation_items
-- Staff can manually set a customer-friendly description per line item.
-- When set, this takes priority over the auto-built description in PDFs.
-- No schema changes to other tables.

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS customer_description VARCHAR(500);
