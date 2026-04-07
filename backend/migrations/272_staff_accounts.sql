-- TeleTime Staff Account Upserts (generated 2026-04-07)
-- Run against quotationapp database

-- Dave Miller (admin)
INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, location_id, force_password_change, created_at, updated_at)
VALUES ('dave.miller@teletime.ca', '$2b$12$dXN2JqmXjfQskBl4kEGA/u5.DEyz5AwLWuRbG/J2y9Mwe4E5WSVUO', 'Dave', 'Miller', 'admin', true, 1, true, NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  location_id = EXCLUDED.location_id,
  force_password_change = true,
  password_hash = EXCLUDED.password_hash,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  is_active = true,
  updated_at = NOW();

-- Montie Singh (supervisor)
INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, location_id, force_password_change, created_at, updated_at)
VALUES ('montie.s@teletime.ca', '$2b$12$/cE.MgVmoFz0hK8NnQArAu3lsUPOfjE7SN5HZdCiiX.KSvoXN6xdC', 'Montie', 'Singh', 'supervisor', true, 1, true, NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  location_id = EXCLUDED.location_id,
  force_password_change = true,
  password_hash = EXCLUDED.password_hash,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  is_active = true,
  updated_at = NOW();

-- Jasvinder Singh (supervisor)
INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, location_id, force_password_change, created_at, updated_at)
VALUES ('jasvinder.s@teletime.ca', '$2b$12$QWtLHPtPY.g7cBs8HTW.W.2Ll3a7dincbgi5FeuRjOCAi6d0W4XpO', 'Jasvinder', 'Singh', 'supervisor', true, 1, true, NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  location_id = EXCLUDED.location_id,
  force_password_change = true,
  password_hash = EXCLUDED.password_hash,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  is_active = true,
  updated_at = NOW();

-- Harmeet Singh (supervisor)
INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, location_id, force_password_change, created_at, updated_at)
VALUES ('harmeet.s@teletime.ca', '$2b$12$Ba15a/UqMGNmlNPlFqqx7eMHaBadnyZ3wFYIhseBtyh/pWjKol1Km', 'Harmeet', 'Singh', 'supervisor', true, 1, true, NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  location_id = EXCLUDED.location_id,
  force_password_change = true,
  password_hash = EXCLUDED.password_hash,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  is_active = true,
  updated_at = NOW();

