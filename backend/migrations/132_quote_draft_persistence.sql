-- Migration 132: Quote Draft Persistence & Cross-Device Sync
-- Adds client_draft_id to quotations for idempotent offline replay
-- Creates quotation_drafts table for server-side draft storage

-- Add client_draft_id to quotations for idempotency
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_draft_id UUID UNIQUE;
CREATE INDEX IF NOT EXISTS idx_quotations_client_draft_id ON quotations (client_draft_id) WHERE client_draft_id IS NOT NULL;

-- Server-side draft storage for cross-device sync
CREATE TABLE IF NOT EXISTS quotation_drafts (
  id SERIAL PRIMARY KEY,
  client_draft_id UUID UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL DEFAULT '{}',
  server_quote_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotation_drafts_user_id ON quotation_drafts (user_id);
CREATE INDEX IF NOT EXISTS idx_quotation_drafts_tenant_id ON quotation_drafts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotation_drafts_updated_at ON quotation_drafts (updated_at DESC);

-- RLS policy: users can only see their own drafts
ALTER TABLE quotation_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY quotation_drafts_user_policy ON quotation_drafts
  USING (user_id = current_setting('app.current_user_id', true)::INTEGER)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::INTEGER);
