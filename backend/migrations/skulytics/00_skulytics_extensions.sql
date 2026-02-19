-- Migration: 00_skulytics_extensions.sql
-- Description: Enable pgcrypto extension and create set_updated_at() trigger helper
-- Dependencies: none
-- Rollback: 00_skulytics_extensions.down.sql

-- ============================================================
-- EXTENSIONS + HELPER TRIGGER
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- CREATE EXTENSION IF NOT EXISTS pg_trgm; -- enable later for fuzzy search

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
