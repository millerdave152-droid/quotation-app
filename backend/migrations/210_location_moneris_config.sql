-- Migration 210: Per-location Moneris credentials
-- Supports multi-merchant setup (Brampton, Etobicoke, etc.)
-- Falls back to process.env credentials when no row exists for a location.

CREATE TABLE IF NOT EXISTS location_moneris_config (
  id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  store_id VARCHAR(50) NOT NULL,
  api_token VARCHAR(100) NOT NULL,
  webhook_secret VARCHAR(100) NOT NULL,
  terminal_ids JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(location_id)
);

-- Seed placeholder rows for known locations.
-- IMPORTANT: Replace REPLACE_ME values with actual Moneris credentials before going live.
-- Location IDs: 1=Mississauga, 3=Etobicoke, 4=Springdale, 5=Brampton
INSERT INTO location_moneris_config (location_id, store_id, api_token, webhook_secret, terminal_ids)
VALUES
  (1, 'REPLACE_ME_MISSISSAUGA_STORE_ID', 'REPLACE_ME_MISSISSAUGA_TOKEN', 'REPLACE_ME_MISSISSAUGA_WEBHOOK_SECRET', '[]'),
  (3, 'REPLACE_ME_ETOBICOKE_STORE_ID', 'REPLACE_ME_ETOBICOKE_TOKEN', 'REPLACE_ME_ETOBICOKE_WEBHOOK_SECRET', '[]'),
  (4, 'REPLACE_ME_SPRINGDALE_STORE_ID', 'REPLACE_ME_SPRINGDALE_TOKEN', 'REPLACE_ME_SPRINGDALE_WEBHOOK_SECRET', '[]'),
  (5, 'REPLACE_ME_BRAMPTON_STORE_ID', 'REPLACE_ME_BRAMPTON_TOKEN', 'REPLACE_ME_BRAMPTON_WEBHOOK_SECRET', '[]')
ON CONFLICT (location_id) DO NOTHING;
