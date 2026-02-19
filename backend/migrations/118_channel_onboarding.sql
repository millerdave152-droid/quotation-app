-- Migration 118: Channel onboarding wizard tracking

CREATE TABLE IF NOT EXISTS channel_onboarding (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  tenant_id INTEGER REFERENCES marketplace_tenants(id),
  current_step INTEGER DEFAULT 1,
  total_steps INTEGER DEFAULT 7,
  step_data JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'IN_PROGRESS',
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_channel ON channel_onboarding (channel_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON channel_onboarding (status);
CREATE INDEX IF NOT EXISTS idx_onboarding_tenant ON channel_onboarding (tenant_id);
