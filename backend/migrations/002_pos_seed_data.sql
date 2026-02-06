-- TeleTime POS - Seed Data
-- Run after 001_pos_tables.sql to add test registers

-- ============================================================================
-- REGISTERS
-- ============================================================================

INSERT INTO registers (register_name, location, is_active, created_at)
VALUES
  ('Register 1', 'Main Floor - Front', true, NOW()),
  ('Register 2', 'Main Floor - Back', true, NOW()),
  ('Register 3', 'Second Floor', false, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VERIFY
-- ============================================================================

-- Show created registers
SELECT
  register_id,
  register_name,
  location,
  is_active
FROM registers
ORDER BY register_id;
