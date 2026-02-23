BEGIN;

-- Add marketplace permission
INSERT INTO permissions (code, name, description, category)
VALUES ('hub.marketplace.access', 'Marketplace Access', 'Access to marketplace management features', 'hub')
ON CONFLICT (code) DO NOTHING;

-- Grant to admin and manager roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('admin', 'manager')
  AND p.code = 'hub.marketplace.access'
ON CONFLICT DO NOTHING;

COMMIT;
