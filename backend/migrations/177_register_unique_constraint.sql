-- Prevent duplicate register names within the same tenant/location
-- Fixes: register_name duplication when seed data runs multiple times

CREATE UNIQUE INDEX IF NOT EXISTS uq_registers_name_tenant
  ON registers (register_name, tenant_id);
