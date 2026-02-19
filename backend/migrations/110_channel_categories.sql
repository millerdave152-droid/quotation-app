-- Migration 110: Channel categories table for multi-channel onboarding
-- Stores imported category trees from marketplace channels (Mirakl H11, etc.)

CREATE TABLE IF NOT EXISTS channel_categories (
  id            SERIAL PRIMARY KEY,
  channel_id    INTEGER NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  category_code VARCHAR(255) NOT NULL,
  category_label VARCHAR(500) NOT NULL,
  parent_code   VARCHAR(255),
  level         INTEGER DEFAULT 0,
  full_path     TEXT,
  is_leaf       BOOLEAN DEFAULT false,
  raw_data      JSONB DEFAULT '{}',
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),

  UNIQUE(channel_id, category_code)
);

CREATE INDEX IF NOT EXISTS idx_channel_categories_channel ON channel_categories(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_categories_parent ON channel_categories(channel_id, parent_code);
CREATE INDEX IF NOT EXISTS idx_channel_categories_label ON channel_categories USING gin (category_label gin_trgm_ops);
