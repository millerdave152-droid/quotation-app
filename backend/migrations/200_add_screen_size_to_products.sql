-- Migration 200: Add screen_size_inches to products for EHF tier calculation
BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS screen_size_inches INTEGER;

-- Populate screen_size_inches from SKU patterns for TV products
-- Samsung: QN43, QN55, QN65, QN75, QN85, UN32, UN40, UN50
-- LG: 43UQ, 55UQ, 65UQ, OLED55, OLED65, OLED77, 55UA, 75QNED
-- General: letters then 2-digit size, or digits first

UPDATE products SET screen_size_inches =
  CASE
    WHEN sku ~ '^[A-Za-z]{1,5}(2[4-9]|[3-9][0-9])' THEN
      CAST(substring(sku FROM '^[A-Za-z]{1,5}(2[4-9]|[3-9][0-9])') AS INTEGER)
    WHEN sku ~ '^(2[4-9]|[3-9][0-9])[A-Za-z]' THEN
      CAST(substring(sku FROM '^(2[4-9]|[3-9][0-9])') AS INTEGER)
    WHEN name ~* '(\d{2})\s*-?\s*inch' THEN
      CAST(substring(name FROM '(\d{2})\s*-?\s*[Ii]nch') AS INTEGER)
    WHEN name ~ '(\d{2})"' THEN
      CAST(substring(name FROM '(\d{2})"') AS INTEGER)
  END
WHERE (
  category ILIKE '%TV%'
  OR category ILIKE '%television%'
  OR category ILIKE '%QLED%'
  OR category ILIKE '%OLED%'
  OR category ILIKE '%UHD%'
  OR name ILIKE '%TV %'
)
AND screen_size_inches IS NULL;

COMMIT;
