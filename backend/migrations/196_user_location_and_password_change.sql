-- Migration 196: Add location_id and force_password_change to users

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS location_id             INTEGER REFERENCES locations(id),
  ADD COLUMN IF NOT EXISTS force_password_change    BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_users_location_id ON users (location_id);

-- Set force_password_change = true and assign Mississauga Main (id=1)
-- for the three new salesperson accounts
UPDATE users
SET force_password_change = true,
    location_id = 1
WHERE email IN (
  'montie.s@teletime.ca',
  'jasvinder.s@teletime.ca',
  'harmeet.s@teletime.ca'
);

-- Existing users should not be forced to change passwords
UPDATE users
SET force_password_change = false
WHERE email NOT IN (
  'montie.s@teletime.ca',
  'jasvinder.s@teletime.ca',
  'harmeet.s@teletime.ca'
);
