-- Migration 216: Embedding queue for reliable async vector generation
-- Replaces fire-and-forget embedNewRecord() with a durable queue.

CREATE TABLE IF NOT EXISTS embedding_queue (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_embedding_queue_scheduled
  ON embedding_queue(scheduled_at)
  WHERE attempts < 3;
