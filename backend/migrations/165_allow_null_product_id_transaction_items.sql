-- Migration 165: Allow NULL product_id in transaction_items
-- Enables POS checkout to complete even when product records are missing
-- (stale cache, deleted products, data-sync gaps). The product_name and
-- product_sku columns already snapshot the values at time of sale, so the
-- transaction record remains useful even without a live product FK.

-- Drop the existing NOT NULL constraint
ALTER TABLE transaction_items ALTER COLUMN product_id DROP NOT NULL;

-- Drop and re-create the FK to allow NULL values (NULLs naturally bypass FK checks)
ALTER TABLE transaction_items DROP CONSTRAINT IF EXISTS fk_transaction_items_product;
ALTER TABLE transaction_items
  ADD CONSTRAINT fk_transaction_items_product
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
