-- Rollback: 00_skulytics_extensions.down.sql
-- Description: No-op — never drop extensions or shared functions in production
-- Dependencies: none

-- Intentionally left as no-op.
-- Dropping pgcrypto or set_updated_at() could break other tables/triggers.
-- To fully remove, verify no other objects depend on them first.

-- DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
-- DROP EXTENSION IF EXISTS pgcrypto;
