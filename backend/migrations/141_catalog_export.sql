-- Migration 141: Social Media Catalog Export System

CREATE TABLE IF NOT EXISTS catalog_exports (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(200) NOT NULL,
  platform VARCHAR(30) NOT NULL CHECK (platform IN ('facebook', 'instagram', 'google_shopping', 'pinterest')),
  filter_rules JSONB DEFAULT '{}',
  field_mapping JSONB DEFAULT '{}',
  schedule_cron VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  last_export_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_export_log (
  id SERIAL PRIMARY KEY,
  export_id INTEGER NOT NULL REFERENCES catalog_exports(id) ON DELETE CASCADE,
  products_exported INTEGER DEFAULT 0,
  products_skipped INTEGER DEFAULT 0,
  file_url TEXT,
  format VARCHAR(10) NOT NULL CHECK (format IN ('csv', 'xml', 'json')),
  file_size_bytes INTEGER,
  errors JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_catalog_exports_platform ON catalog_exports(platform);
CREATE INDEX IF NOT EXISTS idx_catalog_export_log_export ON catalog_export_log(export_id);

INSERT INTO permissions (code, name, description, category) VALUES
  ('catalog_exports.view', 'View catalog exports', 'View catalog exports', 'marketing'),
  ('catalog_exports.create', 'Create catalog exports', 'Create catalog exports', 'marketing'),
  ('catalog_exports.edit', 'Edit catalog exports', 'Edit catalog exports', 'marketing'),
  ('catalog_exports.run', 'Run catalog exports', 'Run catalog exports', 'marketing')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin' AND p.code LIKE 'catalog_exports.%'
AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
