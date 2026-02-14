-- Fix commission_rate column precision
-- Mirakl sends commission_rate_vat as a percentage (e.g., 13 for 13%)
-- numeric(5,4) max is 9.9999, which overflows for rates >= 10%
ALTER TABLE marketplace_orders
  ALTER COLUMN commission_rate TYPE numeric(7,4);
