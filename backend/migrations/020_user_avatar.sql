-- Migration: 020_user_avatar.sql
-- Description: Add avatar_url column to users table for salesperson selection UI

-- ============================================================================
-- ADD AVATAR URL TO USERS
-- ============================================================================

-- Add avatar_url column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500);
    COMMENT ON COLUMN users.avatar_url IS 'URL to user profile photo/avatar';
  END IF;
END
$$;

-- Create index for faster lookups on active users
CREATE INDEX IF NOT EXISTS idx_users_active_role ON users(is_active, role);

-- ============================================================================
-- SEED SAMPLE AVATARS (For Development/Demo)
-- ============================================================================

-- Update some users with placeholder avatars for testing
-- Uses UI Avatars service which generates initials-based avatars
-- In production, these would be actual uploaded photos

-- This is commented out for production - uncomment for demo purposes
/*
UPDATE users
SET avatar_url = 'https://ui-avatars.com/api/?name=' ||
    COALESCE(first_name, 'U') || '+' || COALESCE(last_name, 'ser') ||
    '&background=random&color=fff&size=128'
WHERE avatar_url IS NULL
  AND first_name IS NOT NULL;
*/
