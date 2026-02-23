-- Migration 142: Facebook Audience Sync System

CREATE TABLE IF NOT EXISTS audience_syncs (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(200) NOT NULL,
  platform VARCHAR(30) NOT NULL DEFAULT 'facebook' CHECK (platform IN ('facebook', 'google', 'tiktok')),
  segment_rules JSONB NOT NULL DEFAULT '{}',
  external_audience_id VARCHAR(200),
  sync_frequency_hours INTEGER DEFAULT 24,
  last_sync_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audience_sync_log (
  id SERIAL PRIMARY KEY,
  sync_id INTEGER NOT NULL REFERENCES audience_syncs(id) ON DELETE CASCADE,
  members_matched INTEGER DEFAULT 0,
  members_added INTEGER DEFAULT 0,
  members_removed INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_audience_syncs_platform ON audience_syncs(platform);
CREATE INDEX IF NOT EXISTS idx_audience_sync_log_sync ON audience_sync_log(sync_id);

INSERT INTO permissions (code, name, description, category) VALUES
  ('audience_sync.view', 'View audience syncs', 'View audience syncs', 'marketing'),
  ('audience_sync.create', 'Create audience syncs', 'Create audience syncs', 'marketing'),
  ('audience_sync.edit', 'Edit audience syncs', 'Edit audience syncs', 'marketing'),
  ('audience_sync.run', 'Run audience syncs', 'Run audience syncs', 'marketing')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin' AND p.code LIKE 'audience_sync.%'
AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
